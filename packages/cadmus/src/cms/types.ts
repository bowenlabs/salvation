// Copyright (c) 2026 BowenLabs. All rights reserved.
// Cadmus is MIT licensed. See LICENSE in the repo root.

export interface BaseFieldConfig {
  /** column name override; defaults to the config key */
  name?: string;
  required?: boolean;
  unique?: boolean;
  defaultValue?: unknown;
}

export interface TextFieldConfig extends BaseFieldConfig {
  type: "text";
  defaultValue?: string;
}

export interface SelectFieldConfig<TOption extends string = string>
  extends BaseFieldConfig {
  type: "select";
  options: readonly TOption[];
  defaultValue?: TOption;
}

export interface NumberFieldConfig extends BaseFieldConfig {
  type: "number";
  /** marks this field as the table's auto-incrementing primary key */
  autoIncrement?: boolean;
  defaultValue?: number;
}

export interface DateFieldConfig extends BaseFieldConfig {
  type: "date";
  /** mirrors drizzle's integer(..., { mode: "timestamp" | "timestamp_ms" }) */
  mode?: "timestamp" | "timestamp_ms";
  defaultValue?: "now" | Date;
}

// Full field-type matrix from issue #16. All six are implemented in
// codegen.ts: richText/array → JSON column, upload → text column,
// relationship → integer column (hasMany:false) or join table
// (hasMany:true), checkbox → integer column with drizzle's boolean mode.
export interface RichTextFieldConfig extends BaseFieldConfig {
  type: "richText";
}

/**
 * The TS type every JSON-mode column (`richText`/`array` fields,
 * `versionData`) is given via drizzle's `.$type<JsonValue>()` — see
 * codegen.ts's and schema-gen.ts's richText/array cases. Without it,
 * drizzle infers a JSON column as `unknown`, which TanStack Start's
 * server-function return-type validator rejects outright (`unknown`
 * doesn't structurally match its `Serializable` check the way a plain
 * object/array/primitive union does). Recursive on purpose — that's what
 * lets the validator recurse through it instead of bottoming out at
 * `unknown`.
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface CheckboxFieldConfig extends BaseFieldConfig {
  type: "checkbox";
  defaultValue?: boolean;
}

export interface RelationshipFieldConfig extends BaseFieldConfig {
  type: "relationship";
  relationTo: string;
  /**
   * `false` (default): a plain integer column on this collection's own
   * table storing the related row's id.
   * `true`: no column on this table — represented by a generated join
   * table instead (see codegen.ts's relationshipJoinTables).
   */
  hasMany?: boolean;
}

/**
 * `0` (default): a relationship field's column comes back as the bare
 * related-row id. `1`: `createLocalApi`'s `registry` param is used to
 * batch-resolve `hasMany: false` relationship fields into the related
 * row's full document — see localApi.ts's `resolveRelationships`. Depths
 * beyond 1 (resolving a relationship's own relationships) aren't
 * implemented; there's no nested-relationship fixture yet to validate
 * that design against.
 */
export type RelationshipDepth = 0 | 1;

export interface ArrayFieldConfig extends BaseFieldConfig {
  type: "array";
  /**
   * Fields shown for every item, regardless of variant — must include
   * `discriminator.key`'s own field (typically a `select`) if set.
   */
  fields: Record<string, FieldConfig>;
  /**
   * Lets one array field model a union of item shapes (e.g. page-builder
   * blocks: image vs hero vs richText vs...) instead of one fixed field
   * set for every item. `key` names a field already present in `fields`
   * (rendered as the item's type switcher); `variants` maps each of that
   * field's possible values to *additional* fields layered on top, shown
   * only for items whose `key` field currently holds that value. Fields
   * not listed under any variant (i.e. everything in `fields`) render
   * unconditionally — that's the place for fields shared across every
   * variant (e.g. a `caption` every block type has).
   *
   * Storage is unaffected either way — `array` is always one JSON column
   * (see codegen.ts); this only changes what `CollectionEdit` renders.
   */
  discriminator?: {
    key: string;
    variants: Record<string, Record<string, FieldConfig>>;
  };
}

export interface UploadFieldConfig extends BaseFieldConfig {
  type: "upload";
  defaultValue?: string;
}

export type FieldConfig =
  | TextFieldConfig
  | SelectFieldConfig
  | NumberFieldConfig
  | DateFieldConfig
  | RichTextFieldConfig
  | CheckboxFieldConfig
  | RelationshipFieldConfig
  | ArrayFieldConfig
  | UploadFieldConfig;

