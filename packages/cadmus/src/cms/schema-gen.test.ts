import { describe, expect, it } from "vitest";
import { CadmusCmsError } from "../errors.js";
import { generateSchemaSource } from "./schema-gen.js";
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

describe("generateSchemaSource", () => {
  it("emits a sqliteTable export named after the collection slug", () => {
    const source = generateSchemaSource({ collections: [pagesCollection] });
    expect(source).toContain('export const pages = sqliteTable("pages"');
  });

  it("emits the autoIncrement number field as an integer primary key", () => {
    const source = generateSchemaSource({ collections: [pagesCollection] });
    expect(source).toContain(
      'id: integer("id").primaryKey({ autoIncrement: true })',
    );
  });

  it("emits non-autoIncrement number fields as real columns", () => {
    const source = generateSchemaSource({
      collections: [
        {
          slug: "counters",
          fields: { count: { type: "number", required: true } },
        },
      ],
    });
    expect(source).toContain('count: real("count").notNull()');
  });

  it("snake-cases column names and preserves notNull/unique", () => {
    const source = generateSchemaSource({ collections: [pagesCollection] });
    expect(source).toContain('slug: text("slug").notNull().unique()');
    expect(source).toContain('createdAt: integer("created_at"');
  });

  it("emits select enum options and the default value", () => {
    const source = generateSchemaSource({ collections: [pagesCollection] });
    expect(source).toContain(
      'status: text("status", { enum: ["draft", "published"] }).notNull().default("draft")',
    );
  });

  it("emits a $defaultFn for a 'now' date default", () => {
    const source = generateSchemaSource({ collections: [pagesCollection] });
    expect(source).toContain(".$defaultFn(() => new Date())");
  });

  it("throws CadmusCmsError for field types not yet implemented", () => {
    expect(() =>
      generateSchemaSource({
        collections: [
          { slug: "people", fields: { isActive: { type: "checkbox" } } },
        ],
      }),
    ).toThrow(CadmusCmsError);
  });

  it("emits upload fields as a plain text column", () => {
    const source = generateSchemaSource({
      collections: [
        {
          slug: "media",
          fields: { fileUrl: { type: "upload", required: true } },
        },
      ],
    });
    expect(source).toContain('fileUrl: text("file_url").notNull()');
  });

  it("emits richText/array fields as a JSON-mode text column typed as JsonValue", () => {
    const source = generateSchemaSource({
      collections: [{ slug: "blocks", fields: { body: { type: "richText" } } }],
    });
    expect(source).toContain(
      'body: text("body", { mode: "json" }).$type<JsonValue>()',
    );
  });

  it("imports the JsonValue type only when a collection actually has a JSON column", () => {
    const withJson = generateSchemaSource({
      collections: [{ slug: "blocks", fields: { body: { type: "richText" } } }],
    });
    expect(withJson).toContain(
      'import type { JsonValue } from "@thebes/cadmus/cms";',
    );

    const withoutJson = generateSchemaSource({
      collections: [pagesCollection],
    });
    expect(withoutJson).not.toContain("JsonValue");
  });

  it("emits a hasMany:false relationship as a plain integer column", () => {
    const source = generateSchemaSource({
      collections: [
        {
          slug: "posts",
          fields: {
            author: {
              type: "relationship",
              relationTo: "users",
              required: true,
            },
          },
        },
      ],
    });
    expect(source).toContain('author: integer("author").notNull()');
  });

  it("emits no publishedVersionId column or versions table for a collection without versions.drafts", () => {
    const source = generateSchemaSource({ collections: [pagesCollection] });
    expect(source).not.toContain("publishedVersionId");
    expect(source).not.toContain("pages_versions");
  });

  it("emits a publishedVersionId column and a versions table when versions.drafts is set", () => {
    const source = generateSchemaSource({
      collections: [{ ...pagesCollection, versions: { drafts: true } }],
    });
    expect(source).toContain(
      'publishedVersionId: integer("published_version_id")',
    );
    expect(source).toContain(
      'export const pages_versions = sqliteTable("pages_versions"',
    );
    expect(source).toContain('parentId: integer("parent_id").notNull()');
    expect(source).toContain(
      'versionData: text("version_data", { mode: "json" }).$type<JsonValue>().notNull()',
    );
    expect(source).toContain(
      'status: text("status", { enum: ["draft", "published"] }).notNull()',
    );
    expect(source).toContain(
      'scheduledAt: integer("scheduled_at", { mode: "timestamp" })',
    );
  });

  it("emits no column for a hasMany:true relationship, plus a join table block", () => {
    const source = generateSchemaSource({
      collections: [
        {
          slug: "posts",
          fields: {
            title: { type: "text", required: true },
            tags: { type: "relationship", relationTo: "tags", hasMany: true },
          },
        },
      ],
    });
    expect(source).not.toContain("tags:");
    expect(source).toContain(
      'export const posts_tags = sqliteTable("posts_tags"',
    );
    expect(source).toContain('posts_id: integer("posts_id").notNull()');
    expect(source).toContain('tags_id: integer("tags_id").notNull()');
  });

  it("flattens a group field into prefixed column source lines", () => {
    const source = generateSchemaSource({
      collections: [
        {
          slug: "orders",
          fields: {
            shippingAddress: {
              type: "group",
              fields: { city: { type: "text", required: true } },
            },
          },
        },
      ],
    });
    expect(source).toContain(
      'shippingAddress_city: text("shipping_address_city").notNull()',
    );
    expect(source).not.toContain("shippingAddress:");
  });

  it("emits a json field as a JSON-mode text column, same as richText/array", () => {
    const source = generateSchemaSource({
      collections: [
        {
          slug: "orders",
          fields: { metadata: { type: "json" } },
        },
      ],
    });
    expect(source).toContain(
      'metadata: text("metadata", { mode: "json" }).$type<JsonValue>()',
    );
  });
});

