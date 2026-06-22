import { QueryClient } from "@tanstack/solid-query";
import { createRouter as createTanStackRouter } from "@tanstack/solid-router";
import { routeTree } from "./routeTree.gen";

// Fresh per call — getRouter() runs once per request (TanStack Start's
// SSR entry calls it per-request), so creating the QueryClient here
// rather than at module scope keeps each request's query cache isolated.
// A module-level singleton would leak cached data across requests, since
// Workers reuse the same isolate (and its module state) across requests.
export function getRouter() {
  const queryClient = new QueryClient();

  const router = createTanStackRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
  });

  return router;
}

declare module "@tanstack/solid-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
