import type { MiddlewareHandler } from "hono";

// MEDIA_URL's origin must be in img-src — uploaded images are served
// from there, a different host than 'self' in most deployments (see
// CLAUDE.md "Media (R2)"). Built per-request since MEDIA_URL is an env
// var, not known at module load time.
function buildCsp(mediaUrl: string | undefined): string {
  const mediaOrigin = mediaUrl ? new URL(mediaUrl).origin : null;
  return [
    "default-src 'self'",
    // 'unsafe-inline' is required, not optional decoration — TanStack
    // Start ships its hydration payload (the `$_TSR`/`$R` data script)
    // and __root.tsx's THEME_INIT_SCRIPT as inline <script> tags with no
    // nonce/hash. Without this, the browser silently drops those
    // scripts: SSR HTML still renders correctly, but the client never
    // hydrates — no event listeners attach, no client-side query ever
    // fires (confirmed via direct instrumentation: a component's own
    // console.log proved it runs server-side but never re-executes
    // client-side). TanStack Start declares a `nonce` field on its
    // request context type (start-server-core's request-handler.d.ts)
    // but doesn't actually implement it in any published version as of
    // 2026-06-22 — checked 1.169.15 (current) and the 2.0.0-beta.22
    // line, neither's dist code reads/applies it. Revisit and switch to
    // a nonce once upstream actually wires that field through.
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    `img-src 'self' data:${mediaOrigin ? ` ${mediaOrigin}` : ""}`,
    "connect-src 'self' https://static.cloudflareinsights.com",
  ].join("; ");
}

export const securityHeaders: MiddlewareHandler = async (c, next) => {
  await next();
  c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "SAMEORIGIN");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  c.header("Content-Security-Policy", buildCsp(c.env.MEDIA_URL));
};
