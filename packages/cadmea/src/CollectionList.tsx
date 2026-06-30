import {
  type ColumnDef,
  createSolidTable,
  flexRender,
  getCoreRowModel,
} from "@tanstack/solid-table";
import type { CollectionConfig, FieldConfig } from "@thebes/cadmus/cms";
import { createSignal, For, type JSX, Match, Show, Switch } from "solid-js";

type Row = Record<string, unknown>;

/**
 * Presentational layout for the list. "table" (default) keeps the generic
 * daisyUI table + mobile cards. "rows" renders each row through `renderRow`
 * beneath an optional `renderHead` — for bespoke per-collection row markup
 * (status pills, avatars, custom columns). "cards" renders `renderCard` in a
 * responsive grid (portfolio / media galleries). Selection, sorting,
 * pagination, and the data query are identical across every layout — only the
 * row presentation changes.
 */
export type ListLayout = "table" | "rows" | "cards";

/**
 * Passed to custom `renderRow` / `renderCard` slots so bespoke markup stays
 * wired to the list's selection + activation behaviour. The `selectMode` /
 * `selected` getters read the underlying signals, so reading them inside a
 * renderer's JSX is reactive.
 */
export interface RowRenderHelpers {
  /** Row id (`row.id`), or undefined for id-less rows. */
  id: number | undefined;
  /** Whether bulk-select mode is active. */
  readonly selectMode: boolean;
  /** Whether this row is currently selected. */
  readonly selected: boolean;
  /** Toggle this row's selection (no-op for id-less rows). */
  toggleSelected: () => void;
  /** Activate the row — toggles selection in select mode, else onRowClick. */
  activate: () => void;
}

// Field types that can be rendered as a plain table cell today.
// `id` is intentionally excluded — it's never a useful list column.
// `richText`/`array` are structured content, not a sensible table cell;
// `relationship` has no resolved label available here (CollectionList
// only receives raw row data, not the related collection's rows) so it'd
// show a bare numeric id — excluded until that's worth solving.
function listableFields(config: CollectionConfig): [string, FieldConfig][] {
  const excluded = new Set(["richText", "array", "relationship"]);
  return Object.entries(config.fields).filter(
    ([key, field]) => key !== "id" && !excluded.has(field.type),
  );
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (value instanceof Date) return value.toLocaleDateString();
  return String(value);
}

function rowId(row: Row): number | undefined {
  return typeof row.id === "number" ? row.id : undefined;
}

/** A bulk operation offered in select mode, run against the selected row ids. */
export interface BulkAction {
  /** Button label, e.g. "Publish", "Delete". */
  label: string;
  /** daisyUI button modifier appended to the class, e.g. "btn-error". */
  variant?: string;
  /** If set, `window.confirm(this)` must pass before the action runs. */
  confirm?: string;
  /** Runs the action against the currently-selected row ids. */
  run: (ids: number[]) => void | Promise<void>;
}

export interface CollectionListProps {
  config: CollectionConfig;
  rows: Row[];
  onRowClick?: (row: Row) => void;

  /**
   * 1-based current page. Omit (along with `pageSize`) to render without
   * the pagination bar entirely — list views with no `find()` paging
   * wired up yet still render correctly.
   */
  page?: number;
  pageSize?: number;
  /** Total row count across all pages — see `LocalApi.count()`. Enables
   * disabling "Next" exactly at the last page; omit to fall back to a
   * `rows.length < pageSize` heuristic. */
  totalCount?: number;
  onPageChange?: (page: number) => void;

  /** Field key currently sorted on. Omit to hide the sort control. */
  sortField?: string;
  sortDirection?: "asc" | "desc";
  onSortChange?: (field: string, direction: "asc" | "desc") => void;

  /** Shows the "Select" bulk-select mode toggle. */
  selectable?: boolean;
  selectedIds?: ReadonlySet<number>;
  onSelectionChange?: (selectedIds: Set<number>) => void;
  /**
   * Bulk operations shown in select mode. Each runs against the selected ids;
   * selection is cleared once the action resolves. Provide these to surface the
   * action toolbar (publish/delete/status, etc.).
   */
  bulkActions?: BulkAction[];

