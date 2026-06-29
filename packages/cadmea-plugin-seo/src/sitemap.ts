// Copyright (c) 2026 BowenLabs. All rights reserved.
// MIT licensed. See LICENSE in the repo root.
//
// Pure sitemap serialization — the XML shaping (escaping, lastmod formatting,
// de-duping) kept out of any endpoint so it is unit-testable without a Worker,
// a DB, or a request context.

export interface SitemapUrl {
  /** Absolute path beginning with "/" (joined to `origin` verbatim). */
  path: string;
  /** Last-modified date, if known. Invalid/absent dates omit <lastmod>. */
  lastmod?: Date | null;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Serialize a `<urlset>` from an origin + path list. De-dupes by path, first
 * occurrence wins — so push the entry whose `lastmod` you want to keep first
 * (e.g. a CMS page before the static fallback for the same path). `origin` is
 * scheme+host with no trailing slash.
 */
export function buildSitemapXml(origin: string, urls: SitemapUrl[]): string {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const { path, lastmod } of urls) {
    if (seen.has(path)) continue;
    seen.add(path);
    const loc = escapeXml(`${origin}${path}`);
    const lm =
      lastmod instanceof Date && !Number.isNaN(lastmod.getTime())
        ? `<lastmod>${lastmod.toISOString().slice(0, 10)}</lastmod>`
        : "";
    lines.push(`  <url><loc>${loc}</loc>${lm}</url>`);
  }
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...lines,
    "</urlset>",
    "",
  ].join("\n");
}
