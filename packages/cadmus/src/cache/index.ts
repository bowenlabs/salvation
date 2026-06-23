// Copyright (c) 2026 BowenLabs. All rights reserved.
// Cadmus is MIT licensed. See LICENSE in the repo root.
//
// @thebes/cadmus/cache
//
// Cloudflare Cache API wrapper with a dev-mode bypass. `caches.default`
// has been confirmed available under `wrangler dev` in current
// wrangler/workerd versions (see DECISIONS.md, 2026-06-19) — this bypass
// is defensive code for older versions and non-Workers test runtimes
// (e.g. vitest-pool-workers), not something every dev request hits.

// `@cloudflare/workers-types` never declares `caches.default` — that
// Workers-runtime extension to the standard CacheStorage API is only ever
// typed via wrangler's own per-project generated worker-configuration.d.ts,
// not the static npm package. Cadmus ships standalone, so it declares the
// minimal ambient extension itself rather than depending on a consumer's
// generated types.
declare global {
  interface CacheStorage {
    readonly default: Cache;
  }
}

const isDev =
  typeof caches === "undefined" || typeof caches.default === "undefined";

export async function purgeCache(url: string): Promise<void> {
  if (isDev) {
    console.log(`[cache] DEV — skipping purge: ${url}`);
    return;
  }
  try {
    await caches.default.delete(new Request(url));
  } catch (err) {
    console.warn("[cache] Purge failed:", err);
  }
}
