// Copyright (c) 2026 BowenLabs. All rights reserved.
// Cadmus is MIT licensed. See LICENSE in the repo root.
//
// @thebes/cadmus/astro
//
// Peer-integration layer for Astro — the same "peer, not a dependency"
// treatment @thebes/cadmus/hono already gets (see that module's
// index.ts). `astro` is an optional peer dependency; this entrypoint is
// excluded from the package root export for the same reason hono is.
// Unlike the hono layer, every `astro` import below is `import type` —
// nothing from the real `astro` package executes in this module. Astro's
// own `defineMiddleware` is `(fn) => fn`, a type-inference convenience
// for app code calling it inline, not anything we need at runtime; we
// return the typed function directly instead of importing it, so this
// module stays V8-first with no Astro runtime in the bundled output.
//
// These handlers are thin HTTP plumbing over cadmus/auth, cadmus/session,
// and cadmus/rate-limit — they don't introduce new crypto or storage
// logic. What's genuinely app-specific (looking up a user by email,
// shaping a session payload, sending the actual email) is always a
// caller-supplied function, mirroring how @thebes/cadmus/hono's
// mountCmsRoutes takes a `resolveContext` callback instead of guessing at
// the app's auth model.

import type { APIContext, APIRoute, MiddlewareHandler } from "astro";
import {
  generateToken,
  hashToken,
  signSession,
  verifySession,
} from "../auth/index.js";
import { checkRateLimit } from "../rate-limit/index.js";

const DEFAULT_COOKIE_NAME = "cadmus_session";
const DEFAULT_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days
const DEFAULT_MAGIC_LINK_TTL_SECONDS = 60 * 15; // 15 min
const DEFAULT_RATE_LIMIT = { limit: 3, windowSeconds: 60 * 15 };
const KV_RETRY_ATTEMPTS = 2;
const KV_RETRY_DELAY_MS = 100;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Only a same-origin relative path is safe to redirect to — a protocol-
// relative "//host/..." or absolute URL turns this into an open redirect.
function isSafeRedirect(value: string | null | undefined): value is string {
  return !!value && value.startsWith("/") && !value.startsWith("//");
}

function resolve<TContext>(
  value: string | ((context: TContext) => string) | undefined,
  context: TContext,
  fallback: string,
): string {
  if (value === undefined) return fallback;
  return typeof value === "function" ? value(context) : value;
}

export interface MagicLinkHandlersOptions<TUser> {
  /** Resolves the KV namespace magic-link tokens are stored in, per request. */
  kv: (context: APIContext) => KVNamespace;
  /** Resolves the secret session cookies are HMAC-signed with — must match cadmusAuthGuard's `secret`. */
  secret: (context: APIContext) => string;
  /**
   * Looks up the user a request's email belongs to. Returning null is
   * indistinguishable to the client from a successful send — this is
   * the anti-enumeration guarantee the same way the hand-rolled
   * Worker 1 route this replaces always returned `{ ok: true }`.
   */
  findUser: (context: APIContext, email: string) => Promise<TUser | null>;
  /** Creates a session for a verified user, returning the session ID to sign into the cookie. */
  createSession: (
    context: APIContext,
    user: TUser,
  ) => Promise<{ sessionId: string }>;
  /** Sends the magic-link email. Not called when `isLocalDev` returns true — see that option. */
  sendMagicLinkEmail: (
    context: APIContext,
    params: { email: string; verifyUrl: URL },
  ) => Promise<void>;
  /** Cookie name the session is signed into. Defaults to "cadmus_session". */
  cookieName?: string;
  /** Cookie `maxAge` in seconds. Defaults to 7 days. */
  cookieMaxAgeSeconds?: number;
  /** Magic-link token TTL in seconds. Defaults to 15 minutes. */
  magicLinkTtlSeconds?: number;
  /**
   * Per-email rate limit on magic-link requests, keyed in the same KV
   * namespace `kv` resolves. Defaults to 3 requests / 15 minutes. Pass
   * `false` to disable.
   */
  rateLimit?: { limit: number; windowSeconds: number } | false;
  /** Path the verify GET handler is mounted at — used to build the emailed link. Defaults to "/api/auth/verify". */
  verifyPath?: string;
  /** Path to redirect to on a failed verify, with `?error=invalid|unauthorized` appended. Defaults to "/login". */
  loginPath?: string;
  /** Redirect target after a successful verify when no `redirect` param was supplied. Defaults to "/". */
  defaultRedirect?: string | ((context: APIContext) => string);
  /**
   * Whether this request should skip emailing and log the link instead —
   * see `onLocalDev`. Defaults to checking for a localhost/127.0.0.1
   * request hostname, since no deployed environment is ever literally
   * that (unlike checking `sendMagicLinkEmail`'s own success/failure,
   * which local email emulators can mask).
   */
  isLocalDev?: (context: APIContext) => boolean;
  /** Called instead of `sendMagicLinkEmail` when `isLocalDev` is true. Defaults to a console.log of the link. */
  onLocalDev?: (
    context: APIContext,
    params: { email: string; verifyUrl: URL },
  ) => void | Promise<void>;
}

