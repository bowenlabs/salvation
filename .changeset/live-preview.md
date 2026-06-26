---
"@thebes/cadmea": minor
"@thebes/cadmus": patch
---

As-you-type live preview primitives (Workstream D).

**@thebes/cadmus** — new preview-sync channel (the reverse of click-to-edit):
`mountPreviewSync({ collection, id })` on a preview page applies incoming
field values to tagged `[data-cadmus-edit]` text regions; `applyPreviewValues`
is the pure patcher; `PREVIEW_VALUES_MESSAGE`/`PreviewValuesMessage` are the
postMessage contract.

**@thebes/cadmea** — `VisualEditingPane` gains `previewValues` + `previewTarget`
and posts them into the iframe on change; `CollectionEdit` gains `onValuesChange`
(fires the current editable values on every edit) so a side-by-side editor can
drive a live preview.
