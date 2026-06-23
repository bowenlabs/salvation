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
import { CadmusAccessDeniedError, CadmusCmsError } from "../errors.js";
import type { CollectionAccess, CollectionConfig } from "./types.js";

// biome-ignore lint/suspicious/noExplicitAny: matches drizzle-orm's own SQLiteTableWithColumns default generic usage
type AnyTable = SQLiteTableWithColumns<any>;

/**
 * `TContext` is the per-request value passed to every method and forwarded
 * unchanged to the collection's `access` functions (see {@link CollectionAccess}).
 * Cadmus doesn't standardize its shape — Cadmea types it as `{ session }`,
 * other consumers may type it differently. `context` is a required first
 * argument on every method (not optional) so a call site can't forget it.
 */
export interface LocalApi<TTable extends AnyTable, TContext = unknown> {
  /**
   * `depth` reserves the shape for relationship resolution (depth: 0 = no
   * extra queries, depth: 1 = one batched query, depth > 1 throws) — only
   * `0` (the default) is implemented; any other value throws
   * CadmusCmsError. Real resolution is deferred until a collection
   * actually has a relationship field to validate the design against.
   */
  find(
    context: TContext,
    options?: {
      where?: SQL;
      depth?: 0;
    },
  ): Promise<InferSelectModel<TTable>[]>;
  findByID(context: TContext, id: number): Promise<InferSelectModel<TTable>>;
  create(
    context: TContext,
    input: InferInsertModel<TTable>,
  ): Promise<InferSelectModel<TTable>>;
  update(
    context: TContext,
    id: number,
    input: Partial<InferInsertModel<TTable>>,
  ): Promise<InferSelectModel<TTable>>;
  deleteByID(context: TContext, id: number): Promise<InferSelectModel<TTable>>;
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

// Hook runners. `config.hooks` (CollectionHooks) is folded into every
// write/read below. Transforming hooks (beforeChange, beforeRead,
// afterRead) run in array order, each fed the previous one's output; side-
// effect hooks (afterChange, beforeDelete, afterDelete) run in order for
// their effects only. All may be async. `config.access` is checked by
// checkAccess() below, before any hook or DB work runs for that operation.
type AnyRecord = Record<string, unknown>;

// Runs config.access[operation](context) if configured, throwing
// CadmusAccessDeniedError when it resolves false. No access function for
// an operation means that operation is unconditionally allowed — matches
// the pre-Section-2 default of "no enforcement at all".
async function checkAccess<TContext>(
  config: CollectionConfig,
  operation: keyof CollectionAccess,
  context: TContext,
): Promise<void> {
  const fn = config.access?.[operation];
  if (!fn) return;
  const allowed = await fn(context);
  if (!allowed) {
    throw new CadmusAccessDeniedError(
      `Access denied for "${operation}" on collection "${config.slug}"`,
    );
  }
}

async function runBeforeChange(
  config: CollectionConfig,
  data: AnyRecord,
): Promise<AnyRecord> {
  let result = data;
  for (const hook of config.hooks?.beforeChange ?? []) {
    result = (await hook({ data: result })) as AnyRecord;
  }
  return result;
}

async function runAfterChange(
  config: CollectionConfig,
  doc: AnyRecord,
): Promise<void> {
  for (const hook of config.hooks?.afterChange ?? []) {
    await hook({ doc });
  }
}

async function runReadHooks(
  config: CollectionConfig,
  doc: AnyRecord,
): Promise<AnyRecord> {
  let result = doc;
  for (const hook of config.hooks?.beforeRead ?? []) {
    result = (await hook({ doc: result })) as AnyRecord;
  }
  for (const hook of config.hooks?.afterRead ?? []) {
    result = (await hook({ doc: result })) as AnyRecord;
  }
  return result;
}

function hasReadHooks(config: CollectionConfig): boolean {
  return Boolean(
    config.hooks?.beforeRead?.length || config.hooks?.afterRead?.length,
  );
}

async function runBeforeDelete(
  config: CollectionConfig,
  id: number,
): Promise<void> {
  for (const hook of config.hooks?.beforeDelete ?? []) {
    await hook({ id });
  }
}

async function runAfterDelete(
  config: CollectionConfig,
  id: number,
): Promise<void> {
  for (const hook of config.hooks?.afterDelete ?? []) {
    await hook({ id });
  }
}

export function createLocalApi<TTable extends AnyTable, TContext = unknown>(
  db: BaseSQLiteDatabase<"async", unknown>,
  table: TTable,
  config: CollectionConfig,
): LocalApi<TTable, TContext> {
  const idColumn = table.id;

  return {
    async find(context, options) {
      await checkAccess(config, "read", context);
      if (options?.depth !== undefined && options.depth !== 0) {
        throw new CadmusCmsError(
          `Relationship resolution (depth > 0) is not yet implemented for collection "${config.slug}"`,
        );
      }
      const query = db.select().from(table);
      const rows = options?.where
        ? await query.where(options.where)
        : await query;
      if (!hasReadHooks(config)) return rows as InferSelectModel<TTable>[];
      const hooked = await Promise.all(
        rows.map((row) => runReadHooks(config, row as Record<string, unknown>)),
      );
      return hooked as InferSelectModel<TTable>[];
    },

    async findByID(context, id) {
      await checkAccess(config, "read", context);
      const [row] = await db.select().from(table).where(eq(idColumn, id));
      if (!row) notFound(config, id);
      if (!hasReadHooks(config)) return row as InferSelectModel<TTable>;
      return (await runReadHooks(
        config,
        row as Record<string, unknown>,
      )) as InferSelectModel<TTable>;
    },

    async create(context, input) {
      await checkAccess(config, "create", context);
      // beforeChange runs before validation so a hook may supply or default
      // a required field (e.g. the SEO plugin defaulting metaTitle).
      const data = await runBeforeChange(
        config,
        input as Record<string, unknown>,
      );
      validateRequiredFields(config, data);
      rejectUnknownFields(config, data);
      let doc: InferSelectModel<TTable> | undefined;
      try {
        const [row] = await db
          .insert(table)
          // biome-ignore lint/suspicious/noExplicitAny: TTable is an abstract generic here, so drizzle's column-mapped insert types can't narrow against it — InferInsertModel<TTable> already gives callers the real, concrete typing.
          .values(data as any)
          .returning();
        doc = row as InferSelectModel<TTable>;
      } catch (error) {
        wrapWriteError(config, error);
      }
      // wrapWriteError returns `never`, so reaching here means the insert
      // succeeded and `doc` is set. afterChange runs outside the try so its
      // side-effect errors aren't mis-reported as write failures.
      await runAfterChange(config, doc as Record<string, unknown>);
      return doc as InferSelectModel<TTable>;
    },

    async update(context, id, input) {
      await checkAccess(config, "update", context);
      const data = await runBeforeChange(
        config,
        input as Record<string, unknown>,
      );
      rejectUnknownFields(config, data);
      let doc: InferSelectModel<TTable> | undefined;
      try {
        const [row] = await db
          .update(table)
          // biome-ignore lint/suspicious/noExplicitAny: see create() above
          .set(data as any)
          .where(eq(idColumn, id))
          .returning();
        if (!row) notFound(config, id);
        doc = row as InferSelectModel<TTable>;
      } catch (error) {
        wrapWriteError(config, error);
      }
      await runAfterChange(config, doc as Record<string, unknown>);
      return doc as InferSelectModel<TTable>;
    },

    async deleteByID(context, id) {
      await checkAccess(config, "delete", context);
      await runBeforeDelete(config, id);
      const [row] = await db.delete(table).where(eq(idColumn, id)).returning();
      if (!row) notFound(config, id);
      await runAfterDelete(config, id);
      return row as InferSelectModel<TTable>;
    },
  };
}
