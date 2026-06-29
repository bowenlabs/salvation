// Copyright (c) 2026 BowenLabs. All rights reserved.
// MIT licensed. See LICENSE in the repo root.
//
// JSON-LD structured data — rich results in search and grounding for AI answer
// engines (AEO). Pure builders returning plain schema.org objects; consumers
// serialize them into `<script type="application/ld+json">` via serializeJsonLd.

type JsonLd = Record<string, unknown>;

// Drop null/undefined/""/[] so emitted JSON stays minimal and valid.
function compact(obj: Record<string, unknown>): JsonLd {
  const out: JsonLd = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    out[key] = value;
  }
  return out;
}

export function websiteJsonLd(opts: {
  siteName?: string | null;
  url: string;
}): JsonLd {
  return compact({
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: opts.siteName ?? undefined,
    url: opts.url,
  });
}

export function personJsonLd(opts: {
  name?: string | null;
  url: string;
  image?: string | null;
  sameAs?: string[];
}): JsonLd {
  return compact({
    "@context": "https://schema.org",
    "@type": "Person",
    name: opts.name ?? undefined,
    url: opts.url,
    image: opts.image ?? undefined,
    sameAs: opts.sameAs ?? undefined,
  });
}

export interface VisualArtworkInput {
  name: string;
  url: string;
  image?: string | null;
  description?: string | null;
  medium?: string | null;
  creatorName?: string | null;
  /** Price in major units (e.g. dollars). */
  price?: number | null;
  currency?: string;
  available?: boolean;
}

export function visualArtworkJsonLd(art: VisualArtworkInput): JsonLd {
  const offers =
    art.price && art.price > 0
      ? compact({
          "@type": "Offer",
          price: art.price,
          priceCurrency: art.currency ?? "USD",
          availability: art.available
            ? "https://schema.org/InStock"
            : "https://schema.org/SoldOut",
          url: art.url,
        })
      : undefined;
  return compact({
    "@context": "https://schema.org",
    "@type": "VisualArtwork",
    name: art.name,
    url: art.url,
    image: art.image ?? undefined,
    description: art.description ?? undefined,
    artMedium: art.medium ?? undefined,
    creator: art.creatorName
      ? { "@type": "Person", name: art.creatorName }
      : undefined,
    offers,
  });
}

export interface ProductInput {
  name: string;
  url: string;
  image?: string | null;
  description?: string | null;
  brandName?: string | null;
}

export function productJsonLd(product: ProductInput): JsonLd {
  return compact({
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    url: product.url,
    image: product.image ?? undefined,
    description: product.description ?? undefined,
    brand: product.brandName
      ? { "@type": "Brand", name: product.brandName }
      : undefined,
  });
}

export function breadcrumbJsonLd(
  items: { name: string; url: string }[],
): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

/**
 * Serialize for a `<script type="application/ld+json">`. Escapes `<` so a value
 * containing `</script>` can't break out of the script element.
 */
export function serializeJsonLd(data: JsonLd | JsonLd[]): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
