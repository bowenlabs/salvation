// Built once from the resolved (post-plugin) collections array — every
// Local API call site that wants `depth: 1` relationship resolution (see
// @thebes/cadmus/cms's localApi.ts `resolveRelationships`) passes this
// in rather than constructing its own registry. Tables come from the
// generated schema — the real, migrated Drizzle table objects every other
// Local API factory in this app already reads from (see core/lib/db.ts) —
// not a freshly-built `collectionToTable()`, so this never drifts from
// what's actually live in D1.
import type { CmsRegistry } from "@thebes/cadmus/cms";
import { cadmeaConfig } from "../../cadmea.config.js";
import * as schema from "../db/schema.generated";

const generatedTables = schema as Record<string, CmsRegistry["tables"][string]>;

export const cmsRegistry: CmsRegistry = {
  tables: Object.fromEntries(
    cadmeaConfig.collections.map((collection) => [
      collection.slug,
      generatedTables[collection.slug],
    ]),
  ),
  configs: Object.fromEntries(
    cadmeaConfig.collections.map((collection) => [collection.slug, collection]),
  ),
};
