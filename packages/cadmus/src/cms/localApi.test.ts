import { env } from "cloudflare:test";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CadmusAccessDeniedError, CadmusCmsError } from "../errors.js";
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

  it("find({ depth: 1 }) throws — relationship resolution is reserved, not yet implemented", async () => {
    await expect(
      // depth is typed as `0 | undefined`; cast simulates a
      // non-type-checked caller passing an unsupported value.
      localApi.find(ctx, {
        depth: 1,
      } as Parameters<typeof localApi.find>[1]),
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
