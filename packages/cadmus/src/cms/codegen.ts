// Copyright (c) 2026 BowenLabs. All rights reserved.
// Cadmus is MIT licensed. See LICENSE in the repo root.

import {
  integer,
  real,
  type SQLiteColumnBuilderBase,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { CadmusCmsError } from "../errors.js";
import type { CmsConfig, CollectionConfig, FieldConfig } from "./types.js";

function toSnakeCase(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

// relationship fields with hasMany never reach fieldToColumn — they're
// filtered out in collectionToTable and represented by a join table
// instead (see relationshipJoinTables below). hasMany:false relationship
// fields below store the related row's id as a plain integer, with no
// SQL .references() FK constraint — building real cross-collection FK
// wiring would require a whole-schema pass, not a per-field switch; with
// no real relationship field to validate that design against yet, it's
// deferred rather than half-built.
function fieldToColumn(
  key: string,
  field: FieldConfig,
): SQLiteColumnBuilderBase {
  const columnName = field.name ?? toSnakeCase(key);

  switch (field.type) {
    case "text":
    case "upload": {
      let column = text(columnName);
      if (field.required) column = column.notNull();
      if (field.unique) column = column.unique();
      if (field.defaultValue !== undefined) {
        column = column.default(field.defaultValue);
      }
      return column;
    }
    case "richText":
    case "array": {
      // TipTap JSON / array-group content — a single JSON column. The
      // nested `fields` on an array config describe the JSON shape for
      // introspection only; not enforced at write time in this step.
      let column = text(columnName, { mode: "json" });
      if (field.required) column = column.notNull();
      if (field.defaultValue !== undefined) {
        column = column.default(field.defaultValue);
      }
      return column;
    }
    case "relationship": {
      let column = integer(columnName);
      if (field.required) column = column.notNull();
      return column;
    }
    case "select": {
      let column = text(columnName, {
        enum: field.options as [string, ...string[]],
      });
      if (field.required) column = column.notNull();
      if (field.defaultValue !== undefined) {
        column = column.default(field.defaultValue);
      }
      return column;
    }
    case "number": {
      // autoIncrement marks the table's PK — SQLite's "INTEGER PRIMARY
      // KEY AUTOINCREMENT" rowid-alias behavior requires the literal
      // column type INTEGER, so this case never uses `real`, regardless
      // of the general number-field mapping below.
      if (field.autoIncrement) {
        return integer(columnName).primaryKey({ autoIncrement: true });
      }
      let column = real(columnName);
      if (field.required) column = column.notNull();
      if (field.defaultValue !== undefined) {
        column = column.default(field.defaultValue);
      }
      return column;
    }
    case "date": {
      let column =
        field.mode === "timestamp_ms"
          ? integer(columnName, { mode: "timestamp_ms" })
          : integer(columnName, { mode: "timestamp" });
      if (field.required) column = column.notNull();
      if (field.defaultValue === "now") {
        column = column.$defaultFn(() => new Date());
      } else if (field.defaultValue instanceof Date) {
        const defaultDate = field.defaultValue;
        column = column.$defaultFn(() => defaultDate);
      }
      return column;
    }
    case "checkbox": {
      // Same SQLite-integer-as-boolean mapping as the hand-written
      // boolean columns in app/core/db/schema.ts (darkMode, etc.) — kept
      // consistent rather than inventing a second boolean convention.
      let column = integer(columnName, { mode: "boolean" });
      if (field.required) column = column.notNull();
      if (field.defaultValue !== undefined) {
        column = column.default(field.defaultValue);
      }
      return column;
    }
    default:
      throw new CadmusCmsError(
        `Field type "${(field as FieldConfig).type}" is not yet supported by cadmus/cms codegen`,
      );
  }
}

export function collectionToTable(config: CollectionConfig) {
  const columns: Record<string, SQLiteColumnBuilderBase> = {};
  for (const [key, field] of Object.entries(config.fields)) {
    // hasMany relationships have no column on this table — they're
    // represented by a join table (see relationshipJoinTables).
    if (field.type === "relationship" && field.hasMany) continue;
    columns[key] = fieldToColumn(key, field);
  }
  // Bookkeeping column, not a content field — absent from config.fields so
  // admin-UI introspection (meta.ts) never sees it. Null until the first
  // publish; createVersionedLocalApi.publish() sets it, .unpublish() clears
  // it. See collectionVersionsTable below for the table it points into.
  if (config.versions?.drafts) {
    columns.publishedVersionId = integer("published_version_id");
  }
  return sqliteTable(config.slug, columns);
}

// One row per saved version (draft or published) of a document, keyed by
// `parentId` (the main table's row id — no SQL FK constraint, same
// deferred-FK precedent as relationship fields above). `versionData` is
// the full document snapshot as JSON, independent of the main table's
// columns — so a draft can hold an incomplete/invalid-for-publish shape
// without touching the main row at all.
export function collectionVersionsTable(config: CollectionConfig) {
  return sqliteTable(`${config.slug}_versions`, {
    id: integer("id").primaryKey({ autoIncrement: true }),
    parentId: integer("parent_id").notNull(),
    versionData: text("version_data", { mode: "json" }).notNull(),
    status: text("status", { enum: ["draft", "published"] }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
      () => new Date(),
    ),
  });
}

// For each hasMany relationship field in a collection, builds a join
// table named `${collectionSlug}_${fieldKey}` with two plain integer
// columns. No composite primary key in this step — see codegen.ts's
// module comment on deferred FK enforcement. Known limitation: a
// self-referential relationship (relationTo === the collection's own
// slug) would collide both column names into one — not handled, since
// no collection needs a self-relation yet.
export function relationshipJoinTables(
  config: CollectionConfig,
): Record<string, ReturnType<typeof sqliteTable>> {
  const joinTables: Record<string, ReturnType<typeof sqliteTable>> = {};
  for (const [key, field] of Object.entries(config.fields)) {
    if (field.type !== "relationship" || !field.hasMany) continue;
    const tableName = `${config.slug}_${key}`;
    const ownColumn = `${config.slug}_id`;
    const relatedColumn = `${field.relationTo}_id`;
    const columns: Record<string, SQLiteColumnBuilderBase> = {};
    columns[ownColumn] = integer(ownColumn).notNull();
    columns[relatedColumn] = integer(relatedColumn).notNull();
    joinTables[tableName] = sqliteTable(tableName, columns);
  }
  return joinTables;
}

export function cmsConfigToSchema(
  config: CmsConfig,
): Record<
  string,
  | ReturnType<typeof collectionToTable>
  | ReturnType<typeof collectionVersionsTable>
> {
  const schema: Record<
    string,
    | ReturnType<typeof collectionToTable>
    | ReturnType<typeof collectionVersionsTable>
  > = {};
  for (const collection of config.collections) {
    schema[collection.slug] = collectionToTable(collection);
    Object.assign(schema, relationshipJoinTables(collection));
    if (collection.versions?.drafts) {
      schema[`${collection.slug}_versions`] =
        collectionVersionsTable(collection);
    }
  }
  return schema;
}
