// Copyright (c) 2026 BowenLabs. All rights reserved.
// Cadmea is MIT licensed. See LICENSE in the repo root.

import { describe, expect, it } from "vitest";
import { cropForRatio } from "./ImageHotspotField";

// cropForRatio maps a target aspect ratio onto crop edges (fractions of the
// source) — the load-bearing logic behind the crop editor's ratio presets,
// circle (1:1), and the builder's product-ratio matching.

describe("cropForRatio", () => {
  it("returns no crop when the target ratio already matches the source", () => {
    const crop = cropForRatio(3 / 2, 1500, 1000); // source ratio 3:2
    expect(crop.top).toBeCloseTo(0);
    expect(crop.right).toBeCloseTo(0);
    expect(crop.bottom).toBeCloseTo(0);
    expect(crop.left).toBeCloseTo(0);
  });

  it("crops top/bottom when the target is wider than the source", () => {
    // Source 2:3 (portrait, ratio .667); target 1:1 (>source) ⇒ trim height.
    const crop = cropForRatio(1, 1000, 1500);
    expect(crop.left).toBeCloseTo(0);
    expect(crop.right).toBeCloseTo(0);
    // visible height fraction = sourceRatio/target = .667 ⇒ trim .333 split.
    expect(crop.top).toBeCloseTo(1 / 6, 2);
    expect(crop.bottom).toBeCloseTo(1 / 6, 2);
  });

  it("crops left/right when the target is taller than the source", () => {
    // Source 3:2 (landscape, 1.5); target 1:1 (<source) ⇒ trim width.
    const crop = cropForRatio(1, 1500, 1000);
    expect(crop.top).toBeCloseTo(0);
    expect(crop.bottom).toBeCloseTo(0);
    // visible width fraction = target/sourceRatio = 1/1.5 = .667 ⇒ trim .333.
    expect(crop.left).toBeCloseTo(1 / 6, 2);
    expect(crop.right).toBeCloseTo(1 / 6, 2);
  });

  it("centers the crop band on the focal point, clamped in-bounds", () => {
    // Landscape source, square target ⇒ horizontal band; focal far right
    // clamps so the band stays within [0,1].
    const crop = cropForRatio(1, 1500, 1000, { x: 0.95, y: 0.5 });
    expect(crop.right).toBeCloseTo(0); // pinned to the right edge
    expect(crop.left).toBeCloseTo(1 / 3, 2);
  });
});
