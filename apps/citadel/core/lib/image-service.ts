import type { ImageService } from "@bowenlabs/cadmus/storage";

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
      const key = `${crypto.randomUUID()}-${file.name}`;
      await bucket.put(key, file);
      return { url: `${mediaUrl}/${key}` };
    },
    render({ url }) {
      return { src: url };
    },
  };
}
