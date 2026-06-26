# @thebes/cadmus-cloudflare-images

## 1.1.0

### Minor Changes

- Apply image hotspot/crop (#17): `render()` honors `hotspot` (→ `gravity` + `fit=cover`) and `crop` (→ `trim` source pixels when `sourceWidth`/`sourceHeight` given), across the single rendition and every srcset entry.

## 1.0.0

### Patch Changes

- Updated dependencies [1159873]
  - @thebes/cadmus@0.2.0
