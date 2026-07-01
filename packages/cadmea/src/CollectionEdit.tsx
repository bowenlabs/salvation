import { createForm } from "@tanstack/solid-form";
import type { CollectionConfig, FieldConfig } from "@thebes/cadmus/cms";
import { BLOCK_KEY, newBlockKey, validateDocument } from "@thebes/cadmus/cms";
import {
  createEffect,
  createSignal,
  For,
  Index,
  type JSX,
  lazy,
  on,
  onCleanup,
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
  insertValue: (index: number, value: unknown) => void;
  removeValue: (index: number) => void;
  moveValue: (from: number, to: number) => void;
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
 * A request to focus a specific block in a discriminated `array` field
 * (#15, per-block visual edit). Produced from a click-to-edit ref's
 * `field` (`parseBlockFieldRef`) and consumed by the block builder, which
 * expands that block, scrolls it into view, and focuses its first input.
 */
export interface BlockFocusTarget {
  /** The array field to focus within — the ref's first path segment. */
  field: string;
  /** The target block's stable `_key`, or its array index as a string. */
  key: string;
  /**
   * Bumped on every focus request so re-clicking the same block re-focuses
   * it (the effect keys on this, not just `key`). Optional — callers that
   * only ever focus once can omit it.
   */
  nonce?: number;
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
  /**
   * Opt in to debounced autosave: while the form is dirty, `onSaveDraft` is
   * called automatically after a pause in typing, and a "Saving…/Saved"
   * status shows in the action bar. Off by default (existing consumers keep
   * the manual Save-draft button only).
   */
  autosave?: boolean;
  /** Debounce window for autosave, in ms. Default 1500. */
  autosaveMs?: number;
  /** Ask for confirmation (a dialog) before publishing. */
  confirmPublish?: boolean;
}

/**
 * The draft sub-slice of {@link EditActionsApi}, present only when the
 * collection is versioned (`versions.drafts`) and `draftActions` is wired.
 */
export interface EditDraftApi {
  /** Persist the current form values as a new draft version. */
  saveDraft: () => void;
  /** Publish the latest saved draft (honors `draftActions.confirmPublish`). */
  publish: () => void;
  /** Open a live preview of the latest saved draft, if `previewFn` is wired. */
  preview?: () => void;
  saving: boolean;
  publishing: boolean;
  previewing: boolean;
  canPublish: boolean;
  canPreview: boolean;
  autosaveStatus: "idle" | "saving" | "saved";
}

/**
 * Everything a custom `renderHeader` needs to build its own action bar
 * (breadcrumb + Save/Publish/…) instead of the default bottom bar. All
 * fields are live getters, so reading them inside JSX stays reactive.
 */
export interface EditActionsApi {
  /** Current form values — for a breadcrumb title, status pill, etc. */
  values: Record<string, unknown>;
  /** True while the form differs from its last-saved baseline. */
  dirty: boolean;
  /** Save/submit the form (generic, non-versioned collections). */
  save: () => void;
  saving: boolean;
  /** False when RBAC (`capabilities.canUpdate`) forbids saving. */
  canSave: boolean;
  /** Present only for versioned collections with `draftActions`. */
  draft?: EditDraftApi;
  /** Delete the row, when the consumer wired `onDelete` (and RBAC allows). */
  remove?: () => void;
}

/**
 * Handed to a custom `renderSidebar` so the rail can render editable
 * controls (a status toggle, SEO inputs, …) wired straight to the same
 * form — and read sibling values for derived UI (e.g. an SEO preview).
 */
export interface EditSidebarApi {
  /** Current form values (reactive). */
  values: Record<string, unknown>;
  /** Set a field on the shared form — drives dirty/validation/autosave. */
  setValue: (key: string, value: unknown) => void;
}

export interface CollectionEditProps {
  config: CollectionConfig;
  initialValues?: Record<string, unknown>;
  /**
   * Persists the edited values. Throw / reject to signal the save failed — the
   * form then stays dirty (the unsaved-changes guard is left armed) so the user
   * can retry. On success the form re-baselines to the saved values, clearing
   * the guard. See the `onSubmit` wiring in `createForm` below.
   */
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
   * Options for `relationship` fields (both single and `hasMany`), keyed by
   * the field's `relationTo` collection slug. `CollectionEdit` can't query
   * another collection itself, so the consuming route fetches the related
   * rows and passes them in; the field renders them as a searchable combobox.
   */
  relationshipOptions?: Partial<Record<string, RelationshipOption[]>>;
  /**
   * Fired whenever the dirty (unsaved-changes) state changes — wire this
   * to a router-level navigation guard (e.g. `useBlocker` in the
   * consuming route) since `CollectionEdit` has no router access itself.
   */
  onDirtyChange?: (dirty: boolean) => void;
  /**
   * Fired with the current editable values on every change — wire this to a
   * side-by-side live preview (e.g. `VisualEditingPane`'s `previewValues`).
   * Fires on mount with the initial values too.
   */
  onValuesChange?: (values: Record<string, unknown>) => void;
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
   * A block to bring into view and focus (#15, per-block visual edit). When
   * this changes, the matching `array` field expands the target block,
   * scrolls it into view, and focuses its first input. The studio sets this
   * from a click-to-edit selection.
   */
  focusBlock?: BlockFocusTarget;
  /**
   * Hides the Save button when `canUpdate` is `false` — see issue #26's
   * RBAC-aware admin UI. Undefined (the default — most collections don't
   * wire this up) reads as "allowed", same as `@thebes/cadmus/cms`'s own
   * "no access fn = allowed" default.
   */
  capabilities?: CollectionCapabilities;
  /**
   * Optional right-hand sidebar content (status, metadata, publish controls,
   * …). When provided, the fields render in a two-column grid with this
   * sidebar alongside; when omitted, the editor stays single-column exactly
   * as before. Additive — existing consumers are unaffected. Receives an
   * {@link EditSidebarApi} so the rail can edit the shared form (a bare
   * `() => JSX` still works — it just ignores the argument).
   */
  renderSidebar?: (api: EditSidebarApi) => JSX.Element;
  /**
   * Field keys to move OUT of the main column so the `renderSidebar` rail can
   * own them (e.g. `["status", "metaTitle", "metaDescription"]`). Only takes
   * effect alongside `renderSidebar` — the rail is then responsible for
   * rendering them (via `EditSidebarApi.setValue`); a key hidden here but not
   * rendered by the rail becomes uneditable. No-op without `renderSidebar`.
   */
  sidebarFields?: string[];
  /**
   * Optional custom header rendered at the top of the form (a breadcrumb +
   * action bar, per Studio Prototype). When provided, the default bottom
   * action bar is suppressed — the header owns Save/Publish/… via the
   * {@link EditActionsApi} it receives. Omit to keep the default bottom bar.
   */
  renderHeader?: (api: EditActionsApi) => JSX.Element;
  /**
   * Wire a delete action into the header's {@link EditActionsApi.remove}. The
   * page factory forwards its own delete here; standalone consumers can too.
   */
  onDelete?: () => void;
  /**
   * Start discriminated `array` (block) fields collapsed to a one-line
   * outline (per Studio Prototype's page builder). Existing blocks collapse
   * on load; newly added ones open for editing. Off by default.
   */
  collapseBlocksByDefault?: boolean;
}

interface RenderContext {
  onUploadFile?: (file: File) => Promise<{ url: string }>;
  relationshipOptions?: Partial<Record<string, RelationshipOption[]>>;
  fieldWidgets?: Record<string, FieldWidget>;
  focusBlock?: BlockFocusTarget;
  collapseBlocksByDefault?: boolean;
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
    onSubmit: async ({
      value,
      formApi,
    }: {
      value: Record<string, unknown>;
      formApi: { reset: (values?: Record<string, unknown>) => void };
    }) => {
      try {
        await props.onSubmit(applyCreateAppends(editablePayload(value)));
      } catch {
        // Save failed (props.onSubmit threw/rejected) — leave the form dirty so
        // the guard stays armed and the user can retry. The consumer surfaces
        // the message separately via the `error` prop.
        return;
      }
      // Re-baseline the form to the just-saved values so the unsaved-changes
      // guard clears: isDefaultValue() flips back to true → onDirtyChange(false),
      // disarming the consuming route's useBlocker + beforeunload prompt.
      // reset(values) updates the form's *default* values too — without this the
      // baseline stays the pre-edit snapshot and the form reads dirty forever
      // after a save (won't let you leave the page; reload warns of lost changes).
      formApi.reset(value);
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

  // Emit editable values on every change for side-by-side live preview.
  createEffect(() => props.onValuesChange?.(editablePayload(formValues())));

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

  // Create-form array auto-inserts (#98): before submitting a *new* row, let
  // an array field append a derived item (e.g. a "template" create-flow
  // auto-inserting a page-builder block bound to another field). Runs once at
  // submit; never on edit (real content wins there).
  function applyCreateAppends(
    value: Record<string, unknown>,
  ): Record<string, unknown> {
    if (operation !== "create") return value;
    let next = value;
    for (const [key, field] of Object.entries(props.config.fields)) {
      if (field.type !== "array") continue;
      const append = field.admin?.appendOnCreate;
      if (!append || (append.when && !append.when(next))) continue;
      const existing = Array.isArray(next[key]) ? (next[key] as unknown[]) : [];
      next = { ...next, [key]: [...existing, append.item(next)] };
    }
    return next;
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
    get focusBlock() {
      return props.focusBlock;
    },
    get collapseBlocksByDefault() {
      return props.collapseBlocksByDefault;
    },
  };

  // Split fields into the main column and the sidebar rail. `sidebarFields`
  // only applies when a `renderSidebar` slot exists to host them; otherwise
  // hiding a field would silently make it uneditable. The rail itself renders
  // its fields (via EditSidebarApi), so here we just drop them from main.
  const sidebarKeys = new Set(
    props.renderSidebar ? (props.sidebarFields ?? []) : [],
  );
  const mainFieldGroups = groupFields(
    editableFields(props.config).filter(([key]) => !sidebarKeys.has(key)),
  );

  // Create-form field defaults (#98): reactively seed a field from another
  // (e.g. a page title from the chosen category), overridable by the user. We
  // re-seed only while the target is empty or still equal to the value we last
  // seeded — so a value the user typed is never clobbered, but switching the
  // source (picking another category) still updates an untouched target. Only
  // ever runs while creating; the edit form keeps its real data.
  if (operation === "create") {
    for (const [key, field] of Object.entries(props.config.fields)) {
      const defaultFrom = field.admin?.defaultFrom;
      if (!defaultFrom) continue;
      let lastSeeded: unknown;
      createEffect(() => {
        const values = formValues();
        const sourceValue = values[defaultFrom.field];
        if (sourceValue == null || sourceValue === "") return;
        const sourceField = props.config.fields[defaultFrom.field];
        let label: string | undefined;
        if (sourceField?.type === "relationship") {
          label = props.relationshipOptions?.[sourceField.relationTo]?.find(
            (o) => o.id === sourceValue,
          )?.label;
        }
        const seeded = defaultFrom.map
          ? defaultFrom.map({ value: sourceValue, label })
          : (label ?? sourceValue);
        const current = values[key];
        const pristine =
          current == null || current === "" || current === lastSeeded;
        if (pristine && current !== seeded) {
          lastSeeded = seeded;
          form.setFieldValue(key, seeded);
        }
      });
    }
  }

  const versioned = () => props.config.versions?.drafts && props.draftActions;

  // Debounced autosave (opt-in via draftActions.autosave). While the form is
  // dirty, persist the draft after a pause in typing and surface a status so
  // the client never wonders whether their work is saved. Manual Save
  // draft/Publish still work alongside it.
  const [autosaveStatus, setAutosaveStatus] = createSignal<
    "idle" | "saving" | "saved"
  >("idle");
  // Publish-confirmation dialog (opt-in via draftActions.confirmPublish).
  const [confirmingPublish, setConfirmingPublish] = createSignal(false);
  function requestPublish() {
    if (props.draftActions?.confirmPublish) setConfirmingPublish(true);
    else void props.draftActions?.onPublish?.();
  }
  let autosaveTimer: ReturnType<typeof setTimeout> | undefined;
  // The editable payload we last kicked off an autosave for. Unlike the
  // onSubmit path above, the draft path never re-baselines the form, so
  // `dirty` stays true after a save; meanwhile `draftActions` is typically a
  // reactive getter (its `saving`/`canPublish` read the consumer's mutation
  // signals — see createCollectionEditPage), so this effect re-runs on every
  // save's pending toggle. Those two facts together would re-arm the debounce
  // forever — an infinite autosave loop that floods the server (and any write
  // rate-limit). Gate on the content instead: only (re-)autosave when the
  // editable values actually differ from what we last saved.
  let lastAutosaved: string | undefined;
  createEffect(() => {
    const dirty = !isDefaultValue();
    const values = formValues();
    if (!versioned() || !props.draftActions?.autosave) return;
    if (!dirty) {
      setAutosaveStatus("idle");
      return;
    }
    const payload = editablePayload(values);
    const serialized = JSON.stringify(payload);
    // Already autosaved this exact content — don't re-arm (this is what breaks
    // the loop when a reactive re-run fires with unchanged values).
    if (serialized === lastAutosaved) return;
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(async () => {
      // Record up-front (not after the await) so a reactive re-run mid-save
      // can't slip a duplicate save through, and a failed save doesn't
      // retry-storm — the manual Save draft button is the explicit retry path.
      lastAutosaved = serialized;
      setAutosaveStatus("saving");
      try {
        await props.draftActions?.onSaveDraft(payload);
        setAutosaveStatus("saved");
      } catch {
        // Surface nothing special on failure — the manual Save draft button
        // (and its error handling) remains the explicit path.
        setAutosaveStatus("idle");
      }
    }, props.draftActions?.autosaveMs ?? 1500);
  });
  onCleanup(() => clearTimeout(autosaveTimer));

  // Draft slice of the actions API — a stable object of live getters, so a
  // custom `renderHeader` reading `api.draft?.publishing` etc. stays reactive.
  const draftApi: EditDraftApi = {
    saveDraft: () =>
      void props.draftActions?.onSaveDraft(editablePayload(formValues())),
    publish: requestPublish,
    get preview() {
      return props.draftActions?.onPreview
        ? () => void props.draftActions?.onPreview?.()
        : undefined;
    },
    get saving() {
      return props.draftActions?.saving ?? false;
    },
    get publishing() {
      return props.draftActions?.publishing ?? false;
    },
    get previewing() {
      return props.draftActions?.previewing ?? false;
    },
    get canPublish() {
      return props.draftActions?.canPublish ?? false;
    },
    get canPreview() {
      return props.draftActions?.canPreview ?? false;
    },
    get autosaveStatus() {
      return autosaveStatus();
    },
  };

  // Handed to `renderHeader` — everything needed to build a custom action bar.
  const actionsApi: EditActionsApi = {
    get values() {
      return formValues();
    },
    get dirty() {
      return !isDefaultValue();
    },
    save: () => void form.handleSubmit(),
    get saving() {
      return props.saving ?? false;
    },
    get canSave() {
      return props.capabilities?.canUpdate !== false;
    },
    get draft() {
      return versioned() ? draftApi : undefined;
    },
    get remove() {
      return props.onDelete;
    },
  };

  // Handed to `renderSidebar` — lets the rail edit the shared form directly.
  const sidebarApi: EditSidebarApi = {
    get values() {
      return formValues();
    },
    setValue: (key, value) => form.setFieldValue(key, value),
  };

  return (
    <form
      class="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <Show when={props.renderHeader}>{props.renderHeader?.(actionsApi)}</Show>
      <Show when={props.error}>
        {/* role="alert" so assistive tech announces submit failures the
            moment they appear, not only if the user happens to navigate to
            them. */}
        <p class="text-sm text-error" role="alert">
          {props.error}
        </p>
      </Show>
      {/* Two-column layout when a `renderSidebar` slot is provided; otherwise
          the wrappers are `display: contents` (generate no box), so the
          original single-column flow is byte-for-byte unchanged. */}
      <div
        class={
          props.renderSidebar
            ? "grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]"
            : "contents"
        }
      >
        <div
          class={
            props.renderSidebar ? "flex min-w-0 flex-col gap-4" : "contents"
          }
        >
          <For each={mainFieldGroups}>
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
                  <legend class="px-2 text-sm font-semibold">
                    {group.name}
                  </legend>
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
        </div>
        <Show when={props.renderSidebar}>
          <aside class="flex flex-col gap-4 lg:sticky lg:top-4">
            {props.renderSidebar?.(sidebarApi)}
          </aside>
        </Show>
      </div>
      {/* Bottom-anchored, full-width action bar — not a top toolbar, per
          issue #25's mobile-first note. Suppressed when a custom `renderHeader`
          owns the actions instead. */}
      <Show when={!props.renderHeader}>
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
                !props.draftActions?.canPublish ||
                props.draftActions?.publishing
              }
              onClick={requestPublish}
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
            <Show when={props.draftActions?.autosave}>
              {/* aria-live so assistive tech announces autosave transitions. */}
              <span
                class="text-base-content/60 self-center px-1 text-xs"
                aria-live="polite"
              >
                <Show when={autosaveStatus() === "saving"}>Saving…</Show>
                <Show when={autosaveStatus() === "saved"}>Saved</Show>
              </span>
            </Show>
          </Show>
        </div>
      </Show>

      {/* Publish-confirmation dialog — a gentle gate before content goes live. */}
      <Show when={confirmingPublish()}>
        <div class="modal modal-open" role="dialog" aria-modal="true">
          <div class="modal-box">
            <h3 class="text-lg font-semibold">Publish changes?</h3>
            <p class="text-base-content/70 py-2 text-sm">
              Your latest saved draft will go live on the site.
            </p>
            <div class="modal-action">
              <button
                type="button"
                class="btn btn-ghost"
                onClick={() => setConfirmingPublish(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                class="btn btn-primary"
                onClick={() => {
                  setConfirmingPublish(false);
                  void props.draftActions?.onPublish?.();
                }}
              >
                Publish
              </button>
            </div>
          </div>
          <button
            type="button"
            class="modal-backdrop"
            aria-label="Cancel"
            onClick={() => setConfirmingPublish(false)}
          />
        </div>
      </Show>
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
            {renderField(
              props.form,
              props.ctx,
              key,
              field,
              labelFor(key, field),
            )}
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
              {fieldApi().state.meta.errors.filter(Boolean).join(", ")}
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
        <UploadControl
          name={name}
          field={field}
          fieldApi={fieldApi}
          ctx={ctx}
        />
      );
    case "relationship":
      return (
        <RelationshipField
          name={name}
          field={field}
          fieldApi={fieldApi}
          options={ctx.relationshipOptions?.[field.relationTo] ?? []}
        />
      );
    case "richText":
      return (
        <Suspense
          fallback={<span class="loading loading-spinner loading-sm" />}
        >
          <RichTextEditor
            id={name}
            content={fieldApi().state.value as object | undefined}
            onChange={(doc) => change(doc)}
            onUploadFile={ctx.onUploadFile}
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

// Searchable relationship picker — a filter-as-you-type combobox (replacing
// the old plain <select>) that supports both single (hasMany:false → value is
// a number|null) and multi (hasMany:true → value is number[], rendered as
// removable chips). Options for `relationTo` are supplied by the consuming
// route via `relationshipOptions`; this component never queries the DB itself.
function RelationshipField(props: {
  name: string;
  field: FieldConfig & { type: "relationship" };
  fieldApi: FieldAccessor;
  options: RelationshipOption[];
}): JSX.Element {
  const [query, setQuery] = createSignal("");
  const [open, setOpen] = createSignal(false);
  const [active, setActive] = createSignal(0);
  const listId = `${props.name}-listbox`;

  const isMulti = () => props.field.hasMany === true;
  const value = () => props.fieldApi().state.value;
  const selectedIds = (): number[] => {
    const v = value();
    if (isMulti()) return Array.isArray(v) ? (v as number[]) : [];
    return v != null ? [v as number] : [];
  };
  const selectedOptions = () =>
    props.options.filter((o) => selectedIds().includes(o.id));
  const filtered = () => {
    const q = query().toLowerCase();
    return props.options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) &&
        (!isMulti() || !selectedIds().includes(o.id)),
    );
  };
  const singleLabel = () => selectedOptions()[0]?.label ?? "";

  function choose(option: RelationshipOption) {
    if (isMulti()) {
      props.fieldApi().handleChange([...selectedIds(), option.id]);
      setQuery("");
    } else {
      props.fieldApi().handleChange(option.id);
      setQuery("");
      setOpen(false);
    }
    setActive(0);
  }
  function removeId(id: number) {
    if (isMulti()) {
      props.fieldApi().handleChange(selectedIds().filter((x) => x !== id));
    } else {
      props.fieldApi().handleChange(null);
    }
  }
  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, filtered().length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const option = filtered()[active()];
      if (option) choose(option);
    } else if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "Backspace" && isMulti() && query() === "") {
      const ids = selectedIds();
      if (ids.length > 0) removeId(ids[ids.length - 1]);
    }
  }

  return (
    <div class="relative">
      <Show when={isMulti() && selectedOptions().length > 0}>
        <div class="mb-1 flex flex-wrap gap-1">
          <For each={selectedOptions()}>
            {(option) => (
              <span class="badge badge-primary gap-1">
                {option.label}
                <button
                  type="button"
                  aria-label={`Remove ${option.label}`}
                  class="cursor-pointer"
                  onClick={() => removeId(option.id)}
                >
                  ×
                </button>
              </span>
            )}
          </For>
        </div>
      </Show>
      <input
        id={props.name}
        type="text"
        role="combobox"
        aria-expanded={open()}
        aria-controls={listId}
        autocomplete="off"
        class="input"
        required={props.field.required && selectedIds().length === 0}
        disabled={props.field.admin?.readOnly}
        placeholder={props.field.admin?.placeholder ?? "Search…"}
        value={open() || isMulti() ? query() : singleLabel()}
        onInput={(e) => {
          setQuery(e.currentTarget.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        // Delay so a click on an option registers before the list unmounts.
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={onKeyDown}
      />
      <Show when={!isMulti() && value() != null && !props.field.required}>
        <button
          type="button"
          aria-label="Clear"
          class="absolute top-2 right-2 cursor-pointer opacity-60"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => removeId(value() as number)}
        >
          ×
        </button>
      </Show>
      <Show when={open() && filtered().length > 0}>
        {/* role="listbox"/"option" live on a div + button (not ul/li) so the
            options are natively focusable interactive elements. */}
        <div
          id={listId}
          role="listbox"
          class="bg-base-100 border-base-300 rounded-box absolute z-10 mt-1 flex max-h-56 w-full flex-col overflow-auto border p-1 shadow"
        >
          <For each={filtered()}>
            {(option, i) => (
              <button
                type="button"
                role="option"
                aria-selected={selectedIds().includes(option.id)}
                class="rounded px-3 py-2 text-left"
                classList={{ "bg-base-200": i() === active() }}
                // preventDefault keeps focus on the input so onClick fires
                // before the input's blur closes the list.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(option)}
              >
                {option.label}
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
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
      {(fieldApi: FieldAccessor) => (
        <BlockEditor
          form={form}
          ctx={ctx}
          name={name}
          field={field}
          label={label}
          fieldApi={fieldApi}
        />
      )}
    </form.Field>
  );
}

function variantLabel(
  disc: NonNullable<(FieldConfig & { type: "array" })["discriminator"]>,
  variant: string,
): string {
  return disc.variantsAdmin?.[variant]?.label ?? humanize(variant);
}

// Visual block builder (Workstream B) — turns a discriminated `array` field
// into a page-builder: a friendly "Add block" picker (one entry per variant,
// with optional icon), per-block reorder/duplicate/remove, and collapse to a
// one-line summary so a stack of blocks reads like a page outline. A plain
// (non-discriminated) array keeps a single "Add" button.
function BlockEditor(props: {
  form: FormApi;
  ctx: RenderContext;
  name: string;
  field: FieldConfig & { type: "array" };
  label: string;
  fieldApi: FieldAccessor;
}): JSX.Element {
  const [collapsed, setCollapsed] = createSignal<Set<number>>(new Set());
  // `menuOpen` drives the block-type picker modal (Add block → a grid of
  // variants). The cleanup from the previous run removes the Escape listener
  // when the modal closes.
  const [menuOpen, setMenuOpen] = createSignal(false);
  createEffect(() => {
    if (!menuOpen() || typeof document === "undefined") return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("keydown", onKey);
    onCleanup(() => document.removeEventListener("keydown", onKey));
  });

  const disc = props.field.discriminator;
  const variants = disc ? Object.keys(disc.variants) : [];
  const items = () =>
    Array.isArray(props.fieldApi().state.value)
      ? (props.fieldApi().state.value as Record<string, unknown>[])
      : [];

  // Start existing blocks collapsed (opt-in via collapseBlocksByDefault) so a
  // loaded page reads as a one-line outline. Runs once, on the first render
  // that actually has items; blocks added afterward stay expanded for editing.
  let collapseInitDone = false;
  createEffect(() => {
    const list = items();
    if (collapseInitDone || !props.ctx.collapseBlocksByDefault) return;
    if (list.length === 0) return;
    collapseInitDone = true;
    setCollapsed(new Set(list.map((_, i) => i)));
  });

  function addBlock(variant?: string) {
    // Discriminated arrays are the page-builder's blocks — give each a stable
    // `_key` so a per-block visual-edit ref (`blocks.<_key>`) survives later
    // reordering. Plain arrays (e.g. a list of links) aren't visually editable
    // blocks, so they stay key-free.
    const seed: Record<string, unknown> =
      variant && disc ? { [disc.key]: variant } : {};
    if (disc) seed[BLOCK_KEY] = newBlockKey();
    props.fieldApi().pushValue(seed);
    setMenuOpen(false);
  }
  function duplicate(index: number) {
    // A duplicate is a new block — mint a fresh `_key` (for discriminated
    // arrays) rather than copying the source's, so the two stay independently
    // addressable.
    const copy = { ...items()[index] };
    if (disc) copy[BLOCK_KEY] = newBlockKey();
    props.fieldApi().insertValue(index + 1, copy);
  }

  // Resolve a focus request to an array index: by stable `_key` first, then
  // (for legacy keyless blocks) by a numeric index segment.
  function resolveFocusIndex(key: string): number {
    const list = items();
    const byKey = list.findIndex((b) => b[BLOCK_KEY] === key);
    if (byKey >= 0) return byKey;
    if (/^\d+$/.test(key)) {
      const i = Number(key);
      if (i >= 0 && i < list.length) return i;
    }
    return -1;
  }

  let listEl: HTMLDivElement | undefined;
  // Bring a clicked-from-preview block into view (#15). Keyed (via `on`) on
  // the target's identity + nonce only — the callback reads `items()`
  // untracked, so typing in a block doesn't re-trigger a scroll.
  createEffect(
    on(
      () => {
        const t = props.ctx.focusBlock;
        return t && t.field === props.name ? `${t.key}:${t.nonce ?? ""}` : null;
      },
      (sig) => {
        const t = props.ctx.focusBlock;
        if (!sig || !t) return;
        const index = resolveFocusIndex(t.key);
        if (index < 0) return;
        // Expand it first (a collapsed block renders no inputs to focus).
        setCollapsed((prev) => {
          if (!prev.has(index)) return prev;
          const next = new Set(prev);
          next.delete(index);
          return next;
        });
        // Defer to let the expanded inputs mount before scrolling/focusing.
        queueMicrotask(() => {
          const card = listEl?.querySelector(`[data-block-index="${index}"]`);
          if (!(card instanceof HTMLElement)) return;
          // Guard scrollIntoView — not implemented in every test/headless DOM.
          if (typeof card.scrollIntoView === "function") {
            card.scrollIntoView({ behavior: "smooth", block: "center" });
          }
          const input = card.querySelector("input, textarea, select");
          if (input instanceof HTMLElement) input.focus();
        });
      },
    ),
  );
  function move(from: number, to: number) {
    if (to < 0 || to >= items().length) return;
    props.fieldApi().moveValue(from, to);
  }
  function toggleCollapse(index: number) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function blockTitle(item: Record<string, unknown>): string {
    if (disc) {
      const v = item[disc.key];
      if (typeof v === "string") return variantLabel(disc, v);
    }
    return props.label;
  }
  // The variant's `admin.icon` (if any) — shown as a small tile in the block
  // row so the page outline scans by shape, like Studio Prototype's builder.
  function blockIcon(item: Record<string, unknown>): string | undefined {
    if (!disc) return undefined;
    const v = item[disc.key];
    return typeof v === "string" ? disc.variantsAdmin?.[v]?.icon : undefined;
  }
  // A one-line preview for a collapsed block — the first non-discriminator
  // text/select value, so the outline reads meaningfully.
  function blockSummary(item: Record<string, unknown>): string {
    for (const [key, f] of fieldsForItem(props.field, item)) {
      if (key === disc?.key) continue;
      if ((f.type === "text" || f.type === "select") && item[key]) {
        return String(item[key]);
      }
    }
    return "";
  }

  return (
    <div class="form-control md:col-span-2">
      {/* A group heading for the block list, not a single-input label. */}
      <div class="label font-medium">
        {props.label}
        <Show when={props.field.required}>
          <span class="text-error">{" *"}</span>
        </Show>
      </div>
      <Show when={props.field.admin?.description}>
        <p class="text-base-content/60 mb-1 text-xs">
          {props.field.admin?.description}
        </p>
      </Show>
      <div
        class="flex flex-col gap-3"
        ref={(el) => {
          listEl = el;
        }}
      >
        {/* <Index> (not <For>) keys rows by position so a keystroke in one
            item's input — which replaces the array reference via TanStack's
            immutable update — doesn't unmount/remount the whole row and steal
            focus. Item names are position-based (`blocks[0].title`). */}
        <Index each={items()}>
          {(item, index) => {
            const isCollapsed = () => collapsed().has(index);
            return (
              <div
                class="card bg-base-200 flex flex-col gap-2 p-3"
                data-block-index={index}
              >
                <div class="flex items-center gap-2">
                  <button
                    type="button"
                    class="btn btn-ghost btn-sm gap-2"
                    aria-expanded={!isCollapsed()}
                    onClick={() => toggleCollapse(index)}
                  >
                    <span aria-hidden="true">{isCollapsed() ? "▸" : "▾"}</span>
                    <Show when={blockIcon(item())}>
                      <span class="cadmea-block-icon" aria-hidden="true">
                        <i class={blockIcon(item())} />
                      </span>
                    </Show>
                    <span class="font-semibold">{blockTitle(item())}</span>
                  </button>
                  <Show when={isCollapsed() && blockSummary(item())}>
                    <span class="text-base-content/60 truncate text-sm">
                      {blockSummary(item())}
                    </span>
                  </Show>
                  <div class="ml-auto flex gap-1">
                    <button
                      type="button"
                      class="btn btn-ghost btn-xs"
                      aria-label="Move up"
                      disabled={index === 0}
                      onClick={() => move(index, index - 1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      class="btn btn-ghost btn-xs"
                      aria-label="Move down"
                      disabled={index === items().length - 1}
                      onClick={() => move(index, index + 1)}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      class="btn btn-ghost btn-xs"
                      aria-label="Duplicate"
                      onClick={() => duplicate(index)}
                    >
                      ⧉
                    </button>
                    <button
                      type="button"
                      class="btn btn-ghost btn-xs text-error"
                      aria-label="Remove"
                      onClick={() => props.fieldApi().removeValue(index)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
                <Show when={!isCollapsed()}>
                  <div class="flex flex-col gap-2">
                    <For each={fieldsForItem(props.field, item())}>
                      {([itemKey, itemField]) =>
                        renderField(
                          props.form,
                          props.ctx,
                          `${props.name}[${index}].${itemKey}`,
                          itemField,
                          labelFor(itemKey, itemField),
                        )
                      }
                    </For>
                  </div>
                </Show>
              </div>
            );
          }}
        </Index>

        {/* Discriminated arrays get a block-type picker; plain arrays keep a
            single Add button. */}
        <Show
          when={disc && variants.length > 0}
          fallback={
            <button
              type="button"
              class="btn btn-outline btn-sm self-start"
              onClick={() => addBlock()}
            >
              Add {props.label}
            </button>
          }
        >
          <div class="relative self-start">
            <button
              type="button"
              class="btn btn-outline btn-sm"
              aria-haspopup="menu"
              aria-expanded={menuOpen()}
              onClick={() => setMenuOpen((o) => !o)}
            >
              Add block
            </button>
            <Show when={menuOpen()}>
              {/* Block-type picker — a modal grid of variant cards (the Studio
                  Prototype's block picker). `addBlock` closes it; Cancel and
                  Escape (keydown listener above) and the backdrop also close. */}
              {/* biome-ignore lint/a11y/noStaticElementInteractions: backdrop click-to-close convenience; the modal also closes via Cancel and Escape. */}
              {/* biome-ignore lint/a11y/useKeyWithClickEvents: keyboard close is Escape + the Cancel button; the backdrop click is mouse-only sugar. */}
              <div
                class="modal modal-open"
                onClick={(event) => {
                  if (event.target === event.currentTarget) setMenuOpen(false);
                }}
              >
                <div
                  class="modal-box max-w-2xl"
                  role="dialog"
                  aria-modal="true"
                  aria-label={`Add a ${props.label} block`}
                >
                  <h3 class="m-0 text-lg font-semibold">Add a block</h3>
                  <div class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <For each={variants}>
                      {(variant) => (
                        <button
                          type="button"
                          class="border-base-300 hover:border-primary hover:bg-base-200 rounded-box flex flex-col items-center gap-2 border p-4 text-center transition-colors"
                          onClick={() => addBlock(variant)}
                        >
                          <Show when={disc?.variantsAdmin?.[variant]?.icon}>
                            <i
                              class={`${disc?.variantsAdmin?.[variant]?.icon} text-2xl`}
                              aria-hidden="true"
                            />
                          </Show>
                          <span class="text-sm font-medium">
                            {variantLabel(
                              disc as NonNullable<typeof disc>,
                              variant,
                            )}
                          </span>
                        </button>
                      )}
                    </For>
                  </div>
                  <div class="modal-action">
                    <button
                      type="button"
                      class="btn btn-ghost btn-sm"
                      onClick={() => setMenuOpen(false)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </Show>
          </div>
        </Show>
      </div>
    </div>
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
