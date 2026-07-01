---
"@thebes/cadmea": minor
---

cadmea: SearchPalette — grouped results, icons, and status/type badges (studio redesign)

The ⌘K `SearchPalette` was a flat list of `label + collection`. It now supports the richer studio-redesign design, all additive/backward-compatible:

- `grouped` — render results under per-collection section headers (monospace kickers) instead of a flat list; keyboard nav still runs over the flat order.
- `SearchPaletteResult.icon` (Phosphor class) + `collectionIcon(collection)` fallback — a leading icon per row.
- `SearchPaletteResult.meta` (`{ label, tone }`) — a right-aligned status ("Available"/"Sold") or type ("JPG"/"PDF") badge; `tone` colors it (positive/negative/muted) via themeable CSS vars.
- `collectionLabel(collection)` — humanize the group header / flat-list tag.
- `placeholder` — customize the input placeholder.

Also fixes an a11y bug: the backdrop container carried `aria-hidden="true"`, which hid the entire modal (dialog + focused input) from assistive tech — removed.
