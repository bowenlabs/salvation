import type { CollectionConfig, FieldConfig } from "@bowenlabs/cadmus/cms";
import { For, Show } from "solid-js";

// Field types that can be rendered as a plain table cell today.
// `id` is intentionally excluded — it's never a useful list column.
function listableFields(config: CollectionConfig): [string, FieldConfig][] {
  return Object.entries(config.fields).filter(
    ([key, field]) => key !== "id" && field.type !== "richText",
  );
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (value instanceof Date) return value.toLocaleDateString();
  return String(value);
}

export interface CollectionListProps {
  config: CollectionConfig;
  rows: Record<string, unknown>[];
  onRowClick?: (row: Record<string, unknown>) => void;
}

export function CollectionList(props: CollectionListProps) {
  const columns = () => listableFields(props.config);

  return (
    <Show
      when={props.rows.length > 0}
      fallback={<p class="text-sm opacity-70">No {props.config.slug} yet.</p>}
    >
      <table class="table">
        <thead>
          <tr>
            <For each={columns()}>{([key]) => <th>{key}</th>}</For>
          </tr>
        </thead>
        <tbody>
          <For each={props.rows}>
            {(row) => (
              <tr
                class={props.onRowClick ? "cursor-pointer hover" : undefined}
                onClick={() => props.onRowClick?.(row)}
              >
                <For each={columns()}>
                  {([key]) => <td>{formatCellValue(row[key])}</td>}
                </For>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </Show>
  );
}
