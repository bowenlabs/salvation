# Extending Cadmus & Cadmea

Thebes has **two extension axes**. They sit at different layers and answer
different questions, and keeping them distinct is what keeps the framework/CMS
boundary (see CLAUDE.md) clean. This is the Payload model, mapped onto a
V8-native stack: adapters are Payload's `db-*`/`storage-*` packages; plugins are
Payload's `plugin-*` packages.

| | **Cadmus adapters** | **Cadmea plugins** |
|---|---|---|
| Layer | Framework (any Cloudflare app) | CMS (content + admin) |
| Shape | A swappable *implementation of an interface* Cadmus defines | A `(config) => config` transform |
| Knows about | Cloudflare bindings | Collections, fields, hooks |
| Naming | `@thebes/cadmus-*` | `@thebes/cadmea-plugin-*` |
| Reference | `@thebes/cadmus-cloudflare-images` | `@thebes/cadmea-plugin-seo` |

Community-maintained extensions on either axis live under `@cadmus-community/*`
(see CADMUS.md). First-party ones are published from this monorepo.

**Not a third axis:** the planned `@thebes/cadmus/astro` peer-integration
layer (#32, blocked by #30) is neither an adapter (it doesn't implement a
Cadmus-defined interface) nor a plugin (it doesn't transform CMS config).
It's core-shipped peer integration, the same category `@thebes/cadmus/hono`
is already in — a deep, officially recommended wrapper over existing
primitives for one specific framework, not an extension point.

---

## Axis 1 — Cadmus adapters

An **adapter** is an alternate implementation of an interface that
`@thebes/cadmus` already defines. Today the canonical interface is
`ImageService` (`@thebes/cadmus/storage`); the same pattern fits future
storage/email/db backends.

The rule that makes adapters swappable: **the app resolves the implementation in
exactly one place.** In Thebes that place is `app/core/lib/image-service.ts`'s
`createImageService()`. Every component, renderer, and block goes through it, so
switching backends is a one-line change and the database keeps storing original
R2 URLs either way.

```ts
// app/core/lib/image-service.ts — the single selection point
import { createCloudflareImageService } from "@thebes/cadmus-cloudflare-images";

export function createImageService(bucket: R2Bucket, mediaUrl: string) {
  return createCloudflareImageService({ bucket, mediaUrl }); // was: createR2ImageService(...)
}
```

Write an adapter by implementing the interface and exporting a factory. It takes
raw bindings, never `env`:

```ts
import type { ImageService } from "@thebes/cadmus/storage";

export function createMyImageService(opts): ImageService {
  return {
    async upload(file) { /* … */ return { url } },
    render({ url, width, height, alt }) { /* … */ return { src, srcset, sizes } },
  };
}
```

---

## Axis 2 — Cadmea plugins

A **plugin** is a synchronous `(config: CmsConfig) => CmsConfig` transform,
modeled on Payload's `plugins` array. `defineCmsConfig` runs plugins in order,
each fed the previous one's output, **before validation** — so a plugin's output
is held to the same rules as a hand-written config. The resolved config is the
single source of truth for schema codegen, admin metadata, and the Local API, so
an injected field automatically becomes a D1 column, an admin form field, and a
typed API field.

```ts
import { defineCmsConfig } from "@thebes/cadmus/cms";
import { seoPlugin } from "@thebes/cadmea-plugin-seo";

export const cmsConfig = defineCmsConfig({
  collections: [pagesCollection],
  plugins: [seoPlugin({ collections: ["pages"] })],
});
```

> **Wiring rule:** consumers must read the *resolved* collection (post-plugin),
> never the raw definition — otherwise injected fields and registered hooks are
> bypassed. See `app/cadmea.config.ts`, which exports `pagesCollection` as the
> resolved collection and feeds it to the admin routes and the Local API.

A plugin may inject fields, add whole collections, and register lifecycle
**hooks** (`beforeChange`/`afterChange`/`beforeRead`/`afterRead`/`beforeDelete`/
`afterDelete`), which `createLocalApi` enforces on every operation. `beforeChange`
runs before validation, so a hook can default a required field — that is exactly
how `@thebes/cadmea-plugin-seo` defaults `metaTitle` from `title`.

```ts
import type { CadmeaPlugin } from "@thebes/cadmus/cms";

export function myPlugin(): CadmeaPlugin {
  return (config) => ({
    ...config,
    collections: config.collections.map((c) => ({
      ...c,
      fields: { ...c.fields, /* injected fields */ },
      hooks: { ...c.hooks, beforeChange: [...(c.hooks?.beforeChange ?? []), myHook] },
    })),
  });
}
```

Treat the input config as immutable — return new objects, never mutate in place.

See `packages/cadmus/src/cms/README.md` for the full plugin + hook reference.

---

## Which axis do I want?

- Swapping *how* something is stored, served, or sent (images, email, db)? →
  **adapter** (`@thebes/cadmus-*`).
- Adding *content or admin behavior* (SEO, redirects, audit fields, a new
  collection)? → **plugin** (`@thebes/cadmea-plugin-*`).

If an extension needs both (e.g. a media plugin that also swaps the image
service), ship two packages — one per axis — rather than blurring the boundary.

---

## Not everything is an extension

Some shared code is neither axis — it's a plain **library** with no opinion
about CMS configs or Cloudflare interfaces. Ship it as a normal package and
don't force it onto an axis.

`@thebes/cadmea-design-system` is the worked example: a framework-agnostic,
zero-dependency design-token engine (`buildTokenStyle` + color/spacing/type/font
helpers) consumed by both Workers. It isn't a `(config) => config` transform and
it doesn't implement a Cadmus interface, so calling it a "plugin" or "adapter"
would be a category error. It's just a library.

Rule of thumb: if it doesn't take the CMS config and doesn't implement a Cadmus
interface, it's a library, not an extension.
