// Copyright (c) 2026 BowenLabs. All rights reserved.
// Cadmus is MIT licensed. See LICENSE in the repo root.
//
// @thebes/cadmus/migrations
//
// Migration composition for Direction B (see project-thebes DECISIONS.md,
// 2026-06-30): plugins and cadmus core ship their own versioned migration sets;
// a consuming site merges them with its own site-owned migrations into one
// deterministically-ordered set applied on the single D1.
//
// `composeMigrations` is the pure heart of that merge — it takes ordered
// migration *sources* (cadmus core, each plugin, the site) and emits
// wrangler-ready `NNNNNNN_<namespace>__<id>.sql` files. The numeric prefix is
// `source.order + index`, so every source occupies a reserved band with gaps:
// adding a migration to one source, or introducing a new source, never
// renumbers another source's files. That stability is what keeps
// wrangler's filename-tracked idempotency correct — an already-applied
// migration keeps its exact name and is skipped on the next apply.

/** One migration shipped by a source: a stable id and its SQL. */
export interface PluginMigration {
  /**
   * Stable, human-readable id unique within its source (e.g. `"baseline"`,
   * `"add_variants"`). It becomes part of the composed filename, so — like the
   * SQL itself — it must never change once shipped, or a re-apply would treat it
   * as a new migration.
   */
  id: string;
  /** The migration SQL (one or more statements). */
  sql: string;
}

/** A migration set contributed by cadmus core, a plugin, or the site. */
export interface MigrationSource {
  /**
   * Filename namespace, e.g. `"cadmus"`, `"ecommerce"`, `"site"`. Distinguishes
   * whose migration a file is, so provenance is legible in the migrations dir.
   */
  namespace: string;
  /**
   * Reserved-band start for this source's filename prefixes. Allocate values
   * with large gaps (e.g. cadmus `0`, plugins `1000`, `2000`, …, site
   * `1_000_000`) so a source can add migrations — and new sources can appear —
   * without renumbering any other source. A source must not ship more
   * migrations than the gap to the next source's `order`.
   */
  order: number;
  /** This source's migrations, in the order they must apply. */
  migrations: PluginMigration[];
}

/** A composed, wrangler-ready migration file. */
export interface ComposedMigration {
  /** Filename, e.g. `0001000_ecommerce__baseline.sql`. */
  filename: string;
  /** The migration SQL, unchanged from the source. */
  sql: string;
}

// Zero-padding width for the numeric prefix. 7 digits covers reserved bands up
// to 9,999,999 — comfortably past a site band at 1,000,000.
const PREFIX_WIDTH = 7;

function assertNamespace(namespace: string): void {
  if (!/^[a-z0-9-]+$/.test(namespace)) {
    throw new Error(
      `migration source namespace must be lowercase [a-z0-9-]: "${namespace}"`,
    );
  }
}

/**
 * Merges migration sources into a single, deterministically-ordered list of
 * wrangler-ready migration files. Sources are applied in ascending `order`;
 * within a source, in array order. Filenames are stable across recomposes as
 * long as each source's `order` and its migrations' `id`s don't change — so
 * `wrangler d1 migrations apply` re-runs only genuinely new migrations.
 *
 * Throws on a namespace with illegal characters or on two migrations that
 * collide onto the same filename (a sign two sources' reserved bands overlap).
 */
export function composeMigrations(
  sources: MigrationSource[],
): ComposedMigration[] {
  const composed: ComposedMigration[] = [];
  const seenFilenames = new Set<string>();
  const ordered = [...sources].sort((a, b) => a.order - b.order);

  for (const source of ordered) {
    assertNamespace(source.namespace);
    const seenIds = new Set<string>();
    source.migrations.forEach((migration, index) => {
      if (seenIds.has(migration.id)) {
        throw new Error(
          `duplicate migration id "${migration.id}" in source "${source.namespace}"`,
        );
      }
      seenIds.add(migration.id);

      const seq = source.order + index;
      const filename = `${String(seq).padStart(PREFIX_WIDTH, "0")}_${source.namespace}__${migration.id}.sql`;
      if (seenFilenames.has(filename)) {
        throw new Error(
          `composed migration filename collision: "${filename}" — two sources' reserved bands (order) overlap`,
        );
      }
      seenFilenames.add(filename);
      composed.push({ filename, sql: migration.sql });
    });
  }

  return composed;
}
