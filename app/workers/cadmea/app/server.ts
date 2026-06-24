// app/workers/cadmea/app/server.ts

import { verifySessionCookie } from "@core/lib/auth";
import { mountPublicCmsApi } from "@core/lib/cms-api";
import { getSiteSettings } from "@core/lib/get-site-settings";
import { createImageService } from "@core/lib/image-service";
import { securityHeaders } from "@core/lib/security-headers";
import { getSession, type Session } from "@core/lib/session";
import startHandler from "@tanstack/solid-start/server-entry";
import { CadmusStorageError } from "@thebes/cadmus";
import { deliverWebhookMessage, type WebhookMessage } from "@thebes/cadmus/cms";
import { processBatch } from "@thebes/cadmus/queues";
import { checkRateLimit } from "@thebes/cadmus/rate-limit";
import type { Context } from "hono";
import { Hono } from "hono";
import { getCookie } from "hono/cookie";

export { CadmeaService } from "./service.js";

const app = new Hono<{ Bindings: Env }>();

app.use("*", securityHeaders);

// Shared by the media upload route and the public REST API below — both
// re-derive the admin session from the signed cookie rather than trusting
// a beforeLoad route guard, since neither has one protecting it.
async function sessionFromCookie(
  c: Context<{ Bindings: Env }>,
): Promise<Session | null> {
  const cookieValue = getCookie(c, "cadmea_session");
  const sessionId = cookieValue
    ? await verifySessionCookie(cookieValue, c.env.SESSION_SECRET)
    : null;
  return sessionId ? await getSession(c.env.SESSION, sessionId) : null;
}

// 1. Custom API routes — checked first

// Media upload — see issue #12. Hono route, not a TanStack server
// function: the browser posts a real multipart file here directly, and
// this is also the one route a future non-Panel client (e.g. a CLI)
// could call. Auth is re-checked here the same way requireAuthOrThrow
// does for server functions (see middleware.ts) — this route has no
// beforeLoad guard protecting it.
app.post("/api/media/upload", async (c) => {
  const session = await sessionFromCookie(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);

  // Same-origin check — see middleware.ts's requireSameOriginOrThrow for
  // the equivalent server-function-side defense-in-depth reasoning.
  const origin = c.req.header("origin");
  if (origin && new URL(origin).host !== new URL(c.req.url).host) {
    return c.json({ error: "Cross-origin request rejected" }, 403);
  }

  const { allowed } = await checkRateLimit(
    c.env.KV,
    `ratelimit:media-upload:${session.email}`,
    20,
    60 * 60,
  );
  if (!allowed) return c.json({ error: "Rate limit exceeded" }, 429);

  const formData = await c.req.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) {
    return c.json({ error: "No file provided" }, 400);
  }

  try {
    const { url } = await createImageService(c.env.R2, c.env.MEDIA_URL).upload(
      file,
    );
    return c.json({ url });
  } catch (err) {
    if (err instanceof CadmusStorageError) {
      const status = err.message.includes("exceeds") ? 413 : 400;
      return c.json({ error: err.message }, status);
    }
    throw err;
  }
});

// Admin PWA manifest — dynamic, not a static public/ file, because it's
// branded per-operator from site_settings (siteName, logoUrl, brandColor).
// Scoped to /admin: this is the CMS-admin PWA, not the public site, per
// CLAUDE.md's "mobile-first CMS" principle. Falls back to the bundled
// placeholder icons (public/logo192.png, logo512.png — still
// create-tanstack-app boilerplate, real Cadmea iconography not designed
// yet) when an operator hasn't set a logoUrl.
app.get("/admin/manifest.webmanifest", async (c) => {
  const settings = await getSiteSettings(c.env.DB);
  const siteName = settings?.siteName?.trim() || "Cadmea";
  const icons = settings?.logoUrl
    ? [
        {
          src: settings.logoUrl,
          sizes: "any",
          type: "image/png",
          purpose: "any",
        },
      ]
    : [
        { src: "/logo192.png", sizes: "192x192", type: "image/png" },
        { src: "/logo512.png", sizes: "512x512", type: "image/png" },
      ];

  return c.json(
    {
      name: `${siteName} — Cadmea Panel`,
      short_name: siteName,
      description: "Cadmea CMS admin panel",
      start_url: "/admin",
      scope: "/admin",
      display: "standalone",
      background_color: settings?.pageBackground || "#ffffff",
      theme_color: settings?.brandColor || "#111111",
      icons,
    },
    200,
    { "Content-Type": "application/manifest+json" },
  );
});

// Form submission and magic-link auth routes land in Phase 3/7
// respectively, alongside their real implementations — see
// SECTION_1_PLAN.md's 2026-06-21 Phase 1 audit. Don't pre-add
// unimplemented stubs here; an early draft of this file had them and
// they were removed for looking functional when they weren't.

// Public REST API (Payload Parity Roadmap issue #23) — see
// @core/lib/cms-api.ts for the CORS/rate-limit/mounting logic. Pulled out
// into its own module (rather than inlined here) so it can be exercised
// in tests/int without dragging in this file's
// `@tanstack/solid-start/server-entry` import.
mountPublicCmsApi(app, { getSession: sessionFromCookie });

// 2. TanStack Start — fallback for everything else, must be last
app.all("*", async (c) => startHandler.fetch(c.req.raw));

export default {
  fetch: app.fetch,
  // Webhook delivery consumer (issue #27) — drains the `WEBHOOKS` queue
  // `pagesApi()` enqueues onto (src/server-functions/pages.ts). Delivery
  // failures (`deliverWebhookMessage` throwing) become a `message.retry()`
  // via `processBatch`; once `max_retries` (wrangler.jsonc) is exhausted,
  // CF Queues routes the message to the configured dead_letter_queue.
  async queue(batch: MessageBatch<WebhookMessage>) {
    await processBatch(batch, deliverWebhookMessage);
  },
};