// Determinism (pt#83 Direction B): the emitted schema must be reproducible so a
// given plugin version yields byte-identical migrations across every consuming
// site — otherwise N sites drift into N migration trails for one upstream change.
describe("generateSchemaSource — determinism (pt#83)", () => {
  const products: CollectionConfig = {
    slug: "products",
    fields: {
      id: { type: "number", autoIncrement: true },
      name: { type: "text", required: true },
    },
  };

  function tableBlock(source: string, slug: string): string {
    const start = source.indexOf(`export const ${slug} = sqliteTable`);
    if (start === -1) throw new Error(`no table for "${slug}"`);
    const end = source.indexOf("\n\n", start);
    return source.slice(start, end === -1 ? undefined : end);
  }

  it("emits byte-identical output for the same config", () => {
    const config = { collections: [pagesCollection, products] };
    expect(generateSchemaSource(config)).toBe(generateSchemaSource(config));
  });

  it("emits a collection's table identically regardless of which other collections are present or their order", () => {
    const alone = generateSchemaSource({ collections: [pagesCollection] });
    const withOthers = generateSchemaSource({
      collections: [products, pagesCollection],
    });
    // The `pages` block is a pure function of the `pages` config, so a plugin's
    // table stays stable across sites that compose different collection sets.
    expect(tableBlock(withOthers, "pages")).toBe(tableBlock(alone, "pages"));
  });

  it("emits a drizzle import list in sorted order (stable regardless of field order)", () => {
    const source = generateSchemaSource({ collections: [pagesCollection] });
    const importLine = source
      .split("\n")
      .find((line) => line.includes('from "drizzle-orm/sqlite-core"'));
    const names = importLine?.match(/\{ (.+) \}/)?.[1].split(", ") ?? [];
    expect(names.length).toBeGreaterThan(0);
    expect(names).toEqual([...names].sort());
  });
});

describe("generateSchemaSource — exclude option (pt#83 Direction B)", () => {
  const products: CollectionConfig = {
    slug: "products",
    fields: { id: { type: "number", autoIncrement: true } },
  };

  it("omits excluded collections so plugin tables leave the site's drizzle-kit diff", () => {
    const source = generateSchemaSource(
      { collections: [pagesCollection, products] },
      { exclude: ["products"] },
    );
    expect(source).toContain('export const pages = sqliteTable("pages"');
    expect(source).not.toContain('sqliteTable("products"');
  });

  it("defaults to emitting every collection when no exclude is given", () => {
    const source = generateSchemaSource({
      collections: [pagesCollection, products],
    });
    expect(source).toContain('sqliteTable("pages"');
    expect(source).toContain('sqliteTable("products"');
  });
});
