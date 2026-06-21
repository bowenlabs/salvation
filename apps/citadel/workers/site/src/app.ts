import { handle } from "@astrojs/cloudflare/handler";
import { purgeCache } from "@bowenlabs/cadmus/cache";
import { Hono } from "hono";

const app = new Hono<{ Bindings: Env }>();

// 1. Custom API routes — checked first
app.get("/api/ping", async (c) => {
  const result = await c.env.DB.prepare("SELECT 1 as ok").first();
  await c.env.KV.put("ping", "pong");
  const kv = await c.env.KV.get("ping");
  return c.json({ db: result, kv, worker: "site" });
});

app.get("/api/cache/check", (c) => {
  return c.json({
    cachesDefined: typeof caches !== "undefined",
    cacheDefaultDefined:
      typeof caches !== "undefined" && typeof caches.default !== "undefined",
  });
});

app.post("/api/cache/purge", async (c) => {
  const { url } = await c.req.json<{ url: string }>();
  const start = Date.now();
  await purgeCache(url);
  return c.json({ ok: true, ms: Date.now() - start });
});

// POC 4 — explicit `caches.default.match()`/`.put()` in the request path.
// A `Cache-Control` header alone (see test-cache.astro) does not populate
// the Workers Cache API for a custom Worker fetch handler; this route is
// what actually proves "served from cache, fresh after purge" (Phase 0,
// milestone 0.12). Purge this URL via POST /api/cache/purge with this
// route's own URL to invalidate it.
app.get("/api/cache/test", async (c) => {
  const cacheKey = new Request(c.req.url);
  const cached = await caches.default.match(cacheKey);
  if (cached) {
    const res = new Response(cached.body, cached);
    res.headers.set("X-Cache", "HIT");
    return res;
  }

  const fresh = c.json({ generatedAt: new Date().toISOString() });
  fresh.headers.set("Cache-Control", "public, max-age=60");
  await caches.default.put(cacheKey, fresh.clone());
  fresh.headers.set("X-Cache", "MISS");
  return fresh;
});

// Proves the CmsService Service Binding round-trips through Worker 2
// (CMS) and D1, mirroring the /api/ping and /api/cache/test POC routes
// above. No real page needs this write path yet — see issue #16.
// Note: combining Drizzle's InferSelectModel with the Service<T>/Fetcher<T>
// RPC stub's own recursive type machinery can hit TS's instantiation-depth
// limit under a full `tsc --noEmit` project check (not run anywhere in this
// repo's build/lint pipeline — `pnpm build:site`/`pnpm build:cms` are
// esbuild/vite-based and unaffected). A known rough edge combining
// Cloudflare's RPC types with Drizzle's generics; no runtime effect.
app.post("/api/cms-test", async (c) => {
  const created = await c.env.CMS.create("pages", {
    title: "Service binding test",
    slug: `service-binding-test-${Date.now()}`,
  });
  await c.env.CMS.deleteByID("pages", created.id);
  return c.json({ ok: true, created });
});

// 2. Astro SSR — fallback for everything else
app.all("*", async (c) => {
  // @ts-expect-error — Hono's bundled ExecutionContext type lacks the
  // `exports`/`props` fields that wrangler-generated types now require.
  // Upstream bug, no runtime effect: https://github.com/honojs/hono/issues/4493
  return handle(c.req.raw, c.env, c.executionCtx);
});

export default app;
