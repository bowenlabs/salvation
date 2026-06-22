import type { JSX } from "solid-js";
import MediaUploader from "../MediaUploader";

export interface GeneralTabValues {
  siteName?: string | null;
  tagline?: string | null;
  logoUrl?: string | null;
  faviconUrl?: string | null;
  homepageLayout?: string | null;
}

export interface GeneralTabProps {
  values: GeneralTabValues;
  onChange: (key: keyof GeneralTabValues, value: string) => void;
}

const HOMEPAGE_LAYOUTS = ["editorial", "minimal", "gallery", "story"] as const;

export default function GeneralTab(props: GeneralTabProps): JSX.Element {
  return (
    <div class="flex flex-col gap-4">
      <div class="form-control">
        <label class="label" for="siteName">
          Site name
        </label>
        <input
          id="siteName"
          type="text"
          class="input"
          value={props.values.siteName ?? ""}
          onInput={(e) => props.onChange("siteName", e.currentTarget.value)}
        />
      </div>

      <div class="form-control">
        <label class="label" for="tagline">
          Tagline
        </label>
        <input
          id="tagline"
          type="text"
          class="input"
          value={props.values.tagline ?? ""}
          onInput={(e) => props.onChange("tagline", e.currentTarget.value)}
        />
      </div>

      <div class="form-control">
        <span class="label">Logo</span>
        <MediaUploader
          value={props.values.logoUrl}
          onUploaded={(url) => props.onChange("logoUrl", url)}
          label="Drop a logo here, or click to choose a file"
        />
      </div>

      <div class="form-control">
        <span class="label">Favicon</span>
        <MediaUploader
          value={props.values.faviconUrl}
          onUploaded={(url) => props.onChange("faviconUrl", url)}
          label="Drop a favicon here, or click to choose a file"
        />
      </div>

      <div class="form-control">
        <label class="label" for="homepageLayout">
          Homepage layout
        </label>
        <select
          id="homepageLayout"
          class="select"
          value={props.values.homepageLayout ?? "editorial"}
          onChange={(e) =>
            props.onChange("homepageLayout", e.currentTarget.value)
          }
        >
          {HOMEPAGE_LAYOUTS.map((layout) => (
            <option value={layout}>
              {layout[0].toUpperCase() + layout.slice(1)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
