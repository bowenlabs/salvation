---
"@thebes/cadmus": minor
---

- `@thebes/cadmus/hono`: add `createSecurityHeaders(options)` — a configurable
  security-headers middleware (HSTS, CSP, X-Content-Type-Options,
  Referrer-Policy, Permissions-Policy) with same-origin framing by default and a
  per-response framing opt-out via `FRAME_ANCESTORS_HEADER`.
- `@thebes/cadmus/cms`: add `renderRichText` (read-side TipTap JSON → HTML) and
  the `TipTapJSONContent` type.
- `@thebes/cadmus/storage`: add `parseImageRef` + `ParsedImageRef` for parsing a
  stored image-field value (bare URL or hotspot/crop JSON).
