# @thebes/cadmus

## 0.2.1

### Patch Changes

- 3a4feb6: `deliverWebhookMessage` now rejects non-http(s) URLs and hostnames matching
  common private/loopback/link-local patterns (including the cloud metadata
  address) before calling `fetch()`, throwing `CadmusQueueError` instead.
  Defense-in-depth, not the primary control — `global_fetch_strictly_public`
  already blocks `fetch()` to private IP literals at the platform level, and
  `WEBHOOK_URL` is operator config, not attacker input — but this also catches
  hostnames that _resolve_ to a private address and gives a clear error
  instead of a platform-level network failure on a misconfigured deploy.

## 0.2.0

### Minor Changes

- 1159873: cms: add the Cadmea plugin axis and enforce collection hooks.

  - `CmsConfig` now accepts `plugins: CadmeaPlugin[]` — `(config) => config`
    transforms (Payload-shaped) that `defineCmsConfig` runs in order before
    validation. Plugins can inject fields, add collections, or register hooks.
  - The previously-reserved collection `hooks`
    (`beforeChange`/`afterChange`/`beforeRead`/`afterRead`/`beforeDelete`/
    `afterDelete`) are now enforced by `createLocalApi` on every operation.
    `beforeChange` runs before validation so a hook can default a required
    field. `access` remains reserved (not yet enforced).
