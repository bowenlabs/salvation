// Copyright (c) 2026 BowenLabs. All rights reserved.
// MIT licensed. See LICENSE in the repo root.
//
// The PaymentProvider interface — defined by this plugin, not by
// @thebes/cadmus core. This is a deliberate, documented departure from
// the two-axis doctrine in EXTENDING.md: PaymentProvider mirrors the
// adapter pattern's swappability (one interface, N implementations,
// resolved in one place — here, by whichever Hono route the consumer
// wires a provider into) but sits at the plugin layer, not the framework
// layer, because it needs commerce-domain concepts (normalized
// order/payment events, cart line items) that have no business in
// framework-layer Cadmus. See EXTENDING.md's "plugin-defined provider
// interfaces" section for the general pattern this is the first instance
// of.
//
// @thebes/cadmea-plugin-ecommerce-square and
// @thebes/cadmea-plugin-ecommerce-stripe each implement this interface via
// raw fetch() + crypto.subtle — never either vendor's Node-targeted SDK.

/** Money is always integer minor units (cents) + an ISO 4217 currency code —
 *  matching both providers' own native representations and every money
 *  field on the collections this plugin defines. */
export interface Money {
  amount: number;
  currency: string;
}

export interface CartLineItem {
  /** Provider-specific catalog identifier (Square variation ID / Stripe price ID), opaque to this plugin. */
  catalogRef: string;
  quantity: number;
  /**
   * Client-submitted price — NEVER trusted as-is. `createCheckoutHandler`
   * re-verifies it against `PaymentProvider.checkCatalogPrices` and rejects
   * the request on any mismatch, rather than silently using the server
   * price (a mismatch is a sign of a tampered request, not a typo to
   * paper over).
   */
  clientUnitPrice: Money;
}

export interface CheckoutRequest {
  lineItems: CartLineItem[];
  /** Provider-specific tokenized payment source (Square sourceId / Stripe PaymentMethod id) — produced client-side, never raw card data. */
  paymentSourceToken: string;
  customerEmail?: string;
  /** Caller-generated via `crypto.randomUUID()`, per checkout attempt. */
  idempotencyKey: string;
  /** Free-form metadata the provider attaches to its own order/PaymentIntent object. */
  metadata?: Record<string, string>;
}

export interface CheckoutResult {
  /** Provider's own identifier for the created order/PaymentIntent — stored on the `orders` row. */
  providerOrderRef: string;
  /** Provider's own identifier for the payment/charge — stored on the `payments` row. */
  providerPaymentRef: string;
  status: "succeeded" | "requires_action" | "failed";
  amount: Money;
  /** Raw provider response, JSON-serializable — stored in `payments.rawResponse`. No BigInt: providers that return BigInt-typed amounts (Square's SDK does; its REST API does not) must convert before returning this. */
  raw: Record<string, unknown>;
}

/** A price/availability check against the live provider catalog — never trust client-submitted prices for a checkout. */
export interface CatalogPriceCheck {
  catalogRef: string;
  serverUnitPrice: Money;
  /** `undefined` when the provider doesn't track inventory for this item. */
  availableQuantity?: number;
}

/**
 * The shape every provider's raw webhook payload is translated into, so
 * webhook-dispatch code in `createWebhookHandler` never branches on
 * provider-specific event-type strings.
 */
export type NormalizedWebhookEvent =
  | {
      kind: "payment.updated";
      providerPaymentRef: string;
      status: "succeeded" | "failed" | "refunded";
    }
  | {
      kind: "order.updated";
      providerOrderRef: string;
      status: "paid" | "canceled" | "failed";
    }
  | {
      kind: "subscription.updated";
      providerSubscriptionRef: string;
      status: string;
    }
  | { kind: "unhandled"; rawType: string };

export interface PaymentProvider {
  readonly name: "square" | "stripe";

  /** Re-verifies cart line item prices/availability against the live provider catalog. */
  checkCatalogPrices(refs: string[]): Promise<CatalogPriceCheck[]>;

  /** Idempotent customer find-or-create. Returns the provider's own customer id. */
  findOrCreateCustomer(email: string, idempotencyKey: string): Promise<string>;

  /** Creates and charges an order/PaymentIntent in one call. */
  checkout(request: CheckoutRequest): Promise<CheckoutResult>;

  /**
   * Verifies an inbound webhook's signature against the raw request.
   * Returns `false` rather than throwing on a bad signature — the caller
   * (`createWebhookHandler`) decides the HTTP response (401).
   */
  verifyWebhookSignature(args: {
    rawBody: string;
    headers: Headers;
    secret: string;
    /** Some providers (Square) sign over the full notification URL, not just the body — pass it through unconditionally; providers that don't need it (Stripe) ignore the field. */
    notificationUrl?: string;
  }): Promise<boolean>;

