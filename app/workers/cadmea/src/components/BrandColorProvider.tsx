import {
  buildTokenStyle,
  type TokenStyleInput,
} from "@thebes/cadmea-design-system";
import { createEffect, createSignal, type JSX } from "solid-js";
import { useDesignPreviewOverrides } from "./design-preview-context";

export interface BrandColorProviderProps extends TokenStyleInput {
  darkMode?: boolean;
  children: JSX.Element;
}

function applyPanelTokens(
  props: BrandColorProviderProps,
  setActiveTheme: (t: string) => void,
) {
  const root = document.documentElement;
  const themeName = props.theme ?? "citadel";

  root.setAttribute("data-theme", `theme-${themeName}`);
  setActiveTheme(themeName);

  let style = document.getElementById(
    "cadmea-panel-tokens",
  ) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = "cadmea-panel-tokens";
    document.head.appendChild(style);
  }
  style.textContent = buildTokenStyle(props);
}

// Sole writer of `data-theme` in the Panel — see ThemeToggle.tsx and
// __root.tsx's comments on the naming collision this resolves. Mounted in
// __root.tsx wrapping the route tree, fed by the getCadmeaSiteSettings
// server function. Merges in any uncommitted edits from the /admin/design
// route (via DesignPreviewContext) so the Panel re-themes live, before the
// owner saves — see design-preview-context.tsx.
export default function BrandColorProvider(props: BrandColorProviderProps) {
  const [overrides] = useDesignPreviewOverrides();
  const [activeTheme, setActiveTheme] = createSignal(props.theme ?? "citadel");

  createEffect(() => {
    const effective: BrandColorProviderProps = {
      ...props,
      ...overrides(),
      children: props.children,
    };
    applyPanelTokens(effective, setActiveTheme);
  });

  return (
    <>
      <link rel="stylesheet" href={`/themes/theme-${activeTheme()}.css`} />
      {props.children}
    </>
  );
}
