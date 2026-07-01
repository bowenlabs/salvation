---
"@thebes/cadmus": minor
---

Add `createCloudflareAccess` (`@thebes/cadmus/hono`) — a Hono middleware that verifies Cloudflare Access JWTs at the edge. It validates the `Cf-Access-Jwt-Assertion` token (or `CF_Authorization` cookie) against the team's JWKS over Web Crypto only (no new deps): pinned RS256, signature, `aud`, `iss`, and expiry checks, with per-isolate JWKS caching and one-shot refresh on key rotation. On success the verified `AccessIdentity` (email, sub, claims) is stored on the Hono context; on failure it returns `403` (customizable via `onUnauthorized`). Use it to gate preview deployments or any identity-restricted route set.
