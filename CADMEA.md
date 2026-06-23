# Cadmea — CMS Briefing

> This document covers the Cadmea CMS/admin layer specifically.
> Read CLAUDE.md first for the full Thebes monorepo context.
> Read CADMUS.md before this — Cadmea is built entirely on Cadmus primitives
> and the `cadmus/cms` engine; this doc assumes that context.
> Read this before touching anything in `packages/cadmea/`, `app/cadmea.config.ts`,
> or `app/workers/cadmea/`.
> For the practical deploy/run guide, see [`app/README.md`](./app/README.md) —
> that doc stays focused on "how do I run this," this one covers "why does it
> work this way."

---

## What is Cadmea?

Cadmea is a free, open-source, V8-native headless CMS and admin platform,
built entirely on top of `@thebes/cadmus` and its `cadmus/cms` engine.
Operators define content as **collections** in `cadmea.config.ts` (the
equivalent of a `payload.config.ts`) and get a generated admin UI, a typed
query layer, and a REST API — on infrastructure they own forever.

Cadmea is Cadmus's reference implementation: it proves the framework works in
production and shows what building on Cadmus looks like end-to-end. It is also
a deliberate proof of concept for what a Payload-CMS-equivalent product looks
like with zero Node.js dependency, running natively in Cloudflare's V8
isolates.

**Component package:** `@thebes/cadmea`
**Location:** `packages/cadmea/`
**Engine:** `@thebes/cadmus/cms` (`packages/cadmus/src/cms/`)
**Reference deployment:** `app/workers/cadmea/` (Worker 2 of Thebes's own app)
**License:** MIT

---

## Design philosophy

### 1. Operators write config, not code

The entire admin UI — list views, edit forms, field rendering, validation
surfaces — is generated from `cadmea.config.ts` and `cadmus/cms`'s admin
introspection metadata (`getCollectionsMeta()`). An operator who only ever
touches `cadmea.config.ts` should never need to open `packages/cadmea/` or
`packages/cadmus/`. If a feature requires an operator to hand-write a
component just to get a working CMS, the design is wrong.

### 2. Mobile-first, not mobile-retrofitted

Cadmea's admin is designed for phones and tablets first — bottom navigation,
full-screen views, tap-to-reorder. Desktop is an enhancement layered on top of
that, never the other way around. This is a deliberate constraint on
`packages/cadmea`'s component design, not a CSS media-query afterthought.

**This is mobile-first *web*** — a responsive admin rendered in a browser. It
answers a different question than the native companion described below, and
the two should never be conflated in docs, commits, or planning.

### 3. Generic components, driven by metadata — not per-collection code

`CollectionList.tsx` and `CollectionEdit.tsx` (`packages/cadmea/src/`) are
generic — one implementation renders *any* collection's list/edit view by
reading the admin metadata `cadmus/cms` generates from that collection's
config. Adding a collection never means writing a new component.

This separation — schema/data layer (`cadmus/cms`'s Local API + admin
metadata) decoupled from presentation (`packages/cadmea`'s SolidJS
components) — is the single most important property of Cadmea's
architecture. It's also what makes the future native split (below) possible
without a rewrite of the data layer.

### 4. SolidJS, not React

Fine-grained reactivity, no virtual DOM, minimal compiled payload for fast
cold starts in V8 isolates. `createSignal`/`createEffect`, not hooks. Routing
and data-fetching glue lives in `packages/cadmea/src/tanstack-start/`
(`list.tsx`, `create.tsx`, `edit.tsx`) — the equivalent of `@payloadcms/next`'s
catch-all route pattern, wiring the generic components to
`@tanstack/solid-query` and `@tanstack/solid-router`.

### 5. The Local API is the only door

All reads/writes — from the admin UI, the public REST API, server functions,
anywhere — go through `cadmus/cms`'s Local API (`find` / `findByID` /
`create` / `update` / `deleteByID`). Access control and hooks are enforced
*there*, not in the UI layer:

- **Access** — per-collection `access` rules in `cadmea.config.ts`; a denied
  check throws `CadmusAccessDeniedError`. The UI never re-implements
  authorization — it just surfaces what the Local API allows or rejects.
- **Hooks** — collection lifecycle hooks run inside the Local API, so they
  fire identically whether the call came from the admin panel or the public
  REST API (`mountCmsRoutes` / `mountPublicCmsApi`, see
  `packages/cadmus/src/cms/README.md`).

