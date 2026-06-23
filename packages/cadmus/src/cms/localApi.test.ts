import { env } from "cloudflare:test";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CadmusAccessDeniedError, CadmusCmsError } from "../errors.js";
import { collectionToTable, collectionVersionsTable } from "./codegen.js";
import { can, createLocalApi, createVersionedLocalApi } from "./localApi.js";
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
// pagesCollection has no `access` configured, so any context is allowed —
// these tests pass `undefined` throughout since access enforcement itself
// is covered by the dedicated "createLocalApi access control" suite below.
const ctx = undefined;

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
    const created = await localApi.create(ctx, { title: "Home", slug: "home" });
    expect(created.id).toBeTypeOf("number");
    expect(created.status).toBe("draft");

    const found = await localApi.findByID(ctx, created.id);
    expect(found).toEqual(created);
  });

  it("find() with no options returns all rows", async () => {
    await localApi.create(ctx, { title: "Home", slug: "home" });
    await localApi.create(ctx, { title: "About", slug: "about" });

    const rows = await localApi.find(ctx);
    expect(rows).toHaveLength(2);
  });

  it("find({ where }) filters rows", async () => {
    await localApi.create(ctx, {
      title: "Home",
      slug: "home",
      status: "published",
    });
    await localApi.create(ctx, { title: "Draft page", slug: "draft-page" });

    const { eq } = await import("drizzle-orm");
    const rows = await localApi.find(ctx, {
      where: eq(pagesTable.status, "published"),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.slug).toBe("home");
  });

  it("find({ limit, offset }) paginates rows", async () => {
    await localApi.create(ctx, { title: "A", slug: "a" });
    await localApi.create(ctx, { title: "B", slug: "b" });
    await localApi.create(ctx, { title: "C", slug: "c" });

    const page1 = await localApi.find(ctx, { limit: 2 });
    expect(page1).toHaveLength(2);

    const page2 = await localApi.find(ctx, { limit: 2, offset: 2 });
    expect(page2).toHaveLength(1);
  });

  it("find({ orderBy }) sorts rows", async () => {
    await localApi.create(ctx, { title: "B", slug: "b" });
    await localApi.create(ctx, { title: "A", slug: "a" });

    const { asc, desc } = await import("drizzle-orm");
    const ascending = await localApi.find(ctx, {
      orderBy: asc(pagesTable.slug),
    });
    expect(ascending.map((r) => r.slug)).toEqual(["a", "b"]);

    const descending = await localApi.find(ctx, {
      orderBy: desc(pagesTable.slug),
    });
    expect(descending.map((r) => r.slug)).toEqual(["b", "a"]);
  });

  it("count() returns the total row count, ignoring limit/offset", async () => {
    await localApi.create(ctx, { title: "A", slug: "a" });
    await localApi.create(ctx, { title: "B", slug: "b" });

    expect(await localApi.count(ctx)).toBe(2);

    const { eq } = await import("drizzle-orm");
    expect(await localApi.count(ctx, { where: eq(pagesTable.slug, "a") })).toBe(
      1,
    );
  });

  it("find({ depth: 1 }) is a no-op for a collection with no relationship fields", async () => {
    await localApi.create(ctx, { title: "Home", slug: "home" });
    // pagesCollection has no relationship fields, so depth: 1 has nothing
    // to resolve and doesn't require a registry — see the dedicated
    // "relationship depth resolution" suite below for the real behavior.
    const rows = await localApi.find(ctx, { depth: 1 });
    expect(rows).toHaveLength(1);
  });

  it("find() throws CadmusCmsError for an unsupported depth value", async () => {
    await expect(
      // depth is typed as `0 | 1 | undefined`; cast simulates a
      // non-type-checked caller passing an unsupported value.
      localApi.find(ctx, {
        depth: 2,
      } as unknown as Parameters<typeof localApi.find>[1]),
    ).rejects.toThrow(CadmusCmsError);
  });

  it("update() changes only the specified fields", async () => {
    const created = await localApi.create(ctx, { title: "Home", slug: "home" });
    const updated = await localApi.update(ctx, created.id, {
      status: "published",
    });
    expect(updated.title).toBe("Home");
    expect(updated.status).toBe("published");
  });

  it("deleteByID() removes the row", async () => {
    const created = await localApi.create(ctx, { title: "Home", slug: "home" });
    await localApi.deleteByID(ctx, created.id);
    await expect(localApi.findByID(ctx, created.id)).rejects.toThrow(
      CadmusCmsError,
    );
  });

  it("findByID throws CadmusCmsError for a missing id", async () => {
    await expect(localApi.findByID(ctx, 999)).rejects.toThrow(CadmusCmsError);
  });

  it("update throws CadmusCmsError for a missing id, with no side effects", async () => {
    await expect(localApi.update(ctx, 999, { title: "Nope" })).rejects.toThrow(
      CadmusCmsError,
    );
    expect(await localApi.find(ctx)).toHaveLength(0);
  });

  it("deleteByID throws CadmusCmsError for a missing id", async () => {
    await expect(localApi.deleteByID(ctx, 999)).rejects.toThrow(CadmusCmsError);
  });

  it("create throws CadmusCmsError when a required field is missing", async () => {
    await expect(
      // @ts-expect-error intentionally omitting required `title`
      localApi.create(ctx, { slug: "no-title" }),
    ).rejects.toThrow(CadmusCmsError);
    expect(await localApi.find(ctx)).toHaveLength(0);
  });

  it("create throws CadmusCmsError for an unknown field", async () => {
    await expect(
      localApi.create(ctx, {
        title: "Home",
        slug: "home",
        // @ts-expect-error intentionally passing an unrecognized field
        notAField: "oops",
      }),
    ).rejects.toThrow(CadmusCmsError);
  });

  it("create throws CadmusCmsError on a unique constraint violation", async () => {
    await localApi.create(ctx, { title: "Home", slug: "home" });
    const error = await localApi
      .create(ctx, { title: "Home Again", slug: "home" })
      .catch((e) => e);
    expect(error).toBeInstanceOf(CadmusCmsError);
    expect(error.cause).toBeDefined();
  });
});

