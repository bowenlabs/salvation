// Copyright (c) 2026 BowenLabs. All rights reserved.
// MIT licensed. See LICENSE in the repo root.

import { afterEach, describe, expect, it, vi } from "vitest";
import { createSquarePaymentProvider } from "./provider.js";

const config = {
  accessToken: "test-token",
  locationId: "LOC1",
  environment: "sandbox" as const,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("createSquarePaymentProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("checkCatalogPrices", () => {
    it("returns price and inventory for each ref, hitting Square's REST API directly", async () => {
      const calls: Array<{ url: string; body: unknown }> = [];
      vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
        calls.push({ url, body: JSON.parse(init.body as string) });
        if (url.includes("/v2/catalog/batch-retrieve")) {
          return jsonResponse({
            objects: [
              {
                id: "sku-1",
                type: "ITEM_VARIATION",
                item_variation_data: {
                  price_money: { amount: 500, currency: "USD" },
                },
              },
            ],
          });
        }
        if (url.includes("/v2/inventory/batch-retrieve-counts")) {
          return jsonResponse({
            counts: [{ catalog_object_id: "sku-1", quantity: "7" }],
          });
        }
        throw new Error(`unexpected fetch to ${url}`);
      });

      const provider = createSquarePaymentProvider(config);
      const result = await provider.checkCatalogPrices(["sku-1"]);

      expect(result).toEqual([
        {
          catalogRef: "sku-1",
          serverUnitPrice: { amount: 500, currency: "USD" },
          availableQuantity: 7,
        },
      ]);
      expect(calls[0]?.url).toContain("connect.squareupsandbox.com");
    });

    it("returns an empty array without making a request for an empty refs list", async () => {
      const fetchSpy = vi.fn();
      vi.stubGlobal("fetch", fetchSpy);
      const provider = createSquarePaymentProvider(config);
      expect(await provider.checkCatalogPrices([])).toEqual([]);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("uses the production base URL when environment is production", async () => {
      let seenUrl = "";
      vi.stubGlobal("fetch", async (url: string) => {
        seenUrl = url;
        return jsonResponse({ objects: [] });
      });
      const provider = createSquarePaymentProvider({
        ...config,
        environment: "production",
      });
      await provider.checkCatalogPrices(["sku-1"]);
      expect(seenUrl).toContain("connect.squareup.com");
      expect(seenUrl).not.toContain("sandbox");
    });
  });

  describe("findOrCreateCustomer", () => {
    it("returns the existing customer id when search finds a match", async () => {
      vi.stubGlobal("fetch", async (url: string) => {
        if (url.includes("/v2/customers/search")) {
          return jsonResponse({ customers: [{ id: "cust-existing" }] });
        }
        throw new Error("should not call create");
      });
      const provider = createSquarePaymentProvider(config);
      const id = await provider.findOrCreateCustomer("a@example.com", "idem-1");
      expect(id).toBe("cust-existing");
    });

    it("creates a new customer when no match is found", async () => {
      vi.stubGlobal("fetch", async (url: string) => {
        if (url.includes("/v2/customers/search")) {
          return jsonResponse({ customers: [] });
        }
        if (url.includes("/v2/customers")) {
          return jsonResponse({ customer: { id: "cust-new" } });
        }
        throw new Error(`unexpected fetch to ${url}`);
      });
      const provider = createSquarePaymentProvider(config);
      const id = await provider.findOrCreateCustomer("b@example.com", "idem-2");
      expect(id).toBe("cust-new");
    });
  });

  describe("checkout", () => {
    it("creates an order then a payment, returning a normalized CheckoutResult", async () => {
      const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
      vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string);
        calls.push({ url, body });
        if (url.includes("/v2/orders")) {
          return jsonResponse({
            order: {
              id: "order_abc",
              total_money: { amount: 1000, currency: "USD" },
            },
          });
        }
        if (url.includes("/v2/payments")) {
          return jsonResponse({
            payment: {
              id: "pay_abc",
              status: "COMPLETED",
              amount_money: { amount: 1000, currency: "USD" },
            },
          });
        }
        throw new Error(`unexpected fetch to ${url}`);
      });

      const provider = createSquarePaymentProvider(config);
      const result = await provider.checkout({
        lineItems: [
          {
            catalogRef: "sku-1",
            quantity: 2,
            clientUnitPrice: { amount: 500, currency: "USD" },
          },
        ],
        paymentSourceToken: "tok_abc",
        idempotencyKey: "idem-3",
      });

      expect(result).toEqual({
        providerOrderRef: "order_abc",
        providerPaymentRef: "pay_abc",
        status: "succeeded",
        amount: { amount: 1000, currency: "USD" },
        raw: {
          payment: {
            id: "pay_abc",
            status: "COMPLETED",
            amount_money: { amount: 1000, currency: "USD" },
          },
        },
      });
      // The order call carries the caller's idempotencyKey through verbatim.
      expect(calls[0]?.body.idempotency_key).toBe("idem-3");
    });

    it("maps a FAILED payment status to the normalized 'failed' status", async () => {
      vi.stubGlobal("fetch", async (url: string) => {
        if (url.includes("/v2/orders")) {
          return jsonResponse({
            order: {
              id: "order_x",
              total_money: { amount: 100, currency: "USD" },
            },
          });
        }
        return jsonResponse({
          payment: {
            id: "pay_x",
            status: "FAILED",
            amount_money: { amount: 100, currency: "USD" },
          },
        });
      });
      const provider = createSquarePaymentProvider(config);
      const result = await provider.checkout({
        lineItems: [
          {
            catalogRef: "sku-1",
            quantity: 1,
            clientUnitPrice: { amount: 100, currency: "USD" },
          },
        ],
        paymentSourceToken: "tok_x",
        idempotencyKey: "idem-4",
      });
      expect(result.status).toBe("failed");
    });
  });

  describe("verifyWebhookSignature", () => {
    it("verifies a correctly-signed payload", async () => {
      const provider = createSquarePaymentProvider(config);
      const rawBody = '{"event_id":"evt_1"}';
      const notificationUrl = "https://example.com/api/square/webhook";
      const secret = "whsec_test";

      // Compute the expected signature the same way Square does, to
      // produce a fixture without hardcoding a magic base64 string.
      const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
      const sig = await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(notificationUrl + rawBody),
      );
      const expectedSignature = btoa(
        String.fromCharCode(...new Uint8Array(sig)),
      );

      const headers = new Headers({
        "x-square-hmacsha256-signature": expectedSignature,
      });

      const verified = await provider.verifyWebhookSignature({
        rawBody,
        headers,
        secret,
        notificationUrl,
      });
      expect(verified).toBe(true);
    });

    it("rejects a payload with a tampered signature", async () => {
      const provider = createSquarePaymentProvider(config);
      const headers = new Headers({
        "x-square-hmacsha256-signature": "not-the-right-signature",
      });
      const verified = await provider.verifyWebhookSignature({
        rawBody: '{"event_id":"evt_1"}',
        headers,
        secret: "whsec_test",
        notificationUrl: "https://example.com/api/square/webhook",
      });
      expect(verified).toBe(false);
    });

    it("fails closed when no notificationUrl is provided", async () => {
      const provider = createSquarePaymentProvider(config);
      const headers = new Headers({
        "x-square-hmacsha256-signature": "anything",
      });
      const verified = await provider.verifyWebhookSignature({
        rawBody: "{}",
        headers,
        secret: "whsec_test",
      });
      expect(verified).toBe(false);
    });

    it("fails closed when the signature header is missing", async () => {
      const provider = createSquarePaymentProvider(config);
      const verified = await provider.verifyWebhookSignature({
        rawBody: "{}",
        headers: new Headers(),
        secret: "whsec_test",
        notificationUrl: "https://example.com/api/square/webhook",
      });
      expect(verified).toBe(false);
    });
  });

  describe("parseWebhookEvent", () => {
    it("normalizes a payment.updated event", () => {
      const provider = createSquarePaymentProvider(config);
      const { eventId, event } = provider.parseWebhookEvent(
        JSON.stringify({
          event_id: "evt_1",
          type: "payment.updated",
          data: { object: { payment: { id: "pay_1", status: "COMPLETED" } } },
        }),
      );
      expect(eventId).toBe("evt_1");
      expect(event).toEqual({
        kind: "payment.updated",
        providerPaymentRef: "pay_1",
        status: "succeeded",
      });
    });

    it("normalizes an order.updated event", () => {
      const provider = createSquarePaymentProvider(config);
      const { event } = provider.parseWebhookEvent(
        JSON.stringify({
          event_id: "evt_2",
          type: "order.updated",
          data: {
            object: {
              order_updated: { order_id: "order_1", state: "COMPLETED" },
            },
          },
        }),
      );
      expect(event).toEqual({
        kind: "order.updated",
        providerOrderRef: "order_1",
        status: "paid",
      });
    });

    it("normalizes a subscription.updated event", () => {
      const provider = createSquarePaymentProvider(config);
      const { event } = provider.parseWebhookEvent(
        JSON.stringify({
          event_id: "evt_3",
          type: "subscription.updated",
          data: { object: { subscription: { id: "sub_1", status: "ACTIVE" } } },
        }),
      );
      expect(event).toEqual({
        kind: "subscription.updated",
        providerSubscriptionRef: "sub_1",
        status: "ACTIVE",
      });
    });

    it("returns an unhandled event for an unrecognized type", () => {
      const provider = createSquarePaymentProvider(config);
      const { event } = provider.parseWebhookEvent(
        JSON.stringify({
          event_id: "evt_4",
          type: "refund.updated",
          data: { object: {} },
        }),
      );
      expect(event).toEqual({ kind: "unhandled", rawType: "refund.updated" });
    });
  });
});
