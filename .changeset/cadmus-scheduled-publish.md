---
"@thebes/cadmus": minor
---

Add scheduled publishing to versioned collections. The generated
`${slug}_versions` table gains a nullable `scheduled_at` column (codegen +
schema-gen), and `VersionedLocalApi` gains `scheduleDraft(ctx, id, input, when)`
(saves a draft stamped with a future publish time) and `publishScheduled(ctx,
now?)` (publishes every still-draft version due at/before `now`, oldest-first,
clearing each schedule). Intended to be driven by a scheduled worker (e.g. a
Cloudflare cron trigger). Consumers with `versions.drafts` collections will need
a migration adding the `scheduled_at` column.
