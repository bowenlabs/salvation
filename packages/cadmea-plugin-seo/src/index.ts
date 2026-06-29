// Copyright (c) 2026 BowenLabs. All rights reserved.
// MIT licensed. See LICENSE in the repo root.
//
// @thebes/cadmea-plugin-seo
//
// A Cadmea plugin (the `plugin(config) => config` axis). It injects SEO
// fields into named collections and registers a beforeChange hook that
// defaults `metaTitle` from `title`. The companion `renderSeoTags` helper
// turns a saved document into escaped <head> markup for the public site.
//
// cadmus is a types-only peer — nothing here imports it at runtime.

import type {
  CadmeaPlugin,
  CollectionConfig,
  CollectionHooks,
  FieldConfig,
} from "@thebes/cadmus/cms";

// JSON-LD schema.org builders + pure sitemap serializer.
export * from "./schema.js";
export * from "./sitemap.js";

export interface SeoPluginOptions {
  /** Collection slugs to add SEO fields to. Slugs not present in the
   *  config are ignored (no error) so configs and plugins can evolve
   *  independently. */
  collections: string[];
}

/** Fields this plugin injects into every targeted collection. Stored as
 *  plain columns (text + an `upload` for the OG image) — see
 *  `@thebes/cadmus/cms` codegen for how each maps to D1. */
const SEO_FIELDS: Record<string, FieldConfig> = {
  metaTitle: { type: "text" },
  metaDescription: { type: "text" },
  ogImage: { type: "upload" },
};

/** beforeChange: default `metaTitle` from `title` when the editor left it
 *  blank. Runs before validation (see cadmus/cms hooks), so it also covers
 *  the case where `metaTitle` is required by a stricter downstream config. */
function defaultMetaTitle({
  data,
}: {
  data: Record<string, unknown>;
}): Record<string, unknown> {
  const metaTitle = data.metaTitle;
  const blank =
    metaTitle === undefined || metaTitle === null || metaTitle === "";
  if (blank && typeof data.title === "string" && data.title !== "") {
    return { ...data, metaTitle: data.title };
  }
  return data;
}

function withSeo(collection: CollectionConfig): CollectionConfig {
  const hooks: CollectionHooks = {
    ...collection.hooks,
    beforeChange: [...(collection.hooks?.beforeChange ?? []), defaultMetaTitle],
  };
  return {
    ...collection,
    fields: { ...collection.fields, ...SEO_FIELDS },
    hooks,
  };
}

/**
 * Returns a Cadmea plugin that adds `metaTitle`, `metaDescription`, and
 * `ogImage` to each named collection and wires the metaTitle-default hook.
 *
 * ```ts
 * defineCmsConfig({
 *   collections: [pagesCollection],
 *   plugins: [seoPlugin({ collections: ["pages"] })],
 * })
 * ```
 */
export function seoPlugin(options: SeoPluginOptions): CadmeaPlugin {
  const targets = new Set(options.collections);
  return (config) => ({
    ...config,
    collections: config.collections.map((collection) =>
      targets.has(collection.slug) ? withSeo(collection) : collection,
    ),
  });
}

// --- Public-site rendering -------------------------------------------------

/** The SEO-relevant subset of a saved document. All optional/nullable so a
 *  partially-filled record renders cleanly. */
export interface SeoDocument {
  title?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  ogImage?: string | null;
}

/** Site-wide fallbacks, typically from `site_settings`. */
export interface SeoSiteDefaults {
  siteName?: string | null;
  metaDescription?: string | null;
  defaultOgImageUrl?: string | null;
}

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/**
 * Renders escaped `<head>` markup (`<title>` + description/OG meta) for a
 * document, falling back to site-wide defaults. Output is HTML-escaped, so
 * it is safe to inject via Astro's `set:html` — values are content fields
 * an editor controls and must never break out of the attribute context.
 *
 * Returns an empty string when there is nothing to render.
 */
