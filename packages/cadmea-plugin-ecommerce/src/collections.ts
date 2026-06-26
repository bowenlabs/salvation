// Copyright (c) 2026 BowenLabs. All rights reserved.
// MIT licensed. See LICENSE in the repo root.
//
// Provider-agnostic ecommerce collections — Products/Variants, Orders,
// Customers, Payments (audit log), WebhookEvents (dedup), and an optional
// Subscriptions collection. Field types are restricted to what
// @thebes/cadmus/cms actually supports, including the Section 3 `group`
// (shippingAddress, flattened to real columns) and `json` (rawResponse)
// additions.

import type { CadmeaPlugin, CollectionConfig } from "@thebes/cadmus/cms";

export interface EcommercePluginOptions {
  productsSlug?: string;
  ordersSlug?: string;
  customersSlug?: string;
  paymentsSlug?: string;
  webhookEventsSlug?: string;
  subscriptionsSlug?: string;
  /** What `customers.linkedUser` relates to. Default: "users". */
  usersSlug?: string;
  /**
   * Adds the `subscriptions` collection. Default: false — Square and
   * Stripe model recurring billing differently enough
   * (`PaymentProvider.subscriptions` is itself optional) that this
   * collection is opt-in, not assumed needed by every store.
   */
  includeSubscriptions?: boolean;
}

const DEFAULTS = {
  products: "products",
  orders: "orders",
  customers: "customers",
  payments: "payments",
  webhookEvents: "webhook_events",
  subscriptions: "subscriptions",
  users: "users",
};

function buildProductsCollection(slug: string): CollectionConfig {
  return {
    slug,
    fields: {
      id: { type: "number", autoIncrement: true },
      name: { type: "text", required: true },
      description: { type: "text" },
      status: {
        type: "select",
        options: ["draft", "active", "archived"],
        required: true,
        defaultValue: "draft",
      },
      // No discriminator needed — every variant has the same shape.
      variants: {
        type: "array",
        required: true,
        fields: {
          sku: { type: "text", required: true },
          catalogRef: { type: "text", required: true },
          priceCents: { type: "number", required: true },
          currency: { type: "text", defaultValue: "USD" },
          inventoryCount: { type: "number" },
        },
      },
      createdAt: { type: "date", mode: "timestamp", defaultValue: "now" },
    },
  };
}

function buildOrdersCollection(
  slug: string,
  customersSlug: string,
): CollectionConfig {
  return {
    slug,
    fields: {
      id: { type: "number", autoIncrement: true },
      orderNumber: { type: "text", required: true, unique: true },
      status: {
        type: "select",
        options: [
          "pending",
          "paid",
          "failed",
          "refunded",
          "partially_refunded",
        ],
        required: true,
        defaultValue: "pending",
      },
      totalCents: { type: "number", required: true },
      subtotalCents: { type: "number", required: true },
      taxCents: { type: "number" },
      currency: { type: "text", defaultValue: "USD" },
      // Which PaymentProvider created this order — needed so webhook
      // dispatch and any provider-specific lookups (tracking, refunds)
      // know which provider's REST API to call back into.
      provider: {
        type: "select",
        options: ["square", "stripe"],
        required: true,
      },
      providerOrderRef: { type: "text" },
      providerPaymentRef: { type: "text" },
      customer: { type: "relationship", relationTo: customersSlug },
      // No native `email` field type — same as the SMB form-builder's own
      // email-field handling, this is a plain `text` column; validate
      // shape in a beforeChange hook if the operator wants that.
      guestEmail: { type: "text" },
      lineItems: {
        type: "array",
        required: true,
        fields: {
          productName: { type: "text", required: true },
          quantity: { type: "number", required: true },
          unitPriceCents: { type: "number", required: true },
          totalPriceCents: { type: "number", required: true },
          catalogRef: { type: "text" },
        },
      },
      // The `group` field type (Section 3) — flattens to real prefixed
      // columns (shipping_address_first_name, etc), not a JSON blob, so
      // SQL-level querying on a subfield still works.
      shippingAddress: {
        type: "group",
        fields: {
          firstName: { type: "text" },
          lastName: { type: "text" },
          address1: { type: "text" },
          address2: { type: "text" },
          city: { type: "text" },
          state: { type: "text" },
          zip: { type: "text" },
          country: { type: "text", defaultValue: "US" },
          phone: { type: "text" },
        },
      },
      fulfillmentStatus: {
        type: "select",
        options: ["pending", "shipped", "delivered", "failed"],
      },
      // Which FulfillmentProvider is shipping this order — independent of
      // `provider` (who charged the card); see types.ts's doc comment on
      // FulfillmentProvider for why these are separate axes.
      fulfillmentProvider: { type: "text" },
      // The fulfillment provider's own order identifier — the correlation
      // key createFulfillmentWebhookHandler dispatches inbound shipment
      // webhooks against, mirroring providerOrderRef's role for payments.
      fulfillmentProviderRef: { type: "text" },
      trackingNumber: { type: "text" },
      trackingCarrier: { type: "text" },
      trackingUrl: { type: "text" },
      createdAt: { type: "date", mode: "timestamp", defaultValue: "now" },
    },
  };
}

