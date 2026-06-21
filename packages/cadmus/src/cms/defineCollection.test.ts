import { describe, expect, it } from "vitest";
import { CadmusCmsError } from "../errors.js";
import { defineCmsConfig, defineCollection } from "./defineCollection.js";
import type { CollectionConfig } from "./types.js";

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
