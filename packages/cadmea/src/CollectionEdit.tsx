import type { CollectionConfig, FieldConfig } from "@bowenlabs/cadmus/cms";
import { createSignal, For, Show } from "solid-js";

// Fields the generic form can actually render today. `id` is never
// user-editable. `date` fields (e.g. createdAt) are server-defaulted and
// shown read-only rather than editable in this step.
function editableFields(config: CollectionConfig): [string, FieldConfig][] {
  return Object.entries(config.fields).filter(([key]) => key !== "id");
}

export interface CollectionEditProps {
  config: CollectionConfig;
  initialValues?: Record<string, unknown>;
  onSubmit: (values: Record<string, unknown>) => void | Promise<void>;
  submitLabel?: string;
  error?: string;
}

export function CollectionEdit(props: CollectionEditProps) {
  const [values, setValues] = createSignal<Record<string, unknown>>(
    props.initialValues ?? {},
  );

  function setField(key: string, value: unknown) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    // date fields are read-only — never include them in the submitted payload
    const editable = Object.fromEntries(
      Object.entries(values()).filter(
        ([key]) => props.config.fields[key]?.type !== "date",
      ),
    );
    void props.onSubmit(editable);
  }

  return (
    <form class="flex flex-col gap-4" onSubmit={handleSubmit}>
      <Show when={props.error}>
        <p class="text-sm text-error">{props.error}</p>
      </Show>
      <For each={editableFields(props.config)}>
        {([key, field]) => (
          <div class="form-control">
            <label class="label" for={key}>
              {key}
              {field.required ? " *" : ""}
            </label>
            {renderInput(key, field, values()[key], setField)}
          </div>
        )}
      </For>
      <button type="submit" class="btn btn-primary self-start">
        {props.submitLabel ?? "Save"}
      </button>
    </form>
  );
}

function renderInput(
  key: string,
  field: FieldConfig,
  value: unknown,
  setField: (key: string, value: unknown) => void,
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
    default:
      // richText/checkbox/relationship/array/upload aren't supported by
      // the generic form yet — render nothing rather than crash.
      return null;
  }
}

function formatDateValue(value: unknown): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value as string);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}
