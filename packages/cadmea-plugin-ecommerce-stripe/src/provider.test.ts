// Copyright (c) 2026 BowenLabs. All rights reserved.
// MIT licensed. See LICENSE in the repo root.

import { afterEach, describe, expect, it, vi } from "vitest";
import { createStripePaymentProvider } from "./provider.js";

const config = { secretKey: "sk_test_123" };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function formBody(init: RequestInit): URLSearchParams {
  return new URLSearchParams(init.body as string);
}

describe("createStripePaymentProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("checkCatalogPrices", () => {
    it("reads unit_amount/currency from Stripe's Price object, with no inventory concept", async () => {
      vi.stubGlobal("fetch", async (url: URL) => {
        expect(url.toString()).toContain("/v1/prices/price_1");
        return jsonResponse({ unit_amount: 500, currency: "usd" });
      });
      const provider = createStripePaymentProvider(config);
      const result = await provider.checkCatalogPrices(["price_1"]);
      expect(result).toEqual([
        {
          catalogRef: "price_1",
          serverUnitPrice: { amount: 500, currency: "USD" },
          availableQuantity: undefined,
        },
      ]);
    });
  });

  describe("findOrCreateCustomer", () => {
    it("returns the existing customer id when a list-by-email match is found", async () => {
      vi.stubGlobal("fetch", async (url: URL) => {
        expect(url.toString()).toContain("email=a%40example.com");
        return jsonResponse({ data: [{ id: "cus_existing" }] });
      });
      const provider = createStripePaymentProvider(config);
      const id = await provider.findOrCreateCustomer("a@example.com", "idem-1");
      expect(id).toBe("cus_existing");
    });

    it("creates a new customer with the idempotency key as a header, not a body field", async () => {
      let seenIdempotencyHeader: string | null = null;
      let seenBody: URLSearchParams | undefined;
      vi.stubGlobal("fetch", async (_url: URL, init: RequestInit) => {
        if (init.method === "GET") return jsonResponse({ data: [] });
        seenIdempotencyHeader = (init.headers as Record<string, string>)[
          "Idempotency-Key"
        ];
        seenBody = formBody(init);
        return jsonResponse({ id: "cus_new" });
      });
      const provider = createStripePaymentProvider(config);
      const id = await provider.findOrCreateCustomer("b@example.com", "idem-2");
      expect(id).toBe("cus_new");
      expect(seenIdempotencyHeader).toBe("idem-2");
      expect(seenBody?.get("email")).toBe("b@example.com");
      // The idempotency key must never leak into the form body — that's
      // the whole point of the header-vs-body distinction from Square.
      expect(seenBody?.has("idempotency_key")).toBe(false);
    });
  });

  describe("checkout", () => {
    it("creates a single confirmed PaymentIntent and uses its id for both order and payment refs", async () => {
      let seenBody: URLSearchParams | undefined;
      let seenIdempotencyHeader: string | null = null;
      vi.stubGlobal("fetch", async (_url: URL, init: RequestInit) => {
        seenBody = formBody(init);
        seenIdempotencyHeader = (init.headers as Record<string, string>)[
          "Idempotency-Key"
        ];
        return jsonResponse({
          id: "pi_abc",
          status: "succeeded",
          amount: 1000,
          currency: "usd",
        });
      });

      const provider = createStripePaymentProvider(config);
      const result = await provider.checkout({
        lineItems: [
          {
            catalogRef: "price_1",
            quantity: 2,
            clientUnitPrice: { amount: 500, currency: "USD" },
          },
        ],
        paymentSourceToken: "pm_abc",
        idempotencyKey: "idem-3",
      });

      expect(result).toEqual({
        providerOrderRef: "pi_abc",
        providerPaymentRef: "pi_abc",
        status: "succeeded",
        amount: { amount: 1000, currency: "USD" },
        raw: {
          id: "pi_abc",
          status: "succeeded",
          amount: 1000,
          currency: "usd",
        },
      });
      expect(seenBody?.get("amount")).toBe("1000");
      expect(seenBody?.get("currency")).toBe("usd");
      expect(seenBody?.get("payment_method")).toBe("pm_abc");
      expect(seenBody?.get("confirm")).toBe("true");
      expect(seenIdempotencyHeader).toBe("idem-3");
    });

    it("maps a requires_action PaymentIntent status to the normalized status", async () => {
      vi.stubGlobal("fetch", async () =>
        jsonResponse({
          id: "pi_x",
          status: "requires_action",
          amount: 100,
          currency: "usd",
        }),
      );
      const provider = createStripePaymentProvider(config);
      const result = await provider.checkout({
        lineItems: [
          {
            catalogRef: "price_1",
            quantity: 1,
            clientUnitPrice: { amount: 100, currency: "USD" },
          },
        ],
        paymentSourceToken: "pm_x",
        idempotencyKey: "idem-4",
      });
      expect(result.status).toBe("requires_action");
    });
  });

  describe("verifyWebhookSignature", () => {
    async function sign(timestamp: number, rawBody: string, secret: string) {
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
        new TextEncoder().encode(`${timestamp}.${rawBody}`),
      );
      return Array.from(new Uint8Array(sig), (b) =>
        b.toString(16).padStart(2, "0"),
      ).join("");
    }

    it("verifies a correctly-signed, fresh payload", async () => {
      const provider = createStripePaymentProvider(config);
      const rawBody = '{"id":"evt_1"}';
      const secret = "whsec_test";
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = await sign(timestamp, rawBody, secret);

      const verified = await provider.verifyWebhookSignature({
        rawBody,
        headers: new Headers({
          "stripe-signature": `t=${timestamp},v1=${signature}`,
        }),
        secret,
      });
      expect(verified).toBe(true);
    });

    it("rejects a tampered signature", async () => {
      const provider = createStripePaymentProvider(config);
      const timestamp = Math.floor(Date.now() / 1000);
      const verified = await provider.verifyWebhookSignature({
        rawBody: '{"id":"evt_1"}',
        headers: new Headers({
          "stripe-signature": `t=${timestamp},v1=not-the-right-signature`,
        }),
        secret: "whsec_test",
      });
      expect(verified).toBe(false);
    });

    it("rejects a stale timestamp outside the tolerance window", async () => {
      const provider = createStripePaymentProvider({
        ...config,
        webhookToleranceSeconds: 300,
      });
      const rawBody = '{"id":"evt_1"}';
      const secret = "whsec_test";
      const staleTimestamp = Math.floor(Date.now() / 1000) - 3600;
      const signature = await sign(staleTimestamp, rawBody, secret);

      const verified = await provider.verifyWebhookSignature({
        rawBody,
        headers: new Headers({
          "stripe-signature": `t=${staleTimestamp},v1=${signature}`,
        }),
        secret,
      });
      expect(verified).toBe(false);
    });

    it("fails closed when the stripe-signature header is missing", async () => {
      const provider = createStripePaymentProvider(config);
      const verified = await provider.verifyWebhookSignature({
        rawBody: "{}",
        headers: new Headers(),
        secret: "whsec_test",
      });
      expect(verified).toBe(false);
    });
  });

  describe("parseWebhookEvent", () => {
    it("normalizes payment_intent.succeeded", () => {
      const provider = createStripePaymentProvider(config);
      const { eventId, event } = provider.parseWebhookEvent(
        JSON.stringify({
          id: "evt_1",
          type: "payment_intent.succeeded",
          data: { object: { id: "pi_1" } },
        }),
      );
      expect(eventId).toBe("evt_1");
      expect(event).toEqual({
        kind: "payment.updated",
        providerPaymentRef: "pi_1",
        status: "succeeded",
      });
    });

    it("normalizes payment_intent.payment_failed", () => {
      const provider = createStripePaymentProvider(config);
      const { event } = provider.parseWebhookEvent(
        JSON.stringify({
          id: "evt_2",
          type: "payment_intent.payment_failed",
          data: { object: { id: "pi_2" } },
        }),
      );
      expect(event).toEqual({
        kind: "payment.updated",
        providerPaymentRef: "pi_2",
        status: "failed",
      });
    });

    it("normalizes charge.refunded using the charge's payment_intent field", () => {
      const provider = createStripePaymentProvider(config);
      const { event } = provider.parseWebhookEvent(
        JSON.stringify({
          id: "evt_3",
          type: "charge.refunded",
          data: { object: { id: "ch_1", payment_intent: "pi_3" } },
        }),
      );
      expect(event).toEqual({
        kind: "payment.updated",
        providerPaymentRef: "pi_3",
        status: "refunded",
      });
    });

    it("normalizes customer.subscription.updated", () => {
      const provider = createStripePaymentProvider(config);
      const { event } = provider.parseWebhookEvent(
        JSON.stringify({
          id: "evt_4",
          type: "customer.subscription.updated",
          data: { object: { id: "sub_1", status: "active" } },
        }),
      );
      expect(event).toEqual({
        kind: "subscription.updated",
        providerSubscriptionRef: "sub_1",
        status: "active",
      });
    });

    it("returns an unhandled event for an unrecognized type", () => {
      const provider = createStripePaymentProvider(config);
      const { event } = provider.parseWebhookEvent(
        JSON.stringify({
          id: "evt_5",
          type: "invoice.paid",
          data: { object: {} },
        }),
      );
      expect(event).toEqual({ kind: "unhandled", rawType: "invoice.paid" });
    });
  });

  describe("subscriptions", () => {
    it("creates a subscription with items[0][price] form-encoded correctly", async () => {
      let seenBody: URLSearchParams | undefined;
      vi.stubGlobal("fetch", async (_url: URL, init: RequestInit) => {
        seenBody = formBody(init);
        return jsonResponse({ id: "sub_new", status: "active" });
      });
      const provider = createStripePaymentProvider(config);
      const result = await provider.subscriptions?.create({
        customerRef: "cus_1",
        planRef: "price_plan_1",
        idempotencyKey: "idem-5",
      });
      expect(result).toEqual({
        providerSubscriptionRef: "sub_new",
        status: "active",
      });
      expect(seenBody?.get("customer")).toBe("cus_1");
      expect(seenBody?.get("items[0][price]")).toBe("price_plan_1");
    });

    it("cancels a subscription via DELETE", async () => {
      let seenMethod: string | undefined;
      let seenUrl: string | undefined;
      vi.stubGlobal("fetch", async (url: URL, init: RequestInit) => {
        seenMethod = init.method;
        seenUrl = url.toString();
        return jsonResponse({ id: "sub_1", status: "canceled" });
      });
      const provider = createStripePaymentProvider(config);
      await provider.subscriptions?.cancel("sub_1");
      expect(seenMethod).toBe("DELETE");
      expect(seenUrl).toContain("/v1/subscriptions/sub_1");
    });
  });
});
