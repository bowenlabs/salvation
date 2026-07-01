---
"@thebes/cadmus": minor
---

Add `@thebes/cadmus/secrets` — `getSecret` / `requireSecret` accessors over Cloudflare Secrets Store bindings that also work in local dev. A secret is a `secrets_store_secrets` binding (async `.get()`) in a deployed Worker and a plain `.dev.vars` string locally; these helpers accept either, so one call site works in both. `requireSecret` throws on a missing/empty value for fail-fast startup validation. Lets a single Secrets Store value be bound into many Workers (centralized rotation + audit) instead of duplicated per-Worker `wrangler secret put`.
