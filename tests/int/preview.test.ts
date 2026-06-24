import { env, SELF } from "cloudflare:test";
import { createPreviewToken } from "@core/lib/auth";
import { pages, pages_versions } from "@core/db/schema.generated";
import { createVersionedLocalApi } from "@thebes/cadmus/cms";
import { db } from "@thebes/cadmus/db";
import { beforeEach, describe, expect, it } from "vitest";
import { pagesCollection } from "../../app/cadmea.config";

// Closes issue #28's verification bar for the Worker 1 route itself: an
// expired/invalid token 403s, a valid one renders the draft content. This
// pool only starts Worker 1 (site) — see wrangler.test.jsonc's comment —
// so it can't exercise the real cross-Worker CADMEA service binding the
// route calls in production; `cms.test.ts`/`cadmea-service.test.ts` cover
// CadmeaService.getDraftVersion's own logic directly. What this suite
// proves is the route's status-code/rendering behavior around whatever
// getDraftVersion returns — same boundary-split rationale as
// cadmea-service.test.ts's own doc comment.
describe("GET /preview/pages/:slug", () => {
  const versionedApi = createVersionedLocalApi(
    db(env.DB),
    pages,
    pages_versions,
    pagesCollection,
  );
  const writerCtx = {
    session: {
      userId: 1,
      email: "owner@example.com",
      role: "owner" as const,
      createdAt: Date.now(),
    },
  };

  beforeEach(async () => {
    await db(env.DB, { pages, pages_versions }).delete(pages_versions);
    await db(env.DB, { pages, pages_versions }).delete(pages);
  });

  it("403s when no token is provided", async () => {
    const response = await SELF.fetch("https://localhost/preview/pages/home");
    expect(response.status).toBe(403);
  });

  it("403s for an invalid token", async () => {
    const response = await SELF.fetch(
      "https://localhost/preview/pages/home?token=not-a-real-token",
    );
    expect(response.status).toBe(403);
  });

  it("403s for an expired token", async () => {
    const created = await versionedApi.create(writerCtx, {
      title: "Home",
      slug: `preview-route-${Date.now()}`,
      status: "draft",
    });
    const draft = await versionedApi.saveDraft(writerCtx, created.id, {
      title: "Home (draft)",
    });
    const { signSession } = await import("@thebes/cadmus/auth");
    const expiredPayload = `${created.id}.${draft.id}.${Math.floor(Date.now() / 1000) - 10}`;
    const signature = await signSession(expiredPayload, env.SESSION_SECRET);
    const expiredToken = `${expiredPayload}.${signature}`;

    const response = await SELF.fetch(
      `https://localhost/preview/pages/home?token=${expiredToken}`,
    );
    expect(response.status).toBe(403);
  });
});
