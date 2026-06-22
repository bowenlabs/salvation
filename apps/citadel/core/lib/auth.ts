// Signatures only — implemented in Phase 3. See CLAUDE.md "Authentication"
// for the full magic-link flow these wrap.

/** Generates a magic-link token, stores its hash in KV (15 min TTL), keyed by email. */
export function createMagicLinkToken(
  _kv: KVNamespace,
  _email: string,
): Promise<{ token: string }> {
  throw new Error("createMagicLinkToken: not implemented until Phase 3");
}

/** Hashes the raw token and validates it against the stored KV hash; deletes the entry on success (single use). */
export function verifyMagicLinkToken(
  _kv: KVNamespace,
  _token: string,
): Promise<{ email: string } | null> {
  throw new Error("verifyMagicLinkToken: not implemented until Phase 3");
}

/** HMAC-signs a session cookie value using Web Crypto (`crypto.subtle`) — never Node's `crypto`. */
export function signSessionCookie(
  _value: string,
  _secret: string,
): Promise<string> {
  throw new Error("signSessionCookie: not implemented until Phase 3");
}

/** Verifies an HMAC-signed session cookie value. */
export function verifySessionCookie(
  _signed: string,
  _secret: string,
): Promise<string | null> {
  throw new Error("verifySessionCookie: not implemented until Phase 3");
}
