import { createCmsCollections } from "@core/lib/cms-collections";
import { createServerFn } from "@tanstack/solid-start";
import { getCollectionsMeta } from "@thebes/cadmus/cms";
import { cadmeaConfig } from "../../../../cadmea.config.js";
import { requireAuthOrThrow } from "../../app/middleware.js";

export interface SearchResult {
  collection: string;
  id: number;
  /** First text-ish field on the matched row — good enough for a Cmd+K result label. */
  label: string;
}

// Drives the admin panel's Cmd+K search palette (issue #29). Runs
// LocalApi.search() against every collection that opted into `search` in
// cadmea.config.ts (today, just `pages`) — adding a new searchable
// collection to the config is all that's needed for it to show up here,
// no server-function changes required. A short/empty query is a no-op
// rather than a query against every collection's FTS5 table with an
// empty MATCH string (which FTS5 itself would reject).
export const searchCollections = createServerFn({ method: "GET" })
  .validator((query: string) => query)
  .handler(async ({ data: query }) => {
    const session = await requireAuthOrThrow();
    const trimmed = query.trim();
    if (trimmed.length < 2) return [];

    const { env } = await import("cloudflare:workers");
    const collections = createCmsCollections(env);
    const searchable = getCollectionsMeta(cadmeaConfig).filter(
      (meta) => meta.searchable,
    );

    const resultsPerCollection = await Promise.all(
      searchable.map(async (meta) => {
        const api = collections[meta.slug];
        if (!api) return [];
        const rows = await api.search({ session }, trimmed, { limit: 5 });
        return rows.map((row) => {
          const record = row as Record<string, unknown>;
          const label =
            typeof record.title === "string"
              ? record.title
              : typeof record.slug === "string"
                ? record.slug
                : `${meta.slug} #${record.id}`;
          return {
            collection: meta.slug,
            id: record.id as number,
            label,
          };
        });
      }),
    );

    return resultsPerCollection.flat();
  });
