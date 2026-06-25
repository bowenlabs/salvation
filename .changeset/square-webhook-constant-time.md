---
"@thebes/cadmea-plugin-ecommerce-square": patch
---

Verify Square webhook signatures with a constant-time comparison instead of
`===`. A plain equality check leaks, via early-exit timing, how many leading
bytes of the HMAC matched — enough to forge a valid signature byte-by-byte.
Now mirrors the Stripe provider's `timingSafeEqual` helper. No API change.
