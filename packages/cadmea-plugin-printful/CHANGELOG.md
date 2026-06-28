# @thebes/cadmea-plugin-printful

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
