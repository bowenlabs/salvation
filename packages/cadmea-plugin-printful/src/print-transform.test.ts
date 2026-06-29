import { describe, expect, it } from "vitest";
import { computePrintTransform } from "./print-transform.js";

// Pure geometry for the print pipeline: border px from inches×DPI, the inner
// image box, source-pixel crop, and focal-point gravity.

const spec = { widthPx: 3000, heightPx: 4500, dpi: 300 }; // 10"×15" @ 300dpi

describe("computePrintTransform", () => {
  it("no border: inner box equals the full print spec", () => {
    const t = computePrintTransform({ spec });
    expect(t.width).toBe(3000);
    expect(t.height).toBe(4500);
    expect(t.borderPx).toBe(0);
    expect(t.innerWidth).toBe(3000);
    expect(t.innerHeight).toBe(4500);
    expect(t.fit).toBe("cover");
    expect(t.background).toBe("#ffffff");
  });

  it("0.25in border at 300dpi reserves 75px on every side", () => {
    const t = computePrintTransform({ spec, borderInches: 0.25 });
    expect(t.borderPx).toBe(75);
    expect(t.innerWidth).toBe(3000 - 150);
    expect(t.innerHeight).toBe(4500 - 150);
  });

  it("0.5in border at 300dpi reserves 150px on every side", () => {
    const t = computePrintTransform({ spec, borderInches: 0.5 });
    expect(t.borderPx).toBe(150);
    expect(t.innerWidth).toBe(2700);
    expect(t.innerHeight).toBe(4200);
  });

  it("maps a hotspot to clamped gravity", () => {
    const t = computePrintTransform({ spec, hotspot: { x: 1.2, y: 0.3 } });
    expect(t.gravity).toEqual({ x: 1, y: 0.3 });
  });

  it("converts a fractional crop to source pixels", () => {
    const t = computePrintTransform({
      spec,
      crop: { top: 0.1, right: 0, bottom: 0.1, left: 0 },
      sourceWidth: 2000,
      sourceHeight: 1000,
    });
    expect(t.trim).toEqual({ top: 100, right: 0, bottom: 100, left: 0 });
  });

  it("omits trim when source dimensions are unknown", () => {
    const t = computePrintTransform({
      spec,
      crop: { top: 0.1, right: 0, bottom: 0, left: 0 },
    });
    expect(t.trim).toBeUndefined();
  });

  it("never collapses the inner box below 1px for an oversized border", () => {
    const t = computePrintTransform({
      spec: { widthPx: 100, heightPx: 100, dpi: 300 },
      borderInches: 1, // 300px border on a 100px print
    });
    expect(t.innerWidth).toBe(1);
    expect(t.innerHeight).toBe(1);
  });
});
