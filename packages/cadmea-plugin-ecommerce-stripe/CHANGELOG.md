# @thebes/cadmea-plugin-ecommerce-stripe

## 1.0.3

### Patch Changes

- 8494276: chore: widen the `@thebes/cadmus` peer range to `>=0.4.0 <1.0.0`

  Rebuilt against `@thebes/cadmus@0.5.0`. The peer range previously resolved to a
  `0.x` caret (`^0.4.x`), so any `cadmus` minor fell out of range and forced a
  major bump across the whole extension ecosystem. Widening it to span the full
  `0.x` line keeps these packages in range for future `cadmus` minors. Strict
  widening of the accepted range — no functional or API changes.

## 1.0.2

### Patch Changes

- Fix Stripe idempotency_error at checkout: the same idempotency key was sent to both /v1/customers and /v1/payment_intents, which Stripe rejects (keys are scoped per endpoint). Namespace per endpoint (:customer / :payment_intent). Found via live test.

## 1.0.1

### Patch Changes

- Updated dependencies
  - @thebes/cadmea-plugin-ecommerce@1.1.0

## 1.0.0

### Patch Changes

- Updated dependencies [1159873]
  - @thebes/cadmus@0.2.0
  - @thebes/cadmea-plugin-ecommerce@1.0.0
