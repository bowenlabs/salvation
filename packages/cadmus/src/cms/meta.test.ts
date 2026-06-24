import { describe, expect, it } from "vitest";
import { getCollectionsMeta } from "./meta.js";
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

describe("getCollectionsMeta", () => {
  it("returns a serializable slug + fields entry per collection", () => {
    const meta = getCollectionsMeta({ collections: [pagesCollection] });
    expect(meta).toEqual([
      { slug: "pages", fields: pagesCollection.fields, searchable: false },
    ]);
  });

  it("marks a collection searchable when it declares search.fields", () => {
    const searchable: CollectionConfig = {
      ...pagesCollection,
      search: { fields: ["title"] },
    };
    const meta = getCollectionsMeta({ collections: [searchable] });
    expect(meta[0].searchable).toBe(true);
  });

  it("preserves collection order across multiple collections", () => {
    const other: CollectionConfig = {
      slug: "other",
      fields: pagesCollection.fields,
    };
    const meta = getCollectionsMeta({ collections: [pagesCollection, other] });
    expect(meta.map((m) => m.slug)).toEqual(["pages", "other"]);
  });
});
