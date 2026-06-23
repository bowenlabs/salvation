// Copyright (c) 2026 BowenLabs. All rights reserved.
// Cadmus is MIT licensed. See LICENSE in the repo root.

import {
  count as countRows,
  desc,
  eq,
  type InferInsertModel,
  type InferSelectModel,
  inArray,
  type SQL,
} from "drizzle-orm";
import type {
  BaseSQLiteDatabase,
  SQLiteTableWithColumns,
} from "drizzle-orm/sqlite-core";
import { CadmusAccessDeniedError, CadmusCmsError } from "../errors.js";
import type {
  CollectionAccess,
  CollectionConfig,
  RelationshipDepth,
} from "./types.js";

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
   * `depth: 0` (default) returns relationship fields as bare ids; `depth: 1`
   * batch-resolves `hasMany: false` relationship fields into the related
   * row, gated by that collection's own `read` access fn — see
   * `resolveRelationships` below. Requires `createLocalApi`'s `registry`
   * param; throws CadmusCmsError if `depth: 1` is requested without one.
   */
  find(
    context: TContext,
    options?: {
      where?: SQL;
      depth?: RelationshipDepth;
      /** Row cap, applied after `where` — for paginated list views. */
      limit?: number;
      /** Rows to skip, applied after `where` — pairs with `limit`. */
      offset?: number;
      /** One or more `asc(table.col)`/`desc(table.col)` expressions. */
      orderBy?: SQL | SQL[];
    },
  ): Promise<InferSelectModel<TTable>[]>;
  findByID(
    context: TContext,
    id: number,
    options?: { depth?: RelationshipDepth },
  ): Promise<InferSelectModel<TTable>>;
  /**
   * Total row count for `where` (ignoring `limit`/`offset`) — pairs with
   * `find` to compute page counts/next-page availability without fetching
   * every row. Gated by the same `read` access check as `find`.
   */
  count(context: TContext, options?: { where?: SQL }): Promise<number>;
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

/**
 * Lets `createLocalApi` resolve `depth: 1` relationship fields without
 * importing every other collection's Local API (which would be a circular
 * dependency the moment two collections relate to each other). The
 * registry is just the raw ingredients — a table and a config per
 * collection slug — built once by the app (e.g. from `cadmeaConfig.collections`)
 * and passed to every `createLocalApi` call that has relationship fields.
 */
export interface CmsRegistry {
  tables: Record<string, AnyTable>;
  configs: Record<string, CollectionConfig>;
}

/**
 * Batch-resolves this collection's `hasMany: false` relationship fields
 * for an already-fetched page of `rows`, one query per relationship field
 * (not one query per row — the N+1 the `depth: 1` design note in types.ts
 * calls out avoiding). The related collection's `read` access fn is run
 * once per field against `context`, not once per row: there's a single
 * yes/no for "can this context read collection X", not a row-by-row
 * filter. When it rejects, the field is left as the bare id rather than
 * throwing — a denied relationship is an omission, not a failed request.
 * `hasMany: true` relationship fields are untouched (no column on this
 * table to resolve from — they live in a join table, out of scope here).
 */
async function resolveRelationships<TContext>(
  db: BaseSQLiteDatabase<"async", unknown>,
  config: CollectionConfig,
  rows: AnyRecord[],
  context: TContext,
  registry: CmsRegistry | undefined,
): Promise<AnyRecord[]> {
  const relationshipFields = Object.entries(config.fields).filter(
    ([, field]) => field.type === "relationship" && !field.hasMany,
  );
  if (relationshipFields.length === 0) return rows;
  if (!registry) {
    throw new CadmusCmsError(
      `Collection "${config.slug}" requested depth: 1 but createLocalApi was not given a registry to resolve relationship fields against`,
    );
  }

  let result = rows;
  for (const [key, field] of relationshipFields) {
    const relationTo = (field as { relationTo: string }).relationTo;
    const relatedConfig = registry.configs[relationTo];
    const relatedTable = registry.tables[relationTo];
    if (!relatedConfig || !relatedTable) {
      throw new CadmusCmsError(
        `Collection "${config.slug}" field "${key}" relates to unknown collection "${relationTo}" — not present in the registry`,
      );
    }

    const readFn = relatedConfig.access?.read;
    const allowed = readFn ? await readFn(context) : true;
    if (!allowed) continue;

    const ids = [
      ...new Set(
        result
          .map((row) => row[key])
          .filter((id): id is number => typeof id === "number"),
      ),
    ];
    if (ids.length === 0) continue;

    const relatedRows = await db
      .select()
      .from(relatedTable)
      .where(inArray(relatedTable.id, ids));
    const byId = new Map(
      relatedRows.map((row) => [(row as AnyRecord).id, row as AnyRecord]),
    );

    result = result.map((row) => {
      const id = row[key];
      const related = typeof id === "number" ? byId.get(id) : undefined;
      return related ? { ...row, [key]: related } : row;
    });
  }
  return result;
}