A UI component that bypasses the Local API to query D1/Drizzle directly is
always wrong, no exceptions.

### 6. Plugins, not forks

Collection/field/hook behavior changes ship as Cadmea plugins
(`@thebes/cadmea-plugin-*`, the `(config) => config` axis — see
EXTENDING.md), not as edits to `packages/cadmea`'s generic components or
`cadmus/cms`'s engine. If a feature can't be expressed as a plugin transform
over the config, that's a signal that it belongs in `cadmus/cms` itself
(framework-level) rather than as a one-off.

---

## Package structure

```
packages/cadmea/
├── src/
│   ├── CollectionList.tsx       ← generic list view, driven by admin meta
│   ├── CollectionEdit.tsx       ← generic edit/create form
│   ├── RichTextEditor.tsx       ← TipTap integration (JSON native, no transform layer)
│   ├── tanstack-start/
│   │   ├── list.tsx             ← createCollectionListPage
│   │   ├── create.tsx           ← createCollectionCreatePage
│   │   ├── edit.tsx             ← createCollectionEditPage
│   │   └── index.ts
│   └── index.ts
├── dist/                        ← tsup-preset-solid output (server/browser/worker/node/deno)
├── package.json                 ← name: "@thebes/cadmea", exports map
├── tsup.config.ts
└── README.md                    ← npm-facing install/usage docs

app/
├── cadmea.config.ts              ← root collections config — the payload.config.ts equivalent
├── core/db/schema.generated.ts   ← generated from cadmea.config.ts — never hand-edited
├── core/lib/                     ← app-specific glue (image service, design system wiring, etc.)
├── custom/                       ← operator territory — never overwritten by updates
└── workers/cadmea/                ← Worker 2: TanStack Start admin, the reference deployment
```

`packages/cadmus/src/cms/` (engine: types, `defineCmsConfig`, schema-gen,
Local API, admin meta) is documented separately in
[`packages/cadmus/src/cms/README.md`](./packages/cadmus/src/cms/README.md) —
that's the authoritative reference for collection config shape, plugins,
access, hooks, and the REST API. This document doesn't repeat it.

---

## What Cadmea is not

- **Not a Cadmus primitive.** Cadmea is a product built *on* Cadmus, never
  the reverse. Nothing Cadmea-specific belongs in `packages/cadmus/`.
- **Not configurable infrastructure.** Cadmea ships no SaaS, no managed
  hosting, no account system beyond magic-link auth. The operator's
  Cloudflare account is the only backend that exists.
- **Not extensible by forking the generic components.** Per-collection or
  per-field customization is a plugin/config concern, not a reason to copy
  and modify `CollectionList.tsx`/`CollectionEdit.tsx`.
- **Not (yet) a native app.** See below.

---

## Future: the native split (not yet scoped — do not build against this)

The long-term direction is for Cadmea to split into two targets sharing one
logic layer:

- **Web** — what exists today: `packages/cadmea`'s SolidJS/DOM components,
  consumed by `app/workers/cadmea`.
- **Native** — a future companion rendered through **Spartoi**, a standalone
  render-agnostic SolidJS framework (parallel to Cadmus, not a Cadmus rename
  or a Cadmea feature). Tracked in
  [issue #31](https://github.com/bowenlabs/project-thebes/issues/31), blocked
  by [issue #30](https://github.com/bowenlabs/project-thebes/issues/30)
  (the Void/Vite+/Rolldown migration).

What's already decided: both targets will share `cadmus/cms`'s Local API,
admin metadata, and the TanStack Query layer unchanged — the architecture
described in design philosophy point 3 above is what makes this possible
without touching the data layer. What's *not* decided: whether the
presentational components themselves end up shared via a render-agnostic
component vocabulary (`solid-js/universal`-style) or implemented twice against
shared logic — see issue #31 for the reasoning, currently leaning toward the
former with explicit platform-specific escape hatches.

**Do not pre-emptively restructure `packages/cadmea` or scaffold a native
package for this.** Spartoi has no code yet and its real component API won't
be known until issue #30 lands. Building against a guessed shape now risks
the exact rework this section exists to avoid.

---

## Maintainer

Cadmea is maintained by one person (Baylee, BowenLabs), same as Cadmus. PRs
welcome, no SLA. See CADMUS.md's maintainer note — it applies here unchanged.

---

*Cadmea — the citadel Cadmus built. Open source. Always free.*
*A BowenLabs project.*
