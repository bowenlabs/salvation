# Project Thebes

**Cadmus** — a V8-first, Cloudflare-native full-stack framework.
**Cadmea** — a free, open-source, V8-native headless CMS built on Cadmus.

> Both projects are under active development. APIs will change.
> Star the repo to follow along.

<details>
<summary><strong>Why "Thebes"?</strong> (the short mythological version)</summary>

<br>

In the myth, Cadmus went looking for the Ismenian spring and found it
guarded by a dragon. He killed it, sowed its teeth into the ground, and
the warriors who sprang up helped him build a fortified citadel — the
Cadmea. The city that grew up around it was Thebes. Cadmus is also
credited with bringing the alphabet to Greece: less a monster-slayer,
more the original protocol designer.

The names borrow that shape, not the body count:

- **V8** is the spring — the raw, fast thing everyone actually wants.
- **Cadmus** is the framework that talks to it directly, in its native
  language, without a heavier runtime standing in the way.
- **Cadmea** is the fortified thing Cadmus built — a CMS admin hardened
  the way a citadel is, not a website with a dashboard bolted on.
- **Thebes** is the whole city: the monorepo everything lives in.

No dragons were harmed. Node.js remains an excellent choice for almost
everything that isn't this.

</details>

---

## What's in here

```
thebes/
├── packages/
│   ├── cadmus/                    @thebes/cadmus — the framework
│   ├── cadmea/                    @thebes/cadmea — Cadmea's admin-UI components
│   ├── cadmea-design-system/      @thebes/cadmea-design-system — design-token engine (standalone lib)
│   ├── cadmea-access-helpers/     @thebes/cadmea-access-helpers — access-control predicates (standalone lib)
│   ├── cadmea-plugin-seo/         @thebes/cadmea-plugin-seo — SEO plugin (CMS axis)
│   ├── cadmea-plugin-redirects/   @thebes/cadmea-plugin-redirects — redirects plugin (CMS axis)
│   ├── cadmea-plugin-crm/         @thebes/cadmea-plugin-crm — contacts/activities CRM plugin (CMS axis)
│   ├── cadmea-plugin-ecommerce/   @thebes/cadmea-plugin-ecommerce — provider-agnostic ecommerce core (CMS axis)
│   ├── cadmea-plugin-ecommerce-square/  Square's PaymentProvider implementation
│   ├── cadmea-plugin-ecommerce-stripe/  Stripe's PaymentProvider implementation
│   ├── cadmea-plugin-printful/    @thebes/cadmea-plugin-printful — Printful FulfillmentProvider implementation
│   ├── cadmea-ecommerce-ui/       @thebes/cadmea-ecommerce-ui — storefront SolidJS components (standalone lib)
│   ├── cadmea-blocks/             @thebes/cadmea-blocks — theme-neutral Astro block components for the public site (standalone lib)
│   └── cadmus-cloudflare-images/  @thebes/cadmus-cloudflare-images — image adapter (framework axis)
├── app/
│   ├── workers/site/   docs + marketing for Cadmus and Cadmea, example deployment
│   └── workers/cadmea/ Cadmea — the reference CMS admin
└── examples/
    ├── minimal/             the smallest possible Cadmus app
    └── cadmea-smb-template/ worked multi-provider (Square + Stripe) ecommerce example
```

Extensions come on two axes — **adapters** (`@thebes/cadmus-*`, swappable
implementations like image services) and **plugins** (`@thebes/cadmea-plugin-*`,
Payload-style `config => config` transforms). Shared building blocks that are
neither (like the design-token engine, access-control helpers, or the
storefront UI components) ship as plain **libraries**. A plugin may also
define its own swappable provider interface for plugin-internal needs — see
`@thebes/cadmea-plugin-ecommerce`'s `PaymentProvider` (Square/Stripe) — a
third pattern, not a new top-level axis. See **[EXTENDING.md](./EXTENDING.md)**.

### The bigger picture

`project-thebes` is the **monorepo** — it holds the framework, the CMS, the
first-party extensions, the docs site, the reference app, and the examples, and
it publishes the `@thebes/*` packages to npm. Two things live *outside* it:

- **`thebes-web`** — the fork target (Cloudflare deploy button) a client
  site is built from. It consumes the published packages and holds that site's
  `cadmea.config.ts` and `custom/`.
- **`citadel-tooling`** — the Go orchestrator that provisions Cloudflare
  accounts and domains for one-step, non-developer deploys of the template.

Cadmus itself is **not a meta-framework** (it doesn't own routing, layouts, or
your build) and the "stack" is not a single package — it's the published
packages plus the documented architecture plus the template that wires them into
a deployable app. Cadmea is the admin-UI component library that renders against
Cadmus's CMS metadata; admin behavior beyond that ships as plugins.

---

## Cadmus

A V8-first, Cloudflare-native framework. Provides the primitives needed
to build complete web applications on Cloudflare Workers without Node.js
assumptions, adapter layers, or configuration overhead.

```bash
npm install @thebes/cadmus
```

Each primitive is independently usable:

```typescript
import { db }          from '@thebes/cadmus/db'
import { createMagicLink } from '@thebes/cadmus/auth'
import { upload }      from '@thebes/cadmus/storage'
import { purgeCache }  from '@thebes/cadmus/cache'
import { enqueue }     from '@thebes/cadmus/queues'
```

**[Read the Cadmus docs →](./packages/cadmus/README.md)**

---

## Cadmea

