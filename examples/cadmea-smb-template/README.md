# cadmea-example-smb-template

A worked example combining every Section 3 Cadmea plugin onto one CMS
config, plus a storefront frontend — the integration target referenced
throughout `@thebes/cadmea-plugin-crm`, `@thebes/cadmea-plugin-redirects`,
and `@thebes/cadmea-plugin-ecommerce`'s own docs.

## What's wired up

- **`cadmea.config.ts`** — combines `crmPlugin()`, `redirectsPlugin()`, and
  `ecommercePlugin()` onto one config, plus a `inquiries` lead-capture
  collection (this example's own, not plugin-provided) with
  `createContactUpsertHook` wired onto it — demonstrating the late-binding
  `CmsRegistry.apis` pattern for real, end to end.
- **`src/server.ts`** — the backend API Worker: mounts the generic CMS
  REST API (`mountCmsRoutes`) plus `/checkout` and `/webhook`, wired to
  Square. Swapping to Stripe is the one-line change the file's own comment
  points at (`createStripePaymentProvider` instead of
  `createSquarePaymentProvider` — the `PaymentProvider` interface is what
  makes that a one-line change).
- **`src/components/ShopIsland.tsx`** + **`src/pages/shop/[slug].astro`** —
  the frontend: `@thebes/cadmea-ecommerce-ui`'s `ProductDetail`/
  `CartProvider`/`CartDrawer`/`CheckoutForm` components, mounted as a single
  Astro/SolidJS island, wired to Square's client-side tokenization helper
  (`@thebes/cadmea-plugin-ecommerce-square/client`).

## Two-Worker structure

This example mirrors Thebes's own real app (`app/workers/site` +
`app/workers/cadmea`): the backend (`src/server.ts`) and the frontend
(everything under `astro.config.mjs`) are two separate deployments, not one
Hono-wrapping-Astro Worker. That wiring (documented in this repo's own
`DECISIONS.md`) isn't this example's point — the plugin/component
integration is, so it's kept out of scope here.

```
src/server.ts        →  its own wrangler.jsonc, deployed as the API Worker
astro.config.mjs/...  →  deployed via `astro build` + `wrangler deploy`,
                          calling the API Worker's URL (PUBLIC_API_BASE_URL)
```

## Running it

1. Backend: `wrangler d1 create smb-template-db`, `wrangler kv namespace
   create smb-template-kv`, fill in the resulting ids in `wrangler.jsonc`,
   set `SQUARE_ACCESS_TOKEN`/`SQUARE_WEBHOOK_SECRET` via `wrangler secret
   put`, then `wrangler dev` (or `deploy`).
2. Frontend: set `PUBLIC_API_BASE_URL` (the backend Worker's URL),
   `PUBLIC_SQUARE_APPLICATION_ID`, `PUBLIC_SQUARE_LOCATION_ID` in a
   `.dev.vars`/`.env`, then `pnpm dev` (or `astro build && wrangler deploy`).
3. Seed at least one `products` row with a real Square sandbox catalog
   item's variation id as `catalogRef` before testing checkout — the
   checkout handler re-verifies prices against Square's live catalog, so a
   placeholder `catalogRef` will fail that check by design.

## What this intentionally doesn't cover

- A real admin UI for managing products/orders/inquiries — wire
  `@thebes/cadmea`'s generic `CollectionList`/`CollectionEdit` components
  the same way `app/workers/cadmea` does, if that's needed.
- Stripe wiring in the frontend island (only Square's client helper is
  shown) — swapping `src/server.ts`'s provider without also swapping
  `ShopIsland.tsx`'s `createSquareCardField` call to
  `createStripeCardField` would charge through Stripe's API while
  tokenizing through Square's SDK, which won't work. Both halves need to
  agree on the provider.
- Production-grade caching/performance — collections are rebuilt fresh
  per request (see `server.ts`'s own comment) for wiring clarity, not
  production throughput.
