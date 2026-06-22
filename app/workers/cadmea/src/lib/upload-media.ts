// Browser-side counterpart to createR2ImageService — the browser has no
// R2 binding, so it must POST the file to /api/media/upload (server.ts)
// instead of calling ImageService.upload() directly. Used as the
// onUploadFile handler wired into CollectionEdit's upload fields and by
// <MediaUploader>.
export function uploadMediaFile(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<{ url: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/media/upload");

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable)
        onProgress?.(Math.round((e.loaded / e.total) * 100));
    };

    xhr.onload = () => {
      let body: { url?: string; error?: string } | null = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        // fall through to the generic error below
      }
      if (xhr.status >= 200 && xhr.status < 300 && body?.url) {
        resolve({ url: body.url });
      } else {
        reject(new Error(body?.error ?? `Upload failed (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error("Upload failed"));

    const formData = new FormData();
    formData.set("file", file);
    xhr.send(formData);
  });
}
