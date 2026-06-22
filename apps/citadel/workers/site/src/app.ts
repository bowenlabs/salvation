import { handle } from "@astrojs/cloudflare/handler";
import { securityHeaders } from "@core/lib/security-headers";
import { Hono } from "hono";

const app = new Hono<{ Bindings: Env }>();

app.use("*", securityHeaders);

// 1. Custom API routes — checked first

// Proves the CmsService Service Binding round-trips through Worker 2
// (CMS) and D1. No real page needs this write path yet — see issue #16.
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
