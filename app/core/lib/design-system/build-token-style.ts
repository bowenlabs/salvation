// Shared cascade logic — the single place that turns SiteSettings into the
// CSS override <style> text. Called from three places (Astro site layout,
// Cadmea's BrandColorProvider, and the PreviewTokenListener script) so the
// override logic exists exactly once instead of being copy-pasted three
// times the way Louise's prior-art version was.
import { generateColorScale, pickContentColor } from "../color-scale.js";
import { getFontConfig } from "../font-pairing.js";
import {
  buildSpacingTokenStyles,
  resolveSpacingTokens,
  resolveTypeTokens,
} from "./resolve-spacing-tokens.js";
import type { SpacingPreset } from "./spacing-presets.js";
import type { TypeTokens } from "./type-defaults.js";

export interface TokenStyleInput {
  theme?: string | null;
  brandColor?: string | null;
  secondaryColor?: string | null;
  tertiaryColor?: string | null;
  navBackground?: string | null;
  navTextColor?: string | null;
  footerBackground?: string | null;
  footerTextColor?: string | null;
  pageBackground?: string | null;
  surfaceBackground?: string | null;
  spacingPreset?: SpacingPreset | string | null;
  typeTokens?: Partial<TypeTokens> | null;
  fontPairing?: string | null;
}

const isHex = (v: string | null | undefined): v is string =>
  typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);

// Builds the full override `<style>` body for a given theme name + settings.
// Layer order matches docs: spacing/type on :root, then brand/structural/font
// overrides scoped to `[data-theme="theme-{name}"]` so they sit on top of
// the theme file's own defaults (loaded via <link>, source order wins).
export function buildTokenStyle(settings: TokenStyleInput): string {
  const themeName = settings.theme ?? "citadel";
  const themeSelector = `[data-theme="theme-${themeName}"]`;
  const parts: string[] = [];

  const spacing = resolveSpacingTokens(settings.spacingPreset);
  const type = resolveTypeTokens(settings.typeTokens);
  parts.push(`:root {\n${buildSpacingTokenStyles(spacing, type)}\n}`);

  const overrides: string[] = [];

  // Primary scale — DaisyUI v5 only has one primary swatch + one content
  // color, no built-in 50-950 ramp. We still generate the full ramp (it's
  // useful for hover/tint variations the issue's milestones expect) and
  // additionally set DaisyUI's own --color-primary/-content from the
  // ramp's 500 stop, content-color chosen via real WCAG contrast check.
  if (isHex(settings.brandColor)) {
    const scale = generateColorScale(settings.brandColor);
    for (const [stop, value] of Object.entries(scale)) {
      overrides.push(`  --color-primary-${stop}: ${value};`);
    }
    overrides.push(`  --color-primary: ${scale["500"]};`);
    overrides.push(
      `  --color-primary-content: ${pickContentColor(scale["500"])};`,
    );
  }

  const secondaryHex = isHex(settings.secondaryColor)
    ? settings.secondaryColor
    : settings.brandColor;
  if (isHex(secondaryHex)) {
    const scale = generateColorScale(secondaryHex);
    for (const [stop, value] of Object.entries(scale)) {
      overrides.push(`  --color-secondary-${stop}: ${value};`);
    }
    overrides.push(`  --color-secondary: ${scale["500"]};`);
    overrides.push(
      `  --color-secondary-content: ${pickContentColor(scale["500"])};`,
    );
  }

  const tertiaryHex = isHex(settings.tertiaryColor)
    ? settings.tertiaryColor
    : settings.brandColor;
  if (isHex(tertiaryHex)) {
    const scale = generateColorScale(tertiaryHex);
    for (const [stop, value] of Object.entries(scale)) {
      overrides.push(`  --color-accent-${stop}: ${value};`);
    }
    overrides.push(`  --color-accent: ${scale["500"]};`);
    overrides.push(
      `  --color-accent-content: ${pickContentColor(scale["500"])};`,
    );
  }

  // Named structural slot overrides — Cadmea-specific extension tokens,
  // not DaisyUI's own (DaisyUI has no separate navbar/footer color slots).
  const structuralSlots: [string | null | undefined, string][] = [
    [settings.pageBackground, "--color-base-100"],
    [settings.surfaceBackground, "--color-base-200"],
    [settings.navBackground, "--navbar"],
    [settings.navTextColor, "--navbar-foreground"],
    [settings.footerBackground, "--footer"],
    [settings.footerTextColor, "--footer-foreground"],
  ];
  for (const [value, variable] of structuralSlots) {
    if (isHex(value)) overrides.push(`  ${variable}: ${value};`);
  }

  // fontPairing is a separate owner-facing override on top of whichever
  // font the theme preset itself bakes into theme-{name}.css's own
  // --font-display-face/--font-body-face — same source-order-wins
  // mechanism as the color overrides above.
  if (settings.fontPairing) {
    const font = getFontConfig(settings.fontPairing);
    overrides.push(`  --font-display-face: ${font.displayFamily};`);
    overrides.push(`  --font-body-face: ${font.bodyFamily};`);
  }

  if (overrides.length > 0) {
    parts.push(`${themeSelector} {\n${overrides.join("\n")}\n}`);
  }

  return parts.join("\n");
}
