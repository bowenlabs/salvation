# @thebes/cadmus

## 0.9.0

### Minor Changes

- 1bc8869: cadmea: create-form field behaviors — `admin.defaultFrom` + `admin.appendOnCreate` (#98)

  Adds two declarative, create-form-only field behaviors so consuming sites can build "template-driven" create flows without owning a bespoke route (immediate consumer: the Portfolio page template, bowenlabs/themidwestartist.com#8):

  - **`admin.defaultFrom`** (`@thebes/cadmus` `FieldAdminConfig`) — reactively seed a field from another field's value, e.g. default a page `title` from the chosen `category`. For a `relationship` source the selected option's `label` is resolved and passed to an optional `map`; when omitted the field defaults to `label ?? value`. Overridable — a value the user has typed is never clobbered, but switching the source still updates an untouched target.
  - **`admin.appendOnCreate`** (array fields) — when creating a new row and `when(values)` holds, append `item(values)` to the array before submit, e.g. auto-insert a `portfolioGallery` block bound to the chosen category into `blocks`. Runs once at submit; never on edit.

  Both are applied by `CollectionEdit` only in create mode (`operation === "create"`); the edit form keeps its real data. Field-level `admin.condition` visibility (the other half of #98) already shipped. No schema or Local API changes.

## 0.8.0

### Minor Changes

- 3623a3a: Add `createCloudflareAccess` (`@thebes/cadmus/hono`) — a Hono middleware that verifies Cloudflare Access JWTs at the edge. It validates the `Cf-Access-Jwt-Assertion` token (or `CF_Authorization` cookie) against the team's JWKS over Web Crypto only (no new deps): pinned RS256, signature, `aud`, `iss`, and expiry checks, with per-isolate JWKS caching and one-shot refresh on key rotation. On success the verified `AccessIdentity` (email, sub, claims) is stored on the Hono context; on failure it returns `403` (customizable via `onUnauthorized`). Use it to gate preview deployments or any identity-restricted route set.
- 56bb1ac: Add `@thebes/cadmus/secrets` — `getSecret` / `requireSecret` accessors over Cloudflare Secrets Store bindings that also work in local dev. A secret is a `secrets_store_secrets` binding (async `.get()`) in a deployed Worker and a plain `.dev.vars` string locally; these helpers accept either, so one call site works in both. `requireSecret` throws on a missing/empty value for fail-fast startup validation. Lets a single Secrets Store value be bound into many Workers (centralized rotation + audit) instead of duplicated per-Worker `wrangler secret put`.
- 5feb1ac: Add framework-owned `site_settings` to `@thebes/cadmus/db` — `siteSettingsColumns` (the generic identity/appearance/structural-color/contact/nav/SEO/domain/feature-toggle column set) plus a ready-made `siteSettings` singleton table (`id = 1` enforced). Sites compose or use it directly instead of hand-rolling the table, so it stops drifting between clients. It's byte-identical to the current hand-rolled shape, so adopting it produces no spurious migration. First safe slice of the pt#83 migrations-composition work (Direction B — see DECISIONS.md); also pins `generateSchemaSource` determinism with tests.
- 0f08e37: Add `@thebes/cadmus/migrations` — `composeMigrations(sources)`, the deterministic core of Direction B (see DECISIONS.md). It merges ordered migration sources (cadmus core, each plugin, the site) into wrangler-ready `NNNNNNN_<namespace>__<id>.sql` files, where the numeric prefix is `order + index` so every source occupies a reserved band with gaps — adding a migration to one source, or introducing a new source, never renumbers another's files (keeping wrangler's filename-tracked idempotency correct). Also adds an `exclude` option to `generateSchemaSource(config, { exclude })` so a site can omit plugin-owned collections from its drizzle-kit diff (plugin tables then come from the plugin's shipped migrations, not the site's diff). Pure/tested building blocks; the per-plugin migration SQL and the site `db:generate` wiring are the follow-on consumption steps.

## 0.7.0

### Minor Changes

- 72c7af4: Add a CSP violation report sink to `createSecurityHeaders`. New `reportUri` (and
  optional `reportTo` group, default `"csp"`) options append `report-uri` +
  `report-to` directives to the policy and emit a `Reporting-Endpoints` response
  header, so browsers POST violations to a same-origin collector. Adds
  `createCspReportHandler()` — a Hono handler that parses reports (content-type
  agnostic), forwards them to an `onReport` callback (defaults to `console.warn`
  so they surface in Workers Logs / Sentry), and always answers `204`.
- 72c7af4: Add `createErrorMonitoring` — a vendor-neutral Hono `onError` handler factory.
  The consumer supplies a `capture(error, c)` sink (Sentry, Axiom, console, …) and
  cadmus stays SDK-free. It reports the error best-effort (swallowing sink
  failures, running via `waitUntil` when an execution context is present), then
  responds via an optional `onError` delegate (default `500`). Registered on the
  outermost app it also catches errors rethrown by inner mounted routers.
- 72c7af4: Add scheduled publishing to versioned collections. The generated
  `${slug}_versions` table gains a nullable `scheduled_at` column (codegen +
  schema-gen), and `VersionedLocalApi` gains `scheduleDraft(ctx, id, input, when)`
  (saves a draft stamped with a future publish time) and `publishScheduled(ctx,
now?)` (publishes every still-draft version due at/before `now`, oldest-first,
  clearing each schedule). Intended to be driven by a scheduled worker (e.g. a
  Cloudflare cron trigger). Consumers with `versions.drafts` collections will need
  a migration adding the `scheduled_at` column.

## 0.6.0

### Minor Changes

- 0000c2f: - `@thebes/cadmus/hono`: add `createSecurityHeaders(options)` — a configurable
  security-headers middleware (HSTS, CSP, X-Content-Type-Options,
  Referrer-Policy, Permissions-Policy) with same-origin framing by default and a
  per-response framing opt-out via `FRAME_ANCESTORS_HEADER`.
  - `@thebes/cadmus/cms`: add `renderRichText` (read-side TipTap JSON → HTML) and
    the `TipTapJSONContent` type.
  - `@thebes/cadmus/storage`: add `parseImageRef` + `ParsedImageRef` for parsing a
    stored image-field value (bare URL or hotspot/crop JSON).

## 0.5.2

### Patch Changes

- c23aca7: Fix: classify D1 unique-constraint violations even when drizzle buries the SQLite text on `error.cause`.

  `createLocalApi`'s write-error handling only inspected the top-level `error.message` when deciding whether a failed write was a unique-constraint violation. drizzle-orm's D1 driver wraps the underlying error so the `"UNIQUE constraint failed: …"` text lands on `error.cause` (sometimes deeper), leaving `message = "Failed query: …"`. As a result every unique violation against D1 fell through to the generic "Write failed for collection …" instead of "Unique constraint violated for collection …".

  This broke callers that branch on the classified message — most visibly the `@thebes/cadmea-plugin-ecommerce` webhook/fulfillment dedup guards, which treat a duplicate `webhook_events.eventId` insert as "already processed" (HTTP 200). Pre-fix, a replayed payment/fulfillment webhook surfaced as a 500, so providers retried until the event dead-lettered (effects stayed idempotent — the failure happened before dispatch — but the response contract was wrong).

  `wrapWriteError` now flattens the full `cause` chain before matching, so the classification holds regardless of how deep the driver nests the SQLite error.

## 0.5.0

### Minor Changes

- d380d37: feat: per-block click-to-edit visual editing (#15)

  Adds the visual-editing primitives and wiring that let a rendered preview map
  regions back to the fields and blocks that produced them.

  - `@thebes/cadmus/cms`: `editAttr`/`encodeEditRef`/`decodeEditRef` for tagging
    editable regions, stable block keys (`BLOCK_KEY`, `newBlockKey`,
    `parseBlockFieldRef`) so a `blocks.<_key>` ref survives reordering, the
    live-preview reverse channel (`PREVIEW_VALUES_MESSAGE`, `applyPreviewValues`,
    `mountPreviewSync`), and the click-to-edit overlay (`mountVisualEditing`).
  - `@thebes/cadmea`: `CollectionEdit` now stamps a `_key` on discriminated
    array blocks, accepts a `focusBlock` target (`BlockFocusTarget`) that expands,
    scrolls to, and focuses the clicked block, and emits editable values via
    `onValuesChange` for side-by-side live preview. `createCollectionEditPage`
    wires preview clicks (`VisualEditingPane.onEdit`) and an external `focusBlock`
    option through to the editor.

## 0.4.2

### Patch Changes

- 886161b: As-you-type live preview primitives (Workstream D).

  **@thebes/cadmus** — new preview-sync channel (the reverse of click-to-edit):
  `mountPreviewSync({ collection, id })` on a preview page applies incoming
  field values to tagged `[data-cadmus-edit]` text regions; `applyPreviewValues`
  is the pure patcher; `PREVIEW_VALUES_MESSAGE`/`PreviewValuesMessage` are the
  postMessage contract.

  **@thebes/cadmea** — `VisualEditingPane` gains `previewValues` + `previewTarget`
  and posts them into the iframe on change; `CollectionEdit` gains `onValuesChange`
  (fires the current editable values on every edit) so a side-by-side editor can
  drive a live preview.

## 0.4.1

### Patch Changes

- f1dc0a8: Friendlier, schema-driven CMS editor.

  **@thebes/cadmus** — add an optional `admin` block to every field
  (`FieldAdminConfig`: `label`, `description`, `placeholder`, `group`, `width`,
  `condition`, `readOnly`) and optional per-variant `discriminator.variantsAdmin`
  (`label`, `icon`) for the block picker. All additive and backwards-compatible.

  **@thebes/cadmea** — `CollectionEdit`/`CollectionList` now build on TanStack
  Form/Table. The editor renders humanized labels, help text, grouped fieldsets,
  responsive half-width fields, conditional fields, and inline validation wired to
  the existing `ValidationBuilder`; relationship fields are a searchable combobox
  with `hasMany` multi-select; discriminated `array` fields become a visual block
  builder (typed block picker, reorder, duplicate, collapse). Public props are
  unchanged.

## 0.4.0

### Minor Changes

- Phase 4 (framework maturity): version-history patch model + field-level diff (`patch.ts`, `VersionedLocalApi.diffVersions`) (#14); content-migration runner (`migrate.ts`: `defineMigration`/`runMigration`, dry-run + apply, idempotent) (#18); image hotspot/crop on the `ImageService` contract (`ImageHotspot`/`ImageCrop`, render() gains hotspot/crop/sourceWidth/Height) (#17); visual-editing primitives (`visual-editing.ts`: editAttr/encode/decode + mountVisualEditing) (#15). All additive.

## 0.3.0

### Minor Changes

- Adopt three Sanity-inspired CMS patterns (idea, not code) in `@thebes/cadmus/cms`:

  - **Structure Builder (#12):** `CollectionAdminConfig` (`group`/`order`/`hidden`/`readOnly`/`singleton`/`label`/`icon`) plus a pure `buildStudioStructure()` helper, so a studio sidebar renders from an explicit, grouped structure instead of mapping the raw collection list.
  - **Chainable field validation (#16):** an immutable `Rule` builder (`required`/`min`/`max`/`length`/`regex`/`email`/`slug`/`integer`/`positive`/`unique`/`reference`/`custom`, plus `.error()`/`.warning()`), evaluated by `validateDocument`/`assertValid` and enforced server-side in `createLocalApi` on create/update/publish. Adds `CadmusValidationError` (carrying per-field violations) and maps it to HTTP 422 in `mountCmsRoutes`. New `BaseFieldConfig.validation` and `defineField`.
  - **Block renderer registry (#13):** framework-agnostic `createBlockRegistry` / `renderBlocksToString` (the Portable Text / `@portabletext` pattern) so rendering is a `type → renderer` lookup instead of a hand-rolled switch.

  All additive — no breaking changes to existing config or APIs.

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
