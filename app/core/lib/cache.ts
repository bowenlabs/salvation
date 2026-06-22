const isDev =
  typeof caches === "undefined" || typeof caches.default === "undefined";

export async function purgeCache(url: string): Promise<void> {
  if (isDev) {
    console.log(`[cache] DEV — skipping purge: ${url}`);
    return;
  }
  try {
    await caches.default.delete(new Request(url));
  } catch (err) {
    console.warn("[cache] Purge failed:", err);
  }
}
