import { WorkerEntrypoint } from "cloudflare:workers";
import { createCmsCollections } from "@core/lib/cms-collections";
import { CadmusCmsError } from "@thebes/cadmus";

// Exposes the write-with-CMS-logic path for Worker 1 (Astro/site) via a
// Service Binding (Worker-to-Worker RPC, no fetch/HTTP overhead) — per
// issue #16's 2026-06-20 comment. Reads never go through this; Astro
// calls the Local API directly against its own D1 binding for those.
export class CadmeaService extends WorkerEntrypoint<Env> {
  private api(collection: string) {
    const api = createCmsCollections(this.env)[collection];
    if (!api) throw new CadmusCmsError(`Unknown collection "${collection}"`);
    return api;
  }

  // This RPC is only reachable via a Cloudflare Service Binding (Worker 1
  // calling Worker 2), never directly from the internet — see the class
  // comment above. It's a trusted internal caller, not an end user, so it
  // passes `{ session: null, internal: true }` rather than a real session.
  // `app/cadmea.config.ts`'s access rules check `internal === true` to
  // allow this path through alongside session-authenticated admin writes.
  private get internalContext() {
    return { session: null, internal: true as const };
  }

  async create(collection: string, input: Record<string, unknown>) {
    // biome-ignore lint/suspicious/noExplicitAny: RPC boundary accepts a plain object; the Local API's own validation enforces the real shape
    return this.api(collection).create(this.internalContext, input as any);
  }

  async update(collection: string, id: number, input: Record<string, unknown>) {
    // biome-ignore lint/suspicious/noExplicitAny: see create() above
    return this.api(collection).update(this.internalContext, id, input as any);
  }

  async deleteByID(collection: string, id: number) {
    return this.api(collection).deleteByID(this.internalContext, id);
  }
}
