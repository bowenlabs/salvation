---
"@thebes/cadmea": minor
---

Add bulk actions to collection list views. `CollectionList` gains a `bulkActions`
prop (and a select-mode toolbar with a page-scoped "select all" and a live
selected count); each action runs against the selected ids and clears the
selection when it resolves. `createCollectionListPage` exposes a `bulkActions`
option, owns the selection state, refetches after an action mutates, and drops
the selection on page change. Exposes the new `BulkAction` type.
