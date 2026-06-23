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
