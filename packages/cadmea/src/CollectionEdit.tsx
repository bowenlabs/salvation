import type { CollectionConfig, FieldConfig } from "@thebes/cadmus/cms";
import { validateDocument } from "@thebes/cadmus/cms";
import { createForm } from "@tanstack/solid-form";
import {
  createEffect,
  createSignal,
  For,
  Index,
  type JSX,
  lazy,
  Show,
  Suspense,
} from "solid-js";
import type { CollectionCapabilities } from "./capabilities.js";
import type { FieldWidgetProps } from "./ImageHotspotField.js";

/** A custom per-field editor, registered via `fieldWidgets`. */
export type FieldWidget = (props: FieldWidgetProps) => JSX.Element;

// TanStack Form's per-field render prop hands back an accessor to the
// FieldApi. Its generics are heavy and not worth threading through this
// schema-driven renderer (every field is `unknown`-typed anyway), so the
// helpers below take the accessor loosely-typed.
type FieldAccessor = () => {
  state: { value: unknown; meta: { errors: unknown[] } };
  handleChange: (value: unknown) => void;
  handleBlur: () => void;
  pushValue: (value: unknown) => void;
  removeValue: (index: number) => void;
};

// Dynamic import, not a static one — @tiptap/core + @tiptap/starter-kit
// are a large dependency (pushed a consuming route's bundle from ~9KB to
// ~800KB when statically imported, even for collections with zero
// richText fields). Lazy-loading means only forms that actually render a
// richText field pull this chunk in at runtime.
const RichTextEditor = lazy(() =>
  import("./RichTextEditor.js").then((mod) => ({
    default: mod.RichTextEditor,
  })),
);

// Fields the generic form can actually render today. `id` is never
// user-editable. `date` fields (e.g. createdAt) are server-defaulted and
// shown read-only rather than editable in this step.
function editableFields(config: CollectionConfig): [string, FieldConfig][] {
  return Object.entries(config.fields).filter(([key]) => key !== "id");
}

