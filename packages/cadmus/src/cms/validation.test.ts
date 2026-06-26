import { env } from "cloudflare:test";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CadmusValidationError } from "../errors.js";
import { collectionToTable } from "./codegen.js";
import { type CmsRegistry, createLocalApi } from "./localApi.js";
import type { CollectionConfig } from "./types.js";
import { defineField, rule, validateDocument } from "./validation.js";

// ---------------------------------------------------------------------------
// Pure (no DB) rule evaluation
// ---------------------------------------------------------------------------

const profile: CollectionConfig = {
  slug: "profiles",
  fields: {
    id: { type: "number", autoIncrement: true },
    name: { type: "text", validation: (r) => r.required().min(2).max(20) },
    email: { type: "text", validation: (r) => r.email() },
    handle: { type: "text", validation: (r) => r.slug() },
    age: { type: "number", validation: (r) => r.integer().positive() },
    bio: {
      type: "text",
      validation: (r) =>
        r.custom((v) =>
          typeof v === "string" && v.includes("spam")
            ? "must not contain spam"
            : true,
        ),
    },
  },
};

describe("validateDocument (pure rules)", () => {
  it("passes a fully valid document", async () => {
    const violations = await validateDocument(
      profile,
      {
        name: "Ada",
        email: "ada@example.com",
        handle: "ada-l",
        age: 36,
        bio: "hi",
      },
      { operation: "create" },
    );
    expect(violations).toEqual([]);
  });

  it("flags required, min, and format failures with field paths", async () => {
    const violations = await validateDocument(
      profile,
      { name: "A", email: "nope", handle: "Not A Slug", age: -2 },
      { operation: "create" },
    );
    const paths = violations.map((v) => v.path).sort();
    expect(paths).toEqual(["age", "email", "handle", "name"]);
    expect(violations.every((v) => v.severity === "error")).toBe(true);
  });

  it("required failure fires only when the value is empty", async () => {
    const ok = await validateDocument(
      profile,
      { name: "Grace" },
      { operation: "create" },
    );
    expect(ok.find((v) => v.path === "name")).toBeUndefined();

    const bad = await validateDocument(
      profile,
      { name: "" },
      { operation: "create" },
    );
    expect(bad.find((v) => v.path === "name")?.message).toContain("name");
  });

  it("custom validator messages pass through", async () => {
    const violations = await validateDocument(
      profile,
      { name: "Bob", bio: "buy spam now" },
      { operation: "create" },
    );
    expect(violations).toContainEqual({
      path: "bio",
      message: "must not contain spam",
      severity: "error",
    });
  });

  it("warning() demotes a check to a non-blocking warning", async () => {
    const config: CollectionConfig = {
      slug: "posts",
      fields: {
        id: { type: "number", autoIncrement: true },
        title: { type: "text", validation: (r) => r.max(5).warning() },
      },
    };
    const violations = await validateDocument(
      config,
      { title: "way too long" },
      { operation: "create" },
    );
    expect(violations).toHaveLength(1);
    expect(violations[0].severity).toBe("warning");
  });

  it("only validates listed fields on a partial update", async () => {
    const violations = await validateDocument(
      profile,
      { email: "still-bad" },
      { operation: "update", onlyFields: new Set(["email"]) },
    );
    // `name` is required but absent — must NOT fail on a partial update.
    expect(violations.map((v) => v.path)).toEqual(["email"]);
  });

  it("rule() factory and defineField are usable", () => {
    expect(rule().required().min(1).toChecks()).toHaveLength(2);
    const field = defineField({ type: "text", required: true });
    expect(field.type).toBe("text");
  });
});

// ---------------------------------------------------------------------------
// DB-backed rules: unique + reference, via createLocalApi
// ---------------------------------------------------------------------------

const authors: CollectionConfig = {
  slug: "authors",
  fields: {
    id: { type: "number", autoIncrement: true },
    name: { type: "text", required: true },
  },
};

const articles: CollectionConfig = {
  slug: "articles",
  fields: {
    id: { type: "number", autoIncrement: true },
    title: { type: "text", required: true, validation: (r) => r.min(3) },
    // `unique` as a first-class rule (no DB UNIQUE constraint here) so we're
    // exercising the rule, not the column constraint.
    slug: {
      type: "text",
      required: true,
      validation: (r) => r.slug().unique(),
    },
    author: {
      type: "relationship",
      relationTo: "authors",
      validation: (r) => r.reference(),
    },
  },
};

const db = drizzle(env.DB);
const authorsTable = collectionToTable(authors);
const articlesTable = collectionToTable(articles);
const registry: CmsRegistry = {
  tables: { authors: authorsTable, articles: articlesTable },
  configs: { authors, articles },
};
const authorsApi = createLocalApi(db, authorsTable, authors, registry);
const articlesApi = createLocalApi(db, articlesTable, articles, registry);
const ctx = undefined;

beforeEach(async () => {
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS authors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL
    )`);
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      slug TEXT NOT NULL,
      author INTEGER
    )`);
});

afterEach(async () => {
  await db.run(sql`DROP TABLE IF EXISTS articles`);
  await db.run(sql`DROP TABLE IF EXISTS authors`);
});

describe("createLocalApi validation enforcement", () => {
  it("rejects a too-short title with CadmusValidationError", async () => {
    await expect(
      articlesApi.create(ctx, { title: "hi", slug: "hi-there" }),
    ).rejects.toBeInstanceOf(CadmusValidationError);
  });

  it("rejects a bad slug format", async () => {
    await expect(
      articlesApi.create(ctx, { title: "Hello", slug: "Not A Slug" }),
    ).rejects.toThrow(/slug/i);
  });

  it("catches slug collisions with a clear message", async () => {
    await articlesApi.create(ctx, { title: "First", slug: "shared" });
    let caught: unknown;
    try {
      await articlesApi.create(ctx, { title: "Second", slug: "shared" });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(CadmusValidationError);
    const violations = (caught as CadmusValidationError).violations;
    expect(violations).toContainEqual(
      expect.objectContaining({ path: "slug" }),
    );
    expect((caught as Error).message).toMatch(/already taken/);
  });

  it("lets a row keep its own slug on update (self-exclusion)", async () => {
    const created = await articlesApi.create(ctx, {
      title: "Keep",
      slug: "keep-me",
    });
    await expect(
      articlesApi.update(ctx, created.id, { slug: "keep-me", title: "Kept" }),
    ).resolves.toMatchObject({ title: "Kept" });
  });

  it("rejects a reference to a nonexistent author", async () => {
    await expect(
      articlesApi.create(ctx, { title: "Orphan", slug: "orphan", author: 999 }),
    ).rejects.toThrow(/does not exist/);
  });

  it("accepts a reference to an existing author", async () => {
    const author = await authorsApi.create(ctx, { name: "Real" });
    await expect(
      articlesApi.create(ctx, {
        title: "Linked",
        slug: "linked",
        author: author.id,
      }),
    ).resolves.toMatchObject({ slug: "linked" });
  });
});
