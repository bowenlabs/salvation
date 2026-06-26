---
"@thebes/cadmea": minor
"@thebes/cadmus": patch
---

Friendlier, schema-driven CMS editor.

**@thebes/cadmus** — add an optional `admin` block to every field
(`FieldAdminConfig`: `label`, `description`, `placeholder`, `group`, `width`,
`condition`, `readOnly`) and optional per-variant `discriminator.variantsAdmin`
(`label`, `icon`) for the block picker. All additive and backwards-compatible.

**@thebes/cadmea** — `CollectionEdit`/`CollectionList` now build on TanStack
Form/Table. The editor renders humanized labels, help text, grouped fieldsets,
responsive half-width fields, conditional fields, and inline validation wired to
the existing `ValidationBuilder`; relationship fields are a searchable combobox
with `hasMany` multi-select; discriminated `array` fields become a visual block
builder (typed block picker, reorder, duplicate, collapse). Public props are
unchanged.
