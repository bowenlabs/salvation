---
"@thebes/cadmus": minor
---

Add `@thebes/cadmus/migrations` — `composeMigrations(sources)`, the deterministic core of Direction B (see DECISIONS.md). It merges ordered migration sources (cadmus core, each plugin, the site) into wrangler-ready `NNNNNNN_<namespace>__<id>.sql` files, where the numeric prefix is `order + index` so every source occupies a reserved band with gaps — adding a migration to one source, or introducing a new source, never renumbers another's files (keeping wrangler's filename-tracked idempotency correct). Also adds an `exclude` option to `generateSchemaSource(config, { exclude })` so a site can omit plugin-owned collections from its drizzle-kit diff (plugin tables then come from the plugin's shipped migrations, not the site's diff). Pure/tested building blocks; the per-plugin migration SQL and the site `db:generate` wiring are the follow-on consumption steps.
