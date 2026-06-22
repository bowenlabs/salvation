import type { JSX } from "solid-js";

export interface SeoTabValues {
  metaDescription?: string | null;
  defaultOgImageUrl?: string | null;
  disableIndexing?: boolean | null;
}

export interface SeoTabProps {
  values: SeoTabValues;
  onChange: (
    key: "metaDescription" | "defaultOgImageUrl",
    value: string,
  ) => void;
  onDisableIndexingChange: (value: boolean) => void;
}

export default function SeoTab(props: SeoTabProps): JSX.Element {
  return (
    <div class="flex flex-col gap-4">
      <div class="form-control">
        <label class="label" for="metaDescription">
          Meta description
        </label>
        <textarea
          id="metaDescription"
          class="textarea"
          maxlength={160}
          value={props.values.metaDescription ?? ""}
          onInput={(e) =>
            props.onChange("metaDescription", e.currentTarget.value)
          }
        />
        <span class="label text-xs text-[var(--sea-ink-soft)]">
          {(props.values.metaDescription ?? "").length}/160
        </span>
      </div>

      <div class="form-control">
        <label class="label" for="defaultOgImageUrl">
          Default social share image URL
        </label>
        <input
          id="defaultOgImageUrl"
          type="text"
          class="input"
          placeholder="https://…"
          value={props.values.defaultOgImageUrl ?? ""}
          onInput={(e) =>
            props.onChange("defaultOgImageUrl", e.currentTarget.value)
          }
        />
      </div>

      <label class="label flex items-center gap-2">
        <input
          type="checkbox"
          class="checkbox"
          checked={props.values.disableIndexing ?? false}
          onChange={(e) =>
            props.onDisableIndexingChange(e.currentTarget.checked)
          }
        />
        Hide this site from search engines
      </label>
      <p class="text-sm text-[var(--sea-ink-soft)]">
        When enabled, every public page is served with a "noindex" tag — search
        engines won't list this site.
      </p>
    </div>
  );
}
