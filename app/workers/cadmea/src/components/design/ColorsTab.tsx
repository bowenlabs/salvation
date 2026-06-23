import {
  contrastRatio,
  generateColorScale,
  passesAA,
} from "@thebes/cadmea-design-system";
import { For, type JSX, Show } from "solid-js";

export interface ColorsTabValues {
  brandColor?: string | null;
  secondaryColor?: string | null;
  tertiaryColor?: string | null;
  navBackground?: string | null;
  navTextColor?: string | null;
  footerBackground?: string | null;
  footerTextColor?: string | null;
  pageBackground?: string | null;
  surfaceBackground?: string | null;
}

export interface ColorsTabProps {
  values: ColorsTabValues;
  onChange: (key: keyof ColorsTabValues, value: string) => void;
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function ColorField(props: {
  id: string;
  label: string;
  value: string | null | undefined;
  onInput: (value: string) => void;
  showRamp?: boolean;
}): JSX.Element {
  const hex = () =>
    HEX_RE.test(props.value ?? "") ? (props.value as string) : null;

  return (
    <div class="form-control">
      <label class="label" for={props.id}>
        {props.label}
      </label>
      <div class="flex items-center gap-2">
        <input
          type="color"
          class="h-10 w-10 cursor-pointer rounded-lg border border-[var(--line)] bg-transparent p-0"
          value={hex() ?? "#000000"}
          onInput={(e) => props.onInput(e.currentTarget.value)}
        />
        <input
          id={props.id}
          type="text"
          class="input flex-1"
          placeholder="#rrggbb"
          value={props.value ?? ""}
          onInput={(e) => props.onInput(e.currentTarget.value)}
        />
      </div>
      <Show when={props.showRamp && hex()}>
        <div class="mt-2 flex overflow-hidden rounded-lg">
          <For each={Object.entries(generateColorScale(hex() as string))}>
            {([stop, value]) => (
              <div
                class="h-6 flex-1"
                style={{ "background-color": value }}
                title={stop}
              />
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

function ContrastWarning(props: {
  fg: string | null | undefined;
  bg: string | null | undefined;
}) {
  const valid = () =>
    HEX_RE.test(props.fg ?? "") && HEX_RE.test(props.bg ?? "");
  const ratio = () =>
    valid() ? contrastRatio(props.fg as string, props.bg as string) : null;
  const ok = () =>
    valid() ? passesAA(props.fg as string, props.bg as string) : true;

  return (
    <Show when={valid() && !ok()}>
      <p class="m-0 text-sm text-error">
        Contrast ratio {ratio()?.toFixed(1)}:1 — fails WCAG AA (needs 4.5:1).
      </p>
    </Show>
  );
}

export default function ColorsTab(props: ColorsTabProps): JSX.Element {
  return (
    <div class="flex flex-col gap-6">
      <div>
        <p class="m-0 mb-2 text-sm font-semibold">Brand colors</p>
        <div class="grid gap-4 sm:grid-cols-3">
          <ColorField
            id="brandColor"
            label="Primary"
            value={props.values.brandColor}
            onInput={(v) => props.onChange("brandColor", v)}
            showRamp
          />
          <ColorField
            id="secondaryColor"
            label="Secondary"
            value={props.values.secondaryColor}
            onInput={(v) => props.onChange("secondaryColor", v)}
            showRamp
          />
          <ColorField
            id="tertiaryColor"
            label="Accent"
            value={props.values.tertiaryColor}
            onInput={(v) => props.onChange("tertiaryColor", v)}
            showRamp
          />
        </div>
      </div>

      <div>
        <p class="m-0 mb-2 text-sm font-semibold">Structural colors</p>
        <div class="grid gap-4 sm:grid-cols-2">
          <div>
            <ColorField
              id="navBackground"
              label="Nav background"
              value={props.values.navBackground}
              onInput={(v) => props.onChange("navBackground", v)}
            />
            <ColorField
              id="navTextColor"
              label="Nav text"
              value={props.values.navTextColor}
              onInput={(v) => props.onChange("navTextColor", v)}
            />
            <ContrastWarning
              fg={props.values.navTextColor}
              bg={props.values.navBackground}
            />
          </div>
          <div>
            <ColorField
              id="footerBackground"
              label="Footer background"
              value={props.values.footerBackground}
              onInput={(v) => props.onChange("footerBackground", v)}
            />
            <ColorField
              id="footerTextColor"
              label="Footer text"
              value={props.values.footerTextColor}
              onInput={(v) => props.onChange("footerTextColor", v)}
            />
            <ContrastWarning
              fg={props.values.footerTextColor}
              bg={props.values.footerBackground}
            />
          </div>
          <ColorField
            id="pageBackground"
            label="Page background"
            value={props.values.pageBackground}
            onInput={(v) => props.onChange("pageBackground", v)}
          />
          <ColorField
            id="surfaceBackground"
            label="Surface background"
            value={props.values.surfaceBackground}
            onInput={(v) => props.onChange("surfaceBackground", v)}
          />
        </div>
      </div>
    </div>
  );
}