// Default label for a field with no `admin.label`: split camelCase and
// snake/kebab into words, sentence-case the result. `metaDescription` →
// "Meta description", `created_at` → "Created at".
function humanize(key: string): string {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

function labelFor(key: string, field: FieldConfig): string {
  return field.admin?.label ?? humanize(key);
}

interface FieldGroup {
  /** `undefined` for fields with no `admin.group` — rendered ungrouped. */
  name?: string;
  fields: [string, FieldConfig][];
}

// Partition fields into `admin.group` buckets, preserving the order each
// group is first seen. Ungrouped fields keep their own (name: undefined)
// bucket so they interleave correctly with grouped ones.
function groupFields(entries: [string, FieldConfig][]): FieldGroup[] {
  const groups: FieldGroup[] = [];
  const byName = new Map<string | undefined, FieldGroup>();
  for (const entry of entries) {
    const name = entry[1].admin?.group;
    let group = byName.get(name);
    if (!group) {
      group = { name, fields: [] };
      byName.set(name, group);
      groups.push(group);
    }
    group.fields.push(entry);
  }
  return groups;
}

export interface RelationshipOption {
  id: number;
  label: string;
}

/**
 * Replaces the generic "Save" button with "Save draft"/"Publish" when the
 * collection has `versions: { drafts: true }` — a separate privilege from
 * a plain update, matching `access.publish` in `@thebes/cadmus/cms`.
 * `onPublish` takes no values: publishing acts on whatever was last saved
 * as a draft (the consuming route tracks which version that is), not on
 * the live form state.
 */
export interface DraftActions {
  onSaveDraft: (values: Record<string, unknown>) => void | Promise<void>;
  onPublish?: () => void | Promise<void>;
  /**
   * Opens a live preview of the last saved draft (issue #28) — like
   * `onPublish`, acts on whatever was last saved as a draft, not the live
   * form state. Omit to not render the Preview button at all.
   */
  onPreview?: () => void | Promise<void>;
  saving?: boolean;
  publishing?: boolean;
  previewing?: boolean;
  /** Disables Publish — e.g. until a draft has been saved at least once. */
  canPublish?: boolean;
  /** Disables Preview — same gating as canPublish, a draft must exist first. */
  canPreview?: boolean;
  saveDraftLabel?: string;
  publishLabel?: string;
  previewLabel?: string;
}

export interface CollectionEditProps {
  config: CollectionConfig;
  initialValues?: Record<string, unknown>;
  onSubmit: (values: Record<string, unknown>) => void | Promise<void>;
  submitLabel?: string;
  error?: string;
  /** Disables the Save button and shows a spinner in its place. */
  saving?: boolean;
  /**
   * Resolves an `upload` field's selected file to a stored URL. Required
   * if the collection has any `upload` fields — `CollectionEdit` never
   * talks to storage directly (stays agnostic of R2/cadmus/storage), so
   * the consuming route wires this to a server function that calls an
   * `ImageService`'s `upload()`.
   */
  onUploadFile?: (file: File) => Promise<{ url: string }>;
  /**
   * Options for `relationship` fields (hasMany:false only — see
   * RelationshipFieldConfig's `hasMany` caveat), keyed by the field's
   * `relationTo` collection slug. `CollectionEdit` can't query another
   * collection itself, so the consuming route fetches the related rows
   * and passes them in.
   */
  relationshipOptions?: Partial<Record<string, RelationshipOption[]>>;
  /**
   * Fired whenever the dirty (unsaved-changes) state changes — wire this
   * to a router-level navigation guard (e.g. `useBlocker` in the
   * consuming route) since `CollectionEdit` has no router access itself.
   */
  onDirtyChange?: (dirty: boolean) => void;
  /**
   * Per-field custom editor widgets (issue #17), keyed by field name. When a
   * field has a widget here, it's rendered instead of the generic input for
   * that field's type — e.g. `{ heroImage: ImageHotspotField }`. The widget
   * receives the field value, a setter, and `onUploadFile`.
   */
  fieldWidgets?: Record<string, FieldWidget>;
  /** Only rendered when `config.versions?.drafts` is also true. */
  draftActions?: DraftActions;
  /**
   * Hides the Save button when `canUpdate` is `false` — see issue #26's
   * RBAC-aware admin UI. Undefined (the default — most collections don't
   * wire this up) reads as "allowed", same as `@thebes/cadmus/cms`'s own
   * "no access fn = allowed" default.
   */
  capabilities?: CollectionCapabilities;
}

interface RenderContext {
  onUploadFile?: (file: File) => Promise<{ url: string }>;
  relationshipOptions?: Partial<Record<string, RelationshipOption[]>>;
  fieldWidgets?: Record<string, FieldWidget>;
}

export function CollectionEdit(props: CollectionEditProps) {
  // TanStack Form owns form state now (was a hand-rolled createSignal +
  // manual JSON.stringify dirty tracking). defaultValues is exactly the
  // passed-in initialValues — NOT seeded with each field's `defaultValue`,
  // so a never-touched optional field stays absent from the submitted
  // payload, matching the prior behavior the tests pin.
  const operation: "create" | "update" =
    props.initialValues?.id != null ? "update" : "create";

  // Field validation (issue #16's ValidationBuilder) runs client-side as a
  // TanStack Form *form-level* validator — validateDocument with no `db`
  // skips the DB-backed unique/reference checks and evaluates the rest.
  // Returning `{ fields }` (TanStack's global-error shape) distributes each
  // message to the matching field's meta.errors and blocks the submit;
  // letting TanStack own the validate→submit lifecycle (rather than
  // early-returning from the submit action) keeps isSubmitting/canSubmit
  // correct across repeated submits. The server re-validates authoritatively.
  async function validateForm(value: Record<string, unknown>) {
    const violations = await validateDocument(props.config, value, {
      operation,
    });
    const fields: Record<string, string> = {};
    for (const v of violations) {
      if (v.severity === "error" && !(v.path in fields)) {
        fields[v.path] = v.message;
      }
    }
    return Object.keys(fields).length > 0 ? { fields } : undefined;
  }

  const form = createForm(() => ({
    defaultValues: props.initialValues ?? {},
    validators: {
      onSubmitAsync: ({ value }: { value: Record<string, unknown> }) =>
        validateForm(value),
    },
    onSubmit: async ({ value }: { value: Record<string, unknown> }) => {
      await props.onSubmit(editablePayload(value));
    },
  }));

  // Dirty = "differs from initial values", reported up for the consuming
  // route's navigation guard. TanStack's `isDirty` is sticky (stays true
  // once a field is touched, even if reverted), so we use the form's
  // `isDefaultValue` aggregate instead — it flips back to true the moment
  // every field equals its default again, preserving the prior revert-to-
  // clean behavior.
  const isDefaultValue = form.useStore((s) => s.isDefaultValue);
  createEffect(() => props.onDirtyChange?.(!isDefaultValue()));

  // Current values for the imperative draft action + conditional fields.
  const formValues = form.useStore((s) => s.values as Record<string, unknown>);

  // date fields are read-only — never include them in a submitted/draft payload
  function editablePayload(
    value: Record<string, unknown>,
  ): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(value).filter(
        ([key]) => props.config.fields[key]?.type !== "date",
      ),
    );
  }

  const ctx: RenderContext = {
    get onUploadFile() {
      return props.onUploadFile;
    },
    get relationshipOptions() {
      return props.relationshipOptions;
    },
    get fieldWidgets() {
      return props.fieldWidgets;
    },
  };

  const fieldGroups = groupFields(editableFields(props.config));
  const versioned = () => props.config.versions?.drafts && props.draftActions;

  return (
    <form
      class="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <Show when={props.error}>
        {/* role="alert" so assistive tech announces submit failures the
            moment they appear, not only if the user happens to navigate to
            them. */}
        <p class="text-sm text-error" role="alert">
          {props.error}
        </p>
      </Show>
      <For each={fieldGroups}>
        {(group) => (
          <Show
            when={group.name}
            fallback={
              <FieldsGrid
                form={form}
                ctx={ctx}
                fields={group.fields}
                values={formValues}
              />
            }
          >
            <fieldset class="border-base-300 rounded-box border p-4">
              <legend class="px-2 text-sm font-semibold">{group.name}</legend>
              <FieldsGrid
                form={form}
                ctx={ctx}
                fields={group.fields}
                values={formValues}
              />
            </fieldset>
          </Show>
        )}
      </For>
      {/* Bottom-anchored, full-width action bar — not a top toolbar, per
          issue #25's mobile-first note. */}
      <div class="bg-base-100 sticky bottom-0 flex gap-2 border-t py-3">
        <Show
          when={versioned()}
          fallback={
            <Show when={props.capabilities?.canUpdate !== false}>
              {/* type="button" + handleSubmit (not a native submit) so
                  TanStack Form owns validation — a native `required` field
                  left empty no longer silently blocks the submit event, and
                  inline validation becomes the single authority. The
                  <form onSubmit> above still handles Enter. */}
              <button
                type="button"
                class="btn btn-primary flex-1"
                disabled={props.saving}
                onClick={() => void form.handleSubmit()}
              >
                <Show
                  when={props.saving}
                  fallback={props.submitLabel ?? "Save"}
                >
                  <span class="loading loading-spinner loading-sm" />
                </Show>
              </button>
            </Show>
          }
        >
          <button
            type="button"
            class="btn flex-1"
            disabled={props.draftActions?.saving}
            onClick={() =>
              void props.draftActions?.onSaveDraft(
                editablePayload(formValues()),
              )
            }
          >
            <Show
              when={props.draftActions?.saving}
              fallback={props.draftActions?.saveDraftLabel ?? "Save draft"}
            >
              <span class="loading loading-spinner loading-sm" />
            </Show>
          </button>
          <button
            type="button"
            class="btn btn-primary flex-1"
            disabled={
              !props.draftActions?.canPublish || props.draftActions?.publishing
            }
            onClick={() => void props.draftActions?.onPublish?.()}
          >
            <Show
              when={props.draftActions?.publishing}
              fallback={props.draftActions?.publishLabel ?? "Publish"}
            >
              <span class="loading loading-spinner loading-sm" />
            </Show>
          </button>
          <Show when={props.draftActions?.onPreview}>
            <button
              type="button"
              class="btn btn-outline flex-1"
              disabled={
                !props.draftActions?.canPreview ||
                props.draftActions?.previewing
              }
              onClick={() => void props.draftActions?.onPreview?.()}
            >
              <Show
                when={props.draftActions?.previewing}
                fallback={props.draftActions?.previewLabel ?? "Preview"}
              >
                <span class="loading loading-spinner loading-sm" />
              </Show>
            </button>
          </Show>
        </Show>
      </div>
    </form>
  );
}

