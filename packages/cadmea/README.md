# @bowenlabs/cadmea

Generic SolidJS admin-UI components for `@bowenlabs/cadmus/cms` collections.

> **0.x — active development.** APIs will change. Not production-ready.
> Star [bowenlabs/project-thebes](https://github.com/bowenlabs/project-thebes) to follow along.

---

## What is this?

Cadmus's `cms` subpath (collection config, schema codegen, the Local API,
admin-introspection metadata) is the engine — framework-agnostic, no UI of
its own. This package is the other half: the actual SolidJS components
that render a generic admin UI from that metadata, the same way Payload
splits `payload` core from `@payloadcms/next`/`@payloadcms/ui`.

`app/workers/cadmea` (Thebes's reference CMS) consumes this package rather
than owning the components directly.

---

## Install

```bash
pnpm add @bowenlabs/cadmea @bowenlabs/cadmus solid-js
```

Shipped as Solid JSX source (the `exports` map points straight at
`src/index.ts`), not a pre-built bundle — Solid's JSX needs
`babel-preset-solid` to compile to its fine-grained-reactive output, which
plain esbuild/tsup doesn't do. Your own bundler needs `vite-plugin-solid`
(or the equivalent for your tooling) configured, the same as any other
Solid component you'd write directly in your app.

---

## Components

```typescript
import { CollectionList, CollectionEdit } from '@bowenlabs/cadmea'
```

**`CollectionList`** — generic table view. Renders one column per field
(excluding `id` and `richText` fields, which aren't supported as plain
table cells yet), with optional row-click navigation.

**`CollectionEdit`** — generic create/edit form. Renders one input per
field (excluding `id`), with `text`/`select`/`number` editable inputs and
`date` fields shown read-only. Fields without a supported renderer
(`richText`/`relationship`/`array`/`upload`/`checkbox`) are silently
skipped rather than crashing — contributions welcome.

Both take a `CollectionConfig` (from `@bowenlabs/cadmus/cms`) as their
`config` prop — see `app/workers/cadmea/src/routes/admin/pages/` in this
repo for real usage.

---

## What this isn't (yet)

No route-mounting helper — each consuming route file wires up its own
data fetching (`@tanstack/solid-query`) and navigation around these
components. Payload's `@payloadcms/next` provides a catch-all route
pattern for exactly this; Cadmea doesn't have an equivalent yet because
one collection (`pages`) hasn't justified designing that API. Worth
revisiting once more collections exist — see this repo's `DECISIONS.md`.

---

## Licensing

MIT. See [LICENSE](../../LICENSE) for full terms.

---

## Maintained by

[BowenLabs](https://bowenlabs.com)
