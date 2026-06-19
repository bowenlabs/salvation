# Getting Started
## Salvation — Cadmus Framework + Krypto Reference App
## Astro + TanStack Start + Cloudflare Workers

> This guide walks you through Phase 0 — validating the two-Worker VMFE
> stack and the Cadmus framework primitives before committing to Phase 1.
> By the end you will have both Workers running locally, D1/KV/R2 bindings
> confirmed in each, DaisyUI working on both, server functions typed
> end-to-end from Drizzle, the Hono public API verified, and the core
> Cadmus primitive structure in place.
>
> **Monorepo:** `salvation/` contains `packages/cadmus/` (the framework)
> and `apps/krypto/` (the reference app). Worker 1 is Astro (public site).
> Worker 2 is TanStack Start (Panel). Both Workers share the same D1, KV,
> and R2 binding IDs. Hono lives inside Worker 2's custom server entrypoint.
> All shared primitives live in `@bowenlabs/cadmus` — imported by both Workers.

---

## Reference implementations

Study these before building — they show confirmed working patterns:

| Resource | What it shows |
|---|---|
| [Cloudflare Astro guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/astro/) | Official Cloudflare Astro on Workers — scaffold + bindings |
| [Astro 6.4 blog post](https://astro.build/blog/astro-640/) | Hono + Astro native integration — the `cf()` helper |
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
│   apps/krypto/workers/site/
│   ├── Hono entrypoint — cf(), middleware(), pages()
│   ├── Astro SSR pages — bindings via Astro.locals.runtime.env
│   └── Serves: /, /[slug], /about, /contact, /coming-soon
│
└── Worker 2: TanStack Start Panel ←─────────────┘
    apps/krypto/workers/panel/
    ├── Custom server entrypoint (app/server.ts)
    │   └── Hono — /api/form/:slug, /api/auth/*, /api/media/upload
    ├── TanStack Start — all /admin/* routes
    │   ├── Server functions via getCloudflareContext().env.DB
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
mkdir -p apps/krypto/workers/site
cd apps/krypto/workers/site
pnpm create cloudflare@latest . --framework=astro
```

When prompted: TypeScript yes, Git yes, Deploy now no.

### Step 2 — Install Hono

Hono lives in Worker 1 as the entry point — it wires Cloudflare bindings
into Astro via the official `cf()` helper introduced in Astro 6.4.

```bash
pnpm add hono
```

### Step 3 — Wire Hono into Astro (Astro 6.4 native pattern)

`@astrojs/cloudflare/hono` ships a `cf()` middleware that handles all
Cloudflare wiring. This is the correct pattern — not the older catch-all
API route approach from pre-6.4 tutorials.

Create `apps/krypto/workers/site/src/app.ts`:

```typescript
// apps/krypto/workers/site/src/app.ts
import { Hono } from 'hono'
import { middleware, pages } from 'astro/hono'
import { cf } from '@astrojs/cloudflare/hono'

const app = new Hono<{ Bindings: Env }>()

// 1. Cloudflare wiring — bindings injection, ASSETS, client address
app.use(cf())

// 2. Astro middleware
app.use(middleware())

// 3. Astro SSR — must be last
app.use(pages())

export default app
```

Update `apps/krypto/workers/site/astro.config.mjs`:

```javascript
import { defineConfig } from 'astro/config'
import cloudflare from '@astrojs/cloudflare'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  adapter: cloudflare({
    entrypoint: './src/app.ts',
  }),
  output: 'server',
  vite: {
    plugins: [tailwindcss()],
  },
})
```

### Step 4 — Install DaisyUI for Astro

DaisyUI v5 uses Tailwind v4 as a Vite plugin, not PostCSS:

```bash
pnpm add tailwindcss @tailwindcss/vite daisyui
```

Create `apps/krypto/workers/site/src/assets/app.css`:

```css
@import "tailwindcss";
@plugin "daisyui";
```

Import in your layout:

```astro
---
// apps/krypto/workers/site/src/layouts/Layout.astro
import "../assets/app.css"
---
```

No `tailwind.config.js`. No PostCSS. The `@tailwindcss/vite` plugin handles everything.

### Step 5 — Configure Worker 1 wrangler.jsonc

```jsonc
// apps/krypto/workers/site/wrangler.jsonc
{
  "name": "krypto-site",
  "main": "./dist/_worker.js/index.js",
  "compatibility_date": "2026-06-17",
  "compatibility_flags": ["nodejs_compat"],
  "assets": {
    "binding": "ASSETS",
    "directory": "./dist"
  },
  "observability": { "enabled": true },
  "d1_databases": [{
    "binding": "DB",
    "database_name": "krypto-db",
    "database_id": "placeholder"    // replace after: wrangler d1 create krypto-db
  }],
  "kv_namespaces": [{
    "binding": "KV",
    "id": "placeholder"             // replace after: wrangler kv namespace create KV
  }],
  "r2_buckets": [{
    "binding": "R2",
    "bucket_name": "krypto-media"
  }]
}
```

Create bindings (run once — IDs go into both Workers):

```bash
wrangler d1 create krypto-db          # copy database_id
wrangler kv namespace create KV       # copy id
wrangler r2 bucket create krypto-media
```

### Step 6 — TypeScript types for Worker 1

Create `apps/krypto/workers/site/src/env.d.ts`:

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
# apps/krypto/workers/site/.dev.vars — never commit
SESSION_SECRET=dev-secret-change-in-production
OWNER_EMAIL=you@yourdomain.com
MEDIA_URL=http://localhost:3001/media
```

### Step 8 — POC 1a: verify bindings in Astro

Add a test route to `apps/krypto/workers/site/src/app.ts`:

```typescript
app.get('/api/ping', async (c) => {
  const result = await c.env.DB.prepare('SELECT 1 as ok').first()
  await c.env.KV.put('ping', 'pong')
  const kv = await c.env.KV.get('ping')
  return c.json({ db: result, kv, worker: 'site' })
})
```

And confirm bindings work from an Astro page:

```astro
---
// apps/krypto/workers/site/src/pages/test.astro
const { env } = Astro.locals.runtime
const result = await env.DB.prepare('SELECT 1 as ok').first()
---
<p>D1 from Astro: {JSON.stringify(result)}</p>
```

```bash
cd apps/krypto/workers/site && pnpm dev    # starts on :3000
```

Visit `http://localhost:3000/api/ping` — both `db` and `kv` populated = **POC 1a complete**.

### Step 9 — POC 2: design token injection

```css
/* apps/krypto/workers/site/public/themes/theme-test.css */
:root[data-theme="test"] {
  --p: oklch(62% 0.18 145);
  --pc: oklch(100% 0 0);
}
```

```astro
---
// apps/krypto/workers/site/src/pages/token-test.astro
const tokenStyle = `:root[data-theme="test"] { --p: oklch(42% 0.12 145); }`
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

---

## Part 2 — Worker 2: TanStack Start Panel

### Step 10 — Scaffold TanStack Start Worker

```bash
cd ../..   # back to repo root
mkdir -p apps/krypto/workers/panel
cd apps/krypto/workers/panel
pnpm create cloudflare@latest . --framework=tanstack-start
```

### Step 11 — Configure Worker 2 wrangler.jsonc

Use the **same binding IDs** as Worker 1 — same D1, same KV, same R2:

```jsonc
// apps/krypto/workers/panel/wrangler.jsonc
{
  "name": "krypto-panel",
  "compatibility_date": "2026-06-17",
  "compatibility_flags": ["nodejs_compat"],
  "main": "app/server.ts",
  "observability": { "enabled": true },
  "d1_databases": [{
    "binding": "DB",
    "database_name": "krypto-db",
    "database_id": "same-id-as-site-worker"    // copy from apps/krypto/workers/site/wrangler.jsonc
  }],
  "kv_namespaces": [{
    "binding": "KV",
    "id": "same-id-as-site-worker"             // copy from apps/krypto/workers/site/wrangler.jsonc
  }],
  "r2_buckets": [{
    "binding": "R2",
    "bucket_name": "krypto-media"
  }]
}
```

### Step 12 — Install DaisyUI for TanStack Start

```bash
pnpm add tailwindcss @tailwindcss/vite daisyui
```

Update `apps/krypto/workers/panel/vite.config.ts`:

```typescript
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tanstackStart(),
    tailwindcss(),
  ],
})
```

Create `apps/krypto/workers/panel/app/styles/panel.css`:

```css
@import "tailwindcss";
@plugin "daisyui";
```

Import in the root route:

```typescript
// apps/krypto/workers/panel/app/routes/__root.tsx
import '../styles/panel.css'
```

### Step 13 — TypeScript types for Worker 2

```typescript
// apps/krypto/workers/panel/app/env.d.ts
interface Env {
  DB: D1Database
  KV: KVNamespace
  R2: R2Bucket
  SESSION_SECRET: string
  OWNER_EMAIL: string
  MEDIA_URL: string
}
```

Or auto-generate from `wrangler.jsonc`:

```bash
pnpm wrangler types    # generates worker-configuration.d.ts
```

### Step 14 — Local secrets

```bash
# apps/krypto/workers/panel/.dev.vars — never commit
SESSION_SECRET=dev-secret-change-in-production
OWNER_EMAIL=you@yourdomain.com
MEDIA_URL=http://localhost:3001/media
```

### Step 15 — POC 1b: verify D1 in a server function

Server functions use `getCloudflareContext()` — never call this in
client-side component code.

```typescript
// apps/krypto/workers/panel/app/server-functions/test.ts
import { createServerFn } from '@tanstack/react-start/server'
import { getCloudflareContext } from '@tanstack/react-start/cloudflare'

export const testBindings = createServerFn({ method: 'GET' })
  .handler(async () => {
    const { env } = getCloudflareContext()
    const db = await env.DB.prepare('SELECT 1 as ok').first()
    await env.KV.put('ping', 'pong')
    const kv = await env.KV.get('ping')
    return { db, kv, worker: 'panel' }
  })
```

Use in a test route:

```typescript
// apps/krypto/workers/panel/app/routes/test.tsx
import { createFileRoute } from '@tanstack/react-router'
import { testBindings } from '../server-functions/test'

export const Route = createFileRoute('/test')({
  loader: () => testBindings(),
  component: () => {
    const data = Route.useLoaderData()
    return <pre>{JSON.stringify(data, null, 2)}</pre>
  },
})
```

```bash
cd apps/krypto/workers/panel && pnpm dev    # starts on :3001
```

Visit `http://localhost:3001/test` — `db` and `kv` populated = **POC 1b complete**.

### Step 16 — POC 1b continued: Drizzle in a server function

This is the core type-safety test. The return type must be inferred from
Drizzle — no `any` anywhere.

```typescript
// apps/krypto/workers/panel/app/server-functions/pages.ts
import { createServerFn } from '@tanstack/react-start/server'
import { getCloudflareContext } from '@tanstack/react-start/cloudflare'
import { db } from '@apps/krypto/core/lib/db'
import { pages } from '@apps/krypto/core/db/schema'

export const getPages = createServerFn({ method: 'GET' })
  .handler(async () => {
    const { env } = getCloudflareContext()
    return db(env.DB).select().from(pages).all()
    // hover over the return type — must be InferSelectModel<typeof pages>[]
    // if it shows any[], the Drizzle schema import is broken
  })
```

Use with TanStack Query in a Panel route:

```typescript
// apps/krypto/workers/panel/app/routes/admin/pages/index.tsx
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { getPages } from '../../../server-functions/pages'

export const Route = createFileRoute('/admin/pages/')({
  component: PagesPage,
})

function PagesPage() {
  const { data: pages, isLoading } = useQuery({
    queryKey: ['pages'],
    queryFn: () => getPages(),
    // pages type inferred from Drizzle schema — no manual typing
  })

  if (isLoading) return <div className="loading loading-spinner" />
  return <pre>{JSON.stringify(pages, null, 2)}</pre>
}
```

Hover over `pages` in your editor — must show the Drizzle inferred type.
No `any` = **Drizzle server function typing confirmed**.

### Step 17 — Hono public API (custom server entrypoint)

Public API endpoints (form submission, auth, media) are unauthenticated
and can't use TanStack Start server functions. They need a Hono handler
in a custom server entrypoint that wraps TanStack Start.

Create `apps/krypto/workers/panel/app/server.ts`:

```typescript
// apps/krypto/workers/panel/app/server.ts
import handler from '@tanstack/react-start/server-entry'
import { Hono } from 'hono'

const api = new Hono<{ Bindings: Env }>()

// Public form submission — unauthenticated
api.post('/api/form/:slug', async (c) => {
  // rate limit, honeypot check, validate, insert submission
  return c.json({ ok: true })
})

// Auth endpoints — called by Astro login page
api.post('/api/auth/magic-link', async (c) => {
  // rate limit, lookup user, generate token, store in KV, send email
  return c.json({ ok: true })
})
api.get('/api/auth/verify', async (c) => {
  // hash token, KV lookup, delete token, create session, set cookie
  return c.redirect('/admin/dashboard')
})
api.post('/api/auth/logout', async (c) => {
  // delete session from KV, clear cookie
  return c.redirect('/login')
})

// Media upload
api.post('/api/media/upload', async (c) => {
  // validate file, put to R2, return public URL
  return c.json({ url: '' })
})

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url)
    if (url.pathname.startsWith('/api/')) {
      return api.fetch(request, env, ctx)
    }
    return handler.fetch(request, env, ctx)
  }
}
```

`wrangler.jsonc` already points at `app/server.ts` from Step 11.

Test the public route is reachable unauthenticated:

```bash
curl -X POST http://localhost:3001/api/form/test
# should return { ok: true } — not a 404 or redirect
```

Public Hono route reachable = **Hono public API confirmed**.

### Step 18 — POC 3: Web Crypto + auth middleware

Confirm Web Crypto works in the Worker runtime (critical — no Node.js crypto):

```typescript
// add to apps/krypto/workers/panel/app/server.ts temporarily
api.get('/api/crypto-test', async (c) => {
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

Add auth middleware to TanStack Start routes:

```typescript
// apps/krypto/workers/panel/app/middleware.ts
import { createMiddleware } from '@tanstack/react-start/middleware'
import { getCloudflareContext } from '@tanstack/react-start/cloudflare'
import { redirect } from '@tanstack/react-router'

export default createMiddleware().server(async ({ next, context }) => {
  const cookie = context.request.headers.get('cookie') ?? ''
  const match = cookie.match(/krypto_session=([^;]+)/)

  if (!match) throw redirect({ to: '/login' })

  const [sessionId, sig] = match[1].split('.')
  const { env } = getCloudflareContext()

  // Web Crypto HMAC verify — no Node.js crypto
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(env.SESSION_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
  )
  const sigBytes = Uint8Array.from(atob(sig), c => c.charCodeAt(0))
  const valid = await crypto.subtle.verify(
    'HMAC', key, sigBytes, new TextEncoder().encode(sessionId)
  )
  if (!valid) throw redirect({ to: '/login' })

  const session = await env.KV.get(`session:${sessionId}`)
  if (!session) throw redirect({ to: '/login' })

  return next({ context: { user: JSON.parse(session) } })
})
```

Visit `/admin/dashboard` without a cookie — must redirect to `/login`.
Web Crypto returns valid values + redirect working = **POC 3 complete**.

---

## Part 3 — Shared data layer (Drizzle + D1)

These files live in `core/` — imported by both Workers.

### Step 19 — Install Drizzle

From the repo root:

```bash
pnpm add drizzle-orm
pnpm add -D drizzle-kit
```

### Step 20 — Schema and db helper

```typescript
// apps/krypto/core/db/schema.ts
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
//   domainRegisteredViaKrypto, cfAccountId, cfApiTokenScoped
// These are nullable/false by default in Section 1 — never treat them
// as errors if unset. See DECISIONS.md for the full domain onboarding strategy.
```

```typescript
// apps/krypto/core/lib/db.ts
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
  schema: './apps/krypto/core/db/schema.ts',
  out: './apps/krypto/core/db/migrations',
  dialect: 'sqlite',
  driver: 'd1-http',
})
```

Configure `@core/*` path alias in both Workers' `tsconfig.json`:

```json
{
  "compilerOptions": {
    "paths": {
      "@core/*": ["../../core/*"]
    }
  }
}
```

```bash
pnpm db:generate    # creates apps/krypto/core/db/migrations/
pnpm db:migrate     # applies to local D1 — both Workers see the change
pnpm db:studio      # verify tables in Drizzle Studio
```

---

## Part 4 — Cache helper and dev commands

### Step 21 — Cache dev bypass

`caches.default` is unavailable in `wrangler dev`. This helper goes in
`apps/krypto/core/lib/cache.ts` and is imported by both Workers:

```typescript
// apps/krypto/core/lib/cache.ts
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

### Step 22 — Dev commands (repo root package.json)

Install concurrently at the root:

```bash
pnpm add -D concurrently
```

```json
// package.json (repo root)
{
  "scripts": {
    "dev:site":       "cd apps/krypto/workers/site && wrangler dev --port 3000",
    "dev:panel":      "cd apps/krypto/workers/panel && wrangler dev --port 3001",
    "dev":            "concurrently \"pnpm dev:site\" \"pnpm dev:panel\"",
    "build:site":     "cd apps/krypto/workers/site && astro build",
    "build:panel":    "cd apps/krypto/workers/panel && vite build",
    "build":          "pnpm build:site && pnpm build:panel",
    "deploy:site":    "cd apps/krypto/workers/site && wrangler deploy",
    "deploy:panel":   "cd apps/krypto/workers/panel && wrangler deploy",
    "deploy":         "pnpm build && pnpm deploy:site && pnpm deploy:panel",
    "db:generate":    "drizzle-kit generate",
    "db:migrate":     "wrangler d1 migrations apply krypto-db --local",
    "db:migrate:prod":"wrangler d1 migrations apply krypto-db --remote",
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
krypto/
│
├── workers/
│   ├── site/                          Worker 1 — Astro public site
│   │   ├── wrangler.jsonc             bindings: DB, KV, R2
│   │   ├── astro.config.ts            Cloudflare adapter, entrypoint: src/app.ts
│   │   ├── .dev.vars                  local secrets
│   │   ├── src/
│   │   │   ├── app.ts                 Hono entry — cf(), middleware(), pages()
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
│           ├── components/            Panel React components
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
├── drizzle.config.ts                  points at apps/krypto/core/db/schema.ts
├── biome.json                         linter + formatter (all dirs)
├── package.json                       root scripts: dev, build, deploy, db:*
├── krypto.config.ts                   operator config — never overwritten
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
- [ ] **POC 1a** — Astro page reads D1 via `Astro.locals.runtime.env.DB`
- [ ] **POC 2** — `/token-test` shows correct OKLCH override, no FOUC, correct with JS disabled
- [ ] **DaisyUI** — DaisyUI classes render correctly in Astro pages

**Worker 2 (TanStack Start Panel):**
- [ ] **POC 1b** — Server function reads D1 via `getCloudflareContext().env.DB`
- [ ] **POC 1b** — Drizzle server function return type inferred — no `any` in Panel components
- [ ] **POC 3** — Auth middleware redirects unauthenticated `/admin/*` to `/login`
- [ ] **POC 3** — Web Crypto returns valid hex token and HMAC — no Node.js crypto
- [ ] **POC 4** — Cache dev bypass logs correctly in `wrangler dev`
- [ ] **Hono API** — `POST /api/form/test` returns 200 unauthenticated
- [ ] **DaisyUI** — DaisyUI classes render correctly in TanStack Start components
- [ ] **prerender** — `export const prerender = false` on all Panel routes

**Shared:**
- [ ] **Same D1** — Both Workers read/write the same rows (same `database_id`)
- [ ] **Shared schema** — `apps/krypto/core/db/schema.ts` imports without errors in both Workers
- [ ] **Dev commands** — `pnpm dev:site` and `pnpm dev:panel` work independently
- [ ] **Dev commands** — `pnpm dev` starts both Workers from repo root

---

## Common errors

**Worker 1 — Astro:**

**`cf() is not exported from @astrojs/cloudflare/hono`**
Astro is below 6.4. Run `pnpm upgrade astro --latest && pnpm upgrade @astrojs/cloudflare --latest`.

**`Astro.locals.runtime` is undefined**
`cf()` must be the first middleware in `src/app.ts` before `middleware()`.
Confirm `entrypoint: './src/app.ts'` is set in `astro.config.mjs`.

**DaisyUI classes not applying**
Remove any `tailwind.config.js` or PostCSS config. Use only
`@plugin "daisyui"` in your CSS file. The `@tailwindcss/vite` plugin handles everything.

---

**Worker 2 — TanStack Start:**

**`getCloudflareContext()` throws or returns undefined**
You called it outside a server function handler. It only works inside
`createServerFn().handler()`. Never call it in client component code.

**Server function return type is `any`**
The Drizzle query must use `.all()` or `.get()`, not `.run()`.
Also confirm the `@core/*` path alias resolves correctly in `tsconfig.json`.

**`prerendering failed` — bindings unavailable**
Add `export const prerender = false` to every Panel route that uses
server functions. Panel routes are always dynamic — none should prerender.

**`D1_ERROR: no such table`**
Run `pnpm db:migrate` from the repo root. Both Workers share the same D1
instance — migrate once from the root, not from inside a Worker directory.

**DaisyUI classes not applying**
Confirm `tailwindcss()` is in `vite.config.ts` plugins and
`@plugin "daisyui"` is in your CSS file imported from `__root.tsx`.

**`caches is not defined`**
You called `caches.default` directly. Always use `apps/krypto/core/lib/cache.ts`.

**Custom entrypoint not picked up**
`wrangler.jsonc` must have `"main": "app/server.ts"`.

---

## Next steps

When all POC items are checked and `DECISIONS.md` updated:

1. Expand `apps/krypto/core/db/schema.ts` to the full Section 1 schema (Phase 2) — including the domain fields on `site_settings` (`primaryDomain`, `domainProvider`, `nameserverDelegated`, `domainRegisteredViaKrypto`, `cfAccountId`, `cfApiTokenScoped`). These are nullable/default-false in Section 1 and populated by the Orchestrator in Section 2. See DECISIONS.md for the full domain onboarding strategy.
2. Expand `apps/krypto/core/lib/` with all shared utilities
3. Set up Biome at repo root: `pnpm add -D @biomejs/biome && pnpm biome init`
4. Add boundary rule preventing `core/` from importing `custom/`
5. Add `.github/workflows/ci.yml` and `update.yml`
6. Begin Phase 1

**workers.dev URL:** Do not restrict or remove access to the `*.workers.dev`
URL in production. This is the preview URL that Section 2's zero-downtime
cutover flow depends on — clients with an existing live site need to review
their Krypto deployment at the preview URL before their nameserver flip.

**TanStack DB:** Do not add in Phase 0 or Section 1. The value compounds
with relational complexity and team collaboration — both arrive in Section 2.

---

*Phase 0 complete = stack validated = ready to build.*
