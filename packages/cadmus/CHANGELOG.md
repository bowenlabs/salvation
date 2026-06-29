# @thebes/cadmus

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
