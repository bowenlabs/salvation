import type { CollectionConfig, FieldConfig } from "@thebes/cadmus/cms";
import {
  createEffect,
  createSignal,
  For,
  lazy,
  Show,
  Suspense,
} from "solid-js";
import type { CollectionCapabilities } from "./capabilities.js";

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
}

export function CollectionEdit(props: CollectionEditProps) {
  const initialSnapshot = JSON.stringify(props.initialValues ?? {});
  const [values, setValues] = createSignal<Record<string, unknown>>(
    props.initialValues ?? {},
  );

  // Reported via `onDirtyChange` rather than tracked by the consuming
  // route itself — only this component sees every field edit as it
  // happens. A plain JSON.stringify comparison is enough: form values are
  // already plain JSON-shaped data (TipTap docs, array-field items), so
  // there's no Date/Map/Set edge case to special-case here.
  createEffect(() => {
    props.onDirtyChange?.(JSON.stringify(values()) !== initialSnapshot);
  });

  function setField(key: string, value: unknown) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  // date fields are read-only — never include them in a submitted/draft payload
  function editablePayload(): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(values()).filter(
        ([key]) => props.config.fields[key]?.type !== "date",
      ),
    );
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    void props.onSubmit(editablePayload());
  }

  const ctx: RenderContext = {
    onUploadFile: props.onUploadFile,
    relationshipOptions: props.relationshipOptions,
  };

  const versioned = () => props.config.versions?.drafts && props.draftActions;

  return (
    <form class="flex flex-col gap-4" onSubmit={handleSubmit}>
      <Show when={props.error}>
        {/* role="alert" so assistive tech announces submit failures the
            moment they appear, not only if the user happens to navigate to
            them. */}
        <p class="text-sm text-error" role="alert">
          {props.error}
        </p>
      </Show>
      <For each={editableFields(props.config)}>
        {([key, field]) => (
          <div class="form-control">
            {/* The " *" stays inside the label's accessible name (it reads
                as "required" alongside each input's `required` attribute);
                the span only colors it, it does not change the text. */}
            <label class="label" for={key}>
              {key}
              <Show when={field.required}>
                <span class="text-error">{" *"}</span>
              </Show>
            </label>
            {renderInput(key, field, values()[key], setField, ctx)}
          </div>
        )}
      </For>
      {/* Bottom-anchored, full-width action bar — not a top toolbar, per
          issue #25's mobile-first note. */}
      <div class="bg-base-100 sticky bottom-0 flex gap-2 border-t py-3">
        <Show
          when={versioned()}
          fallback={
            <Show when={props.capabilities?.canUpdate !== false}>
              <button
                type="submit"
                class="btn btn-primary flex-1"
                disabled={props.saving}
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
              void props.draftActions?.onSaveDraft(editablePayload())
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

function renderInput(
  key: string,
  field: FieldConfig,
  value: unknown,
  setField: (key: string, value: unknown) => void,
  ctx: RenderContext,
) {
  switch (field.type) {
    case "text":
      return (
        <input
          id={key}
          class="input"
          type="text"
          value={(value as string) ?? ""}
          required={field.required}
          onInput={(e) => setField(key, e.currentTarget.value)}
        />
      );
    case "select":
      return (
        <select
          id={key}
          class="select"
          value={(value as string) ?? ""}
          required={field.required}
          onChange={(e) => setField(key, e.currentTarget.value)}
        >
          <For each={field.options}>
            {(option) => <option value={option}>{option}</option>}
          </For>
        </select>
      );
    case "number":
      return (
        <input
          id={key}
          class="input"
          type="number"
          value={(value as number) ?? ""}
          required={field.required}
          onInput={(e) => setField(key, e.currentTarget.valueAsNumber)}
        />
      );
    case "date":
      return (
        <input
          id={key}
          class="input"
          type="text"
          readOnly
          value={formatDateValue(value)}
        />
      );
    case "checkbox":
      return (
        <input
          id={key}
          class="checkbox"
          type="checkbox"
          checked={(value as boolean) ?? false}
          onChange={(e) => setField(key, e.currentTarget.checked)}
        />
      );
    case "upload":
      return renderUploadInput(key, field, value, setField, ctx);
    case "relationship":
      return renderRelationshipInput(key, field, value, setField, ctx);
    case "array":
      return renderArrayInput(key, field, value, setField, ctx);
    case "richText":
      return (
        <Suspense
          fallback={<span class="loading loading-spinner loading-sm" />}
        >
          <RichTextEditor
            id={key}
            content={value as object | undefined}
            onChange={(doc) => setField(key, doc)}
          />
        </Suspense>
      );
    default:
      return null;
  }
}

function renderUploadInput(
  key: string,
  field: FieldConfig & { type: "upload" },
  value: unknown,
  setField: (key: string, value: unknown) => void,
  ctx: RenderContext,
) {
  const [uploading, setUploading] = createSignal(false);
  const [uploadError, setUploadError] = createSignal<string>();

  async function handleFileChange(
    e: Event & { currentTarget: HTMLInputElement },
  ) {
    const file = e.currentTarget.files?.[0];
    if (!file) return;
    if (!ctx.onUploadFile) {
      setUploadError("No upload handler configured for this form.");
      return;
    }
    setUploading(true);
    setUploadError(undefined);
    try {
      const { url } = await ctx.onUploadFile(file);
      setField(key, url);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div class="flex flex-col gap-2">
      <Show when={value}>
        <p class="text-sm opacity-70 break-all">{value as string}</p>
      </Show>
      <input
        id={key}
        class="file-input"
        type="file"
        required={field.required && !value}
        disabled={uploading()}
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

function renderRelationshipInput(
  key: string,
  field: FieldConfig & { type: "relationship" },
  value: unknown,
  setField: (key: string, value: unknown) => void,
  ctx: RenderContext,
) {
  // hasMany:true relationships are join-table-backed (no plain FK column
  // to bind a single <select> to) — not supported by this generic form
  // yet. See RelationshipFieldConfig's `hasMany` doc.
  if (field.hasMany) return null;

  const options = ctx.relationshipOptions?.[field.relationTo] ?? [];

  return (
    <select
      id={key}
      class="select"
      value={value != null ? String(value) : ""}
      required={field.required}
      onChange={(e) =>
        setField(
          key,
          e.currentTarget.value === "" ? null : Number(e.currentTarget.value),
        )
      }
    >
      <option value="">—</option>
      <For each={options}>
        {(option) => <option value={option.id}>{option.label}</option>}
      </For>
    </select>
  );
}

function renderArrayInput(
  key: string,
  field: FieldConfig & { type: "array" },
  value: unknown,
  setField: (key: string, value: unknown) => void,
  ctx: RenderContext,
) {
  const items = () =>
    Array.isArray(value) ? (value as Record<string, unknown>[]) : [];

  function updateItem(index: number, itemKey: string, itemValue: unknown) {
    const next = items().slice();
    next[index] = { ...next[index], [itemKey]: itemValue };
    setField(key, next);
  }

  function addItem() {
    setField(key, [...items(), {}]);
  }

  function removeItem(index: number) {
    setField(
      key,
      items().filter((_, i) => i !== index),
    );
  }

  function fieldsForItem(
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

  return (
    <div class="flex flex-col gap-3">
      <For each={items()}>
        {(item, index) => (
          <div class="card bg-base-200 flex flex-col gap-2 p-3">
            <For each={fieldsForItem(item)}>
              {([itemKey, itemField]) => {
                const inputId = `${key}.${index()}.${itemKey}`;
                return (
                  <div class="form-control">
                    <label class="label" for={inputId}>
                      {itemKey}
                      <Show when={itemField.required}>
                        <span class="text-error">{" *"}</span>
                      </Show>
                    </label>
                    {renderInput(
                      inputId,
                      itemField,
                      item[itemKey],
                      (_, v) => updateItem(index(), itemKey, v),
                      ctx,
                    )}
                  </div>
                );
              }}
            </For>
            <button
              type="button"
              class="btn btn-error btn-outline btn-sm self-start"
              onClick={() => removeItem(index())}
            >
              Remove
            </button>
          </div>
        )}
      </For>
      <button
        type="button"
        class="btn btn-outline btn-sm self-start"
        onClick={addItem}
      >
        Add {key}
      </button>
    </div>
  );
}

function formatDateValue(value: unknown): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value as string);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}