export function renderSeoTags(
  doc: SeoDocument,
  defaults: SeoSiteDefaults = {},
): string {
  const title = doc.metaTitle || doc.title || defaults.siteName || "";
  const description = doc.metaDescription || defaults.metaDescription || "";
  const ogImage = doc.ogImage || defaults.defaultOgImageUrl || "";

  const tags: string[] = [];
  if (title) {
    tags.push(`<title>${escapeHtml(title)}</title>`);
    tags.push(`<meta property="og:title" content="${escapeHtml(title)}" />`);
  }
  if (description) {
    tags.push(
      `<meta name="description" content="${escapeHtml(description)}" />`,
    );
    tags.push(
      `<meta property="og:description" content="${escapeHtml(description)}" />`,
    );
  }
  if (ogImage) {
    tags.push(`<meta property="og:image" content="${escapeHtml(ogImage)}" />`);
  }
  return tags.join("\n");
}

/**
 * Lower-level `<head>` builder that takes already-resolved values (rather than a
 * saved document). Unlike `renderSeoTags`, it emits the complete, consistent set
 * for any page — canonical, og:type/url/site_name, a Twitter card, and an
 * optional `robots: noindex` — so share previews and canonicals work site-wide.
 * Use this when the consumer has resolved doc fields → page props → site
 * defaults itself; use `renderSeoTags` for the quick doc-based path.
 */
export interface HeadTagsInput {
  /** Full document `<title>` text. */
  title: string;
  /** Meta/OG/Twitter description. Omitted when empty. */
  description?: string | null;
  /** Absolute canonical URL for this page (also used for og:url). */
  canonical: string;
  /** og/twitter title; defaults to `title`. */
  ogTitle?: string | null;
  /** Absolute image URL for og:image / twitter:image. */
  ogImage?: string | null;
  /** og:type — "website" (default) or "article". */
  ogType?: string;
  siteName?: string | null;
  /** Emit `<meta name="robots" content="noindex">`. */
  noindex?: boolean;
}

/** Build the escaped `<head>` meta/OG/Twitter/canonical markup for one page. */
export function buildHeadTags(input: HeadTagsInput): string {
  const {
    title,
    description,
    canonical,
    ogImage,
    ogType = "website",
    siteName,
    noindex,
  } = input;
  const ogTitle = input.ogTitle || title;
  const tags: string[] = [`<title>${escapeHtml(title)}</title>`];

  if (noindex) tags.push('<meta name="robots" content="noindex" />');
  tags.push(`<link rel="canonical" href="${escapeHtml(canonical)}" />`);
  if (description) {
    tags.push(
      `<meta name="description" content="${escapeHtml(description)}" />`,
    );
  }

  // Open Graph
  tags.push(`<meta property="og:type" content="${escapeHtml(ogType)}" />`);
  tags.push(`<meta property="og:url" content="${escapeHtml(canonical)}" />`);
  tags.push(`<meta property="og:title" content="${escapeHtml(ogTitle)}" />`);
  if (description) {
    tags.push(
      `<meta property="og:description" content="${escapeHtml(description)}" />`,
    );
  }
  if (siteName) {
    tags.push(
      `<meta property="og:site_name" content="${escapeHtml(siteName)}" />`,
    );
  }
  if (ogImage) {
    tags.push(`<meta property="og:image" content="${escapeHtml(ogImage)}" />`);
  }

  // Twitter — large image when one is available, else a plain summary card.
  tags.push(
    `<meta name="twitter:card" content="${ogImage ? "summary_large_image" : "summary"}" />`,
  );
  tags.push(`<meta name="twitter:title" content="${escapeHtml(ogTitle)}" />`);
  if (description) {
    tags.push(
      `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
    );
  }
  if (ogImage) {
    tags.push(`<meta name="twitter:image" content="${escapeHtml(ogImage)}" />`);
  }

  return tags.join("\n");
}
