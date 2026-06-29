import { describe, expect, it } from "vitest";
import {
  breadcrumbJsonLd,
  personJsonLd,
  productJsonLd,
  serializeJsonLd,
  visualArtworkJsonLd,
  websiteJsonLd,
} from "./schema.js";

describe("visualArtworkJsonLd", () => {
  it("includes an InStock Offer for an available, priced work", () => {
    const node = visualArtworkJsonLd({
      name: "High Desert",
      url: "https://x.com/portfolio/1",
      medium: "Oil on linen",
      creatorName: "Jane Artist",
      price: 5000,
      available: true,
    });
    expect(node["@type"]).toBe("VisualArtwork");
    expect(node.artMedium).toBe("Oil on linen");
    expect(node.creator).toEqual({ "@type": "Person", name: "Jane Artist" });
    expect(node.offers).toMatchObject({
      "@type": "Offer",
      price: 5000,
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
    });
  });

  it("marks a sold work SoldOut and omits the offer entirely when unpriced", () => {
    expect(
      visualArtworkJsonLd({
        name: "Sold One",
        url: "u",
        price: 5000,
        available: false,
      }).offers,
    ).toMatchObject({ availability: "https://schema.org/SoldOut" });
    expect(
      visualArtworkJsonLd({ name: "No price", url: "u" }).offers,
    ).toBeUndefined();
  });

  it("drops empty fields (no null artMedium/creator/image)", () => {
    const node = visualArtworkJsonLd({ name: "Bare", url: "u" });
    expect(node).not.toHaveProperty("artMedium");
    expect(node).not.toHaveProperty("creator");
    expect(node).not.toHaveProperty("image");
  });
});

describe("productJsonLd", () => {
  it("builds a Product with optional brand", () => {
    const node = productJsonLd({
      name: "Print",
      url: "u",
      brandName: "Acme",
    });
    expect(node["@type"]).toBe("Product");
    expect(node.brand).toEqual({ "@type": "Brand", name: "Acme" });
  });
});

describe("breadcrumbJsonLd", () => {
  it("positions items in order", () => {
    const node = breadcrumbJsonLd([
      { name: "Home", url: "https://x.com/" },
      { name: "Portfolio", url: "https://x.com/portfolio" },
    ]);
    expect(node.itemListElement).toEqual([
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: "https://x.com/",
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Portfolio",
        item: "https://x.com/portfolio",
      },
    ]);
  });
});

describe("website/person", () => {
  it("emits sameAs from social urls", () => {
    const node = personJsonLd({
      name: "Jane",
      url: "https://x.com/",
      sameAs: ["https://instagram.com/jane"],
    });
    expect(node.sameAs).toEqual(["https://instagram.com/jane"]);
  });
  it("omits a missing site name", () => {
    expect(websiteJsonLd({ url: "https://x.com/" })).not.toHaveProperty("name");
  });
});

describe("serializeJsonLd", () => {
  it("escapes < to prevent </script> breakout", () => {
    const out = serializeJsonLd({ name: "</script><script>alert(1)" });
    expect(out).not.toContain("</script>");
    expect(out).toContain("\\u003c/script>");
  });
});
