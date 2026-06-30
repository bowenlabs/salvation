# Thebes — Claude Code Briefing

> Read this entire document before writing a single line of code.
> Every decision here was made deliberately.
> Do not substitute alternatives without flagging them explicitly.
>
> Also read CADMUS.md before touching anything in packages/cadmus/.
> Also read CADMEA.md before touching anything in packages/cadmea/,
> app/cadmea.config.ts, or app/workers/cadmea/.

---

## What is Thebes?

Thebes is a monorepo containing two open-source projects today, with a third
planned (not yet built — see "Future: Spartoi" below):

**Cadmus** — a V8-first, Cloudflare-native full-stack framework. Zero Node.js
assumptions. Cloudflare primitives (D1, KV, R2, Email Workers, Cache API) as
first-class citizens. Composable — each primitive is usable independently.
Designed to make building on Cloudflare so easy and secure that reaching for
a heavier stack feels like the wrong choice.

**Cadmea** — a free, open-source, V8-native headless CMS and admin platform.
Built on Cadmus. Operators define content as collections in `cadmea.config.ts`
(the equivalent of a `payload.config.ts`) and get a generated admin UI, a
typed query layer, and a REST API — on infrastructure they own forever.
Cadmea is Cadmus's reference implementation: it proves the framework works
in production and shows what building on Cadmus looks like end-to-end. It is
also a deliberate proof of concept for what a Payload-CMS-equivalent product
looks like with zero Node.js dependency, running natively in Cloudflare's V8
isolates.

**Maintained by:** BowenLabs (one person)
**License:** MIT
**Repo:** github.com/bowenlabs/project-thebes
**Framework package:** @thebes/cadmus

**Why the names (for context, not load-bearing):** in the myth, Cadmus
found the Ismenian spring guarded by a dragon, killed it, and from its
sown teeth built the fortified Cadmea — the citadel around which the
city of Thebes grew. Map that directly: V8 is the spring, Cadmus is the
framework that talks to it directly with no heavier runtime in the way,
Cadmea is the hardened CMS admin Cadmus built — the citadel itself, not
just a generic word for one — and Thebes is the monorepo that holds it
all, the whole city that grew up around the Cadmea. Cadmus is also
credited with bringing the alphabet to Greece — the resonance worth
keeping in mind is "communicator/protocol designer," not "monster-slayer."
See `README.md` for the full version.

**Future: Spartoi.** A standalone, render-agnostic SolidJS framework for
native (mobile) rendering — parallel to Cadmus, not a Cadmus rename and not
a Cadmea feature. Cadmea will eventually split into web (today's
`packages/cadmea`) and native targets sharing one logic layer; Spartoi is
the native rendering substrate for that split. Tracked in
[issue #31](https://github.com/bowenlabs/project-thebes/issues/31).
[Issue #30](https://github.com/bowenlabs/project-thebes/issues/30) (the
blocker) closed 2026-06-24 — Void was rejected, `vp pack` was adopted, so the
toolchain Spartoi's compiler/renderer tooling builds on is now settled.
**NativeScript + SolidJS is the current leaning for Spartoi's native
renderer target** — fits #31's render-agnostic architecture decision (one
component tree, compiled to DOM for web and to a native renderer), not a
replacement of Spartoi itself. Still Section 4+ scope, not started as code —
see CADMEA.md's "Future: the native split" section for why.

---

## Naming — do not change these

| Name | What it is |
|------|-----------|
| **Thebes** | The monorepo, and the single reference app at `app/` |
| **Cadmus** | The framework (`packages/cadmus/`) |
| **@thebes/cadmus** | The npm package |
| **Cadmea** | The CMS product (`app/workers/cadmea/`) |
| **Cadmea Panel** | The owner-facing admin UI at `/admin/*` |
| **Extensions** | Cadmea add-ons (Section 3+, was "thimbles") |
| **Spartoi** | Planned standalone native-rendering framework (parallel to Cadmus) — not started as code; leaning NativeScript+SolidJS for the native renderer target, see #31 |
| **citadel-tooling** | Private Go Orchestrator repo (provisioning, email, distribution) — separate repo, name unchanged by this rename |

---

## Monorepo structure

