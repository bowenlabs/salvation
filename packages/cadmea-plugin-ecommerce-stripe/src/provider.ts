// Copyright (c) 2026 BowenLabs. All rights reserved.
// MIT licensed. See LICENSE in the repo root.
//
// Stripe's REST API directly via fetch() — never the `stripe` npm SDK
// (Node-targeted; relies on node:crypto/node:http internally for some
// operations). Webhook signature verification uses crypto.subtle.
//
// Real interface friction vs. the Square provider (PaymentProvider was
// pressure-tested against this on purpose, per the build plan — these
// aren't bugs, they're the asymmetry the interface has to absorb):
//   1. Stripe's API takes `application/x-www-form-urlencoded` bodies, not
//      JSON — see `toFormBody` below.
//   2. Stripe's idempotency key is an `Idempotency-Key` HTTP header, not a
//      body field the way Square's `idempotency_key` is.
//   3. Stripe has no object analogous to Square's separate Order — a
//      `PaymentIntent` is both "the order" and "the payment" in one. This
//      provider sets `providerOrderRef` and `providerPaymentRef` to the
//      same PaymentIntent id rather than inventing a fake second id.
//   4. Stripe has no native inventory/catalog concept matching Square's
//      Catalog+Inventory APIs — `checkCatalogPrices` reads `Price` objects
//      (`unit_amount`/`currency`) and always returns `availableQuantity:
//      undefined` (Stripe doesn't track it, so there's nothing honest to
//      report).
//   5. Stripe's native Subscriptions API is a better fit for the optional
//      `subscriptions` capability than Square's loyalty/recurring-order
//      model — implemented here, omitted in the Square provider.

import type {
  CatalogPriceCheck,
  CheckoutRequest,
  CheckoutResult,
  PaymentProvider,
} from "@thebes/cadmea-plugin-ecommerce";

export interface StripeProviderConfig {
  secretKey: string;
  /** Stripe's pinned API version header (`Stripe-Version`). Default: a fixed, tested version — bump deliberately, not implicitly. */
  apiVersion?: string;
  /** Seconds of clock skew tolerated on a webhook's `t=` timestamp before it's rejected as stale. Default: 300 (Stripe's own recommended tolerance). */
  webhookToleranceSeconds?: number;
}

const DEFAULT_API_VERSION = "2024-12-18.acacia";
const DEFAULT_WEBHOOK_TOLERANCE_SECONDS = 300;
const BASE_URL = "https://api.stripe.com";

class StripeApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = "StripeApiError";
  }
}

// Stripe's form-encoding for nested objects uses bracket notation
// (`items[0][price]=...`) — this plugin's own usage is shallow enough
// that a small recursive flattener covers it without needing a general
// qs-style library dependency.
function toFormBody(
  params: Record<string, unknown>,
  prefix?: string,
): URLSearchParams {
  const body = new URLSearchParams();
  const append = (key: string, value: unknown) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        for (const [k, v] of toFormBody(
          { [String(index)]: item },
          key,
        ).entries()) {
          body.append(k, v);
        }
      });
      return;
    }
    if (typeof value === "object") {
      for (const [k, v] of toFormBody(
        value as Record<string, unknown>,
        key,
      ).entries()) {
        body.append(k, v);
      }
      return;
    }
    body.append(key, String(value));
  };
  for (const [key, value] of Object.entries(params)) {
    append(prefix ? `${prefix}[${key}]` : key, value);
  }
  return body;
}

