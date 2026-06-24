---
"@thebes/cadmea-ecommerce-ui": patch
"@thebes/cadmea": patch
---

Accessibility fixes for the storefront and admin UI components.

- `CartDrawer` is now a proper modal dialog: `role="dialog"`/`aria-modal`,
  a focus trap with `Esc`-to-close and focus restoration on close, body
  scroll lock while open, and an `aria-live` region announcing cart
  contents as items change. Mirrors the existing PanelNav/SearchPalette
  focus-trap idiom.
- `CollectionEdit` announces submit errors via `role="alert"` and colors
  the required-field marker (its accessible name is unchanged).