```
thebes/
├── packages/
│   ├── cadmus/                  ← @thebes/cadmus framework package
│   │   ├── src/
│   │   │   ├── auth/            ← Web Crypto token gen, HMAC, magic link
│   │   │   ├── cms/             ← collection/field config, schema codegen, Local API, admin meta
│   │   │   ├── db/              ← Drizzle + D1 helper
│   │   │   ├── storage/         ← R2 upload/serve, ImageService interface
│   │   │   ├── cache/           ← CF Cache API + explicit dev bypass
│   │   │   ├── email/           ← Email Workers send helper
│   │   │   ├── rate-limit/      ← KV-based rate limiter
│   │   │   ├── session/         ← KV session read/write/delete
│   │   │   ├── queues/          ← producer helper, consumer handler, DLQ pattern
│   │   │   ├── hono/            ← thin Hono wrappers over raw primitives
│   │   │   ├── errors.ts        ← CadmusError base class + typed subtypes
│   │   │   └── index.ts         ← re-exports all primitives
│   │   ├── dist/                ← vp pack (Vite+) output (ESM + CJS + .d.ts) — gitignored
│   │   ├── vite.config.ts       ← build config (`pack` block — see DECISIONS.md 2026-06-24)
│   │   ├── package.json         ← name: "@thebes/cadmus", exports map
│   │   └── README.md
│   │
│   └── cadmea/                  ← @thebes/cadmea — Cadmea's admin-UI package
│       ├── src/
│       │   ├── CollectionList.tsx  ← generic list view, driven by admin meta
│       │   ├── CollectionEdit.tsx  ← generic edit/create form
│       │   ├── index.ts
│       │   └── tanstack-start/  ← @thebes/cadmea/tanstack-start subpath —
│       │                          route-mounting helper (createCollectionListPage/
│       │                          CreatePage/EditPage), the equivalent of
│       │                          @payloadcms/next's catch-all route pattern
│       ├── vite.config.ts       ← vp pack (Vite+) `pack` array + @rolldown/
│       │                          plugin-babel + babel-preset-solid — real
│       │                          server/browser/worker/node/deno build
│       │                          (see DECISIONS.md 2026-06-24 entry),
│       │                          not source-only like the package started as
│       ├── package.json         ← name: "@thebes/cadmea"; exports map is
│       │                          now hand-maintained (vp pack has no
│       │                          package.json-writing preset the way
│       │                          tsup-preset-solid did)
│       └── README.md
│   │
│   ├── cadmea-design-system/    ← @thebes/cadmea-design-system — the
│   │                              design-token engine (standalone library,
│   │                              not a plugin/adapter): buildTokenStyle +
│   │                              color/spacing/type/font helpers, shared by
│   │                              both Workers. Extracted from app/core/lib.
│   │
│   ├── cadmea-access-helpers/   ← @thebes/cadmea-access-helpers — composable
│   │                              access-control predicates (requireRole,
│   │                              checkRole, isAdmin, publicAccess,
│   │                              authenticatedOnly) for collection `access`
│   │                              blocks. A library (Section 3), not a
│   │                              plugin/adapter — see EXTENDING.md.
│   │
│   ├── cadmea-plugin-seo/       ← @thebes/cadmea-plugin-seo — SEO plugin
│   │                              (Cadmea axis: plugin(config) => config;
│   │                              injects meta/OG fields + a metaTitle hook,
│   │                              ships renderSeoTags() for the public site)
│   │
│   ├── cadmea-plugin-redirects/ ← @thebes/cadmea-plugin-redirects — adds a
│   │                              `redirects` collection + lookupRedirect()
│   │                              helper for the public site (Section 3)
│   │
│   ├── cadmea-plugin-crm/       ← @thebes/cadmea-plugin-crm — adds
│   │                              `contacts`/`activities` collections +
│   │                              createContactUpsertHook(), wireable onto
│   │                              any consumer-defined lead-capture
│   │                              collection (Section 3)
│   │
│   ├── cadmea-plugin-ecommerce/ ← @thebes/cadmea-plugin-ecommerce — the
│   │                              provider-agnostic ecommerce core (Section
│   │                              3): products/orders/customers/payments/
│   │                              webhook_events collections, the
│   │                              plugin-defined PaymentProvider interface
│   │                              (see EXTENDING.md), createCheckoutHandler/
│   │                              createWebhookHandler Hono handlers
│   │
│   ├── cadmea-plugin-ecommerce-square/ ← @thebes/cadmea-plugin-ecommerce-square
│   │                              — Square's PaymentProvider implementation,
│   │                              raw fetch() + crypto.subtle, no Square
│   │                              Node SDK; `/client` subpath ships
│   │                              createSquareCardField (Web Payments SDK
│   │                              tokenization helper)
│   │
│   ├── cadmea-plugin-ecommerce-stripe/ ← @thebes/cadmea-plugin-ecommerce-stripe
│   │                              — Stripe's PaymentProvider implementation,
│   │                              same raw-fetch()-only constraint; `/client`
│   │                              subpath ships createStripeCardField
│   │
│   ├── cadmea-plugin-printful/  ← @thebes/cadmea-plugin-printful — Printful's
│   │                              FulfillmentProvider implementation for
│   │                              @thebes/cadmea-plugin-ecommerce (a second
│   │                              plugin-defined provider interface, distinct
│   │                              from PaymentProvider — see EXTENDING.md), raw
│   │                              fetch() + crypto.subtle, no Printful Node SDK
│   │
│   ├── cadmea-ecommerce-ui/     ← @thebes/cadmea-ecommerce-ui — storefront
│   │                              SolidJS components (ProductDetail,
│   │                              CartProvider/CartDrawer, CheckoutForm) for
│   │                              @thebes/cadmea-plugin-ecommerce. A library,
│   │                              SolidJS by extension-author discretion
│   │                              (see DECISIONS.md's "Component framework
│   │                              tiering" entry) — not the public site's
│   │                              own Alpine.js sprinkle-on tier
│   │
│   ├── cadmea-blocks/           ← @thebes/cadmea-blocks — theme-neutral Astro
│   │                              block components (richText/image/hero/divider/
│   │                              banner/content) for rendering CMS block content
│   │                              on the public site. A library (neither axis);
│   │                              peers on astro + @thebes/cadmus (renderRichText/
│   │                              parseImageRef/ImageService). Supersedes the
│   │                              inline <BlockRenderer> the example template
│   │                              used to define
│   │
│   └── cadmus-cloudflare-images/ ← @thebes/cadmus-cloudflare-images — image
│                                  adapter (Cadmus axis: an alternate
│                                  ImageService returning /cdn-cgi/image URLs)
│
├── app/                          ← Thebes — the one reference app
│   ├── workers/
│   │   ├── site/                ← Worker 1: Astro public site — docs + marketing
│   │   │                          for Cadmus and Cadmea, and the example deployment
│   │   └── cadmea/               ← Worker 2: TanStack Start CMS/admin (SolidJS),
│   │                               depends on @thebes/cadmea for admin-UI components
│   ├── core/                    ← app-specific shared code
│   │   ├── db/
│   │   │   ├── schema.ts        ← generated from cadmea.config.ts collections
│   │   │   └── migrations/
│   │   └── lib/                 ← app utilities (CMS query helpers, design system, etc.)
│   ├── custom/                  ← operator territory — never overwritten by updates
│   │   ├── components/
│   │   ├── extensions/          ← operator custom extensions (Section 3+)
│   │   ├── themes/
│   │   └── seed/
│   ├── cadmea.config.ts         ← root collections config — the Payload-config equivalent
│   ├── DECISIONS.md             ← operator architectural decisions
│   └── seed.ts                  ← first-deploy seed script
│
├── examples/                    ← standalone Cadmus usage examples
│   ├── minimal/                 ← smallest possible working Cadmus app (hello world)
│   └── cadmea-smb-template/     ← Section 3 worked example: crmPlugin +
│                                  redirectsPlugin + ecommercePlugin combined
│                                  on one CmsConfig, a Square-wired backend
│                                  Worker, and a SolidJS-island storefront
│                                  frontend (@thebes/cadmea-ecommerce-ui)
│
├── biome.json                   ← covers all packages + app
├── pnpm-workspace.yaml          ← packages/*, app/workers/*, examples/*
└── package.json                 ← root scripts

```