describe("createLocalApi access control", () => {
  interface Ctx {
    session: { role: string } | null;
  }

  function withAccess(access: CollectionConfig["access"]) {
    return createLocalApi<typeof pagesTable, Ctx>(db, pagesTable, {
      ...pagesCollection,
      access,
    });
  }

  it("throws CadmusAccessDeniedError when the access function returns false, before touching the DB", async () => {
    const api = withAccess({ create: () => false });
    await expect(
      api.create({ session: null }, { title: "Home", slug: "home" }),
    ).rejects.toThrow(CadmusAccessDeniedError);
    expect(await localApi.find(ctx)).toHaveLength(0);
  });

  it("proceeds normally when the access function returns true", async () => {
    const api = withAccess({ create: () => true });
    const created = await api.create(
      { session: { role: "owner" } },
      { title: "Home", slug: "home" },
    );
    expect(created.title).toBe("Home");
  });

  it("allows the operation when no access function is configured for it", async () => {
    const api = withAccess({ create: () => false });
    // `read` has no access fn — unaffected by the `create` rule above.
    const rows = await api.find({ session: null });
    expect(rows).toEqual([]);
  });

  it("passes the exact context object through to the access function, unmodified", async () => {
    const spy = vi.fn(() => true);
    const api = withAccess({ read: spy });
    const context: Ctx = { session: { role: "viewer" } };
    await api.find(context);
    expect(spy).toHaveBeenCalledWith(context);
  });

  it("gates read via find() and findByID() through the same `read` access function", async () => {
    const created = await localApi.create(ctx, { title: "Home", slug: "home" });
    const api = withAccess({ read: () => false });
    await expect(api.find({ session: null })).rejects.toThrow(
      CadmusAccessDeniedError,
    );
    await expect(api.findByID({ session: null }, created.id)).rejects.toThrow(
      CadmusAccessDeniedError,
    );
  });

  it("gates count() through the same `read` access function", async () => {
    const api = withAccess({ read: () => false });
    await expect(api.count({ session: null })).rejects.toThrow(
      CadmusAccessDeniedError,
    );
  });

  it("gates update() and deleteByID() through their own access functions", async () => {
    const created = await localApi.create(ctx, { title: "Home", slug: "home" });
    const api = withAccess({ update: () => false, delete: () => false });
    await expect(
      api.update({ session: null }, created.id, { title: "Renamed" }),
    ).rejects.toThrow(CadmusAccessDeniedError);
    await expect(api.deleteByID({ session: null }, created.id)).rejects.toThrow(
      CadmusAccessDeniedError,
    );

    const found = await localApi.findByID(ctx, created.id);
    expect(found.title).toBe("Home");
  });

  it("supports an async access function", async () => {
    const api = withAccess({
      create: async ({ session }) => session?.role === "owner",
    });
    await expect(
      api.create({ session: { role: "viewer" } }, { title: "X", slug: "x" }),
    ).rejects.toThrow(CadmusAccessDeniedError);
    const created = await api.create(
      { session: { role: "owner" } },
      { title: "X", slug: "x" },
    );
    expect(created.title).toBe("X");
  });
});

