// Copyright (c) 2026 BowenLabs. All rights reserved.
// Cadmus is MIT licensed. See LICENSE in the repo root.
//
// @thebes/cadmus/storage
//
// Defines the ImageService contract only — R2 upload/serve and any
// alternate implementation (e.g. a Cloudflare Images extension) live
// outside this primitive. Cadmus ships the interface so apps can swap
// implementations without touching any component, renderer, or block
// data; it has no opinion on which implementation is active.
import { CadmusStorageError } from "../errors.js";

/** A rendered `<img>`-ready description of a stored image. */
export interface RenderedImage {
  src: string;
  srcset?: string;
  sizes?: string;
}

/**
 * Focal point of an image (issue #17) — adopts Sanity's hotspot model.
 * Normalized 0–1 coordinates; `{ x: 0.5, y: 0.5 }` is dead center. When a
 * render crops (e.g. `fit=cover` to a fixed width/height), the focal point
 * is kept in frame instead of the geometric center, so a subject near an
 * edge isn't cut off.
 */
export interface ImageHotspot {
  x: number;
  y: number;
}

/**
 * A crop region (issue #17), as normalized 0–1 insets from each edge —
 * Sanity's crop model. `{ top: 0.1, bottom: 0, left: 0, right: 0.2 }` keeps
 * the middle-left 70%×90% of the image. Applying a crop region needs the
 * source's pixel dimensions (see the render input's `sourceWidth`/
 * `sourceHeight`); without them an implementation should fall back to the
 * hotspot alone.
 */
export interface ImageCrop {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/**
 * Resolved once per app and imported everywhere images are read or
 * written. Never construct storage URLs or `cdn-cgi/image/...` paths
 * inline — always go through an `ImageService`.
 */
export interface ImageService {
  upload: (file: File) => Promise<{ url: string }>;
  render: (image: {
    url: string;
    width?: number;
    height?: number;
    alt: string;
    /** Focal point for cover-crops (issue #17). */
    hotspot?: ImageHotspot;
    /** Crop region (issue #17); needs `sourceWidth`/`sourceHeight` to apply. */
    crop?: ImageCrop;
    /** Source pixel dimensions — required to apply a `crop` region. */
    sourceWidth?: number;
    sourceHeight?: number;
  }) => RenderedImage;
}

/** MIME types `validateImageFile` accepts — never trust a client-sent
 * MIME type beyond this whitelist check; it's still just `file.type`,
 * not a real content sniff, but rules out the obviously-wrong cases. */
export const IMAGE_MIME_WHITELIST = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

export const MAX_IMAGE_UPLOAD_BYTES = 5 * 1024 * 1024; // 5MB

/**
 * Validates a file against the image MIME whitelist and 5MB size cap
 * before it ever reaches `ImageService.upload()`/R2. Throws
 * `CadmusStorageError` — callers map that to the right HTTP status
 * (400 for an invalid type, 413 for oversize).
 */
export function validateImageFile(file: File): void {
  if (
    !IMAGE_MIME_WHITELIST.includes(
      file.type as (typeof IMAGE_MIME_WHITELIST)[number],
    )
  ) {
    throw new CadmusStorageError(
      `Unsupported file type: ${file.type || "unknown"}`,
    );
  }
  if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
    throw new CadmusStorageError(
      `File exceeds the ${MAX_IMAGE_UPLOAD_BYTES / (1024 * 1024)}MB limit`,
    );
  }
}

/**
 * A stored image-field value once parsed: either a bare URL, or the JSON
 * `{ url, hotspot?, crop?, width?, height?, shape? }` a hotspot/crop editor
 * writes (issue #17). `width`/`height` are the source pixel dimensions captured
 * at upload — the crop render path needs them. `shape: "circle"` marks a 1:1
 * crop that should render round.
 */
export interface ParsedImageRef {
  url: string;
  hotspot?: ImageHotspot;
  crop?: ImageCrop;
  width?: number;
  height?: number;
  shape?: "rect" | "circle";
}

/**
 * Parse a stored image-ref string into a render-ready shape. Bad JSON or a
 * plain string falls back to a bare URL, so existing content keeps working.
 */
export function parseImageRef(raw: string): ParsedImageRef {
  const trimmed = (raw ?? "").trim();
  if (trimmed.startsWith("{")) {
    try {
      const obj = JSON.parse(trimmed) as ParsedImageRef;
      if (obj && typeof obj.url === "string") return obj;
    } catch {
      // fall through to treating it as a bare URL
    }
  }
  return { url: trimmed };
}
