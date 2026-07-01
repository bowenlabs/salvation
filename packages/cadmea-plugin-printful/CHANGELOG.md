# @thebes/cadmea-plugin-printful

## 1.3.0

### Minor Changes

- 213ad1b: Migrate Printful order creation + confirmation to API v2 (#94).

  `createPrintfulProvider` now posts orders to `POST /v2/orders` (using the v2
  `items` shape) and confirms via `POST /v2/orders/{id}/confirm`, replacing the
  legacy v1 `/orders` + `/orders/{id}/confirmation` endpoints. Printful has been
  winding down v1, and the fulfillment order path — the most critical piece — was
  the last part still on it.

  Webhook parsing + signature verification are intentionally left on the v1
  webhook format for now: v2's new webhook system uses different event payloads
  and request signing whose exact header/algorithm isn't published in the rendered
  v2 docs, so reconciling it safely needs a live v2 webhook sample. This is inert
  until v2 webhooks are explicitly registered (see the note in provider.ts).

## 1.2.0

### Minor Changes

- 0000c2f: Add `computePrintTransform` — pure print geometry (border px from inches×DPI, the
  inner image box, source-pixel crop, and focal-point gravity) for building
  print-ready files from a cropped source image.

## 1.1.3

### Patch Changes

- dfd9d89: fix: republish with `dist/` (1.1.2 shipped without built output)

  `@thebes/cadmea-plugin-printful@1.1.2` was published without its `dist/`
  directory because the package was missing from the release build chain
  (`build:packages`), so its build never ran in CI and the tarball contained only
  `package.json`, `README.md`, and `LICENSE`. The build pipeline now builds every
  workspace package (`pnpm -r`), so this can't recur, and this release ships the
  compiled output. Use 1.1.3+; 1.1.2 is broken.

## 1.1.2

### Patch Changes

- 8494276: chore: widen the `@thebes/cadmus` peer range to `>=0.4.0 <1.0.0`

  Rebuilt against `@thebes/cadmus@0.5.0`. The peer range previously resolved to a
  `0.x` caret (`^0.4.x`), so any `cadmus` minor fell out of range and forced a
  major bump across the whole extension ecosystem. Widening it to span the full
  `0.x` line keeps these packages in range for future `cadmus` minors. Strict
  widening of the accepted range — no functional or API changes.

## 1.1.1

### Patch Changes

- Republish: 1.1.0 tarball was missing dist/ (published before build completed). No code changes vs 1.1.0.

## 1.1.0

### Minor Changes

- Add catalog + pricing surface (`pricing.ts`): `createPrintfulCatalogClient` (v2), `fetchVariantCost`, `computeRetailPrice` + `MarkupConfig`, `searchCatalogProducts`/`listCatalogVariants`. The studio-side complement to the fulfillment provider.

## 1.0.0

Initial release — the first `FulfillmentProvider` implementation for
`@thebes/cadmea-plugin-ecommerce@1.1.0`, backed by Printful's REST API.