A free, open-source, V8-native headless CMS and admin platform. Built on
Cadmus. Define content as collections in `cadmea.config.ts` (the
equivalent of a `payload.config.ts`) and get a generated admin UI, a
typed query layer, and a REST API — on infrastructure you own forever.
It's also a deliberate proof of concept for what a Payload-CMS-equivalent
product looks like with zero Node.js dependency, running natively in
Cloudflare's V8 isolates.

- **MIT licensed** — no revenue thresholds, no commercial license required
- **Operator-owned** — your Cloudflare account, your data, your domain
- **Mobile-first** — the CMS admin is designed for phones and tablets first

**[Read the Cadmea deploy guide →](./app/README.md)** ·
**[Read the Cadmea design briefing →](./CADMEA.md)**

---

## What's next

Cadmus and Cadmea are the two projects shipping today. Planned, not yet
started: **Spartoi**, a standalone, render-agnostic SolidJS framework for
native (mobile) rendering, parallel to Cadmus rather than a feature of either
existing project. The long-term direction is for Cadmea to split into web and
native targets sharing one logic layer, with Spartoi as the native rendering
substrate. Tracked in
[issue #31](https://github.com/bowenlabs/project-thebes/issues/31), blocked
on [issue #30](https://github.com/bowenlabs/project-thebes/issues/30) (the
VoidZero Void/Vite+/Rolldown migration). See CLAUDE.md and CADMEA.md for the
full reasoning.

**`@thebes/cadmus/astro`** — the official peer-integration layer (same
"peer, not a dependency" treatment `cadmus/hono` already gets) making Astro
the officially recommended frontend for Cadmus — shipped 2026-06-24
([issue #32](https://github.com/bowenlabs/project-thebes/issues/32)).

**Section 3** added the first real ecommerce extension — provider-agnostic
core collections plus Square and Stripe `PaymentProvider` implementations
(`@thebes/cadmea-plugin-ecommerce`, `-square`, `-stripe`), a storefront
SolidJS component library (`@thebes/cadmea-ecommerce-ui`), and two more
generalized plugins (`@thebes/cadmea-plugin-redirects`,
`@thebes/cadmea-plugin-crm`). The commerce plugin also defines a second
provider interface, `FulfillmentProvider`, with a Printful implementation
(`@thebes/cadmea-plugin-printful`). See `examples/cadmea-smb-template` for all
of it wired together.

`@thebes/cadmus` 0.6.0 added a configurable security-headers middleware
(`createSecurityHeaders`, `@thebes/cadmus/hono`), read-side TipTap rendering
(`renderRichText`, `@thebes/cadmus/cms`), and image-ref parsing (`parseImageRef`,
`@thebes/cadmus/storage`) — the last two power the new `@thebes/cadmea-blocks`
package, theme-neutral Astro components for rendering CMS block content on the
public site.

---

## Media (R2)

Uploaded images go through `POST /api/media/upload` (Worker 2 — Cadmea)
straight into the `thebes-media` R2 bucket, then are served back from
`MEDIA_URL` as plain public URLs — no CDN transform layer in Section 1
(see `app/core/lib/image-service.ts`).

Before relying on uploads in any deployed environment:

1. **Make the bucket public.** `wrangler r2 bucket create thebes-media`
   only creates the bucket — it isn't reachable over HTTP until you enable
   public access (R2 dashboard → bucket → Settings → Public access, or
   attach a custom domain) and confirm in the Cloudflare dashboard.
2. **Attach a custom domain**, not the default `r2.dev` URL — `r2.dev`
   URLs are rate-limited and meant for testing only.
3. **Set `MEDIA_URL`** (a Worker secret in production, `.dev.vars` locally)
   to that custom domain, with no trailing slash — both Workers read it
   from the same env var.
4. **Verify before going live**: upload a test image through the Panel
   and confirm the returned URL loads directly in a browser, with no
   auth, before pointing real content at it.

Uploads are validated server-side (image MIME whitelist, 5MB max) before
ever reaching R2 — never trust a client-reported MIME type beyond that
whitelist check. See `packages/cadmus/src/storage/index.ts`'s
`validateImageFile`.

---

## Philosophy

Cloudflare is an exceptional platform — ethical, privacy-focused, at-cost
pricing. Cadmus exists to make building on Cloudflare so easy and secure
that reaching for a heavier stack feels like the wrong choice.

Inspired by Vue's progressive adoption model and Hono's proof that a
V8-first framework can be tiny, fast, and developer-friendly simultaneously.
Astro and TanStack (Start, Router, Query) are further proof points worth
crediting directly: both are framework-agnostic by design and beautifully
architected — neither locks you into one rendering model or vendor the way
the React/Next/Vercel stack increasingly does. That's the kind of frontend
story Cadmus wants to be the backend for.

---

## Status

| Package | Version | Status |
|---|---|---|
| `@thebes/cadmus` | 0.6.0 | 🚧 Active development — Phase 3 |
| `@thebes/cadmea` | 1.9.0 | 🚧 Active development — Phase 3 |

Breaking changes will happen while these are in active development — see each
package's CHANGELOG for what moved.

---

## Contributing

Both Cadmus and Cadmea are MIT licensed. Contributions welcome — read
[CONTRIBUTING.md](./CONTRIBUTING.md) before opening a PR. See
[LICENSE](./LICENSE) for full terms.

All contributors and operators are expected to follow the
[Code of Conduct & Acceptable Use](./CODE_OF_CONDUCT.md) — all
contributions are welcome, and Cadmea may not be used for hateful,
discriminatory, or harassing purposes.

---

## Maintained by

[BowenLabs](https://bowenlabs.com) — one person, built with care.

*Thebes — Open source. Always free. Built with care.*
