// Copyright (c) 2026 BowenLabs. All rights reserved.
// MIT licensed. See LICENSE in the repo root.
//
// Square's REST API directly via fetch() — never the `square` npm SDK
// (Node-targeted, BigInt-typed monetary amounts the raw REST API doesn't
// actually return — its JSON responses use plain numbers; BigInt is purely
// an artifact of the SDK's own typed wrapper). Webhook signature
// verification uses crypto.subtle, mirroring the exact HMAC idiom already
// in @thebes/cadmus/cms's webhooks.ts (compute-and-compare instead of
// sign-and-attach).

import type {
  CatalogPriceCheck,
  CheckoutRequest,
  CheckoutResult,
  PaymentProvider,
} from "@thebes/cadmea-plugin-ecommerce";

export interface SquareProviderConfig {
  accessToken: string;
  /** First entry is used as the primary location for orders/payments; all entries are queried for inventory. */
  locationId: string | string[];
  environment?: "sandbox" | "production";
  /** Square's API version header. Default: a fixed, tested version — bump deliberately, not implicitly. */
  apiVersion?: string;
}

const DEFAULT_API_VERSION = "2025-01-23";

function baseUrl(environment: SquareProviderConfig["environment"]): string {
  return environment === "production"
    ? "https://connect.squareup.com"
    : "https://connect.squareupsandbox.com";
}

function primaryLocation(
  locationId: SquareProviderConfig["locationId"],
): string {
  return Array.isArray(locationId) ? locationId[0] : locationId;
}

function allLocations(
  locationId: SquareProviderConfig["locationId"],
): string[] {
  return Array.isArray(locationId) ? locationId : [locationId];
}

class SquareApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = "SquareApiError";
  }
}

