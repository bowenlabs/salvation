---
"@thebes/cadmea-plugin-crm": minor
---

`createContactUpsertHook` gains two optional callbacks so a form-created contact and its activity carry real detail: `mapContactFields(doc)` copies extra fields (name, company, phone, …) onto a **newly-created** contact — applied only on create, so it never clobbers an existing contact, and `email`/`lastActivityAt` stay authoritative; `buildActivityMetadata(doc)` sets the logged activity's `metadata` (e.g. subject, message excerpt, source record id) instead of a bare `{ type }`. Both default off — existing behavior is unchanged.
