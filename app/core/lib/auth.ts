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
