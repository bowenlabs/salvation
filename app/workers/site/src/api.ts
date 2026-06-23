// Custom API routes only — no Astro SSR fallback. Split out from app.ts so
// these routes can be exercised in tests/int without needing Astro's Vite
// plugin (the fallback route's `@astrojs/cloudflare/handler` import pulls in
// a virtual module that only exists inside an actual Astro build/dev
// context, which the vitest-pool-workers runtime doesn't provide).

import { users } from "@core/db/schema";
import {
  createMagicLinkToken,
  signSessionCookie,
  verifyMagicLinkToken,
} from "@core/lib/auth";
import { sendEmail } from "@core/lib/notify";
import { securityHeaders } from "@core/lib/security-headers";
import { createSession, deleteSession } from "@core/lib/session";
import { db } from "@thebes/cadmus/db";
import { checkRateLimit } from "@thebes/cadmus/rate-limit";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";

export const api = new Hono<{ Bindings: Env }>();

api.use("*", securityHeaders);

// Proves the CadmeaService Service Binding round-trips through Worker 2
// (Cadmea) and D1. No real page needs this write path yet — see issue #16.
// Note: combining Drizzle's InferSelectModel with the Service<T>/Fetcher<T>
// RPC stub's own recursive type machinery can hit TS's instantiation-depth
// limit under a full `tsc --noEmit` project check (not run anywhere in this
// repo's build/lint pipeline — `pnpm build:site`/`pnpm build:cadmea` are
// esbuild/vite-based and unaffected). A known rough edge combining
// Cloudflare's RPC types with Drizzle's generics; no runtime effect.
api.post("/api/cadmea-test", async (c) => {
  const created = await c.env.CADMEA.create("pages", {
    title: "Service binding test",
    slug: `service-binding-test-${Date.now()}`,
  });
  await c.env.CADMEA.deleteByID("pages", created.id);
  return c.json({ ok: true, created });
});

// Magic-link request — see CLAUDE.md "Authentication". Never confirms or
// denies whether the email belongs to an account; always returns 200, so
// the request can't be used to enumerate registered emails.
api.post("/api/auth/magic-link", async (c) => {
  const body = await c.req
    .json<{ email?: string; redirect?: string }>()
    .catch(() => null);
  const email = body?.email?.trim().toLowerCase();
  if (!email) return c.json({ ok: true });

  // Only allow a same-origin relative path — anything else (a protocol-
  // relative "//host/..." or absolute URL) could turn this into an open
  // redirect.
  const redirect =
    body?.redirect?.startsWith("/") && !body.redirect.startsWith("//")
      ? body.redirect
      : null;

  const { allowed } = await checkRateLimit(
    c.env.KV,
    `ratelimit:magiclink:${email}`,
    3,
    15 * 60,
  );
  if (!allowed) return c.json({ ok: true });

  const user = await db(c.env.DB, { users })
    .select()
    .from(users)
    .where(eq(users.email, email))
    .get();

  if (user) {
    const { token } = await createMagicLinkToken(c.env.KV, email);
    const verifyUrl = new URL("/api/auth/verify", c.req.url);
    verifyUrl.searchParams.set("token", token);
    if (redirect) verifyUrl.searchParams.set("redirect", redirect);

    const requestHostname = new URL(c.req.url).hostname;
    // wrangler dev's local send_email emulation doesn't fail the way an
    // unconfigured production domain would (it just writes an .eml file
    // to disk) — sendEmail()'s success/failure isn't a reliable dev
    // signal. `localhost` is, though: no deployed environment is ever
    // literally "localhost". See CLAUDE.md "Authentication" — dev mode
    // logs the raw link instead of relying on email delivery.
    const isLocalDev =
      requestHostname === "localhost" || requestHostname === "127.0.0.1";

    if (isLocalDev) {
      console.log(`[dev] Magic link for ${email}: ${verifyUrl.toString()}`);
    } else {
      await sendEmail(c.env, {
        from: `noreply@${requestHostname}`,
        to: email,
        subject: "Your Cadmea sign-in link",
        html: `<p>Click to sign in: <a href="${verifyUrl.toString()}">${verifyUrl.toString()}</a></p><p>This link expires in 15 minutes.</p>`,
      });
    }
  }

  return c.json({ ok: true });
});

// Magic-link verification — single use, hashed lookup, KV-retry-aware
// (see core/lib/auth.ts). On success, creates a session and redirects
// cross-Worker into Worker 2's (Cadmea) /admin/dashboard.
//
// Known limitation (CLAUDE.md "Cookie domain"): on *.workers.dev, Worker
// 1's and Worker 2's subdomains are different registered domains (under
// a public suffix), so a host-only cookie set here won't be sent to
// Worker 2 in that environment. Works on localhost (cookies don't scope
// by port) and will work in production once both Workers share a custom
// domain — untested against a real custom domain yet.
api.get("/api/auth/verify", async (c) => {
  const token = c.req.query("token");
  if (!token) return c.redirect("/login?error=invalid");

  const result = await verifyMagicLinkToken(c.env.KV, token);
  if (!result) return c.redirect("/login?error=invalid");

  const user = await db(c.env.DB, { users })
    .select()
    .from(users)
    .where(eq(users.email, result.email))
    .get();
  if (!user) return c.redirect("/login?error=unauthorized");

  const { sessionId } = await createSession(c.env.SESSION, {
    userId: user.id,
    email: user.email,
    role: user.role,
  });
  const cookieValue = await signSessionCookie(sessionId, c.env.SESSION_SECRET);

  setCookie(c, "cadmea_session", cookieValue, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  // Same open-redirect guard as /api/auth/magic-link — this query param
  // isn't signed alongside the token, so it must be re-validated here too.
  const requestedRedirect = c.req.query("redirect");
  const redirectTo =
    requestedRedirect?.startsWith("/") && !requestedRedirect.startsWith("//")
      ? requestedRedirect
      : "/admin/dashboard";
  return c.redirect(new URL(redirectTo, c.env.CADMEA_URL).toString());
});

// Logout — clears the session both in KV and the browser cookie.
api.post("/api/auth/logout", async (c) => {
  const cookieValue = getCookie(c, "cadmea_session");
  if (cookieValue) {
    const [sessionId] = cookieValue.split(".");
    if (sessionId) await deleteSession(c.env.SESSION, sessionId);
  }
  deleteCookie(c, "cadmea_session", { path: "/" });
  return c.redirect("/login");
});

// Default export lets tests/int run this directly as a `main` Worker
// (via SELF.fetch) without Astro's Vite plugin — see app.ts for the real
// entrypoint, which mounts this and adds the Astro SSR fallback.
export default api;
