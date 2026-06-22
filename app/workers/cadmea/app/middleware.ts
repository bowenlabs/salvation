import { verifySessionCookie } from "@core/lib/auth";
import { getSession, type Session } from "@core/lib/session";
import { createServerFn } from "@tanstack/solid-start";
import { getCookie, getRequestHeader } from "@tanstack/solid-start/server";

// Web Crypto session verification — no Node.js crypto.
// Plain function (not wrapped in createServerFn) — TanStack's request-
// scoped helpers (getCookie, getRequestHeader) work from anywhere called
// during server-side request handling, not just directly inside a
// createServerFn handler, so both requireAuth (route guards) and
// requireAuthOrThrow (server functions, see below) can share this.
async function getRequestSession(): Promise<Session | null> {
  const cookieValue = getCookie("cadmea_session");
  if (!cookieValue) return null;

  const { env } = await import("cloudflare:workers");

  const sessionId = await verifySessionCookie(cookieValue, env.SESSION_SECRET);
  if (!sessionId) return null;

  return getSession(env.SESSION, sessionId);
}

// Wrapped as a server function so it's guaranteed to run server-side even
// when beforeLoad runs during client-side SPA navigation — getCookie()
// is server-only and throws if called from the client. Called from route
// beforeLoad guards (see src/routes/admin/route.tsx).
export const requireAuth = createServerFn({ method: "GET" }).handler(
  getRequestSession,
);

// For use inside other server functions (e.g. pages create/update/delete)
// rather than route guards. beforeLoad route guards only run during
// client-side navigation — they don't protect a server function's own
// HTTP endpoint from being called directly, so each mutating server
// function needs its own check. Wrapped in createServerFn (not a plain
// function) so TanStack's vite plugin strips this handler body — and the
// "cloudflare:workers" import it reaches — out of the client bundle, the
// same way it already does for requireAuth/getLoginUrl above. A plain
// function here breaks the client build: anything statically importing
// this module pulls the whole implementation in, and "cloudflare:workers"
// doesn't resolve outside the Workers runtime.
export const requireAuthOrThrow = createServerFn({ method: "GET" }).handler(
  async () => {
    const session = await getRequestSession();
    if (!session) throw new Error("Unauthorized");
    return session;
  },
);

// Defense-in-depth CSRF check for state-changing server functions.
// SameSite=Lax on the session cookie already blocks most cross-site
// forgery, but isn't a substitute for an explicit check (see issue #4's
// security-audit finding). Requests with no Origin header (some same-
// site requests legitimately omit it) are allowed through — Lax cookie
// scoping is still the backstop for those.
export const requireSameOriginOrThrow = createServerFn({
  method: "GET",
}).handler(() => {
  const origin = getRequestHeader("origin");
  if (!origin) return;

  const host = getRequestHeader("host");
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new Error("Invalid Origin header");
  }
  if (originHost !== host) throw new Error("Cross-origin request rejected");
});

// The login page lives in Worker 1 (Astro SSR), not Worker 2 — see
// CLAUDE.md "Authentication" and Phase 0 milestone 0.6. `env.SERVER_URL`
// is only readable server-side, so the absolute redirect target is built
// here rather than inlined in the route's `beforeLoad`.
export const getLoginUrl = createServerFn({ method: "GET" })
  .validator((redirectTo: string) => redirectTo)
  .handler(async ({ data: redirectTo }) => {
    const { env } = await import("cloudflare:workers");
    const url = new URL("/login", env.SERVER_URL);
    url.searchParams.set("redirect", redirectTo);
    return url.toString();
  });
