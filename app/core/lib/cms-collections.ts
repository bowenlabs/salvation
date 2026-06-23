// Collection registry shared by every consumer that mounts a Local API
// against this app's collections — the Service Binding RPC
// (app/workers/cadmea/app/service.ts) and the public REST API
// (app/workers/cadmea/app/server.ts's mountCmsRoutes call) both need the
// exact same `{ slug: LocalApi }` shape, so it's built once here instead
// of twice. Only `pages` exists today; add entries here as new
// collections land.
import { createLocalApi, type LocalApi } from "@thebes/cadmus/cms";
import { db } from "@thebes/cadmus/db";
import { pagesCollection } from "../../cadmea.config.js";
import { pages } from "../db/schema.generated";
import { cmsRegistry } from "./cms-registry.js";

// biome-ignore lint/suspicious/noExplicitAny: each collection's LocalApi is typed to its own table; the registry is necessarily generic across all of them
export function createCmsCollections(env: Env): Record<string, LocalApi<any>> {
  return {
    pages: createLocalApi(db(env.DB), pages, pagesCollection, cmsRegistry),
  };
}
