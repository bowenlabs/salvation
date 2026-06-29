// Copyright (c) 2026 BowenLabs. All rights reserved.
// MIT licensed. See LICENSE in the repo root.
//
// @thebes/cadmea-plugin-printful — the Printful implementation of
// @thebes/cadmea-plugin-ecommerce's FulfillmentProvider interface. Wire it
// as the payment provider's `onOrderPaid` hook (see
// @thebes/cadmea-plugin-ecommerce's fulfillment.ts) to submit paid orders
// for print-on-demand fulfillment, and mount `createFulfillmentWebhookHandler`
// for inbound shipment-status webhooks.

export * from "./pricing.js";
export * from "./print-transform.js";
export * from "./provider.js";
