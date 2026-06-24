import { describe, expect, it } from "vitest";
import {
  buildTokenStyle,
  contrastRatio,
  generateColorScale,
  getFontConfig,
  passesAA,
  pickContentColor,
  resolveSpacingTokens,
  resolveTypeTokens,
} from "./index.js";

describe("contrast", () => {
  it("computes the WCAG ratio for black on white as 21:1", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
  });

  it("passesAA for black on white, fails for light grey on white", () => {
    expect(passesAA("#000000", "#ffffff")).toBe(true);
    expect(passesAA("#cccccc", "#ffffff")).toBe(false);
  });
});

describe("generateColorScale", () => {
  it("produces all 11 OKLCH stops, lightest at 50", () => {
    const scale = generateColorScale("#2563eb");
    expect(Object.keys(scale)).toHaveLength(11);
    expect(scale["50"]).toMatch(/^oklch\(/);
    expect(scale["950"]).toMatch(/^oklch\(/);
    // 50 is lighter than 950
    const l = (s: string) => Number(s.match(/oklch\(([\d.]+)%/)?.[1]);
    expect(l(scale["50"])).toBeGreaterThan(l(scale["950"]));
  });
});

describe("pickContentColor", () => {
  it("picks dark content on a light swatch and light on a dark one", () => {
    expect(pickContentColor("oklch(97% 0.02 250)")).toBe("oklch(15% 0 0)");
    expect(pickContentColor("oklch(20% 0.05 250)")).toBe("oklch(100% 0 0)");
  });
});

describe("resolveSpacingTokens / resolveTypeTokens", () => {
  it("falls back to balanced spacing for an unknown preset", () => {
    expect(resolveSpacingTokens("nonsense")).toEqual(
      resolveSpacingTokens("balanced"),
    );
  });

  it("merges only non-empty type overrides over the defaults", () => {
    const out = resolveTypeTokens({ textBase: "1.1rem", textXs: "  " });
    expect(out.textBase).toBe("1.1rem");
    // blank override ignored → keeps default
    expect(out.textXs).toBe("0.75rem");
  });
});

describe("getFontConfig", () => {
  it("falls back to classic for unknown/empty pairings", () => {
    expect(getFontConfig(undefined)).toEqual(getFontConfig("classic"));
    expect(getFontConfig("not-a-pairing")).toEqual(getFontConfig("classic"));
  });
});

describe("buildTokenStyle", () => {
  it("always emits a :root block with spacing/type tokens", () => {
    const css = buildTokenStyle({});
    expect(css).toContain(":root {");
    expect(css).toContain("--spacing-section-y:");
    expect(css).toContain("--text-base:");
  });

  it("always emits the --color-backdrop constant, regardless of settings", () => {
    expect(buildTokenStyle({})).toContain(
      "--color-backdrop: rgb(0 0 0 / 0.5);",
    );
    expect(buildTokenStyle({ theme: "noir", brandColor: "#2563eb" })).toContain(
      "--color-backdrop: rgb(0 0 0 / 0.5);",
    );
  });

  it("scopes brand-color overrides to the theme selector", () => {
    const css = buildTokenStyle({ theme: "noir", brandColor: "#2563eb" });
    expect(css).toContain('[data-theme="theme-noir"] {');
    expect(css).toContain("--color-primary:");
    expect(css).toContain("--color-primary-content:");
  });

  it("ignores invalid hex brand colors (no override block)", () => {
    const css = buildTokenStyle({ brandColor: "blue" });
    expect(css).not.toContain("--color-primary:");
  });

  it("maps structural slots and font pairing into the override block", () => {
    const css = buildTokenStyle({
      navBackground: "#111111",
      fontPairing: "modern",
    });
    expect(css).toContain("--navbar: #111111;");
    expect(css).toContain("--font-display-face:");
  });
});