describe("can", () => {
  interface Ctx {
    session: { role: string } | null;
  }

  // Parametrized against the same access configs/contexts as the
  // "createLocalApi access control" suite above — can()'s answer must
  // agree with whatever the real operation does, since checkAccess()
  // calls through can() rather than duplicating its logic. See issue #26.
  it.each([
    {
      access: { create: () => false },
      context: { session: null },
      expected: false,
    },
    {
      access: { create: () => true },
      context: { session: { role: "owner" } },
      expected: true,
    },
    {
      access: { create: async ({ session }: Ctx) => session?.role === "owner" },
      context: { session: { role: "viewer" } },
      expected: false,
    },
    {
      access: { create: async ({ session }: Ctx) => session?.role === "owner" },
      context: { session: { role: "owner" } },
      expected: true,
    },
  ])("agrees with the real create() outcome for a given access fn and context", async ({
    access,
    context,
    expected,
  }) => {
    const config: CollectionConfig = { ...pagesCollection, access };
    const api = createLocalApi<typeof pagesTable, Ctx>(db, pagesTable, config);

    expect(await can(config, "create", context)).toBe(expected);

    const outcome = await api
      .create(context, { title: "X", slug: `x-${Math.random()}` })
      .then(() => true)
      .catch((e) => {
        if (e instanceof CadmusAccessDeniedError) return false;
        throw e;
      });
    expect(outcome).toBe(expected);
  });

  it("returns true when no access function is configured for the operation", async () => {
    const config: CollectionConfig = { ...pagesCollection, access: {} };
    expect(await can(config, "read", { session: null })).toBe(true);
  });
});