---

## Two audiences, two layers

**Cadmus is for developers.**
They import `@thebes/cadmus` and get V8-native primitives that work on
Cloudflare without adapter layers, Node shims, or configuration overhead.
Each primitive is independently usable — you can use just `cadmus/auth`
without pulling in `cadmus/db`.

**Cadmea is for operators.**
They fork the repo, define their content model as collections in
`cadmea.config.ts` (the root collections config — Cadmea's equivalent of
a `payload.config.ts`), and deploy. They never touch `core/` or
`packages/cadmus/`. The CMS admin UI and public site are fully generated from
that config — no coding required after the initial deploy.

Code in `packages/cadmus/` must not contain anything Cadmea-specific.
Code in `app/core/` is Cadmea-specific and imports from `@thebes/cadmus`.
Never let this boundary blur.

---

## Extension axes (Section 2+)

Features break out along **two axes** — keep them distinct, it's the same
framework/CMS boundary as above. Full guide: **`EXTENDING.md`**.

- **Cadmus adapters** (`@thebes/cadmus-*`) — a swappable *implementation* of
  an interface Cadmus defines (e.g. `ImageService`). Framework-level. The app
  resolves the active implementation in one place (`app/core/lib/image-service.ts`'s
  `createImageService`) so swapping is a one-liner. Reference:
  `@thebes/cadmus-cloudflare-images`.
- **Cadmea plugins** (`@thebes/cadmea-plugin-*`) — a synchronous
  `(config) => config` transform (Payload-shaped) run by `defineCmsConfig`
  before validation. Injects fields/collections/hooks. Reference:
  `@thebes/cadmea-plugin-seo`. **Consumers must read the resolved config
  (post-plugin), never the raw definition** — see `app/cadmea.config.ts`.
  Section 3 added three more: `@thebes/cadmea-plugin-redirects`,
  `@thebes/cadmea-plugin-crm` (its `createContactUpsertHook` is wireable
  onto any consumer-defined lead-capture collection, not hardcoded to one),
  and `@thebes/cadmea-plugin-ecommerce` (provider-agnostic — see below).

Collection `hooks` and `access` are both enforced by `createLocalApi` — a
rejected `access` check throws `CadmusAccessDeniedError`. The public REST API
(`mountCmsRoutes`, `@thebes/cadmus/hono`) is mounted at `/api/*` in
`app/workers/cadmea/app/server.ts` via `app/core/lib/cms-api.ts`'s
`mountPublicCmsApi` — every collection's own `access` rules are what gate
each request; see `packages/cadmus/src/cms/README.md` for the full Local
API/access/REST API reference. `@thebes/cadmus/hono` also ships
`createCmsApiClient`, the client-side counterpart to `mountCmsRoutes` for
callers outside the Worker process running the CMS (e.g. a separate
public-site Worker). Community extensions on either axis live under
`@cadmus-community/*`.

