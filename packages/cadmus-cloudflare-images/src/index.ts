// Copyright (c) 2026 BowenLabs. All rights reserved.
// MIT licensed. See LICENSE in the repo root.
//
// @thebes/cadmus-cloudflare-images
//
// A Cadmus *adapter* (the swappable-implementation axis): an alternate
// `ImageService` (from @thebes/cadmus/storage) backed by Cloudflare
// Image Resizing. Uploads still land in R2 and the database still stores
// the original R2 URL — only `render()` differs, returning responsive
// `/cdn-cgi/image/...` transform URLs instead of a pass-through `src`.
//
// Swap it in without touching any component or block data:
//
//   import { createCloudflareImageService } from "@thebes/cadmus-cloudflare-images";
//   const images = createCloudflareImageService({ bucket: env.R2, mediaUrl: env.MEDIA_URL });

import type { ImageService, RenderedImage } from "@thebes/cadmus/storage";
import { validateImageFile } from "@thebes/cadmus/storage";

export interface CloudflareImagesOptions {
  /** R2 bucket originals are uploaded to. */
  bucket: R2Bucket;
  /** Public base URL for original objects (an R2 custom domain), no
   *  trailing slash. Stored in the DB and used as the transform source. */
  mediaUrl: string;
  /**
   * Origin that serves `/cdn-cgi/image/...` (a zone with Image Resizing
   * enabled). Defaults to `mediaUrl`. No trailing slash.
   */
  deliveryUrl?: string;
  /** Widths emitted in `srcset`. Defaults to a sensible responsive set. */
  widths?: number[];
  /** `sizes` attribute value. Defaults to `100vw`. */
  sizes?: string;
  /** Output quality (1–100). Defaults to 80. */
  quality?: number;
}

const DEFAULT_WIDTHS = [320, 640, 960, 1280, 1920];

function safeExtension(filename: string): string {
  const match = /\.([a-zA-Z0-9]{1,5})$/.exec(filename);
  return match ? `.${match[1].toLowerCase()}` : "";
}

/** Builds a Cloudflare Image Resizing URL:
 *  `${deliveryUrl}/cdn-cgi/image/<options>/<source>`. */
function transformUrl(
  deliveryUrl: string,
  source: string,
  opts: { width?: number; height?: number; quality: number },
): string {
  const params = [`format=auto`, `quality=${opts.quality}`];
  if (opts.width) params.push(`width=${opts.width}`);
  if (opts.height) params.push(`height=${opts.height}`);
  return `${deliveryUrl}/cdn-cgi/image/${params.join(",")}/${source}`;
}

/**
 * Creates an `ImageService` that uploads to R2 and renders responsive
 * Cloudflare Image Resizing URLs. Drop-in replacement for the default R2
 * pass-through service — the database still stores the original R2 URL.
 */
export function createCloudflareImageService(
  options: CloudflareImagesOptions,
): ImageService {
  const {
    bucket,
    mediaUrl,
    deliveryUrl = mediaUrl,
    widths = DEFAULT_WIDTHS,
    sizes = "100vw",
    quality = 80,
  } = options;

  return {
    async upload(file) {
      // Defense-in-depth — callers should validate first, but upload() is
      // reachable directly too.
      validateImageFile(file);
      const key = `${crypto.randomUUID()}${safeExtension(file.name)}`;
      await bucket.put(key, file);
      // Store the ORIGINAL URL, never a transform URL (see CLAUDE.md
      // "Image service interface").
      return { url: `${mediaUrl}/${key}` };
    },

    render({ url, width, height }): RenderedImage {
      const largest = widths[widths.length - 1];
      const src = transformUrl(deliveryUrl, url, {
        width: width ?? largest,
        height,
        quality,
      });
      // A fixed width/height pins the rendition, so a srcset would be
      // misleading — emit just the single transformed src.
      if (width || height) {
        return { src };
      }
      const srcset = widths
        .map(
          (w) =>
            `${transformUrl(deliveryUrl, url, { width: w, quality })} ${w}w`,
        )
        .join(", ");
      return { src, srcset, sizes };
    },
  };
}
