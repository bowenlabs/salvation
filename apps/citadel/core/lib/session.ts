// Signatures only — implemented in Phase 3. See CLAUDE.md "Authentication"
// for the session model (signed cookie + KV entry with TTL) these wrap.

export interface Session {
  userId: string;
  email: string;
  createdAt: number;
}

/** Creates a session, stores it in KV under a generated session ID, with TTL. */
export function createSession(
  _kv: KVNamespace,
  _user: { userId: string; email: string },
): Promise<{ sessionId: string }> {
  throw new Error("createSession: not implemented until Phase 3");
}

/** Reads a session by ID from KV. Returns null if missing or expired. */
export function getSession(
  _kv: KVNamespace,
  _sessionId: string,
): Promise<Session | null> {
  throw new Error("getSession: not implemented until Phase 3");
}

/** Deletes a session from KV (logout). */
export function deleteSession(
  _kv: KVNamespace,
  _sessionId: string,
): Promise<void> {
  throw new Error("deleteSession: not implemented until Phase 3");
}
