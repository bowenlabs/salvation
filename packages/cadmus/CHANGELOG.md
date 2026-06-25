# @thebes/cadmus

## 0.2.0

### Minor Changes

- 1159873: cms: add the Cadmea plugin axis and enforce collection hooks.

  - `CmsConfig` now accepts `plugins: CadmeaPlugin[]` — `(config) => config`
    transforms (Payload-shaped) that `defineCmsConfig` runs in order before
    validation. Plugins can inject fields, add collections, or register hooks.
  - The previously-reserved collection `hooks`
    (`beforeChange`/`afterChange`/`beforeRead`/`afterRead`/`beforeDelete`/
    `afterDelete`) are now enforced by `createLocalApi` on every operation.
    `beforeChange` runs before validation so a hook can default a required
    field. `access` remains reserved (not yet enforced).
