---
"@thebes/cadmea": minor
---

Clear the unsaved-changes guard after a successful save on collection edit pages.

`CollectionEdit` now re-baselines the form (`formApi.reset`) once `onSubmit`
resolves, so the dirty flag flips back to clean. Previously the form stayed
dirty forever after saving — the navigation blocker (`useBlocker`) and the
`beforeunload` prompt stayed armed even though the save succeeded. `edit.tsx`
awaits `update.mutateAsync` so the reset runs only after the save lands; a
failed save stays dirty so the user can retry.

Also adds `relationshipOptions` forwarding from `createCollectionEditPage` and
the new `ImageHotspotField`.
