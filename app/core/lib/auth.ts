// Magic-link token issuance/verification and session-cookie signing —
// This app's wiring on top of the generic @thebes/cadmus/auth
// primitives. See CLAUDE.md "Authentication" for the full flow.
import {
  generateToken,
  hashToken,
  signSession,
  verifySession,
} from "@thebes/cadmus/auth";

const MAGIC_LINK_TTL_SECONDS = 900; // 15 min
const MAGIC_LINK_KEY_PREFIX = "magiclink:";

/**
 * Generates a magic-link token, stores its hash in KV (15 min TTL) mapped
 * to the email it was issued for. The raw token is what gets emailed —
 * only its hash ever touches KV.
 */
export async function createMagicLinkToken(
  kv: KVNamespace,
  email: string,
): Promise<{ token: string }> {
  const token = generateToken();
  const hash = await hashToken(token);
  await kv.put(`${MAGIC_LINK_KEY_PREFIX}${hash}`, email, {
    expirationTtl: MAGIC_LINK_TTL_SECONDS,
  });
  return { token };
}

/**
 * Hashes the raw token and validates it against the stored KV hash;
 * deletes the entry on success (single use). Retries the KV read once
 * (G3: KV is eventually consistent, and this often runs moments after
 * createMagicLinkToken wrote the entry on a different edge location).
 */
export async function verifyMagicLinkToken(
  kv: KVNamespace,
  token: string,
): Promise<{ email: string } | null> {
  const hash = await hashToken(token);
  const key = `${MAGIC_LINK_KEY_PREFIX}${hash}`;

  let email: string | null = null;
  for (let attempt = 0; attempt <= 2; attempt++) {
    email = await kv.get(key);
    if (email !== null) break;
    if (attempt < 2) await new Promise((r) => setTimeout(r, 100));
  }
  if (email === null) return null;

  await kv.delete(key);
  return { email };
}

const PREVIEW_TOKEN_TTL_SECONDS = 60 * 60; // 1 hour

/**
 * Generates a signed, time-limited preview token for a draft version — see
 * issue #28. Unlike the magic link above, this is stateless (no KV entry):
 * the parent id, version id, and expiry are embedded directly in the
 * signed payload and re-derived on verify, so there's nothing to store or
 * clean up, and no single-use semantics to enforce (re-opening a preview
 * link before it expires is expected, normal use).
 */
export async function createPreviewToken(
  secret: string,
  parentId: number,
  versionId: number,
): Promise<{ token: string }> {
  const expiresAt = Math.floor(Date.now() / 1000) + PREVIEW_TOKEN_TTL_SECONDS;
  const payload = `${parentId}.${versionId}.${expiresAt}`;
  const signature = await signSession(payload, secret);
  return { token: `${payload}.${signature}` };
}

/**
 * Verifies a preview token's signature and expiry, returning the parent
 * and version ids it was issued for.
 */
export async function verifyPreviewToken(
  secret: string,
  token: string,
): Promise<{ parentId: number; versionId: number } | null> {
  const [parentIdRaw, versionIdRaw, expiresAtRaw, signature] = token.split(".");
  if (!parentIdRaw || !versionIdRaw || !expiresAtRaw || !signature) {
    return null;
  }

  const payload = `${parentIdRaw}.${versionIdRaw}.${expiresAtRaw}`;
  const valid = await verifySession(payload, signature, secret);
  if (!valid) return null;

  const expiresAt = Number(expiresAtRaw);
  if (
    !Number.isFinite(expiresAt) ||
    expiresAt < Math.floor(Date.now() / 1000)
  ) {
    return null;
  }

  const parentId = Number(parentIdRaw);
  const versionId = Number(versionIdRaw);
  if (!Number.isInteger(parentId) || !Number.isInteger(versionId)) return null;

  return { parentId, versionId };
}

/**
 * HMAC-signs a session ID into the `{value}.{signature}` cookie format
 * middleware.ts parses.
 */
export async function signSessionCookie(
  value: string,
  secret: string,
): Promise<string> {
  const signature = await signSession(value, secret);
  return `${value}.${signature}`;
}

/**
 * Verifies an HMAC-signed session cookie value, returning the session ID
 * if valid.
 */
export async function verifySessionCookie(
  signed: string,
  secret: string,
): Promise<string | null> {
  const [value, signature] = signed.split(".");
  if (!value || !signature) return null;
  const valid = await verifySession(value, signature, secret);
  return valid ? value : null;
}
