import { env } from "cloudflare:test";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { collectionToTable } from "./codegen.js";
import { createLocalApi } from "./localApi.js";
import { defineMigration, runMigration } from "./migrate.js";
import type { CollectionConfig } from "./types.js";

// A collection with a `blocks` JSON array — the canonical "reshape block
// content" case (#18). The migration renames an inner block property
// `txt` → `text` across every document.
const notes: CollectionConfig = {
  slug: "notes",
  fields: {
    id: { type: "number", autoIncrement: true },
    title: { type: "text", required: true },
    blocks: { type: "array", fields: { type: { type: "text" } } },
  },
};

const db = drizzle(env.DB);
const notesTable = collectionToTable(notes);
const api = createLocalApi(db, notesTable, notes);
const ctx = undefined;

interface Block {
  type: string;
  txt?: string;
  text?: string;
}

const renameTxt = defineMigration({
  name: "rename-block-txt-to-text",
  document(doc) {
    const blocks = (doc.blocks as Block[] | null) ?? [];
    // Idempotent: nothing to do once no block still has `txt`.
    if (!blocks.some((b) => b.txt !== undefined)) return undefined;
    return {
      ...doc,
      blocks: blocks.map((b) => {
        if (b.txt === undefined) return b;
        const { txt, ...rest } = b;
        return { ...rest, text: txt };
      }),
    };
  },
});

beforeEach(async () => {
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      blocks TEXT
    )`);
  await api.create(ctx, {
    title: "One",
    blocks: [{ type: "p", txt: "hello" }],
    // biome-ignore lint/suspicious/noExplicitAny: test fixture insert
  } as any);
  await api.create(ctx, {
    title: "Two",
    blocks: [
      { type: "p", txt: "a" },
      { type: "p", txt: "b" },
    ],
    // biome-ignore lint/suspicious/noExplicitAny: test fixture insert
  } as any);
});

afterEach(async () => {
  await db.run(sql`DROP TABLE IF EXISTS notes`);
});

describe("runMigration", () => {
  it("dry-run reports patches without writing", async () => {
    const result = await runMigration(renameTxt, {
      api,
      context: ctx,
      dryRun: true,
    });
    expect(result.dryRun).toBe(true);
    expect(result.scanned).toBe(2);
    expect(result.changed).toBe(2);
    expect(result.changes).toHaveLength(2);
    expect(result.changes[0].patch[0]).toMatchObject({
      op: "set",
      path: "blocks",
    });

    // DB untouched — blocks still have `txt`.
    const rows = (await api.find(ctx)) as Array<{ blocks: Block[] }>;
    expect(rows.every((r) => r.blocks.every((b) => b.txt !== undefined))).toBe(
      true,
    );
  });

  it("apply writes the reshaped content", async () => {
    const result = await runMigration(renameTxt, { api, context: ctx });
    expect(result.dryRun).toBe(false);
    expect(result.changed).toBe(2);
    expect(result.errors).toEqual([]);

    const rows = (await api.find(ctx)) as Array<{ blocks: Block[] }>;
    for (const row of rows) {
      for (const block of row.blocks) {
        expect(block.txt).toBeUndefined();
        expect(typeof block.text).toBe("string");
      }
    }
  });

  it("is idempotent — re-running changes nothing", async () => {
    await runMigration(renameTxt, { api, context: ctx });
    const second = await runMigration(renameTxt, { api, context: ctx });
    expect(second.scanned).toBe(2);
    expect(second.changed).toBe(0);
    expect(second.changes).toEqual([]);
  });
});
