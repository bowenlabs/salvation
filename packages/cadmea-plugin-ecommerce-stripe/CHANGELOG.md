# @thebes/cadmea-plugin-ecommerce-stripe

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