**A third pattern, distinct from both axes — plugin-defined provider
interfaces.** `@thebes/cadmea-plugin-ecommerce`'s `PaymentProvider` is
defined by the plugin itself, not by Cadmus core, because it needs
commerce-domain concepts (cart line items, normalized webhook events) that
have no business in framework-layer Cadmus. `@thebes/cadmea-plugin-ecommerce-square`
and `@thebes/cadmea-plugin-ecommerce-stripe` implement it via raw `fetch()`
+ `crypto.subtle` only — no Square/Stripe Node SDK, ever. The same plugin now
defines a second such interface, `FulfillmentProvider`, implemented by
`@thebes/cadmea-plugin-printful` under the identical raw-fetch()-only
constraint — two provider interfaces of the same pattern, not a new axis. See
EXTENDING.md's "Plugin-defined provider interfaces" section before reaching
for this pattern elsewhere; it's not a license to invent a third top-level axis.

Shared code that is **neither** axis (no CMS config, no Cadmus interface) ships
as a plain library, not an extension — e.g. `@thebes/cadmea-design-system`,
the framework-agnostic design-token engine extracted from `app/core/lib`,
Section 3's `@thebes/cadmea-access-helpers` and `@thebes/cadmea-ecommerce-ui`,
and `@thebes/cadmea-blocks` (theme-neutral Astro components for rendering CMS
block content on the public site).
Don't force a library onto an axis.

---

## Stack — do not deviate without flagging