// biome-ignore lint/suspicious/noExplicitAny: TanStack Form's instance generics are not worth threading through a schema-driven renderer.
type FormApi = any;

// One responsive grid of fields. Half-width fields sit two-up on >= md;
// everything is single-column on mobile (issue #25's mobile-first note).
// Conditional fields (`admin.condition`) are wrapped per-field in <Show> so
// toggling one doesn't re-render (and steal focus from) its siblings.
function FieldsGrid(props: {
  form: FormApi;
  ctx: RenderContext;
  fields: [string, FieldConfig][];
  values: () => Record<string, unknown>;
}): JSX.Element {
  return (
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
      <For each={props.fields}>
        {([key, field]) => (
          <Show
            when={
              !field.admin?.condition || field.admin.condition(props.values())
            }
          >
            {renderField(props.form, props.ctx, key, field, labelFor(key, field))}
          </Show>
        )}
      </For>
    </div>
  );
}

function renderField(
  form: FormApi,
  ctx: RenderContext,
  name: string,
  field: FieldConfig,
  label: string,
): JSX.Element {
  if (field.type === "array") return renderArray(form, ctx, name, field, label);
  // hasMany:true relationships are join-table-backed (no plain FK column to
  // bind a single <select> to) — not supported by this generic form yet.
  if (field.type === "relationship" && field.hasMany) return null;

  // Half-width fields span one grid column on >= md; everything else spans
  // the full two-column width.
  const spanClass =
    field.admin?.width === "half" ? "md:col-span-1" : "md:col-span-2";

  return (
    <form.Field name={name}>
      {(fieldApi: FieldAccessor) => (
        <div class={`form-control ${spanClass}`}>
          {/* The " *" stays inside the label's accessible name (it reads as
              "required" alongside each input's `required` attribute); the
              span only colors it, it does not change the text. */}
          <label class="label" for={name}>
            {label}
            <Show when={field.required}>
              <span class="text-error">{" *"}</span>
            </Show>
          </label>
          <Show when={field.admin?.description}>
            <p class="text-base-content/60 mb-1 text-xs">
              {field.admin?.description}
            </p>
          </Show>
          {renderControl(ctx, name, field, fieldApi)}
          {/* Inline validation messages from the form-level validator
              (distributed to this field's meta by TanStack). */}
          <Show when={(fieldApi().state.meta.errors?.length ?? 0) > 0}>
            <p class="text-error mt-1 text-sm" role="alert">
              {fieldApi()
                .state.meta.errors.filter(Boolean)
                .join(", ")}
            </p>
          </Show>
        </div>
      )}
    </form.Field>
  );
}