describe("createLocalApi hooks", () => {
  it("runs beforeChange before validation, so a hook can supply a required field", async () => {
    const api = createLocalApi(db, pagesTable, {
      ...pagesCollection,
      hooks: {
        beforeChange: [
          ({ data }) => ({ ...data, title: data.title ?? "Defaulted" }),
        ],
      },
    });

    // `title` is required and omitted — the beforeChange hook fills it,
    // so validation passes instead of throwing.
    const created = await api.create(ctx, { slug: "from-hook" });
    expect(created.title).toBe("Defaulted");
  });

  it("runs multiple beforeChange hooks in order, each fed the previous output", async () => {
    const api = createLocalApi(db, pagesTable, {
      ...pagesCollection,
      hooks: {
        beforeChange: [
          ({ data }) => ({ ...data, title: `${data.title}-a` }),
          ({ data }) => ({ ...data, title: `${data.title}-b` }),
        ],
      },
    });

    const created = await api.create(ctx, { title: "x", slug: "ordered" });
    expect(created.title).toBe("x-a-b");
  });

  it("fires afterChange with the persisted doc on create and update", async () => {
    const seen: Array<{ id: number; title: string }> = [];
    const api = createLocalApi(db, pagesTable, {
      ...pagesCollection,
      hooks: {
        afterChange: [
          ({ doc }) => {
            const row = doc as { id: number; title: string };
            seen.push({ id: row.id, title: row.title });
          },
        ],
      },
    });

    const created = await api.create(ctx, { title: "Home", slug: "home" });
    await api.update(ctx, created.id, { title: "Renamed" });

    expect(seen).toEqual([
      { id: created.id, title: "Home" },
      { id: created.id, title: "Renamed" },
    ]);
  });

  it("transforms read results via afterRead on find and findByID", async () => {
    const api = createLocalApi(db, pagesTable, {
      ...pagesCollection,
      hooks: {
        afterRead: [
          ({ doc }) => ({
            ...doc,
            title: `${(doc as { title: string }).title}!`,
          }),
        ],
      },
    });

    const created = await api.create(ctx, { title: "Home", slug: "home" });
    // create() does not run read hooks — the raw persisted title comes back
    expect(created.title).toBe("Home");

    const found = await api.findByID(ctx, created.id);
    expect(found.title).toBe("Home!");

    const [listed] = await api.find(ctx);
    expect(listed?.title).toBe("Home!");
  });

  it("fires beforeDelete and afterDelete around a successful delete", async () => {
    const calls: string[] = [];
    const api = createLocalApi(db, pagesTable, {
      ...pagesCollection,
      hooks: {
        beforeDelete: [
          () => {
            calls.push("before");
          },
        ],
        afterDelete: [
          () => {
            calls.push("after");
          },
        ],
      },
    });

    const created = await api.create(ctx, { title: "Home", slug: "home" });
    await api.deleteByID(ctx, created.id);
    expect(calls).toEqual(["before", "after"]);
  });

  it("does not fire afterDelete when the row does not exist", async () => {
    const calls: string[] = [];
    const api = createLocalApi(db, pagesTable, {
      ...pagesCollection,
      hooks: {
        afterDelete: [
          () => {
            calls.push("after");
          },
        ],
      },
    });

    await expect(api.deleteByID(ctx, 999)).rejects.toThrow(CadmusCmsError);
    expect(calls).toEqual([]);
  });
});

