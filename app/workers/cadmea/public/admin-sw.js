// Cadmea admin PWA service worker. Registered with scope "/admin/" only —
// see routes/admin/route.tsx's head() — this never touches the public site
// or anything outside the admin panel.
const CACHE_NAME = "cadmea-admin-shell-v1";
const SHELL_ASSETS = [
  "/admin/manifest.webmanifest",
  "/logo192.png",
  "/logo512.png",
  "/favicon.ico",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
        ),
      ),
  );
});

// Cache-first for the static app-shell assets only. Everything else (admin
// pages, server functions, the public REST API) goes straight to the
// network — this is a CMS admin backed by live D1 data, not a static site;
// serving stale content from cache here would be a bug, not an offline win.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || !SHELL_ASSETS.includes(url.pathname)) {
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request)),
  );
});