// Hook runners. `config.hooks` (CollectionHooks) is folded into every
// write/read below. Transforming hooks (beforeChange, beforeRead,
// afterRead) run in array order, each fed the previous one's output; side-
// effect hooks (afterChange, beforeDelete, afterDelete) run in order for
// their effects only. All may be async. `config.access` is checked by
// checkAccess() below, before any hook or DB work runs for that operation.
type AnyRecord = Record<string, unknown>;

/**
 * Non-throwing counterpart to `checkAccess` below, for UI code that wants
 * to hide/disable an action a context can't perform rather than let it
 * fail server-side after a click (see Phase 6 / issue #26's
 * `getPageCapabilities`). `checkAccess` calls through this same function
 * rather than duplicating the "no access fn = allowed" logic, so `can()`'s
 * answer and the real operation's enforcement can never disagree.
 */
export async function can<TContext>(
  config: CollectionConfig,
  operation: keyof CollectionAccess,
  context: TContext,
): Promise<boolean> {
  const fn = config.access?.[operation];
  if (!fn) return true;
  return await fn(context);
}

// Runs config.access[operation](context) if configured, throwing
// CadmusAccessDeniedError when it resolves false. No access function for
// an operation means that operation is unconditionally allowed — matches
// the pre-Section-2 default of "no enforcement at all".
async function checkAccess<TContext>(
  config: CollectionConfig,
  operation: keyof CollectionAccess,
  context: TContext,
): Promise<void> {
  if (await can(config, operation, context)) return;
  throw new CadmusAccessDeniedError(
    `Access denied for "${operation}" on collection "${config.slug}"`,
  );
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
  registry?: CmsRegistry,
): LocalApi<TTable, TContext> {
  const idColumn = table.id;

  return {
    async find(context, options) {
      await checkAccess(config, "read", context);
      if (
        options?.depth !== undefined &&
        options.depth !== 0 &&
        options.depth !== 1
      ) {
        throw new CadmusCmsError(
          `Relationship resolution depth ${options.depth} is not supported for collection "${config.slug}" (only 0 and 1 are)`,
        );
      }
      let query = db.select().from(table).where(options?.where).$dynamic();
      if (options?.orderBy !== undefined) {
        query = query.orderBy(
          ...(Array.isArray(options.orderBy)
            ? options.orderBy
            : [options.orderBy]),
        );
      }
      if (options?.limit !== undefined) query = query.limit(options.limit);
      if (options?.offset !== undefined) query = query.offset(options.offset);
      const rows = await query;
      const afterHooks = hasReadHooks(config)
        ? await Promise.all(
            rows.map((row) =>
              runReadHooks(config, row as Record<string, unknown>),
            ),
          )
        : rows;
      const resolved =
        options?.depth === 1
          ? await resolveRelationships(
              db,
              config,
              afterHooks as AnyRecord[],
              context,
              registry,
            )
          : afterHooks;
      return resolved as InferSelectModel<TTable>[];
    },

    async count(context, options) {
      await checkAccess(config, "read", context);
      const [row] = await db
        .select({ value: countRows() })
        .from(table)
        .where(options?.where);
      return row?.value ?? 0;
    },

    async findByID(context, id, options) {
      await checkAccess(config, "read", context);
      if (
        options?.depth !== undefined &&
        options.depth !== 0 &&
        options.depth !== 1
      ) {
        throw new CadmusCmsError(
          `Relationship resolution depth ${options.depth} is not supported for collection "${config.slug}" (only 0 and 1 are)`,
        );
      }
      const [row] = await db.select().from(table).where(eq(idColumn, id));
      if (!row) notFound(config, id);
      const afterHooks = hasReadHooks(config)
        ? await runReadHooks(config, row as Record<string, unknown>)
        : row;
      const resolved =
        options?.depth === 1
          ? (
              await resolveRelationships(
                db,
                config,
                [afterHooks as AnyRecord],
                context,
                registry,
              )
            )[0]
          : afterHooks;
      return resolved as InferSelectModel<TTable>;
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

function notFoundVersion(config: CollectionConfig, id: number): never {
  throw new CadmusCmsError(`No "${config.slug}" version found with id ${id}`);
}

/**
 * Extends {@link LocalApi} with draft/publish operations for a collection
 * that opted in via `CollectionConfig.versions.drafts` (see codegen.ts's
 * `collectionVersionsTable`). A separate interface (not a wider
 * `LocalApi`) so non-versioned collections' types don't grow these methods
 * — TypeScript can't conditionally widen `createLocalApi`'s return type
 * off a runtime config value, so this is `createVersionedLocalApi`'s own
 * factory rather than a branch inside `createLocalApi`.
 *
 * Scope, deliberately: a document is always created via the inherited
 * `create()` first (existing behavior, unaffected by versioning) — these
 * methods operate against an *existing* row. `saveDraft` never validates
 * required fields (an incomplete draft is valid); `publish` runs the same
 * full validation `create`/`update` do, since publishing is what makes a
 * version the public-facing document. Plain `find`/`findByID` are
 * unchanged by any of this — they always return the main table's current
 * row regardless of `publishedVersionId`; filtering reads to
 * published-only content is not this phase's concern.
 */
export interface VersionedLocalApi<
  TTable extends AnyTable,
  TVersionsTable extends AnyTable,
  TContext = unknown,
> extends LocalApi<TTable, TContext> {
  findVersions(
    context: TContext,
    parentId: number,
  ): Promise<InferSelectModel<TVersionsTable>[]>;
  /** Inserts a new version row holding `input` as a draft snapshot. */
  saveDraft(
    context: TContext,
    id: number,
    input: Partial<InferInsertModel<TTable>>,
  ): Promise<InferSelectModel<TVersionsTable>>;
  /** Copies a version's snapshot onto the main row and marks it published. */
  publish(
    context: TContext,
    versionId: number,
  ): Promise<InferSelectModel<TTable>>;
  /** Clears the main row's published pointer; the row's data is untouched. */
  unpublish(context: TContext, id: number): Promise<InferSelectModel<TTable>>;
}

export function createVersionedLocalApi<
  TTable extends AnyTable,
  TVersionsTable extends AnyTable,
  TContext = unknown,
>(
  db: BaseSQLiteDatabase<"async", unknown>,
  table: TTable,
  versionsTable: TVersionsTable,
  config: CollectionConfig,
  registry?: CmsRegistry,
): VersionedLocalApi<TTable, TVersionsTable, TContext> {
  const base = createLocalApi<TTable, TContext>(db, table, config, registry);
  const idColumn = table.id;
  const versionsIdColumn = versionsTable.id;
  const versionsParentIdColumn = versionsTable.parentId;

  return {
    ...base,

    async findVersions(context, parentId) {
      await checkAccess(config, "read", context);
      const rows = await db
        .select()
        .from(versionsTable)
        .where(eq(versionsParentIdColumn, parentId))
        .orderBy(desc(versionsIdColumn));
      return rows as InferSelectModel<TVersionsTable>[];
    },

    async saveDraft(context, id, input) {
      await checkAccess(config, "update", context);
      const [parent] = await db.select().from(table).where(eq(idColumn, id));
      if (!parent) notFound(config, id);
      const data = await runBeforeChange(
        config,
        input as Record<string, unknown>,
      );
      rejectUnknownFields(config, data);
      const insertValues = {
        parentId: id,
        versionData: data,
        status: "draft",
        // biome-ignore lint/suspicious/noExplicitAny: TVersionsTable is abstract here, same rationale as createLocalApi.create's .values() cast
      } as any;
      const [row] = await db
        .insert(versionsTable)
        .values(insertValues)
        .returning();
      return row as InferSelectModel<TVersionsTable>;
    },

    async publish(context, versionId) {
      await checkAccess(config, "publish", context);
      const [version] = await db
        .select()
        .from(versionsTable)
        .where(eq(versionsIdColumn, versionId));
      if (!version) notFoundVersion(config, versionId);
      const versionRecord = version as Record<string, unknown>;
      const data = await runBeforeChange(
        config,
        versionRecord.versionData as Record<string, unknown>,
      );
      validateRequiredFields(config, data);
      rejectUnknownFields(config, data);
      const parentId = versionRecord.parentId as number;
      let doc: InferSelectModel<TTable> | undefined;
      try {
        const [row] = await db
          .update(table)
          // biome-ignore lint/suspicious/noExplicitAny: see createLocalApi.update's .set() cast
          .set({ ...data, publishedVersionId: versionId } as any)
          .where(eq(idColumn, parentId))
          .returning();
        if (!row) notFound(config, parentId);
        doc = row as InferSelectModel<TTable>;
      } catch (error) {
        wrapWriteError(config, error);
      }
      await db
        .update(versionsTable)
        // biome-ignore lint/suspicious/noExplicitAny: status is a fixed two-value enum column
        .set({ status: "published" } as any)
        .where(eq(versionsIdColumn, versionId));
      await runAfterChange(config, doc as Record<string, unknown>);
      return doc as InferSelectModel<TTable>;
    },

    async unpublish(context, id) {
      await checkAccess(config, "publish", context);
      const [row] = await db
        .update(table)
        // biome-ignore lint/suspicious/noExplicitAny: publishedVersionId is a bookkeeping column generated by codegen, not part of InferInsertModel<TTable>
        .set({ publishedVersionId: null } as any)
        .where(eq(idColumn, id))
        .returning();
      if (!row) notFound(config, id);
      return row as InferSelectModel<TTable>;
    },
  };
}
