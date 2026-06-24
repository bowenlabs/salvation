import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  cmsConfigToSchema,
  collectionSearchTableName,
  collectionSearchTableSQL,
  collectionToTable,
  collectionVersionsTable,
  extractSearchText,
  relationshipJoinTables,
} from "./codegen.js";
import type { CollectionConfig } from "./types.js";

// Mirrors today's hand-written app/core/db/schema.ts `pages` table
// exactly (id/title/slug/status/createdAt) — see plan for why this is the
// reproduction target rather than CLAUDE.md's fuller documented spec.
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

describe("collectionToTable", () => {
  it("produces a table with exactly the pages columns, snake-cased", () => {
    const table = collectionToTable(pagesCollection);
    const columns = getTableColumns(table);
    expect(Object.keys(columns).sort()).toEqual(
      ["id", "title", "slug", "status", "createdAt"].sort(),
    );
    expect(columns.createdAt.name).toBe("created_at");
  });

  it("makes the autoIncrement number field the primary key", () => {
    const table = collectionToTable(pagesCollection);
    const columns = getTableColumns(table);
    expect(columns.id.primary).toBe(true);
    expect(columns.id.dataType).toBe("number");
  });

  it("marks slug as notNull and unique", () => {
    const table = collectionToTable(pagesCollection);
    const columns = getTableColumns(table);
    expect(columns.slug.notNull).toBe(true);
    expect(columns.slug.isUnique).toBe(true);
  });

  it("gives status the correct enum, notNull, and default", () => {
    const table = collectionToTable(pagesCollection);
    const columns = getTableColumns(table);
    expect(columns.status.enumValues).toEqual(["draft", "published"]);
    expect(columns.status.notNull).toBe(true);
    expect(columns.status.default).toBe("draft");
  });

  it("gives createdAt an integer timestamp column with a default fn", () => {
    const table = collectionToTable(pagesCollection);
    const columns = getTableColumns(table);
    expect(columns.createdAt.dataType).toBe("date");
    expect(columns.createdAt.hasDefault).toBe(true);
    expect(columns.createdAt.defaultFn?.()).toBeInstanceOf(Date);
  });

  it("leaves select fields without a default when none is configured", () => {
    const table = collectionToTable({
      slug: "no_default",
      fields: {
        choice: { type: "select", options: ["a", "b"] },
      },
    });
    const columns = getTableColumns(table);
    expect(columns.choice.hasDefault).toBe(false);
  });

  it("marks a non-autoIncrement required number field notNull without primaryKey", () => {
    const table = collectionToTable({
      slug: "counters",
      fields: {
        count: { type: "number", required: true },
      },
    });
    const columns = getTableColumns(table);
    expect(columns.count.notNull).toBe(true);
    expect(columns.count.primary).toBe(false);
  });

  it("backs non-autoIncrement number fields with a SQLite real column", () => {
    const table = collectionToTable({
      slug: "counters",
      fields: {
        count: { type: "number", required: true },
      },
    });
    const columns = getTableColumns(table);
    expect(columns.count.columnType).toBe("SQLiteReal");
  });

  it("keeps the autoIncrement number field as a SQLite integer column", () => {
    const table = collectionToTable(pagesCollection);
    const columns = getTableColumns(table);
    expect(columns.id.columnType).toBe("SQLiteInteger");
  });

  it("stores checkbox fields as a boolean-mode integer column", () => {
    const table = collectionToTable({
      slug: "people",
      fields: { isActive: { type: "checkbox", required: true } },
    });
    const columns = getTableColumns(table);
    expect(columns.isActive.columnType).toBe("SQLiteBoolean");
    expect(columns.isActive.notNull).toBe(true);
  });

  it("stores upload fields as a text column, same shape as text", () => {
    const table = collectionToTable({
      slug: "media",
      fields: { fileUrl: { type: "upload", required: true } },
    });
    const columns = getTableColumns(table);
    expect(columns.fileUrl.columnType).toBe("SQLiteText");
    expect(columns.fileUrl.notNull).toBe(true);
  });

  it("stores richText fields as a JSON column", () => {
    const table = collectionToTable({
      slug: "blocks",
      fields: { body: { type: "richText" } },
    });
    const columns = getTableColumns(table);
    expect(columns.body.columnType).toBe("SQLiteTextJson");
  });

  it("stores array fields as a JSON column", () => {
    const table = collectionToTable({
      slug: "forms",
      fields: {
        fields: { type: "array", fields: { label: { type: "text" } } },
      },
    });
    const columns = getTableColumns(table);
    expect(columns.fields.columnType).toBe("SQLiteTextJson");
  });

  it("stores a hasMany:false relationship as a plain integer column", () => {
    const table = collectionToTable({
      slug: "posts",
      fields: {
        author: { type: "relationship", relationTo: "users", required: true },
      },
    });
    const columns = getTableColumns(table);
    expect(columns.author.columnType).toBe("SQLiteInteger");
    expect(columns.author.notNull).toBe(true);
    expect(columns.author.primary).toBe(false);
  });

  it("adds no column for a hasMany:true relationship field", () => {
    const config: CollectionConfig = {
      slug: "posts",
      fields: {
        title: { type: "text", required: true },
        tags: { type: "relationship", relationTo: "tags", hasMany: true },
      },
    };
    const table = collectionToTable(config);
    const columns = getTableColumns(table);
    expect(Object.keys(columns)).toEqual(["title"]);
  });
});

