---
"@thebes/cadmea": patch
---

Fix CollectionList rendering both the desktop table and the mobile card
list at the same time. daisyUI's `.table` sets `display: table` with higher
precedence than Tailwind's `.hidden`, so `class="table hidden md:table"`
never actually hid the table below `md`. The `hidden md:block` now lives on
a wrapper `<div>` (with `overflow-x-auto` so wide tables scroll), and table
cells truncate long values (with a `title` tooltip) so one long field can't
make a column unreadable.