function renderControl(
  ctx: RenderContext,
  name: string,
  field: FieldConfig,
  fieldApi: FieldAccessor,
): JSX.Element {
  // A registered custom widget wins over the generic type-based input (#17).
  // Match by the full key, or by the trailing field name so a widget can
  // target a field nested inside an `array` item (whose name is a path like
  // `blocks[0].url`) without knowing the index.
  const Widget =
    ctx.fieldWidgets?.[name] ??
    ctx.fieldWidgets?.[name.slice(name.lastIndexOf(".") + 1)];
  if (Widget) {
    return (
      <Widget
        fieldKey={name}
        value={fieldApi().state.value}
        setValue={(v) => fieldApi().handleChange(v)}
        onUploadFile={ctx.onUploadFile}
      />
    );
  }

  const readOnly = field.admin?.readOnly;
  const change = (v: unknown) => fieldApi().handleChange(v);

  switch (field.type) {
    case "text":
      return (
        <input
          id={name}
          class="input"
          type="text"
          placeholder={field.admin?.placeholder}
          readOnly={readOnly}
          value={(fieldApi().state.value as string) ?? ""}
          required={field.required}
          onInput={(e) => change(e.currentTarget.value)}
          onBlur={() => fieldApi().handleBlur()}
        />
      );
    case "select":
      return (
        <select
          id={name}
          class="select"
          value={(fieldApi().state.value as string) ?? ""}
          required={field.required}
          disabled={readOnly}
          onChange={(e) => change(e.currentTarget.value)}
          onBlur={() => fieldApi().handleBlur()}
        >
          <For each={field.options}>
            {(option) => <option value={option}>{option}</option>}
          </For>
        </select>
      );
    case "number":
      return (
        <input
          id={name}
          class="input"
          type="number"
          placeholder={field.admin?.placeholder}
          readOnly={readOnly}
          value={(fieldApi().state.value as number) ?? ""}
          required={field.required}
          onInput={(e) => change(e.currentTarget.valueAsNumber)}
          onBlur={() => fieldApi().handleBlur()}
        />
      );
    case "date":
      return (
        <input
          id={name}
          class="input"
          type="text"
          readOnly
          value={formatDateValue(fieldApi().state.value)}
        />
      );
    case "checkbox":
      return (
        <input
          id={name}
          class="checkbox"
          type="checkbox"
          disabled={readOnly}
          checked={(fieldApi().state.value as boolean) ?? false}
          onChange={(e) => change(e.currentTarget.checked)}
        />
      );
    case "upload":
      return (
        <UploadControl name={name} field={field} fieldApi={fieldApi} ctx={ctx} />
      );
    case "relationship":
      return renderRelationship(ctx, name, field, fieldApi);
    case "richText":
      return (
        <Suspense
          fallback={<span class="loading loading-spinner loading-sm" />}
        >
          <RichTextEditor
            id={name}
            content={fieldApi().state.value as object | undefined}
            onChange={(doc) => change(doc)}
          />
        </Suspense>
      );
    default:
      return null;
  }
}

