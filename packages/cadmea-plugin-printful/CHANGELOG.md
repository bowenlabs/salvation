# @thebes/cadmea-plugin-printful

## 1.1.0

### Minor Changes

- Add catalog + pricing surface (`pricing.ts`): `createPrintfulCatalogClient` (v2), `fetchVariantCost`, `computeRetailPrice` + `MarkupConfig`, `searchCatalogProducts`/`listCatalogVariants`. The studio-side complement to the fulfillment provider.

## 1.0.0

Initial release — the first `FulfillmentProvider` implementation for
`@thebes/cadmea-plugin-ecommerce@1.1.0`, backed by Printful's REST API.
