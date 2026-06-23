import { env } from "cloudflare:test";
import { createLocalApi, createVersionedLocalApi } from "@thebes/cadmus/cms";
import { db } from "@thebes/cadmus/db";
import { pagesCollection } from "../../app/cadmea.config";
import { pages, pages_versions } from "@core/db/schema.generated";
import { beforeEach, describe, expect, it } from "vitest";

// Closes the coverage gap flagged on issue #15: app/cadmea.config.ts's
// pagesCollection and app/core/db/schema.generated.ts (the generated
// Drizzle schema the Local API is built against) had zero automated
// coverage — only a manual `wrangler dev` + curl round-trip via the
// CmsService Service Binding (see app/workers/site/src/app.ts's
// /api/cadmea-test route). This exercises the same create/update/delete
// path the Service Binding wraps, directly, against real local D1.
describe("pages Local API (app wiring)", () => {
  const localApi = createLocalApi(db(env.DB), pages, pagesCollection);

  beforeEach(async () => {
    await db(env.DB, { pages }).delete(pages);
  });

  // pagesCollection's access rules (app/cadmea.config.ts) allow `read`
  // unconditionally but require a non-null session for writes. This suite
  // isn't exercising access control, just the generated-schema wiring, so
  // a fixed authenticated-looking context is used throughout rather than
  // varying it per call.
  const ctx = { session: { userId: 1, email: "test@example.com", role: "owner", createdAt: Date.now() } };

  it("creates, updates, and deletes a page through the generated schema", async () => {
    const created = await localApi.create(ctx, {
      title: "Integration Test Page",
      slug: `int-test-${Date.now()}`,
      status: "draft",
    });
    expect(created.id).toBeDefined();
    expect(created.status).toBe("draft");

    const updated = await localApi.update(ctx, created.id, {
      status: "published",
    });
    expect(updated.status).toBe("published");

    const found = await localApi.findByID(ctx, created.id);
    expect(found.title).toBe("Integration Test Page");

    const deleted = await localApi.deleteByID(ctx, created.id);
    expect(deleted.id).toBe(created.id);
    await expect(localApi.findByID(ctx, created.id)).rejects.toThrow();
  });

  it("rejects a duplicate slug via the real unique constraint", async () => {
    const slug = `dup-${Date.now()}`;
    await localApi.create(ctx, { title: "First", slug, status: "draft" });
    await expect(
      localApi.create(ctx, { title: "Second", slug, status: "draft" }),
    ).rejects.toThrow();
  });

  // Closes issue #25's verification bar for getPages (server-functions/
  // pages.ts) passing limit/offset through to the real Local API — same
  // rationale as this file's other tests: exercise the Local API call
  // getPages wraps, directly against real local D1, rather than the
  // server-function wrapper itself (which needs request/session context
  // this pool doesn't provide).
  it("paginates and counts pages through the generated schema", async () => {
    await localApi.create(ctx, { title: "A", slug: `page-a-${Date.now()}` });
    await localApi.create(ctx, { title: "B", slug: `page-b-${Date.now()}` });
    await localApi.create(ctx, { title: "C", slug: `page-c-${Date.now()}` });

    expect(await localApi.count(ctx)).toBe(3);

    const page1 = await localApi.find(ctx, { limit: 2, offset: 0 });
    expect(page1).toHaveLength(2);
    const page2 = await localApi.find(ctx, { limit: 2, offset: 2 });
    expect(page2).toHaveLength(1);
  });

  it("round-trips the blocks JSON column", async () => {
    const blocks = [
      { type: "hero", heading: "Welcome" },
      { type: "divider" },
    ];
    const created = await localApi.create(ctx, {
      title: "Blocks Page",
      slug: `blocks-${Date.now()}`,
      status: "published",
      blocks,
    });
    const found = await localApi.findByID(ctx, created.id);
    expect(found.blocks).toEqual(blocks);
  });
});

// Closes the same coverage gap as above, specifically for
// createVersionedLocalApi against the real generated `pages_versions`
// table and migration (app/core/db/migrations) — not just the in-memory
// fixture covered by packages/cadmus/src/cms/localApi.test.ts.
describe("pages versioned Local API (app wiring)", () => {
  const versionedApi = createVersionedLocalApi(
    db(env.DB),
    pages,
    pages_versions,
    pagesCollection,
  );

  const ctx = {
    session: {
      userId: 1,
      email: "test@example.com",
      role: "owner",
      createdAt: Date.now(),
    },
  };

  beforeEach(async () => {
    await db(env.DB, { pages, pages_versions }).delete(pages_versions);
    await db(env.DB, { pages, pages_versions }).delete(pages);
  });

  it("saves a draft, then publishes it onto the real pages table", async () => {
    const slug = `versioned-${Date.now()}`;
    const created = await versionedApi.create(ctx, {
      title: "Home",
      slug,
      status: "draft",
    });

    // publish() validates the version's data the same way create/update
    // do, so the draft must carry every required field — slug included.
    const draft = await versionedApi.saveDraft(ctx, created.id, {
      title: "Home (edited)",
      slug,
    });
    expect(draft.status).toBe("draft");

    const published = await versionedApi.publish(ctx, draft.id);
    expect(published.publishedVersionId).toBe(draft.id);
    expect(published.title).toBe("Home (edited)");

    const versions = await versionedApi.findVersions(ctx, created.id);
    expect(versions[0]?.status).toBe("published");
  });
});
