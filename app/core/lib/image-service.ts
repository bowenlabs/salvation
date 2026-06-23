import type { ImageService } from "@thebes/cadmus/storage";
import { validateImageFile } from "@thebes/cadmus/storage";

// To switch the whole app to Cloudflare Image Resizing, import the adapter
// (@thebes/cadmus-cloudflare-images) and return it from
// createImageService() below — a one-line change confined to this file.

// Extracts a short, safe extension from the original filename — never
// keys R2 objects off the raw filename itself (arbitrary characters,
// path-like segments). Falls back to no extension if the name has none.
function safeExtension(filename: string): string {
  const match = /\.([a-zA-Z0-9]{1,5})$/.exec(filename);
  return match ? `.${match[1].toLowerCase()}` : "";
}

// R2 implementation of the ImageService interface. Database rows always
// store the URL returned by `upload()` — the original, fully-qualified
// R2 URL — never a derived/transform URL. No server-side resizing in
// Section 1; `render()` is a pass-through until a Cloudflare Images
// extension (Section 3+) replaces this implementation.
export function createR2ImageService(
  bucket: R2Bucket,
  mediaUrl: string,
): ImageService {
  return {
    async upload(file) {
      // Defense-in-depth — the /api/media/upload route already validates
      // before calling this, but upload() is also reachable from any
      // other future caller (e.g. a server function).
      validateImageFile(file);
      const key = `${crypto.randomUUID()}${safeExtension(file.name)}`;
      await bucket.put(key, file);
      return { url: `${mediaUrl}/${key}` };
    },
    render({ url }) {
      return { src: url };
    },
  };
}

/**
 * The app's single image-service selection point. Every call site resolves
 * its `ImageService` through this one function, so swapping the active
 * implementation (e.g. to `@thebes/cadmus-cloudflare-images`) is a
 * one-line change confined to this file — no component, renderer, or block
 * data changes, and the database still stores original R2 URLs either way.
 */
export function createImageService(
  bucket: R2Bucket,
  mediaUrl: string,
): ImageService {
  return createR2ImageService(bucket, mediaUrl);
  // Cloudflare Image Resizing (opt-in, e.g. Section 3+):
  // return createCloudflareImageService({ bucket, mediaUrl });
}