function defaultIsLocalDev(context: APIContext): boolean {
  const hostname = context.url.hostname;
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function defaultOnLocalDev(
  _context: APIContext,
  { email, verifyUrl }: { email: string; verifyUrl: URL },
): void {
  console.log(`[dev] Magic link for ${email}: ${verifyUrl.toString()}`);
}

/**
 * Builds the magic-link request (`POST`) and verify (`GET`) Astro
 * `APIRoute` handlers — mount both at the same route, e.g.
 * `export const { POST, GET } = createMagicLinkHandlers(options)` from
 * `src/pages/api/auth/[...path].ts`, or wire `POST`/`GET` into separate
 * `magic-link.ts`/`verify.ts` routes matching `verifyPath` below.
 */
export function createMagicLinkHandlers<TUser>(
  options: MagicLinkHandlersOptions<TUser>,
): { POST: APIRoute; GET: APIRoute } {
  const cookieName = options.cookieName ?? DEFAULT_COOKIE_NAME;
  const cookieMaxAgeSeconds =
    options.cookieMaxAgeSeconds ?? DEFAULT_COOKIE_MAX_AGE_SECONDS;
  const magicLinkTtlSeconds =
    options.magicLinkTtlSeconds ?? DEFAULT_MAGIC_LINK_TTL_SECONDS;
  const rateLimit =
    options.rateLimit === false
      ? null
      : (options.rateLimit ?? DEFAULT_RATE_LIMIT);
  const verifyPath = options.verifyPath ?? "/api/auth/verify";
  const loginPath = options.loginPath ?? "/login";
  const isLocalDev = options.isLocalDev ?? defaultIsLocalDev;
  const onLocalDev = options.onLocalDev ?? defaultOnLocalDev;

  const POST: APIRoute = async (context) => {
    const body = await context.request
      .json<{ email?: string; redirect?: string }>()
      .catch(() => null);
    const email = body?.email?.trim().toLowerCase();
    if (!email) return Response.json({ ok: true });

    const redirect = isSafeRedirect(body?.redirect) ? body.redirect : null;

    const kv = options.kv(context);

    if (rateLimit) {
      const { allowed } = await checkRateLimit(
        kv,
        `magiclink:ratelimit:${email}`,
        rateLimit.limit,
        rateLimit.windowSeconds,
      );
      if (!allowed) return Response.json({ ok: true });
    }

    const user = await options.findUser(context, email);
    if (!user) return Response.json({ ok: true });

    const token = generateToken();
    const hash = await hashToken(token);
    await kv.put(`magiclink:${hash}`, email, {
      expirationTtl: magicLinkTtlSeconds,
    });

    const verifyUrl = new URL(verifyPath, context.url);
    verifyUrl.searchParams.set("token", token);
    if (redirect) verifyUrl.searchParams.set("redirect", redirect);

    if (isLocalDev(context)) {
      await onLocalDev(context, { email, verifyUrl });
    } else {
      await options.sendMagicLinkEmail(context, { email, verifyUrl });
    }

    return Response.json({ ok: true });
  };

  const GET: APIRoute = async (context) => {
    const token = context.url.searchParams.get("token");
    if (!token) return context.redirect(`${loginPath}?error=invalid`);

    const kv = options.kv(context);
    const hash = await hashToken(token);
    const key = `magiclink:${hash}`;

    // Single use, and retried — see cadmus/session's getSession for why
    // a read immediately following the write above can otherwise see a
    // false negative under KV's eventual consistency.
    let email: string | null = null;
    for (let attempt = 0; attempt <= KV_RETRY_ATTEMPTS; attempt++) {
      email = await kv.get(key);
      if (email !== null) break;
      if (attempt < KV_RETRY_ATTEMPTS) await sleep(KV_RETRY_DELAY_MS);
    }
    if (email === null) return context.redirect(`${loginPath}?error=invalid`);
    await kv.delete(key);

    const user = await options.findUser(context, email);
    if (!user) return context.redirect(`${loginPath}?error=unauthorized`);

    const { sessionId } = await options.createSession(context, user);
    const signature = await signSession(sessionId, options.secret(context));

    context.cookies.set(cookieName, `${sessionId}.${signature}`, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: cookieMaxAgeSeconds,
    });

    // Re-validated here too — this query param isn't signed alongside
    // the token, so the request-side check above doesn't cover it.
    const requestedRedirect = context.url.searchParams.get("redirect");
    const redirectTo = isSafeRedirect(requestedRedirect)
      ? requestedRedirect
      : resolve(options.defaultRedirect, context, "/");
    return context.redirect(redirectTo);
  };

  return { POST, GET };
}

