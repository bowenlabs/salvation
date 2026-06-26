import {
  createMutation,
  createQuery,
  useQueryClient,
} from "@tanstack/solid-query";
import { useBlocker } from "@tanstack/solid-router";
import type { CollectionConfig } from "@thebes/cadmus/cms";
import { createSignal, Show } from "solid-js";
import { CollectionEdit, type CollectionEditProps } from "../CollectionEdit.js";
import type { CollectionCapabilities } from "../capabilities.js";
import { VisualEditingPane } from "../VisualEditingPane.js";

export interface CollectionEditDraftOptions {
  /** Saves the live form values as a new draft version, returning its id. */
  saveDraftFn: (values: Record<string, unknown>) => Promise<{ id: number }>;
  /** Publishes a saved draft by id — the most recent one from `saveDraftFn`. */
  publishFn: (versionId: number) => Promise<unknown>;
  /**
   * Resolves a saved draft by id to a live preview URL (issue #28) — opens
   * in a new tab on success. Omit to not render the Preview button.
   */
  previewFn?: (versionId: number) => Promise<{ url: string }>;
  saveDraftLabel?: string;
  publishLabel?: string;
  previewLabel?: string;
  /** Enable debounced autosave of drafts (see CollectionEdit's autosave). */
  autosave?: boolean;
}

/**
 * Side-by-side live preview: renders a {@link VisualEditingPane} next to the
 * form (stacked on mobile, two-up on `lg`) and streams the form's in-progress
 * values into it as the user types. The preview page must call
 * `mountPreviewSync` to receive them.
 */
export interface CollectionEditPreviewOptions {
  /** The `?edit=1` preview URL to embed. Reactive — re-read as the id/draft changes. */
  url: () => string | undefined;
  /** Restrict postMessage to this origin (defaults to the url's origin). */
  allowedOrigin?: () => string | undefined;
}

export interface CollectionEditPageOptions {
  collection: CollectionConfig;
  /** Page heading — e.g. "Edit page". Defaults to `Edit ${collection.slug}`. */
  label?: string;
  submitLabel?: string;
  deleteLabel?: string;
  /**
   * A function, not a plain array — re-evaluated on every reactive read
   * inside `createQuery`'s tracking scope, so it stays correct when
   * TanStack Router reuses this component across a param change (e.g.
   * navigating between two `$pageId` values on the same route doesn't
   * always remount). A plain array captured once at creation time would
   * go stale the moment the id changes underneath it.
   */
  queryKey: () => readonly unknown[];
  queryFn: () => Promise<Record<string, unknown> | null | undefined>;
  updateFn: (values: Record<string, unknown>) => Promise<unknown>;
  deleteFn: () => Promise<unknown>;
  /** Query key to invalidate after a successful update or delete — e.g. `['pages']`. */
  invalidateQueryKey: readonly unknown[];
  /** Called after a successful delete+cache-invalidation — wire this to navigate back to the list page. */
  onDeleted?: () => void;
  /** Forwarded to CollectionEdit — resolves an `upload` field's selected file to a stored URL. */
  onUploadFile?: (file: File) => Promise<{ url: string }>;
  /** Per-field custom editor widgets (issue #17), keyed by field name — forwarded to CollectionEdit. */
  fieldWidgets?: CollectionEditProps["fieldWidgets"];
  /**
   * Renders "Save draft"/"Publish" instead of the generic Save button —
   * only meaningful when `collection.versions?.drafts` is also true (see
   * `CollectionEdit`'s `draftActions` doc).
   */
  draftActions?: CollectionEditDraftOptions;
  /**
   * A function, not a plain value — same reactivity rationale as
   * `queryKey` above (re-evaluated on every tracking read, so it stays
   * correct as the underlying capabilities query resolves/refetches).
   * Hides the Delete button when `canDelete` is `false`; forwarded to
   * `CollectionEdit` to gate Save via `canUpdate`. See issue #26.
   */
  capabilities?: () => CollectionCapabilities | undefined;
  /** Side-by-side as-you-type live preview (issue #15/#28). */
  preview?: CollectionEditPreviewOptions;
}

/**
 * Builds an edit-page component for a collection — fetch, update, and
 * delete, all wired together, plus a router-level unsaved-changes guard
 * (`useBlocker`) driven by `CollectionEdit`'s `onDirtyChange`. See
 * `createCollectionListPage`'s doc comment for the rationale on keeping
 * navigation in the route file.
 */