/**
 * Per-operation access check, modeled on Payload's own `access` shape.
 * @returns whether the operation is allowed. Implementations decide their
 * own context shape (auth/session info isn't standardized by Cadmus) — see
 * {@link LocalApi}'s `TContext` generic, which every operation now requires
 * a value for.
 *
 * Enforced by `createLocalApi` since Section 2 — see
 * {@link CollectionConfig.access}.
 */
// biome-ignore lint/suspicious/noExplicitAny: the context shape is intentionally caller-defined; Cadmus doesn't standardize auth/session info
export type AccessFn<TContext = any> = (
  context: TContext,
) => boolean | Promise<boolean>;

export interface CollectionAccess {
  create?: AccessFn;
  read?: AccessFn;
  update?: AccessFn;
  delete?: AccessFn;
  /**
   * Gates `VersionedLocalApi.publish`/`unpublish` (see createVersionedLocalApi
   * in localApi.ts). Separate from `update` — publishing is a distinct
   * privilege from editing a draft, matching Payload's own model.
   */
  publish?: AccessFn;
}

/**
 * Lifecycle hooks, modeled on Payload's own hook points. Each is an
 * ordered array, run in sequence. Enforced by `createLocalApi` — see
 * {@link CollectionConfig.hooks}.
 */
export interface CollectionHooks<TDoc = Record<string, unknown>> {
  beforeChange?: Array<
    (args: { data: Partial<TDoc> }) => Partial<TDoc> | Promise<Partial<TDoc>>
  >;
  afterChange?: Array<(args: { doc: TDoc }) => void | Promise<void>>;
  beforeRead?: Array<(args: { doc: TDoc }) => TDoc | Promise<TDoc>>;
  afterRead?: Array<(args: { doc: TDoc }) => TDoc | Promise<TDoc>>;
  beforeDelete?: Array<(args: { id: number }) => void | Promise<void>>;
  afterDelete?: Array<(args: { id: number }) => void | Promise<void>>;
}

export interface CollectionConfig {
  /** table name in D1; also the Local API's collection slug (later step) */
  slug: string;
  fields: Record<string, FieldConfig>;
  /**
   * Per-operation access control, enforced by `createLocalApi` (Section 2).
   * Reserved per issue #16 step 7 ("reserve typed config keys now,
   * implementation deferred to Section 2+") — that deferral is over: every
   * `LocalApi` method now requires a `context` argument and runs the
   * matching access function (`read` for `find`/`findByID`, `create` for
   * `create`, etc.) before touching the database. No access function
   * configured for an operation means that operation is unconditionally
   * allowed, matching the pre-enforcement default.
   */
  access?: CollectionAccess;
  /** Lifecycle hooks, enforced by `createLocalApi`. See {@link CollectionHooks}. */
  hooks?: CollectionHooks;
  /**
   * Opts this collection into draft/version history. When `drafts` is
   * true, codegen (see codegen.ts/schema-gen.ts) generates a companion
   * `${slug}_versions` table and a nullable `published_version_id` pointer
   * column on the main table, and `createVersionedLocalApi` (localApi.ts)
   * becomes usable against it. Collections without this stay exactly as
   * before — no versions table, no extra column, only `createLocalApi`.
   */
  versions?: {
    drafts?: boolean;
    /** Reserved for future pruning of old versions; not enforced yet. */
    maxPerDoc?: number;
  };
}

/**
 * A Cadmea plugin — a synchronous transform over the whole CMS config,
 * modeled on Payload's `plugins: [(config) => config]` shape. A plugin may
 * add or modify collections, inject fields, or register lifecycle hooks.
 * `defineCmsConfig` runs plugins in array order, each receiving the output
 * of the previous one, *before* validation — so a plugin's output is held
 * to the same rules as a hand-written config.
 *
 * Synchronous in Section 2 by design: the resolved config is consumed by
 * schema codegen and runtime config loading, both of which are sync. An
 * async variant is a deliberate later extension, not an oversight.
 */
export type CadmeaPlugin = (config: CmsConfig) => CmsConfig;

export interface CmsConfig {
  collections: CollectionConfig[];
  /**
   * Config transforms run in order by `defineCmsConfig` before validation.
   * See {@link CadmeaPlugin}. Omit for a plain, plugin-free config.
   */
  plugins?: CadmeaPlugin[];
}
