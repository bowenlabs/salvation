import type { CollectionConfig } from "@bowenlabs/cadmus/cms";
import {
  createMutation,
  createQuery,
  useQueryClient,
} from "@tanstack/solid-query";
import { createSignal, Show } from "solid-js";
import { CollectionEdit } from "../CollectionEdit.js";

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
}

/**
 * Builds an edit-page component for a collection — fetch, update, and
 * delete, all wired together. See `createCollectionListPage`'s doc
 * comment for the rationale on keeping navigation in the route file.
 */
export function createCollectionEditPage(options: CollectionEditPageOptions) {
  return function CollectionEditPage() {
    const queryClient = useQueryClient();
    const [error, setError] = createSignal<string>();

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
            onSubmit={(values) => update.mutate(values)}
            onUploadFile={options.onUploadFile}
          />
        </Show>
        <button
          type="button"
          class="btn btn-error btn-outline btn-sm self-start"
          onClick={() => remove.mutate()}
        >
          {options.deleteLabel ?? `Delete ${options.collection.slug}`}
        </button>
      </div>
    );
  };
}