function UploadControl(props: {
  name: string;
  field: FieldConfig & { type: "upload" };
  fieldApi: FieldAccessor;
  ctx: RenderContext;
}) {
  const [uploading, setUploading] = createSignal(false);
  const [uploadError, setUploadError] = createSignal<string>();
  const value = () => props.fieldApi().state.value as string | undefined;

  async function handleFileChange(
    e: Event & { currentTarget: HTMLInputElement },
  ) {
    const file = e.currentTarget.files?.[0];
    if (!file) return;
    if (!props.ctx.onUploadFile) {
      setUploadError("No upload handler configured for this form.");
      return;
    }
    setUploading(true);
    setUploadError(undefined);
    try {
      const { url } = await props.ctx.onUploadFile(file);
      props.fieldApi().handleChange(url);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div class="flex flex-col gap-2">
      <Show when={value()}>
        <p class="text-sm opacity-70 break-all">{value()}</p>
      </Show>
      <input
        id={props.name}
        class="file-input"
        type="file"
        required={props.field.required && !value()}
        disabled={uploading() || props.field.admin?.readOnly}
        onChange={handleFileChange}
      />
      <Show when={uploading()}>
        <span class="loading loading-spinner loading-sm" />
      </Show>
      <Show when={uploadError()}>
        <p class="text-sm text-error">{uploadError()}</p>
      </Show>
    </div>
  );
}

function renderRelationship(
  ctx: RenderContext,
  name: string,
  field: FieldConfig & { type: "relationship" },
  fieldApi: FieldAccessor,
): JSX.Element {
  const options = ctx.relationshipOptions?.[field.relationTo] ?? [];
  const value = () => fieldApi().state.value;

  return (
    <select
      id={name}
      class="select"
      value={value() != null ? String(value()) : ""}
      required={field.required}
      disabled={field.admin?.readOnly}
      onChange={(e) =>
        fieldApi().handleChange(
          e.currentTarget.value === "" ? null : Number(e.currentTarget.value),
        )
      }
      onBlur={() => fieldApi().handleBlur()}
    >
      <option value="">—</option>
      <For each={options}>
        {(option) => <option value={option.id}>{option.label}</option>}
      </For>
    </select>
  );
}

function renderArray(
  form: FormApi,
  ctx: RenderContext,
  name: string,
  field: FieldConfig & { type: "array" },
  label: string,
): JSX.Element {
  return (
    <form.Field name={name} mode="array">
      {(fieldApi: FieldAccessor) => {
        const items = () =>
          Array.isArray(fieldApi().state.value)
            ? (fieldApi().state.value as Record<string, unknown>[])
            : [];

        return (
          <div class="form-control md:col-span-2">
            <label class="label">
              {label}
              <Show when={field.required}>
                <span class="text-error">{" *"}</span>
              </Show>
            </label>
            <Show when={field.admin?.description}>
              <p class="text-base-content/60 mb-1 text-xs">
                {field.admin?.description}
              </p>
            </Show>
            <div class="flex flex-col gap-3">
              {/* <Index> (not <For>) keys rows by position so a keystroke in
                  one item's input — which replaces the array reference via
                  TanStack's immutable update — doesn't unmount/remount the
                  whole row and steal focus. Item names are position-based
                  (`blocks[0].title`), so position keying is correct here. */}
              <Index each={items()}>
                {(item, index) => (
                  <div class="card bg-base-200 flex flex-col gap-2 p-3">
                    <For each={fieldsForItem(field, item())}>
                      {([itemKey, itemField]) =>
                        renderField(
                          form,
                          ctx,
                          `${name}[${index}].${itemKey}`,
                          itemField,
                          labelFor(itemKey, itemField),
                        )
                      }
                    </For>
                    <button
                      type="button"
                      class="btn btn-error btn-outline btn-sm self-start"
                      onClick={() => fieldApi().removeValue(index)}
                    >
                      Remove
                    </button>
                  </div>
                )}
              </Index>
              <button
                type="button"
                class="btn btn-outline btn-sm self-start"
                onClick={() => fieldApi().pushValue({})}
              >
                Add {label}
              </button>
            </div>
          </div>
        );
      }}
    </form.Field>
  );
}

function fieldsForItem(
  field: FieldConfig & { type: "array" },
  item: Record<string, unknown>,
): [string, FieldConfig][] {
  const base = Object.entries(field.fields);
  const discriminator = field.discriminator;
  if (!discriminator) return base;

  const variantValue = item[discriminator.key];
  const variantFields =
    typeof variantValue === "string"
      ? discriminator.variants[variantValue]
      : undefined;
  return variantFields ? [...base, ...Object.entries(variantFields)] : base;
}

function formatDateValue(value: unknown): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value as string);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}
