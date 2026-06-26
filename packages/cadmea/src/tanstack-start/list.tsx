import { createQuery } from "@tanstack/solid-query";
import { Link } from "@tanstack/solid-router";
import type { CollectionConfig } from "@thebes/cadmus/cms";
import { createSignal, Show } from "solid-js";
import { CollectionList } from "../CollectionList.js";
import type { CollectionCapabilities } from "../capabilities.js";

export interface CollectionListQueryParams {
  page: number;
  pageSize: number;
  sortField?: string;
  sortDirection?: "asc" | "desc";
}

export interface CollectionListQueryResult<TRow> {
  rows: TRow[];
  /** Total row count across all pages — see `LocalApi.count()`. Drives
   * `CollectionList`'s "Next" disabled state. */
  total: number;
}

export interface CollectionListPageOptions<
  TRow extends Record<string, unknown>,
> {
  collection: CollectionConfig;
  /** Page heading — e.g. "Pages". Defaults to the collection slug. */
  label?: string;
  queryKey: readonly unknown[];
  /**
   * Receives the current page/sort state — re-run whenever any of them
   * change, since pagination/sorting happen server-side via `LocalApi`'s
   * `find({ limit, offset, orderBy })` + `count()`, not by slicing an
   * already-fetched array client-side.
   */
  queryFn: (
    params: CollectionListQueryParams,
  ) => Promise<CollectionListQueryResult<TRow>>;
  /** Rows per page. Defaults to 20. */
  pageSize?: number;
  /** Link href for the "New …" button. Omit to hide the button entirely. */
  newHref?: string;
  /** Label for the "New …" button — e.g. "New page". */
  newLabel?: string;
  /** Called when a row is clicked — wire this to your router's navigate(). */
  onRowClick?: (row: TRow) => void;
  /**
   * A function, not a plain value — re-evaluated on every reactive read,
   * so it stays correct as the underlying capabilities query resolves/
   * refetches. Hides the "New …" button when `canCreate` is `false`. See
   * issue #26's RBAC-aware admin UI.
   */
  capabilities?: () => CollectionCapabilities | undefined;
}

/**
 * Builds a list-view page component for a collection — paginated/sortable
 * query, loading state, and the generic table/card list, wired together.
 * The returned component is meant to be passed directly as a route's
 * `component`:
 *
 * ```tsx
 * export const Route = createFileRoute('/admin/pages/')({
 *   component: createCollectionListPage({
 *     collection: pagesCollection,
 *     label: 'Pages',
 *     queryKey: ['pages'],
 *     queryFn: (params) => getPages({ data: params }),
 *     newHref: '/admin/pages/new',
 *     newLabel: 'New page',
 *     onRowClick: (row) => navigate({ to: '/admin/pages/$pageId', params: { pageId: String(row.id) } }),
 *   }),
 * })
 * ```
 *
 * Navigation stays in the route file (via `onRowClick`/`newHref` as plain
 * strings) rather than this package calling `useNavigate()` itself —
 * TanStack Router's route-typing is generated per-app, so a generic
 * package can't produce a correctly-typed `navigate()` call for routes
 * it doesn't know about.
 */
export function createCollectionListPage<TRow extends Record<string, unknown>>(
  options: CollectionListPageOptions<TRow>,
) {
  return function CollectionListPage() {
    const pageSize = options.pageSize ?? 20;
    const [page, setPage] = createSignal(1);
    const [sortField, setSortField] = createSignal<string | undefined>(
      undefined,
    );
    const [sortDirection, setSortDirection] = createSignal<"asc" | "desc">(
      "asc",
    );

    const result = createQuery(() => ({
      queryKey: [...options.queryKey, page(), sortField(), sortDirection()],
      queryFn: () =>
        options.queryFn({
          page: page(),
          pageSize,
          sortField: sortField(),
          sortDirection: sortDirection(),
        }),
    }));

    function handleSortChange(field: string, direction: "asc" | "desc") {
      setSortField(field);
      setSortDirection(direction);
      setPage(1);
    }

    return (
      <div class="flex flex-col gap-4">
        <div class="flex items-center justify-between">
          <h1 class="text-xl font-semibold">
            {options.label ?? options.collection.slug}
          </h1>
          <Show
            when={
              options.newHref && options.capabilities?.()?.canCreate !== false
            }
          >
            <Link to={options.newHref} class="btn btn-primary btn-sm">
              {options.newLabel ?? `New ${options.collection.slug}`}
            </Link>
          </Show>
        </div>
        <Show
          when={!result.isLoading}
          fallback={<div class="loading loading-spinner" />}
        >
          <CollectionList
            config={options.collection}
            rows={result.data?.rows ?? []}
            emptyState={
              <div class="border-base-300 rounded-box flex flex-col items-center gap-3 border border-dashed py-12 text-center">
                <p class="text-base-content/70 m-0">
                  No {options.label ?? options.collection.slug} yet.
                </p>
                <Show
                  when={
                    options.newHref &&
                    options.capabilities?.()?.canCreate !== false
                  }
                >
                  <Link to={options.newHref} class="btn btn-primary btn-sm">
                    {options.newLabel ?? `New ${options.collection.slug}`}
                  </Link>
                </Show>
              </div>
            }
            onRowClick={
              options.onRowClick as
                | ((row: Record<string, unknown>) => void)
                | undefined
            }
            page={page()}
            pageSize={pageSize}
            totalCount={result.data?.total}
            onPageChange={setPage}
            sortField={sortField()}
            sortDirection={sortDirection()}
            onSortChange={handleSortChange}
          />
        </Show>
      </div>
    );
  };
}
