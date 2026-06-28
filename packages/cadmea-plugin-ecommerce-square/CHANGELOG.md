# @thebes/cadmea-plugin-ecommerce-square

## 1.0.2

### Patch Changes

- 8494276: chore: widen the `@thebes/cadmus` peer range to `>=0.4.0 <1.0.0`

  Rebuilt against `@thebes/cadmus@0.5.0`. The peer range previously resolved to a
  `0.x` caret (`^0.4.x`), so any `cadmus` minor fell out of range and forced a
  major bump across the whole extension ecosystem. Widening it to span the full
  `0.x` line keeps these packages in range for future `cadmus` minors. Strict
  widening of the accepted range — no functional or API changes.

## 1.0.1

### Patch Changes

- Updated dependencies
  - @thebes/cadmea-plugin-ecommerce@1.1.0

## 1.0.0

### Patch Changes

- 0325423: Verify Square webhook signatures with a constant-time comparison instead of
  `===`. A plain equality check leaks, via early-exit timing, how many leading
  bytes of the HMAC matched — enough to forge a valid signature byte-by-byte.
  Now mirrors the Stripe provider's `timingSafeEqual` helper. No API change.
- Updated dependencies [1159873]
  - @thebes/cadmus@0.2.0
  - @thebes/cadmea-plugin-ecommerce@1.0.0
