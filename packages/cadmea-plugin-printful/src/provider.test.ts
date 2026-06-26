// Copyright (c) 2026 BowenLabs. All rights reserved.
// MIT licensed. See LICENSE in the repo root.

import { afterEach, describe, expect, it, vi } from "vitest";
import { createPrintfulProvider } from "./provider.js";

const config = { apiKey: "pf_test_123" };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("createPrintfulProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("createFulfillmentOrder", () => {
    it("splits catalogRef into catalog_variant_id/fileId and posts to /orders", async () => {
      let seenBody: Record<string, unknown> | undefined;
      vi.stubGlobal("fetch", async (url: URL, init: RequestInit) => {
        expect(url.toString()).toContain("/orders");
        seenBody = JSON.parse(init.body as string);
        return jsonResponse({ data: { id: 555, status: "draft" } });
      });

      const provider = createPrintfulProvider(config);
      const result = await provider.createFulfillmentOrder({
        orderId: 42,
        lineItems: [{ catalogRef: "1001:2002", quantity: 2 }],
        shippingAddress: {
          firstName: "Ada",
          lastName: "Lovelace",
          address1: "1 Analytical Engine Way",
          city: "London",
          state: "LDN",
          zip: "SW1A 1AA",
          country: "GB",
        },
        customerEmail: "ada@example.com",
      });

      expect(result).toEqual({
        providerFulfillmentRef: "555",
        status: "pending",
      });
      expect(seenBody?.external_id).toBe("cadmea-order-42");
      expect(
        (seenBody?.order_items as Array<Record<string, unknown>>)[0],
      ).toMatchObject({
        catalog_variant_id: 1001,
        quantity: 2,
        placements: [
          {
            placement: "default",
            technique: "digital",
            layers: [{ type: "file", id: 2002 }],
          },
        ],
      });
      expect((seenBody?.recipient as Record<string, unknown>).name).toBe(
        "Ada Lovelace",
      );
    });

    it("does not call the confirmation endpoint when autoConfirm is false", async () => {
      const calledPaths: string[] = [];
      vi.stubGlobal("fetch", async (url: URL) => {
        calledPaths.push(url.toString());
        return jsonResponse({ data: { id: 1, status: "draft" } });
      });

      const provider = createPrintfulProvider(config);
      await provider.createFulfillmentOrder({
        orderId: 1,
        lineItems: [{ catalogRef: "1:2", quantity: 1 }],
        shippingAddress: {},
      });

      expect(calledPaths.some((p) => p.includes("/confirmation"))).toBe(false);
    });

    it("calls the confirmation endpoint when autoConfirm is true", async () => {
      const calledPaths: string[] = [];
      vi.stubGlobal("fetch", async (url: URL) => {
        calledPaths.push(url.toString());
        return jsonResponse({ data: { id: 7, status: "draft" } });
      });

      const provider = createPrintfulProvider({ ...config, autoConfirm: true });
      await provider.createFulfillmentOrder({
        orderId: 1,
        lineItems: [{ catalogRef: "1:2", quantity: 1 }],
        shippingAddress: {},
      });

      expect(
        calledPaths.some((p) => p.includes("/orders/7/confirmation")),
      ).toBe(true);
    });

    it("throws on a malformed catalogRef rather than silently skipping it", async () => {
      const provider = createPrintfulProvider(config);
      await expect(
        provider.createFulfillmentOrder({
          orderId: 1,
          lineItems: [{ catalogRef: "not-a-ref", quantity: 1 }],
          shippingAddress: {},
        }),
      ).rejects.toThrow(/catalogRef/);
    });
  });

  describe("verifyWebhookSignature", () => {
    async function sign(rawBody: string, secretHex: string): Promise<string> {
      const keyBytes = new Uint8Array(
        secretHex.match(/.{1,2}/g)?.map((b) => Number.parseInt(b, 16)) ?? [],
      );
      const key = await crypto.subtle.importKey(
        "raw",
        keyBytes,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
      const sig = await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(rawBody),
      );
      return Array.from(new Uint8Array(sig), (b) =>
        b.toString(16).padStart(2, "0"),
      ).join("");
    }

    it("verifies a correctly-signed payload using the hex-decoded secret as the HMAC key", async () => {
      const provider = createPrintfulProvider(config);
      const rawBody = '{"type":"shipment_sent"}';
      const secret = "deadbeef";
      const signature = await sign(rawBody, secret);

      const verified = await provider.verifyWebhookSignature({
        rawBody,
        headers: new Headers({ "x-pf-webhook-signature": signature }),
        secret,
      });
      expect(verified).toBe(true);
    });

    it("rejects a tampered signature", async () => {
      const provider = createPrintfulProvider(config);
      const verified = await provider.verifyWebhookSignature({
        rawBody: '{"type":"shipment_sent"}',
        headers: new Headers({ "x-pf-webhook-signature": "not-the-sig" }),
        secret: "deadbeef",
      });
      expect(verified).toBe(false);
    });

    it("fails closed when the signature header is missing", async () => {
      const provider = createPrintfulProvider(config);
      const verified = await provider.verifyWebhookSignature({
        rawBody: "{}",
        headers: new Headers(),
        secret: "deadbeef",
      });
      expect(verified).toBe(false);
    });
  });

  describe("parseWebhookEvent", () => {
    it("normalizes shipment_sent into a fulfillment.updated/shipped event", () => {
      const provider = createPrintfulProvider(config);
      const { eventId, event } = provider.parseWebhookEvent(
        JSON.stringify({
          type: "shipment_sent",
          data: {
            order: { id: 555 },
            shipment: {
              tracking_number: "1Z999",
              tracking_url: "https://track.example/1Z999",
              service: "UPS Ground",
            },
          },
        }),
      );
      expect(eventId).toBe("555:shipment_sent");
      expect(event).toEqual({
        kind: "fulfillment.updated",
        providerFulfillmentRef: "555",
        status: "shipped",
        trackingNumber: "1Z999",
        trackingCarrier: "UPS Ground",
        trackingUrl: "https://track.example/1Z999",
      });
    });

    it("returns an unhandled event for an unrecognized type", () => {
      const provider = createPrintfulProvider(config);
      const { event } = provider.parseWebhookEvent(
        JSON.stringify({
          type: "package_returned",
          data: { order: { id: 1 } },
        }),
      );
      expect(event).toEqual({ kind: "unhandled", rawType: "package_returned" });
    });
  });
});
