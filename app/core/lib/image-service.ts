import type { ImageService } from "@bowenlabs/cadmus/storage";
import { validateImageFile } from "@bowenlabs/cadmus/storage";

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
