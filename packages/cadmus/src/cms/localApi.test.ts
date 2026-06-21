import { env } from "cloudflare:test";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CadmusCmsError } from "../errors.js";
import { collectionToTable } from "./codegen.js";
import { createLocalApi } from "./localApi.js";
import type { CollectionConfig } from "./types.js";

// Mirrors the pagesCollection fixture in codegen.test.ts — duplicated
// locally rather than shared, keeping each test file self-contained.
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

const pagesTable = collectionToTable(pagesCollection);
const db = drizzle(env.DB);
const localApi = createLocalApi(db, pagesTable, pagesCollection);

beforeEach(async () => {
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS pages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'draft',
      created_at INTEGER
    )
  `);
});

afterEach(async () => {
  await db.run(sql`DROP TABLE IF EXISTS pages`);
});

describe("createLocalApi", () => {
  it("creates a row and reads it back by id", async () => {
    const created = await localApi.create({ title: "Home", slug: "home" });
    expect(created.id).toBeTypeOf("number");
    expect(created.status).toBe("draft");

    const found = await localApi.findByID(created.id);
    expect(found).toEqual(created);
  });

  it("find() with no options returns all rows", async () => {
    await localApi.create({ title: "Home", slug: "home" });
    await localApi.create({ title: "About", slug: "about" });

    const rows = await localApi.find();
    expect(rows).toHaveLength(2);
  });

  it("find({ where }) filters rows", async () => {
    await localApi.create({
      title: "Home",
      slug: "home",
      status: "published",
    });
    await localApi.create({ title: "Draft page", slug: "draft-page" });

    const { eq } = await import("drizzle-orm");
    const rows = await localApi.find({
      where: eq(pagesTable.status, "published"),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.slug).toBe("home");
  });

  it("find({ depth: 1 }) throws — relationship resolution is reserved, not yet implemented", async () => {
    await expect(
      // depth is typed as `0 | undefined`; cast simulates a
      // non-type-checked caller passing an unsupported value.
      localApi.find({ depth: 1 } as Parameters<typeof localApi.find>[0]),
    ).rejects.toThrow(CadmusCmsError);
  });

  it("update() changes only the specified fields", async () => {
    const created = await localApi.create({ title: "Home", slug: "home" });
    const updated = await localApi.update(created.id, {
      status: "published",
    });
    expect(updated.title).toBe("Home");
    expect(updated.status).toBe("published");
  });

  it("deleteByID() removes the row", async () => {
    const created = await localApi.create({ title: "Home", slug: "home" });
    await localApi.deleteByID(created.id);
    await expect(localApi.findByID(created.id)).rejects.toThrow(CadmusCmsError);
  });

  it("findByID throws CadmusCmsError for a missing id", async () => {
    await expect(localApi.findByID(999)).rejects.toThrow(CadmusCmsError);
  });

  it("update throws CadmusCmsError for a missing id, with no side effects", async () => {
    await expect(localApi.update(999, { title: "Nope" })).rejects.toThrow(
      CadmusCmsError,
    );
    expect(await localApi.find()).toHaveLength(0);
  });

  it("deleteByID throws CadmusCmsError for a missing id", async () => {
    await expect(localApi.deleteByID(999)).rejects.toThrow(CadmusCmsError);
  });

  it("create throws CadmusCmsError when a required field is missing", async () => {
    await expect(
      // @ts-expect-error intentionally omitting required `title`
      localApi.create({ slug: "no-title" }),
    ).rejects.toThrow(CadmusCmsError);
    expect(await localApi.find()).toHaveLength(0);
  });

  it("create throws CadmusCmsError for an unknown field", async () => {
    await expect(
      localApi.create({
        title: "Home",
        slug: "home",
        // @ts-expect-error intentionally passing an unrecognized field
        notAField: "oops",
      }),
    ).rejects.toThrow(CadmusCmsError);
  });

  it("create throws CadmusCmsError on a unique constraint violation", async () => {
    await localApi.create({ title: "Home", slug: "home" });
    const error = await localApi
      .create({ title: "Home Again", slug: "home" })
      .catch((e) => e);
    expect(error).toBeInstanceOf(CadmusCmsError);
    expect(error.cause).toBeDefined();
  });
});
