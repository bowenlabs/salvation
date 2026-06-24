// Copyright (c) 2026 BowenLabs. All rights reserved.
// MIT licensed. See LICENSE in the repo root.
//
// @thebes/cadmea-plugin-redirects
//
// A Cadmea plugin (the `plugin(config) => config` axis). Unlike
// @thebes/cadmea-plugin-seo (which injects fields into named existing
// collections), this plugin adds one whole new collection — analogous to
// Payload's own redirects plugin. The companion `lookupRedirect` helper is
// a plain function the public-site Worker calls per-request, the same
// "helper exported alongside the plugin" shape as cadmea-plugin-seo's
// `renderSeoTags`.
//
// cadmus is a types-only peer — nothing here imports it at runtime.

import type {
  CadmeaPlugin,
  CollectionConfig,
  LocalApi,
} from "@thebes/cadmus/cms";

export interface RedirectsPluginOptions {
  /** Slug for the injected collection. Default: "redirects". */
  collectionSlug?: string;
}

const DEFAULT_SLUG = "redirects";

/** The collection this plugin injects — `from`/`to` are plain paths or
 *  URLs, not validated against each other (an operator may redirect to an
 *  external domain). */
function buildRedirectsCollection(slug: string): CollectionConfig {
  return {
    slug,
    fields: {
      id: { type: "number", autoIncrement: true },
      from: { type: "text", required: true, unique: true },
      to: { type: "text", required: true },
      statusCode: {
        type: "select",
        options: ["301", "302", "307", "308"],
        required: true,
        defaultValue: "301",
      },
      createdAt: { type: "date", mode: "timestamp", defaultValue: "now" },
    },
  };
}

/**
 * Returns a Cadmea plugin that adds a `redirects` collection (or a renamed
 * one via `collectionSlug`) to the config — a no-op if a collection with
 * that slug is already present, so re-applying the plugin (or a consumer
 * that already defines its own `redirects` collection) doesn't collide
 * with `defineCmsConfig`'s duplicate-slug validation.
 *
 * ```ts
 * defineCmsConfig({
 *   collections: [pagesCollection],
 *   plugins: [redirectsPlugin()],
 * })
 * ```
 */
export function redirectsPlugin(
  options: RedirectsPluginOptions = {},
): CadmeaPlugin {
  const slug = options.collectionSlug ?? DEFAULT_SLUG;
  return (config) => {
    if (config.collections.some((collection) => collection.slug === slug)) {
      return config;
    }
    return {
      ...config,
      collections: [...config.collections, buildRedirectsCollection(slug)],
    };
  };
}

/** The subset of a saved redirect document `lookupRedirect` needs. */
export interface RedirectDocument {
  from: string;
  to: string;
  statusCode: "301" | "302" | "307" | "308";
}

/**
 * Looks up a redirect for `path` against the redirects collection's Local
 * API — for the public-site Worker to call per-request (e.g. Astro
 * middleware), before falling through to normal routing. Returns `null`
 * when no redirect matches.
 *
 * Filters in-memory after a plain `find()` rather than requiring a
 * `where` expression built against the consumer's own Drizzle table — a
 * redirects list is operator-curated and expected to stay small (CLAUDE.md's
 * "don't build for scale you don't have"); revisit with an indexed lookup
 * if that assumption stops holding.
 */
export async function lookupRedirect<TContext>(
  // biome-ignore lint/suspicious/noExplicitAny: LocalApi's table generic is erased at this call boundary — callers pass their own concrete LocalApi
  api: LocalApi<any, TContext>,
  context: TContext,
  path: string,
): Promise<RedirectDocument | null> {
  const redirects = (await api.find(context)) as RedirectDocument[];
  return redirects.find((redirect) => redirect.from === path) ?? null;
}
