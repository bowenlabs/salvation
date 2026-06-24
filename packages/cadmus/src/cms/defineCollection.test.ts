import { describe, expect, it } from "vitest";
import { CadmusCmsError } from "../errors.js";
import { defineCmsConfig, defineCollection } from "./defineCollection.js";
import type { CadmeaPlugin, CollectionConfig } from "./types.js";

const pagesCollection: CollectionConfig = {
  slug: "pages",
  fields: {
    id: { type: "number", autoIncrement: true },
    title: { type: "text", required: true },
    slug: { type: "text", required: true, unique: true },
    status: {
      type: "select",
      options: ["draft", "published"],
      required: true,
      defaultValue: "draft",
    },
    createdAt: { type: "date", mode: "timestamp", defaultValue: "now" },
  },
};

describe("defineCollection", () => {
  it("returns a valid config unchanged", () => {
    expect(defineCollection(pagesCollection)).toBe(pagesCollection);
  });

  it("throws CadmusCmsError when slug is missing", () => {
    expect(() =>
      defineCollection({ slug: "", fields: pagesCollection.fields }),
    ).toThrow(CadmusCmsError);
  });

  it("throws CadmusCmsError when fields is empty", () => {
    expect(() => defineCollection({ slug: "empty", fields: {} })).toThrow(
      CadmusCmsError,
    );
  });

  it("throws CadmusCmsError on an unrecognized field type", () => {
    expect(() =>
      defineCollection({
        slug: "bad",
        // biome-ignore lint/suspicious/noExplicitAny: simulating a config from an untyped source
        fields: { foo: { type: "not-a-real-type" } as any },
      }),
    ).toThrow(CadmusCmsError);
  });

  it("throws CadmusCmsError when a relationship field has no relationTo", () => {
    expect(() =>
      defineCollection({
        slug: "posts",
        // biome-ignore lint/suspicious/noExplicitAny: simulating a config missing the required relationTo
        fields: { author: { type: "relationship" } as any },
      }),
    ).toThrow(CadmusCmsError);
  });

  it("throws CadmusCmsError when an array field has no nested fields", () => {
    expect(() =>
      defineCollection({
        slug: "forms",
        fields: { fields: { type: "array", fields: {} } },
      }),
    ).toThrow(CadmusCmsError);
  });

  it("accepts a search config over text/richText/upload fields", () => {
    const config: CollectionConfig = {
      slug: "posts",
      fields: {
        title: { type: "text", required: true },
        body: { type: "richText" },
        cover: { type: "upload" },
      },
      search: { fields: ["title", "body", "cover"] },
    };
    expect(defineCollection(config)).toBe(config);
  });

  it("throws CadmusCmsError when search.fields references an unknown field", () => {
    expect(() =>
      defineCollection({
        slug: "posts",
        fields: { title: { type: "text" } },
        search: { fields: ["missing"] },
      }),
    ).toThrow(CadmusCmsError);
  });

  it("throws CadmusCmsError when search.fields references a non-indexable field type", () => {
    expect(() =>
      defineCollection({
        slug: "posts",
        fields: {
          title: { type: "text" },
          views: { type: "number" },
        },
        search: { fields: ["views"] },
      }),
    ).toThrow(CadmusCmsError);
  });

  it("accepts access and hooks config unchanged — reserved, not enforced (issue #16 step 7)", () => {
    const config: CollectionConfig = {
      slug: "posts",
      fields: { title: { type: "text", required: true } },
      access: { create: () => false },
      hooks: { beforeChange: [({ data }) => data] },
    };
    expect(defineCollection(config)).toBe(config);
  });
});

describe("defineCmsConfig", () => {
  it("returns a single valid collection config unchanged", () => {
    const config = { collections: [pagesCollection] };
    expect(defineCmsConfig(config)).toBe(config);
  });

  it("throws CadmusCmsError on duplicate collection slugs", () => {
    expect(() =>
      defineCmsConfig({
        collections: [pagesCollection, pagesCollection],
      }),
    ).toThrow(CadmusCmsError);
  });
});

describe("defineCmsConfig plugins", () => {
  it("runs a plugin that injects a field, without mutating the input", () => {
    const addField: CadmeaPlugin = (config) => ({
      ...config,
      collections: config.collections.map((c) => ({
        ...c,
        fields: { ...c.fields, injected: { type: "text" } },
      })),
    });

    const resolved = defineCmsConfig({
      collections: [pagesCollection],
      plugins: [addField],
    });

    expect(resolved.collections[0]?.fields.injected).toEqual({ type: "text" });
    // the original fixture is untouched — plugins return new objects
    expect(pagesCollection.fields).not.toHaveProperty("injected");
  });

  it("runs plugins in array order, each fed the previous one's output", () => {
    const order: string[] = [];
    const a: CadmeaPlugin = (c) => {
      order.push("a");
      return c;
    };
    const b: CadmeaPlugin = (c) => {
      order.push("b");
      return c;
    };

    defineCmsConfig({ collections: [pagesCollection], plugins: [a, b] });
    expect(order).toEqual(["a", "b"]);
  });

  it("validates the resolved config, not the input — a plugin that emits a duplicate slug throws", () => {
    const duplicate: CadmeaPlugin = (config) => ({
      ...config,
      collections: [
        ...config.collections,
        // biome-ignore lint/style/noNonNullAssertion: fixture always has [0]
        { ...config.collections[0]!, slug: "pages" },
      ],
    });

    // the input is a single valid collection; only the plugin's output is invalid
    expect(() =>
      defineCmsConfig({ collections: [pagesCollection], plugins: [duplicate] }),
    ).toThrow(CadmusCmsError);
  });

  it("returns the input by reference when no plugins are configured", () => {
    const config = { collections: [pagesCollection] };
    expect(defineCmsConfig(config)).toBe(config);
  });
});

describe("group and json field validation", () => {
  it("accepts a valid group field", () => {
    const config: CollectionConfig = {
      slug: "orders",
      fields: {
        shippingAddress: {
          type: "group",
          fields: { city: { type: "text" } },
        },
      },
    };
    expect(defineCollection(config)).toBe(config);
  });

  it("accepts a valid json field", () => {
    const config: CollectionConfig = {
      slug: "orders",
      fields: { metadata: { type: "json" } },
    };
    expect(defineCollection(config)).toBe(config);
  });

  it("throws CadmusCmsError when a group field has no nested fields", () => {
    expect(() =>
      defineCollection({
        slug: "orders",
        fields: { shippingAddress: { type: "group", fields: {} } },
      }),
    ).toThrow(CadmusCmsError);
  });

  it("throws CadmusCmsError when a group field's nested field has an unrecognized type", () => {
    expect(() =>
      defineCollection({
        slug: "orders",
        fields: {
          shippingAddress: {
            type: "group",
            // biome-ignore lint/suspicious/noExplicitAny: simulating a config from an untyped source
            fields: { city: { type: "not-a-real-type" } as any },
          },
        },
      }),
    ).toThrow(CadmusCmsError);
  });
});
