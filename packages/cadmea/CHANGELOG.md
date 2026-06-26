# @thebes/cadmea

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
