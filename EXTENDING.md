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

## Plugin-defined provider interfaces

A third pattern, distinct from both axes above: a **plugin may define its
own swappable interface for plugin-specific provider implementations**. This
is plugin-internal extensibility, not a new top-level axis — don't reach for
it unless a plugin genuinely needs multiple interchangeable backends for one
piece of its own functionality.

`@thebes/cadmea-plugin-ecommerce`'s `PaymentProvider` is the reference
example: it needs to support Square and Stripe interchangeably, but
`PaymentProvider` isn't a Cadmus adapter (Axis 1) — it isn't an interface
*Cadmus core* defines, and it never could be, since it's built from
commerce-domain concepts (normalized order/payment events, cart line items)
that have no business in framework-layer Cadmus. The Cadmus adapter
precedent (`ImageService`) is deliberately generic infrastructure, usable by
any Cloudflare app regardless of CMS; `PaymentProvider` fails that bar the
same way a hypothetical Cadmea-only access-control library would.

So the plugin defines the interface itself, and ships sibling packages
implementing it — `@thebes/cadmea-plugin-ecommerce-square` and
`@thebes/cadmea-plugin-ecommerce-stripe` — mirroring the adapter pattern's
swappability discipline (one interface, N implementations, resolved in one
place by whichever route/handler the consumer wires a provider into) without
actually being one:

`@thebes/cadmea-plugin-ecommerce` defines a **second** interface of exactly
this kind — `FulfillmentProvider` — for handing a paid order to a
fulfillment backend. `@thebes/cadmea-plugin-printful` implements it (Printful's
print-on-demand API, raw `fetch()` + `crypto.subtle`, no SDK), wired in via
the plugin's `createFulfillmentOrder` / `createFulfillmentWebhookHandler`. Two
provider interfaces under the same pattern, both defined by the commerce
plugin, neither a Cadmus adapter — the count of interfaces doesn't change the
category.

```ts
// defined by the plugin, not by @thebes/cadmus
export interface PaymentProvider {
  readonly name: "square" | "stripe";
  checkout(request: CheckoutRequest): Promise<CheckoutResult>;
  verifyWebhookSignature(args: { /* ... */ }): Promise<boolean>;
  // ...
}

// each provider package implements it
export function createSquarePaymentProvider(config): PaymentProvider { /* ... */ }
export function createStripePaymentProvider(config): PaymentProvider { /* ... */ }
```

**How to tell this apart from a real Cadmus adapter:** ask the same
question Axis 1's table implies — would a developer using a *different*
framework than Cadmea, with no CMS at all, benefit from this interface as
defined? If the interface only makes sense in terms of concepts the plugin
itself introduced (cart line items, normalized webhook events, CMS
collections it writes to), it's plugin-internal. If it's genuinely
Cloudflare-binding-level infrastructure with no CMS opinion, it's a Cadmus
adapter instead.

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

---

## Every shipped package, by axis

`@thebes/cadmus` and `@thebes/cadmea` themselves aren't extensions — see the
root [README.md](./README.md) for those. Everything else this monorepo
publishes:

**Axis 1 — Cadmus adapters**
- [`@thebes/cadmus-cloudflare-images`](./packages/cadmus-cloudflare-images/README.md) — `ImageService` via Cloudflare Images

**Axis 2 — Cadmea plugins**
- [`@thebes/cadmea-plugin-seo`](./packages/cadmea-plugin-seo/README.md) — meta/OG fields + tags
- [`@thebes/cadmea-plugin-redirects`](./packages/cadmea-plugin-redirects/README.md) — a `redirects` collection + lookup helper
- [`@thebes/cadmea-plugin-crm`](./packages/cadmea-plugin-crm/README.md) — `contacts`/`activities` collections + upsert hook
- [`@thebes/cadmea-plugin-ecommerce`](./packages/cadmea-plugin-ecommerce/README.md) — provider-agnostic commerce core

**Plugin-defined provider implementations** (see above — not Axis 1)

`PaymentProvider` (defined by `@thebes/cadmea-plugin-ecommerce`):
- [`@thebes/cadmea-plugin-ecommerce-square`](./packages/cadmea-plugin-ecommerce-square/README.md)
- [`@thebes/cadmea-plugin-ecommerce-stripe`](./packages/cadmea-plugin-ecommerce-stripe/README.md)

`FulfillmentProvider` (also defined by `@thebes/cadmea-plugin-ecommerce`):
- [`@thebes/cadmea-plugin-printful`](./packages/cadmea-plugin-printful/README.md) — Printful print-on-demand

**Libraries** (neither axis)
- [`@thebes/cadmea-design-system`](./packages/cadmea-design-system/README.md) — design-token engine
- [`@thebes/cadmea-access-helpers`](./packages/cadmea-access-helpers/README.md) — composable `access` predicates
- [`@thebes/cadmea-ecommerce-ui`](./packages/cadmea-ecommerce-ui/README.md) — storefront SolidJS components
- [`@thebes/cadmea-blocks`](./packages/cadmea-blocks/README.md) — theme-neutral Astro block components for the public site
