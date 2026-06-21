// Copyright (c) 2026 BowenLabs. All rights reserved.
// Cadmus is MIT licensed. See LICENSE in the repo root.

import {
  eq,
  type InferInsertModel,
  type InferSelectModel,
  type SQL,
} from "drizzle-orm";
import type {
  BaseSQLiteDatabase,
  SQLiteTableWithColumns,
} from "drizzle-orm/sqlite-core";
import { CadmusCmsError } from "../errors.js";
import type { CollectionConfig } from "./types.js";

// biome-ignore lint/suspicious/noExplicitAny: matches drizzle-orm's own SQLiteTableWithColumns default generic usage
type AnyTable = SQLiteTableWithColumns<any>;

export interface LocalApi<TTable extends AnyTable> {
  /**
   * `depth` reserves the shape for relationship resolution (depth: 0 = no
   * extra queries, depth: 1 = one batched query, depth > 1 throws) — only
   * `0` (the default) is implemented; any other value throws
   * CadmusCmsError. Real resolution is deferred until a collection
   * actually has a relationship field to validate the design against.
   */
  find(options?: {
    where?: SQL;
    depth?: 0;
  }): Promise<InferSelectModel<TTable>[]>;
  findByID(id: number): Promise<InferSelectModel<TTable>>;
  create(input: InferInsertModel<TTable>): Promise<InferSelectModel<TTable>>;
  update(
    id: number,
    input: Partial<InferInsertModel<TTable>>,
  ): Promise<InferSelectModel<TTable>>;
  deleteByID(id: number): Promise<InferSelectModel<TTable>>;
}

function validateRequiredFields(
  config: CollectionConfig,
  input: Record<string, unknown>,
): void {
  for (const [key, field] of Object.entries(config.fields)) {
    const hasDefault = field.defaultValue !== undefined;
    if (field.required && !hasDefault && input[key] === undefined) {
      throw new CadmusCmsError(
        `Missing required field "${key}" for collection "${config.slug}"`,
      );
    }
  }
}

function rejectUnknownFields(
  config: CollectionConfig,
  input: Record<string, unknown>,
): void {
  for (const key of Object.keys(input)) {
    if (!(key in config.fields)) {
      throw new CadmusCmsError(
        `Unknown field "${key}" for collection "${config.slug}"`,
      );
    }
  }
}

function wrapWriteError(config: CollectionConfig, error: unknown): never {
  if (error instanceof CadmusCmsError) throw error;
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("UNIQUE constraint failed")) {
    throw new CadmusCmsError(
      `Unique constraint violated for collection "${config.slug}"`,
      error,
    );
  }
  throw new CadmusCmsError(
    `Write failed for collection "${config.slug}"`,
    error,
  );
}

function notFound(config: CollectionConfig, id: number): never {
  throw new CadmusCmsError(`No "${config.slug}" document found with id ${id}`);
}

// Note: config.access and config.hooks (issue #16 step 7) are reserved
// types only — intentionally never read here. No access check or hook
// runs on any operation below.
export function createLocalApi<TTable extends AnyTable>(
  db: BaseSQLiteDatabase<"async", unknown>,
  table: TTable,
  config: CollectionConfig,
): LocalApi<TTable> {
  const idColumn = table.id;

  return {
    async find(options) {
      if (options?.depth !== undefined && options.depth !== 0) {
        throw new CadmusCmsError(
          `Relationship resolution (depth > 0) is not yet implemented for collection "${config.slug}"`,
        );
      }
      const query = db.select().from(table);
      const rows = options?.where
        ? await query.where(options.where)
        : await query;
      return rows as InferSelectModel<TTable>[];
    },

    async findByID(id) {
      const [row] = await db.select().from(table).where(eq(idColumn, id));
      if (!row) notFound(config, id);
      return row as InferSelectModel<TTable>;
    },

    async create(input) {
      const record = input as Record<string, unknown>;
      validateRequiredFields(config, record);
      rejectUnknownFields(config, record);
      try {
        const [row] = await db
          .insert(table)
          // biome-ignore lint/suspicious/noExplicitAny: TTable is an abstract generic here, so drizzle's column-mapped insert types can't narrow against it — InferInsertModel<TTable> already gives callers the real, concrete typing.
          .values(input as any)
          .returning();
        return row as InferSelectModel<TTable>;
      } catch (error) {
        wrapWriteError(config, error);
      }
    },

    async update(id, input) {
      const record = input as Record<string, unknown>;
      rejectUnknownFields(config, record);
      try {
        const [row] = await db
          .update(table)
          // biome-ignore lint/suspicious/noExplicitAny: see create() above
          .set(input as any)
          .where(eq(idColumn, id))
          .returning();
        if (!row) notFound(config, id);
        return row as InferSelectModel<TTable>;
      } catch (error) {
        wrapWriteError(config, error);
      }
    },

    async deleteByID(id) {
      const [row] = await db.delete(table).where(eq(idColumn, id)).returning();
      if (!row) notFound(config, id);
      return row as InferSelectModel<TTable>;
    },
  };
}
