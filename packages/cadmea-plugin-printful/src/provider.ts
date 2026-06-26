// Copyright (c) 2026 BowenLabs. All rights reserved.
// MIT licensed. See LICENSE in the repo root.
//
// Printful's REST API (v2 for orders, v1 for shipping rates) directly via
// fetch() — never a Node-targeted Printful SDK. Webhook signature
// verification uses crypto.subtle, mirroring
// @thebes/cadmea-plugin-ecommerce-stripe's provider.ts.
//
// Design note on `catalogRef`: `FulfillmentLineItem.catalogRef` is one
// opaque string per the FulfillmentProvider contract, but a Printful order
// item needs two independent ids — a `catalog_variant_id` (which blank
// product/size) and a `file id` (which artwork file gets printed on it).
// The source app modeled this as two linked Payload collections
// (PrintfulProducts + PrintAssets with a manual sync step uploading files to
// Printful ahead of checkout). That collection pair has no Cadmea analog
// yet and is out of scope for this port (see project plan's flagged
// architecture changes). Instead, `catalogRef` here is the two ids joined
// with a colon — `"{catalogVariantId}:{fileId}"` — set directly on each
// `products` variant's `catalogRef` field in the Cadmea admin once a file is
// uploaded to Printful by hand or via Printful's own dashboard. Revisit with
// a real sync collection only once manual catalogRef entry is a measured
// operational problem, not a theoretical one.

import type {
  FulfillmentOrderRequest,
  FulfillmentOrderResult,
  FulfillmentProvider,
  NormalizedFulfillmentWebhookEvent,
} from "@thebes/cadmea-plugin-ecommerce";

export interface PrintfulProviderConfig {
  apiKey: string;
  /**
   * Printful orders are created as drafts by default — call
   * `/confirmation` to submit them for production. Default: false, same
   * "explicit opt-in" reasoning as the source app's
   * `PRINTFUL_CONFIRM_ORDERS` env var — a misconfigured store should fail
   * safe into "drafts piling up for manual review," not "real money spent
   * printing untested orders."
   */
  autoConfirm?: boolean;
}

const BASE_URL = "https://api.printful.com";

class PrintfulApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = "PrintfulApiError";
  }
}

async function printfulFetch(
  config: PrintfulProviderConfig,
  path: string,
  init?: RequestInit,
): Promise<Record<string, unknown>> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  const text = await response.text();
  const parsed = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new PrintfulApiError(
      `Printful API request to "${path}" failed with status ${response.status}`,
      response.status,
      parsed,
    );
  }
  return parsed;
}

/** Splits a `"{catalogVariantId}:{fileId}"` catalogRef — see provider.ts's top-of-file design note. */
function parseCatalogRef(catalogRef: string): {
  catalogVariantId: number;
  fileId: number;
} {
  const [variantPart, filePart] = catalogRef.split(":");
  const catalogVariantId = Number(variantPart);
  const fileId = Number(filePart);
  if (!Number.isFinite(catalogVariantId) || !Number.isFinite(fileId)) {
    throw new Error(
      `Printful catalogRef "${catalogRef}" must be in "{catalogVariantId}:{fileId}" form`,
    );
  }
  return { catalogVariantId, fileId };
}

interface PrintfulOrderItem {
  source: "catalog";
  catalog_variant_id: number;
  quantity: number;
  placements: Array<{
    placement: string;
    technique: string;
    layers: Array<{ type: "file"; id: number }>;
  }>;
}

