---
"@thebes/cadmea": patch
---

Fix collection list views (`createCollectionListPage`) hanging on a stuck
loading spinner on a hard page load. The list's `createQuery` ran during SSR,
and TanStack Start serialized its in-flight fetch as a streamed hydration
resource it never resolved — so a full page load never replaced the SSR
loading fallback (a client-side navigation into the same route worked). The
query is now client-only (`enabled: !isServer`) and SSR emits a static
spinner, so the client fetches fresh on mount. Downstream apps no longer need
a route-level `ssr` flag to work around this.
