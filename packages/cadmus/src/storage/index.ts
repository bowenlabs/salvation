// Copyright (c) 2026 BowenLabs. All rights reserved.
// Cadmus is MIT licensed. See LICENSE in the repo root.
//
// @bowenlabs/cadmus/storage
//
// Defines the ImageService contract only — R2 upload/serve and any
// alternate implementation (e.g. a Cloudflare Images extension) live
// outside this primitive. Cadmus ships the interface so apps can swap
// implementations without touching any component, renderer, or block
// data; it has no opinion on which implementation is active.

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
