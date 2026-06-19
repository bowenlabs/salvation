# Getting Started
## Thebes — Cadmus Framework + Citadel Reference App
## Astro + TanStack Start + Cloudflare Workers

> This guide walks you through Phase 0 — validating the two-Worker VMFE
> stack and the Cadmus framework primitives before committing to Phase 1.
> By the end you will have both Workers running locally, D1/KV/R2 bindings
> confirmed in each, DaisyUI working on both, server functions typed
> end-to-end from Drizzle, the Hono public API verified, and the core
> Cadmus primitive structure in place.
>
> **Monorepo:** `thebes/` contains `packages/cadmus/` (the framework)
> and `apps/citadel/` (the reference app). Worker 1 is Astro (public site).
> Worker 2 is TanStack Start (Panel). Both Workers share the same D1, KV,
> and R2 binding IDs. Hono lives inside Worker 2's custom server entrypoint.
> All shared primitives live in `@bowenlabs/cadmus` — imported by both Workers.

---

## Reference implementations

Study these before building — they show confirmed working patterns:

| Resource | What it shows |
|---|---|
| [Cloudflare Astro guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/astro/) | Official Cloudflare Astro on Workers — scaffold + bindings |
| [`@astrojs/cloudflare` adapter docs](https://docs.astro.build/en/guides/integrations-guide/cloudflare/) | `handle()` — the stable pattern for custom Cloudflare Worker entrypoints (use this, not the `astro/hono` example below) |
| [Astro 6.3 blog post](https://astro.build/blog/astro-630/) | `astro/hono` advanced routing — confirmed **broken** for custom Cloudflare entrypoints in this version combo; see DECISIONS.md |
| [Cloudflare TanStack Start guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/) | Official TanStack Start on Workers — scaffold + bindings |
| [aaronksaunders/tanstack-start-drizzle-app](https://github.com/aaronksaunders/tanstack-start-drizzle-app) | TanStack Start + Drizzle — confirmed server function pattern |
| [bskimball/tanstack-hono](https://github.com/bskimball/tanstack-hono) | TanStack Router + Hono — useful for the Hono public API entrypoint pattern |
| [Vinoflare RPC template](https://www.vinoflare.app/docs/templates/rpc) | Hono + TanStack Router + D1 + Drizzle — reference for Hono route groups |
| [cf-astro-blog-starter](https://github.com/h1n054ur/cf-astro-blog-starter) | Astro + Hono + CF Workers with D1, R2, KV |
| [Cloudflare microfrontends guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/microfrontends/) | VMFE architecture — Service Bindings between Workers |

---

## Prerequisites

```bash
node --version      # 24+
pnpm --version      # 11+
wrangler --version  # latest
```

```bash
pnpm add -g wrangler
wrangler login
```

---

## Architecture overview

```
Cloudflare Account
│
├── D1 Database ──────────────────────────────────┐
├── KV Namespace ─────────────────────────────────┤ shared bindings
├── R2 Bucket ────────────────────────────────────┤ same IDs in both
│                                                  │ wrangler.jsonc files
├── Worker 1: Astro public site ←─────────────────┘
│   apps/citadel/workers/site/
│   ├── Hono entrypoint — custom routes → handle()
│   ├── Astro SSR pages — bindings via env (cloudflare:workers)
│   └── Serves: /, /[slug], /about, /contact, /coming-soon
│
└── Worker 2: TanStack Start Panel ←─────────────┘
    apps/citadel/workers/panel/
    ├── Custom server entrypoint (app/server.ts)
    │   └── Hono — /api/form/:slug, /api/auth/*, /api/media/upload
    ├── TanStack Start — all /admin/* routes
    │   ├── Server functions via env.DB (cloudflare:workers)
    │   └── TanStack Router — client-side Panel navigation
    └── Serves: /admin/*, /api/* (public endpoints only)
```

---

## Scaffold order

**Scaffold Astro first, TanStack Start second.** Functionally, the two
Workers are independent and neither requires the other to exist. But the
Cloudflare bindings (D1, KV, R2) are created during the Astro Worker setup
in Step 5 — Worker 2 then copies those IDs directly. If you scaffold
TanStack Start first, you have no real IDs to put in its `wrangler.jsonc`
yet and will need to revisit that config later.

---

## Part 1 — Worker 1: Astro public site

### Step 1 — Scaffold Astro Worker

```bash
mkdir -p apps/citadel/workers/site
cd apps/citadel/workers/site
pnpm create cloudflare@latest . --framework=astro
```

When prompted: TypeScript yes, Git yes, Deploy now no.

### Step 2 — Install Hono

Hono lives in Worker 1 as the entry point — it routes custom API requests
(like `/api/ping`) and falls through to Astro SSR for everything else.

```bash
pnpm add hono
```

### Step 3 — Wire Hono into Astro

**Do not use `astro/hono`'s `middleware()`/`pages()`, or `cf()` from
`@astrojs/cloudflare/hono`.** That composition is documented in Astro's own
6.3 blog post, but it's part of the *experimental* "Advanced Routing"
feature, and as of `astro@6.4.8` + `@astrojs/cloudflare@13.7.0` it's
confirmed broken: every request throws `Error: FetchState(request) called
on a request without an attached app.` — reproduced with zero custom code,
in both `astro dev` and a real built `wrangler dev`. Full investigation and
root cause in [DECISIONS.md](./DECISIONS.md).

Use the stable, documented `handle()` export instead — a plain Hono app
that checks custom routes first, then falls through to Astro SSR:

```typescript
// apps/citadel/workers/site/src/app.ts
import { Hono } from 'hono'
import { handle } from '@astrojs/cloudflare/handler'

const app = new Hono<{ Bindings: Env }>()

// 1. Custom API routes — checked first
app.get('/api/ping', async (c) => {
  const result = await c.env.DB.prepare('SELECT 1 as ok').first()
  await c.env.KV.put('ping', 'pong')
  const kv = await c.env.KV.get('ping')
  return c.json({ db: result, kv, worker: 'site' })
})

// 2. Astro SSR — fallback for everything else, must be last
app.all('*', async (c) => handle(c.req.raw, c.env, c.executionCtx))

export default app
```

Update `apps/citadel/workers/site/astro.config.mjs`. No `entrypoint` option
(it doesn't exist on this adapter version — Astro auto-detects `src/app.ts`
as the Worker entry regardless), and no `experimental.advancedRouting`
flag (that's what gates the broken `astro/hono` feature):

```javascript
import { defineConfig } from 'astro/config'
import cloudflare from '@astrojs/cloudflare'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  adapter: cloudflare(),
  output: 'server',
  vite: {
    plugins: [tailwindcss()],
  },
})
```

**Resources:**
- [`@astrojs/cloudflare` adapter docs](https://docs.astro.build/en/guides/integrations-guide/cloudflare/) — `handle()` is the documented pattern for custom Cloudflare Worker entrypoints
- [Astro 6.3 blog post](https://astro.build/blog/astro-630/) — the `astro/hono` advanced-routing example that does **not** work for custom Cloudflare entrypoints in this version combo; kept here for context on what to avoid
- [DECISIONS.md](./DECISIONS.md), "astro/hono advanced routing is broken for custom Cloudflare entrypoints" — full repro steps and root cause

### Step 4 — Install DaisyUI for Astro

DaisyUI v5 uses Tailwind v4 as a Vite plugin, not PostCSS:

```bash
pnpm add tailwindcss @tailwindcss/vite daisyui
```

Create `apps/citadel/workers/site/src/assets/app.css`:

```css
@import "tailwindcss";
@plugin "daisyui";
```

Import in your layout:

```astro
---
// apps/citadel/workers/site/src/layouts/Layout.astro
import "../assets/app.css"
---
```

No `tailwind.config.js`. No PostCSS. The `@tailwindcss/vite` plugin handles everything.

**Verify `app.css` actually has content** (`wc -l src/assets/app.css` should
show 2, not 0) **and that every page that needs DaisyUI classes either uses
`Layout.astro` or imports `app.css` directly.** A blank or unimported
`app.css` produces no error — DaisyUI/Tailwind class names just render as
plain, unstyled text, which is easy to mistake for a token-cascade bug
rather than a missing-import bug. See Step 9 for the gotcha this caused
during Phase 0.

### Step 5 — Configure Worker 1 wrangler.jsonc

```jsonc
// apps/citadel/workers/site/wrangler.jsonc
{
  "name": "citadel-site",
  "main": "./src/app.ts",
  "compatibility_date": "2026-06-17",
  "compatibility_flags": ["nodejs_compat"],
  "assets": {
    "binding": "ASSETS",
    "directory": "./dist/client"
  },
  "observability": { "enabled": true },
  "d1_databases": [{
    "binding": "DB",
    "database_name": "citadel-db",
    "database_id": "placeholder"    // replace after: wrangler d1 create citadel-db
  }],
  "kv_namespaces": [{
    "binding": "KV",
    "id": "placeholder"             // replace after: wrangler kv namespace create KV
  }, {
    "binding": "SESSION",
    "id": "placeholder"             // replace after: wrangler kv namespace create SESSION
  }],
  "r2_buckets": [{
    "binding": "R2",
    "bucket_name": "citadel-media"
  }],
  "images": {
    "binding": "IMAGES"
  },
  "send_email": [{
    "name": "EMAIL"
  }]
}
```

**`main` points at the source entrypoint (`./src/app.ts`), not a build output path.**
The Cloudflare Vite plugin resolves `main` before `astro build` produces any
output — pointing it at `./dist/...` fails with "doesn't point to an existing
file" on a clean checkout. `astro build && wrangler deploy` bundles the
source entrypoint correctly without any extra config swap.

**`assets.directory` is `./dist/client`, not `./dist`.** Confirmed by
inspecting actual build output — `@astrojs/cloudflare` 13.x puts static
assets in `dist/client/` and the server bundle in `dist/server/`. There is
no `dist/_worker.js/` in this adapter version.

**`SESSION` (KV) and `IMAGES` bindings are required by the adapter**, even
though Section 1 doesn't use Cloudflare Images or Astro Sessions directly —
`@astrojs/cloudflare` auto-enables both and will inject a default binding
name if you don't declare one yourself. Declaring them explicitly here
avoids relying on the adapter's auto-injection and keeps both binding names
under your control.

Create bindings (run once — IDs go into both Workers):

```bash
wrangler d1 create citadel-db              # copy database_id
wrangler kv namespace create KV           # copy id
wrangler kv namespace create SESSION      # copy id
wrangler r2 bucket create citadel-media
```

### Step 6 — TypeScript types for Worker 1

Create `apps/citadel/workers/site/src/env.d.ts`:

```typescript
interface Env {
  DB: D1Database
  KV: KVNamespace
  R2: R2Bucket
  ASSETS: Fetcher
  SESSION_SECRET: string
  OWNER_EMAIL: string
  MEDIA_URL: string
}

declare namespace App {
  interface Locals {
    runtime: { env: Env }
    user?: { id: number; email: string; role: string }
  }
}
```

### Step 7 — Local secrets

```bash
# apps/citadel/workers/site/.dev.vars — never commit
SESSION_SECRET=dev-secret-change-in-production
OWNER_EMAIL=you@yourdomain.com
MEDIA_URL=http://localhost:3001/media
```

### Step 8 — POC 1a: verify bindings in Astro

The `/api/ping` route added in Step 3 already verifies D1 + KV bindings work
from a custom Hono route. Confirm with:

```bash
curl http://localhost:4321/api/ping
# {"db":{"ok":1},"kv":"pong","worker":"site"}
```

And confirm bindings also work from an Astro page (a separate code path —
`import { env } from 'cloudflare:workers'`, not Hono's `c.env`).

**`Astro.locals.runtime.env` was removed in Astro v6** — using it throws
`Astro.locals.runtime.env has been removed in Astro v6. Use 'import { env }
from "cloudflare:workers"' instead.` Confirmed during Phase 0 (2026-06-19):
the v6 replacement is a top-level import, not an `Astro.locals` property.
See [DECISIONS.md](./DECISIONS.md).

```astro
---
// apps/citadel/workers/site/src/pages/test.astro
import { env } from 'cloudflare:workers'
const result = await env.DB.prepare('SELECT 1 as ok').first()
---
<p>D1 from Astro: {JSON.stringify(result)}</p>
```

```bash
cd apps/citadel/workers/site && pnpm dev    # starts on :3000
```

Visit `http://localhost:3000/api/ping` — both `db` and `kv` populated = **POC 1a complete**.

### Step 9 — POC 2: design token injection

**Confirmed during Phase 0 (2026-06-19): two things are easy to miss here.**

1. `src/assets/app.css` must actually contain the Step 4 directives
   (`@import "tailwindcss"; @plugin "daisyui";`) — an empty file produces
   no errors, it just silently means `bg-primary`/`text-primary-content`
   render as plain, unstyled class names. Any page using DaisyUI utility
   classes must import it: `import '../assets/app.css'` in the frontmatter.
2. **DaisyUI v5 uses `--color-primary` / `--color-primary-content`, not
   the DaisyUI v4 short names `--p` / `--pc`.** The generated utility CSS
   is `.bg-primary { background-color: var(--color-primary); }`. Using the
   old names produces no error at all — the override `<style>` tag just
   sets a variable nothing reads, and the page silently fails to show the
   color change. If a token-injection test "does nothing" with otherwise
   correct markup order, check the variable names first. Full repro in
   [DECISIONS.md](./DECISIONS.md).

```css
/* apps/citadel/workers/site/public/themes/theme-test.css */
:root[data-theme="test"] {
  --color-primary: oklch(62% 0.18 145);
  --color-primary-content: oklch(100% 0 0);
}
```

```astro
---
// apps/citadel/workers/site/src/pages/token-test.astro
import '../assets/app.css'
const tokenStyle = `:root[data-theme="test"] { --color-primary: oklch(42% 0.12 145); }`
---
<html data-theme="test">
  <head>
    <link rel="stylesheet" href="/themes/theme-test.css" />
    <!-- style tag MUST come after the link — source order wins -->
    <style set:html={tokenStyle} />
  </head>
  <body>
    <div class="bg-primary text-primary-content p-8">
      If dark green: token injection working
    </div>
  </body>
</html>
```

Disable JS and reload — color must still be correct. No FOUC = **POC 2 complete**.

Verify without a browser: `curl http://localhost:3000/token-test | grep -o '\-\-color-primary:[^;]*'`
should show the darker override value (`42%`), not the theme file's value (`62%`).

---

## Part 2 — Worker 2: TanStack Start Panel

### Step 10 — Scaffold TanStack Start Worker

**Confirmed during Phase 0 (2026-06-19): `pnpm create cloudflare@latest .
--framework=tanstack-start` hangs indefinitely.** It shells out to
`pnpm dlx @tanstack/cli@0.69.3 create panel ... --no-git`, which ends with
an arrow-key "Do you want to use git for version control?" prompt — and
that prompt always appears even with `--no-git` already passed (looks like
an upstream flag bug), requiring raw-mode TTY input that a piped/scripted
invocation can never satisfy. It will just sit there with no error.

Bypass the `create-cloudflare` wrapper and call the TanStack CLI directly
with its real non-interactive flags instead:

```bash
cd ../..   # back to repo root
mkdir -p apps/citadel/workers/panel
cd apps/citadel/workers/panel
pnpm dlx @tanstack/cli@0.69.3 create panel \
  --framework solid \
  --deployment cloudflare \
  --no-git \
  --non-interactive \
  --yes \
  --target-dir .
```

**Two more things to do immediately after scaffolding:**

1. `apps/citadel/workers/panel` sits **three** levels under `apps/`, but the
   root `pnpm-workspace.yaml`'s `apps/*` glob only matches one level deep —
   `panel` is silently invisible to the workspace until you fix this.
   Add an explicit deeper pattern:
   ```yaml
   # pnpm-workspace.yaml
   packages:
     - 'packages/*'
     - 'apps/*'
     - 'apps/citadel/workers/*'
     - 'docs'
     - 'examples/*'
   ```
   Without this, `pnpm install` at the repo root reports "Already up to
   date" and silently does nothing for `panel` — no error, no `node_modules`,
   nothing to indicate the package was never recognized.
2. Run `pnpm install` from the repo root (not inside `panel/`) so the
   workspace-aware install actually picks it up, then `pnpm run
   generate-routes` inside `panel/` — the scaffold's own route-generation
   step fails on first run (`sh: tsr: command not found`) because it tries
   to run before dependencies are installed.

Full repro and root cause for both bugs in [DECISIONS.md](./DECISIONS.md).

### Step 11 — Configure Worker 2 wrangler.jsonc

Use the **same binding IDs** as Worker 1 — same D1, same KV, same R2 — plus
the same `SESSION`/`IMAGES`/`send_email` bindings, `$schema`, and
compatibility flags. `main` must point at a custom entrypoint file
(`./app/server.ts`, created in Step 17) — **not**
`@tanstack/solid-start/server-entry`, the framework's own default entry.
Pointing `main` at the package default works for a vanilla scaffold with
no custom routes, but once you add the Hono entrypoint in Step 17, `main`
must point at that file instead:

```jsonc
// apps/citadel/workers/panel/wrangler.jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "citadel-panel",
  "main": "./app/server.ts",
  "compatibility_date": "2026-06-17",
  "compatibility_flags": ["nodejs_compat", "global_fetch_strictly_public"],
  "assets": {
    "binding": "ASSETS",
    "directory": "./dist/client"
  },
  "observability": { "enabled": true },
  "d1_databases": [{
    "binding": "DB",
    "database_name": "citadel-db",
    "database_id": "same-id-as-site-worker"    // copy from apps/citadel/workers/site/wrangler.jsonc
  }],
  "kv_namespaces": [{
    "binding": "KV",
    "id": "same-id-as-site-worker"             // copy from apps/citadel/workers/site/wrangler.jsonc
  }, {
    "binding": "SESSION",
    "id": "same-id-as-site-worker"             // copy from apps/citadel/workers/site/wrangler.jsonc
  }],
  "r2_buckets": [{
    "binding": "R2",
    "bucket_name": "citadel-media"
  }],
  "images": {
    "binding": "IMAGES"
  },
  "send_email": [{
    "name": "EMAIL"
  }]
}
```

### Step 12 — Install DaisyUI for TanStack Start

The scaffold from Step 10 already wires up Tailwind v4 (the `@tanstack/cli`
cloudflare add-on includes it by default) — `src/styles.css` and the
`@tailwindcss/vite` plugin in `vite.config.ts` already exist. DaisyUI alone
is missing:

```bash
pnpm add daisyui
```

Add the plugin line to the **existing** `src/styles.css` (don't create a
new file — the scaffold already imports this one from `src/routes/__root.tsx`):

```css
/* apps/citadel/workers/panel/src/styles.css */
@import "tailwindcss";
@plugin "daisyui";
```

`vite.config.ts`'s plugin list (already correct from the scaffold, no
changes needed) — note the order and that `devtools()`/`solid({ ssr: true })`
are both required, unlike earlier drafts of this guide:

```typescript
import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/solid-start/plugin/vite'
import solid from 'vite-plugin-solid'
import tailwindcss from '@tailwindcss/vite'
import { cloudflare } from '@cloudflare/vite-plugin'

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    devtools(),
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tailwindcss(),
    tanstackStart(),
    solid({ ssr: true }),
  ],
})
```

**Note:** `tsr.config.json` must set `"target": "solid"` — the TanStack
router-cli defaults to `"target": "react"` regardless of which framework
you scaffolded with, and will silently inject React imports into generated
route files if left unset. Confirmed during the Solid migration (2026-06-19).

**Also note:** if you change UI framework dependencies after the project
already has a populated `node_modules/.vite` cache, delete it
(`rm -rf node_modules/.vite`) before the next `pnpm dev`. A stale SSR
dependency-optimization cache from the old framework can surface as
`useRouter()`/context hooks returning `null` inside framework-agnostic
TanStack Router components like `HeadContent` — a Vite caching issue, not
a code or library bug. Confirmed during the Solid migration (2026-06-19).

### Step 13 — TypeScript types for Worker 2

Auto-generate from `wrangler.jsonc` rather than hand-writing the `Env`
interface — this matches what Step 11's bindings actually produce and
stays correct as bindings change:

```bash
pnpm wrangler types    # generates worker-configuration.d.ts
```

### Step 14 — Local secrets

```bash
# apps/citadel/workers/panel/.dev.vars — never commit
SESSION_SECRET=dev-secret-change-in-production
OWNER_EMAIL=you@yourdomain.com
MEDIA_URL=http://localhost:3001/media
```

### Step 15 — POC 1b: verify D1 in a server function

**`getCloudflareContext()` from `@tanstack/solid-start/cloudflare` does not
exist in this version** (`@tanstack/solid-start@1.168.26` has no
`./cloudflare` export at all) — confirmed during Phase 0 (2026-06-19).
Bindings are read the same way as everywhere else in this stack: a dynamic
`cloudflare:workers` import inside the handler. Full repro in
[DECISIONS.md](./DECISIONS.md).

Routes live under `src/routes/` in this scaffold, not `app/routes/` —
that directory doesn't exist here. `app/` is reserved for the custom Hono
entrypoint added in Step 17.

```typescript
// apps/citadel/workers/panel/src/routes/test.tsx
import { createFileRoute } from '@tanstack/solid-router'
import { createServerFn } from '@tanstack/solid-start'

const getD1Test = createServerFn({ method: 'GET' }).handler(async () => {
  const { env } = await import('cloudflare:workers')
  const result = await env.DB.prepare('SELECT 1 as ok').first()
  return result
})

export const Route = createFileRoute('/test')({
  component: Test,
  loader: () => getD1Test(),
})

function Test() {
  const result = Route.useLoaderData()
  return <p>D1 from TanStack Start: {JSON.stringify(result)}</p>
}
```

```bash
pnpm run generate-routes   # regenerates src/routeTree.gen.ts for the new route
cd apps/citadel/workers/panel && pnpm dev    # starts on :3000, per package.json
```

Visit `http://localhost:3000/test` — result populated = **POC 1b complete**.

### Step 16 — POC 1b continued: Drizzle in a server function

This is the core type-safety test. The return type must be inferred from
Drizzle — no `any` anywhere. Same `cloudflare:workers` pattern as Step 15.

**Requires Steps 19 and 20 (Drizzle install + `core/db/schema.ts` +
`@core/*` alias) to be done first** — do those now if you haven't.
The path alias is **`@core/*`, not `@apps/citadel/core/*`** — confirmed
during Phase 0 (2026-06-19), see [DECISIONS.md](./DECISIONS.md) for the
exact `Cannot find module` error this produces if you use the wrong one:

```typescript
// apps/citadel/workers/panel/src/server-functions/pages.ts
import { createServerFn } from '@tanstack/solid-start'
import { db } from '@core/lib/db'
import { pages } from '@core/db/schema'

export const getPages = createServerFn({ method: 'GET' })
  .handler(async () => {
    const { env } = await import('cloudflare:workers')
    return db(env.DB).select().from(pages).all()
    // hover over the return type — must be InferSelectModel<typeof pages>[]
    // if it shows any[], the Drizzle schema import is broken
  })
```

Use with @tanstack/solid-query in a Panel route:

```typescript
// apps/citadel/workers/panel/src/routes/admin/pages/index.tsx
import { createFileRoute } from '@tanstack/solid-router'
import { createQuery } from '@tanstack/solid-query'
import { Show } from 'solid-js'
import { getPages } from '../../../server-functions/pages'

export const Route = createFileRoute('/admin/pages/')({
  component: PagesPage,
})

function PagesPage() {
  const pages = createQuery(() => ({
    queryKey: ['pages'],
    queryFn: () => getPages(),
    // pages type inferred from Drizzle schema — no manual typing
  }))

  return (
    <Show when={!pages.isLoading} fallback={<div class="loading loading-spinner" />}>
      <pre>{JSON.stringify(pages.data, null, 2)}</pre>
    </Show>
  )
}
```

Hover over `pages` in your editor — must show the Drizzle inferred type.
No `any` = **Drizzle server function typing confirmed**.

### Step 17 — Hono public API (custom server entrypoint)

Public API endpoints (form submission, auth, media) are unauthenticated
and can't use TanStack Start server functions. They need a Hono handler
in a custom server entrypoint that wraps TanStack Start — same `handle()`
pattern as Worker 1 (Step 3), but TanStack's `RequestHandler` has a
different signature than Astro's `handle()`: **it takes only a `Request`**,
not `(request, env, ctx)`. Confirmed via `@tanstack/start-server-core`'s
own type: `(request: Request, opts?: RequestOptions) => Promise<Response>`.
Don't pass `env`/`ctx` through — TanStack Start reads bindings via
`cloudflare:workers` inside server functions instead, same as Step 15.

Create `apps/citadel/workers/panel/app/server.ts`:

```typescript
// apps/citadel/workers/panel/app/server.ts
import { Hono } from 'hono'
import startHandler from '@tanstack/solid-start/server-entry'

const app = new Hono<{ Bindings: Env }>()

// 1. Custom API routes — checked first
app.get('/api/ping', async (c) => {
  const result = await c.env.DB.prepare('SELECT 1 as ok').first()
  await c.env.KV.put('ping', 'pong')
  const kv = await c.env.KV.get('ping')
  return c.json({ db: result, kv, worker: 'panel' })
})

// Public form submission — unauthenticated
app.post('/api/form/:slug', async (c) => {
  // rate limit, honeypot check, validate, insert submission
  return c.json({ ok: true })
})

// Auth endpoints — called by Astro login page
app.post('/api/auth/magic-link', async (c) => {
  // rate limit, lookup user, generate token, store in KV, send email
  return c.json({ ok: true })
})
app.get('/api/auth/verify', async (c) => {
  // hash token, KV lookup, delete token, create session, set cookie
  return c.redirect('/admin/dashboard')
})
app.post('/api/auth/logout', async (c) => {
  // delete session from KV, clear cookie
  return c.redirect('/login')
})

// Media upload
app.post('/api/media/upload', async (c) => {
  // validate file, put to R2, return public URL
  return c.json({ url: '' })
})

// 2. TanStack Start — fallback for everything else, must be last
app.all('*', async (c) => startHandler.fetch(c.req.raw))

export default app
```

You'll also need `hono` installed in `panel/` — it isn't a dependency of
the vanilla scaffold:

```bash
cd apps/citadel/workers/panel && pnpm add hono
```

`wrangler.jsonc` already points at `./app/server.ts` from Step 11.

Test the public routes are reachable unauthenticated:

```bash
curl http://localhost:3000/api/ping
# {"db":{"ok":1},"kv":"pong","worker":"panel"}
curl -X POST http://localhost:3000/api/form/test
# should return { ok: true } — not a 404 or redirect
```

Full investigation (the wrong `main` value the scaffold doesn't actually
produce, the missing `hono` dependency, and the `RequestHandler` signature
mismatch) in [DECISIONS.md](./DECISIONS.md).

Public Hono route reachable = **Hono public API confirmed**.

### Step 18 — POC 3: Web Crypto + auth middleware

Confirm Web Crypto works in the Worker runtime (critical — no Node.js crypto):

```typescript
// add to apps/citadel/workers/panel/app/server.ts temporarily
app.get('/api/crypto-test', async (c) => {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')

  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode('test-secret'),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('data'))
  const sigHex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')

  return c.json({ token: hex, hmac: sigHex })
})
```

Visit `/api/crypto-test` — both values non-empty hex strings.

**Confirmed end-to-end during Phase 0 (2026-06-19): use a route `beforeLoad`
guard, not `createMiddleware`.** `createMiddleware()` with no options
defaults to **function** middleware (for wrapping individual server
functions) — not **request** middleware (for guarding whole routes).
Request middleware also requires global registration via `createStart()`,
which is more machinery than this needs. TanStack Router's standard
pattern — `beforeLoad` on a layout route — is simpler, stable, and is what
actually got tested. Full root cause and the registration mechanics we
ruled out are in [DECISIONS.md](./DECISIONS.md).

The auth check itself must be wrapped in a `createServerFn`, not a plain
function — `getCookie()` (from `@tanstack/solid-start/server`) is
server-only and throws if `beforeLoad` happens to run client-side during
SPA navigation; wrapping it in a server function guarantees it always
executes server-side via RPC regardless of where `beforeLoad` runs:

```typescript
// apps/citadel/workers/panel/app/middleware.ts
import { createServerFn } from '@tanstack/solid-start'
import { getCookie } from '@tanstack/solid-start/server'

export const requireAuth = createServerFn({ method: 'GET' }).handler(async () => {
  const cookieValue = getCookie('citadel_session')
  if (!cookieValue) return null

  const [sessionId, sig] = cookieValue.split('.')
  if (!sessionId || !sig) return null

  const { env } = await import('cloudflare:workers')

  // Web Crypto HMAC verify — no Node.js crypto
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(env.SESSION_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
  )
  const sigBytes = Uint8Array.from(atob(sig), (c) => c.charCodeAt(0))
  const valid = await crypto.subtle.verify(
    'HMAC', key, sigBytes, new TextEncoder().encode(sessionId)
  )
  if (!valid) return null

  // Sessions live in the KV binding (env.KV), not SESSION — that
  // namespace is Astro's own unrelated framework-level sessions feature.
  const session = await env.KV.get(`session:${sessionId}`)
  if (!session) return null

  return JSON.parse(session) as { email: string }
})
```

Guard `/admin/*` with a layout route at `src/routes/admin/route.tsx`:

```typescript
// apps/citadel/workers/panel/src/routes/admin/route.tsx
import { createFileRoute, Outlet, redirect } from '@tanstack/solid-router'
import { requireAuth } from '../../../app/middleware'

export const Route = createFileRoute('/admin')({
  beforeLoad: async () => {
    const user = await requireAuth()
    if (!user) throw redirect({ to: '/login' })
    return { user }
  },
  component: () => <Outlet />,
})
```

You'll also need a `/login` placeholder route for the redirect target —
`src/routes/login.tsx` with any placeholder component — and to run
`pnpm run generate-routes` after adding both files.

**Verified end-to-end:** `curl /admin/pages` with no cookie returns `307`
to `/login`. Created a real session — `wrangler kv key put
"session:<id>" '{"email":"..."}' --binding KV --local` plus a cookie value
of `<sessionId>.<base64 HMAC signature>` signed with the same
`SESSION_SECRET` from `.dev.vars` — and confirmed `/admin/pages` returns
`200` with the authenticated user correctly threaded through the
`beforeLoad` context (visible in the embedded route match data).

---

## Part 3 — Shared data layer (Drizzle + D1)

These files live in `core/` — imported by both Workers.

### Step 19 — Install Drizzle

**Install `drizzle-orm` at the repo root, not just in each Worker.**
Confirmed during Phase 0 (2026-06-19): `apps/citadel/core/` is not itself a
workspace package — when Vite resolves a bare import like `drizzle-orm/d1`
from a file there, it walks up the directory tree looking for
`node_modules`, and lands on the **root** `node_modules`, not either
Worker's. Installing `drizzle-orm` only inside `workers/site/` or
`workers/panel/` produces `Rollup failed to resolve import "drizzle-orm/d1"`
at build time even though the package is clearly installed (just not
where resolution actually looks for it). Full repro in
[DECISIONS.md](./DECISIONS.md).

```bash
pnpm add drizzle-orm -w
pnpm add -D drizzle-kit
```

`drizzle-kit` (used only via CLI commands, never imported from `core/`)
is fine as a regular root devDependency — only the runtime import
(`drizzle-orm/d1`, imported from `core/lib/db.ts`) needs the root-level
placement.

### Step 20 — Schema and db helper

```typescript
// apps/citadel/core/db/schema.ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const pages = sqliteTable('pages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  slug: text('slug').notNull().unique(),
  status: text('status', { enum: ['draft', 'published'] }).notNull().default('draft'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
})

// Phase 0 only needs a minimal schema for POC validation.
// The full site_settings table (added in Phase 2) includes domain fields
// that Section 2's Orchestrator populates:
//   primaryDomain, domainProvider, nameserverDelegated,
//   domainRegisteredViaCitadel, cfAccountId, cfApiTokenScoped
// These are nullable/false by default in Section 1 — never treat them
// as errors if unset. See DECISIONS.md for the full domain onboarding strategy.
```

```typescript
// apps/citadel/core/lib/db.ts
import { drizzle } from 'drizzle-orm/d1'
import * as schema from '../db/schema'

export function db(d1: D1Database) {
  return drizzle(d1, { schema })
}
```

```typescript
// drizzle.config.ts (repo root)
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './apps/citadel/core/db/schema.ts',
  out: './apps/citadel/core/db/migrations',
  dialect: 'sqlite',
  driver: 'd1-http',
})
```

Configure `@core/*` path alias in **both** Workers' `tsconfig.json`
(`paths` already has entries for `#/*`/`@/*` in the TanStack Start
scaffold — add `@core/*` alongside them, don't replace the object):

```json
{
  "compilerOptions": {
    "paths": {
      "@core/*": ["../../core/*"]
    }
  }
}
```

Add `migrations_dir` to **one** Worker's `wrangler.jsonc` (the
`d1_databases` binding) — `wrangler d1 migrations` defaults to a
`migrations/` folder relative to the wrangler config's own directory, not
Drizzle's actual output location:

```jsonc
// apps/citadel/workers/site/wrangler.jsonc
"d1_databases": [{
  "binding": "DB",
  "database_name": "citadel-db",
  "database_id": "...",
  "migrations_dir": "../../core/db/migrations"
}]
```

**Confirmed during Phase 0 (2026-06-19): `wrangler dev`'s local D1
persistence is scoped to its own working directory by default.** Running
`dev:site` and `dev:panel` from their own folders gives each one a
*separate* local D1 emulation — sharing the same `database_id` in
`wrangler.jsonc` does **not** make them share local data. They only share
data with an explicit, identical `--persist-to` path. Update the root
`package.json` scripts:

```json
"dev:site":  "cd apps/citadel/workers/site && wrangler dev --port 3000 --persist-to ../../../../.wrangler/state",
"dev:panel": "cd apps/citadel/workers/panel && wrangler dev --port 3001 --persist-to ../../../../.wrangler/state",
"db:migrate": "wrangler d1 migrations apply citadel-db --local --config apps/citadel/workers/site/wrangler.jsonc --persist-to ./.wrangler/state",
"db:migrate:prod": "wrangler d1 migrations apply citadel-db --remote --config apps/citadel/workers/site/wrangler.jsonc"
```

`db:migrate` also needed `--config` added — it has no wrangler config of
its own to read at the repo root, so it has nothing to tell it which D1
database (or migrations folder) to target without one.

```bash
pnpm db:generate    # creates apps/citadel/core/db/migrations/
pnpm db:migrate     # applies to local D1 in the shared --persist-to path
pnpm db:studio      # verify tables in Drizzle Studio
```

**Verified end-to-end:** inserted a row into `pages` via `wrangler d1
execute` against the shared `--persist-to` path, then confirmed it was
visible from a query inside Panel's own `wrangler dev` instance — proof
the two Workers genuinely share local D1 data, not just the same
`database_id` value.

---

## Part 4 — Cache helper and dev commands

### Step 21 — Cache dev bypass (POC 4)

**Correction, confirmed during Phase 0 (2026-06-19): `caches.default` is
actually available under `wrangler dev` in current wrangler/workerd
versions** (`wrangler@4.101.0` / `workerd@1.20260616.1`) — contradicting
the assumption below this paragraph and the original G4 gotcha. Verified
directly: `typeof caches !== 'undefined'` and `typeof caches.default !==
'undefined'` both `true` against a real built Worker under `wrangler dev`.
Keep the dev-bypass branch anyway as defensive code (cheap insurance for
older wrangler versions or other runtimes like `vitest-pool-workers`), but
don't rely on it actually triggering — confirm with a direct check before
assuming "no console log" means something's broken.

This helper goes in `apps/citadel/core/lib/cache.ts` and is imported by
both Workers:

```typescript
// apps/citadel/core/lib/cache.ts
const isDev = typeof caches === 'undefined' || typeof caches.default === 'undefined'

export async function purgeCache(url: string): Promise<void> {
  if (isDev) {
    console.log(`[cache] DEV — skipping purge: ${url}`)
    return
  }
  try {
    await caches.default.delete(new Request(url))
  } catch (err) {
    console.warn('[cache] Purge failed:', err)
  }
}
```

Never call `caches.default` directly anywhere in the codebase.

**Verified:** added `POST /api/cache/purge` (Hono route calling
`purgeCache`) and `GET /api/cache/check` (returns
`{ cachesDefined, cacheDefaultDefined }`) to `app.ts`. Purge completed in
4ms — well under the 500ms pass criterion — with no thrown error,
confirming the real `caches.default.delete()` path executes (not the dev
bypass) against a built Worker under `wrangler dev`.

**Not yet built:** the actual cache-aside read path. Setting
`Cache-Control` on an Astro page's response does **not** by itself
populate the Workers Cache API for a custom Worker fetch handler —
"served from cache on second request, fresh after purge" requires
explicit `caches.default.match()`/`.put()` calls in the request path,
which don't exist anywhere yet. That's a real feature to build (most
naturally as Hono middleware wrapping the SSR fallback), not something
covered by `purgeCache()` alone.

### Step 22 — Dev commands (repo root package.json)

Install concurrently at the root:

```bash
pnpm add -D concurrently
```

```json
// package.json (repo root)
{
  "scripts": {
    "dev:site":       "cd apps/citadel/workers/site && wrangler dev --port 3000",
    "dev:panel":      "cd apps/citadel/workers/panel && wrangler dev --port 3001",
    "dev":            "concurrently \"pnpm dev:site\" \"pnpm dev:panel\"",
    "build:site":     "cd apps/citadel/workers/site && astro build",
    "build:panel":    "cd apps/citadel/workers/panel && vite build",
    "build":          "pnpm build:site && pnpm build:panel",
    "deploy:site":    "cd apps/citadel/workers/site && wrangler deploy",
    "deploy:panel":   "cd apps/citadel/workers/panel && wrangler deploy",
    "deploy":         "pnpm build && pnpm deploy:site && pnpm deploy:panel",
    "db:generate":    "drizzle-kit generate",
    "db:migrate":     "wrangler d1 migrations apply citadel-db --local",
    "db:migrate:prod":"wrangler d1 migrations apply citadel-db --remote",
    "db:studio":      "drizzle-kit studio"
  }
}
```

`pnpm dev` starts both Workers. `pnpm dev:site` and `pnpm dev:panel` work
independently. Never run `wrangler dev` directly inside a Worker directory
as your primary workflow — always use root scripts.

---

## Project structure after Phase 0

```
citadel/
│
├── workers/
│   ├── site/                          Worker 1 — Astro public site
│   │   ├── wrangler.jsonc             bindings: DB, KV, R2
│   │   ├── astro.config.mjs           Cloudflare adapter (no entrypoint option)
│   │   ├── .dev.vars                  local secrets
│   │   ├── src/
│   │   │   ├── app.ts                 Hono entry — custom routes → handle()
│   │   │   ├── env.d.ts               Env + App.Locals types
│   │   │   ├── pages/                 .astro pages
│   │   │   ├── layouts/
│   │   │   └── assets/app.css         @import tailwindcss; @plugin "daisyui"
│   │   └── public/
│   │       └── themes/                DaisyUI custom theme CSS files
│   │
│   └── panel/                         Worker 2 — TanStack Start Panel
│       ├── wrangler.jsonc             same binding IDs as site
│       ├── vite.config.ts             @cloudflare/vite-plugin + tanstackStart()
│       ├── .dev.vars                  local secrets
│       └── app/
│           ├── server.ts              custom entrypoint: TanStack Start + Hono public API
│           ├── router.tsx             TanStack Router instance
│           ├── middleware.ts          auth guard on /admin/* routes
│           ├── env.d.ts               Env types
│           ├── routes/
│           │   ├── __root.tsx         root layout, imports panel.css
│           │   ├── admin/             Panel routes (all prerender = false)
│           │   └── login.tsx          login page
│           ├── server-functions/      getPages, savePage, getContacts, etc.
│           ├── components/            Panel Solid components
│           └── styles/
│               └── panel.css          @import tailwindcss; @plugin "daisyui"
│
├── core/                              shared — imported by both Workers
│   ├── db/
│   │   ├── schema.ts                  Drizzle schema (single source of truth)
│   │   └── migrations/                applied once, both Workers see the result
│   └── lib/
│       ├── db.ts                      db(d1) helper
│       ├── cache.ts                   CF Cache API + dev bypass
│       ├── auth.ts                    token generation, HMAC sign/verify (Web Crypto)
│       ├── session.ts                 KV session read/write/delete
│       ├── rate-limit.ts              KV rate limiter
│       ├── notify.ts                  CF Email Workers helper
│       ├── upsert-contact.ts          contact dedup logic
│       ├── blocks.ts                  Block type definitions + validators
│       ├── forms.ts                   FormField type definitions + validators
│       ├── image-service.ts           ImageService interface + R2 impl
│       ├── color-scale.ts             OKLCH brand color scale generator
│       ├── contrast.ts                WCAG AA contrast checker
│       ├── font-pairing.ts            font pairing configs
│       ├── design-system/             token resolution helpers
│       └── export.ts                  zip export via fflate
│
├── custom/                            operator territory — never overwritten
│   ├── components/site/
│   ├── components/panel/
│   ├── blocks/
│   ├── themes/
│   └── seed/
│
├── drizzle.config.ts                  points at apps/citadel/core/db/schema.ts
├── biome.json                         linter + formatter (all dirs)
├── package.json                       root scripts: dev, build, deploy, db:*
├── citadel.config.ts                   operator config — never overwritten
├── DECISIONS.md
└── .github/
    └── workflows/
        ├── ci.yml
        └── update.yml
```

---

## POC checklist

**Worker 1 (Astro public site):**
- [ ] **POC 1a** — `/api/ping` returns D1 + KV data from Hono route
- [ ] **POC 1a** — Astro page reads D1 via `env.DB` (from 'cloudflare:workers')
- [ ] **POC 2** — `/token-test` shows correct OKLCH override, no FOUC, correct with JS disabled
- [ ] **DaisyUI** — DaisyUI classes render correctly in Astro pages

**Worker 2 (TanStack Start Panel):**
- [ ] **POC 1b** — Server function reads D1 via `env.DB` (from a dynamic 'cloudflare:workers' import)
- [ ] **POC 1b** — Drizzle server function return type inferred — no `any` in Panel components
- [ ] **POC 3** — `beforeLoad` guard on `/admin` redirects unauthenticated requests to `/login` (307)
- [ ] **POC 3** — Valid signed session cookie + KV session passes the guard, user available in route context
- [ ] **POC 3** — Web Crypto returns valid hex token and HMAC — no Node.js crypto
- [ ] **POC 4** — `caches.default` confirmed available via `/api/cache/check`; purge via `/api/cache/purge` completes under 500ms
- [ ] **Hono API** — `POST /api/form/test` returns 200 unauthenticated
- [ ] **DaisyUI** — DaisyUI classes render correctly in TanStack Start components
- [ ] **prerender** — `export const prerender = false` on all Panel routes

**Shared:**
- [ ] **Same D1** — Both Workers read/write the same rows (same `database_id`)
- [ ] **Shared schema** — `apps/citadel/core/db/schema.ts` imports without errors in both Workers
- [ ] **Dev commands** — `pnpm dev:site` and `pnpm dev:panel` work independently
- [ ] **Dev commands** — `pnpm dev` starts both Workers from repo root

---

## Common errors

**Worker 1 — Astro:**

**`Error: FetchState(request) called on a request without an attached app`**
You're using `astro/hono`'s `middleware()`/`pages()` or `cf()` from
`@astrojs/cloudflare/hono`. That's the experimental Advanced Routing
pattern from Astro's 6.3 blog post — confirmed broken for custom Cloudflare
entrypoints (reproduces with zero custom code, in both `astro dev` and a
built `wrangler dev`). Switch to `handle()` from
`@astrojs/cloudflare/handler` per Step 3. Full root cause in
[DECISIONS.md](./DECISIONS.md).

**`Astro.locals.runtime.env has been removed in Astro v6`**
You're using the pre-v6 binding-access pattern. Use
`import { env } from 'cloudflare:workers'` instead — it's a top-level
import, not an `Astro.locals` property. Confirmed during Phase 0
(2026-06-19); see [DECISIONS.md](./DECISIONS.md).

**Bindings unavailable / `handle()` request fails**
Confirm `src/app.ts`'s catch-all route calls `handle(c.req.raw, c.env,
c.executionCtx)` and that it's registered last, after your custom routes.

**DaisyUI classes not applying**
Remove any `tailwind.config.js` or PostCSS config. Use only
`@plugin "daisyui"` in your CSS file. The `@tailwindcss/vite` plugin handles everything.

---

**Worker 2 — TanStack Start:**

**`getCloudflareContext is not a function` / module not found**
`@tanstack/solid-start/cloudflare` and `getCloudflareContext()` don't exist
in this version (`@tanstack/solid-start@1.168.26` has no `./cloudflare`
export at all) — confirmed during Phase 0 (2026-06-19). Use
`const { env } = await import('cloudflare:workers')` inside the handler
instead. Never call it in client component code. See
[DECISIONS.md](./DECISIONS.md).

**Server function return type is `any`**
The Drizzle query must use `.all()` or `.get()`, not `.run()`.
Also confirm the `@core/*` path alias resolves correctly in `tsconfig.json`.

**`prerendering failed` — bindings unavailable**
Add `export const prerender = false` to every Panel route that uses
server functions. Panel routes are always dynamic — none should prerender.

**`D1_ERROR: no such table` / `Failed query: select ... from "pages"`**
Run `pnpm db:migrate` from the repo root. If it fails with "No
configuration file found" or "No migrations present," `db:migrate` needs
`--config` (pointing at a Worker's `wrangler.jsonc`) and that config needs
`migrations_dir` pointing at Drizzle's actual output
(`apps/citadel/core/db/migrations`), not the default `./migrations`
relative to the Worker's own folder.

If migrations applied cleanly but you still get this error from one Worker
and not the other: `dev:site`/`dev:panel` (and `db:migrate`) all need the
**same** `--persist-to` path. Sharing a `database_id` in `wrangler.jsonc`
does not make two `wrangler dev` instances share local D1 data — each
defaults to its own working directory's local state unless told otherwise.
See [DECISIONS.md](./DECISIONS.md) for the full repro (confirmed by
inserting a row from one Worker and reading it back from the other).

**DaisyUI classes not applying**
Confirm `tailwindcss()` is in `vite.config.ts` plugins and
`@plugin "daisyui"` is in your CSS file imported from `__root.tsx`.

**`caches is not defined`**
You called `caches.default` directly. Always use `apps/citadel/core/lib/cache.ts`.

**Custom entrypoint not picked up**
`wrangler.jsonc` must have `"main": "./app/server.ts"` — not
`@tanstack/solid-start/server-entry`, which is the framework's own default
entry and bypasses your custom Hono routes entirely.

---

## Next steps

When all POC items are checked and `DECISIONS.md` updated:

1. Expand `apps/citadel/core/db/schema.ts` to the full Section 1 schema (Phase 2) — including the domain fields on `site_settings` (`primaryDomain`, `domainProvider`, `nameserverDelegated`, `domainRegisteredViaCitadel`, `cfAccountId`, `cfApiTokenScoped`). These are nullable/default-false in Section 1 and populated by the Orchestrator in Section 2. See DECISIONS.md for the full domain onboarding strategy.
2. Expand `apps/citadel/core/lib/` with all shared utilities
3. Set up Biome at repo root: `pnpm add -D @biomejs/biome && pnpm biome init`
4. Add boundary rule preventing `core/` from importing `custom/`
5. Add `.github/workflows/ci.yml` and `update.yml`
6. Begin Phase 1

**workers.dev URL:** Do not restrict or remove access to the `*.workers.dev`
URL in production. This is the preview URL that Section 2's zero-downtime
cutover flow depends on — clients with an existing live site need to review
their Citadel deployment at the preview URL before their nameserver flip.

**TanStack DB:** Do not add in Phase 0 or Section 1. The value compounds
with relational complexity and team collaboration — both arrive in Section 2.

---

*Phase 0 complete = stack validated = ready to build.*
