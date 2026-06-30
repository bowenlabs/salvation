---
"@thebes/cadmea": minor
---

CollectionEdit: add an optional `renderSidebar` slot for a two-column editor
layout.

When `renderSidebar` is provided, the fields render in a two-column grid with
the sidebar (status, metadata, publish controls, …) alongside; when omitted,
the editor stays single-column exactly as before (the layout wrappers are
`display: contents`, so existing editors are byte-for-byte unchanged).
Forwarded through `createCollectionEditPage`. Additive — no consumer change
required.
