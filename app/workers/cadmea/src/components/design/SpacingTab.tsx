import {
  SPACING_PRESETS,
  type SpacingPreset,
} from "@thebes/cadmea-design-system";
import { For, type JSX } from "solid-js";

export interface SpacingTabProps {
  value?: string | null;
  onChange: (preset: SpacingPreset) => void;
}

const PRESET_KEYS = Object.keys(SPACING_PRESETS) as SpacingPreset[];

const DESCRIPTIONS: Record<SpacingPreset, string> = {
  compact: "Denser layout — smaller padding, tighter rows.",
  balanced: "The default — comfortable spacing for most sites.",
  airy: "Generous whitespace — slower, editorial pacing.",
};

export default function SpacingTab(props: SpacingTabProps): JSX.Element {
  const current = () => props.value ?? "balanced";

  return (
    <div class="grid gap-3 sm:grid-cols-3">
      <For each={PRESET_KEYS}>
        {(preset) => (
          <button
            type="button"
            class="rounded-2xl border p-4 text-left transition"
            classList={{
              "border-[var(--lagoon-deep)]": current() === preset,
              "border-[var(--line)]": current() !== preset,
            }}
            onClick={() => props.onChange(preset)}
          >
            <p class="m-0 text-sm font-semibold capitalize">{preset}</p>
            <p class="m-0 mt-1 text-sm text-[var(--sea-ink-soft)]">
              {DESCRIPTIONS[preset]}
            </p>
            <div
              class="mt-3 rounded-lg bg-[var(--chip-bg)]"
              style={{ padding: SPACING_PRESETS[preset].cardPaddingY }}
            >
              <div class="h-2 rounded bg-[var(--lagoon)]" />
            </div>
          </button>
        )}
      </For>
    </div>
  );
}
