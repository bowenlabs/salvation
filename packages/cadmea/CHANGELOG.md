# @thebes/cadmea

## 1.12.2

### Patch Changes

- 9aca8ca: CollectionEdit: fix an infinite autosave loop in the draft/versioned edit path.

  The draft path never re-baselines the form after a save, so `dirty` stays true;
  meanwhile `draftActions` is typically a reactive getter (its `saving`/`canPublish`
  read the consumer's mutation signals — see `createCollectionEditPage`), so the
  autosave effect re-runs on every save's `isPending` toggle. Together these
  re-armed the debounce forever — a single edit turned into a save every
  `autosaveMs` indefinitely, flooding the server and tripping any write
  rate-limit (which then made Publish fail too).

  The autosave effect now records the editable payload it last saved and skips
  re-arming when the content is unchanged, so a given edit autosaves exactly once.
  Manual "Save draft" is unaffected.

## 1.12.1

### Patch Changes

- 7a2f8f8: CollectionEdit block builder: the "Add block" type picker is now a modal grid
  of variant cards (icon + label) instead of an inline dropdown menu — matching
  the Studio Prototype's block picker. It closes on selecting a block, the Cancel
  button, Escape, or a backdrop click. No API change; the discriminated-array
  page-builder behaviour (add/reorder/duplicate/remove, per-block editing,
  click-from-preview focus) is otherwise unchanged.

## 1.12.0

### Minor Changes

- e2a6270: CollectionEdit: add an optional `renderSidebar` slot for a two-column editor
  layout.

  When `renderSidebar` is provided, the fields render in a two-column grid with
  the sidebar (status, metadata, publish controls, …) alongside; when omitted,
  the editor stays single-column exactly as before (the layout wrappers are
  `display: contents`, so existing editors are byte-for-byte unchanged).
  Forwarded through `createCollectionEditPage`. Additive — no consumer change
  required.

## 1.11.0

### Minor Changes

- 1bb9706: CollectionList: add backward-compatible presentational layout + render slots.

  - `layout: "table" | "rows" | "cards"` (default `"table"` — unchanged).
  - `renderHead` / `renderRow` for the `"rows"` layout (bespoke `.list-head` /
    `.list-row` markup — status pills, avatars, custom columns).
  - `renderCard` for the `"cards"` layout (responsive grid — galleries).
  - `renderToolbar` slot for filter chips / segmented controls.

  Custom row/card renderers receive `RowRenderHelpers` (`id`, `selectMode`,
  `selected`, `toggleSelected`, `activate`) so bespoke markup stays wired to the
  list's bulk-select + row-click. Threaded through `createCollectionListPage`.
  `ListLayout` / `RowRenderHelpers` / `BulkAction` are now exported by name.
  Additive only — existing consumers keep the default table.

## 1.10.0

### Minor Changes

- 72c7af4: Add bulk actions to collection list views. `CollectionList` gains a `bulkActions`
  prop (and a select-mode toolbar with a page-scoped "select all" and a live
  selected count); each action runs against the selected ids and clears the
  selection when it resolves. `createCollectionListPage` exposes a `bulkActions`
  option, owns the selection state, refetches after an action mutates, and drops
  the selection on page change. Exposes the new `BulkAction` type.

## 1.9.0

### Minor Changes

- 0e901b4: Clear the unsaved-changes guard after a successful save on collection edit pages.

  `CollectionEdit` now re-baselines the form (`formApi.reset`) once `onSubmit`
  resolves, so the dirty flag flips back to clean. Previously the form stayed
  dirty forever after saving — the navigation blocker (`useBlocker`) and the
  `beforeunload` prompt stayed armed even though the save succeeded. `edit.tsx`
  awaits `update.mutateAsync` so the reset runs only after the save lands; a
  failed save stays dirty so the user can retry.

  Also adds `relationshipOptions` forwarding from `createCollectionEditPage` and
  the new `ImageHotspotField`.

## 1.8.1

### Patch Changes

- 2bdae6c: Fix collection list views (`createCollectionListPage`) hanging on a stuck
  loading spinner on a hard page load. The list's `createQuery` ran during SSR,
  and TanStack Start serialized its in-flight fetch as a streamed hydration
  resource it never resolved — so a full page load never replaced the SSR
  loading fallback (a client-side navigation into the same route worked). The
  query is now client-only (`enabled: !isServer`) and SSR emits a static
  spinner, so the client fetches fresh on mount. Downstream apps no longer need
  a route-level `ssr` flag to work around this.

## 1.8.0

### Minor Changes

- 62c512a: feat: crop-editor ratio presets, circle + custom crop, and source dimensions

  `ImageHotspotField` gains aspect-ratio presets, a circle crop shape, and custom
  crop dimensions. Ratio crops use the image's source dimensions captured at
  upload; older uploads without them fall back to the manual edge inputs.

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

## 1.7.2

### Patch Changes

- 622eb69: Fix CollectionList rendering both the desktop table and the mobile card
  list at the same time. daisyUI's `.table` sets `display: table` with higher
  precedence than Tailwind's `.hidden`, so `class="table hidden md:table"`
  never actually hid the table below `md`. The `hidden md:block` now lives on
  a wrapper `<div>` (with `overflow-x-auto` so wide tables scroll), and table
  cells truncate long values (with a `title` tooltip) so one long field can't
  make a column unreadable.

## 1.7.1

### Patch Changes

- cbbccbc: Mobile-first split-pane preview: the live-preview pane in the edit-page factory
  is now a desktop (lg+) enrichment only, so phones get a full-width, edit-focused
  form instead of a collapsed-height preview iframe.

## 1.7.0

### Minor Changes

- 5d68d90: Friendlier shell touches. `CollectionList` accepts an `emptyState` slot (the
  list factory now supplies a friendly empty state with a "New …" CTA).
  `CollectionEdit` gains `draftActions.confirmPublish` — a confirmation dialog
  before publishing so content never goes live by accident.

## 1.6.0

### Minor Changes

- 3549a11: Split-pane live preview in the edit-page factory. `createCollectionEditPage`
  gains an optional `preview` ({ url, allowedOrigin }) that renders a
  `VisualEditingPane` beside the form (stacked on mobile, two-up on `lg`) and
  streams the form's values into it as the client types. `draftActions.autosave`
  is now forwarded too, so a draft-enabled collection can autosave while the
  preview updates live.

## 1.5.0

### Minor Changes

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

## 1.4.0

### Minor Changes

- fb0ddae: Autosave for draft-enabled collections. `CollectionEdit` gains opt-in
  `draftActions.autosave` (with `autosaveMs`, default 1500): while the form is
  dirty it debounce-saves the draft via `onSaveDraft` and shows a "Saving…/Saved"
  status in the action bar, so clients never lose work. The manual Save
  draft/Publish/Preview buttons are unchanged.

## 1.3.0

### Minor Changes

- af7154b: Joyful rich-text editor. `RichTextEditor` gains a persistent formatting toolbar
  (bold, italic, underline, link, H2/H3, bullet + numbered lists, quote, divider)
  and a Ghost-style `/` slash menu for inserting blocks. When the form provides
  `onUploadFile`, an image insert (toolbar + slash) uploads and embeds via
  `@tiptap/extension-image`.

## 1.2.0

### Minor Changes

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

## 1.1.1

### Patch Changes

- fieldWidgets now also match by trailing field name, so a widget (e.g. ImageHotspotField) can target a field nested inside an array item (key path `blocks.0.url`) by registering it under the bare name (`url`).

## 1.1.0

### Minor Changes

- Studio UI for Phase 4: per-field `fieldWidgets` override on CollectionEdit + a built-in `ImageHotspotField` image hotspot/crop picker (#17), and `VisualEditingPane` click-to-edit preview iframe (#15).

## 1.0.0

### Patch Changes

- a098759: Accessibility fixes for the storefront and admin UI components.

  - `CartDrawer` is now a proper modal dialog: `role="dialog"`/`aria-modal`,
    a focus trap with `Esc`-to-close and focus restoration on close, body
    scroll lock while open, and an `aria-live` region announcing cart
    contents as items change. Mirrors the existing PanelNav/SearchPalette
    focus-trap idiom.
  - `CollectionEdit` announces submit errors via `role="alert"` and colors
    the required-field marker (its accessible name is unchanged).

- Updated dependencies [1159873]
  - @thebes/cadmus@0.2.0
