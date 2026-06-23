import type { CollectionConfig, FieldConfig } from "@thebes/cadmus/cms";
import { createSignal, For, Show } from "solid-js";

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

function rowId(row: Record<string, unknown>): number | undefined {
  return typeof row.id === "number" ? row.id : undefined;
}

export interface CollectionListProps {
  config: CollectionConfig;
  rows: Record<string, unknown>[];
  onRowClick?: (row: Record<string, unknown>) => void;

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
}

export function CollectionList(props: CollectionListProps) {
  const columns = () => listableFields(props.config);
  const [selectMode, setSelectMode] = createSignal(false);

  function toggleSelected(id: number) {
    const next = new Set(props.selectedIds ?? []);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    props.onSelectionChange?.(next);
  }

  function handleRowActivate(row: Record<string, unknown>) {
    if (selectMode()) {
      const id = rowId(row);
      if (id !== undefined) toggleSelected(id);
      return;
    }
    props.onRowClick?.(row);
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
              <For each={columns()}>
                {([key]) => <option value={key}>{key}</option>}
              </For>
            </select>
            <select
              aria-label="Sort direction"
              class="select select-sm join-item"
              value={props.sortDirection ?? "asc"}
              onChange={(e) =>
                props.onSortChange?.(
                  props.sortField ?? columns()[0]?.[0] ?? "",
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

      <Show
        when={props.rows.length > 0}
        fallback={<p class="text-sm opacity-70">No {props.config.slug} yet.</p>}
      >
        {/* Table on desktop — hidden below md per the mobile-first card
            layout below, not the other way around. */}
        <table class="table hidden md:table">
          <thead>
            <tr>
              <Show when={selectMode()}>
                <th />
              </Show>
              <For each={columns()}>{([key]) => <th>{key}</th>}</For>
            </tr>
          </thead>
          <tbody>
            <For each={props.rows}>
              {(row) => (
                <tr
                  class={
                    props.onRowClick || selectMode()
                      ? "cursor-pointer hover"
                      : undefined
                  }
                  onClick={() => handleRowActivate(row)}
                >
                  <Show when={selectMode()}>
                    <td>
                      <input
                        type="checkbox"
                        class="checkbox checkbox-sm"
                        onClick={(e) => e.stopPropagation()}
                        checked={
                          rowId(row) !== undefined &&
                          (props.selectedIds?.has(rowId(row) as number) ??
                            false)
                        }
                        onChange={() => {
                          const id = rowId(row);
                          if (id !== undefined) toggleSelected(id);
                        }}
                      />
                    </td>
                  </Show>
                  <For each={columns()}>
                    {([key]) => <td>{formatCellValue(row[key])}</td>}
                  </For>
                </tr>
              )}
            </For>
          </tbody>
        </table>

        {/* Stacked card list on mobile/tablet — tap-to-select via an
            always-visible checkbox in select mode, never hover-revealed. */}
        <div class="flex flex-col gap-2 md:hidden">
          <For each={props.rows}>
            {(row) => (
              // biome-ignore lint/a11y/useSemanticElements: a native <button> can't contain interactive content (the select-mode checkbox below); role="button" + tabIndex/onKeyDown is the standard fallback.
              <div
                class="card bg-base-200 cursor-pointer p-3"
                role="button"
                tabIndex={0}
                onClick={() => handleRowActivate(row)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleRowActivate(row);
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
                        rowId(row) !== undefined &&
                        (props.selectedIds?.has(rowId(row) as number) ?? false)
                      }
                      onChange={() => {
                        const id = rowId(row);
                        if (id !== undefined) toggleSelected(id);
                      }}
                    />
                  </Show>
                  <div class="flex flex-1 flex-col gap-1">
                    <For each={columns()}>
                      {([key]) => (
                        <div class="flex justify-between gap-2 text-sm">
                          <span class="opacity-60">{key}</span>
                          <span class="text-right">
                            {formatCellValue(row[key])}
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