  /**
   * Parses an already-signature-verified raw webhook body into a
   * normalized event, and extracts the provider's own event id for dedup
   * against the `webhook_events` collection.
   */
  parseWebhookEvent(rawBody: string): {
    eventId: string;
    event: NormalizedWebhookEvent;
  };

  /**
   * Optional capability — providers that don't model a syncable catalog
   * omit this; `createCheckoutHandler` only ever calls
   * `checkCatalogPrices` (always required), not this.
   */
  catalogSync?: {
    listCatalogItems(): Promise<
      Array<{
        catalogRef: string;
        name: string;
        unitPrice: Money;
        sku?: string;
      }>
    >;
  };

  /**
   * Optional capability — Square and Stripe model recurring billing
   * differently enough (loyalty/membership-style recurring orders vs. a
   * native Subscriptions object) that this is never assumed present.
   */
  subscriptions?: {
    create(args: {
      customerRef: string;
      planRef: string;
      idempotencyKey: string;
    }): Promise<{ providerSubscriptionRef: string; status: string }>;
    cancel(providerSubscriptionRef: string): Promise<void>;
  };
}

/**
 * `FulfillmentProvider` is a second instance of the "plugin-defined
 * provider interface" pattern documented in EXTENDING.md alongside
 * `PaymentProvider` — orthogonal to it, not a variant of it. A
 * `PaymentProvider` charges a card; a `FulfillmentProvider` ships physical
 * goods (print-on-demand, a 3PL, etc.) once an order is paid. An order's
 * `provider` field (who charged the card) and `fulfillmentProvider` field
 * (who ships it) are independent — a single Stripe-charged order might be
 * fulfilled by Printful, a different POD vendor, or not at all (digital
 * goods).
 */
export interface FulfillmentLineItem {
  /** Fulfillment provider's own catalog identifier (e.g. Printful sync variant id) — opaque to this plugin, distinct from `CartLineItem.catalogRef`. */
  catalogRef: string;
  quantity: number;
}

export interface FulfillmentOrderRequest {
  /** This plugin's own `orders.id` — round-tripped so `createFulfillmentOrder` can correlate its result back to the order row that requested it. */
  orderId: number;
  lineItems: FulfillmentLineItem[];
  shippingAddress: {
    firstName?: string;
    lastName?: string;
    address1?: string;
    address2?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
    phone?: string;
  };
  customerEmail?: string;
}

export interface FulfillmentOrderResult {
  /** Provider's own identifier for the fulfillment order — stored on `orders.fulfillmentProviderRef`, the correlation key inbound fulfillment webhooks dispatch against. */
  providerFulfillmentRef: string;
  status: "pending" | "shipped" | "delivered" | "failed";
}

/**
 * The shape every fulfillment provider's raw webhook payload is translated
 * into — mirrors `NormalizedWebhookEvent`'s role for `PaymentProvider`, kept
 * as a separate type rather than a union member of it since the two event
 * vocabularies (payment status vs. shipment status) don't overlap.
 */
export type NormalizedFulfillmentWebhookEvent =
  | {
      kind: "fulfillment.updated";
      providerFulfillmentRef: string;
      status: "shipped" | "delivered" | "failed";
      trackingNumber?: string;
      trackingCarrier?: string;
      trackingUrl?: string;
    }
  | { kind: "unhandled"; rawType: string };

export interface FulfillmentProvider {
  /** e.g. "printful" — a plain string, not a closed union like `PaymentProvider.name`: fulfillment backends are a more open set (POD vendors, 3PLs) than the two payment rails this plugin ships providers for. */
  readonly name: string;

  /** Submits a paid order's line items for fulfillment. Called once per order, after `PaymentProvider` reports the order as paid. */
  createFulfillmentOrder(
    request: FulfillmentOrderRequest,
  ): Promise<FulfillmentOrderResult>;

  /** Verifies an inbound webhook's signature — same contract as `PaymentProvider.verifyWebhookSignature`. */
  verifyWebhookSignature(args: {
    rawBody: string;
    headers: Headers;
    secret: string;
  }): Promise<boolean>;

  /** Parses an already-verified raw webhook body into a normalized event, plus the provider's own event id for dedup. */
  parseWebhookEvent(rawBody: string): {
    eventId: string;
    event: NormalizedFulfillmentWebhookEvent;
  };
}