async function squareFetch(
  config: SquareProviderConfig,
  path: string,
  init: { method: string; body?: unknown },
): Promise<Record<string, unknown>> {
  const response = await fetch(`${baseUrl(config.environment)}${path}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      "Content-Type": "application/json",
      "Square-Version": config.apiVersion ?? DEFAULT_API_VERSION,
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const text = await response.text();
  const parsed = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new SquareApiError(
      `Square API request to "${path}" failed with status ${response.status}`,
      response.status,
      parsed,
    );
  }
  return parsed;
}

async function hmacSha256Base64(
  message: string,
  secret: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message),
  );
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

// Constant-time string comparison — a plain `===` on a signature leaks,
// via early-exit timing, how many leading bytes matched, which is enough
// to forge a valid HMAC byte-by-byte. Mirrors the Stripe provider's helper.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

interface SquareCatalogObject {
  id: string;
  type: string;
  item_variation_data?: {
    price_money?: { amount: number; currency: string };
  };
}

interface SquareInventoryCount {
  catalog_object_id: string;
  quantity: string;
}

async function checkCatalogPrices(
  config: SquareProviderConfig,
  refs: string[],
): Promise<CatalogPriceCheck[]> {
  if (refs.length === 0) return [];

  const catalogResponse = await squareFetch(
    config,
    "/v2/catalog/batch-retrieve",
    {
      method: "POST",
      body: { object_ids: refs },
    },
  );
  const objects = (catalogResponse.objects ?? []) as SquareCatalogObject[];
  const priceByRef = new Map(
    objects.map((object) => [
      object.id,
      object.item_variation_data?.price_money,
    ]),
  );

  const inventoryResponse = await squareFetch(
    config,
    "/v2/inventory/batch-retrieve-counts",
    {
      method: "POST",
      body: {
        catalog_object_ids: refs,
        location_ids: allLocations(config.locationId),
      },
    },
  );
  const counts = (inventoryResponse.counts ?? []) as SquareInventoryCount[];
  const quantityByRef = new Map<string, number>();
  for (const count of counts) {
    const existing = quantityByRef.get(count.catalog_object_id) ?? 0;
    quantityByRef.set(
      count.catalog_object_id,
      existing + Number.parseFloat(count.quantity),
    );
  }

  return refs.map((catalogRef) => {
    const price = priceByRef.get(catalogRef);
    return {
      catalogRef,
      serverUnitPrice: {
        amount: price?.amount ?? 0,
        currency: price?.currency ?? "USD",
      },
      availableQuantity: quantityByRef.get(catalogRef),
    };
  });
}

async function findOrCreateCustomer(
  config: SquareProviderConfig,
  email: string,
  idempotencyKey: string,
): Promise<string> {
  const searchResponse = await squareFetch(config, "/v2/customers/search", {
    method: "POST",
    body: { query: { filter: { email_address: { exact: email } } } },
  });
  const existing = (
    searchResponse.customers as Array<{ id: string }> | undefined
  )?.[0];
  if (existing) return existing.id;

  const createResponse = await squareFetch(config, "/v2/customers", {
    method: "POST",
    body: { idempotency_key: idempotencyKey, email_address: email },
  });
  return (createResponse.customer as { id: string }).id;
}

function mapSquarePaymentStatus(
  status: string | undefined,
): CheckoutResult["status"] {
  if (status === "COMPLETED" || status === "APPROVED") return "succeeded";
  if (status === "PENDING") return "requires_action";
  return "failed";
}

async function checkout(
  config: SquareProviderConfig,
  request: CheckoutRequest,
): Promise<CheckoutResult> {
  const orderResponse = await squareFetch(config, "/v2/orders", {
    method: "POST",
    body: {
      idempotency_key: request.idempotencyKey,
      order: {
        location_id: primaryLocation(config.locationId),
        line_items: request.lineItems.map((item) => ({
          catalog_object_id: item.catalogRef,
          quantity: String(item.quantity),
        })),
      },
    },
  });
  const order = orderResponse.order as {
    id: string;
    total_money: { amount: number; currency: string };
  };

  const paymentResponse = await squareFetch(config, "/v2/payments", {
    method: "POST",
    body: {
      idempotency_key: crypto.randomUUID(),
      source_id: request.paymentSourceToken,
      amount_money: order.total_money,
      order_id: order.id,
      location_id: primaryLocation(config.locationId),
    },
  });
  const payment = paymentResponse.payment as {
    id: string;
    status: string;
    amount_money: { amount: number; currency: string };
  };

  return {
    providerOrderRef: order.id,
    providerPaymentRef: payment.id,
    status: mapSquarePaymentStatus(payment.status),
    amount: {
      amount: payment.amount_money.amount,
      currency: payment.amount_money.currency,
    },
    raw: paymentResponse as Record<string, unknown>,
  };
}

async function verifyWebhookSignature(args: {
  rawBody: string;
  headers: Headers;
  secret: string;
  notificationUrl?: string;
}): Promise<boolean> {
  // Square signs `notificationUrl + rawBody` (in that order) with the
  // webhook signature key, base64-encoded, checked against the
  // `x-square-hmacsha256-signature` header — without a notification URL
  // there's nothing correct to verify against, so this fails closed.
  if (!args.notificationUrl) return false;
  const signatureHeader = args.headers.get("x-square-hmacsha256-signature");
  if (!signatureHeader) return false;
  const expected = await hmacSha256Base64(
    args.notificationUrl + args.rawBody,
    args.secret,
  );
  return timingSafeEqual(expected, signatureHeader);
}

interface SquareWebhookPayload {
  event_id: string;
  type: string;
  data: {
    object: Record<string, unknown>;
  };
}

function parseWebhookEvent(rawBody: string) {
  const payload = JSON.parse(rawBody) as SquareWebhookPayload;
  const eventId = payload.event_id;

  if (payload.type === "payment.updated") {
    const payment = payload.data.object.payment as
      | { id: string; status: string }
      | undefined;
    if (payment) {
      return {
        eventId,
        event: {
          kind: "payment.updated" as const,
          providerPaymentRef: payment.id,
          status:
            mapSquarePaymentStatus(payment.status) === "succeeded"
              ? ("succeeded" as const)
              : ("failed" as const),
        },
      };
    }
  }

  if (payload.type === "order.updated") {
    const orderUpdated = payload.data.object.order_updated as
      | { order_id: string; state: string }
      | undefined;
    if (orderUpdated) {
      const status =
        orderUpdated.state === "COMPLETED"
          ? ("paid" as const)
          : orderUpdated.state === "CANCELED"
            ? ("canceled" as const)
            : ("failed" as const);
      return {
        eventId,
        event: {
          kind: "order.updated" as const,
          providerOrderRef: orderUpdated.order_id,
          status,
        },
      };
    }
  }

  if (payload.type === "subscription.updated") {
    const subscription = payload.data.object.subscription as
      | { id: string; status: string }
      | undefined;
    if (subscription) {
      return {
        eventId,
        event: {
          kind: "subscription.updated" as const,
          providerSubscriptionRef: subscription.id,
          status: subscription.status,
        },
      };
    }
  }

  return {
    eventId,
    event: { kind: "unhandled" as const, rawType: payload.type },
  };
}

/**
 * Creates a `PaymentProvider` backed by Square's REST API — raw `fetch()`
 * + `crypto.subtle`, no Square Node SDK. Implements the required
 * `checkCatalogPrices`/`findOrCreateCustomer`/`checkout`/
 * `verifyWebhookSignature`/`parseWebhookEvent`; omits `catalogSync` and
 * `subscriptions` in this first cut (Square's loyalty/recurring-order
 * model doesn't map cleanly onto either optional capability without
 * further design — see the package README for the gap).
 */
export function createSquarePaymentProvider(
  config: SquareProviderConfig,
): PaymentProvider {
  return {
    name: "square",
    checkCatalogPrices: (refs) => checkCatalogPrices(config, refs),
    findOrCreateCustomer: (email, idempotencyKey) =>
      findOrCreateCustomer(config, email, idempotencyKey),
    checkout: (request) => checkout(config, request),
    verifyWebhookSignature,
    parseWebhookEvent,
  };
}
