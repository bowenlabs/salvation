---
"@thebes/cadmus": minor
"@thebes/cadmea": minor
---

feat: per-block click-to-edit visual editing (#15)

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
