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
