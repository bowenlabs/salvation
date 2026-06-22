// app/workers/cadmea/app/server.ts

import { CadmusStorageError } from "@bowenlabs/cadmus";
import { checkRateLimit } from "@bowenlabs/cadmus/rate-limit";
import { verifySessionCookie } from "@core/lib/auth";
import { createR2ImageService } from "@core/lib/image-service";
import { securityHeaders } from "@core/lib/security-headers";
import { getSession } from "@core/lib/session";
import startHandler from "@tanstack/solid-start/server-entry";
import { Hono } from "hono";
import { getCookie } from "hono/cookie";

export { CadmeaService } from "./service.js";

const app = new Hono<{ Bindings: Env }>();

app.use("*", securityHeaders);

// 1. Custom API routes — checked first

// Media upload — see issue #12. Hono route, not a TanStack server
// function: the browser posts a real multipart file here directly, and
// this is also the one route a future non-Panel client (e.g. a CLI)
// could call. Auth is re-checked here the same way requireAuthOrThrow
// does for server functions (see middleware.ts) — this route has no
// beforeLoad guard protecting it.
app.post("/api/media/upload", async (c) => {
  const cookieValue = getCookie(c, "cadmea_session");
  const sessionId = cookieValue
    ? await verifySessionCookie(cookieValue, c.env.SESSION_SECRET)
    : null;
  const session = sessionId ? await getSession(c.env.SESSION, sessionId) : null;
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
    const { url } = await createR2ImageService(
      c.env.R2,
      c.env.MEDIA_URL,
    ).upload(file);
    return c.json({ url });
  } catch (err) {
    if (err instanceof CadmusStorageError) {
      const status = err.message.includes("exceeds") ? 413 : 400;
      return c.json({ error: err.message }, status);
    }
    throw err;
  }
});

// Form submission and magic-link auth routes land in Phase 3/7
// respectively, alongside their real implementations — see
// SECTION_1_PLAN.md's 2026-06-21 Phase 1 audit. Don't pre-add
// unimplemented stubs here; an early draft of this file had them and
// they were removed for looking functional when they weren't.

// 2. TanStack Start — fallback for everything else, must be last
app.all("*", async (c) => startHandler.fetch(c.req.raw));

export default app;
