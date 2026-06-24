import { WorkerEntrypoint } from "cloudflare:workers";
import { verifyPreviewToken } from "@core/lib/auth";
import {
  createCmsCollections,
  createVersionedCmsCollections,
} from "@core/lib/cms-collections";
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

  // Worker 1's preview route (app/workers/site/src/api.ts, issue #28) calls
  // this to resolve a signed preview token into the draft snapshot it
  // points at — never a real session, so this goes through the same
  // internalContext path as the write methods above. Returns null for an
  // invalid/expired token or a version that's vanished, rather than
  // throwing — the caller turns that into a 403, not a 500.
  async getDraftVersion(
    collection: string,
    token: string,
  ): Promise<Record<string, unknown> | null> {
    const verified = await verifyPreviewToken(this.env.SESSION_SECRET, token);
    if (!verified) return null;

    const versioned = createVersionedCmsCollections(this.env)[collection];
    if (!versioned) {
      throw new CadmusCmsError(`Unknown versioned collection "${collection}"`);
    }

    const versions = await versioned.findVersions(
      this.internalContext,
      verified.parentId,
    );
    const version = versions.find((v) => v.id === verified.versionId);
    if (!version) return null;

    return version.versionData as Record<string, unknown>;
  }
}
