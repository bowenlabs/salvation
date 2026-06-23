import {
  createMutation,
  createQuery,
  useQueryClient,
} from "@tanstack/solid-query";
import { useBlocker } from "@tanstack/solid-router";
import type { CollectionConfig } from "@thebes/cadmus/cms";
import { createSignal, Show } from "solid-js";
import { CollectionEdit } from "../CollectionEdit.js";
import type { CollectionCapabilities } from "../capabilities.js";

export interface CollectionEditDraftOptions {
  /** Saves the live form values as a new draft version, returning its id. */
  saveDraftFn: (values: Record<string, unknown>) => Promise<{ id: number }>;
  /** Publishes a saved draft by id — the most recent one from `saveDraftFn`. */
  publishFn: (versionId: number) => Promise<unknown>;
  saveDraftLabel?: string;
  publishLabel?: string;
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

    return (
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
            onDirtyChange={setDirty}
            capabilities={options.capabilities?.()}
            draftActions={
              options.draftActions && {
                onSaveDraft: (values) => saveDraft.mutate(values),
                onPublish: () => publish.mutate(),
                saving: saveDraft.isPending,
                publishing: publish.isPending,
                canPublish: latestDraftId() !== undefined,
                saveDraftLabel: options.draftActions.saveDraftLabel,
                publishLabel: options.draftActions.publishLabel,
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
  };
}