  /**
   * Friendly empty state shown when there are no rows — pass one with a "New"
   * CTA (the list factory does this). Falls back to a simple default.
   */
  emptyState?: JSX.Element;

  /** Presentational layout — see {@link ListLayout}. Defaults to "table". */
  layout?: ListLayout;
  /** Header row for the "rows" layout (e.g. a bespoke `.list-head`). */
  renderHead?: () => JSX.Element;
  /**
   * Row renderer for the "rows" layout. Receives selection/activation helpers
   * so bespoke markup stays wired to bulk-select + row-click.
   */
  renderRow?: (row: Row, helpers: RowRenderHelpers) => JSX.Element;
  /** Card renderer for the "cards" layout (responsive grid). */
  renderCard?: (row: Row, helpers: RowRenderHelpers) => JSX.Element;
  /** Extra toolbar content (e.g. filter chips) shown beside sort/select. */
  renderToolbar?: () => JSX.Element;
}

export function CollectionList(props: CollectionListProps) {
  // Columns are derived once from the collection schema — the single source
  // of truth feeding BOTH the desktop <table> and the mobile card list below
  // (issue #25's mobile-first note). Sorting/pagination/selection stay
  // controlled by the consuming route (server-driven), so the table is
  // configured with just the core row model; its header/cell rendering is
  // driven through flexRender so a future custom cell renderer (links,
  // badges, thumbnails) is a per-column change, not a markup fork.
  const columns = (): ColumnDef<Row>[] =>
    listableFields(props.config).map(([key]) => ({
      id: key,
      accessorFn: (row) => row[key],
      header: key,
      cell: (info) => formatCellValue(info.getValue()),
    }));

  const table = createSolidTable<Row>({
    get data() {
      return props.rows;
    },
    get columns() {
      return columns();
    },
    getCoreRowModel: getCoreRowModel(),
  });

  const [selectMode, setSelectMode] = createSignal(false);
  const [running, setRunning] = createSignal(false);

  const selectedCount = () => props.selectedIds?.size ?? 0;

  const pageIds = (): number[] =>
    props.rows.map(rowId).filter((id): id is number => id !== undefined);

  const allSelected = () => {
    const ids = pageIds();
    return ids.length > 0 && ids.every((id) => props.selectedIds?.has(id));
  };

  function toggleSelected(id: number) {
    const next = new Set(props.selectedIds ?? []);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    props.onSelectionChange?.(next);
  }

  function toggleAll() {
    const next = new Set(props.selectedIds ?? []);
    const ids = pageIds();
    if (allSelected()) for (const id of ids) next.delete(id);
    else for (const id of ids) next.add(id);
    props.onSelectionChange?.(next);
  }

  async function runBulk(action: BulkAction) {
    const ids = [...(props.selectedIds ?? [])];
    if (ids.length === 0 || running()) return;
    if (action.confirm && !window.confirm(action.confirm)) return;
    setRunning(true);
    try {
      await action.run(ids);
      props.onSelectionChange?.(new Set());
    } finally {
      setRunning(false);
    }
  }

  function handleRowActivate(row: Row) {
    if (selectMode()) {
      const id = rowId(row);
      if (id !== undefined) toggleSelected(id);
      return;
    }
    props.onRowClick?.(row);
  }

  // Per-row helpers handed to custom renderRow/renderCard slots. Getters keep
  // selectMode/selected reactive when read inside a renderer's JSX.
  function helpersFor(row: Row): RowRenderHelpers {
    const id = rowId(row);
    return {
      id,
      get selectMode() {
        return selectMode();
      },
      get selected() {
        return id !== undefined && (props.selectedIds?.has(id) ?? false);
      },
      toggleSelected: () => {
        if (id !== undefined) toggleSelected(id);
      },
      activate: () => handleRowActivate(row),
    };
  }

  return (
    <div class="flex flex-col gap-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <Show when={props.selectable}>
          <button
            type="button"
            class="btn btn-outline btn-sm"
            onClick={() => setSelectMode((v) => !v)}
          >
            {selectMode() ? "Done" : "Select"}
          </button>
        </Show>
        {/* Dropdown picker, not clickable column headers — sort works the
            same on touch and desktop, see issue #25's mobile-first note. */}
        <Show when={props.onSortChange}>
          <div class="join">
            <select
              aria-label="Sort by"
              class="select select-sm join-item"
              value={props.sortField ?? ""}
              onChange={(e) =>
                props.onSortChange?.(
                  e.currentTarget.value,
                  props.sortDirection ?? "asc",
                )
              }
            >
              <For each={table.getAllColumns()}>
                {(column) => <option value={column.id}>{column.id}</option>}
              </For>
            </select>
            <select
              aria-label="Sort direction"
              class="select select-sm join-item"
              value={props.sortDirection ?? "asc"}
              onChange={(e) =>
                props.onSortChange?.(
                  props.sortField ?? table.getAllColumns()[0]?.id ?? "",
                  e.currentTarget.value as "asc" | "desc",
                )
              }
            >
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          </div>
        </Show>
      </div>

      {/* Consumer toolbar slot — filter chips, segmented controls, etc. */}
      <Show when={props.renderToolbar}>{props.renderToolbar?.()}</Show>

      {/* Bulk-action toolbar — appears in select mode. Page-scoped "select all",
          a live selected count, and the consumer's actions (publish/delete/…),
          disabled while one is running or nothing is selected. */}
      <Show when={selectMode()}>
        <div class="bg-base-200 rounded-box flex flex-wrap items-center gap-2 p-2">
          <span class="text-sm opacity-70">{selectedCount()} selected</span>
          <button
            type="button"
            class="btn btn-ghost btn-xs"
            disabled={pageIds().length === 0}
            onClick={toggleAll}
          >
            {allSelected() ? "Clear all" : "Select all"}
          </button>
          <Show when={props.bulkActions?.length}>
            <div class="ml-auto flex flex-wrap gap-2">
              <For each={props.bulkActions}>
                {(action) => (
                  <button
                    type="button"
                    class={`btn btn-sm ${action.variant ?? ""}`}
                    disabled={selectedCount() === 0 || running()}
                    onClick={() => runBulk(action)}
                  >
                    {action.label}
                  </button>
                )}
              </For>
            </div>
          </Show>
        </div>
      </Show>

      <Show
        when={props.rows.length > 0}
        fallback={
          props.emptyState ?? (
            <div class="border-base-300 rounded-box flex flex-col items-center gap-1 border border-dashed py-12 text-center">
              <p class="text-base-content/70 m-0">
                No {props.config.slug} yet.
              </p>
            </div>
          )
        }
      >
        <Switch>
          {/* "cards" layout — responsive grid of consumer-rendered cards
              (portfolio / media galleries). */}
          <Match when={props.layout === "cards" && props.renderCard}>
            <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              <For each={props.rows}>
                {(row) => props.renderCard?.(row, helpersFor(row))}
              </For>
            </div>
          </Match>
          {/* "rows" layout — bespoke `.list-head` + per-row markup. */}
          <Match when={props.layout === "rows" && props.renderRow}>
            <div class="flex flex-col">
              {props.renderHead?.()}
              <For each={props.rows}>
                {(row) => props.renderRow?.(row, helpersFor(row))}
              </For>
            </div>
          </Match>
          {/* Default "table" layout. */}
          <Match when={true}>
            {/* Table on desktop — hidden below md per the mobile-first card
            layout below, not the other way around. The `hidden md:block`
            lives on a WRAPPER, not the <table>: daisyUI's `.table` sets
            `display: table` with higher precedence than Tailwind's
            `.hidden`, so `class="table hidden md:table"` leaked the table
            into the mobile breakpoint (table AND cards rendered at once).
            `overflow-x-auto` lets a wide table scroll instead of clipping. */}
            <div class="hidden overflow-x-auto md:block">
              <table class="table">
                <thead>
                  <For each={table.getHeaderGroups()}>
                    {(headerGroup) => (
                      <tr>
                        <Show when={selectMode()}>
                          <th>
                            <input
                              type="checkbox"
                              class="checkbox checkbox-sm"
                              aria-label="Select all"
                              checked={allSelected()}
                              onChange={toggleAll}
                            />
                          </th>
                        </Show>
                        <For each={headerGroup.headers}>
                          {(header) => (
                            <th>
                              {flexRender(
                                header.column.columnDef.header,
                                header.getContext(),
                              )}
                            </th>
                          )}
                        </For>
                      </tr>
                    )}
                  </For>
                </thead>
                <tbody>
                  <For each={table.getRowModel().rows}>
                    {(row) => (
                      <tr
                        class={
                          props.onRowClick || selectMode()
                            ? "cursor-pointer hover"
                            : undefined
                        }
                        onClick={() => handleRowActivate(row.original)}
                      >
                        <Show when={selectMode()}>
                          <td>
                            <input
                              type="checkbox"
                              class="checkbox checkbox-sm"
                              onClick={(e) => e.stopPropagation()}
                              checked={
                                rowId(row.original) !== undefined &&
                                (props.selectedIds?.has(
                                  rowId(row.original) as number,
                                ) ??
                                  false)
                              }
                              onChange={() => {
                                const id = rowId(row.original);
                                if (id !== undefined) toggleSelected(id);
                              }}
                            />
                          </td>
                        </Show>
                        <For each={row.getVisibleCells()}>
                          {(cell) => (
                            // Truncate long cell values (slugs, SEO meta, free
                            // text) so one field can't blow a column out and make
                            // the whole table unreadable; `title` exposes the full
                            // value on hover.
                            <td
                              class="max-w-[28ch] truncate"
                              title={String(cell.getValue() ?? "")}
                            >
                              {flexRender(
                                cell.column.columnDef.cell,
                                cell.getContext(),
                              )}
                            </td>
                          )}
                        </For>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>

            {/* Stacked card list on mobile/tablet — tap-to-select via an
            always-visible checkbox in select mode, never hover-revealed.
            Same table model as the desktop view, rendered as key/value rows. */}
            <div class="flex flex-col gap-2 md:hidden">
              <For each={table.getRowModel().rows}>
                {(row) => (
                  // biome-ignore lint/a11y/useSemanticElements: a native <button> can't contain interactive content (the select-mode checkbox below); role="button" + tabIndex/onKeyDown is the standard fallback.
                  <div
                    class="card bg-base-200 cursor-pointer p-3"
                    role="button"
                    tabIndex={0}
                    onClick={() => handleRowActivate(row.original)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleRowActivate(row.original);
                      }
                    }}
                  >
                    <div class="flex items-start gap-3">
                      <Show when={selectMode()}>
                        <input
                          type="checkbox"
                          class="checkbox checkbox-sm mt-1"
                          onClick={(e) => e.stopPropagation()}
                          checked={
                            rowId(row.original) !== undefined &&
                            (props.selectedIds?.has(
                              rowId(row.original) as number,
                            ) ??
                              false)
                          }
                          onChange={() => {
                            const id = rowId(row.original);
                            if (id !== undefined) toggleSelected(id);
                          }}
                        />
                      </Show>
                      <div class="flex flex-1 flex-col gap-1">
                        <For each={row.getVisibleCells()}>
                          {(cell) => (
                            <div class="flex justify-between gap-2 text-sm">
                              <span class="opacity-60">{cell.column.id}</span>
                              <span class="text-right">
                                {flexRender(
                                  cell.column.columnDef.cell,
                                  cell.getContext(),
                                )}
                              </span>
                            </div>
                          )}
                        </For>
                      </div>
                    </div>
                  </div>
                )}
              </For>
            </div>
          </Match>
        </Switch>
      </Show>

      {/* Bottom-anchored prev/next bar — no page numbers, per issue #25's
          mobile-first note. Renders only when pagination is wired up. */}
      <Show when={props.page !== undefined && props.pageSize !== undefined}>
        <div class="bg-base-100 sticky bottom-0 flex items-center justify-between gap-2 border-t py-2">
          <button
            type="button"
            class="btn btn-sm"
            disabled={(props.page ?? 1) <= 1}
            onClick={() => props.onPageChange?.((props.page ?? 1) - 1)}
          >
            Prev
          </button>
          <span class="text-sm opacity-70">Page {props.page}</span>
          <button
            type="button"
            class="btn btn-sm"
            disabled={
              props.totalCount !== undefined
                ? (props.page ?? 1) * (props.pageSize ?? 0) >= props.totalCount
                : props.rows.length < (props.pageSize ?? 0)
            }
            onClick={() => props.onPageChange?.((props.page ?? 1) + 1)}
          >
            Next
          </button>
        </div>
      </Show>
    </div>
  );
}