async function stripeFetch(
  config: StripeProviderConfig,
  path: string,
  init: {
    method: string;
    body?: Record<string, unknown>;
    idempotencyKey?: string;
    query?: Record<string, string>;
  },
): Promise<Record<string, unknown>> {
  const url = new URL(`${BASE_URL}${path}`);
  if (init.query) {
    for (const [key, value] of Object.entries(init.query)) {
      url.searchParams.set(key, value);
    }
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.secretKey}`,
    "Stripe-Version": config.apiVersion ?? DEFAULT_API_VERSION,
  };
  if (init.idempotencyKey) headers["Idempotency-Key"] = init.idempotencyKey;
  if (init.body) headers["Content-Type"] = "application/x-www-form-urlencoded";

  const response = await fetch(url, {
    method: init.method,
    headers,
    body: init.body ? toFormBody(init.body) : undefined,
  });
  const text = await response.text();
  const parsed = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new StripeApiError(
      `Stripe API request to "${path}" failed with status ${response.status}`,
      response.status,
      parsed,
    );
  }
  return parsed;
}

async function checkCatalogPrices(
  config: StripeProviderConfig,
  refs: string[],
): Promise<CatalogPriceCheck[]> {
  return Promise.all(
    refs.map(async (catalogRef) => {
      const price = await stripeFetch(config, `/v1/prices/${catalogRef}`, {
        method: "GET",
      });
      return {
        catalogRef,
        serverUnitPrice: {
          amount: (price.unit_amount as number) ?? 0,
          currency: ((price.currency as string) ?? "usd").toUpperCase(),
        },
        // Stripe has no native inventory concept — nothing honest to report.
        availableQuantity: undefined,
      };
    }),
  );
}

async function findOrCreateCustomer(
  config: StripeProviderConfig,
  email: string,
  idempotencyKey: string,
): Promise<string> {
  const list = await stripeFetch(config, "/v1/customers", {
    method: "GET",
    query: { email, limit: "1" },
  });
  const existing = (list.data as Array<{ id: string }> | undefined)?.[0];
  if (existing) return existing.id;

  const created = await stripeFetch(config, "/v1/customers", {
    method: "POST",
    body: { email },
    // Stripe scopes idempotency keys per endpoint and rejects reusing one
    // across endpoints — the checkout flow passes the same logical key to
    // both find-or-create-customer and the payment intent, so namespace it.
    idempotencyKey: `${idempotencyKey}:customer`,
  });
  return created.id as string;
}

function mapStripePaymentIntentStatus(
  status: string | undefined,
): CheckoutResult["status"] {
  if (status === "succeeded") return "succeeded";
  if (status === "requires_action" || status === "requires_confirmation") {
    return "requires_action";
  }
  return "failed";
}

async function checkout(
  config: StripeProviderConfig,
  request: CheckoutRequest,
): Promise<CheckoutResult> {
  const amount = request.lineItems.reduce(
    (sum, item) => sum + item.clientUnitPrice.amount * item.quantity,
    0,
  );
  const currency = (
    request.lineItems[0]?.clientUnitPrice.currency ?? "USD"
  ).toLowerCase();

  // One call, confirmed immediately — Stripe's PaymentIntent is both "the
  // order" and "the charge" at once, unlike Square's separate Orders +
  // Payments calls.
  const paymentIntent = await stripeFetch(config, "/v1/payment_intents", {
    method: "POST",
    body: {
      amount,
      currency,
      payment_method: request.paymentSourceToken,
      confirm: true,
      // automatic_payment_methods.allow_redirects: "never" keeps this a
      // single synchronous confirm — redirect-based methods would need a
      // requires_action round trip this checkout flow doesn't implement.
      automatic_payment_methods: { enabled: true, allow_redirects: "never" },
      metadata: request.metadata,
    },
    idempotencyKey: `${request.idempotencyKey}:payment_intent`,
  });

  const id = paymentIntent.id as string;
  return {
    providerOrderRef: id,
    providerPaymentRef: id,
    status: mapStripePaymentIntentStatus(paymentIntent.status as string),
    amount: {
      amount: paymentIntent.amount as number,
      currency: ((paymentIntent.currency as string) ?? currency).toUpperCase(),
    },
    raw: paymentIntent,
  };
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

async function hmacSha256Hex(message: string, secret: string): Promise<string> {
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
  return Array.from(new Uint8Array(signature), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

function createVerifyWebhookSignature(
  config: StripeProviderConfig,
): PaymentProvider["verifyWebhookSignature"] {
  return async ({ rawBody, headers, secret }) => {
    const header = headers.get("stripe-signature");
    if (!header) return false;

    // Header format: "t=<timestamp>,v1=<signature>[,v0=<old_signature>]" —
    // parse rather than regex-matching positionally, since Stripe doesn't
    // guarantee component order.
    const parts = new Map<string, string>();
    for (const part of header.split(",")) {
      const [key, value] = part.split("=");
      if (key && value) parts.set(key, value);
    }
    const timestamp = parts.get("t");
    const signature = parts.get("v1");
    if (!timestamp || !signature) return false;

    const tolerance =
      config.webhookToleranceSeconds ?? DEFAULT_WEBHOOK_TOLERANCE_SECONDS;
    const age = Math.abs(Date.now() / 1000 - Number.parseInt(timestamp, 10));
    if (age > tolerance) return false;

    const expected = await hmacSha256Hex(`${timestamp}.${rawBody}`, secret);
    return timingSafeEqual(expected, signature);
  };
}

interface StripeWebhookPayload {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

function parseWebhookEvent(rawBody: string) {
  const payload = JSON.parse(rawBody) as StripeWebhookPayload;
  const eventId = payload.id;
  const object = payload.data.object;

  if (payload.type === "payment_intent.succeeded") {
    return {
      eventId,
      event: {
        kind: "payment.updated" as const,
        providerPaymentRef: object.id as string,
        status: "succeeded" as const,
      },
    };
  }

  if (payload.type === "payment_intent.payment_failed") {
    return {
      eventId,
      event: {
        kind: "payment.updated" as const,
        providerPaymentRef: object.id as string,
        status: "failed" as const,
      },
    };
  }

  if (payload.type === "charge.refunded") {
    return {
      eventId,
      event: {
        kind: "payment.updated" as const,
        providerPaymentRef: object.payment_intent as string,
        status: "refunded" as const,
      },
    };
  }

  if (
    payload.type === "customer.subscription.updated" ||
    payload.type === "customer.subscription.created"
  ) {
    return {
      eventId,
      event: {
        kind: "subscription.updated" as const,
        providerSubscriptionRef: object.id as string,
        status: object.status as string,
      },
    };
  }

  return {
    eventId,
    event: { kind: "unhandled" as const, rawType: payload.type },
  };
}

/**
 * Creates a `PaymentProvider` backed by Stripe's REST API — raw `fetch()`
 * + `crypto.subtle`, no Stripe Node SDK. Implements the required
 * `checkCatalogPrices`/`findOrCreateCustomer`/`checkout`/
 * `verifyWebhookSignature`/`parseWebhookEvent`, plus the optional
 * `subscriptions` capability via Stripe's native Subscriptions API (a
 * better fit than the Square provider's loyalty/recurring-order model,
 * which omits this capability entirely). `catalogSync` is omitted, same
 * as the Square provider's first cut.
 */
export function createStripePaymentProvider(
  config: StripeProviderConfig,
): PaymentProvider {
  return {
    name: "stripe",
    checkCatalogPrices: (refs) => checkCatalogPrices(config, refs),
    findOrCreateCustomer: (email, idempotencyKey) =>
      findOrCreateCustomer(config, email, idempotencyKey),
    checkout: (request) => checkout(config, request),
    verifyWebhookSignature: createVerifyWebhookSignature(config),
    parseWebhookEvent,
    subscriptions: {
      async create(args) {
        const subscription = await stripeFetch(config, "/v1/subscriptions", {
          method: "POST",
          body: {
            customer: args.customerRef,
            items: [{ price: args.planRef }],
          },
          idempotencyKey: args.idempotencyKey,
        });
        return {
          providerSubscriptionRef: subscription.id as string,
          status: subscription.status as string,
        };
      },
      async cancel(providerSubscriptionRef) {
        await stripeFetch(
          config,
          `/v1/subscriptions/${providerSubscriptionRef}`,
          { method: "DELETE" },
        );
      },
    },
  };
}
