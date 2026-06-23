// Mounts the public REST API (Payload Parity Roadmap issue #23) onto
// /api/*. Every collection's own `access` rules (app/cadmea.config.ts) are
// what actually gate each request — this just resolves the per-request
// context those rules are checked against and applies transport-level
// defenses on top. Kept free of any TanStack/Vite-only imports (unlike
// app/workers/cadmea/app/server.ts, which pulls in
// `@tanstack/solid-start/server-entry`) so it can be exercised directly
// against real D1/KV in tests/int, the same "no mocked D1" bar the rest
// of this app's integration tests hold to.
import type { LocalApi } from "@bowenlabs/cadmus/cms";
import { mountCmsRoutes } from "@bowenlabs/cadmus/hono";
import { checkRateLimit } from "@bowenlabs/cadmus/rate-limit";
import { type Context, Hono } from "hono";
import { cors } from "hono/cors";
import { createCmsCollections } from "./cms-collections.js";
import type { Session } from "./session.js";

export interface MountPublicCmsApiOptions {
  /**
   * Re-derives the request's admin session. Production passes the
   * signed-cookie lookup server.ts already uses for /api/media/upload;
   * tests can inject a stub that skips the cookie/KV round trip.
   */
  getSession: (c: Context<{ Bindings: Env }>) => Promise<Session | null>;
  /**
   * Builds the collection registry mountCmsRoutes serves. Defaults to
   * this app's real collections (`createCmsCollections`); tests can
   * inject a fixture to isolate CORS/rate-limit behavior from the real
   * schema.
   */
  // biome-ignore lint/suspicious/noExplicitAny: mirrors CmsRoutesOptions["collections"] in @bowenlabs/cadmus/hono
  getCollections?: (env: Env) => Record<string, LocalApi<any>>;
}

export function mountPublicCmsApi(
  app: Hono<{ Bindings: Env }>,
  options: MountPublicCmsApiOptions,
): void {
  const getCollections = options.getCollections ?? createCmsCollections;

  // CORS: permissive on GET (reads, e.g. `pages`, are meant to be publicly
  // fetchable per-collection); no CORS at all on mutating verbs —
  // same-origin only, the same posture as /api/media/upload's manual
  // origin check (server.ts). Returning `null` from `origin` omits the
  // Access-Control-Allow-Origin header entirely, which is what makes a
  // cross-origin browser request fail.
  app.use(
    "/api/*",
    cors({
      origin: (origin, c) => (c.req.method === "GET" ? origin : null),
    }),
  );

  // Rate limiting: anonymous GETs are keyed by IP (no session to key by —
  // most reads are unauthenticated public content); writes are keyed by
  // the session's email once there is one. A write attempted without a
  // session still gets an IP-keyed limit — it's going to be rejected with
  // 403 by the collection's own access rule shortly after, but it still
  // costs a KV read/write, so it isn't exempted from rate limiting.
  app.use("/api/*", async (c) => {
    const session = await options.getSession(c);
    const isWrite = c.req.method !== "GET";
    const key =
      isWrite && session
        ? `ratelimit:cms-api-write:${session.email}`
        : `ratelimit:cms-api:${c.req.header("CF-Connecting-IP") ?? "unknown"}`;
    const { allowed } = await checkRateLimit(
      c.env.KV,
      key,
      isWrite ? 30 : 120,
      60,
    );
    if (!allowed) return c.json({ error: "Rate limit exceeded" }, 429);

    // Built fresh per request (mirrors pagesApi() in
    // server-functions/pages.ts and CadmeaService.api() in service.ts)
    // since the D1 binding only exists on this request's `c.env`, not at
    // module scope. mountCmsRoutes itself takes a static `collections`
    // map, so a throwaway Hono instance is mounted per request and the
    // request handed to it directly, rather than teaching mountCmsRoutes
    // to rebuild collections per route — that's a cadmus/hono concern,
    // not this app's.
    const cmsApp = new Hono();
    mountCmsRoutes(cmsApp, {
      collections: getCollections(c.env),
      resolveContext: async () => ({ session }),
    });
    return cmsApp.fetch(c.req.raw, c.env, c.executionCtx);
  });
}
