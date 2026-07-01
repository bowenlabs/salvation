// Copyright (c) 2026 BowenLabs. All rights reserved.
// Cadmus is MIT licensed. See LICENSE in the repo root.
//
// Cloudflare Access JWT verification middleware. Gates Hono routes behind a
// Cloudflare Access application: it validates the `Cf-Access-Jwt-Assertion`
// token (an RS256 JWT minted by Access at the edge) against the team's JWKS,
// checking the signature, `aud`, `iss`, and expiry. Dep-free — Web Crypto only,
// matching the rest of cadmus.
//
// Typical use: protect a preview deployment (or any identity-gated route set)
// so only allow-listed identities can reach it.
//
// ```ts
// app.use("*", createCloudflareAccess({
//   teamDomain: "myteam",          // or "https://myteam.cloudflareaccess.com"
//   aud: env.ACCESS_AUD,           // the Access app's Audience tag
// }));
// ```

import type { Context, MiddlewareHandler } from "hono";

const ACCESS_JWT_HEADER = "cf-access-jwt-assertion";
// `CF_Authorization` is Cloudflare Access's public cookie NAME — a fixed
// protocol identifier, not a secret. The credential is the signed JWT it
// carries, which is cryptographically verified below.
// deepcode ignore HardcodedNonCryptoSecret: public CF Access cookie name, not a credential
const ACCESS_JWT_COOKIE = "CF_Authorization";
// Tolerance for `exp`/`nbf` against the verifier's clock.
const CLOCK_SKEW_SECONDS = 10;
const DEFAULT_JWKS_TTL_SECONDS = 3600;

export interface CloudflareAccessOptions {
  /**
   * Your Access team domain. Accepts the bare team name (`"myteam"`), the host
   * (`"myteam.cloudflareaccess.com"`), or the full URL.
   */
  teamDomain: string;
  /**
   * The Access application's Audience (AUD) tag(s) — the token's `aud` must
   * include one. Found in the Access application's settings.
   */
  aud: string | string[];
  /**
   * Hono context variable the verified identity is stored under (read it back
   * with `c.get(...)`). Default `"accessIdentity"`.
   */
  contextKey?: string;
  /**
   * Response when verification fails. Default: `403` with a plain body. The
   * `reason` is a short diagnostic — don't surface it to end users verbatim.
   */
  onUnauthorized?: (c: Context, reason: string) => Response | Promise<Response>;
  /** JWKS cache TTL in seconds (per isolate). Default `3600`. */
  jwksCacheTtlSeconds?: number;
}

export interface AccessIdentity {
  /** The authenticated identity's email, when the token carries one. */
  email?: string;
  /** Subject — the Access user id. */
  sub: string;
  /** Audiences the token was issued for. */
  aud: string[];
  /** All verified claims, for callers that need more (groups, custom, …). */
  claims: Record<string, unknown>;
}

interface JwtHeader {
  alg: string;
  kid?: string;
}

interface Jwk extends JsonWebKey {
  kid?: string;
}

interface JwksCacheEntry {
  keys: Map<string, Jwk>;
  expiresAt: number;
}

// Per-isolate JWKS cache, keyed by team domain. Best-effort — a cold isolate
// just refetches. Cloudflare rotates Access signing keys, so an unknown `kid`
// forces a one-shot refresh below.
const jwksCache = new Map<string, JwksCacheEntry>();

function normalizeTeamDomain(input: string): string {
  const host = input
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
  const full = host.includes(".cloudflareaccess.com")
    ? host
    : `${host}.cloudflareaccess.com`;
  return `https://${full}`;
}

function decodeBase64Url(value: string): Uint8Array {
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function decodeJsonSegment(segment: string): unknown {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(segment)));
}

function extractToken(c: Context): string | undefined {
  const header = c.req.header(ACCESS_JWT_HEADER);
  if (header) return header;
  const cookie = c.req.header("cookie");
  if (!cookie) return undefined;
  for (const part of cookie.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === ACCESS_JWT_COOKIE) {
      return part.slice(eq + 1).trim();
    }
  }
  return undefined;
}

