import { createMutation, useQueryClient } from "@tanstack/solid-query";
import type { CollectionConfig } from "@thebes/cadmus/cms";
import { createSignal } from "solid-js";
import { CollectionEdit, type CollectionEditProps } from "../CollectionEdit.js";

export interface CollectionCreatePageOptions<
  TCreated extends Record<string, unknown>,
> {
  collection: CollectionConfig;
  /** Page heading — e.g. "New page". Defaults to `New ${collection.slug}`. */
  label?: string;
  submitLabel?: string;
  createFn: (values: Record<string, unknown>) => Promise<TCreated>;
  /** Query key to invalidate after a successful create — e.g. `['pages']`. */
  invalidateQueryKey: readonly unknown[];
  /** Called after a successful create+cache-invalidation — wire this to navigate to the new row's edit page. */
  onCreated?: (created: TCreated) => void;
  /** Forwarded to CollectionEdit — resolves an `upload` field's selected file to a stored URL. */
  onUploadFile?: (file: File) => Promise<{ url: string }>;
  /** Per-field custom editor widgets (issue #17), keyed by field name — forwarded to CollectionEdit. */
  fieldWidgets?: CollectionEditProps["fieldWidgets"];
  /**
   * Options for `relationship` fields, keyed by the related collection's slug —
   * forwarded to CollectionEdit. The create factory needs this (not just the
   * edit factory) so a create form can populate a relationship picker — e.g. a
   * "template" create-flow where picking a category drives `admin.defaultFrom`
   * (default the title from it) and `admin.appendOnCreate` (issue #98).
   */
  relationshipOptions?: CollectionEditProps["relationshipOptions"];
}

/**
 * Builds a create-page component for a collection. See
 * `createCollectionListPage`'s doc comment for the same rationale on
 * keeping navigation in the route file rather than this package.
 */
export function createCollectionCreatePage<
  TCreated extends Record<string, unknown>,
>(options: CollectionCreatePageOptions<TCreated>) {
  return function CollectionCreatePage() {
    const queryClient = useQueryClient();
    const [error, setError] = createSignal<string>();

    const create = createMutation(() => ({
      mutationFn: options.createFn,
      onSuccess: (created: TCreated) => {
        queryClient.invalidateQueries({ queryKey: options.invalidateQueryKey });
        options.onCreated?.(created);
      },
      onError: (e: Error) => setError(e.message),
    }));

    return (
      <div class="flex flex-col gap-4">
        <h1 class="text-xl font-semibold">
          {options.label ?? `New ${options.collection.slug}`}
        </h1>
        <CollectionEdit
          config={options.collection}
          submitLabel={options.submitLabel ?? "Create"}
          error={error()}
          onSubmit={(values) => create.mutate(values)}
          onUploadFile={options.onUploadFile}
          fieldWidgets={options.fieldWidgets}
          relationshipOptions={options.relationshipOptions}
        />
      </div>
    );
  };
}
