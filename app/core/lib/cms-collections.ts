// Collection registry shared by every consumer that mounts a Local API
// against this app's collections — the Service Binding RPC
// (app/workers/cadmea/app/service.ts) and the public REST API
// (app/workers/cadmea/app/server.ts's mountCmsRoutes call) both need the
// exact same `{ slug: LocalApi }` shape, so it's built once here instead
// of twice. Only `pages` exists today; add entries here as new
// collections land.
import {
  createLocalApi,
  createVersionedLocalApi,
  type LocalApi,
  type VersionedLocalApi,
} from "@thebes/cadmus/cms";
import { db } from "@thebes/cadmus/db";
import { pagesCollection } from "../../cadmea.config.js";
import { pages, pages_versions } from "../db/schema.generated";
import { cmsRegistry } from "./cms-registry.js";

// biome-ignore lint/suspicious/noExplicitAny: each collection's LocalApi is typed to its own table; the registry is necessarily generic across all of them
export function createCmsCollections(env: Env): Record<string, LocalApi<any>> {
  return {
    pages: createLocalApi(db(env.DB), pages, pagesCollection, cmsRegistry),
  };
}

// Collections with `versions.drafts: true` — only `pages` today. Kept as a
// separate registry rather than folded into createCmsCollections above
// because VersionedLocalApi is its own interface (see
// createVersionedLocalApi's doc in packages/cadmus/src/cms/localApi.ts),
// not every collection has a `_versions` companion table to back it. Used
// by CadmeaService.getDraftVersion (issue #28's live preview) and the
// admin server functions' saveDraft/publish/unpublish.
export function createVersionedCmsCollections(
  env: Env,
  // biome-ignore lint/suspicious/noExplicitAny: see createCmsCollections above
): Record<string, VersionedLocalApi<any, any>> {
  return {
    pages: createVersionedLocalApi(
      db(env.DB),
      pages,
      pages_versions,
      pagesCollection,
      cmsRegistry,
    ),
  };
}