describe("collectionToTable versioning", () => {
  it("adds no publishedVersionId column when versions.drafts is unset", () => {
    const table = collectionToTable(pagesCollection);
    const columns = getTableColumns(table);
    expect(columns.publishedVersionId).toBeUndefined();
  });

  it("adds a nullable publishedVersionId integer column when versions.drafts is true", () => {
    const table = collectionToTable({
      ...pagesCollection,
      versions: { drafts: true },
    });
    const columns = getTableColumns(table);
    expect(columns.publishedVersionId.columnType).toBe("SQLiteInteger");
    expect(columns.publishedVersionId.notNull).toBe(false);
  });
});

describe("collectionVersionsTable", () => {
  it("builds a versions table keyed by parentId with a JSON snapshot and status", () => {
    const table = collectionVersionsTable(pagesCollection);
    const columns = getTableColumns(table);
    expect(Object.keys(columns).sort()).toEqual(
      ["id", "parentId", "versionData", "status", "createdAt"].sort(),
    );
    expect(columns.id.primary).toBe(true);
    expect(columns.parentId.notNull).toBe(true);
    expect(columns.versionData.columnType).toBe("SQLiteTextJson");
    expect(columns.versionData.notNull).toBe(true);
    expect(columns.status.enumValues).toEqual(["draft", "published"]);
  });
});

describe("relationshipJoinTables", () => {
  it("builds a join table for a hasMany relationship field", () => {
    const config: CollectionConfig = {
      slug: "posts",
      fields: {
        title: { type: "text", required: true },
        tags: { type: "relationship", relationTo: "tags", hasMany: true },
      },
    };
    const joinTables = relationshipJoinTables(config);
    expect(Object.keys(joinTables)).toEqual(["posts_tags"]);

    const columns = getTableColumns(joinTables.posts_tags);
    expect(Object.keys(columns).sort()).toEqual(["posts_id", "tags_id"]);
    expect(columns.posts_id.notNull).toBe(true);
    expect(columns.tags_id.notNull).toBe(true);
  });

  it("returns no join tables when there are no hasMany relationship fields", () => {
    const joinTables = relationshipJoinTables(pagesCollection);
    expect(Object.keys(joinTables)).toEqual([]);
  });
});

