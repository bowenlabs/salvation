---
"@thebes/cadmus": minor
---

Add framework-owned `site_settings` to `@thebes/cadmus/db` — `siteSettingsColumns` (the generic identity/appearance/structural-color/contact/nav/SEO/domain/feature-toggle column set) plus a ready-made `siteSettings` singleton table (`id = 1` enforced). Sites compose or use it directly instead of hand-rolling the table, so it stops drifting between clients. It's byte-identical to the current hand-rolled shape, so adopting it produces no spurious migration. First safe slice of the pt#83 migrations-composition work (Direction B — see DECISIONS.md); also pins `generateSchemaSource` determinism with tests.