export function createCollectionEditPage(options: CollectionEditPageOptions) {
  return function CollectionEditPage() {
    const queryClient = useQueryClient();
    const [error, setError] = createSignal<string>();
    const [dirty, setDirty] = createSignal(false);
    const [latestDraftId, setLatestDraftId] = createSignal<number>();
    // Latest editable values, streamed into the live preview pane.
    const [previewValues, setPreviewValues] = createSignal<
      Record<string, unknown>
    >({});

    // Blocks in-app navigation (including the mobile back-gesture, which
    // is just another history pop TanStack Router intercepts the same
    // way) and the native browser prompt on tab close/refresh, both
    // gated on the same dirty signal CollectionEdit reports.
    useBlocker({
      shouldBlockFn: () => dirty(),
      enableBeforeUnload: () => dirty(),
    });

    const row = createQuery(() => ({
      queryKey: options.queryKey(),
      queryFn: options.queryFn,
    }));

    const update = createMutation(() => ({
      mutationFn: options.updateFn,
      onSuccess: () => {
        setError(undefined);
        queryClient.invalidateQueries({ queryKey: options.invalidateQueryKey });
      },
      onError: (e: Error) => setError(e.message),
    }));

    const remove = createMutation(() => ({
      mutationFn: options.deleteFn,
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: options.invalidateQueryKey });
        options.onDeleted?.();
      },
      onError: (e: Error) => setError(e.message),
    }));

    const saveDraft = createMutation(() => ({
      mutationFn: (values: Record<string, unknown>) =>
        options.draftActions?.saveDraftFn(values) ??
        Promise.reject(new Error("No draftActions configured")),
      onSuccess: (draft) => {
        setError(undefined);
        setLatestDraftId(draft.id);
      },
      onError: (e: Error) => setError(e.message),
    }));

    const publish = createMutation(() => ({
      mutationFn: () => {
        const versionId = latestDraftId();
        if (versionId === undefined || !options.draftActions) {
          return Promise.reject(new Error("No draft saved yet"));
        }
        return options.draftActions.publishFn(versionId);
      },
      onSuccess: () => {
        setError(undefined);
        queryClient.invalidateQueries({ queryKey: options.invalidateQueryKey });
      },
      onError: (e: Error) => setError(e.message),
    }));

    const preview = createMutation(() => ({
      mutationFn: () => {
        const versionId = latestDraftId();
        if (versionId === undefined || !options.draftActions?.previewFn) {
          return Promise.reject(new Error("No draft saved yet"));
        }
        return options.draftActions.previewFn(versionId);
      },
      onSuccess: ({ url }) => {
        setError(undefined);
        window.open(url, "_blank", "noopener,noreferrer");
      },
      onError: (e: Error) => setError(e.message),
    }));

    const EditorPane = () => (
      <div class="flex flex-col gap-4">
        <h1 class="text-xl font-semibold">
          {options.label ?? `Edit ${options.collection.slug}`}
        </h1>
        <Show when={row.data}>
          <CollectionEdit
            config={options.collection}
            initialValues={row.data ?? undefined}
            submitLabel={options.submitLabel ?? "Save changes"}
            error={error()}
            saving={update.isPending}
            onSubmit={(values) => update.mutate(values)}
            onUploadFile={options.onUploadFile}
            fieldWidgets={options.fieldWidgets}
            onDirtyChange={setDirty}
            onValuesChange={setPreviewValues}
            capabilities={options.capabilities?.()}
            draftActions={
              options.draftActions && {
                onSaveDraft: (values) => saveDraft.mutate(values),
                onPublish: () => publish.mutate(),
                onPreview: options.draftActions.previewFn
                  ? () => preview.mutate()
                  : undefined,
                saving: saveDraft.isPending,
                publishing: publish.isPending,
                previewing: preview.isPending,
                canPublish: latestDraftId() !== undefined,
                canPreview: latestDraftId() !== undefined,
                saveDraftLabel: options.draftActions.saveDraftLabel,
                publishLabel: options.draftActions.publishLabel,
                previewLabel: options.draftActions.previewLabel,
                autosave: options.draftActions.autosave,
              }
            }
          />
        </Show>
        <Show when={options.capabilities?.()?.canDelete !== false}>
          <button
            type="button"
            class="btn btn-error btn-outline btn-sm self-start"
            onClick={() => remove.mutate()}
          >
            {options.deleteLabel ?? `Delete ${options.collection.slug}`}
          </button>
        </Show>
      </div>
    );

    // No preview configured → just the editor. With preview → split-pane
    // (stacked on mobile, two-up on lg), streaming live values to the iframe.
    return (
      <Show when={options.preview} fallback={<EditorPane />}>
        <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <EditorPane />
          {/* Mobile-first: the editor is full-width and edit-focused on phones;
              the side-by-side live preview is a desktop (lg+) enrichment, so the
              pane only renders there (and avoids a collapsed-height iframe on
              mobile). */}
          <Show when={options.preview?.url()}>
            {(url) => (
              <div class="hidden lg:sticky lg:top-4 lg:block lg:h-[calc(100vh-2rem)]">
                <VisualEditingPane
                  src={url()}
                  allowedOrigin={options.preview?.allowedOrigin?.()}
                  previewValues={previewValues()}
                  previewTarget={{
                    collection: options.collection.slug,
                    id: Number(row.data?.id),
                  }}
                  class="border-base-300 rounded-box h-full w-full border"
                  title="Live preview"
                />
              </div>
            )}
          </Show>
        </div>
      </Show>
    );
  };
}
