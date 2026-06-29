# @thebes/cadmea-blocks

## 0.1.0

### Minor Changes

- 0000c2f: Initial release: theme-neutral Astro block components for Cadmea sites —
  RichText, Image, Hero, Divider, Banner, and Content. Each takes per-block props
  and styles via your theme's CSS classes/variables, so it stays decoupled from
  any one site's block union; wire them into `createBlockRegistry` and override
  any type with your own component.