async function createFulfillmentOrder(
  config: PrintfulProviderConfig,
  request: FulfillmentOrderRequest,
): Promise<FulfillmentOrderResult> {
  const orderItems: PrintfulOrderItem[] = request.lineItems.map((item) => {
    const { catalogVariantId, fileId } = parseCatalogRef(item.catalogRef);
    return {
      source: "catalog",
      catalog_variant_id: catalogVariantId,
      quantity: item.quantity,
      placements: [
        {
          placement: "default",
          technique: "digital",
          layers: [{ type: "file", id: fileId }],
        },
      ],
    };
  });

  if (!orderItems.length) {
    throw new Error(
      `Fulfillment order for orderId ${request.orderId} has no valid line items`,
    );
  }

  const address = request.shippingAddress;
  const response = await printfulFetch(config, "/orders", {
    method: "POST",
    body: JSON.stringify({
      external_id: `cadmea-order-${request.orderId}`,
      recipient: {
        name: [address.firstName, address.lastName].filter(Boolean).join(" "),
        address1: address.address1 ?? "",
        address2: address.address2,
        city: address.city ?? "",
        state_code: address.state ?? "",
        country_code: address.country ?? "US",
        zip: address.zip ?? "",
        phone: address.phone,
        email: request.customerEmail,
      },
      order_items: orderItems,
    }),
  });

  const order = response.data as { id: number; status: string };

  if (config.autoConfirm) {
    // A confirmation failure is logged, never thrown — the draft order
    // already exists at Printful and is visible for manual confirmation;
    // surfacing this as a fulfillment-creation failure would cause the
    // order-paid hook's caller to retry order creation and risk a
    // duplicate Printful order for the same Cadmea order.
    await printfulFetch(config, `/orders/${order.id}/confirmation`, {
      method: "POST",
    }).catch((error) => {
      console.error(
        `[cadmea-plugin-printful] order ${order.id} confirmation failed — manual confirmation required`,
        error,
      );
    });
  }

  return {
    providerFulfillmentRef: String(order.id),
    status: "pending",
  };
}

async function hmacSha256Hex(message: string, keyHex: string): Promise<string> {
  const keyBytes = new Uint8Array(
    keyHex.match(/.{1,2}/g)?.map((byte) => Number.parseInt(byte, 16)) ?? [],
  );
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message),
  );
  return Array.from(new Uint8Array(signature), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * Verifies Printful's webhook signature: `x-pf-webhook-signature` is a hex
 * HMAC-SHA256 of the raw body, keyed by the webhook config's secret (itself
 * a hex string, decoded to bytes before use — Printful's own documented
 * format, ported from the source app's Node `crypto.createHmac` version).
 */
async function verifyWebhookSignature({
  rawBody,
  headers,
  secret,
}: {
  rawBody: string;
  headers: Headers;
  secret: string;
}): Promise<boolean> {
  const signature = headers.get("x-pf-webhook-signature");
  if (!signature) return false;
  const expected = await hmacSha256Hex(rawBody, secret);
  return timingSafeEqual(expected, signature);
}

interface ShipmentSentPayload {
  type: string;
  data: {
    order: { id: number };
    shipment?: {
      tracking_number: string;
      tracking_url: string;
      service: string;
    };
  };
}

function parseWebhookEvent(rawBody: string): {
  eventId: string;
  event: NormalizedFulfillmentWebhookEvent;
} {
  const payload = JSON.parse(rawBody) as ShipmentSentPayload;
  // Printful doesn't include a stable webhook event id in its payload (no
  // `id` field, unlike Stripe) — the order id + type pair is unique enough
  // for this plugin's dedup purposes, since a real duplicate delivery
  // re-sends the exact same order/type combination.
  const eventId = `${payload.data.order.id}:${payload.type}`;

  if (payload.type === "shipment_sent" && payload.data.shipment) {
    return {
      eventId,
      event: {
        kind: "fulfillment.updated",
        providerFulfillmentRef: String(payload.data.order.id),
        status: "shipped",
        trackingNumber: payload.data.shipment.tracking_number,
        trackingCarrier: payload.data.shipment.service,
        trackingUrl: payload.data.shipment.tracking_url,
      },
    };
  }

  return { eventId, event: { kind: "unhandled", rawType: payload.type } };
}

/**
 * Creates a `FulfillmentProvider` backed by Printful's REST API — raw
 * `fetch()` + `crypto.subtle`, no Printful Node SDK. Implements
 * `createFulfillmentOrder`/`verifyWebhookSignature`/`parseWebhookEvent`,
 * the full `FulfillmentProvider` surface (no optional capabilities are
 * defined on that interface yet).
 */
export function createPrintfulProvider(
  config: PrintfulProviderConfig,
): FulfillmentProvider {
  return {
    name: "printful",
    createFulfillmentOrder: (request) =>
      createFulfillmentOrder(config, request),
    verifyWebhookSignature,
    parseWebhookEvent,
  };
}
