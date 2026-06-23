// Session storage on top of @thebes/cadmus/session — owns the
// `session:{id}` key convention and the 7-day TTL. This app's wiring:
// uses the dedicated `SESSION` KV namespace (separate from the `KV`
// namespace used for magic-link tokens and rate-limit counters), and
// knows the session payload shape (userId/email/role).
import { generateSessionId } from "@thebes/cadmus/auth";
import {
  createSession as kvCreateSession,
  deleteSession as kvDeleteSession,
  getSession as kvGetSession,
} from "@thebes/cadmus/session";

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
const SESSION_KEY_PREFIX = "session:";

export type Role = "owner" | "editor" | "viewer";

export interface Session {
  userId: number;
  email: string;
  role: Role;
  createdAt: number;
}

/** Creates a session, stores it in KV under a generated session ID, with TTL. */
export async function createSession(
  kv: KVNamespace,
  user: { userId: number; email: string; role: Role },
): Promise<{ sessionId: string }> {
  const sessionId = generateSessionId();
  const session: Session = { ...user, createdAt: Date.now() };
  await kvCreateSession(
    kv,
    `${SESSION_KEY_PREFIX}${sessionId}`,
    session,
    SESSION_TTL_SECONDS,
  );
  return { sessionId };
}

/** Reads a session by ID from KV. Returns null if missing or expired. */
export function getSession(
  kv: KVNamespace,
  sessionId: string,
): Promise<Session | null> {
  return kvGetSession<Session>(kv, `${SESSION_KEY_PREFIX}${sessionId}`);
}

/** Deletes a session from KV (logout). */
export function deleteSession(
  kv: KVNamespace,
  sessionId: string,
): Promise<void> {
  return kvDeleteSession(kv, `${SESSION_KEY_PREFIX}${sessionId}`);
}
