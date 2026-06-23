import { type CollectionConfig, defineCmsConfig } from "@thebes/cadmus/cms";
import { describe, expect, it } from "vitest";
import { renderSeoTags, seoPlugin } from "./index.js";

const pagesCollection: CollectionConfig = {
  slug: "pages",
  fields: {
    id: { type: "number", autoIncrement: true },
    title: { type: "text", required: true },
    slug: { type: "text", required: true, unique: true },
  },
};

const postsCollection: CollectionConfig = {
  slug: "posts",
  fields: { id: { type: "number", autoIncrement: true } },
};

function resolve(targets: string[]) {
  const config = defineCmsConfig({
    collections: [pagesCollection, postsCollection],
    plugins: [seoPlugin({ collections: targets })],
  });
  const byslug = (slug: string) =>
    // biome-ignore lint/style/noNonNullAssertion: slugs are fixtures
    config.collections.find((c) => c.slug === slug)!;
  return { byslug };
}

// Mirrors how createLocalApi folds beforeChange (sync hooks here).
function runBeforeChange(
  collection: CollectionConfig,
  data: Record<string, unknown>,
): Record<string, unknown> {
  return (collection.hooks?.beforeChange ?? []).reduce(
    (acc, hook) => hook({ data: acc }) as Record<string, unknown>,
    data,
  );
}

describe("seoPlugin — field injection", () => {
  it("injects SEO fields into targeted collections", () => {
    const { byslug } = resolve(["pages"]);
    const pages = byslug("pages");
    expect(pages.fields.metaTitle).toEqual({ type: "text" });
    expect(pages.fields.metaDescription).toEqual({ type: "text" });
    expect(pages.fields.ogImage).toEqual({ type: "upload" });
  });

  it("leaves non-targeted collections untouched", () => {
    const { byslug } = resolve(["pages"]);
    expect(byslug("posts").fields).not.toHaveProperty("metaTitle");
  });

  it("ignores slugs that are not in the config", () => {
    // 'missing' isn't a real collection — must not throw
    expect(() => resolve(["pages", "missing"])).not.toThrow();
  });

  it("does not mutate the input collection fixture", () => {
    resolve(["pages"]);
    expect(pagesCollection.fields).not.toHaveProperty("metaTitle");
  });
});

describe("seoPlugin — metaTitle default hook", () => {
  it("defaults metaTitle from title when blank", () => {
    const { byslug } = resolve(["pages"]);
    const out = runBeforeChange(byslug("pages"), {
      title: "Welcome",
      slug: "welcome",
    });
    expect(out.metaTitle).toBe("Welcome");
  });

  it("keeps an editor-supplied metaTitle", () => {
    const { byslug } = resolve(["pages"]);
    const out = runBeforeChange(byslug("pages"), {
      title: "Welcome",
      metaTitle: "Custom title",
      slug: "welcome",
    });
    expect(out.metaTitle).toBe("Custom title");
  });

  it("preserves any pre-existing beforeChange hooks, running them first", () => {
    const withHook: CollectionConfig = {
      ...pagesCollection,
      hooks: {
        beforeChange: [({ data }) => ({ ...data, title: `${data.title}!` })],
      },
    };
    const config = defineCmsConfig({
      collections: [withHook],
      plugins: [seoPlugin({ collections: ["pages"] })],
    });
    // biome-ignore lint/style/noNonNullAssertion: fixture
    const pages = config.collections.find((c) => c.slug === "pages")!;
    const out = runBeforeChange(pages, { title: "Hi", slug: "hi" });
    // the original hook ran (title got "!"), then metaTitle defaulted from it
    expect(out.title).toBe("Hi!");
    expect(out.metaTitle).toBe("Hi!");
  });
});

describe("renderSeoTags", () => {
  it("prefers metaTitle, then title, then siteName", () => {
    expect(renderSeoTags({ metaTitle: "Meta", title: "Doc" })).toContain(
      "<title>Meta</title>",
    );
    expect(renderSeoTags({ title: "Doc" })).toContain("<title>Doc</title>");
    expect(renderSeoTags({}, { siteName: "Site" })).toContain(
      "<title>Site</title>",
    );
  });

  it("renders description and OG image with fallbacks", () => {
    const out = renderSeoTags(
      { metaDescription: "Desc", ogImage: "https://cdn/x.png" },
      { metaDescription: "Fallback" },
    );
    expect(out).toContain('<meta name="description" content="Desc" />');
    expect(out).toContain('property="og:image" content="https://cdn/x.png"');
  });

  it("falls back to site defaults for description", () => {
    const out = renderSeoTags({ title: "T" }, { metaDescription: "Fallback" });
    expect(out).toContain('content="Fallback"');
  });

  it("HTML-escapes values to prevent injection", () => {
    const out = renderSeoTags({
      title: '"><script>alert(1)</script>',
      metaDescription: "a & b",
    });
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
    expect(out).toContain("a &amp; b");
  });

  it("returns an empty string when there is nothing to render", () => {
    expect(renderSeoTags({})).toBe("");
  });
});
