import {
  createExecutionContext,
  env,
  waitOnExecutionContext,
} from "cloudflare:test";
import { db } from "@bowenlabs/cadmus/db";
import { pages } from "@core/db/schema.generated";
import { mountPublicCmsApi } from "@core/lib/cms-api";
import { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";

// Closes the verification gap on issue #23 (Phase 3 — Public REST API):
// the CORS posture (permissive on GET, same-origin-only on writes) is
// transport-level behavior that only shows up against a real Hono
// request/response cycle, not unit-testable against fakes the way
// packages/cadmus/src/hono/cms.test.ts covers resolveContext/status-code
// mapping. Runs against real local D1/KV (no mocks — see CLAUDE.md's
// testing row), the same bar every other test in this directory holds to.
// `mountPublicCmsApi` lives in app/core/lib/cms-api.ts specifically so it
// can be imported here without pulling in server.ts's
// `@tanstack/solid-start/server-entry`, which this pool can't build.
function buildApp(getSession: Parameters<typeof mountPublicCmsApi>[1]["getSession"]) {
  const app = new Hono<{ Bindings: Env }>();
  mountPublicCmsApi(app, { getSession });
  return app;
}

describe("mountPublicCmsApi CORS", () => {
  beforeEach(async () => {
    await db(env.DB, { pages }).delete(pages);
  });

  it("reflects the request's Origin on a GET (pages' `read` access allows anonymous reads)", async () => {
    const app = buildApp(async () => null);
    const ctx = createExecutionContext();
    const res = await app.request(
      "/api/pages",
      { headers: { origin: "https://example.com" } },
      env,
      ctx,
    );
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://example.com",
    );
    expect(res.status).toBe(200);
    await waitOnExecutionContext(ctx);
  });

  it("omits Access-Control-Allow-Origin on a cross-origin POST (writes are same-origin only)", async () => {
    const app = buildApp(async () => null);
    const ctx = createExecutionContext();
    const res = await app.request(
      "/api/pages",
      {
        method: "POST",
        headers: {
          origin: "https://example.com",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: "X", slug: "x" }),
      },
      env,
      ctx,
    );
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
    // pagesCollection's `create` access rule also requires a session —
    // absent here regardless, so the request is rejected on top of the
    // missing CORS header. Either way, no cross-origin write succeeds.
    expect(res.status).toBe(403);
    await waitOnExecutionContext(ctx);
  });

  it("rate-limits anonymous GETs by IP and returns 429 once the limit is exhausted", async () => {
    const app = buildApp(async () => null);
    let lastStatus = 200;
    for (let i = 0; i < 121; i++) {
      const ctx = createExecutionContext();
      const res = await app.request(
        "/api/pages",
        { headers: { "cf-connecting-ip": "203.0.113.5" } },
        env,
        ctx,
      );
      lastStatus = res.status;
      await waitOnExecutionContext(ctx);
    }
    expect(lastStatus).toBe(429);
  });
});