async function fetchJwks(
  teamDomain: string,
  ttlSeconds: number,
): Promise<Map<string, Jwk>> {
  const response = await fetch(`${teamDomain}/cdn-cgi/access/certs`);
  if (!response.ok) {
    throw new Error(`JWKS fetch failed (${response.status})`);
  }
  const body = (await response.json()) as { keys?: Jwk[] };
  const keys = new Map<string, Jwk>();
  for (const key of body.keys ?? []) {
    if (key.kid) keys.set(key.kid, key);
  }
  jwksCache.set(teamDomain, {
    keys,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
  return keys;
}

async function resolveKey(
  teamDomain: string,
  kid: string,
  ttlSeconds: number,
): Promise<Jwk> {
  const cached = jwksCache.get(teamDomain);
  let keys =
    cached && cached.expiresAt > Date.now()
      ? cached.keys
      : await fetchJwks(teamDomain, ttlSeconds);
  let jwk = keys.get(kid);
  if (!jwk) {
    // Unknown kid — Access may have rotated keys. Refresh once.
    jwksCache.delete(teamDomain);
    keys = await fetchJwks(teamDomain, ttlSeconds);
    jwk = keys.get(kid);
  }
  if (!jwk) throw new Error("no matching signing key");
  return jwk;
}

async function verifySignature(
  jwk: Jwk,
  signingInput: string,
  signature: Uint8Array,
): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    signature as BufferSource,
    new TextEncoder().encode(signingInput) as BufferSource,
  );
}

function asAudList(aud: unknown): string[] {
  if (Array.isArray(aud)) return aud.map(String);
  if (typeof aud === "string") return [aud];
  return [];
}

async function verifyAccessJwt(
  token: string,
  teamDomain: string,
  audSet: Set<string>,
  ttlSeconds: number,
): Promise<AccessIdentity> {
  const segments = token.split(".");
  if (segments.length !== 3) throw new Error("malformed token");
  const [headerSegment, payloadSegment, signatureSegment] = segments;

  const header = decodeJsonSegment(headerSegment) as JwtHeader;
  // Pin the algorithm — never trust the token's own `alg` to pick a verify
  // strategy (the classic JWT alg-confusion / `none` downgrade).
  if (header.alg !== "RS256") throw new Error(`unsupported alg: ${header.alg}`);
  if (!header.kid) throw new Error("missing kid");

  const jwk = await resolveKey(teamDomain, header.kid, ttlSeconds);
  const signatureValid = await verifySignature(
    jwk,
    `${headerSegment}.${payloadSegment}`,
    decodeBase64Url(signatureSegment),
  );
  if (!signatureValid) throw new Error("invalid signature");

  const claims = decodeJsonSegment(payloadSegment) as Record<string, unknown>;
  const now = Math.floor(Date.now() / 1000);

  const exp = Number(claims.exp);
  if (!Number.isFinite(exp) || exp + CLOCK_SKEW_SECONDS < now) {
    throw new Error("token expired");
  }
  const nbf = Number(claims.nbf);
  if (Number.isFinite(nbf) && nbf - CLOCK_SKEW_SECONDS > now) {
    throw new Error("token not yet valid");
  }
  if (claims.iss !== teamDomain) throw new Error("issuer mismatch");

  const tokenAud = asAudList(claims.aud);
  if (!tokenAud.some((value) => audSet.has(value))) {
    throw new Error("audience mismatch");
  }

  return {
    email: typeof claims.email === "string" ? claims.email : undefined,
    sub: String(claims.sub ?? ""),
    aud: tokenAud,
    claims,
  };
}

/**
 * Builds a Hono middleware that requires a valid Cloudflare Access JWT. On
 * success it stores the {@link AccessIdentity} on the context (default key
 * `"accessIdentity"`) and calls `next()`; on failure it short-circuits with the
 * `onUnauthorized` response (default `403`).
 */
export function createCloudflareAccess(
  options: CloudflareAccessOptions,
): MiddlewareHandler {
  const teamDomain = normalizeTeamDomain(options.teamDomain);
  const audSet = new Set(
    Array.isArray(options.aud) ? options.aud : [options.aud],
  );
  const contextKey = options.contextKey ?? "accessIdentity";
  const ttlSeconds = options.jwksCacheTtlSeconds ?? DEFAULT_JWKS_TTL_SECONDS;
  const onUnauthorized =
    options.onUnauthorized ?? ((c) => c.text("Access denied", 403));

  return async (c, next) => {
    const token = extractToken(c);
    if (!token) return onUnauthorized(c, "missing Access token");
    let identity: AccessIdentity;
    try {
      identity = await verifyAccessJwt(token, teamDomain, audSet, ttlSeconds);
    } catch (error) {
      return onUnauthorized(
        c,
        error instanceof Error ? error.message : "invalid token",
      );
    }
    // The context-variable key is caller-configurable, so it isn't part of
    // Hono's statically-typed Variables map — cast the setter to a string-keyed
    // signature rather than widening the whole context to `any`.
    (c.set as (key: string, value: unknown) => void)(contextKey, identity);
    return next();
  };
}