export interface LogoutHandlerOptions {
  /** Cookie name the session is signed into. Must match createMagicLinkHandlers' `cookieName`. */
  cookieName?: string;
  /** Deletes the session identified by the cookie's session ID (e.g. from KV). */
  deleteSession: (context: APIContext, sessionId: string) => Promise<void>;
  /** Where to redirect after logout. Defaults to "/login". */
  redirectTo?: string | ((context: APIContext) => string);
}

/** Builds a logout `APIRoute` — clears the session cookie and its backing store entry. */
export function createLogoutHandler(options: LogoutHandlerOptions): APIRoute {
  const cookieName = options.cookieName ?? DEFAULT_COOKIE_NAME;

  return async (context) => {
    const cookieValue = context.cookies.get(cookieName)?.value;
    if (cookieValue) {
      const [sessionId] = cookieValue.split(".");
      if (sessionId) await options.deleteSession(context, sessionId);
    }
    context.cookies.delete(cookieName, { path: "/" });
    return context.redirect(resolve(options.redirectTo, context, "/login"));
  };
}

export interface AuthGuardOptions<TSession> {
  /** Cookie name the session is signed into. Must match createMagicLinkHandlers' `cookieName`. */
  cookieName?: string;
  /** Resolves the secret session cookies are HMAC-signed with — must match createMagicLinkHandlers' `secret`. */
  secret: (context: APIContext) => string;
  /** Reads the session for a verified session ID (e.g. from KV). Returning null treats the session as missing. */
  getSession: (
    context: APIContext,
    sessionId: string,
  ) => Promise<TSession | null>;
  /** Key set on `context.locals`. Defaults to "session". */
  localsKey?: string;
}

/**
 * Astro middleware that verifies the session cookie's signature and
 * populates `context.locals[localsKey]` with the resolved session, or
 * null if there isn't one. Mirrors `cadmusAuth()`'s role in the Hono
 * layer: it authenticates the request, it doesn't gate access — pages
 * and routes downstream decide what to do with a null session.
 */
export function cadmusAuthGuard<TSession>(
  options: AuthGuardOptions<TSession>,
): MiddlewareHandler {
  const cookieName = options.cookieName ?? DEFAULT_COOKIE_NAME;
  const localsKey = options.localsKey ?? "session";

  const handler: MiddlewareHandler = async (context, next) => {
    const cookieValue = context.cookies.get(cookieName)?.value;
    let session: TSession | null = null;

    if (cookieValue) {
      const [sessionId, signature] = cookieValue.split(".");
      if (sessionId && signature) {
        const valid = await verifySession(
          sessionId,
          signature,
          options.secret(context),
        );
        if (valid) session = await options.getSession(context, sessionId);
      }
    }

    (context.locals as Record<string, unknown>)[localsKey] = session;
    return next();
  };

  return handler;
}
