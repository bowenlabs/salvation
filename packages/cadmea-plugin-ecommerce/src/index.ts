// Copyright (c) 2026 BowenLabs. All rights reserved.
// MIT licensed. See LICENSE in the repo root.
//
// @thebes/cadmea-plugin-ecommerce
//
// Provider-agnostic ecommerce core for Cadmea. Ships collections
// (Products/Orders/Customers/Payments/WebhookEvents, optional
// Subscriptions), the `PaymentProvider` interface real provider
// implementations conform to (`@thebes/cadmea-plugin-ecommerce-square`,
// `@thebes/cadmea-plugin-ecommerce-stripe`), and checkout/webhook Hono
// handlers. See `types.ts` for the EXTENDING.md-flagged note on why
// `PaymentProvider` is plugin-defined rather than a Cadmus-core adapter.

export * from "./checkout.js";
export * from "./collections.js";
export * from "./errors.js";
export * from "./fulfillment.js";
export * from "./types.js";
export * from "./webhook.js";