describe("createVersionedLocalApi", () => {
  const versionedCollection: CollectionConfig = {
    ...pagesCollection,
    versions: { drafts: true },
    access: {
      publish: ({ canPublish }: { canPublish: boolean }) => canPublish,
    },
  };
  // A separate table object (not the outer `pagesTable`) so its Drizzle
  // column map actually includes `publishedVersionId` — collectionToTable
  // only adds that column when `versions.drafts` is set. Same physical
  // "pages" SQL table either way (collectionToTable just names it after
  // `config.slug`); the beforeEach below ALTERs that table to add the
  // matching SQL column.
  const versionedTable = collectionToTable(versionedCollection);
  const versionsTable = collectionVersionsTable(versionedCollection);
  const versionedApi = createVersionedLocalApi(
    db,
    versionedTable,
    versionsTable,
    versionedCollection,
  );

  beforeEach(async () => {
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS pages_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        parent_id INTEGER NOT NULL,
        version_data TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER
      )
    `);
    await db.run(
      sql`ALTER TABLE pages ADD COLUMN published_version_id INTEGER`,
    );
  });

  afterEach(async () => {
    await db.run(sql`DROP TABLE IF EXISTS pages_versions`);
  });

  it("inherits the plain LocalApi methods unchanged", async () => {
    const created = await versionedApi.create(ctx, {
      title: "Home",
      slug: "home",
    });
    expect(created.title).toBe("Home");
    const found = await versionedApi.findByID(ctx, created.id);
    expect(found).toEqual(created);
  });

  it("saveDraft inserts a version row without touching the main table", async () => {
    const created = await versionedApi.create(ctx, {
      title: "Home",
      slug: "home",
    });

    const draft = await versionedApi.saveDraft(ctx, created.id, {
      title: "Home (draft edit)",
    });
    expect(draft.status).toBe("draft");
    expect(draft.parentId).toBe(created.id);
    expect(draft.versionData).toEqual({ title: "Home (draft edit)" });

    // the main row is untouched — saveDraft never writes to it
    const stillOriginal = await versionedApi.findByID(ctx, created.id);
    expect(stillOriginal.title).toBe("Home");
  });

  it("saveDraft does not require a complete document (drafts may be partial)", async () => {
    const created = await versionedApi.create(ctx, {
      title: "Home",
      slug: "home",
    });
    // omitting required `slug` — saveDraft should not throw for this
    const draft = await versionedApi.saveDraft(ctx, created.id, {
      title: "Updated title only",
    });
    expect(draft.versionData).toEqual({ title: "Updated title only" });
  });

  it("saveDraft throws CadmusCmsError for a missing parent id", async () => {
    await expect(
      versionedApi.saveDraft(ctx, 999, { title: "X" }),
    ).rejects.toThrow(CadmusCmsError);
  });

  it("findVersions returns saved drafts for a parent, newest first", async () => {
    const created = await versionedApi.create(ctx, {
      title: "Home",
      slug: "home",
    });
    await versionedApi.saveDraft(ctx, created.id, { title: "Edit 1" });
    await versionedApi.saveDraft(ctx, created.id, { title: "Edit 2" });

    const versions = await versionedApi.findVersions(ctx, created.id);
    expect(versions).toHaveLength(2);
    expect(versions[0]?.versionData).toEqual({ title: "Edit 2" });
    expect(versions[1]?.versionData).toEqual({ title: "Edit 1" });
  });

  it("publish copies the version's data onto the main row and sets publishedVersionId", async () => {
    const created = await versionedApi.create(ctx, {
      title: "Home",
      slug: "home",
    });
    const draft = await versionedApi.saveDraft(ctx, created.id, {
      title: "Published title",
      slug: "home",
    });

    const published = await versionedApi.publish(
      { canPublish: true },
      draft.id,
    );
    expect(published.title).toBe("Published title");
    expect(published.publishedVersionId).toBe(draft.id);

    const [versionRow] = await versionedApi.findVersions(ctx, created.id);
    expect(versionRow?.status).toBe("published");
  });

  it("publish throws CadmusCmsError when the draft is missing a required field", async () => {
    const created = await versionedApi.create(ctx, {
      title: "Home",
      slug: "home",
    });
    // draft omits the required `slug` — fine to save, not fine to publish
    const draft = await versionedApi.saveDraft(ctx, created.id, {
      title: "No slug",
    });

    await expect(
      versionedApi.publish({ canPublish: true }, draft.id),
    ).rejects.toThrow(CadmusCmsError);
  });

  it("publish throws CadmusAccessDeniedError when the publish access function rejects", async () => {
    const created = await versionedApi.create(ctx, {
      title: "Home",
      slug: "home",
    });
    const draft = await versionedApi.saveDraft(ctx, created.id, {
      title: "Should not publish",
      slug: "home",
    });

    await expect(
      versionedApi.publish({ canPublish: false }, draft.id),
    ).rejects.toThrow(CadmusAccessDeniedError);
  });

  it("publish throws CadmusCmsError for a missing version id", async () => {
    await expect(
      versionedApi.publish({ canPublish: true }, 999),
    ).rejects.toThrow(CadmusCmsError);
  });

  it("unpublish clears publishedVersionId without altering the row's data", async () => {
    const created = await versionedApi.create(ctx, {
      title: "Home",
      slug: "home",
    });
    const draft = await versionedApi.saveDraft(ctx, created.id, {
      title: "Published title",
      slug: "home",
    });
    await versionedApi.publish({ canPublish: true }, draft.id);

    const unpublished = await versionedApi.unpublish(
      { canPublish: true },
      created.id,
    );
    expect(unpublished.publishedVersionId).toBeNull();
    expect(unpublished.title).toBe("Published title");
  });

  it("unpublish throws CadmusAccessDeniedError when the publish access function rejects", async () => {
    const created = await versionedApi.create(ctx, {
      title: "Home",
      slug: "home",
    });
    await expect(
      versionedApi.unpublish({ canPublish: false }, created.id),
    ).rejects.toThrow(CadmusAccessDeniedError);
  });
});

describe("createLocalApi relationship depth resolution", () => {
  interface RelCtx {
    canReadAuthors: boolean;
  }

  const authorsCollection: CollectionConfig = {
    slug: "authors",
    fields: {
      id: { type: "number", autoIncrement: true },
      name: { type: "text", required: true },
    },
    access: {
      read: ({ canReadAuthors }: RelCtx) => canReadAuthors,
    },
  };

  const postsCollection: CollectionConfig = {
    slug: "posts",
    fields: {
      id: { type: "number", autoIncrement: true },
      title: { type: "text", required: true },
      authorId: { type: "relationship", relationTo: "authors" },
    },
  };

  const authorsTable = collectionToTable(authorsCollection);
  const postsTable = collectionToTable(postsCollection);
  const registry = {
    tables: { authors: authorsTable, posts: postsTable },
    configs: { authors: authorsCollection, posts: postsCollection },
  };
  const postsApi = createLocalApi<typeof postsTable, RelCtx>(
    db,
    postsTable,
    postsCollection,
    registry,
  );
  const postsApiNoRegistry = createLocalApi<typeof postsTable, RelCtx>(
    db,
    postsTable,
    postsCollection,
  );

  beforeEach(async () => {
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS authors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL
      )
    `);
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        author_id INTEGER
      )
    `);
  });

  afterEach(async () => {
    await db.run(sql`DROP TABLE IF EXISTS authors`);
    await db.run(sql`DROP TABLE IF EXISTS posts`);
  });

  it("resolves a relationship field to the related document when read is allowed", async () => {
    const authorsApi = createLocalApi(db, authorsTable, authorsCollection);
    const author = await authorsApi.create(undefined, { name: "Ada" });
    const post = await postsApi.create(
      { canReadAuthors: true },
      {
        title: "Hello",
        authorId: author.id,
      },
    );

    const [resolved] = await postsApi.find(
      { canReadAuthors: true },
      { depth: 1 },
    );
    expect(resolved?.authorId).toEqual(author);

    const byId = await postsApi.findByID({ canReadAuthors: true }, post.id, {
      depth: 1,
    });
    expect(byId.authorId).toEqual(author);
  });

  it("leaves the relationship as a bare id (no throw) when the related collection's read access denies", async () => {
    const authorsApi = createLocalApi(db, authorsTable, authorsCollection);
    const author = await authorsApi.create(undefined, { name: "Ada" });
    await postsApi.create(
      { canReadAuthors: true },
      {
        title: "Hello",
        authorId: author.id,
      },
    );

    const [resolved] = await postsApi.find(
      { canReadAuthors: false },
      { depth: 1 },
    );
    expect(resolved?.authorId).toBe(author.id);
  });

  it("throws CadmusCmsError when depth: 1 is requested without a registry", async () => {
    await postsApi.create(
      { canReadAuthors: true },
      {
        title: "Hello",
        authorId: null,
      },
    );
    await expect(
      postsApiNoRegistry.find({ canReadAuthors: true }, { depth: 1 }),
    ).rejects.toThrow(CadmusCmsError);
  });
});
