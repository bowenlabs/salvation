// Copyright (c) 2026 BowenLabs. All rights reserved.
// Cadmus is MIT licensed. See LICENSE in the repo root.
//
// @thebes/cadmus/session
//
// Thin JSON-over-KV session store. Takes a raw KVNamespace and a caller-
// chosen key — no "session:" prefix or namespace convention baked in,
// since that's an app-level choice, not a framework one. KV is eventually
// consistent, so getSession() retries on a miss (a write immediately
// followed by a read on a different edge location can otherwise see a
// false negative) before concluding the session genuinely doesn't exist.

import { CadmusSessionError } from "../errors.js";

const RETRY_ATTEMPTS = 2;
const RETRY_DELAY_MS = 100;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Stores `value` under `key` in KV, JSON-serialized, with a TTL in seconds. */
export async function createSession<T>(
  kv: KVNamespace,
  key: string,
  value: T,
  ttlSeconds: number,
): Promise<void> {
  try {
    await kv.put(key, JSON.stringify(value), { expirationTtl: ttlSeconds });
  } catch (cause) {
    throw new CadmusSessionError(`Failed to create session "${key}"`, cause);
  }
}

/**
 * Reads and JSON-parses the session at `key`. Retries on a miss (KV's
 * eventual consistency can otherwise produce a false negative right after
 * a write) before returning null.
 */
export async function getSession<T>(
  kv: KVNamespace,
  key: string,
): Promise<T | null> {
  for (let attempt = 0; attempt <= RETRY_ATTEMPTS; attempt++) {
    let raw: string | null;
    try {
      raw = await kv.get(key);
    } catch (cause) {
      throw new CadmusSessionError(`Failed to read session "${key}"`, cause);
    }
    if (raw !== null) return JSON.parse(raw) as T;
    if (attempt < RETRY_ATTEMPTS) await sleep(RETRY_DELAY_MS);
  }
  return null;
}

/** Deletes the session at `key`. */
export async function deleteSession(
  kv: KVNamespace,
  key: string,
): Promise<void> {
  try {
    await kv.delete(key);
  } catch (cause) {
    throw new CadmusSessionError(`Failed to delete session "${key}"`, cause);
  }
}
