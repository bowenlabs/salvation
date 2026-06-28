# @thebes/cadmus-cloudflare-images

## 1.1.1

### Patch Changes

- 8494276: chore: widen the `@thebes/cadmus` peer range to `>=0.4.0 <1.0.0`

  Rebuilt against `@thebes/cadmus@0.5.0`. The peer range previously resolved to a
  `0.x` caret (`^0.4.x`), so any `cadmus` minor fell out of range and forced a
  major bump across the whole extension ecosystem. Widening it to span the full
  `0.x` line keeps these packages in range for future `cadmus` minors. Strict
  widening of the accepted range — no functional or API changes.

## 1.1.0

### Minor Changes

- Apply image hotspot/crop (#17): `render()` honors `hotspot` (→ `gravity` + `fit=cover`) and `crop` (→ `trim` source pixels when `sourceWidth`/`sourceHeight` given), across the single rendition and every srcset entry.

## 1.0.0

### Patch Changes

- Updated dependencies [1159873]
  - @thebes/cadmus@0.2.0
