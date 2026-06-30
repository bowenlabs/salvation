---
"@thebes/cadmea": patch
---

CollectionEdit block builder: the "Add block" type picker is now a modal grid
of variant cards (icon + label) instead of an inline dropdown menu — matching
the Studio Prototype's block picker. It closes on selecting a block, the Cancel
button, Escape, or a backdrop click. No API change; the discriminated-array
page-builder behaviour (add/reorder/duplicate/remove, per-block editing,
click-from-preview focus) is otherwise unchanged.
