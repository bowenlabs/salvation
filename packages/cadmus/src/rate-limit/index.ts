// Copyright (c) 2026 BowenLabs. All rights reserved.
// Cadmus is MIT licensed. See LICENSE in the repo root.
//
// @thebes/cadmus/rate-limit
//
// Fixed-window rate limiter over KV. Best-effort, not atomic — KV has no
// transactions, so a tight race on the same key can let one or two extra
// requests through. That's an acceptable tradeoff for the scale this is
// built for (per-IP/per-email request throttling, not billing-grade
// metering); a Durable Object would be the answer if exact counts ever
// mattered.

import { CadmusRateLimitError } from "../errors.js";

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

/**
 * Increments the counter for `key` within a fixed `windowSeconds` window,
 * resetting once the window elapses. Returns whether this request is
 * still within `limit`, and how many requests remain in the window.
 */
export async function checkRateLimit(
  kv: KVNamespace,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  let record: RateLimitRecord | null;
  try {
    record = await kv.get<RateLimitRecord>(key, "json");
  } catch (cause) {
    throw new CadmusRateLimitError(
      `Failed to read rate limit counter "${key}"`,
      cause,
    );
  }

  const now = Date.now();
  const windowMs = windowSeconds * 1000;

  const next: RateLimitRecord =
    !record || now >= record.resetAt
      ? { count: 1, resetAt: now + windowMs }
      : { count: record.count + 1, resetAt: record.resetAt };

  try {
    await kv.put(key, JSON.stringify(next), {
      expirationTtl: Math.max(1, Math.ceil((next.resetAt - now) / 1000)),
    });
  } catch (cause) {
    throw new CadmusRateLimitError(
      `Failed to write rate limit counter "${key}"`,
      cause,
    );
  }

  return {
    allowed: next.count <= limit,
    remaining: Math.max(0, limit - next.count),
  };
}