describe("cmsConfigToSchema", () => {
  it("keys the generated schema by collection slug", () => {
    const schema = cmsConfigToSchema({ collections: [pagesCollection] });
    expect(Object.keys(schema)).toEqual(["pages"]);

    const directColumns = getTableColumns(collectionToTable(pagesCollection));
    const schemaColumns = getTableColumns(schema.pages);
    expect(Object.keys(schemaColumns)).toEqual(Object.keys(directColumns));
  });

  it("includes the versions table alongside the main table when versions.drafts is set", () => {
    const schema = cmsConfigToSchema({
      collections: [{ ...pagesCollection, versions: { drafts: true } }],
    });
    expect(Object.keys(schema).sort()).toEqual(["pages", "pages_versions"]);
  });

  it("includes hasMany relationship join tables alongside the main tables", () => {
    const config: CollectionConfig = {
      slug: "posts",
      fields: {
        title: { type: "text", required: true },
        tags: { type: "relationship", relationTo: "tags", hasMany: true },
      },
    };
    const schema = cmsConfigToSchema({ collections: [config] });
    expect(Object.keys(schema).sort()).toEqual(["posts", "posts_tags"]);
  });
});

describe("collectionSearchTableName / collectionSearchTableSQL", () => {
  it("returns an empty string when the collection has no search config", () => {
    expect(collectionSearchTableSQL(pagesCollection)).toBe("");
  });

  it("names the FTS5 table after the collection slug", () => {
    expect(collectionSearchTableName(pagesCollection)).toBe("pages_fts");
  });

  it("emits a CREATE VIRTUAL TABLE statement with one column per search field", () => {
    const config: CollectionConfig = {
      ...pagesCollection,
      search: { fields: ["title", "slug"] },
    };
    expect(collectionSearchTableSQL(config)).toBe(
      'CREATE VIRTUAL TABLE IF NOT EXISTS "pages_fts" USING fts5("title", "slug");',
    );
  });
});

describe("extractSearchText", () => {
  it("returns one string per search field, in order", () => {
    const config: CollectionConfig = {
      ...pagesCollection,
      search: { fields: ["title", "slug"] },
    };
    const values = extractSearchText(config, { title: "Home", slug: "home" });
    expect(values).toEqual(["Home", "home"]);
  });

  it("flattens richText (TipTap JSON) fields to plain text", () => {
    const config: CollectionConfig = {
      slug: "posts",
      fields: { body: { type: "richText" } },
      search: { fields: ["body"] },
    };
    const doc = {
      body: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "Hello" },
              { type: "text", text: "world" },
            ],
          },
        ],
      },
    };
    expect(extractSearchText(config, doc)).toEqual(["Hello world"]);
  });

  it("returns an empty string for a missing or non-string field value", () => {
    const config: CollectionConfig = {
      ...pagesCollection,
      search: { fields: ["title"] },
    };
    expect(extractSearchText(config, {})).toEqual([""]);
  });
});

describe("group and json field types", () => {
  const ordersCollection: CollectionConfig = {
    slug: "orders",
    fields: {
      id: { type: "number", autoIncrement: true },
      orderNumber: { type: "text", required: true, unique: true },
      shippingAddress: {
        type: "group",
        fields: {
          firstName: { type: "text", required: true },
          city: { type: "text" },
        },
      },
      metadata: { type: "json" },
    },
  };

  it("flattens a group field into prefixed, snake_cased columns", () => {
    const table = collectionToTable(ordersCollection);
    const columns = getTableColumns(table);
    expect(Object.keys(columns).sort()).toEqual(
      [
        "id",
        "orderNumber",
        "shippingAddress_firstName",
        "shippingAddress_city",
        "metadata",
      ].sort(),
    );
    expect(columns.shippingAddress_firstName.name).toBe(
      "shipping_address_first_name",
    );
    expect(columns.shippingAddress_firstName.notNull).toBe(true);
    expect(columns.shippingAddress_city.notNull).toBe(false);
  });

  it("gives a json field a JSON-mode text column, same as richText/array", () => {
    const table = collectionToTable(ordersCollection);
    const columns = getTableColumns(table);
    expect(columns.metadata.dataType).toBe("json");
  });
});