function buildCustomersCollection(
  slug: string,
  usersSlug: string,
): CollectionConfig {
  return {
    slug,
    fields: {
      id: { type: "number", autoIncrement: true },
      email: { type: "text", required: true, unique: true },
      provider: { type: "select", options: ["square", "stripe"] },
      providerCustomerRef: { type: "text" },
      linkedUser: { type: "relationship", relationTo: usersSlug },
      // Square-specific; null for Stripe customers — fine to keep on the
      // shared collection since unused fields are simply null.
      loyaltyAccountRef: { type: "text" },
      loyaltyPoints: { type: "number", defaultValue: 0 },
      createdAt: { type: "date", mode: "timestamp", defaultValue: "now" },
    },
  };
}

function buildPaymentsCollection(
  slug: string,
  ordersSlug: string,
): CollectionConfig {
  return {
    slug,
    fields: {
      id: { type: "number", autoIncrement: true },
      provider: {
        type: "select",
        options: ["square", "stripe"],
        required: true,
      },
      providerPaymentRef: { type: "text", required: true },
      providerOrderRef: { type: "text" },
      order: { type: "relationship", relationTo: ordersSlug },
      // The provider's own status string, stored as-is for audit fidelity
      // (not normalized) — a `select` would force enumerating every
      // provider's status vocabulary here, exactly the provider-coupling
      // the core/provider split exists to avoid.
      status: { type: "text" },
      amountCents: { type: "number", required: true },
      currency: { type: "text", defaultValue: "USD" },
      // The `json` field type (Section 3) — the full raw provider payload,
      // for audit/debugging. The one place a freeform-blob column is
      // genuinely the right shape, not a workaround.
      rawResponse: { type: "json" },
      createdAt: { type: "date", mode: "timestamp", defaultValue: "now" },
    },
  };
}

function buildWebhookEventsCollection(slug: string): CollectionConfig {
  return {
    slug,
    fields: {
      id: { type: "number", autoIncrement: true },
      provider: {
        type: "select",
        options: ["square", "stripe"],
        required: true,
      },
      // The unique constraint *is* the concurrency-safe dedup guard — a
      // concurrent duplicate naturally throws a unique-constraint
      // CadmusCmsError from create(), which createWebhookHandler treats as
      // "already processed," not a real error.
      eventId: { type: "text", required: true, unique: true },
      eventType: { type: "text" },
      receivedAt: { type: "date", mode: "timestamp", defaultValue: "now" },
    },
  };
}

function buildSubscriptionsCollection(
  slug: string,
  customersSlug: string,
): CollectionConfig {
  return {
    slug,
    fields: {
      id: { type: "number", autoIncrement: true },
      provider: {
        type: "select",
        options: ["square", "stripe"],
        required: true,
      },
      providerSubscriptionRef: { type: "text", required: true },
      customer: { type: "relationship", relationTo: customersSlug },
      status: { type: "text" },
      chargedThroughDate: { type: "date", mode: "timestamp" },
      createdAt: { type: "date", mode: "timestamp", defaultValue: "now" },
    },
  };
}

/**
 * Returns a Cadmea plugin that adds the provider-agnostic ecommerce
 * collections — a no-op for any collection slug already present, the same
 * idempotent-add convention `cadmea-plugin-redirects`/`cadmea-plugin-crm`
 * use.
 */
export function ecommercePlugin(
  options: EcommercePluginOptions = {},
): CadmeaPlugin {
  const slugs = {
    products: options.productsSlug ?? DEFAULTS.products,
    orders: options.ordersSlug ?? DEFAULTS.orders,
    customers: options.customersSlug ?? DEFAULTS.customers,
    payments: options.paymentsSlug ?? DEFAULTS.payments,
    webhookEvents: options.webhookEventsSlug ?? DEFAULTS.webhookEvents,
    subscriptions: options.subscriptionsSlug ?? DEFAULTS.subscriptions,
    users: options.usersSlug ?? DEFAULTS.users,
  };

  return (config) => {
    const collections = [...config.collections];
    const addIfMissing = (collection: CollectionConfig) => {
      if (!collections.some((c) => c.slug === collection.slug)) {
        collections.push(collection);
      }
    };

    addIfMissing(buildProductsCollection(slugs.products));
    addIfMissing(buildOrdersCollection(slugs.orders, slugs.customers));
    addIfMissing(buildCustomersCollection(slugs.customers, slugs.users));
    addIfMissing(buildPaymentsCollection(slugs.payments, slugs.orders));
    addIfMissing(buildWebhookEventsCollection(slugs.webhookEvents));
    if (options.includeSubscriptions) {
      addIfMissing(
        buildSubscriptionsCollection(slugs.subscriptions, slugs.customers),
      );
    }

    return { ...config, collections };
  };
}
