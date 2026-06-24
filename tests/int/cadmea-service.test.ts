import {
  createExecutionContext,
  env,
  waitOnExecutionContext,
} from "cloudflare:test";
import { createPreviewToken } from "@core/lib/auth";
import { db } from "@thebes/cadmus/db";
import { createVersionedLocalApi } from "@thebes/cadmus/cms";
import { pages, pages_versions } from "@core/db/schema.generated";
import { beforeEach, describe, expect, it } from "vitest";
import { pagesCollection } from "../../app/cadmea.config";
import { CadmeaService } from "../../app/workers/cadmea/app/service";

// Closes the gap flagged on issue #15: CadmeaService (the Service Binding
// entrypoint Worker 1 calls cross-Worker — see app/workers/site/src/app.ts's
// /api/cadmea-test route) had only a manual `wrangler dev` + curl
// round-trip verifying it. This instantiates the real class directly
// against real local D1 instead of mocking it — the RPC wire itself
// (cross-Worker `services` binding) isn't exercised here since this pool
// only starts one Worker, but every line of logic the wire calls into is.
describe("CadmeaService", () => {
  beforeEach(async () => {
    await db(env.DB, { pages }).delete(pages);
  });

  it("creates, updates, and deletes a page", async () => {
    const ctx = createExecutionContext();
    const service = new CadmeaService(ctx, env);

    const created = await service.create("pages", {
      title: "Service Test",
      slug: `service-test-${Date.now()}`,
      status: "draft",
    });
    expect(created.status).toBe("draft");

    const updated = await service.update("pages", created.id, {
      status: "published",
    });
    expect(updated.status).toBe("published");

    const deleted = await service.deleteByID("pages", created.id);
    expect(deleted.id).toBe(created.id);

    await waitOnExecutionContext(ctx);
  });

  it("rejects an unknown collection", async () => {
    const ctx = createExecutionContext();
    const service = new CadmeaService(ctx, env);
    await expect(service.create("not-a-collection", {})).rejects.toThrow();
    await waitOnExecutionContext(ctx);
  });
});

// Closes issue #28's verification bar for getDraftVersion — the Service
// Binding RPC method Worker 1's preview route calls — against real local
// D1, the same direct-instantiation approach as the suite above.
describe("CadmeaService.getDraftVersion", () => {
  const versionedApi = createVersionedLocalApi(
    db(env.DB),
    pages,
    pages_versions,
    pagesCollection,
  );
  const writerCtx = { session: { userId: 1, email: "owner@example.com", role: "owner" as const, createdAt: Date.now() } };

  beforeEach(async () => {
    await db(env.DB, { pages, pages_versions }).delete(pages_versions);
    await db(env.DB, { pages, pages_versions }).delete(pages);
  });

  it("resolves a valid token to the draft's versionData", async () => {
    const created = await versionedApi.create(writerCtx, {
      title: "Home",
      slug: `preview-${Date.now()}`,
      status: "draft",
    });
    const draft = await versionedApi.saveDraft(writerCtx, created.id, {
      title: "Home (draft edit)",
    });
    const { token } = await createPreviewToken(
      env.SESSION_SECRET,
      created.id,
      draft.id,
    );

    const ctx = createExecutionContext();
    const service = new CadmeaService(ctx, env);
    const versionData = await service.getDraftVersion("pages", token);
    // The SEO plugin's metaTitle hook (app/cadmea.config.ts) defaults
    // metaTitle from title on beforeChange — saveDraft runs through that
    // same hook, so it's present here too, not just on a real create.
    expect(versionData).toEqual({
      title: "Home (draft edit)",
      metaTitle: "Home (draft edit)",
    });
    await waitOnExecutionContext(ctx);
  });

  it("returns null for a token with an invalid signature", async () => {
    const { token } = await createPreviewToken("wrong-secret", 1, 2);
    const ctx = createExecutionContext();
    const service = new CadmeaService(ctx, env);
    expect(await service.getDraftVersion("pages", token)).toBeNull();
    await waitOnExecutionContext(ctx);
  });

  it("returns null when the version id doesn't exist", async () => {
    const created = await versionedApi.create(writerCtx, {
      title: "Home",
      slug: `preview-missing-${Date.now()}`,
      status: "draft",
    });
    const { token } = await createPreviewToken(
      env.SESSION_SECRET,
      created.id,
      999999,
    );
    const ctx = createExecutionContext();
    const service = new CadmeaService(ctx, env);
    expect(await service.getDraftVersion("pages", token)).toBeNull();
    await waitOnExecutionContext(ctx);
  });
});
