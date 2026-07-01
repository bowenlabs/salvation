---
"@thebes/cadmea": minor
---

Editor chrome slots for `CollectionEdit` / `createCollectionEditPage`, so a
consuming studio can render a bespoke editor shell 1:1 to a design while keeping
the framework's form state, validation, drafts, autosave, and block builder:

- **`renderHeader(api)`** — a custom top action bar (breadcrumb + Save/Publish/…)
  built from an `EditActionsApi` (`values`, `dirty`, `save`, `saving`, `canSave`,
  a `draft` sub-API, and `remove`). When provided, the default bottom action bar
  is suppressed, and the page factory drops its default `<h1>` heading + Delete
  button (the header owns them, incl. delete via the actions API).
- **Form-aware `renderSidebar(api)`** — now receives an `EditSidebarApi`
  (`values` + `setValue`) so the rail can render editable controls wired to the
  same form (a bare `() => JSX` still works). Paired with **`sidebarFields`** to
  move specific fields out of the main column into the rail.
- **`collapseBlocksByDefault`** — start discriminated `array` (block) fields
  collapsed to a one-line outline; plus a per-variant icon tile in each block row
  (from `discriminator.variantsAdmin[variant].icon`).
- **`onDelete`** — wire a delete action into the header's `EditActionsApi.remove`.
- Fix: the page factory now forwards `draftActions.confirmPublish` to
  `CollectionEdit` (previously dropped, so the publish-confirm dialog never showed).

List additions (same studio-1:1 effort):

- **Toolbar filters** — `createCollectionListPage`'s `renderToolbar` now receives
  a `ListToolbarApi` (`filter`, `setFilter`), and `CollectionListQueryParams`
  gains `filter?: string`, so a route can render All/Active/Draft chips that
  drive the server query (setting a filter resets to page 1 and clears the
  selection). A bare `() => JSX` toolbar still works.
- **Range pagination label** — when `totalCount` is known, the pagination bar's
  center label reads `1–20 of 24` instead of `Page 1`.

All additive — existing single-column/table consumers are unaffected.
