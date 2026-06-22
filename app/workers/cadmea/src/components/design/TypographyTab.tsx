import {
  TYPE_DEFAULTS,
  type TypeTokens,
} from "@core/lib/design-system/type-defaults";
import { For, type JSX } from "solid-js";

export interface TypographyTabProps {
  values: Partial<TypeTokens> | null | undefined;
  onChange: (key: keyof TypeTokens, value: string) => void;
}

const SIZE_KEYS: (keyof TypeTokens)[] = [
  "textXs",
  "textSm",
  "textBase",
  "textLg",
  "textXl",
  "text2xl",
  "text3xl",
  "text4xl",
  "text5xl",
];
const LEADING_KEYS: (keyof TypeTokens)[] = [
  "leadingTight",
  "leadingSnug",
  "leadingNormal",
  "leadingRelaxed",
  "leadingLoose",
];
const TRACKING_KEYS: (keyof TypeTokens)[] = [
  "trackingTight",
  "trackingNormal",
  "trackingWide",
  "trackingWidest",
];

function labelFor(key: string): string {
  return key.replace(/([a-z])([A-Z0-9])/g, "$1 $2");
}

function FieldGroup(props: {
  title: string;
  keys: (keyof TypeTokens)[];
  values: Partial<TypeTokens> | null | undefined;
  onChange: (key: keyof TypeTokens, value: string) => void;
}): JSX.Element {
  return (
    <div>
      <p class="m-0 mb-2 text-sm font-semibold">{props.title}</p>
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <For each={props.keys}>
          {(key) => (
            <div class="form-control">
              <label class="label" for={key}>
                {labelFor(key)}
              </label>
              <input
                id={key}
                type="text"
                class="input"
                value={props.values?.[key] ?? TYPE_DEFAULTS[key]}
                onInput={(e) => props.onChange(key, e.currentTarget.value)}
              />
            </div>
          )}
        </For>
      </div>
    </div>
  );
}

export default function TypographyTab(props: TypographyTabProps): JSX.Element {
  return (
    <div class="flex flex-col gap-6">
      <FieldGroup
        title="Size"
        keys={SIZE_KEYS}
        values={props.values}
        onChange={props.onChange}
      />
      <FieldGroup
        title="Line height"
        keys={LEADING_KEYS}
        values={props.values}
        onChange={props.onChange}
      />
      <FieldGroup
        title="Letter spacing"
        keys={TRACKING_KEYS}
        values={props.values}
        onChange={props.onChange}
      />
    </div>
  );
}
