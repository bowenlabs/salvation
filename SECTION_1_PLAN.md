# Thebes — Section 1 Plan

> **Goal:** A deployable, Cloudflare-native web operating system that lets a
> small business owner build pages, capture form submissions, manage contacts,
> and receive notifications — on infrastructure they own forever.
>
> **Definition of done:** An owner can deploy Citadel, build their site with a
> block editor, embed a form, receive a submission, get notified by email, and
> view the contact in their CRM — without writing a single line of code after
> the initial deploy.

---

## Table of contents

1. [Architecture overview (C4)](#1-architecture-overview-c4)
2. [Data flow diagrams](#2-data-flow-diagrams)
3. [Known gotchas and constraints](#3-known-gotchas-and-constraints)
4. [Core/custom folder structure](#4-corecustom-folder-structure)
5. [Update and maintenance model](#5-update-and-maintenance-model)
6. [Phase map](#6-phase-map)
7. [Phase 0 — Framework evaluation](#phase-0--framework-evaluation)
8. [Phase 1 — Project foundation](#phase-1--project-foundation)
9. [Phase 2 — Database and schema](#phase-2--database-and-schema)
10. [Phase 3 — Authentication](#phase-3--authentication)
11. [Phase 4 — Design system](#phase-4--design-system)
12. [Phase 5 — Public site shell](#phase-5--public-site-shell)
13. [Phase 6 — Page builder](#phase-6--page-builder)
14. [Phase 7 — Form builder](#phase-7--form-builder)
15. [Phase 8 — CRM and inbox](#phase-8--crm-and-inbox)
16. [Phase 9 — Citadel Panel shell](#phase-9--citadel-panel-shell)
17. [Phase 10 — Settings and design Panel](#phase-10--settings-and-design-panel)
18. [Phase 11 — Media and R2](#phase-11--media-and-r2)
19. [Phase 12 — Notifications](#phase-12--notifications)
20. [Phase 13 — Seed, export, and hardening](#phase-13--seed-export-and-hardening)
21. [Phase 14 — CI, testing, and accessibility audit](#phase-14--ci-testing-and-accessibility-audit)
22. [Dependency graph](#21-dependency-graph)
23. [Definition of done checklist](#22-definition-of-done-checklist)

---

## 1. Architecture overview (C4)

### Level 1 — System context

```
┌─────────────────────────────────────────────────────────────────┐
│                        Internet                                  │
└──────────┬──────────────────────────────┬───────────────────────┘
           │                              │
    ┌──────▼──────┐                ┌──────▼──────┐
    │  Site       │                │  Owner      │
    │  Visitor    │                │  (admin)    │
    └──────┬──────┘                └──────┬──────┘
           │ browses public site          │ manages site via Panel
           │                              │
    ┌──────▼──────────────────────────────▼──────┐
    │                                             │
    │              Citadel                         │
    │   (Hono + Astro + TanStack Router            │
    │    on Cloudflare Workers)                    │
    │                                             │
    │  ┌──────────────┐   ┌────────────────────┐  │
    │  │  Public Site  │   │   Citadel Panel     │  │
    │  │  (site)       │   │   /admin/*         │  │
    │  └──────────────┘   └────────────────────┘  │
    └─────────────────────────────────────────────┘
           │
    ┌──────▼─────────────────────────────────────────────┐
    │              Cloudflare Platform                    │
    │                                                     │
    │  ┌─────────┐  ┌──────┐  ┌──────┐  ┌────────────┐  │
    │  │   D1    │  │  KV  │  │  R2  │  │   Email    │  │
    │  │(SQLite) │  │      │  │      │  │  Workers   │  │
    │  └─────────┘  └──────┘  └──────┘  └────────────┘  │
    └────────────────────────────────────────────────────┘
```

### Level 2 — Container diagram

```
┌─────────────────────────────────────┐  ┌──────────────────────────────────────┐
│  Worker 1: Astro (apps/citadel/workers/site/)    │  │  Worker 2: TanStack Start            │
│                                     │  │  (apps/citadel/workers/panel/)                    │
│  Hono entrypoint (src/app.ts)       │  │                                      │
│    custom routes → handle()         │  │  Custom entrypoint (app/server.ts)   │
│                                     │  │    Hono /api/* (public, unauthed)    │
│  Public site routes:                │  │    TanStack Start /admin/*, /login   │
│    / homepage                       │  │                                      │
│    /[slug] pages                    │  │  Public API (Hono):                  │
│    /about                           │  │    POST /api/auth/magic-link         │
│    /contact                         │  │    GET  /api/auth/verify             │
│    /login ← Astro SSR login page    │  │    POST /api/auth/logout             │
│    /robots.txt                      │  │    POST /api/form/:slug              │
│    /coming-soon                     │  │    POST /api/media/upload            │
│                                     │  │                                      │
│  Astro islands:                     │  │  Panel routes (TanStack Router):     │
│    PublicForm                       │  │    /admin/dashboard                  │
│    PreviewTokenListener             │  │    /admin/pages/$id  block editor    │
│                                     │  │    /admin/forms/$id  form builder    │
│  CF Cache API (max-age=60s)         │  │    /admin/inbox                      │
│                                     │  │    /admin/people                     │
│  Bindings:                          │  │    /admin/settings                   │
│    env.* (cloudflare:workers)       │  │    /admin/design                     │
└──────────────┬──────────────────────┘  │                                      │
               │                         │  Server functions:                   │
               │  shared binding IDs     │    env.DB (cloudflare:workers)     │
               │                         │    → Drizzle → inferred return type  │
               │                         │                                      │
               │                         │  Auth middleware (middleware.ts):     │
               │                         │    guards all /admin/* routes        │
               │                         │    Web Crypto HMAC + KV session      │
               │                         └──────────────┬───────────────────────┘
               │                                        │
┌──────────────▼────────────────────────────────────────▼──────────────────────┐
│  core/ — shared, imported by both Workers                                     │
│                                                                               │
│  db/schema.ts      Drizzle schema — single source of truth                   │
│  lib/db.ts         db(d1) helper                                              │
│  lib/auth.ts       Token generation + HMAC sign/verify (Web Crypto)          │
│  lib/session.ts    Session read/write/delete (KV)                             │
│  lib/cache.ts      CF Cache API purge + dev bypass                            │
│  lib/rate-limit.ts KV-based rate limiter                                      │
│  lib/notify.ts     CF Email Workers send helper                               │
│  lib/upsert-contact.ts  Contact dedup by email                                │
│  lib/blocks.ts     Block type definitions + validators                        │
│  lib/forms.ts      FormField type definitions + validators                    │
│  lib/image-service.ts   ImageService interface + default R2 impl             │
│  lib/color-scale.ts     OKLCH brand color scale generator                    │
│  lib/contrast.ts        WCAG AA contrast ratio checker                        │
│  lib/font-pairing.ts    Font pairing configs                                  │
│  lib/design-system/     Token resolution (spacing, type, themes)             │
│  lib/export.ts          Zip export via fflate                                 │
└───────────────────────────┬───────────────────────────────────────────────────┘
                            │
          ┌─────────────────┼──────────────────┬─────────────────┐
    ┌─────▼────┐      ┌─────▼────┐       ┌─────▼────┐     ┌─────▼──────┐
    │  D1      │      │  KV      │       │  R2      │     │  Email     │
    │ (SQLite) │      │          │       │          │     │  Workers   │
    │          │      │ sessions │       │  media/  │     │            │
    │ users    │      │ tokens   │       │          │     │ send_email │
    │ sessions │      │ ratelimit│       │          │     │  binding   │
    │ pages    │      │          │       │          │     │            │
    │ forms    │      │          │       │          │     │            │
    │ contacts │      └──────────┘       └──────────┘     └────────────┘
    │ settings │
    └──────────┘
```

### Level 3 — Component diagram: request lifecycle

```
Incoming request to Worker 1 (Astro — public site)
      │
      ▼
apps/citadel/workers/site/src/app.ts (Hono)
  ├── custom routes  — checked first (e.g. /api/ping)
  └── handle()       — Astro SSR fallback, from @astrojs/cloudflare/handler
                         (must be last; not astro/hono — see DECISIONS.md,
                         "astro/hono advanced routing is broken for custom
                         Cloudflare entrypoints")
        ├── env.DB (cloudflare:workers) → Drizzle query
        ├── resolve design tokens from site_settings
        ├── render HTML with server-side <style> token injection
        ├── set Cache-Control header (max-age=60)
        └── hydrate Astro islands (PublicForm, PreviewTokenListener)

Incoming request to Worker 2 (TanStack Start — Panel)
      │
      ▼
apps/citadel/workers/panel/app/server.ts (custom entrypoint)
  ├── /api/*  → Hono route handlers (unauthenticated public API)
  │     ├── POST /api/form/:slug      — form submission
  │     ├── POST /api/auth/magic-link — send magic link
  │     ├── GET  /api/auth/verify     — validate token, create session
  │     ├── POST /api/auth/logout     — destroy session
  │     └── POST /api/media/upload    — R2 upload
  │
  └── /* → TanStack Start handler
        ├── middleware.ts — auth guard on /admin/* routes
        │     ├── read session cookie → split sessionId + sig
        │     ├── verify HMAC (crypto.subtle — Web Crypto only)
        │     ├── KV get session (retry x2, 100ms — eventual consistency)
        │     ├── valid   → attach user to context → continue
        │     └── invalid → redirect /login
        └── /admin/* routes — TanStack Router, server functions via cloudflare:workers env import
              ├── server function → env.DB (cloudflare:workers) → Drizzle query
              ├── return type inferred from Drizzle schema → component (no any)
              └── TanStack Query — client-side cache + mutations
```

### Level 4 — Component diagram: form submission flow

```
Visitor submits form on public site
      │
      ▼
POST /api/form/[slug]
      │
      ├── 1. Parse + validate body
      ├── 2. Check honeypot field ("website") → discard silently if filled
      ├── 3. Rate limit check (KV: 10/hour per IP)
      │         └── exceeded → 429, generic message
      ├── 4. Lookup form by slug in D1
      │         └── not found → 404
      ├── 5. Validate fields against form.fields schema
      │         └── invalid → 400, field errors
      ├── 6. INSERT form_submission (D1)
      ├── 7. Find field with type: 'email'
      │         └── found → upsertContact(email, formData)
      │               ├── contact exists → UPDATE (merge types)
      │               └── contact new   → INSERT
      ├── 8. INSERT activity (type: 'form_submission', contactId)
      ├── 9. Send notification email (CF Email Workers)
      │         └── binding unavailable → skip silently
      └── 10. Return 200, generic success message
             (never reveal internal state)
```

---

## 2. Data flow diagrams

### Magic link authentication flow

```
Owner enters email at /login
      │
      ▼
POST /api/auth/magic-link
  ├── rate limit: 3 requests/15min per email (KV)
  ├── lookup user by email in D1
  │     └── not found → return 200 (never confirm existence)
  ├── generate token: crypto.getRandomValues(32 bytes) → hex string
  ├── hash token: crypto.subtle.digest('SHA-256', token) → tokenHash
  ├── store in KV: key=`magic:{tokenHash}` value={email} TTL=900s
  ├── send email via CF Email Workers: link = /api/auth/verify?token={raw}
  └── return 200 "Check your email"

Owner clicks link → GET /api/auth/verify?token={raw}
  ├── hash incoming token: SHA-256 → tokenHash
  ├── KV get `magic:{tokenHash}` (retry x2, 100ms apart — eventual consistency)
  │     └── not found / expired → redirect /login?error=invalid
  ├── KV delete `magic:{tokenHash}` (single use)
  ├── lookup user by email in D1
  │     └── not found → redirect /login?error=unauthorized
  ├── generate session id: crypto.getRandomValues(16 bytes) → hex
  ├── store session in KV: key=`session:{id}` value={userId,email,role} TTL=7days
  ├── sign cookie value: HMAC-SHA256(sessionId, SESSION_SECRET) → sig
  ├── set cookie: `citadel_session={sessionId}.{sig}`
  │     HttpOnly, Secure, SameSite=Lax, Path=/
  └── redirect /admin/dashboard

Subsequent Panel requests
  ├── middleware reads cookie → splits sessionId + sig
  ├── verify HMAC: crypto.subtle.verify(sig, sessionId, SESSION_SECRET)
  │     └── invalid → redirect /login
  ├── KV get `session:{sessionId}`
  │     └── not found / expired → redirect /login
  └── attach {userId, email, role} to request headers → continue

POST /api/auth/logout
  ├── read session cookie
  ├── KV delete `session:{sessionId}`
  └── clear cookie → redirect /login
```

### Page render flow (public site)

```
GET /{slug}
  ├── Cloudflare Cache API (max-age=60)
  │     └── cache hit → serve cached HTML
  ├── cache miss → Server Component renders
  │     ├── getRequestContext() → env.DB
  │     ├── db.select(pages).where(slug = slug, status = 'published')
  │     │     └── not found → notFound()
  │     ├── db.select(site_settings).where(id = 1)
  │     ├── resolve design tokens (color scale, spacing, type)
  │     ├── render <SiteLayout> with server-side <style> token injection
  │     └── render <BlockRenderer blocks={page.blocks} />
  │           ├── richText  → generateHTML(content) via @tiptap/html
  │           ├── image     → imageService.render(block)
  │           ├── hero      → <HeroBlock>
  │           ├── form      → fetch form by id → <PublicForm>
  │           ├── columns   → recursive <BlockRenderer>
  │           └── divider   → <hr>
  └── cache and serve
```

### Content save + revalidation flow

```
Owner saves page in Panel
      │
      ▼
server function: savePage(id, { title, slug, blocks, status })
  ├── validate session (requireAuth)
  ├── validate blocks against Block type definitions
  ├── db.update(pages).set({...}).where(id = id)
  ├── if status changed to 'published': set publishedAt = now()
  └── POST /api/revalidate { paths: ['/', `/${slug}`], secret: CITADEL_SERVICE_KEY }
        ├── validate Bearer token
        ├── purgeCache(`${serverUrl}/`) via apps/citadel/core/lib/cache.ts
        ├── purgeCache(`${serverUrl}/${slug}`)
        └── skipped silently in dev (caches.default unavailable)
```

---

## 3. Known gotchas and constraints

These are non-obvious issues that will cause hard-to-debug failures if not
understood upfront. Read all of these before writing any code.

---

### G1 — Cloudflare binding access pattern

**Problem:** Cloudflare bindings (D1, KV, R2, Email) are only accessible
via the request context — not as global variables. Each layer accesses them
differently.

**Solution:**

In Hono route handlers and middleware:
```typescript
// ✅ Correct — Hono context
app.get('/api/pages', (c) => {
  const database = db(c.env.DB)
  const kv = c.env.KV
})

app.use('/admin/*', async (c, next) => {
  const session = await c.env.KV.get(`session:${id}`)
})
```

In Astro pages (Worker 1):
```typescript
// ✅ Correct — Astro v6 removed Astro.locals.runtime.env; use cloudflare:workers
import { env } from 'cloudflare:workers'
const database = db(env.DB)
```

In TanStack Start server functions (Worker 2):
```typescript
// ✅ Correct — server function handler only
// getCloudflareContext()/@tanstack/solid-start/cloudflare do not exist in
// this version (@tanstack/solid-start 1.168.26) — confirmed via Phase 0
// POC 1b, see DECISIONS.md. Use a dynamic cloudflare:workers import inside
// the handler, same as everywhere else bindings are accessed in this stack.
import { createServerFn } from '@tanstack/solid-start'

export const getPages = createServerFn({ method: 'GET' })
  .handler(async () => {
    const { env } = await import('cloudflare:workers')
    return db(env.DB).select().from(pages).all()
  })
```

In Hono public API routes (Worker 2 custom entrypoint):
```typescript
// ✅ Correct — c.env in Hono handler
api.post('/api/form/:slug', async (c) => {
  const database = db(c.env.DB)
})
```

Never import `cloudflare:workers` in client-side component code.
Never pass `env` through props. Never access bindings at module level.
All Panel data access goes through TanStack Start server functions.

**Affects:** All Hono routes, all Astro pages, all TanStack Start server functions.

---

### G2 — Web Crypto only in Hono middleware and Workers runtime

**Problem:** Hono middleware runs in the Cloudflare Workers runtime (V8
isolate). Node.js `crypto` module is not available anywhere in the Worker —
not in Hono middleware, not in Astro SSR handlers, not in Hono route handlers.

**Solution:** All cryptographic operations — HMAC signing, SHA-256 hashing,
random byte generation — must use the Web Crypto API exclusively.

```typescript
// ✅ Correct — Web Crypto API (available in all Workers contexts)
const bytes = crypto.getRandomValues(new Uint8Array(32))
const hash = await crypto.subtle.digest('SHA-256', buffer)
const key = await crypto.subtle.importKey(
  'raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']
)
const sig = await crypto.subtle.sign('HMAC', key, data)

// ❌ Wrong — Node.js crypto not available in Workers runtime
import crypto from 'crypto'
crypto.randomBytes(32)
crypto.createHmac('sha256', secret)
```

**Affects:** `apps/citadel/core/lib/auth.ts`, `apps/citadel/core/lib/session.ts`, Hono auth middleware.

---

### G3 — KV eventual consistency

**Problem:** Cloudflare KV is eventually consistent. A value written in one
edge location may not be immediately readable from another. In the magic link
flow, the token is written to KV and then the user clicks a link that hits
potentially a different edge node — which may not yet have the value.

**Solution:** Retry KV reads up to 2 times with 100ms delay before treating
a miss as a genuine invalid token.

```typescript
async function kvGetWithRetry(kv: KVNamespace, key: string, retries = 2): Promise<string | null> {
  for (let i = 0; i <= retries; i++) {
    const value = await kv.get(key)
    if (value !== null) return value
    if (i < retries) await new Promise(r => setTimeout(r, 100))
  }
  return null
}
```

**Affects:** `/api/auth/verify`, any KV read immediately after a write.

---

### G4 — Cache invalidation via Cloudflare Cache API

**Problem:** Cache invalidation
is handled explicitly via the Cloudflare Cache API.

**Correction, confirmed during Phase 0 (2026-06-19):** `caches.default` is
actually available under `wrangler dev` in current wrangler/workerd
versions (`wrangler@4.101.0` / `workerd@1.20260616.1`) — the claim below
that it's unavailable in dev no longer holds for this version combo.
Verified directly via a diagnostic route: `typeof caches !== 'undefined'`
and `typeof caches.default !== 'undefined'` both `true` against a real
built Worker under `wrangler dev`. Keep the dev-bypass branch in
`cache.ts` as defensive code regardless (cheap insurance for older
wrangler or other runtimes like `vitest-pool-workers`), but don't assume
it's actually triggering without checking. See `DECISIONS.md`.

**Solution:** All cache writes and purges go through `apps/citadel/core/lib/cache.ts`
which checks for dev mode and skips gracefully:

```typescript
// apps/citadel/core/lib/cache.ts
export async function purgeCache(url: string): Promise<void> {
  if (import.meta.env.DEV) return // caches.default not available in dev
  const cache = caches.default
  await cache.delete(new Request(url))
}

export async function setCacheHeaders(
  response: Response,
  maxAge = 60
): Promise<Response> {
  if (import.meta.env.DEV) return response
  const headers = new Headers(response.headers)
  headers.set('Cache-Control', `public, max-age=${maxAge}`)
  return new Response(response.body, { ...response, headers })
}
```

Astro pages set `Cache-Control: public, max-age=60` on responses.
After content saves, Hono routes call `purgeCache(url)` for affected paths.

**Setting `Cache-Control` alone does not populate the Workers Cache API.**
Confirmed during Phase 0: for a custom Worker fetch handler, the Workers
Cache API requires explicit `caches.default.match()`/`.put()` calls in the
request path — a `Cache-Control` response header by itself doesn't make
Cloudflare cache a dynamically-computed Worker response the way it caches
plain static assets. "Page served from cache on second request" needs
that explicit cache-aside logic built (most naturally as Hono middleware
wrapping the SSR fallback) — not built yet, only `purgeCache()` itself has
been verified working.

**Affects:** All Astro public pages, `apps/citadel/core/lib/cache.ts`, all Hono content
save routes (pages, settings, forms).

---

### G5 — Local dev requires all three processes

**Problem:** The stack has three processes in development — Astro dev server,
Vite Panel dev server, and Wrangler (for bindings). Running only one or two
means bindings are unavailable or the Panel doesn't update on change.

**Solution:** `pnpm dev` starts both Workers via `concurrently`. Each Worker
runs its own `wrangler dev` process with full binding access.

```bash
# package.json (repo root)
"dev:site":  "cd workers/site && wrangler dev --port 3000",
"dev:panel": "cd workers/panel && wrangler dev --port 3001",
"dev":       "concurrently \"pnpm dev:site\" \"pnpm dev:panel\""
```

`pnpm dev:site` and `pnpm dev:panel` work independently. Each Worker's
Wrangler dev runtime provides its own D1, KV, R2 binding access — both
pointing at the same binding IDs.

`caches.default` (Cloudflare Cache API) is NOT available in Wrangler dev.
All cache operations must check for dev mode and skip (G4).

The local D1 state lives in `.wrangler/state/v3/d1/`. To reset:
```bash
rm -rf .wrangler/state/v3/d1
pnpm db:migrate
pnpm seed
```

**Affects:** Every developer's local setup. `pnpm dev` must be a single
command. If it requires multiple terminals, it is broken. Fix it.

---

### G6 — Cookie behavior on workers.dev vs custom domain

**Problem:** Session cookies set on `*.workers.dev` during development may
not behave identically to cookies on a custom domain in production. Specifically:
- `SameSite=Lax` + `Secure` on `workers.dev` can behave unexpectedly
- The magic link verify redirect sets a cookie and redirects — this must be
  tested on a custom domain before shipping

**Solution:** During development, accept that auth may need manual workarounds
on `workers.dev`. Add an entry to CONTRIBUTING.md noting this. End-to-end
auth must be validated on a custom domain as part of the Phase 3 acceptance
criteria.

**Affects:** Phase 3 (Auth), end-to-end testing.

---

### G7 — site_settings singleton enforcement

**Problem:** Drizzle has no built-in concept of a singleton row. Nothing
prevents a second row being inserted into `site_settings` if the constraint
is not enforced correctly.

**Solution:** 
- Add a `CHECK` constraint or unique index on `id` in the schema
- Always use `INSERT OR REPLACE INTO site_settings ... WHERE id = 1`
- Never expose a `POST /api/settings/create` endpoint
- Read settings with `db.select().from(siteSettings).where(eq(siteSettings.id, 1)).get()`
- Seed script inserts with `id = 1` on first run, skips if exists

**Affects:** `apps/citadel/core/db/schema.ts`, `seed.ts`, all settings read/write paths.

---

### G8 — Email field detection in generic forms

**Problem:** The contact upsert on form submission must identify which field
contains the submitter's email. With a generic form builder, the field name
could be anything ("email", "your_email", "contact_email").

**Solution:** Detection is by `type: 'email'` on the `FormField` definition,
not by field name. The form builder UI must use `type: 'email'` for email
inputs and must not allow `type: 'text'` with a label of "Email" to be
created without flagging.

The form builder UI should enforce this — an email field type is a distinct
option in the field type picker, not a variant of text.

**Affects:** `/api/form/[slug]`, `apps/citadel/core/lib/upsert-contact.ts`, form builder UI.

---

### G9 — Image URLs must go through ImageService

**Problem:** If image URLs are constructed inline in components (e.g.
`<img src={block.url} />`), swapping the image service in a future extension
requires touching every component that renders images.

**Solution:** Always call `imageService.render(block)` to get the `src` and
optional `srcset`. The `block.url` (the original R2 URL) is the input — the
service decides what to return. Never access `block.url` directly in JSX.

```typescript
// ✅ Correct
const { src, srcset, sizes } = imageService.render({ url: block.url, alt: block.alt })
return <img src={src} srcSet={srcset} sizes={sizes} alt={block.alt} loading="lazy" decoding="async" />

// ❌ Wrong — couples renderer to URL format
return <img src={block.url} alt={block.alt} />
```

**Affects:** `<BlockRenderer>`, Panel image block preview, `apps/citadel/core/lib/image-service.ts`.

---

### G10 — No Sharp, no server-side image processing

**Problem:** Sharp requires native binaries and does not run on Cloudflare's
V8 isolate runtime. Any attempt to `import sharp` will fail at deploy time.

**Solution:** No image processing in Section 1. Files are served as uploaded.
The Panel enforces a 5MB upload limit with a clear warning. Images are served
with correct HTML attributes for browser-side optimization.

Do not add Sharp as a dependency. Do not add it to `pnpm-workspace.yaml`
`allowBuilds`. Flag any PR that introduces it.

**Affects:** `/api/media/upload`, any image rendering path.

---

### G11 — TipTap JSON is the storage format

**Problem:** If rich text rendering on the public site uses a different format
than what TipTap produces (e.g. HTML strings, Markdown, or Payload Lexical),
a transform layer is needed that adds complexity and potential data loss.

**Solution:** Store TipTap `JSONContent` natively in D1. Render on the public
site using `@tiptap/html`'s `generateHTML(content, extensions)`. The same
extensions used in the Panel editor must be registered in the `generateHTML`
call — otherwise nodes will render as empty.

```typescript
// apps/citadel/core/lib/rich-text.ts
import { generateHTML } from '@tiptap/html'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'

export function tiptapToHtml(content: JSONContent): string {
  return generateHTML(content, [StarterKit, Link])
}
```

**Affects:** `<BlockRenderer>`, `apps/citadel/core/lib/rich-text.ts`, Panel TipTap editor
extension config (must stay in sync with renderer extensions).

---

### G12 — DaisyUI theme + OKLCH brand override order

**Problem:** If the brand color OKLCH overrides are injected before the DaisyUI
theme CSS loads, or at the wrong specificity level, they will be overridden
by the theme file and the brand color will not apply.

**Solution:** The override `<style>` tag must be injected after the theme
`<link>` in the document `<head>`, and must target the same selector as the
theme file (`:root[data-theme="{name}"]`). Source order wins at equal
specificity.

**Confirmed during Phase 0 (2026-06-19):** DaisyUI v5's Tailwind-v4-native
plugin reads `--color-primary` / `--color-primary-content`, **not** the
DaisyUI v4 short names `--p` / `--pc`. The generated utility CSS is
`.bg-primary { background-color: var(--color-primary); }`. Using the old
`--p`/`--pc` names produces no visible error — the override `<style>` tag
just silently sets a CSS variable nothing reads. Always verify against the
actual generated CSS (inspect the page or grep the built `_astro/*.css`
output for `.bg-primary`) rather than assuming v4-era variable names still
apply. See `DECISIONS.md`, "DaisyUI v5 token names" for the full repro.

```html
<!-- Correct order in <head> -->
<link rel="stylesheet" href="/themes/theme-citadel.css" />  <!-- DaisyUI theme -->
<style>
  :root[data-theme="citadel"] {
    --color-primary: oklch(62% 0.18 145);          /* primary override */
    --color-primary-content: oklch(100% 0 0);
    /* ... rest of brand scale */
  }
</style>
```

**Affects:** Root layout, `BrandColorProvider`, design live preview.

---

### G13 — R2 bucket must be public with custom domain

**Problem:** R2 buckets are private by default. Files uploaded to R2 cannot
be served publicly without explicit configuration. The URL stored in the
database (`media.yoursite.com/...`) will 403 if the bucket is not configured
correctly.

**Solution:** At deploy time, the owner must:
1. Enable public access on the R2 bucket in the CF dashboard
2. Add a custom domain (e.g. `media.yoursite.com`) to the bucket

Document this clearly in the README deploy steps. The seed script should
verify the R2 bucket is accessible and warn if not.

**Affects:** Phase 11 (Media), README, seed script validation.

---

### G15 — TanStack Start prerendering + bindings

**Problem:** TanStack Start supports static prerendering, but prerendering
runs at build time without access to Cloudflare bindings. Any route that
uses a server function accessing D1, KV, or R2 will fail during prerendering.

**Solution:** Add `export const prerender = false` to all Panel routes and
any public site routes that use dynamic data. All Panel routes must be
`prerender = false` — the Panel is always dynamic.

```typescript
// Any TanStack Start route using server functions with bindings
export const prerender = false
```

**Affects:** All Panel routes, any public routes with dynamic D1 queries.

---

### G16 — TanStack DB is Section 2+ only

**Problem:** TanStack DB (beta) may appear in tutorials and examples alongside
TanStack Start. It must not be introduced in Section 1.

**Solution:** Do not install `@tanstack/db`. Flag any PR that adds it.
TanStack Query alone is correct for Section 1 — single owner, small datasets,
no relational cross-collection queries needed yet.

TanStack DB adds value when: team collaboration requires optimistic mutations,
the Panel has real-time inbox updates, or cross-collection queries (contacts +
activities + submissions) become complex. None of these exist in Section 1.

**Affects:** Panel data fetching throughout Section 1.

---

### G14 — Drizzle D1 adapter quirks

**Problem:** The Drizzle D1 adapter has some SQLite-specific behaviors:
- `returning()` after INSERT is not supported in all D1 adapter versions —
  use a separate SELECT after INSERT if you need the inserted row
- Transactions work but must be used carefully — D1 has a 30-second timeout
- `db.run()` vs `db.get()` vs `db.all()` — use the correct method or you
  will get unexpected `undefined` returns

**Solution:** Always use `db.select().from(table).where(...).get()` for
single-row reads. Use `db.select().from(table).where(...).all()` for
multi-row reads. Test INSERT + immediate SELECT in integration tests.

**Affects:** All database operations in `apps/citadel/core/lib/` and server functions.

---

## Phase 0 — Stack validation

**Framework decision: Hono + Astro + TanStack Router.** This decision is
recorded in `DECISIONS.md` and is not revisited.

**Goal:** Validate that the chosen stack works correctly for Citadel's four
highest-risk scenarios before committing to Phase 1. Phase 0 is a focused
proof of concept — not a throwaway — the code produced here becomes the
foundation of Phase 1.

**This phase gates everything else.** Do not begin Phase 1 until all four
POC scenarios pass and findings are recorded in `DECISIONS.md`.

---

### Why this stack

**Performance:** Hono is ~14kb. Cold starts are significantly faster than
any framework with an adapter layer. Astro ships near-zero JavaScript on
the public site — only islands hydrate. TanStack Router Panel SPA loads
once, then client-side navigation is instant. No adapter translation layer
means the Worker runs exactly what you wrote.

**Security:** Security headers live in Hono middleware — centralized,
explicit, auditable in one place. The Panel SPA calls Hono API endpoints —
every data access is an explicit authenticated HTTP call. No accidental
data leakage through component boundaries. Smaller dependency surface
means fewer CVEs.

**Roadmap compatibility:** Customer portals (Section 2) are a natural third
SPA alongside the Panel SPA — `src/portal/` built with Vite, served by
Hono at `/portal/*`. Extensions add Astro pages, TanStack routes, and Hono
route groups independently. Bundle size never becomes a constraint because
the Panel and portals are static assets, not Worker bundle. Edie (Section
4+) could be a separate Astro public site served by the same Hono spine.

**The key superpower — Hono RPC:**
End-to-end type safety from Drizzle schema to Panel component with
zero manual type maintenance:

```typescript
// Drizzle schema → server function → component
// Change a column in schema → TypeScript shows every Panel component
// that needs updating before deploy

// apps/citadel/workers/panel/src/server-functions/pages.ts
export const getPages = createServerFn({ method: 'GET' })
  .handler(async () => {
    const { env } = await import('cloudflare:workers')
    return db(env.DB).select().from(pagesTable).all()
    // return type: InferSelectModel<typeof pagesTable>[]
    // inferred automatically — never written manually
  })

// apps/citadel/workers/panel/src/routes/admin/pages/index.tsx
const pages = createQuery(() => ({
  queryKey: ['pages'],
  queryFn: () => getPages(),
  // pages.data is Page[] — typed from Drizzle schema automatically
  // hover over pages.data in editor — no any, no manual type import
}))
```

---

### Architecture overview

```
Worker 1: Astro (apps/citadel/workers/site/) — public site
│
├── apps/citadel/workers/site/src/app.ts (Hono entrypoint)
│     ├── custom routes — checked first (e.g. /api/ping)
│     └── handle()       — Astro SSR fallback, @astrojs/cloudflare/handler
│                            (must be last — not astro/hono, see DECISIONS.md)
│
└── Routes: /*, /[slug], /about, /contact, /login
      └── env.DB (cloudflare:workers) → Drizzle → render HTML

Worker 2: TanStack Start (apps/citadel/workers/panel/) — Panel
│
├── apps/citadel/workers/panel/app/server.ts (custom entrypoint)
│     ├── Hono /api/* — public unauthenticated API
│     │     ├── POST /api/form/:slug      form submission
│     │     ├── POST /api/auth/magic-link send token
│     │     ├── GET  /api/auth/verify     validate + create session
│     │     ├── POST /api/auth/logout     destroy session
│     │     └── POST /api/media/upload    R2 upload
│     └── TanStack Start handler — /admin/*, /login
│
└── /admin/* — auth-guarded via middleware.ts
      └── server functions → env.DB (cloudflare:workers) → Drizzle
            └── return type inferred → TanStack Query component (no any)

Shared:
  apps/citadel/core/db/schema.ts  — single source of truth, imported by both Workers
  apps/citadel/core/lib/db.ts     — db(d1) helper, imported by both Workers
  apps/citadel/core/lib/cache.ts  — cache purge with dev bypass, imported by both Workers
```

### Build pipeline

```
Build 1: Astro (apps/citadel/workers/site/)      Build 2: TanStack Start (apps/citadel/workers/panel/)
  pnpm build:site                     pnpm build:panel
  astro build                         vite build
  Output: apps/citadel/workers/site/dist/          Output: apps/citadel/workers/panel/dist/

Two independent wrangler deploys:
  pnpm deploy:site   → wrangler deploy (apps/citadel/workers/site/)
  pnpm deploy:panel  → wrangler deploy (apps/citadel/workers/panel/)
  pnpm deploy        → both sequentially
```

**Dev orchestration — two Workers, one command:**

```json
"dev:site":  "cd workers/site && wrangler dev --port 3000",
"dev:panel": "cd workers/panel && wrangler dev --port 3001",
"dev":       "concurrently \"pnpm dev:site\" \"pnpm dev:panel\""
```

Each Worker's `wrangler dev` provides its own binding access. Both point
at the same D1 `database_id`, KV `id`, and R2 `bucket_name`.

---

### POC 1 — Binding access

**Risk:** Bindings must be accessible from Hono routes, Astro pages, and
Hono middleware. If any layer requires workarounds, document them.

**Build:**
- Hono route: `GET /api/ping` → reads from D1, KV, R2 → returns JSON
- Astro page: `GET /test` → `env.DB` (from 'cloudflare:workers') → Drizzle query → renders row
- Hono middleware: reads `c.env.KV` for rate limit check

**Pass criteria:**
- `c.env.DB` works in Hono routes with no shim
- `env.DB` (from 'cloudflare:workers') works in Astro `.astro` files
- Both work in `wrangler dev` locally
- Both work after `wrangler deploy` to production

---

### POC 2 — SSR public page with design token injection

**Risk:** The design token `<style>` injection must happen server-side in
Astro with no FOUC. DaisyUI OKLCH override order must be correct.

**Build:**
- Astro page fetches `site_settings` from D1
- Calls `generateColorScale(brandColor)` → builds OKLCH override string
- Injects via `<style set:html={tokenStyle} />` after theme `<link>`
- Loads DaisyUI theme CSS from `public/themes/`

```astro
---
import { env } from 'cloudflare:workers'
const settings = await db(env.DB).select().from(siteSettings)
  .where(eq(siteSettings.id, 1)).get()
const tokenStyle = buildTokenStyle(settings)
---
<html data-theme={settings.theme}>
  <head>
    <link rel="stylesheet" href={`/themes/theme-${settings.theme}.css`} />
    <style set:html={tokenStyle} />
  </head>
  <body>
    <h1 style="color: var(--color-primary)">Token injection works</h1>
  </body>
</html>
```

**Pass criteria:**
- Page renders with correct brand color on first paint — no FOUC
- Changing `brandColor` in D1 changes the rendered color on next request
- DaisyUI component styles respect the overridden token
- Works with `wrangler dev` and after `wrangler deploy`

---

### POC 3 — Auth guard + TanStack Start Panel

**Risk:** `/admin/*` routes must be protected. Session cookie must be set
correctly and read across requests. Login page lives in Worker 1 (Astro
SSR). The auth flow crosses Workers — magic link request hits Worker 1's
Astro login page, token verification hits Worker 2's Hono
`/api/auth/verify`, session cookie is then read by Worker 2's guard.

**Confirmed during Phase 0 (2026-06-19): use a route `beforeLoad` guard on
a layout route, not `createMiddleware().server(...)` as a standalone
default export.** `createMiddleware()` with no options defaults to
**function** middleware (for wrapping individual server functions), not
**request** middleware (for guarding entire routes) — request middleware
also requires global registration via `createStart({ requestMiddleware:
[...] })`, more machinery than a per-route guard needs. `beforeLoad` is
TanStack Router's standard, well-documented mechanism for exactly this.
Full investigation in `DECISIONS.md`.

**Build:**
- Astro SSR login page at `/login` in `apps/citadel/workers/site/`
- `apps/citadel/workers/panel/app/middleware.ts` — `requireAuth`, a
  `createServerFn`-wrapped Web Crypto HMAC verify + KV session lookup
  (wrapped as a server function, not a plain async function, because
  `getCookie()` is server-only and `beforeLoad` can run client-side
  during SPA navigation)
- `apps/citadel/workers/panel/src/routes/admin/route.tsx` — layout route
  for `/admin`, `beforeLoad` calls `requireAuth()` and throws
  `redirect({ to: '/login' })` if it returns `null`
- `apps/citadel/workers/panel/src/routes/login.tsx` — placeholder login
  page (full implementation is Phase 3)

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

  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(env.SESSION_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
  )
  const sigBytes = Uint8Array.from(atob(sig), (c) => c.charCodeAt(0))
  const valid = await crypto.subtle.verify(
    'HMAC', key, sigBytes, new TextEncoder().encode(sessionId)
  )
  if (!valid) return null

  // Sessions live in env.KV — SESSION is Astro's unrelated framework feature
  const session = await env.KV.get(`session:${sessionId}`)
  if (!session) return null

  return JSON.parse(session) as { email: string }
})
```

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

**Pass criteria — all verified end-to-end:**
- Unauthenticated request to `/admin/pages` (Worker 2) redirects to `/login` (`307`) ✅
- Web Crypto returns valid hex token and HMAC — no Node.js crypto anywhere ✅
- After creating a valid session in KV + signed cookie: `/admin/pages` returns `200`, user threaded through `beforeLoad` context ✅
- After logout: cookie cleared, `/admin/*` redirects to `/login` — not yet built (logout endpoint is still a stub, see Step 17)
- Works with `wrangler dev` on Worker 2 independently ✅
- Cookie behavior verified on custom domain post-deploy (G6) — not yet tested, requires a real deploy

---

### POC 4 — Cache invalidation via Cloudflare Cache API

**Risk:** Cache invalidation uses the Cloudflare Cache API explicitly via
`apps/citadel/core/lib/cache.ts`. This must work reliably and be simple enough to use
consistently throughout the codebase.

**Build:**
- Astro page at `/test-cache` fetches a value from D1 and renders it
- Add `Cache-Control: public, max-age=60` to the Astro response
- Hono route: `POST /api/cache/purge` purges the cached URL

```typescript
// Hono cache purge helper — used after every content save
export async function purgeCache(url: string): Promise<void> {
  const cache = caches.default
  await cache.delete(new Request(url))
}

// Called from content save routes
app.post('/api/pages/:id', async (c) => {
  // ... save to D1
  await purgeCache(`${c.env.SERVER_URL}/${slug}`)
  return c.json({ ok: true })
})
```

**Pass criteria:**
- Purge completes in under 500ms ✅ confirmed — 4ms via `POST /api/cache/purge`
- `caches.default` confirmed available under `wrangler dev` (current versions) via `GET /api/cache/check` ✅ — corrects the original assumption below
- Page is served from cache on second request, fresh after purge — **not yet built**, needs explicit cache-aside `match()`/`put()` logic in the request path
- Works in production — not yet tested, requires a real deploy

**Note (superseded — kept for history, see the correction above and
`DECISIONS.md`):** the original assumption was that `caches.default` is
only available in production Workers, not in `wrangler dev`, requiring a
dev bypass flag. That's no longer accurate for current wrangler/workerd
versions. The bypass flag is harmless to keep as defensive code, but
don't assume it's the reason something works in dev — verify directly.

---

### Maintainability constraints established in Phase 0

These must be in place before Phase 1 begins. They are not optional.

**M1 — Single dev command**
`pnpm dev` starts both Workers via `concurrently`. A contributor's first
`pnpm dev` must work without reading documentation. `pnpm dev:site` and
`pnpm dev:panel` must also work independently. If any of these require
multiple terminals or manual steps, fix it before moving on.

**M2 — Shared types via `apps/citadel/core/`**
All types shared between both Workers live in `apps/citadel/core/` — schema types flow
from `apps/citadel/core/db/schema.ts` via Drizzle inference, never duplicated manually.
TanStack Start server functions infer their return type from Drizzle directly.
Never use `any` at a server function boundary. Never duplicate a type.

**M3 — ESLint boundary enforcement**
An ESLint rule prevents `apps/citadel/core/` from importing `apps/citadel/custom/`. Enforced in CI.
Contributors get an immediate error if the boundary is violated.

```javascript
// eslint.config.js
{
  files: ['core/**/*'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [{
        group: ['@apps/citadel/custom/*', '../apps/citadel/custom/*'],
        message: 'core/ must not import from apps/citadel/custom/. Use dependency injection.'
      }]
    }]
  }
}
```

**M4 — Biome for linting and formatting**
Use Biome instead of ESLint + Prettier. One tool, dramatically faster,
zero config conflicts. Install in Phase 0 so the whole project uses it
from day one.

```bash
pnpm add -D @biomejs/biome
```

```json
// biome.json
{
  "formatter": { "enabled": true, "indentStyle": "space" },
  "linter": { "enabled": true, "rules": { "recommended": true } },
  "organizeImports": { "enabled": true }
}
```

Update `pnpm lint` to `biome check .` and `pnpm format` to `biome format --write .`

**M5 — Astro content collections explicitly forbidden**
Astro has a built-in content collections system (file-based). It must not
be used in Citadel — all content comes from D1. Document this in CLAUDE.md
and add a lint rule or comment in `astro.config.ts` making this explicit.

**M6 — Login page is Astro SSR, not Panel SPA**
The login page at `/login` is an Astro page — fast, zero JS bundle, SSR.
The Panel SPA only loads after auth is confirmed. Never put the login
route inside TanStack Router.

**M7 — Cache API dev bypass**
`caches.default` is not available in `wrangler dev`. All cache
write/purge calls must check `import.meta.env.DEV` and skip in
development. Document this pattern once in `apps/citadel/core/lib/cache.ts` and use
it everywhere:

```typescript
// apps/citadel/core/lib/cache.ts
export async function purgeCache(url: string): Promise<void> {
  if (import.meta.env.DEV) return // cache not available in dev
  const cache = caches.default
  await cache.delete(new Request(url))
}
```

**M8 — Astro View Transitions**
Add `<ViewTransitions />` to the public site layout from day one. Zero
configuration, native browser API, smooth page transitions. Remove it
only if it causes issues — do not add it later as an afterthought.

---

### Milestones

**Worker 1 — Astro public site:**
- [ ] **0.1** Scaffold Astro Worker: `pnpm create cloudflare@latest workers/site --framework=astro`
- [ ] **0.2** Install DaisyUI for Astro (`@tailwindcss/vite`, `@plugin "daisyui"` in CSS)
- [ ] **0.3** POC 1a — Astro page reads D1 via `env.DB` (from 'cloudflare:workers')
- [ ] **0.4** POC 2 — SSR token injection: Astro page with DaisyUI theme + OKLCH override, no FOUC
- [ ] **0.5** Add Astro View Transitions to site layout (M8)
- [ ] **0.6** Confirm login page is in Astro — not in Panel Worker (M6)

**Worker 2 — TanStack Start Panel:**
- [ ] **0.7** Scaffold TanStack Start Worker. Do not use `pnpm create cloudflare@latest . --framework=tanstack-start` — it hangs indefinitely on an arrow-key git prompt that ignores `--no-git` (confirmed bug, see `DECISIONS.md`). Call the TanStack CLI directly instead: `pnpm dlx @tanstack/cli@0.69.3 create panel --framework solid --deployment cloudflare --no-git --non-interactive --yes --target-dir .`. Then add `apps/citadel/workers/*` to `pnpm-workspace.yaml`'s packages list — `apps/*` alone doesn't match this directory's depth — and run `pnpm install` from the repo root before `pnpm run generate-routes` in `panel/`.
- [ ] **0.8** Configure same D1, KV, R2 binding IDs as Worker 1 in `apps/citadel/workers/panel/wrangler.jsonc`
- [ ] **0.9** Install DaisyUI for TanStack Start (Vite — same pattern as Astro)
- [ ] **0.10** POC 1b — Server function reads D1 via `env.DB` (from a dynamic 'cloudflare:workers' import)
- [ ] **0.11** POC 3 — TanStack Start auth middleware + session cookie + `/admin/*` redirect
- [ ] **0.12** POC 4 — Cache dev bypass + production cache purge after deploy
- [ ] **0.13** Write one server function with Drizzle + verify type flows to component (no `any`)
- [ ] **0.14** Write one Hono public API route in custom server entrypoint (`app/server.ts`)
- [ ] **0.15** ~~Verify `prerender = false` on all Panel routes that use server functions~~ — **milestone doesn't apply.** Confirmed during Phase 0 (2026-06-19): TanStack Router/Start has no per-route `prerender`/`ssr` export in this version (no match anywhere in `@tanstack/solid-router`'s route types) — this carries over an Astro-specific concept. With the Cloudflare deployment target, nothing is statically prerendered by default regardless; there's no flag to set or check. See `DECISIONS.md`.

**Shared foundation:**
- [ ] **0.16** Create `apps/citadel/core/db/schema.ts` with minimal schema (users + pages tables)
- [ ] **0.17** Run `pnpm db:generate` + `pnpm db:migrate` — confirm both Workers see same tables. Requires `migrations_dir` on the D1 binding and a shared `--persist-to` path across `dev:site`/`dev:panel`/`db:migrate` — see Phase 1 milestone 1.34 and `DECISIONS.md`. Verify by inserting a row via `wrangler d1 execute` from one Worker's persisted state and reading it back from the other's `wrangler dev` instance, not just by confirming no error.
- [ ] **0.18** Install Biome at repo root (M4) — `pnpm add -D @biomejs/biome && pnpm biome init`
- [ ] **0.19** Add Biome boundary rule preventing `apps/citadel/core/` → `apps/citadel/custom/` imports (M3)
- [ ] **0.20** Configure TypeScript path aliases: `@core/*` in both Workers
- [ ] **0.21** `pnpm dev` starts both Workers — `pnpm dev:site` and `pnpm dev:panel` work independently (M1)
- [ ] **0.22** Measure both Worker bundle sizes: `wrangler deploy --dry-run` in each
- [ ] **0.23** Record all POC findings in `DECISIONS.md`
- [ ] **0.24** Confirm `DECISIONS.md` has TanStack Start + TanStack DB scoping decisions recorded

**Cadmus framework scaffold:**
- [ ] **0.25** Create `packages/cadmus/` with `package.json` (`name: "@bowenlabs/cadmus"`), `tsconfig.json`, and exports map for all primitives (`./auth`, `./db`, `./storage`, `./cache`, `./email`, `./rate-limit`, `./session`, `.`)
- [ ] **0.26** Create `packages/cadmus/src/` directory structure with stub `index.ts` in each primitive directory — no implementation yet, just the correct export signatures
- [ ] **0.27** Create `packages/cadmus/src/db/index.ts` — implement the `db(d1, schema)` helper (this is needed for POC Drizzle validation)
- [ ] **0.28** Create `packages/cadmus/src/cache/index.ts` — implement `purgeCache()` with dev bypass (needed for POC 4)
- [ ] **0.29** Confirm both Workers can import from `@bowenlabs/cadmus/db` and `@bowenlabs/cadmus/cache` via pnpm workspace reference — no circular dependencies
- [ ] **0.30** Add `packages/cadmus` to `pnpm-workspace.yaml`
- [ ] **0.31** Create `packages/cadmus/README.md` — framework overview, design philosophy, primitive list, install instructions

### Acceptance criteria
- Both Workers start independently with `pnpm dev:site` and `pnpm dev:panel`
- `pnpm dev` starts both Workers via concurrently
- All 4 POC scenarios pass in both Workers in `wrangler dev`
- All 4 POC scenarios pass after `wrangler deploy` to production
- Server function return type inferred from Drizzle — no `any` in Panel components
- Both Workers import from `@bowenlabs/cadmus/db` and `@bowenlabs/cadmus/cache` via workspace reference
- Both Workers confirmed reading the same D1 data (shared binding IDs)
- `apps/citadel/core/db/schema.ts` imports without errors in both Workers
- Biome passes with zero violations across `packages/cadmus/`, `apps/citadel/core/`, and both Worker directories
- Biome boundary rule fires when `apps/citadel/core/` attempts to import `apps/citadel/custom/`
- Both Worker bundle sizes documented — within 10MB Workers Paid limit
- `packages/cadmus/` has correct exports map — each primitive importable independently
- `packages/cadmus/README.md` exists with framework overview
- `DECISIONS.md` records: monorepo pivot, TanStack Start adoption, TanStack DB deferred to Section 2+
- Cache purge dev bypass confirmed via `@bowenlabs/cadmus/cache`

---

## 4. Monorepo structure

Thebes is a monorepo. Two critical boundaries:

1. **Cadmus ↔ Citadel:** `packages/cadmus/` never imports from `apps/citadel/`.
   Citadel imports from `@bowenlabs/cadmus`. This boundary is permanent.

2. **core ↔ custom (within Citadel):** `apps/citadel/core/` is BowenLabs
   territory, updated via upstream merge. `apps/citadel/custom/` is operator
   territory, never touched by updates. Enforced by Biome rules.

Both boundaries must be established in Phase 0 and never violated.

```
thebes/
│
├── packages/
│   └── cadmus/                        ← @bowenlabs/cadmus — framework package
│       ├── src/
│       │   ├── auth/                  ← Web Crypto, HMAC, magic link primitives
│       │   ├── db/                    ← Drizzle + D1 helper
│       │   ├── storage/               ← R2 helpers, ImageService interface
│       │   ├── cache/                 ← CF Cache API + dev bypass
│       │   ├── email/                 ← Email Workers send helper
│       │   ├── rate-limit/            ← KV-based rate limiter
│       │   ├── session/               ← KV session read/write/delete
│       │   └── index.ts               ← re-exports all primitives
│       ├── package.json               ← name: "@bowenlabs/cadmus", exports map
│       └── README.md
│
├── apps/
│   └── citadel/                        ← Citadel reference app
│       │
│       ├── workers/
│       │   ├── site/                  ← Worker 1: Astro public site
│       │   │   ├── wrangler.jsonc     ← bindings: DB, KV, R2, Email, nodejs_compat
│       │   │   ├── astro.config.ts    ← CF adapter, entrypoint: src/app.ts
│       │   │   ├── .dev.vars          ← local secrets (never commit)
│       │   │   ├── .dev.vars.example  ← committed, all keys, no values
│       │   │   ├── src/
│       │   │   │   ├── app.ts         ← Hono: custom routes → handle()
│       │   │   │   ├── env.d.ts       ← Env + App.Locals types
│       │   │   │   ├── pages/         ← Astro SSR pages
│       │   │   │   ├── layouts/
│       │   │   │   └── assets/app.css ← @import tailwindcss; @plugin "daisyui"
│       │   │   └── public/
│       │   │       ├── themes/        ← DaisyUI theme CSS (updated by Citadel)
│       │   │       └── custom/        ← operator static assets (never touched)
│       │   │
│       │   └── panel/                 ← Worker 2: TanStack Start Panel
│       │       ├── wrangler.jsonc     ← same binding IDs as site
│       │       ├── vite.config.ts     ← cloudflare(), tanstackStart(), tailwindcss()
│       │       ├── .dev.vars
│       │       ├── .dev.vars.example
│       │       └── app/
│       │           ├── server.ts      ← Hono public API + TanStack Start fallback
│       │           ├── middleware.ts  ← auth guard on /admin/* routes
│       │           ├── routes/
│       │           │   ├── __root.tsx ← root layout, imports panel.css
│       │           │   ├── login.tsx
│       │           │   └── admin/     ← all prerender = false
│       │           ├── server-functions/
│       │           ├── components/
│       │           └── styles/panel.css
│       │
│       ├── core/                      ← BowenLabs territory — never edit as operator
│       │   ├── components/
│       │   │   ├── site/              ← Astro components
│       │   │   └── panel/             ← Solid components
│       │   ├── lib/                   ← Citadel utilities (blocks, forms, design system)
│       │   └── db/
│       │       ├── schema.ts          ← Drizzle schema — single source of truth
│       │       └── migrations/        ← auto-generated, never hand-edit
│       │
│       ├── custom/                    ← operator territory — never overwritten
│       │   ├── components/site/
│       │   ├── components/panel/
│       │   ├── extensions/            ← operator custom extensions (Section 3+)
│       │   ├── themes/
│       │   └── seed/
│       │
│       ├── citadel.config.ts           ← operator config — never overwritten
│       ├── DECISIONS.md               ← operator architectural decisions
│       └── seed.ts
│
├── docs/                              ← Cadmus documentation site (Astro)
├── examples/                          ← standalone Cadmus usage examples
├── drizzle.config.ts                  ← points at apps/citadel/core/db/schema.ts
├── biome.json                         ← covers packages/, apps/, docs/, examples/
├── pnpm-workspace.yaml                ← packages/cadmus, apps/citadel, docs, examples/*
├── package.json                       ← root scripts
└── .github/
    └── workflows/
        ├── ci.yml                     ← lint + build on every push/PR
        └── update.yml                 ← weekly upstream merge from bowenlabs/thebes
```

### The `citadel.config.ts` contract

```typescript
// apps/citadel/citadel.config.ts
// This file is yours. Citadel will never overwrite it.

import type { CitadelConfig } from 'apps/citadel/core/lib/config'

const config: CitadelConfig = {
  theme: 'citadel',
  seed: {
    siteName: 'My Site',
    tagline:  '',
    brandColor: '#c45c2a',
    businessCase: 'general',
  },
}

export default config
```

### Boundary rules

**Cadmus (`packages/cadmus/`):**
- V8-first, Cloudflare-native primitives only
- No Citadel-specific code — ever
- Each primitive independently importable with zero cross-primitive dependencies
- PRs touching `packages/cadmus/` must not import from `apps/`

**Citadel core (`apps/citadel/core/`):**
- Citadel-specific components, utilities, schema
- Imports from `@bowenlabs/cadmus` — never from `apps/citadel/custom/`
- Updated via upstream merge — operators never edit these files
- PRs to `bowenlabs/thebes` that touch Citadel touch only `apps/citadel/core/`

**Citadel custom (`apps/citadel/custom/`):**
- Operator territory — Citadel never overwrites these files
- Imports from `apps/citadel/core/` — never from `packages/cadmus/` directly
- Custom components shadow core components of the same name
- Custom components shadow core components of the same name
- Custom themes layer on top of preset themes

**Entry points (`src/`):**
- Thin wrappers that import from `apps/citadel/core/` and apply `apps/citadel/custom/` overrides
- These files are generated by the seed script and updated by Citadel
  only when the override API changes (rare, semver-gated)

**`citadel.config.ts`:**
- Never overwritten by updates
- The operator's single source of truth for customization intent
- Read by core at build time and runtime

---

## 5. Update and maintenance model

### How Citadel updates flow to operator instances

```
BowenLabs pushes to bowenlabs/thebes:main
          │
          ▼
.github/workflows/update.yml runs weekly (Monday 09:00 UTC)
on every operator fork
          │
          ├── git fetch upstream main
          ├── git merge upstream/main --no-edit
          │     ├── No conflicts (common case — core/* only changed)
          │     │     └── Auto-merge + push to operator's main
          │     │           └── CI runs → deploy on pass
          │     └── Conflicts (operator edited core/* — should not happen)
          │           └── Open GitHub Issue with conflict details
          │                 └── Operator resolves manually
          └── done
```

### Why conflicts should be rare

Updates only touch `apps/citadel/core/`, `public/themes/`, and root config files.
Operators never edit `apps/citadel/core/`. If an operator wants to change core behavior,
they use `apps/citadel/custom/` overrides — which are never touched by updates.

The only realistic conflict sources are:
- Operator edited a file in `apps/citadel/core/` (violates the boundary — document this)
- Citadel changed a root config file the operator also changed (`wrangler.jsonc`,
  `drizzle.config.ts`) — Citadel should minimize touching these

### The `DECISIONS.md` file

Every significant architectural decision is recorded in `DECISIONS.md`
with date, options considered, decision made, and rationale. This file:
- Is operator-owned (in the repo root, not in `apps/citadel/core/`)
- Is never overwritten by updates
- Serves as institutional memory for why things are the way they are
- Is the first place a new engineer should read after `CLAUDE.md`

```markdown
# Decisions

## 2026-06-17 — Framework selection
**Decision:** Astro (Worker 1) + TanStack Start (Worker 2), VMFE architecture
**Options considered:** Hono + Astro + TanStack Router SPA, Astro + TanStack Start VMFE
**Rationale:** [evidence from Phase 0 POC — see DECISIONS.md]
**Revisit if:** TanStack Start 1.0 introduces breaking changes

## 2026-06-17 — Auth strategy
**Decision:** Hand-rolled magic link (Web Crypto + KV)
**Options considered:** CF Zero Trust, Better Auth, hand-rolled
**Rationale:** No third-party dependency, fits single-owner MVP, 
  team/customer auth deferred to Section 2
**Revisit if:** Team access needed (Section 2)
```

### White-glove maintenance tiers

**Tier 0 — Self-maintained (free)**
- Operator manages their own fork
- `update.yml` handles weekly upstream merges automatically
- CI auto-deploys on successful merge
- Operator resolves any conflicts manually

**Tier 1 — Managed updates (Section 2+)**
- Orchestrator monitors operator forks for failed update merges
- BowenLabs resolves conflicts on operator's behalf
- Paid tier

**Tier 2 — Fully managed (Section 3+)**
- BowenLabs manages the full deployment lifecycle
- Operator never touches GitHub
- Highest tier

The self-maintaining fork model is the foundation that makes all tiers
possible affordably. Tier 0 costs BowenLabs nothing per operator at scale.

---

## 6. Phase map

## 6. Phase map

```
Phase 0   Stack validation (Hono + Astro + TanStack Router)
          └── 4 POC scenarios + Hono RPC + Biome + ESLint boundary +
              single dev command + cache dev bypass + DECISIONS.md

Phase 1   Project foundation
          └── Astro (Worker 1) + TanStack Start (Worker 2) + shared core/ +
              Drizzle + VMFE structure + CI + update.yml

Phase 2   Database and schema
          └── Full Drizzle schema + migrations + seed skeleton

Phase 3   Authentication
          └── Magic link flow + session middleware

Phase 4   Design system
          └── DaisyUI themes + OKLCH scale + token cascade + live preview

Phase 5   Public site shell
          └── Layout, nav, footer, homepage variants, robots.txt

Phase 6   Page builder
          └── Block types + block canvas (Panel) + BlockRenderer (site)

Phase 7   Form builder
          └── Form schema + form builder UI + public form renderer + submission API

Phase 8   CRM and inbox
          └── Contacts + Activities + form submission inbox + contact upsert

Phase 9   Citadel Panel shell
          └── Panel layout, nav, dashboard, stat cards, activity feed

Phase 10  Settings and design Panel
          └── Site settings page + design page + live preview

Phase 11  Media and R2
          └── Upload API + ImageService + Panel media picker

Phase 12  Notifications
          └── CF Email Workers integration + form submission notifications

Phase 13  Seed, export, and hardening
          └── Full seed script + zip export + security audit

Phase 14  CI, testing, and accessibility audit
          └── Vitest + Playwright + axe-core + Snyk + deployment verification
```

**Build order rationale:**

Phase 0 gates everything — framework decision must be final before Phase 1 begins. Phase 0 gates everything — the framework decision must be final before Phase 1 begins. Phases 1–3 are the foundation. Nothing else can be built without them.
Phase 4 (design system) comes before any UI so components are built with
correct tokens from day one — never retrofitted. Phase 5 (public site shell)
before Phase 6 (page builder) so the renderer exists before the editor.
Phases 7–8 (forms + CRM) before Phase 9 (Panel shell) so the Panel has
real data to display. Phase 12 (notifications) after Phase 7 (forms) because
notifications are a side effect of form submission. Phases 13–14 last because
they harden what exists.

---

## Phase 1 — Project foundation

**Goal:** Both Workers promoted from POC scaffolds to production-ready
skeletons. Full repo structure in place. All tooling configured. CI passes.
`pnpm dev` starts both Workers. `pnpm deploy` deploys both Workers.

Phase 0 produced two working POC scaffolds in `apps/citadel/workers/site/` and
`apps/citadel/workers/panel/` — Phase 1 hardens them into the permanent repo structure,
adds all remaining dependencies, establishes the `apps/citadel/core/`/`apps/citadel/custom/` boundary,
and wires up CI. No new features. No schema beyond what Phase 0 proved out.
That all comes in Phase 2+.

### Milestones

**Worker 1 — Astro public site (`apps/citadel/workers/site/`):**
- [ ] **1.1** Promote Phase 0 Astro scaffold to permanent structure — confirm `apps/citadel/workers/site/src/app.ts` Hono entrypoint checks custom routes first, then falls through to `handle()` from `@astrojs/cloudflare/handler` (must be last). Do not use `astro/hono`'s `middleware()`/`pages()` — confirmed broken for custom Cloudflare entrypoints, see `DECISIONS.md`.
- [ ] **1.2** Confirm `apps/citadel/workers/site/astro.config.mjs` has `adapter: cloudflare()` (no `entrypoint` option — it doesn't exist on this adapter version), `output: 'server'`, `@tailwindcss/vite` plugin, and no `experimental.advancedRouting` flag
- [ ] **1.3** Confirm `apps/citadel/workers/site/wrangler.jsonc` has all bindings: D1, KV, R2, Email Workers (`send_email`), `nodejs_compat` flag, `observability: true`
- [ ] **1.4** Install @phosphor-icons/web in `apps/citadel/workers/site/`
- [ ] **1.5** Create `apps/citadel/workers/site/src/layouts/Layout.astro` — bare HTML shell, imports `app.css`, `<ViewTransitions />`, accepts `title` prop
- [ ] **1.6** Create `apps/citadel/workers/site/src/pages/index.astro` — placeholder reading `site_settings.siteName` from D1, renders in layout
- [ ] **1.7** Confirm `apps/citadel/workers/site/.dev.vars` exists and is in `.gitignore`; create `apps/citadel/workers/site/.dev.vars.example` with all required keys: `SESSION_SECRET`, `OWNER_EMAIL`, `MEDIA_URL`

**Worker 2 — TanStack Start Panel (`apps/citadel/workers/panel/`):**
- [ ] **1.8** Promote Phase 0 TanStack Start scaffold to permanent structure — confirm `apps/citadel/workers/panel/app/server.ts` custom entrypoint with Hono public API routes and TanStack Start fallback
- [ ] **1.9** Confirm `apps/citadel/workers/panel/vite.config.ts` has `cloudflare({ viteEnvironment: { name: 'ssr' } })`, `tanstackStart()`, `tailwindcss()` in correct order
- [ ] **1.10** Confirm `apps/citadel/workers/panel/wrangler.jsonc` has same D1, KV, R2 binding IDs as Worker 1, plus Email, `nodejs_compat`, `observability: true`, `"main": "app/server.ts"`
- [ ] **1.11** Install @phosphor-icons/web in `apps/citadel/workers/panel/`
- [ ] **1.12** Install TipTap in `apps/citadel/workers/panel/`: `@tiptap/core`, `@tiptap/starter-kit`, `@tiptap/html` (vanilla/framework-agnostic — no official Solid wrapper) — Panel-only dependency, never imported from `apps/citadel/core/`
- [ ] **1.13** Install Flowbite Charts in `apps/citadel/workers/panel/`: ApexCharts + Flowbite Charts wrapper — Panel-only dependency
- [ ] **1.14** Create `apps/citadel/workers/panel/src/routes/__root.tsx` — bare TanStack Router root layout, imports `panel.css`
- [ ] **1.15** Create `apps/citadel/workers/panel/src/routes/admin/dashboard.tsx` — placeholder route, `prerender = false`, calls `requireAuth()` in loader, renders "Dashboard"
- [ ] **1.16** Create `apps/citadel/workers/panel/src/routes/login.tsx` — placeholder login page (full login implementation is Phase 3)
- [ ] **1.17** Confirm `apps/citadel/workers/panel/.dev.vars` exists and is in `.gitignore`; create `apps/citadel/workers/panel/.dev.vars.example` with same keys as Worker 1
- [ ] **1.18** Confirm `export const prerender = false` on all Panel routes that use server functions — add lint comment or Biome rule to catch regressions

**Shared `apps/citadel/core/` structure:**
- [ ] **1.19** Establish permanent `apps/citadel/core/` directory structure at repo root:
  ```
  core/
  ├── components/
  │   ├── site/       ← Astro components shared across public site
  │   └── panel/      ← Solid components shared across Panel
  ├── lib/            ← all shared utilities (auth, db, cache, blocks, forms, etc.)
  └── db/
      ├── schema.ts   ← canonical Drizzle schema (promoted from Phase 0 minimal)
      └── migrations/ ← auto-generated, never hand-edit
  ```
- [ ] **1.20** Confirm `apps/citadel/core/lib/db.ts` exists (`db(d1: D1Database)` helper) — promoted from Phase 0
- [ ] **1.21** Confirm `apps/citadel/core/lib/cache.ts` exists with dev bypass — promoted from Phase 0
- [ ] **1.22** Create `apps/citadel/core/lib/auth.ts` stub — token generation + HMAC sign/verify signatures only, no implementation (Phase 3)
- [ ] **1.23** Create `apps/citadel/core/lib/session.ts` stub — KV session read/write/delete signatures only (Phase 3)
- [ ] **1.24** Create `apps/citadel/core/lib/image-service.ts` — full `ImageService` interface + `defaultImageService` R2 implementation (needed from Phase 5 onward, zero cost to add now)
- [ ] **1.25** Confirm `@core/*` path alias resolves in both Workers' `tsconfig.json` — promoted from Phase 0

**Operator `apps/citadel/custom/` structure:**
- [ ] **1.26** Create `apps/citadel/custom/` directory structure:
  ```
  apps/citadel/custom/
  ├── components/
  │   ├── site/       ← operator Astro component overrides
  │   └── panel/      ← operator Solid component overrides
  ├── blocks/         ← operator custom block types (Section 2+)
  ├── themes/         ← operator CSS theme overrides
  └── seed/           ← operator seed data overrides
  ```
- [ ] **1.27** Add `@apps/citadel/custom/*` path alias to both Workers' `tsconfig.json`
- [ ] **1.28** Confirm Biome boundary rule (from Phase 0) fires on any `apps/citadel/core/` → `apps/citadel/custom/` import attempt

**Operator config and public assets:**
- [ ] **1.29** Create `citadel.config.ts` at repo root with `CitadelConfig` type and documented defaults:
  ```typescript
  const config: CitadelConfig = {
    theme: 'citadel',
    seed: {
      siteName: 'My Site',
      tagline: '',
      brandColor: '#c45c2a',
      businessCase: 'general',
    },
  }
  ```
- [ ] **1.30** Create `apps/citadel/workers/site/public/themes/` — empty directory placeholder for DaisyUI theme CSS files (populated in Phase 4)
- [ ] **1.31** Create `apps/citadel/workers/site/public/apps/citadel/custom/` — empty directory for operator static assets, add `.gitkeep`

**Root tooling and scripts:**
- [ ] **1.32** Confirm `drizzle.config.ts` at repo root points at `apps/citadel/core/db/schema.ts` and `apps/citadel/core/db/migrations/`
- [ ] **1.33** Confirm `biome.json` at repo root covers `apps/citadel/core/`, `apps/citadel/workers/site/src/`, `apps/citadel/workers/panel/app/`, `apps/citadel/custom/` — promoted from Phase 0
- [ ] **1.34** Confirm root `package.json` scripts from Phase 0 are complete and correct. Note `dev:site`/`dev:panel`/`db:migrate` all need a **shared** `--persist-to` path — confirmed during Phase 0 (2026-06-19) that `wrangler dev` defaults its local D1 persistence to its own working directory, so two Workers sharing a `database_id` do *not* automatically share local data without this. `db:migrate` also needs `--config` (no wrangler config exists at the repo root) and the targeted config needs `migrations_dir` pointing at Drizzle's actual output, not the default `./migrations`. See `DECISIONS.md`:
  ```json
  "dev:site":        "cd workers/site && wrangler dev --port 3000 --persist-to ../../../../.wrangler/state",
  "dev:panel":       "cd workers/panel && wrangler dev --port 3001 --persist-to ../../../../.wrangler/state",
  "dev":             "concurrently \"pnpm dev:site\" \"pnpm dev:panel\"",
  "build:site":      "cd workers/site && astro build",
  "build:panel":     "cd workers/panel && vite build",
  "build":           "pnpm build:site && pnpm build:panel",
  "deploy:site":     "cd workers/site && wrangler deploy",
  "deploy:panel":    "cd workers/panel && wrangler deploy",
  "deploy":          "pnpm build && pnpm deploy:site && pnpm deploy:panel",
  "db:generate":     "drizzle-kit generate",
  "db:migrate":      "wrangler d1 migrations apply citadel-db --local --config apps/citadel/workers/site/wrangler.jsonc --persist-to ./.wrangler/state",
  "db:migrate:prod": "wrangler d1 migrations apply citadel-db --remote --config apps/citadel/workers/site/wrangler.jsonc",
  "db:studio":       "drizzle-kit studio",
  "lint":            "biome check .",
  "format":          "biome format --write ."
  ```
- [ ] **1.35** Confirm `pnpm-workspace.yaml` exists at repo root listing both Workers and `apps/citadel/core/`

**CI and update workflow:**
- [ ] **1.36** Create `.github/workflows/ci.yml`:
  - Triggers: push to `main`, PR to `main`
  - Steps: `pnpm lint` → `pnpm build:site` → `pnpm build:panel` → (test stubs — always pass in Phase 1)
  - Must pass before any deploy
- [ ] **1.37** Create `.github/workflows/update.yml`:
  - Trigger: schedule (weekly, Monday 09:00 UTC)
  - Steps: fetch `bowenlabs/thebes:main` → merge → run CI → push if clean → open GitHub issue if conflicts
  - Never auto-deploys on conflict — operator resolves manually
- [ ] **1.38** Create `CONTRIBUTING.md` noting: local dev requires both Workers running (`pnpm dev`), cookie auth must be tested on a custom domain not `workers.dev` (G6), `apps/citadel/core/` is never edited directly

**Security headers:**
- [ ] **1.39** Add security headers to `apps/citadel/workers/site/src/app.ts` Hono middleware (applies to all Worker 1 responses):
  - `Strict-Transport-Security: max-age=31536000; includeSubDomains`
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: SAMEORIGIN` — never DENY (preview iframes require SAMEORIGIN)
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
  - CSP: allowlist Cloudflare Fonts, Cloudflare Analytics, `'self'`
- [ ] **1.40** Add same security headers to `apps/citadel/workers/panel/app/server.ts` Hono middleware (applies to all Worker 2 API responses)

**Verification:**
- [ ] **1.41** `pnpm dev:site` starts Worker 1 on `:3000`, `apps/citadel/workers/site/src/pages/index.astro` renders without errors
- [ ] **1.42** `pnpm dev:panel` starts Worker 2 on `:3001`, `/admin/dashboard` redirects to `/login` (auth not yet implemented — redirect is correct)
- [ ] **1.43** `pnpm dev` starts both Workers concurrently with one command
- [ ] **1.44** `pnpm build` completes without errors for both Workers
- [ ] **1.45** `pnpm deploy` deploys both Workers to Cloudflare without errors
- [ ] **1.46** `pnpm lint` passes with zero Biome violations across all directories
- [ ] **1.47** Record Phase 1 completion in `DECISIONS.md` — note any findings that affect Phase 2

### Gotchas
- G1 (binding access), G5 (both Workers must run for full local dev), G6 (cookie auth needs custom domain for proper testing)
- Phase 0 scaffold files from `pnpm create cloudflare@latest` may include example routes, test files, or demo content — remove all of these before Phase 1 is considered complete. The skeleton must be clean.
- TipTap and Flowbite Charts are Panel-only (`apps/citadel/workers/panel/`) — never import them from `apps/citadel/core/` or `apps/citadel/workers/site/`. Biome boundary rules should catch this.
- Email Workers `send_email` binding must be in both `wrangler.jsonc` files even though only Worker 2 sends email — binding declarations are per-Worker and Worker 1 may need it in future phases
- `apps/citadel/workers/site/public/` is served as static assets by Astro — anything placed here is publicly accessible. Never put secrets, `.dev.vars`, or migration files here.
- Both Workers must have `nodejs_compat` in `compatibility_flags` — missing this causes subtle runtime failures that are hard to debug
- `pnpm-workspace.yaml`'s `packages` list must include a pattern matching `apps/citadel/workers/*` explicitly — `apps/*` alone only matches one directory level deep and silently excludes both Workers (three levels under `apps/`). **Confirmed during Phase 0 (2026-06-19):** with only `apps/*` in the list, `pnpm install` at the repo root reported "Already up to date" and did nothing for `panel/` — no error, no `node_modules`, no indication the package was never recognized as a workspace member. See `DECISIONS.md`.

### Acceptance criteria
- `pnpm dev:site` and `pnpm dev:panel` each start independently with full binding access
- `pnpm dev` starts both Workers with one command
- `pnpm build` completes without errors for both Workers
- `pnpm deploy` deploys both Workers to Cloudflare without errors
- `pnpm lint` passes with zero Biome violations
- CI (`ci.yml`) passes on GitHub on a clean push to `main`
- `update.yml` runs in a test fork — merges cleanly, opens issue on conflict
- `apps/citadel/core/`, `apps/citadel/custom/` directories exist with correct structure
- `@core/*` and `@apps/citadel/custom/*` path aliases resolve in both Workers
- `citadel.config.ts` exists at repo root with `CitadelConfig` type
- `DECISIONS.md` exists — Phase 0 + Phase 1 findings recorded
- Security headers present on all responses from both Workers
- No scaffold demo files, example routes, or placeholder content remaining
- `apps/citadel/workers/site/public/themes/` and `apps/citadel/workers/site/public/apps/citadel/custom/` directories exist
- Both Workers' `.dev.vars.example` committed; `.dev.vars` gitignored

---

## Phase 2 — Database and schema

**Goal:** Full Drizzle schema defined, migration applied locally, seed skeleton
in place. Drizzle Studio shows all tables with correct columns.

### Milestones

- [ ] **2.1** Create `apps/citadel/core/db/schema.ts` with all Section 1 tables:
  - `users` (id, email, role, firstName, lastName, createdAt)
  - `sessions` (id, userId, expiresAt, createdAt)
  - `magic_link_tokens` (id, email, tokenHash, expiresAt, used, createdAt)
  - `site_settings` (id=1 singleton, all identity/appearance/contact/nav/seo/features fields,
      plus domain fields: primaryDomain, domainProvider, nameserverDelegated, domainRegisteredViaCitadel,
      cfAccountId, cfApiTokenScoped — all nullable/default false; populated by Orchestrator in Section 2)
  - `pages` (id, title, slug, blocks JSON, status, createdAt, updatedAt, publishedAt)
  - `forms` (id, name, slug, fields JSON, createdAt, updatedAt)
  - `form_submissions` (id, formId, data JSON, sourcePage, status, createdAt)
  - `contacts` (id, firstName, lastName, email, phone, types JSON, status, notes, tags JSON, createdAt, updatedAt)
  - `activities` (id, contactId, type, summary, metadata JSON, occurredAt)
- [ ] **2.2** Add appropriate indexes:
  - `users.email` — unique
  - `pages.slug` — unique
  - `forms.slug` — unique
  - `contacts.email` — unique
  - `form_submissions.formId` — index
  - `activities.contactId` — index
  - `activities.occurredAt` — index (dashboard sort)
- [ ] **2.3** Add `site_settings` singleton constraint (CHECK id = 1 or unique index)
- [ ] **2.4** Run `pnpm db:generate` — confirm migration file created in `apps/citadel/core/db/migrations/`
- [ ] **2.5** Run `pnpm db:migrate` — confirm migration applies to local D1 without errors
- [ ] **2.6** Run `pnpm db:studio` — confirm all tables visible with correct columns
- [ ] **2.7** Create `apps/citadel/core/lib/blocks.ts` — `Block` union type + `isValidBlock()` validator
- [ ] **2.8** Create `apps/citadel/core/lib/forms.ts` — `FormField` union type + `isValidFormField()` validator
- [ ] **2.9** Create `seed.ts` skeleton — connects to D1, inserts `site_settings` (id=1) if not exists, inserts owner user from `OWNER_EMAIL` if not exists
- [ ] **2.10** Run `pnpm seed` — confirm seed runs without errors on local D1
- [ ] **2.11** Add `pnpm db:migrate:prod` script — `wrangler d1 migrations apply citadel-db --remote`

### Gotchas
- G7 (singleton enforcement), G14 (Drizzle D1 quirks)
- D1 is SQLite — no `ARRAY` type. JSON columns store arrays as JSON strings. Always parse on read, stringify on write.
- `blocks` and `fields` columns are `text` in SQLite, typed as `$type<Block[]>()` in Drizzle schema for TypeScript inference
- `returning()` after INSERT may not work in all D1 adapter versions — test before relying on it

### Acceptance criteria
- `pnpm db:studio` shows all 9 tables with correct columns and indexes
- `pnpm seed` runs idempotently (safe to run twice)
- TypeScript infers correct types from Drizzle schema on all table operations
- `Block` and `FormField` types are importable from `apps/citadel/core/lib/blocks.ts` and `apps/citadel/core/lib/forms.ts`

---

## Phase 3 — Authentication

**Goal:** Owner can request a magic link, click it, and access the Panel.
Unauthenticated `/admin/*` requests redirect to `/login`. Session persists
across requests. Logout clears session.

### Milestones

- [ ] **3.1** Create `apps/citadel/core/lib/auth.ts`:
  - `generateToken()` — `crypto.getRandomValues(32 bytes)` → hex string
  - `hashToken(token)` — `crypto.subtle.digest('SHA-256', ...)` → hex string
  - `generateSessionId()` — `crypto.getRandomValues(16 bytes)` → hex string
  - `signSession(sessionId, secret)` — HMAC-SHA256 → base64url string
  - `verifySession(sessionId, sig, secret)` — returns boolean
- [ ] **3.2** Create `apps/citadel/core/lib/session.ts`:
  - `getSession(kv, sessionId)` — KV get with retry (G3)
  - `createSession(kv, sessionId, payload, ttl)` — KV put
  - `deleteSession(kv, sessionId)` — KV delete
  - `parseSessionCookie(cookieHeader)` — splits `{sessionId}.{sig}`
- [ ] **3.3** Create `apps/citadel/core/lib/rate-limit.ts`:
  - `checkRateLimit(kv, key, limit, windowSeconds)` — KV incr pattern
  - Returns `{ allowed: boolean, remaining: number }`
- [ ] **3.4** Create `POST /api/auth/magic-link`:
  - Rate limit: 3 requests / 15 min per email (KV)
  - Lookup user by email in D1
  - If not found: return 200 (never confirm existence)
  - Generate token, hash, store in KV (TTL 900s)
  - Send email via `notify.ts` (or log to console in dev)
  - Return 200
- [ ] **3.5** Create `GET /api/auth/verify`:
  - Hash incoming token
  - KV get with retry (G3)
  - If miss: redirect `/login?error=invalid`
  - KV delete (single use)
  - Lookup user by email
  - Create session in KV (TTL 7 days)
  - Set signed cookie
  - Redirect `/admin/dashboard`
- [ ] **3.6** Create `POST /api/auth/logout`:
  - Parse session cookie
  - Delete session from KV
  - Clear cookie
  - Redirect `/login`
- [ ] **3.7** Create `middleware.ts`:
  - Match `/admin/*` paths
  - Parse + verify session cookie (HMAC, Web Crypto only — G2)
  - KV session lookup
  - Valid: attach user headers, continue
  - Invalid: redirect `/login`
- [ ] **3.8** Create `apps/citadel/workers/site/src/pages/login.astro` (Astro SSR login page):
  - Email input form
  - Posts to `/api/auth/magic-link`
  - Shows "Check your email" state
  - Shows error state for `?error=invalid` and `?error=unauthorized`
  - Dev mode: shows "Dev mode — token logged to console" notice
- [ ] **3.9** Create `apps/citadel/core/lib/notify.ts`:
  - `sendEmail(env, { to, subject, html })` — wraps CF Email Workers `send_email`
  - In dev (no EMAIL binding): logs to console, does not throw
- [ ] **3.10** Create `requireAuth()` helper for server functions:
  - Reads session from request headers (attached by middleware)
  - Throws if no session
  - Returns `{ userId, email, role }`
- [ ] **3.11** Create placeholder `apps/citadel/workers/panel/src/routes/admin/dashboard.tsx` that calls `requireAuth()` in its loader and renders "Dashboard — authenticated"
- [ ] **3.12** Verify redirect loop does not occur (login page must not be behind middleware)
- [ ] **3.13** Test end-to-end on custom domain (G6)

### Gotchas
- G2 (Web Crypto only), G3 (KV eventual consistency), G6 (cookie on workers.dev)
- Magic link email in dev: the EMAIL binding may not be available. `notify.ts` must handle this gracefully — log to console, never throw
- `middleware.ts` path matching must explicitly exclude `/login`, `/api/auth/*` — or the verify redirect will itself be blocked
- Session cookie path must be `/` not `/admin` — otherwise it won't be sent on the verify redirect

### Acceptance criteria
- In dev: requesting magic link logs token to console. Pasting the verify URL sets cookie and lands on dashboard.
- Unauthenticated request to `/admin/dashboard` redirects to `/login`
- After logout, session cookie is cleared and `/admin/*` redirects to `/login`
- `requireAuth()` throws in a server function when called without a valid session
- All crypto operations use `crypto.subtle` — no `import crypto from 'crypto'` anywhere in auth files

---

## Phase 4 — Design system

**Goal:** DaisyUI theme presets work. Brand color OKLCH scale overrides apply
correctly. Token cascade produces correct CSS custom properties on both public
site and Panel. Live preview iframe reflects token changes via postMessage.

### Milestones

- [ ] **4.1** Create six DaisyUI custom theme files in `public/themes/`:
  - `theme-citadel.css`, `theme-noir.css`, `theme-adobe.css`
  - `theme-flint.css`, `theme-sage.css`, `theme-blank-canvas.css`
  - Each defines DaisyUI token overrides in OKLCH for that theme's palette
- [ ] **4.2** Port `apps/citadel/core/lib/color-scale.ts` from v1 — generates 11-stop OKLCH scale from hex
- [ ] **4.3** Port `apps/citadel/core/lib/contrast.ts` from v1 — WCAG AA ratio checker
- [ ] **4.4** Port `apps/citadel/core/lib/font-pairing.ts` from v1 — 7 pairings + `buildFontUrl()`
- [ ] **4.5** Create `apps/citadel/core/lib/design-system/`:
  - `theme-presets.ts` — `ThemePreset` type + `THEME_PRESET_LIST`
  - `spacing-presets.ts` — Compact / Balanced / Airy token values
  - `type-defaults.ts` — default type scale token values
  - `resolve-spacing-tokens.ts` — merges preset with SiteSettings overrides
  - `resolve-type-tokens.ts` — merges defaults with SiteSettings `typeTokens`
  - `build-token-style.ts` — produces `<style>` tag content string from resolved tokens
- [ ] **4.6** Create `apps/citadel/core/lib/image-service.ts` — `ImageService` interface + `defaultImageService` (R2 direct, no transform)
- [ ] **4.7** Update `apps/citadel/workers/site/src/layouts/Layout.astro` (root Astro layout):
  - Set `data-theme="{theme}"` on `<html>`
  - Set `.dark` class if `darkMode` is true
  - Load theme CSS: `<link href="/themes/theme-{name}.css">`
- [ ] **4.8** Create `apps/citadel/workers/site/src/pages/layout.tsx` (site layout):
  - Fetch `site_settings` from D1
  - Resolve font pairing → inject `<link>` for Cloudflare Fonts
  - Call `generateColorScale(brandColor)` → inject primary/secondary/tertiary OKLCH overrides
  - Call `buildTokenStyle(spacing, type, structural)` → inject `<style>` tag
  - Mount `<PreviewTokenListener>` (activates only on `?preview=1`)
  - Inject CF Web Analytics if `CF_ANALYTICS_TOKEN` set
- [ ] **4.9** Create `<PreviewTokenListener>` client component:
  - Mounts only if `?preview=1` in URL
  - Listens for `postMessage` of type `louise:token-update`
  - Validates `event.origin === window.location.origin`
  - Applies token overrides to `document.documentElement` style
- [ ] **4.10** Create `<BrandColorProvider>` client component for Panel:
  - Sets `data-theme`, loads theme CSS, injects overrides on mount and on `louise:panel-preview` events
  - Used in Panel layout to keep Panel UI in sync with owner's active theme
- [ ] **4.11** Create `apps/citadel/workers/site/src/assets/app.css`:
  - Tailwind v4 `@import`
  - `@theme inline` block mapping DaisyUI token names to Tailwind utilities
  - `prose-site` class mapping `--tw-prose-*` to DaisyUI tokens
- [ ] **4.12** Verify token cascade — create a test page that renders all theme presets and confirms OKLCH overrides apply correctly (G12)

### Gotchas
- G12 (OKLCH override order — `<style>` must come after `<link>` in `<head>`)
- DaisyUI v5 OKLCH token names differ from v4 — confirm correct variable names from DaisyUI v5 docs before writing theme files
- `generateColorScale` produces OKLCH strings — DaisyUI v5 tokens expect OKLCH channel values without the `oklch()` wrapper in some cases. Verify the exact format DaisyUI v5 expects for CSS variable overrides.
- Cloudflare Fonts: link to `fonts.googleapis.com` — CF intercepts at edge. Never `fonts.cloudflare.com`.

### Acceptance criteria
- All six themes render correctly on a test page
- Brand color OKLCH override visibly changes the primary color on the test page
- `?preview=1` + postMessage updates CSS custom properties without reload
- Dark mode class toggles correctly
- No FOUC on the public site (tokens are server-rendered)
- `prose-site` class renders rich text with correct theme colors

---

## Phase 5 — Public site shell

**Goal:** Public site renders with nav, footer, and homepage. `/[slug]` catch-all
works. `/coming-soon` renders. `robots.txt` generates correctly.

### Milestones

- [ ] **5.1** Create `<SiteNav>` server component:
  - Fetches nav links from `site_settings.navLinks` or auto-builds from published pages
  - Logo + site name
  - CSS-only mobile menu (`<details>` / `<summary>`) — no JavaScript
  - Active route highlighting
  - WCAG AA: keyboard navigation, focus-visible, ARIA labels
- [ ] **5.2** Create `<SiteFooter>` server component:
  - Social links from `site_settings.socialLinks`
  - Contact info from `site_settings.contact`
  - Copyright line
- [ ] **5.3** Create four homepage layout components:
  - `<HomepageEditorial>` — text-forward, article style
  - `<HomepageMinimal>` — single CTA
  - `<HomepageGallery>` — visual-forward
  - `<HomepageStory>` — narrative, mission-driven
  - All accept `{ settings, heroTitle, heroBody }` props
- [ ] **5.4** Create `apps/citadel/workers/site/src/pages/page.tsx` (homepage):
  - Fetch `site_settings` + page with `slug: 'home'`
  - Switch on `homepageLayout` → render correct variant
  - Add `Cache-Control: public, max-age=60` response header (G4)
- [ ] **5.5** Create `apps/citadel/workers/site/src/pages/[slug]/page.tsx` (catch-all):
  - Exclude reserved slugs: `home`, `about`, `contact`
  - Fetch page by slug, status = 'published'
  - `notFound()` if not found
  - Render `<BlockRenderer blocks={page.blocks} />`
  - No static prerendering — Astro SSR renders all pages dynamically
  - `Cache-Control: public, max-age=60` on Astro SSR responses
- [ ] **5.6** Create `apps/citadel/workers/site/src/pages/about/page.tsx`:
  - Fetch page with `slug: 'about'`
  - `notFound()` if not found
  - Render title + `<BlockRenderer>`
- [ ] **5.7** Create `apps/citadel/workers/site/src/pages/contact/page.tsx`:
  - Fetch page with `slug: 'contact'` + `site_settings.contact`
  - Render contact info + `<PublicForm>` for the contact form
- [ ] **5.8** Create `apps/citadel/workers/site/src/pages/coming-soon/page.tsx`:
  - Fetch `site_settings` for branding only
  - Render minimal branded screen with back-to-home link
  - `<meta name="robots" content="noindex">`
  - Returns 200 — not a 404
- [ ] **5.9** Create `apps/citadel/workers/site/src/pages/robots.txt.ts` (Astro endpoint):
  - Fetch `site_settings.seo.disableIndexing`
  - If true: `Disallow: /`
  - Always disallow: `/admin/`, `/api/`, `/coming-soon`
  - Include sitemap URL when indexing enabled
- [ ] **5.10** Create `apps/citadel/workers/site/src/pages/404.astro` — site-scoped 404 with nav + footer
- [ ] **5.11** Create `apps/citadel/workers/site/src/pages/500.astro` — site-scoped error page

### Gotchas
- `[slug]` catch-all must list reserved slugs to prevent shadowing dedicated routes
- Astro SSR renders all pages dynamically — no static prerendering of content pages
- `revalidate = 60` not `revalidate = 3600` until G4 is resolved

### Acceptance criteria
- Homepage renders with correct layout variant from `site_settings`
- `/about`, `/contact`, `/coming-soon` render without errors
- `/nonexistent` renders the site-scoped 404
- `/robots.txt` returns correct content based on `disableIndexing`
- Nav renders published pages, active route highlighted
- All interactive elements pass keyboard navigation test

---

## Phase 6 — Page builder

**Goal:** Owner can create, edit, and publish pages via a block canvas in the
Panel. Blocks render correctly on the public site via `<BlockRenderer>`.

### Milestones

- [ ] **6.1** Create `<BlockRenderer>` public site component:
  - Renders `Block[]` from `pages.blocks`
  - `richText` → `tiptapToHtml(content)` via `apps/citadel/core/lib/rich-text.ts`
  - `image` → `imageService.render(block)` → `<img>` with `loading="lazy"`, `decoding="async"`, `srcset` (G9)
  - `hero` → `<HeroBlock>`
  - `form` → fetch form by id → `<PublicForm>`
  - `columns` → recursive `<BlockRenderer>` per column
  - `divider` → `<hr>`
- [ ] **6.2** Create `apps/citadel/core/lib/rich-text.ts` — `tiptapToHtml(content: JSONContent): string` using `@tiptap/html` (G11)
- [ ] **6.3** Create Panel page list: `apps/citadel/workers/panel/src/routes/admin/pages/page.tsx`
  - Fetch all pages sorted by `updatedAt` DESC
  - Table: title, slug, status, updatedAt
  - "New page" button → `/admin/pages/new`
  - Click row → `/admin/pages/[id]`
- [ ] **6.4** Create Panel block canvas editor: `apps/citadel/workers/panel/src/routes/admin/pages/[id]/page.tsx`
  - Load page by id (or blank for "new")
  - Render `<PageEditor>` client component
- [ ] **6.5** Create `<PageEditor>` client component:
  - Title field (auto-generates slug on new pages)
  - Slug field (editable, validated unique)
  - Status toggle (draft / published)
  - Block canvas: ordered list of blocks with add / reorder / delete
  - Per-block edit modal (inline or side panel)
  - Save button → calls `savePage` server action
  - Preview button (existing pages) → opens `/{slug}` in iframe
- [ ] **6.6** Create block edit components for each block type:
  - `<RichTextBlockEditor>` — TipTap editor instance
  - `<ImageBlockEditor>` — upload + alt text + caption
  - `<HeroBlockEditor>` — heading, subtext, CTA label + href fields
  - `<FormBlockEditor>` — form picker (select from existing forms)
  - `<ColumnsBlockEditor>` — column count picker + nested block canvas per column
  - `<DividerBlockEditor>` — no fields, just confirm
- [ ] **6.7** Create `savePage` server action:
  - `requireAuth()`
  - Validate blocks with `isValidBlock()` on each item
  - INSERT or UPDATE `pages` table
  - If published: set `publishedAt`
  - POST `/api/revalidate` with affected paths
- [ ] **6.8** Create `deletePage` server action:
  - `requireAuth()`
  - DELETE from `pages` where id = id
  - POST `/api/revalidate`
  - Redirect to `/admin/pages`
- [ ] **6.9** Create `POST /api/revalidate`:
  - Validate `Authorization: Bearer {CITADEL_SERVICE_KEY}`
  - Call `purgeCache()` from `apps/citadel/core/lib/cache.ts` for each affected URL
  - Calls `purgeCache()` from `apps/citadel/core/lib/cache.ts` — skipped silently in dev (G4)
- [ ] **6.10** Verify `<BlockRenderer>` renders all block types on the public site
- [ ] **6.11** Verify TipTap extensions in editor match extensions in `generateHTML` (G11)

### Gotchas
- G4 (cache invalidation), G9 (ImageService), G11 (TipTap extensions must match)
- Slug uniqueness: validate on the client (debounced async check) and on the server (Drizzle unique constraint catch)
- Nested `columns` block: `BlockRenderer` must handle recursive rendering without infinite loops — guard max depth (e.g. 3 levels)
- Block reordering: store blocks as an ordered array in JSON — position is implicit by array index, no `order` field needed
- `<PageEditor>` is a large client component — use dynamic import (`() => import('../components/PageEditor')`) so it doesn't bloat the Panel initial bundle

### Acceptance criteria
- Owner can create a page with all 6 block types
- Saved page renders correctly on the public site
- Published page appears in `/[slug]`
- Draft page returns 404 on the public site
- Deleting a page removes it and revalidates the cache
- Block canvas is keyboard accessible (add, reorder, delete without mouse)

---

## Phase 7 — Form builder

**Goal:** Owner can create forms with multiple field types. Forms can be
embedded in pages via the `form` block. Submissions are validated, stored,
and trigger contact upsert + activity log.

### Milestones

- [ ] **7.1** Create Panel form list: `apps/citadel/workers/panel/src/routes/admin/forms/page.tsx`
- [ ] **7.2** Create Panel form builder: `apps/citadel/workers/panel/src/routes/admin/forms/[id]/page.tsx`
  - Form name + slug fields
  - Field list with add / reorder / delete
  - Per-field editor: type picker, label, name (auto-generated from label), required toggle, placeholder, options (for select)
  - Enforce `type: 'email'` for email fields — not `type: 'text'` (G8)
  - Save button → `saveForm` server action
- [ ] **7.3** Create `saveForm` server action:
  - `requireAuth()`
  - Validate each field with `isValidFormField()`
  - INSERT or UPDATE `forms` table
- [ ] **7.4** Create `<PublicForm>` client component:
  - Renders `FormField[]` as HTML inputs
  - Includes honeypot field: `<input name="website" style="display:none" aria-hidden tabIndex={-1} />`
  - Client-side validation (required fields, email format)
  - Submits to `POST /api/form/[slug]`
  - Shows success state, error state
  - Never reveals internal errors
- [ ] **7.5** Create `POST /api/form/[slug]`:
  - Parse + validate body
  - Honeypot check (G submission flow — see data flow diagram)
  - Rate limit: 10/hour per IP (KV)
  - Lookup form by slug in D1
  - Validate fields against `form.fields`
  - INSERT `form_submissions`
  - Call `upsertContact()` if email field found (G8)
  - INSERT `activities` (`type: 'form_submission'`)
  - Send notification (Phase 12 — stub for now, skip silently)
  - Return 200 generic success
- [ ] **7.6** Create `apps/citadel/core/lib/upsert-contact.ts`:
  - Find contact by email in D1
  - If found: merge `types` array (add new type if not present), UPDATE
  - If not found: INSERT with `types: ['lead']`
  - Returns contact id in both cases
- [ ] **7.7** Verify `<FormBlockEditor>` in page builder shows form picker with existing forms
- [ ] **7.8** Verify end-to-end: create form → embed in page → submit → submission appears in D1

### Gotchas
- G8 (email field detection by type, not name)
- Rate limiting key: use IP from `CF-Connecting-IP` header (Cloudflare sets this), not `x-forwarded-for` (easily spoofed)
- Honeypot field: `display:none` is not enough — also needs `aria-hidden="true"` and `tabIndex={-1}` so screen readers and keyboard users don't interact with it
- Field `name` attribute: auto-generate from label (slugify), but allow override. The `name` is what appears in `form_submissions.data` keys.
- `form_submissions.data` is JSON — stored as `{ fieldName: value }` map

### Acceptance criteria
- Owner can create a form with all 6 field types
- Form embedded in a page renders correctly on the public site
- Honeypot submission is silently discarded (returns 200, nothing stored)
- Rate-limited submission returns 429 with generic message
- Valid submission creates `form_submission`, upserts contact, creates activity
- `type: 'email'` field correctly triggers contact upsert; `type: 'text'` field does not

---

## Phase 8 — CRM and inbox

**Goal:** Form submissions appear in the Panel inbox. Contacts are visible in
the people list. Activities display on the dashboard.

### Milestones

- [ ] **8.1** Create Panel inbox: `apps/citadel/workers/panel/src/routes/admin/inbox/page.tsx`
  - Two-pane layout: submission list (left) + detail (right)
  - List: sender name/email, form name, date, status badge
  - Filter tabs: All / New / Archived (with counts)
  - Search input (client-side, filters by name/email/message)
  - Detail pane: full submission data, mark as archived button
- [ ] **8.2** Create `updateSubmissionStatus` server action:
  - `requireAuth()`
  - UPDATE `form_submissions` set status = 'archived' where id = id
  - Optimistic update in UI via `useOptimistic`
- [ ] **8.3** Create Panel people list: `apps/citadel/workers/panel/src/routes/admin/people/page.tsx`
  - Table: name, email, types, status, createdAt
  - Client-side search by name/email
  - Click row → contact detail (read-only in Section 1)
- [ ] **8.4** Create contact detail view: `apps/citadel/workers/panel/src/routes/admin/people/[id]/page.tsx`
  - Contact fields (read-only display in Section 1)
  - Activity timeline for this contact
- [ ] **8.5** Create `<ActivityFeed>` component:
  - Renders `Activity[]` as vertical timeline
  - Each item: icon (by type), summary, relative timestamp
  - Used on both dashboard and contact detail
- [ ] **8.6** Create `<StatCard>` component — label, value, icon, optional href, optional badge
- [ ] **8.7** Create Panel dashboard: `apps/citadel/workers/panel/src/routes/admin/dashboard/page.tsx`
  - Stat cards: total pages, total contacts, unread submissions, total forms
  - Recent activity feed (last 20 activities)
  - Time-based greeting

### Acceptance criteria
- New form submission appears in inbox with status "new"
- Marking as archived updates status + badge count
- People list shows all contacts created via form submission upsert
- Dashboard stat cards show correct counts
- Activity feed shows recent form submissions with correct contact link

---

## Phase 9 — Citadel Panel shell

**Goal:** Panel has a complete, accessible shell — nav, header, layout —
that works on mobile and desktop. All Panel routes are reachable from the nav.

### Milestones

- [ ] **9.1** Create `apps/citadel/workers/panel/src/routes/layout.tsx`:
  - Fetch `site_settings` for site name, brand, theme
  - Fetch unread submission count (for inbox badge)
  - Wrap in `<BrandColorProvider>`
  - Render `<PanelShell>`
  - All Panel routes use `export const prerender = false` — never prerender
- [ ] **9.2** Create `<PanelShell>` client component:
  - Owns mobile sidebar open/close state
  - Renders `<LouiseNav>` + `<LouiseHeader>` + mobile overlay
  - Sets `data-theme` wrapper
- [ ] **9.3** Create `<LouiseNav>`:
  - Citadel logo + site name
  - Nav sections: CONTENT (Pages, Forms), PEOPLE (Inbox, Contacts), SITE (Settings, Design, Extensions)
  - Active route highlight
  - Inbox badge (unread count)
  - Sign-out link → `POST /api/auth/logout`
  - Mobile: slides in from left, close button, overlay backdrop
  - WCAG AA: keyboard nav, focus-visible, ARIA landmarks
- [ ] **9.4** Create `<LouiseHeader>`:
  - Current page title (from route)
  - View live site link
  - Mobile hamburger button
- [ ] **9.5** Create `/admin/extensions` page — static list of coming-soon extensions
- [ ] **9.6** Verify Panel nav is fully keyboard accessible
- [ ] **9.7** Verify Panel renders correctly on 375px (iPhone SE) viewport

### Acceptance criteria
- All Panel routes reachable from nav
- Mobile sidebar opens, closes, and traps focus correctly
- Unread count badge updates when submissions are marked archived
- Panel inherits owner's active theme via `<BrandColorProvider>`
- No JavaScript errors in console on any Panel route

---

## Phase 10 — Settings and design Panel

**Goal:** Owner can update site settings and design settings from the Panel.
Changes to design settings update the Panel UI live and reflect on the public
site after save.

### Milestones

- [ ] **10.1** Create Panel settings page: `apps/citadel/workers/panel/src/routes/admin/settings/page.tsx`
  - Tabs: General, Contact, SEO, Export
  - General: site name, tagline, logo upload (links to Phase 11), favicon upload
  - Contact: email, phone, address, social links
  - SEO: meta description, disable indexing toggle
  - Export: export button (links to Phase 13)
- [ ] **10.2** Create `saveSettings` server action (identity + contact + SEO only):
  - `requireAuth()`
  - UPDATE `site_settings` where id = 1
  - POST `/api/revalidate` for affected paths
- [ ] **10.3** Create Panel design page: `apps/citadel/workers/panel/src/routes/admin/design/page.tsx`
  - Tabs: Theme, Colors, Typography, Spacing
  - Theme tab: `<ThemePresetPicker>` + homepage layout + dark mode + `<SettingsPreviewPane>`
  - Colors tab: `<BrandColorPicker>` (primary, secondary, tertiary) with OKLCH ramp + AA warning
  - Typography tab: font pairing picker + type scale token editor
  - Spacing tab: spacing preset picker
- [ ] **10.4** Create `saveDesignSettings` server action (design fields only):
  - `requireAuth()`
  - UPDATE `site_settings` where id = 1 (design fields only)
  - POST `/api/revalidate`
- [ ] **10.5** Create `<DesignForm>` client component:
  - Owns all design state
  - Dispatches `louise:panel-preview` events on change (debounced 150ms) for Panel live preview
  - Calls `saveDesignSettings` on save
  - Invalidate TanStack Query cache after save: `queryClient.invalidateQueries({ queryKey: ['settings'] })`
- [ ] **10.6** Create `<SettingsPreviewPane>`:
  - iframe pointing to `/?preview=1`
  - Sends `postMessage` type `louise:token-update` on token changes (debounced 150ms)
  - Scoped to `window.location.origin`
  - Triggers full iframe reload after save
- [ ] **10.7** Create `<ThemePresetPicker>` — 6 theme cards with live preview of palette, fonts, radius
- [ ] **10.8** Create `<BrandColorPicker>` — hex input + OKLCH ramp + AA contrast warning using `contrast.ts`
- [ ] **10.9** Create `<FontPairingPicker>` — 7 pairing cards with live font preview
- [ ] **10.10** Verify `X-Frame-Options: SAMEORIGIN` in Hono security headers middleware — never DENY

### Acceptance criteria
- Saving general settings updates site name on next page load
- Changing brand color in design panel updates Panel UI live (without save)
- Preview iframe reflects token changes without reload
- After save, public site reflects new design tokens within 60 seconds (ISR)
- AA contrast warning appears when brand color fails WCAG AA

---

## Phase 11 — Media and R2

**Goal:** Owner can upload images from the Panel. Images are stored in R2 and
served via the public R2 URL. `<BlockRenderer>` renders images via `ImageService`.

### Milestones

- [ ] **11.1** Create `POST /api/media/upload`:
  - `requireAuth()` — validate session from cookie
  - Parse multipart form data
  - Validate: image MIME types only (jpeg, png, webp, gif, svg)
  - Validate: max 5MB — return 413 with clear message if exceeded (G10)
  - Generate unique key: `media/{uuid}.{ext}`
  - `env.R2.put(key, file, { httpMetadata: { contentType } })`
  - Return `{ url: 'https://media.{domain}/{key}' }`
- [ ] **11.2** Update `defaultImageService.upload` in `apps/citadel/core/lib/image-service.ts` to call `/api/media/upload`
- [ ] **11.3** Create `<MediaUploader>` client component:
  - Drag-and-drop + click-to-browse
  - Shows upload progress
  - Shows 5MB limit warning before upload
  - On success: returns URL to parent component
  - On error: shows user-friendly message
- [ ] **11.4** Integrate `<MediaUploader>` into:
  - `<ImageBlockEditor>` (page builder)
  - Settings page logo + favicon fields
- [ ] **11.5** Verify `imageService.render()` is called everywhere images are displayed — no direct `block.url` access (G9)
- [ ] **11.6** Document R2 public bucket setup in README (G13):
  - Enable public access on R2 bucket
  - Add custom domain `media.{domain}` to bucket
  - Verify URL is accessible before uploading

### Gotchas
- G10 (no Sharp), G13 (R2 must be public)
- R2 `put()` does not return the public URL — construct it from `MEDIA_URL` env var + key
- Add `MEDIA_URL` to env vars in `CLAUDE.md` (missed in initial list)
- MIME type validation on the server — never trust client-side file type
- UUID generation for file keys: use `crypto.randomUUID()` (available in Workers)

### Acceptance criteria
- Uploading a valid image stores it in R2 and returns a public URL
- Uploading a file > 5MB returns a clear error
- Uploading a non-image file is rejected
- Image block in page builder shows uploaded image in preview
- Public site renders image via `imageService.render()` with `loading="lazy"` and `decoding="async"`

---

## Phase 12 — Notifications

**Goal:** Owner receives an email notification when a form submission arrives.
Email is sent via CF Email Workers. Notification is best-effort — form
submission succeeds even if email fails.

### Milestones

- [ ] **12.1** Implement `notify.ts` fully:
  - `sendFormNotification(env, { formName, submitterEmail, data, submissionId })`
  - Builds HTML email with submission data
  - Calls `env.EMAIL.send({ from, to: OWNER_EMAIL, subject, html })`
  - Catches all errors — never throws (best-effort)
  - In dev (no EMAIL binding): logs to console
- [ ] **12.2** Call `sendFormNotification` in `POST /api/form/[slug]` after activity log
- [ ] **12.3** Call `notify.ts` in `/api/auth/magic-link` for magic link email
- [ ] **12.4** Document CF Email Routing setup in README:
  - CF Email Routing must be enabled on the domain
  - SPF, DKIM, DMARC must be configured manually in CF DNS
  - Provide exact DNS record values
  - `send_email` binding must have a verified sending address
- [ ] **12.5** Test notification end-to-end: submit form → owner receives email

### Gotchas
- CF Email Workers `send_email` binding requires the from address to be on a domain with CF Email Routing active
- The `from` address must be configured in `wrangler.jsonc` under the `send_email` binding
- In dev without the binding: `env.EMAIL` is undefined — `notify.ts` must check for this and log instead of throwing
- Email HTML should be simple — no external CSS, inline styles only, for email client compatibility

### Acceptance criteria
- Form submission triggers owner notification email
- Email contains form name, submitter email, and all field values
- If EMAIL binding is unavailable, form submission still succeeds (no thrown error)
- Magic link email delivers correctly and link works

---

## Phase 13 — Seed, export, and hardening

**Goal:** Full seed script works end-to-end. Export produces a valid zip.
Security headers are correct. Error boundaries work.

### Milestones

- [ ] **13.1** Complete `seed.ts`:
  - Check/create `site_settings` (id=1) with defaults
  - Check/create owner user from `OWNER_EMAIL`
  - Check/create starter pages: Home (slug: 'home'), About (slug: 'about'), Contact (slug: 'contact')
  - Check/create starter contact form (with name, email, message fields)
  - Embed contact form in Contact page blocks
  - All operations idempotent (safe to run twice)
  - Verify R2 bucket accessible — warn if not (G13)
  - Log clear success/failure for each step
- [ ] **13.2** Create `apps/citadel/core/lib/export.ts`:
  - Fetch all tables from D1
  - Serialize to JSON per table
  - Fetch all R2 objects (list + get)
  - Assemble zip via `fflate`:
    ```
    louise-export-{date}/
    ├── data/
    │   ├── site_settings.json
    │   ├── pages.json
    │   ├── forms.json
    │   ├── form_submissions.json
    │   ├── contacts.json
    │   └── activities.json
    ├── media/     (all R2 objects)
    └── README.md  (migration instructions)
    ```
  - Stream zip as response
- [ ] **13.3** Create `POST /api/export` route handler:
  - `requireAuth()`
  - Calls `export.ts`
  - Returns binary zip with `Content-Disposition: attachment`
- [ ] **13.4** Create `<ExportButton>` client component:
  - POSTs to `/api/export`
  - Triggers browser download
  - Shows loading state
- [ ] **13.5** Security header audit:
  - CSP: allows Cloudflare Fonts, Cloudflare Analytics, `SAMEORIGIN` for iframes
  - HSTS: `max-age=31536000; includeSubDomains`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
  - `X-Frame-Options: SAMEORIGIN` — never DENY
- [ ] **13.6** Error boundary audit:
  - `apps/citadel/workers/site/src/pages/404.astro` — site-scoped 404 with nav + footer
  - `apps/citadel/workers/site/src/pages/500.astro` — site-scoped error page
  - TanStack Start Panel routes: `errorComponent` on route definitions — Panel-scoped error UI
- [ ] **13.7** Verify seed script on a fresh D1 instance (wipe + remigrate + reseed)
- [ ] **13.8** Ensure the deployment is accessible at its `*.workers.dev` URL before any custom domain is pointed — this is the **preview URL** that Section 2's zero-downtime cutover flow depends on. Clients with an existing live site must be able to review their Citadel deployment at the preview URL before the nameserver flip. Do not remove or restrict access to the `workers.dev` URL in production.

### Acceptance criteria
- `pnpm seed` on a fresh database creates all expected rows
- `pnpm seed` on an already-seeded database changes nothing
- Export zip contains all data tables as JSON + all media files
- Security headers present on all responses (verify with `curl -I`)
- Error boundaries render correct UI on thrown errors in each route group

---

## Phase 14 — CI, testing, and accessibility audit

**Goal:** CI passes on every push. Integration tests cover critical paths.
E2e tests cover key user flows. axe-core finds zero violations. Snyk finds
no critical vulnerabilities.

### Milestones

- [ ] **14.1** Install Vitest for integration tests
- [ ] **14.2** Install Playwright + `@axe-core/playwright` for e2e + accessibility
- [ ] **14.3** Install Snyk in CI (`snyk test` on every push)
- [ ] **14.4** Write integration tests (`tests/int/`):
  - `auth.test.ts` — token generation, hashing, session create/read/delete, rate limit
  - `form-submission.test.ts` — valid submission, honeypot discard, rate limit, contact upsert
  - `upsert-contact.test.ts` — new contact, existing contact merge, type dedup
  - `export.test.ts` — export produces valid zip with correct structure
  - `image-service.test.ts` — `defaultImageService.render()` returns correct src
- [ ] **14.5** Write e2e tests (`tests/e2e/`):
  - `auth.spec.ts` — magic link flow (dev mode), logout, unauthenticated redirect
  - `page-builder.spec.ts` — create page, add blocks, save, view on public site
  - `form-builder.spec.ts` — create form, embed in page, submit, view in inbox
  - `settings.spec.ts` — update site name, verify on public site
  - `design.spec.ts` — change theme, verify Panel updates live
  - `accessibility.spec.ts` — axe-core scan on every public + Panel route
- [ ] **14.6** Update CI (`ci.yml`):
  - `pnpm lint`
  - `pnpm build`
  - `pnpm test:int`
  - `pnpm test:e2e`
  - `snyk test`
- [ ] **14.7** Accessibility audit:
  - Run axe-core on all public routes
  - Run axe-core on all Panel routes
  - Fix all violations — zero violations is the acceptance bar
  - Manual VoiceOver test on: login, page editor, form builder, inbox
- [ ] **14.8** Bundle size check:
  - Run `ANALYZE=true pnpm build`
  - Confirm Worker bundle is within Workers Paid plan limit (10MB)
  - Document actual size in CONTRIBUTING.md

### Acceptance criteria
- CI passes on a clean push: lint + build + int tests + e2e tests + Snyk
- Zero axe-core violations on all routes
- Integration tests cover all critical paths with no mocked D1 (real local D1)
- Worker bundle size documented and within limits
- VoiceOver navigates login, page editor, and form builder without issues

---

## 21. Dependency graph

```
Phase 0 (Stack Validation — Hono + Astro + TanStack) ← gates everything
    └── Phase 1 (Foundation + core/custom structure + update.yml)
            └── Phase 2 (Schema)
                    └── Phase 3 (Auth)
                            └── Phase 4 (Design System)
                                    ├── Phase 5 (Public Site Shell)
                                    │       └── Phase 6 (Page Builder)
                                    │               └── Phase 7 (Form Builder)
                                    │                       └── Phase 8 (CRM + Inbox)
                                    │                               └── Phase 9 (Panel Shell)
                                    │                                       └── Phase 10 (Settings + Design Panel)
                                    │                                               └── Phase 11 (Media + R2)
                                    │                                                       └── Phase 12 (Notifications)
                                    │                                                               └── Phase 13 (Seed + Export + Hardening)
                                    │                                                                       └── Phase 14 (CI + Testing + Accessibility)
                                    └── (Phase 9 also depends on Phase 8 for real data)
```

Phases must be completed in order. No phase should be started until its
predecessor's acceptance criteria are met.

Phase 0 is the hardest gate — the framework decision is permanent. Take the
time to build both POCs properly before deciding.

---

## 22. Definition of done checklist

Section 1 is complete when every item below is true:

### Functional
- [ ] Owner deploys Citadel to Cloudflare Workers from a README
- [ ] Owner logs in via magic link — no password
- [ ] Owner creates a page with all 6 block types and publishes it
- [ ] Published page is accessible at `/{slug}` on the public site
- [ ] Owner creates a form and embeds it in a page
- [ ] Site visitor submits the form
- [ ] Owner receives email notification of the submission
- [ ] Submission appears in Panel inbox
- [ ] Contact is created (or updated) in Panel people list
- [ ] Activity is logged and visible on the dashboard
- [ ] Owner updates site settings and sees changes on the public site
- [ ] Owner changes theme and brand color — Panel and public site update
- [ ] Owner uploads an image and embeds it in a page
- [ ] Owner exports all data as a zip
- [ ] Owner can log out

### Technical
- [ ] Stack decision (Astro + TanStack Start VMFE, two Workers) recorded in `DECISIONS.md`
- [ ] Domain onboarding strategy recorded in `DECISIONS.md`
- [ ] TanStack DB deferred to Section 2+ recorded in `DECISIONS.md`
- [ ] No `@tanstack/db` dependency in either Worker
- [ ] Biome passes with zero violations on all code across `apps/citadel/core/`, both Workers, `apps/citadel/custom/`
- [ ] Biome boundary rule enforced — `apps/citadel/core/` never imports from `apps/citadel/custom/`
- [ ] TipTap and Flowbite Charts never imported outside `apps/citadel/workers/panel/`
- [ ] Cache purge dev bypass in `apps/citadel/core/lib/cache.ts` — never throws in dev
- [ ] `apps/citadel/core/` and `apps/citadel/custom/` folder structure in place and enforced
- [ ] `apps/citadel/workers/site/` and `apps/citadel/workers/panel/` are independent deployable Workers with their own `wrangler.jsonc`
- [ ] Both Workers share the same D1, KV, R2 binding IDs
- [ ] `citadel.config.ts` exists at repo root and is read by core at build/runtime
- [ ] `update.yml` runs weekly and merges upstream changes cleanly — opens issue on conflict, never auto-deploys on conflict
- [ ] `ci.yml` gates both Worker deploys — broken builds do not deploy
- [ ] All 9 database tables exist with correct schema, indexes, and domain fields on `site_settings`
- [ ] All migrations apply cleanly to a fresh D1 instance
- [ ] Seed script runs idempotently
- [ ] `pnpm dev` starts both Workers with full binding support
- [ ] `pnpm dev:site` and `pnpm dev:panel` each start independently
- [ ] `pnpm deploy` deploys both Workers to Cloudflare without errors
- [ ] `workers.dev` URL remains accessible after custom domain is configured (Section 2 preview URL dependency)
- [ ] CI passes: lint + build (both Workers) + int tests + e2e + Snyk
- [ ] Zero axe-core violations on all routes
- [ ] Both Worker bundle sizes within 10MB Workers Paid limit and documented in CONTRIBUTING.md
- [ ] No hardcoded content on the public site
- [ ] All images rendered via `imageService.render()` — never `block.url` directly
- [ ] All crypto via Web Crypto API — no Node.js crypto in any file
- [ ] `site_settings` singleton enforced — only one row exists
- [ ] Rate limiting active on form submission and magic link endpoints
- [ ] Honeypot active on all public forms
- [ ] Security headers present on all responses from both Workers
- [ ] `X-Frame-Options: SAMEORIGIN` — never DENY
- [ ] Error boundaries render correctly in all route groups in both Workers
- [ ] Session cookies: HttpOnly, Secure, SameSite=Lax
- [ ] `prerender = false` on all Panel routes that use server functions

### Documentation
- [ ] `DECISIONS.md` covers framework choice, auth strategy, image service, and domain onboarding decisions
- [ ] README covers deploy from scratch in under 15 minutes
- [ ] CONTRIBUTING.md covers local dev setup: both Workers required, Wrangler required, cookie auth needs custom domain (not `workers.dev`)
- [ ] R2 public bucket setup documented (custom domain binding for `media.{domain}`)
- [ ] CF Email Routing + SPF/DKIM/DMARC setup documented
- [ ] All gotchas from section 3 of this document addressed in code or documented as known limitations

---

*Citadel — Open source. Always free. Built with care.*
*A BowenLabs project.*
ENDOFFILE