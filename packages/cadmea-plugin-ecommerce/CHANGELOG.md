# @thebes/cadmea-plugin-ecommerce

## 1.1.1

### Patch Changes

- 8494276: chore: widen the `@thebes/cadmus` peer range to `>=0.4.0 <1.0.0`

  Rebuilt against `@thebes/cadmus@0.5.0`. The peer range previously resolved to a
  `0.x` caret (`^0.4.x`), so any `cadmus` minor fell out of range and forced a
  major bump across the whole extension ecosystem. Widening it to span the full
  `0.x` line keeps these packages in range for future `cadmus` minors. Strict
  widening of the accepted range — no functional or API changes.

## 1.1.0

### Minor Changes

- Add a `FulfillmentProvider` interface to `@thebes/cadmea-plugin-ecommerce` — a
  second instance of the plugin-defined-provider pattern alongside
  `PaymentProvider`, orthogonal to it: a `PaymentProvider` charges a card, a
  `FulfillmentProvider` ships physical goods once an order is paid. Adds
  `fulfillmentProvider`/`fulfillmentProviderRef` correlation fields to the
  `orders` collection, an `onOrderPaid` hook on `createWebhookHandler` for
  triggering fulfillment after a payment webhook marks an order paid, and a new
  `fulfillment.ts` module (`createFulfillmentOrder`, the hook implementation;
  `createFulfillmentWebhookHandler`, for inbound shipment-status webhooks).

  Introduces `@thebes/cadmea-plugin-printful`, the first `FulfillmentProvider`
  implementation — backed by Printful's REST API via raw `fetch()` +
  `crypto.subtle`, no Printful Node SDK. See its README for the `catalogRef`
  format it expects.

## 1.0.0

### Patch Changes

- Updated dependencies [1159873]
  - @thebes/cadmus@0.2.0
