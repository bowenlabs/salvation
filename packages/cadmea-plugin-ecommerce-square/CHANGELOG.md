# @thebes/cadmea-plugin-ecommerce-square

## 1.0.0

### Patch Changes

- 0325423: Verify Square webhook signatures with a constant-time comparison instead of
  `===`. A plain equality check leaks, via early-exit timing, how many leading
  bytes of the HMAC matched — enough to forge a valid signature byte-by-byte.
  Now mirrors the Stripe provider's `timingSafeEqual` helper. No API change.
- Updated dependencies [1159873]
  - @thebes/cadmus@0.2.0
  - @thebes/cadmea-plugin-ecommerce@1.0.0
