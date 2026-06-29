// Copyright (c) 2026 BowenLabs. All rights reserved.
// MIT licensed. See LICENSE in the repo root.
//
// Compute the transform that turns a cropped source image into a print-ready
// file matching a Printful product's print area, with an optional uniform white
// border.
//
// This module is PURE — it only does the geometry (border px from inches×DPI,
// the inner image box, the crop region in source pixels, the focal-point
// gravity). The actual rasterization is applied by the consumer at runtime
// (e.g. via Cloudflare Images) — kept out of here so the math is unit-testable
// without a Worker, a binding, or a Printful key.
import type { ImageCrop, ImageHotspot } from "@thebes/cadmus/storage";

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

/** A Printful product's required print-file spec (from its printfiles API). */
export interface PrintSpec {
  /** Required print-file pixel dimensions. */
  widthPx: number;
  heightPx: number;
  /** Print DPI — converts a border in inches to pixels. */
  dpi: number;
}

export interface PrintTransformInput {
  spec: PrintSpec;
  /** Uniform white border in inches (0 / undefined = none). */
  borderInches?: number;
  /** Source crop/focal/dimensions carried on the media ref. */
  crop?: ImageCrop;
  hotspot?: ImageHotspot;
  sourceWidth?: number;
  sourceHeight?: number;
  /** How the image fills the inner box. "cover" fills (may crop edges),
   * "contain" fits the whole image (may letterbox onto white). Default cover. */
  fit?: "cover" | "contain";
}

export interface PrintTransform {
  /** Final output size = the print spec. */
  width: number;
  height: number;
  /** Image box after reserving the border on all sides. */
  innerWidth: number;
  innerHeight: number;
  /** Uniform white border in px (inches × dpi, rounded, ≥ 0). */
  borderPx: number;
  fit: "cover" | "contain";
  background: "#ffffff";
  /** Focal point (0–1) for cover-cropping, when a hotspot is set. */
  gravity?: { x: number; y: number };
  /** Crop region in SOURCE pixels, when a crop + source dimensions exist. */
  trim?: { top: number; right: number; bottom: number; left: number };
}

/**
 * Compute the print transform. The image (after its editorial crop) is scaled
 * into `inner = spec − 2·border` honoring `fit`, centered on the focal point,
 * then the border pads it back out to the full `spec` on a white ground.
 */
export function computePrintTransform(
  input: PrintTransformInput,
): PrintTransform {
  const {
    spec,
    borderInches = 0,
    crop,
    hotspot,
    sourceWidth,
    sourceHeight,
    fit = "cover",
  } = input;

  const borderPx = Math.max(0, Math.round(borderInches * spec.dpi));
  // Reserve the border on all four sides; never collapse below 1px.
  const innerWidth = Math.max(1, spec.widthPx - 2 * borderPx);
  const innerHeight = Math.max(1, spec.heightPx - 2 * borderPx);

  const transform: PrintTransform = {
    width: spec.widthPx,
    height: spec.heightPx,
    innerWidth,
    innerHeight,
    borderPx,
    fit,
    background: "#ffffff",
  };

  if (hotspot) {
    transform.gravity = { x: clamp01(hotspot.x), y: clamp01(hotspot.y) };
  }
  if (crop && sourceWidth && sourceHeight) {
    transform.trim = {
      top: Math.round(clamp01(crop.top ?? 0) * sourceHeight),
      right: Math.round(clamp01(crop.right ?? 0) * sourceWidth),
      bottom: Math.round(clamp01(crop.bottom ?? 0) * sourceHeight),
      left: Math.round(clamp01(crop.left ?? 0) * sourceWidth),
    };
  }

  return transform;
}
