# @thebes/cadmea-ecommerce-ui

## 1.0.1

### Patch Changes

- 8494276: chore: widen the `@thebes/cadmus` peer range to `>=0.4.0 <1.0.0`

  Rebuilt against `@thebes/cadmus@0.5.0`. The peer range previously resolved to a
  `0.x` caret (`^0.4.x`), so any `cadmus` minor fell out of range and forced a
  major bump across the whole extension ecosystem. Widening it to span the full
  `0.x` line keeps these packages in range for future `cadmus` minors. Strict
  widening of the accepted range — no functional or API changes.

## 1.0.0

### Patch Changes

- a098759: Accessibility fixes for the storefront and admin UI components.

  - `CartDrawer` is now a proper modal dialog: `role="dialog"`/`aria-modal`,
    a focus trap with `Esc`-to-close and focus restoration on close, body
    scroll lock while open, and an `aria-live` region announcing cart
    contents as items change. Mirrors the existing PanelNav/SearchPalette
    focus-trap idiom.
  - `CollectionEdit` announces submit errors via `role="alert"` and colors
    the required-field marker (its accessible name is unchanged).

- Updated dependencies [1159873]
  - @thebes/cadmus@0.2.0
