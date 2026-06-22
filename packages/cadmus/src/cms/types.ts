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

export interface ArrayFieldConfig extends BaseFieldConfig {
  type: "array";
  fields: Record<string, FieldConfig>;
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
 * own context shape (auth/session info isn't standardized by Cadmus).
 *
 * NOT YET ENFORCED — see {@link CollectionConfig.access}.
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
}

/**
 * Lifecycle hooks, modeled on Payload's own hook points. Each is an
 * ordered array, run in sequence. NOT YET ENFORCED — see
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
   * Reserved per issue #16 step 7 ("reserve typed config keys now,
   * implementation deferred to Section 2+"). Setting this has **no
   * effect** — `createLocalApi`'s `find`/`findByID`/`create`/`update`/
   * `deleteByID` perform zero access checks. Do not rely on this for
   * security until enforcement actually lands.
   */
  access?: CollectionAccess;
  /**
   * Reserved per issue #16 step 7, same caveat as {@link CollectionConfig.access}:
   * setting this has **no effect** yet — no hook in this list is ever
   * invoked by `createLocalApi`.
   */
  hooks?: CollectionHooks;
}

export interface CmsConfig {
  collections: CollectionConfig[];
}