| Layer | Technology |
|-------|-----------|
| Framework | **@thebes/cadmus** — V8-first CF primitives |
| Framework build | **Vite+'s `vp pack`** (Rolldown-based, wraps tsdown) → `dist/` (ESM + CJS + `.d.ts`), configured via a `pack` block in `vite.config.ts` — see DECISIONS.md 2026-06-24 entry |
| Public site SSR | **Astro** with `@astrojs/cloudflare` adapter — Worker 1. Astro is Cadmus's officially recommended frontend; the peer-integration layer (`@thebes/cadmus/astro`, #32) shipped 2026-06-24 — see CADMUS.md design philosophy point 4 |
| CMS engine | **@thebes/cadmus/cms** — collections, fields, schema codegen, Local API, admin-UI introspection metadata |
| CMS admin UI components | **@thebes/cadmea** — generic SolidJS list/edit views, driven by the engine's admin metadata; built with **Vite+'s `vp pack`** + `@rolldown/plugin-babel` + `babel-preset-solid` (see DECISIONS.md 2026-06-24 entry) |
| CMS route-mounting helper | **@thebes/cadmea/tanstack-start** — factory functions wiring the UI components to `@tanstack/solid-query`, the equivalent of `@payloadcms/next`'s catch-all route pattern |
| CMS admin | **TanStack Start** (Solid target) — Worker 2, VMFE architecture |
| CMS data fetching | **@tanstack/solid-query** — server state, API communication |
| CMS routing | **@tanstack/solid-router** — built into TanStack Start |
| UI framework | **SolidJS** — fine-grained reactivity, no VDOM, minimal payload for V8 isolates |
| Public API spine | **Hono** — form submission, auth, media upload endpoints |
| Hono integration | **@thebes/cadmus/hono** — thin wrappers over raw primitives |
| Deployment | **Cloudflare Workers** via `wrangler deploy` (two Workers) |
| Architecture | **Vertical Microfrontends (VMFE)** — two independent Workers |
| Database | **Cloudflare D1** (SQLite) via **Drizzle ORM** — shared by both Workers |
| Migrations | **drizzle-kit** — applied once, affects both Workers |
| File storage | **Cloudflare R2** — shared by both Workers |
| Cache invalidation | **Cloudflare Cache API** (`caches.default`) |
| Sessions / rate limiting | **Cloudflare KV** — shared by both Workers |
| Email | **Cloudflare Email Workers** (`send_email` binding) |
| Queues | **Cloudflare Queues** via `@thebes/cadmus/queues` |
| Analytics | **Cloudflare Web Analytics** |
| Fonts | **Cloudflare Fonts** — link to `fonts.googleapis.com`; CF intercepts at edge |
| Icons | **@phosphor-icons/web** — everywhere, no other icon library. No official Solid Phosphor package exists; the framework-agnostic web-component/CSS build is used instead of an unofficial community port |
| UI components | **DaisyUI v5** + **Tailwind v4** — pure CSS, no framework binding required |
| Charts | **ApexCharts** (MIT), styled to match Flowbite's chart examples — CMS admin only. "Flowbite Charts" isn't a separate npm package; Flowbite's chart docs are just ApexCharts markup with Tailwind classes, and pulling in the full `flowbite` JS runtime is unnecessary (and risks conflicting with SolidJS's DOM management — see DECISIONS.md's 2026-06-21 entry) |
| Rich text (CMS) | **TipTap** (`@tiptap/core`, framework-agnostic) — JSON stored natively, no transform layer. No official Solid wrapper; integrate the vanilla core API directly or via the unofficial `solid-tiptap` bindings — decide when Section 2+ builds the editor |
| Linting / formatting | **Biome** — replaces ESLint + Prettier |
| Security scanning | **Snyk** (CI) |
| Testing | **Vitest** + **@cloudflare/vitest-pool-workers** — real Workers runtime |
| TanStack DB | **Section 2+** — reactive client data layer for CMS admin (beta) |
| Payments / ecommerce | **@thebes/cadmea-plugin-ecommerce** (Section 3) — provider-agnostic core; **@thebes/cadmea-plugin-ecommerce-square** / **-stripe** implement its plugin-defined `PaymentProvider` interface via raw `fetch()` + `crypto.subtle` only. No Square/Stripe Node SDK, ever — see EXTENDING.md |
| Storefront UI components | **@thebes/cadmea-ecommerce-ui** (Section 3) — SolidJS, by extension-author discretion (DECISIONS.md's "Component framework tiering" entry), not the public site's own Alpine.js sprinkle-on tier |

---

## TanStack DB (Section 2+)

TanStack DB is not a replacement for TanStack Query — it extends it with a
reactive client-side data layer. TanStack Query handles server communication;
TanStack DB adds cross-collection queries, live queries, and optimistic
mutations without manual cache wiring.

**Why it matters for Cadmea:**
- Mark submission archived → UI updates instantly without waiting for server
- Block canvas saves → related panels update reactively
- Contacts relate to activities relate to submissions — queryable locally

**Scoping decision:**
- **Section 1:** TanStack Query alone. Stable, correct for single-owner
  small datasets. No relational cross-collection needs yet.
- **Section 2+:** Add TanStack DB when team collaboration, real-time inbox,
  and complex relational CMS queries arrive. It layers on top of existing
  TanStack Query code — migration is incremental.

Do not add TanStack DB in Section 1. Flag any PR that introduces it early.

---

## Authentication

Cadmus provides auth primitives. Cadmea implements a magic link flow using
those primitives. No passwords. No third-party auth dependencies in Section 1.

```
Flow:   Owner enters email → cadmus/auth generates token (Web Crypto API)
        → hashed token stored in KV (15 min TTL)
        → raw token sent via CF Email Workers
        → owner clicks link → token hashed + validated against KV
        → KV entry deleted (single use)
        → session created → signed cookie set → session stored in KV

Session: Signed cookie (HttpOnly, Secure, SameSite=Lax) + KV entry with TTL
Auth guard: TanStack Start middleware.ts — HMAC verify + KV session lookup

Dev:    ADMIN_EMAIL in .dev.vars bypasses email send.
        Raw token logged to console. Navigate directly to /admin/dashboard.
```

**No passwords exist anywhere in this codebase.**

**KV eventual consistency:** KV is eventually consistent. The verify handler
retries token lookup up to 2 times with 100ms delay before returning invalid,
to account for edge propagation lag immediately after token creation.

**Cookie domain:** Session cookies must be tested on a custom domain before
shipping. Cookie scoping on `*.workers.dev` during development differs from
production custom domain behavior — do not assume dev auth matches prod.

Future team access and customer portal auth are Section 2+ concerns.
Do not stub auth abstractions for future use now.

---

## Accessing Cloudflare bindings

Bindings (D1, KV, R2, Email) are accessed differently per layer.
Never pass `env` through props. Never access bindings at module level.

**In Astro pages (Worker 1 — public site):**
```typescript
---
// app/workers/site/src/pages/[slug].astro
import { env } from 'cloudflare:workers'
const database = db(env.DB)
const settings = await database.select().from(siteSettings)
  .where(eq(siteSettings.id, 1)).get()
---
```

**In TanStack Start server functions (Worker 2 — Cadmea):**
```typescript
// app/workers/cadmea/src/server-functions/pages.ts
import { createServerFn } from '@tanstack/solid-start'
import { db } from '@thebes/cadmus/db'

export const getPages = createServerFn({ method: 'GET' })
  .handler(async () => {
    const { env } = await import('cloudflare:workers')
    return db(env.DB).select().from(pages).all()
    // return type flows from Drizzle schema automatically — no manual typing
  })
```

**In Cadmea components (@tanstack/solid-query):**
```typescript
// app/workers/cadmea/src/routes/admin/pages/index.tsx
import { createQuery } from '@tanstack/solid-query'
import { getPages } from '../../../server-functions/pages'

function PagesPage() {
  const pages = createQuery(() => ({
    queryKey: ['pages'],
    queryFn: () => getPages(),
    // pages is typed from Drizzle schema — zero manual type maintenance
  }))
  // pages.data is the reactive accessor — call it as pages.data, not destructured
}
```

**In Hono public API routes (Worker 2 — Cadmea, custom server entrypoint):**
```typescript
// app/workers/cadmea/app/server.ts
api.post('/api/form/:slug', async (c) => {
  const database = db(c.env.DB)
  const kv = c.env.KV
})
```

Never import `cloudflare:workers` in client-side component code.
Never pass `env` through props or component trees.
All binding access happens in server functions or Hono route handlers.

**Runtime constraint:** Both Workers run in the Cloudflare V8 isolate.
No Node.js APIs anywhere. All crypto via `crypto.subtle` — never
`import crypto from 'crypto'`. This is a Cadmus design principle, not
just a Cadmea constraint.

---

## Data layer

Drizzle + D1 underneath, but Cadmea no longer hand-writes Drizzle tables.
Content is modeled as **collections** in `cadmea.config.ts`, the
equivalent of a `payload.config.ts`. `@thebes/cadmus/cms` turns that
config into a generated Drizzle schema, a typed Local API (`find` /
`findByID` / `create` / `update` / `delete`), and the introspection metadata
the CMS admin UI uses to render generic list/edit views. This supersedes the
2026-06-17 "no CMS" decision in DECISIONS.md — see that file's superseding
entry for why: the earlier decision was against running Payload itself (on
Node, admin disabled); this is a from-scratch V8-native primitive that
reaches the same outcome without that dependency.

Underneath `cadmus/cms`, raw D1 access is still via `@thebes/cadmus/db`.

```typescript
// packages/cadmus/src/db/index.ts
import { drizzle } from 'drizzle-orm/d1'

export function db<TSchema extends Record<string, unknown>>(
  d1: D1Database,
  schema: TSchema
) {
  return drizzle(d1, { schema })
}
```

```typescript
// app/core/lib/db.ts
import { db } from '@thebes/cadmus/db'
import * as schema from '../db/schema'

export const createDb = (d1: D1Database) => db(d1, schema)
```

All reads and writes go through Drizzle, generated from collection config.
No hand-maintained abstraction layer on top. Both Workers import from
`app/core/` — same generated schema, same Local API, same types.

Schema changes:
1. Edit the `collections` array in `app/cadmea.config.ts`
2. `pnpm db:generate` — generates `core/db/schema.generated.ts` and a migration in `app/core/db/migrations/`
3. `pnpm db:migrate` — applies to local D1
4. `pnpm db:migrate:prod` — applies to production D1

`app/core/db/schema.generated.ts` is generated output — never
hand-edited, same convention as a drizzle-kit migration file.

The `pages` collection is the first real collection, carried over from
Phase 0's hand-written `pages` table — it now proves the generated-schema
path against data that's already live in production.

---

## Example collections — `examples/cadmea-smb-template/` (not Cadmea core)

> Everything in this section used to be Cadmea's own schema. As of the CMS
> repositioning, none of it is Cadmea-specific anymore — it's a worked
> example of a small-business site built *using* Cadmea, kept as the spec
> for `examples/cadmea-smb-template/`. Treat the shapes below as a content
> model an operator could define, not as anything Cadmea ships by default.
> Cadmea core ships no collections except `pages` (Section 1) as a worked
> example.

```
users, sessions, magic_link_tokens, site_settings
  — infra/identity, not content collections; stay in Cadmea core as-is.

site_settings (singleton — id = 1 always)
├── identity:         siteName, tagline, logoUrl, faviconUrl
├── appearance:       brandColor, secondaryColor, tertiaryColor,
│                     fontPairing, homepageLayout, darkMode, theme,
│                     spacingPreset, typeTokens (JSON)
├── structuralColors: navBackground, navTextColor,
│                     footerBackground, footerTextColor,
│                     pageBackground, surfaceBackground
├── contact:          email, phone, address, socialLinks (JSON)
├── nav:              navLinks (JSON)
├── seo:              metaDescription, defaultOgImageUrl, disableIndexing
├── domain:           primaryDomain,
│                     domainProvider: 'cloudflare' | 'external' | 'unknown' | null,
│                     nameserverDelegated (boolean, default false),
│                     domainRegisteredViaCitadel (boolean, default false),
│                     cfAccountId (text, nullable),
│                     cfApiTokenScoped (boolean, default false)
└── features:         JSON feature toggle map (all false by default)

pages collection (Cadmea core, Section 1 — the one example collection Cadmea ships)
├── id, title, slug (unique), blocks (JSON — TipTap JSON array)
├── status: 'draft' | 'published'
└── createdAt, updatedAt, publishedAt

forms, form_submissions, contacts, activities — example-template collections
  (SMB form builder + lightweight CRM), spec lives in
  examples/cadmea-smb-template/, not in app/core/.
```

---

## Block types (example-template content, not Cadmea core)

Page content is stored as a JSON array of blocks — TipTap JSON is the
native storage format, no transform layer. This block-type union is the
template's example field shape for a `richText`/`array` collection field,
not a Cadmea-core concept:

```typescript
type Block =
  | { type: 'richText';  content: JSONContent }
  | { type: 'image';     url: string; alt: string; caption?: string }
  | { type: 'hero';      heading: string; subtext?: string; ctaLabel?: string; ctaHref?: string }
  | { type: 'form';      formId: string }
  | { type: 'columns';   columns: Block[][] }
  | { type: 'divider' }
```

The generic block-canvas admin field renders these the same way it would
render any `array`/`richText` field on any collection. The public site
renders them by mapping each block type to a component from
`@thebes/cadmea-blocks` (theme-neutral Astro components — `RichTextBlock`,
`ImageBlock`, `HeroBlock`, `DividerBlock`, `BannerBlock`, `ContentBlock`),
wired through a block registry that the example template can override
per-type. (This replaces the inline `<BlockRenderer>` the template used to
hand-define.)

---

## Form builder (example-template content, not Cadmea core)

This is the SMB template's worked example of a `forms` collection with a
`fields` JSON array — useful as a reference for building array/group fields
with `cadmus/cms`, not something Cadmea ships by default.

```typescript
type FormField =
  | { type: 'text';     name: string; label: string; required: boolean; placeholder?: string }
  | { type: 'email';    name: string; label: string; required: boolean }
  | { type: 'phone';    name: string; label: string; required: boolean }
  | { type: 'textarea'; name: string; label: string; required: boolean; placeholder?: string }
  | { type: 'select';   name: string; label: string; required: boolean; options: string[] }
  | { type: 'checkbox'; name: string; label: string }
```

**Email field detection:** Contact upsert on submission identifies the
email field by `type: 'email'` — not by field name. The form builder UI
must enforce this — `type: 'email'` is a distinct option, not a text variant.

On submission:
1. Validate fields server-side
2. Check rate limit (KV, 10/hour per IP)
3. Check honeypot (`name="website"`, hidden, discard silently if filled)
4. Insert into `form_submissions`
5. Upsert contact if `type: 'email'` field present
6. Log activity (`type: 'form_submission'`)
7. Send notification to owner via CF Email Workers (best-effort)

---

## Media (R2)

Files uploaded to R2, served via public R2 bucket bound to a subdomain
(e.g. `media.yourdomain.com`). Configured at deploy time.

Image URLs stored in the database are always the original R2 URL —
fully qualified, never relative, never transformation URLs.

No server-side image resizing in Section 1. Files served as uploaded.
CMS warns if an uploaded image exceeds 5MB.

All images on the public site use:
- `loading="lazy"` and `decoding="async"`
- `srcset` and `sizes` where dimensions are known
- Explicit `width` and `height` to prevent layout shift

Cloudflare Images is available as a paid extension (Section 3+).

---

## Image service interface

Defined in `@thebes/cadmus/storage`. Implemented in
`app/core/lib/image-service.ts`. Never construct image URLs inline.

```typescript
// packages/cadmus/src/storage/index.ts
export interface ImageService {
  upload: (file: File, env: Env) => Promise<{ url: string }>
  render: (image: {
    url: string; width?: number; height?: number; alt: string
  }) => { src: string; srcset?: string; sizes?: string }
}
```

The active image service is resolved once and imported everywhere.
A Cloudflare Images extension replaces the implementation without
touching any component, renderer, or block data.

**Rules:**
- Never call `env.R2.put()` directly in components — always via the service
- Never construct `cdn-cgi/image/...` URLs inline — always via `render()`
- The database always stores the original R2 URL, never a derived URL

---

## Notifications

CF Email Workers `send_email` binding (binding name: `EMAIL`).
Wrapped by `@thebes/cadmus/email`.
From address must be from a domain with CF Email Routing active.

In Section 1, operators configure CF Email Routing manually.
Setup instructions in the README (SPF, DKIM, DMARC).

---

## Security

Security headers come from `createSecurityHeaders(options)`
(`@thebes/cadmus/hono`, since cadmus 0.6.0) — a configurable Hono middleware
that centralizes these and applies them to all responses:
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN` — **never DENY** (preview iframes require SAMEORIGIN)
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- CSP: allowlist Cloudflare Fonts, Cloudflare Analytics, `'self'`

Framing is same-origin by default; a handler can opt a single response into
different `frame-ancestors` by setting the `FRAME_ANCESTORS_HEADER`
(`x-cadmus-frame-ancestors`) header, which the middleware consumes and strips.

Rate limiting via `@thebes/cadmus/rate-limit` (KV-based).
Honeypot on all public forms (`name="website"`, hidden).

---

## Environment variables

Never in code. Never in version control. In `.dev.vars` for local dev,
Cloudflare Workers secrets for production.

```
# Required — each Worker's .dev.vars for local dev,
# Cloudflare Workers secrets for production
SESSION_SECRET=        ← session signing secret (openssl rand -hex 32)
SERVER_URL=            ← full public site URL, no trailing slash
ADMIN_EMAIL=           ← owner email for CMS account + notifications
MEDIA_URL=             ← public R2 bucket base URL, no trailing slash

# Optional
THEBES_SERVICE_KEY=    ← shared secret for internal service calls
THEBES_SITE_ID=        ← issued by citadel-tooling, enables managed features
CF_ANALYTICS_TOKEN=    ← Cloudflare Web Analytics token
WEBHOOK_URL=           ← outbound webhook endpoint (issue #27); unset = no webhook hook attached
WEBHOOK_SECRET=        ← HMAC-SHA256 signs the X-Cadmus-Signature header when set
```

---

## Wrangler bindings

Both Workers have their own `wrangler.jsonc` with **identical binding IDs**.
Same D1 `database_id`, same KV `id`, same R2 `bucket_name`.

```jsonc
// app/workers/site/wrangler.jsonc
// app/workers/cadmea/wrangler.jsonc
// (same binding IDs in both — only "name" differs)
{
  "d1_databases": [{ "binding": "DB", "database_name": "thebes-db", "database_id": "..." }],
  "kv_namespaces": [{ "binding": "KV", "id": "..." }],
  "r2_buckets": [{ "binding": "R2", "bucket_name": "thebes-media" }],
  "send_email": [{ "name": "EMAIL" }]
}
```

---

## Dev commands

```bash
# From repo root
pnpm setup            # writes both Workers' .dev.vars for local dev — see below
pnpm dev:site         # wrangler dev in app/workers/site/ — :3000
pnpm dev:cadmea        # wrangler dev in app/workers/cadmea/ — :3001
pnpm dev              # both Workers via concurrently

pnpm build:cadmus     # vp pack (Vite+) → packages/cadmus/dist/
pnpm build:site       # astro build
pnpm build:cadmea     # vite build
pnpm build            # cadmus → site → cadmea (in order)

pnpm deploy:site      # wrangler deploy (site)
pnpm deploy:cadmea    # wrangler deploy (cadmea)
pnpm deploy           # both (site first)

pnpm db:generate      # drizzle-kit generate from cadmea schema
pnpm db:migrate       # apply to local D1
pnpm db:migrate:prod  # apply to production D1
pnpm db:studio        # Drizzle Studio

pnpm seed             # seed.ts against local D1
pnpm lint             # biome check . (all packages + app)
pnpm format           # biome format --write .
pnpm test             # all tests (cadmus + cadmea)
pnpm test:cadmus      # Vitest + @cloudflare/vitest-pool-workers on packages/cadmus/
pnpm test:int         # Cadmea integration tests
pnpm test:e2e         # Playwright + axe
```

`pnpm setup` is contributor-facing local-dev convenience only — it writes
`SESSION_SECRET`/`ADMIN_EMAIL`/`MEDIA_URL`/`CADMEA_URL`/`SERVER_URL` into
both Workers' `.dev.vars` so `wrangler dev`'s emulated D1/KV/R2
(`--persist-to`) work without a real Cloudflare account. It does **not**
create real D1/KV/R2 resources, configure a custom domain, or do anything
else an operator deploying their own site needs — this repo isn't that
operator's fork target (see README.md's "bigger picture" section; that's
the separate `thebes-web` repo). Idempotent and non-destructive:
skips any `.dev.vars` file that already exists rather than overwriting it.

---

## Five questions before any architectural decision

**For Cadmus primitives:**
1. Does this require a specific framework — breaking framework-agnostic?
2. Does this import from another Cadmus primitive — breaking zero cross-dependency?
3. Does this require Node.js APIs — breaking V8-first?
4. Can this be clearly documented in one page — if not, the design is wrong?
5. Would a developer using a different framework than Cadmea benefit from this?

**For Cadmea features:**
1. Does this put data in a service the operator doesn't control?
2. Does this require a new account or subscription for the operator?
3. Does this break the free-forever promise for core features?
4. Does this deviate from the Cloudflare-native stack?
5. Does this compromise WCAG 2.1 AA accessibility?

If yes to any: flag it before proceeding.

---

## Key principles

- **V8-first:** No Node.js APIs anywhere. Design for the isolate, not around it.
- **Cloudflare-native:** D1, KV, R2, Email Workers, Queues are first-class — not adapters.
- **Independent primitives:** Each Cadmus primitive usable without the others. Zero cross-primitive dependencies. Always.
- **Raw bindings:** Primitives accept `D1Database`, `KVNamespace` etc. directly — not `Env` or Hono `Context`. Explicit is better than magic.
- **Thrown errors:** `CadmusError` and typed subclasses. Never raw `Error`. Never Result types.
- **Hono is a peer, not a dependency:** `@thebes/cadmus/hono` wraps raw primitives — it never reimplements them.
- **`vp pack` (Vite+) builds dist/:** The exports map points at `dist/`. TypeScript source is for development only. CI validates both. Packaging config lives in each package's `vite.config.ts` `pack` block, not a standalone `tsdown.config.ts` — Vite+ explicitly doesn't read the latter (see DECISIONS.md 2026-06-24). `packages/cadmea`'s `pack` block also wires `@rolldown/plugin-babel` + `babel-preset-solid` directly for Solid JSX.
- **Mobile-first CMS:** Cadmea is designed for phones and tablets first. Desktop is an enhancement. Bottom navigation, full-screen views, tap-to-reorder. Never retrofit a desktop UI for mobile.
- **SolidJS, not React:** CMS UI is built in SolidJS — fine-grained reactivity, no virtual DOM, minimal compiled payload for fast cold starts in V8 isolates. Use `createSignal`/`createEffect`, not React hooks. When a dependency has no official Solid package (e.g. Phosphor icons), prefer the framework-agnostic build over an unofficial community port.
- **Scale-appropriate:** Don't build for scale you don't have. No premature abstractions.
- **No throwaway work:** Every decision should hold up across phases.
- **Clean boundaries:** Cadmus has no Cadmea-specific code. Cadmea imports from Cadmus, never the reverse. Extension distribution logic stays in citadel-tooling.
- **Documentation is the product:** Cadmus should be so well documented that reaching for AI to understand it feels unnecessary. If something can't be documented clearly, the design is wrong.

---

*Thebes — Open source. Always free. Built with care.*
*A BowenLabs project.*
