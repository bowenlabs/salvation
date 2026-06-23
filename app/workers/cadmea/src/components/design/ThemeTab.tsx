import type { FontPairingKey } from "@thebes/cadmea-design-system";
import {
  buildAllFontsUrl,
  getFontConfig,
  THEME_PRESET_LIST,
} from "@thebes/cadmea-design-system";
import { For, type JSX } from "solid-js";

const FONT_PAIRINGS: FontPairingKey[] = [
  "classic",
  "modern",
  "artisan",
  "bold",
  "soft",
  "citadel",
  "literary",
];

export interface ThemeTabValues {
  theme?: string | null;
  fontPairing?: string | null;
  darkMode?: boolean | null;
}

export interface ThemeTabProps {
  values: ThemeTabValues;
  onThemeChange: (theme: string) => void;
  onFontPairingChange: (pairing: string) => void;
  onDarkModeChange: (darkMode: boolean) => void;
}

function capitalize(value: string): string {
  return value
    .split("-")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

export default function ThemeTab(props: ThemeTabProps): JSX.Element {
  return (
    <div class="flex flex-col gap-6">
      <div>
        <span class="label">Theme preset</span>
        {/* Loading all 6 theme stylesheets is safe — every rule in each file
            is scoped under its own [data-theme="theme-X"] selector, so they
            never collide with each other or the document's actual active
            theme. This lets each card show a real, live swatch of a theme
            that isn't currently applied. */}
        <For each={THEME_PRESET_LIST}>
          {(preset) => (
            <link rel="stylesheet" href={`/themes/theme-${preset}.css`} />
          )}
        </For>
        <div class="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <For each={THEME_PRESET_LIST}>
            {(preset) => (
              <button
                type="button"
                class="rounded-2xl border p-3 text-left transition"
                classList={{
                  "border-[var(--lagoon-deep)]": props.values.theme === preset,
                  "border-[var(--line)]": props.values.theme !== preset,
                }}
                onClick={() => props.onThemeChange(preset)}
              >
                <div
                  data-theme={`theme-${preset}`}
                  class="flex h-12 items-center justify-center rounded-[var(--radius-box,0.5rem)] bg-[var(--color-base-100)] text-[var(--color-primary)]"
                  style={{
                    "font-family": "var(--font-display-face, inherit)",
                  }}
                >
                  <span class="h-4 w-4 rounded-full bg-[var(--color-primary)]" />
                  <span class="ml-2 h-4 w-4 rounded-full bg-[var(--color-secondary)]" />
                  <span class="ml-2 h-4 w-4 rounded-full bg-[var(--color-accent)]" />
                </div>
                <p class="m-0 mt-2 text-sm font-semibold">
                  {capitalize(preset)}
                </p>
              </button>
            )}
          </For>
        </div>
      </div>

      <div>
        <span class="label">Font pairing</span>
        {/* Loads every pairing's font files once, up front — avoids 7
            separate network round-trips as the owner browses swatches. */}
        <link rel="stylesheet" href={buildAllFontsUrl()} />
        <div class="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <For each={FONT_PAIRINGS}>
            {(pairing) => {
              const font = getFontConfig(pairing);
              return (
                <button
                  type="button"
                  class="rounded-2xl border p-3 text-left transition"
                  classList={{
                    "border-[var(--lagoon-deep)]":
                      (props.values.fontPairing ?? "classic") === pairing,
                    "border-[var(--line)]":
                      (props.values.fontPairing ?? "classic") !== pairing,
                  }}
                  onClick={() => props.onFontPairingChange(pairing)}
                >
                  <p
                    class="m-0 text-lg"
                    style={{ "font-family": font.displayFamily }}
                  >
                    {capitalize(pairing)}
                  </p>
                  <p
                    class="m-0 text-sm text-[var(--sea-ink-soft)]"
                    style={{ "font-family": font.bodyFamily }}
                  >
                    The quick brown fox jumps over the lazy dog.
                  </p>
                </button>
              );
            }}
          </For>
        </div>
      </div>

      <label class="label flex items-center gap-2">
        <input
          type="checkbox"
          class="checkbox"
          checked={props.values.darkMode ?? false}
          onChange={(e) => props.onDarkModeChange(e.currentTarget.checked)}
        />
        Default to dark mode
      </label>
    </div>
  );
}
