---
"@thebes/cadmea": minor
---

CollectionList: add backward-compatible presentational layout + render slots.

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
