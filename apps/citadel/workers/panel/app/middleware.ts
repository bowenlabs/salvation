import { createServerFn } from "@tanstack/solid-start";
import { getCookie } from "@tanstack/solid-start/server";

// Web Crypto session verification — no Node.js crypto.
// Wrapped as a server function (not plain async fn) so it's guaranteed to
// run server-side even when beforeLoad runs during client-side SPA
// navigation — getCookie() is server-only and throws if called from the
// client. Called from route beforeLoad guards (see src/routes/admin/route.tsx).
export const requireAuth = createServerFn({ method: "GET" }).handler(
  async () => {
    const cookieValue = getCookie("citadel_session");
    if (!cookieValue) return null;

    const [sessionId, sig] = cookieValue.split(".");
    if (!sessionId || !sig) return null;

    const { env } = await import("cloudflare:workers");

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(env.SESSION_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const sigBytes = Uint8Array.from(atob(sig), (c) => c.charCodeAt(0));
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      sigBytes,
      new TextEncoder().encode(sessionId),
    );
    if (!valid) return null;

    const session = await env.KV.get(`session:${sessionId}`);
    if (!session) return null;

    return JSON.parse(session) as { email: string };
  },
);

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
