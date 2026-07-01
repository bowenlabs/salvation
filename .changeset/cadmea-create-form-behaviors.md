---
"@thebes/cadmea": minor
"@thebes/cadmus": minor
---

cadmea: create-form field behaviors — `admin.defaultFrom` + `admin.appendOnCreate` (#98)

Adds two declarative, create-form-only field behaviors so consuming sites can build "template-driven" create flows without owning a bespoke route (immediate consumer: the Portfolio page template, bowenlabs/themidwestartist.com#8):

- **`admin.defaultFrom`** (`@thebes/cadmus` `FieldAdminConfig`) — reactively seed a field from another field's value, e.g. default a page `title` from the chosen `category`. For a `relationship` source the selected option's `label` is resolved and passed to an optional `map`; when omitted the field defaults to `label ?? value`. Overridable — a value the user has typed is never clobbered, but switching the source still updates an untouched target.
- **`admin.appendOnCreate`** (array fields) — when creating a new row and `when(values)` holds, append `item(values)` to the array before submit, e.g. auto-insert a `portfolioGallery` block bound to the chosen category into `blocks`. Runs once at submit; never on edit.

Both are applied by `CollectionEdit` only in create mode (`operation === "create"`); the edit form keeps its real data. Field-level `admin.condition` visibility (the other half of #98) already shipped. No schema or Local API changes.
