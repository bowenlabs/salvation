import { describe, expect, it } from "vitest";
import { buildSitemapXml } from "./sitemap.js";

describe("buildSitemapXml", () => {
  it("renders a valid urlset with loc + lastmod (date only)", () => {
    const xml = buildSitemapXml("https://example.com", [
      { path: "/", lastmod: new Date("2026-06-01T12:00:00Z") },
      { path: "/portfolio/1" },
    ]);
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain(
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    );
    expect(xml).toContain(
      "<loc>https://example.com/</loc><lastmod>2026-06-01</lastmod>",
    );
    expect(xml).toContain("<loc>https://example.com/portfolio/1</loc>");
    expect(xml.trimEnd().endsWith("</urlset>")).toBe(true);
  });

  it("de-dupes by path, keeping the first occurrence's lastmod", () => {
    const xml = buildSitemapXml("https://x.com", [
      { path: "/", lastmod: new Date("2026-01-01T00:00:00Z") },
      { path: "/" },
    ]);
    expect(xml.match(/<loc>https:\/\/x\.com\/<\/loc>/g)).toHaveLength(1);
    expect(xml).toContain("<lastmod>2026-01-01</lastmod>");
  });

  it("escapes XML metacharacters in the loc", () => {
    const xml = buildSitemapXml("https://x.com", [{ path: "/s?a=1&b=2" }]);
    expect(xml).toContain("a=1&amp;b=2");
    expect(xml).not.toContain("a=1&b=2");
  });

  it("omits <lastmod> when absent or an invalid date", () => {
    const xml = buildSitemapXml("https://x.com", [
      { path: "/a" },
      { path: "/b", lastmod: new Date("nonsense") },
      { path: "/c", lastmod: null },
    ]);
    expect(xml).not.toContain("<lastmod>");
  });

  it("renders an empty but valid urlset for no urls", () => {
    const xml = buildSitemapXml("https://x.com", []);
    expect(xml).toContain("<urlset");
    expect(xml).toContain("</urlset>");
    expect(xml).not.toContain("<url>");
  });
});
