// Copyright (c) 2026 BowenLabs. All rights reserved.
// MIT licensed. See LICENSE in the repo root.

import type { CmsConfig } from "@thebes/cadmus/cms";
import { describe, expect, it } from "vitest";
import { ecommercePlugin } from "./collections.js";

describe("ecommercePlugin", () => {
  it("adds products/orders/customers/payments/webhook_events but not subscriptions by default", () => {
    const config: CmsConfig = { collections: [] };
    const resolved = ecommercePlugin()(config);
    expect(resolved.collections.map((c) => c.slug).sort()).toEqual(
      ["customers", "orders", "payments", "products", "webhook_events"].sort(),
    );
  });

  it("adds the subscriptions collection when includeSubscriptions is set", () => {
    const config: CmsConfig = { collections: [] };
    const resolved = ecommercePlugin({ includeSubscriptions: true })(config);
    expect(resolved.collections.map((c) => c.slug)).toContain("subscriptions");
  });

  it("gives products a required variants array field", () => {
    const config: CmsConfig = { collections: [] };
    const resolved = ecommercePlugin()(config);
    const products = resolved.collections.find((c) => c.slug === "products");
    expect(products?.fields.variants).toMatchObject({
      type: "array",
      required: true,
    });
  });

  it("gives orders a group-typed shippingAddress field and a relationship to customers", () => {
    const config: CmsConfig = { collections: [] };
    const resolved = ecommercePlugin()(config);
    const orders = resolved.collections.find((c) => c.slug === "orders");
    expect(orders?.fields.shippingAddress).toMatchObject({ type: "group" });
    expect(orders?.fields.customer).toMatchObject({
      type: "relationship",
      relationTo: "customers",
    });
  });

  it("gives payments a json-typed rawResponse field", () => {
    const config: CmsConfig = { collections: [] };
    const resolved = ecommercePlugin()(config);
    const payments = resolved.collections.find((c) => c.slug === "payments");
    expect(payments?.fields.rawResponse).toEqual({ type: "json" });
  });

  it("gives webhook_events a required, unique eventId field", () => {
    const config: CmsConfig = { collections: [] };
    const resolved = ecommercePlugin()(config);
    const webhookEvents = resolved.collections.find(
      (c) => c.slug === "webhook_events",
    );
    expect(webhookEvents?.fields.eventId).toMatchObject({
      type: "text",
      required: true,
      unique: true,
    });
  });

  it("supports custom slugs end to end (orders.customer follows customersSlug)", () => {
    const config: CmsConfig = { collections: [] };
    const resolved = ecommercePlugin({ customersSlug: "shoppers" })(config);
    const orders = resolved.collections.find((c) => c.slug === "orders");
    expect(orders?.fields.customer).toMatchObject({ relationTo: "shoppers" });
    expect(resolved.collections.map((c) => c.slug)).toContain("shoppers");
  });

  it("is a no-op for any collection slug that already exists", () => {
    const existingOrders = {
      slug: "orders",
      fields: { id: { type: "number" as const } },
    };
    const config: CmsConfig = { collections: [existingOrders] };
    const resolved = ecommercePlugin()(config);
    expect(resolved.collections.find((c) => c.slug === "orders")).toBe(
      existingOrders,
    );
    expect(resolved.collections.some((c) => c.slug === "products")).toBe(true);
  });

  it("returns a new collections array (doesn't mutate the input config)", () => {
    const config: CmsConfig = { collections: [] };
    ecommercePlugin()(config);
    expect(config.collections).toHaveLength(0);
  });
});
