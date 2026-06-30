# @thebes/cadmea-plugin-seo

SEO plugin for [Cadmea](https://github.com/bowenlabs/project-thebes). It adds
meta/OG fields to your collections and renders the matching `<head>` tags on the
public site — the V8-native equivalent of `@payloadcms/plugin-seo`.

This is a **Cadmea plugin** — a `plugin(config) => config` transform on the
`@thebes/cadmus/cms` config. `@thebes/cadmus` is a types-only peer; nothing
here ships at runtime except your own field data.

```bash
pnpm add @thebes/cadmea-plugin-seo
```

## Add it to your config

```ts
import { defineCmsConfig } from "@thebes/cadmus/cms";
import { seoPlugin } from "@thebes/cadmea-plugin-seo";

export const cmsConfig = defineCmsConfig({
  collections: [pagesCollection],
  plugins: [seoPlugin({ collections: ["pages"] })],
});
```

For each named collection the plugin:

- injects `metaTitle` (text), `metaDescription` (text), and `ogImage` (upload)
  fields — so they flow to the DB schema, the admin form, and the Local API
  automatically;
- registers a `beforeChange` hook that defaults `metaTitle` from the document's
  `title` when the editor leaves it blank.

Collection slugs that aren't in the config are ignored, so config and plugin
versions can drift without breaking. After adding the plugin, run
`pnpm db:generate && pnpm db:migrate` to add the new columns.

## Render the tags

`renderSeoTags(doc, defaults)` returns HTML-escaped `<head>` markup, falling
back to site-wide defaults (typically from `site_settings`). It is safe to
inject via Astro's `set:html` because every value is escaped.

```astro
---
import { renderSeoTags } from "@thebes/cadmea-plugin-seo";
const tags = renderSeoTags(page, {
  siteName: settings?.siteName,
  metaDescription: settings?.metaDescription,
  defaultOgImageUrl: settings?.defaultOgImageUrl,
});
---
<head>
  {tags ? <Fragment set:html={tags} /> : <title>{page.title}</title>}
</head>
```

Title resolution is `metaTitle → title → siteName`; description and OG image
fall back to the site defaults. Returns `""` when there is nothing to render.

For pages where the consumer has already resolved doc fields → page props →
site defaults itself, `buildHeadTags(input)` is the lower-level escaped builder
`renderSeoTags` wraps — it takes an explicit `title` / `canonical` / `ogImage` /
`ogType` / `noindex` (`HeadTagsInput`) and emits the same `<title>` + canonical
+ OG/Twitter markup.

## Structured data (JSON-LD)

Pure builders that return plain schema.org objects for rich results in search
and grounding in AI answer engines (AEO). Serialize one or an array with
`serializeJsonLd` (it escapes `<` so a value can't break out of the script
element) and inject into a `<script type="application/ld+json">`.

- `websiteJsonLd({ siteName?, url })` — `WebSite`
- `personJsonLd({ name?, url, image?, sameAs? })` — `Person`
- `visualArtworkJsonLd(art)` — `VisualArtwork`, with an `Offer` when `price > 0`
- `productJsonLd(product)` — `Product`, with an optional `Brand`
- `breadcrumbJsonLd(items)` — `BreadcrumbList` from `{ name, url }[]`

```astro
---
import { websiteJsonLd, serializeJsonLd } from "@thebes/cadmea-plugin-seo";
const ld = serializeJsonLd(websiteJsonLd({ siteName: settings?.siteName, url: origin }));
---
<script type="application/ld+json" set:html={ld} />
```

Builders drop `null`/`undefined`/`""`/empty-array fields, so emitted JSON stays
minimal and valid.

## Sitemap

`buildSitemapXml(origin, urls)` serializes a `<urlset>` from an origin
(scheme+host, no trailing slash) and a list of `SitemapUrl` (`{ path, lastmod? }`).
It de-dupes by `path` (first occurrence wins, so push the entry whose `lastmod`
you want to keep first) and omits `<lastmod>` for absent/invalid dates. Serve
it from a Worker/Astro endpoint at `/sitemap.xml` with
`Content-Type: application/xml`.

```ts
import { buildSitemapXml } from "@thebes/cadmea-plugin-seo";

const xml = buildSitemapXml("https://example.com", [
  { path: "/", lastmod: new Date() },
  { path: "/about", lastmod: page.updatedAt },
]);
```

## License

MIT © BowenLabs
