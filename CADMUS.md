# Cadmus — Framework Briefing

> This document covers the Cadmus framework layer specifically.
> Read CLAUDE.md first for the full Thebes monorepo context.
> Read this before touching anything in packages/cadmus/.

---

## What is Cadmus?

Cadmus is a V8-first, Cloudflare-native full-stack framework. It provides
the primitives needed to build complete web applications on Cloudflare Workers
without Node.js assumptions, adapter layers, or configuration overhead.

Cloudflare is an exceptional platform — ethical, privacy-focused, at-cost
pricing, genuinely committed to a better internet. Cadmus exists to make
building on Cloudflare so easy, secure, and cheap that reaching for AWS,
Vercel, or a heavier stack feels like the wrong choice.

**Package:** `@thebes/cadmus`
**Location:** `packages/cadmus/`
**License:** MIT

---

## Design philosophy

### 1. V8-first, not V8-compatible

Most frameworks were designed for Node.js and adapted to run on Cloudflare.
Cadmus is designed for the V8 isolate runtime from the start. This means:

- Web Crypto API everywhere — never `import crypto from 'crypto'`
- Web Fetch, Web Streams, Web Standard APIs throughout
- No Node.js shims, no `process`, no `__dirname`
- No native binaries (no Sharp, no bcrypt)
- If it doesn't run in a V8 isolate, it doesn't belong in Cadmus

This isn't a constraint — it's a feature. Code written for Cadmus is
portable to any V8 environment and has zero cold start overhead from
adapter translation.

### 2. Cloudflare primitives as first-class citizens

D1, KV, R2, Email Workers, Cache API, Queues — these aren't third-party
integrations. They're the foundation. Cadmus wraps them with TypeScript-
native APIs that feel like a natural part of the framework, not
infrastructure you happen to have access to.

```typescript
// This should feel native, not bolted on
import { db } from '@thebes/cadmus/db'
import { createMagicLink } from '@thebes/cadmus/auth'
import { upload } from '@thebes/cadmus/storage'
```

### 3. Independent primitives — progressive adoption

Inspired by Vue's package architecture. Each primitive is usable
independently with no forced coupling between them:

```typescript
// Use only what you need — nothing else is pulled in
import { createMagicLink } from '@thebes/cadmus/auth'
import { db } from '@thebes/cadmus/db'
import { upload } from '@thebes/cadmus/storage'
```

**Hard rule:** inter-primitive dependencies are zero. `cadmus/auth` must
never import from `cadmus/db`. `cadmus/session` must never import from
`cadmus/rate-limit`. If you find yourself importing one Cadmus primitive
from another, stop — the design is wrong.

**One sanctioned, narrow exception:** `cadmus/cms` needs somewhere to
persist collections, so it depends on the *shape* of a Drizzle instance —
the type returned by `cadmus/db`'s `db()` factory — without importing
`cadmus/db` itself. A consumer wires the two together explicitly:

```typescript
import { db } from '@thebes/cadmus/db'
import { defineCmsConfig } from '@thebes/cadmus/cms'

defineCmsConfig({ collections, db: db(d1, schema) })
```

This is the same treatment Hono already gets ("a peer, not a dependency,"
see below) — `cms` is typed against a shape, never has a hard import of
another primitive's module.

Each primitive accepts raw Cloudflare binding types directly. This is
intentional. It keeps Cadmus framework-agnostic and makes every call
site explicit:

```typescript
// Raw primitive — works in Astro, TanStack Start, Hono, raw Workers, anywhere
import { createMagicLink } from '@thebes/cadmus/auth'

await createMagicLink({
  kv:    env.KV,
  email: env.EMAIL,
  to:    'user@example.com',
})
```

Hono users get ergonomic helpers that read bindings from context automatically,
via the separate `@thebes/cadmus/hono` entrypoint — see below.

### 4. Framework-agnostic, Cloudflare-specific

Cadmus primitives work in any framework that runs on Cloudflare Workers:
Astro, TanStack Start, Hono, SvelteKit, raw Workers — anything that gives
you access to Cloudflare bindings. Cadmus has no opinion about your routing,
rendering, or component model.

**Tested against:** Astro, TanStack Start, Hono. Other frameworks should
work but are not officially tested. If you add tests for a new framework,
that framework becomes supported. PRs welcome.

Cadmus is Cloudflare-specific by design. It does not abstract over
multiple hosting providers. Run it on Cloudflare because Cloudflare is
the right choice — not because Cadmus forces you to.

**Astro is the one deliberate, flagged exception to "no opinion."** A
planned `@thebes/cadmus/astro` peer-integration layer — same "peer, not a
dependency" treatment `@thebes/cadmus/hono` already gets, not a hard
dependency of core — will be the officially recommended frontend for Cadmus's
"real alternative to React" positioning. Core primitives stay framework-
agnostic; this one peer layer is allowed an opinion, the same way `cadmus/hono`
already is. Tracked in
[issue #32](https://github.com/bowenlabs/project-thebes/issues/32), blocked by
[issue #30](https://github.com/bowenlabs/project-thebes/issues/30). Not built
yet — do not add the entrypoint or build wiring until #30 lands.

### 5. Composing, not wrapping

Cadmus uses Hono for routing rather than reimplementing what it does well.
Developers read Hono docs for Hono questions. Cadmus's job is making
Cloudflare primitives feel complete — not owning the HTTP layer.

Where Cadmus and other frameworks meet (Astro's `locals.runtime.env`,
TanStack Start's `getCloudflareContext()`) the integration seams are
explicitly documented. "Read the framework's docs" is never the full answer
where Cadmus is involved.

### 6. Documentation is the product

A developer should be able to understand exactly what Cadmus does and why
by reading its docs and source. No magic. No hidden behaviour. If something
isn't obvious from reading the code, it needs a comment. If something isn't
in the docs, it doesn't exist yet.

The goal: a developer looks at Cadmus and thinks "I understand exactly what
this does and I could have written it myself — but I'm glad I don't have to."

---

## Package structure

```
packages/cadmus/
├── src/
│   ├── auth/
│   │   ├── index.ts         ← token generation, HMAC sign/verify, magic link flow
│   │   └── README.md
│   │
│   ├── db/
│   │   ├── index.ts         ← db(d1, schema) helper
│   │   └── README.md
│   │
│   ├── cms/
│   │   ├── index.ts            ← re-exports the cms surface
│   │   ├── types.ts            ← field-type definitions, CollectionConfig, CmsConfig, CadmeaPlugin, hooks
│   │   ├── defineCollection.ts ← defineCollection / defineCmsConfig (runs plugins)
│   │   ├── schema-gen.ts       ← collection config → generated Drizzle schema source
│   │   ├── codegen.ts          ← collectionToTable (runtime Drizzle table from config)
│   │   ├── localApi.ts         ← Local API (find / findByID / create / update / deleteByID); enforces hooks
│   │   ├── meta.ts             ← getCollectionsMeta() admin-UI introspection contract
│   │   └── README.md           ← cms engine docs (collections, plugins, hooks, Local API)
│   │
│   ├── storage/
│   │   ├── index.ts         ← ImageService interface, R2 upload/serve helper
│   │   └── README.md
│   │
│   ├── cache/
│   │   ├── index.ts         ← CF Cache API purge + explicit dev bypass
│   │   └── README.md
│   │
│   ├── email/
│   │   ├── index.ts         ← Email Workers send helper
│   │   └── README.md
│   │
│   ├── rate-limit/
│   │   ├── index.ts         ← KV-based rate limiter
│   │   └── README.md
│   │
│   ├── session/
│   │   ├── index.ts         ← KV session read/write/delete
│   │   └── README.md
│   │
│   ├── queues/
│   │   ├── index.ts         ← producer helper, consumer handler wrapper, DLQ pattern
│   │   └── README.md
│   │
│   ├── hono/
│   │   ├── index.ts         ← Hono middleware + helpers (thin wrappers over raw primitives)
│   │   └── README.md
│   │
│   ├── errors.ts            ← CadmusError base class + typed subtypes
│   └── index.ts             ← re-exports all primitives (meta import)
│
├── dist/                    ← compiled output (tsup → ESM + CJS + .d.ts)
├── package.json             ← name: "@thebes/cadmus", exports map
├── tsup.config.ts           ← build config
├── tsconfig.json
└── README.md                ← top-level framework docs
```

Each primitive has its own `README.md` that is the authoritative source
of truth for that primitive. The `app/workers/site` docs site consumes these READMEs.

---

## Exports map

The exports map enforces the independent primitive contract and covers
both the compiled output and TypeScript types:

```json
{
  "name": "@thebes/cadmus",
  "exports": {
    ".": {
      "types":   "./dist/index.d.ts",
      "default": "./dist/index.js"
    },
    "./auth": {
      "types":   "./dist/auth/index.d.ts",
      "default": "./dist/auth/index.js"
    },
    "./db": {
      "types":   "./dist/db/index.d.ts",
      "default": "./dist/db/index.js"
    },
    "./cms": {
      "types":   "./dist/cms/index.d.ts",
      "default": "./dist/cms/index.js"
    },
    "./storage": {
      "types":   "./dist/storage/index.d.ts",
      "default": "./dist/storage/index.js"
    },
    "./cache": {
      "types":   "./dist/cache/index.d.ts",
      "default": "./dist/cache/index.js"
    },
    "./email": {
      "types":   "./dist/email/index.d.ts",
      "default": "./dist/email/index.js"
    },
    "./rate-limit": {
      "types":   "./dist/rate-limit/index.d.ts",
      "default": "./dist/rate-limit/index.js"
    },
    "./session": {
      "types":   "./dist/session/index.d.ts",
      "default": "./dist/session/index.js"
    },
    "./queues": {
      "types":   "./dist/queues/index.d.ts",
      "default": "./dist/queues/index.js"
    },
    "./hono": {
      "types":   "./dist/hono/index.d.ts",
      "default": "./dist/hono/index.js"
    }
  }
}
```

Deep imports are the primary pattern. The root import re-exports
everything for convenience — tree-shaking means unused primitives
don't ship to production.

---

## Build pipeline

**Tool:** tsup (wraps esbuild, handles ESM + CJS + `.d.ts` in one pass).

```typescript
// packages/cadmus/tsup.config.ts
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    'index':       'src/index.ts',
    'auth/index':  'src/auth/index.ts',
    'db/index':    'src/db/index.ts',
    'storage/index': 'src/storage/index.ts',
    'cache/index': 'src/cache/index.ts',
    'email/index': 'src/email/index.ts',
    'rate-limit/index': 'src/rate-limit/index.ts',
    'session/index': 'src/session/index.ts',
    'queues/index': 'src/queues/index.ts',
    'hono/index':  'src/hono/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
})
```

`pnpm build:cadmus` runs tsup and produces `dist/`. During development,
both Workers consume `@thebes/cadmus` via pnpm workspace reference —
TypeScript resolves directly from `src/` via `tsconfig.json` paths.
The build step is required before publishing to npm and is validated
in CI on every push to confirm the output is valid.

**Gotcha:** workspace references resolve TypeScript source directly.
Published npm consumers get compiled `dist/`. Always validate both
paths in CI — a broken build won't surface until someone installs
from npm if you only test workspace imports.

---

## Error handling

All Cadmus primitives throw on failure. Errors are instances of
`CadmusError` or a typed subclass, allowing reliable `instanceof` checks:

```typescript
// packages/cadmus/src/errors.ts

export class CadmusError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'CadmusError'
  }
}

export class CadmusAuthError extends CadmusError {
  constructor(message: string, cause?: unknown) {
    super(message, 'AUTH_ERROR', cause)
    this.name = 'CadmusAuthError'
  }
}

export class CadmusStorageError extends CadmusError {
  constructor(message: string, cause?: unknown) {
    super(message, 'STORAGE_ERROR', cause)
    this.name = 'CadmusStorageError'
  }
}

export class CadmusDbError extends CadmusError {
  constructor(message: string, cause?: unknown) {
    super(message, 'DB_ERROR', cause)
    this.name = 'CadmusDbError'
  }
}

export class CadmusCmsError extends CadmusError {
  constructor(message: string, cause?: unknown) {
    super(message, 'CMS_ERROR', cause)
    this.name = 'CadmusCmsError'
  }
}

// Add subtypes as primitives are implemented
```

Consumer error handling:

```typescript
import { CadmusAuthError, CadmusError } from '@thebes/cadmus'

try {
  await createMagicLink({ kv, email, to })
} catch (e) {
  if (e instanceof CadmusAuthError) {
    // auth-specific handling
  } else if (e instanceof CadmusError) {
    // any cadmus error
  } else {
    throw e // re-throw unknown errors
  }
}
```

**Philosophy:** Throw, don't return Result types. This matches Vue's
approach and standard JS ecosystem expectations. Error messages must be
descriptive enough to diagnose the problem without reading source code.
Never throw a raw `Error` from a Cadmus primitive — always a typed subclass.

---

## Hono integration layer

`@thebes/cadmus/hono` provides thin wrappers over the raw primitives
that read Cloudflare bindings from Hono context automatically. These are
purely ergonomic — they call the same underlying primitive functions.

```typescript
// packages/cadmus/src/hono/index.ts

import type { Context } from 'hono'
import { createMagicLink } from '../auth'
import { createSession, getSession } from '../session'
import { rateLimit } from '../rate-limit'

// Hono middleware — auth guard
export function cadmusAuth() {
  return async (c: Context, next: () => Promise<void>) => {
    const session = await getSession({
      kv: c.env.KV,
      cookie: c.req.header('cookie') ?? '',
      secret: c.env.SESSION_SECRET,
    })
    if (!session) return c.redirect('/login')
    c.set('user', session)
    await next()
  }
}

// Hono middleware — rate limiting
export function cadmusRateLimit(options: { limit: number; window: number }) {
  return async (c: Context, next: () => Promise<void>) => {
    const allowed = await rateLimit({
      kv: c.env.KV,
      key: c.req.header('cf-connecting-ip') ?? 'unknown',
      ...options,
    })
    if (!allowed) return c.json({ error: 'Rate limit exceeded' }, 429)
    await next()
  }
}
```

**Rules for the Hono layer:**
- Every Hono helper wraps a raw primitive call — never reimplements logic
- The raw primitive is always the source of truth
- Hono helpers are tested by testing the raw primitives they wrap
- `@thebes/cadmus/hono` has `hono` as a peer dependency, not a dependency

---

## Queues primitive

Cloudflare Queues enable deferred work, webhook processing, and retry
logic — core patterns for any serious Cloudflare application. Cadmus
treats Queues as a first-class primitive from the start.

The Queues primitive has two distinct concerns:

**Producer** — enqueue a message from any Worker context:
```typescript
import { enqueue } from '@thebes/cadmus/queues'

await enqueue({
  queue: env.MY_QUEUE,
  body: { type: 'send-welcome-email', userId: '123' },
})
```

**Consumer** — handle messages in a queue consumer Worker:
```typescript
import { createQueueHandler } from '@thebes/cadmus/queues'

export default createQueueHandler({
  async handle(message, env) {
    // process message.body
    // throw to retry, return to ack
  },
  onDeadLetter(message, env) {
    // called after all retries exhausted
  },
})
```

**Gotcha:** Queues require a separate Worker for the consumer handler.
The producer and consumer are different Workers with different `wrangler.jsonc`
configs. Cadmus's `createQueueHandler` returns a valid Workers `ExportedHandler`
object — not a Hono app. Do not try to combine it with a Hono entrypoint
in the same Worker export.

---

## TypeScript and Env interface

The `Env` interface is defined once per Worker in `env.d.ts`. Cadmus
primitives accept specific binding types (`D1Database`, `KVNamespace`,
etc.) rather than the full `Env` interface — this keeps primitive
signatures narrow and avoids coupling to any app's specific binding set.

```typescript
// Each primitive takes only what it needs
import { db } from '@thebes/cadmus/db'
db(env.DB, schema)          // D1Database only

import { rateLimit } from '@thebes/cadmus/rate-limit'
rateLimit({ kv: env.KV })   // KVNamespace only
```

A base `CadmusEnv` interface is exported for apps that want to enforce
that required bindings are present:

```typescript
// packages/cadmus/src/index.ts
export interface CadmusEnv {
  DB:             D1Database
  KV:             KVNamespace
  R2:             R2Bucket
  EMAIL:          SendEmail
  SESSION_SECRET: string
}

// App extends with its own bindings
interface Env extends CadmusEnv {
  MY_QUEUE: Queue
  SERVER_URL: string
}
```

`CadmusEnv` is a convenience type — not a requirement. Apps using only
one or two primitives don't need to satisfy the full interface.

---

## Cache primitive — dev bypass

The cache dev bypass uses an explicit flag rather than a `typeof` check.
`caches.default` exists in miniflare (local Wrangler dev) but behaves
differently from production — a typeof check gives false confidence.

```typescript
// packages/cadmus/src/cache/index.ts

export async function purgeCache(
  url: string,
  options: { dev?: boolean } = {},
): Promise<void> {
  if (options.dev) {
    console.log(`[cadmus/cache] dev mode — skipping purge: ${url}`)
    return
  }
  try {
    await caches.default.delete(new Request(url))
  } catch (err) {
    throw new CadmusError(`Cache purge failed for ${url}`, 'CACHE_ERROR', err)
  }
}
```

Usage — the caller passes `dev` explicitly:

```typescript
await purgeCache(url, { dev: import.meta.env.DEV })
```

This makes the dev bypass visible at the call site rather than hidden
inside the primitive. No surprises in production.

---

## Testing

Cadmus primitives are tested against a real Cloudflare Workers runtime
using `@cloudflare/vitest-pool-workers`. This is the official pattern —
not mocks, not Node.js stubs.

```typescript
// packages/cadmus/src/auth/auth.test.ts
import { describe, it, expect } from 'vitest'
import { createToken, verifyToken } from './index'

describe('auth', () => {
  it('creates and verifies a token', async () => {
    const token = await createToken({ secret: 'test-secret' })
    const valid = await verifyToken({ token, secret: 'test-secret' })
    expect(valid).toBe(true)
  })
})
```

```typescript
// packages/cadmus/vitest.config.ts
import { defineConfig } from 'vitest/config'
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config'

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.test.jsonc' },
      },
    },
  },
})
```

**Gotcha:** `@cloudflare/vitest-pool-workers` runs tests inside a miniflare
environment. It requires a `wrangler.test.jsonc` with test bindings
(local D1, local KV, local R2). Never use production binding IDs in tests.
Keep a `wrangler.test.jsonc` in `packages/cadmus/` with `[[d1_databases]]`,
`[[kv_namespaces]]` etc. set to local-only values.

---

## Adapters — swappable implementations

Some Cadmus primitives are defined as *interfaces* with their implementation
living outside core, so an app can swap backends without touching call sites.
`ImageService` (`@thebes/cadmus/storage`) is the first: the default is a
plain R2 pass-through, and `@thebes/cadmus-cloudflare-images` is an alternate
adapter that returns Cloudflare Image Resizing URLs.

An adapter implements the interface and is published as `@thebes/cadmus-*`
(first-party) or `@cadmus-community/*`. The contract that makes the swap a
one-liner: the app resolves the active implementation in a single place. This is
one of Thebes's two extension axes — the other is Cadmea plugins. See the full
guide in **[EXTENDING.md](./EXTENDING.md)**.

---

## Community primitives

The `@thebes/cadmus` core package stays small and officially maintained.
Community-built primitives live under `@cadmus-community/*` as separate
packages maintained by their authors.

**What belongs in core:**
- Cloudflare's own primitive bindings (D1, KV, R2, Email, Cache, Queues)
- Auth, session, rate limiting — universal patterns every app needs
- The Hono integration layer

**What belongs in community:**
- Third-party service integrations (Stripe, Resend, Algolia, etc.)
- Opinionated patterns built on core primitives
- Framework-specific adapters beyond what's officially tested

**To create a community primitive:**
A contribution guide and community primitive template will live at
a future docs page in `app/workers/site` — forthcoming. Until it exists, open
a GitHub discussion before building to confirm the primitive fits the
community scope and isn't already in progress.

**Note:** The `@cadmus-community` npm org does not yet exist. This model
is documented now to establish the principle. Do not publish under that
scope until the org is created and a governance model is in place.

---

## Versioning and stability

Cadmus follows semantic versioning. During active development alongside
Cadmea (Sections 1–2), breaking changes are expected. Version stays `0.x`.
Stability guarantees begin at `1.0.0`.

`1.0.0` will not be tagged until:
- All core primitives are proven in production by Cadmea
- The full API surface is documented on `app/workers/site` (the combined
  Cadmus+Cadmea docs site)
- A changelog and migration guide process exists
- At least one app other than Cadmea uses Cadmus in production
- The community primitive model has a published contribution guide

Do not rush to `1.0.0`. The `0.x` label is honest and sets correct
expectations for early adopters.

---

## Compatibility

Astro is the officially recommended frontend — see design philosophy point 4
above and the planned `cadmus/astro` peer-integration layer (#32, blocked by
#30). Other frameworks below remain fully supported; this isn't exclusivity,
it's a recommendation.

| Framework | Status |
|---|---|
| Astro + `@astrojs/cloudflare` | ✅ Tested — **officially recommended** |
| TanStack Start + `@cloudflare/vite-plugin` | ✅ Tested |
| Hono on Workers | ✅ Tested |
| Raw Cloudflare Workers | ✅ Tested |
| SvelteKit + CF adapter | 🔲 Untested — should work |
| Remix + CF adapter | 🔲 Untested — should work |
| Other | 🔲 Unknown — PRs with tests welcome |

Cadmus primitives work in any environment that provides Cloudflare
binding objects. If your framework gives you access to `D1Database`,
`KVNamespace`, etc., Cadmus works. Open a PR adding tests for your
framework to move it to ✅.

---

## What Cadmus is not

- **Not a meta-framework.** Cadmus doesn't generate routes, manage layouts,
  or own your build pipeline. Astro and TanStack Start do that.
- **Not an ORM.** Cadmus wraps Drizzle's D1 adapter. Drizzle is the ORM.
  `cadmus/cms` generates Drizzle schema from collection config — it doesn't
  replace Drizzle, and it has no query language of its own beyond the
  Local API's typed CRUD surface.
- **Not a hosted CMS.** `cadmus/cms` ships no SaaS, no managed admin, no
  account system. It's a primitive an operator self-hosts entirely, same
  as every other Cadmus primitive.
- **Not a UI library.** No components. No design system. That's Cadmea's job.
- **Not a hosting platform.** Cloudflare is the platform. Cadmus is the
  framework layer that makes Cloudflare feel complete.
- **Not multi-cloud.** Cadmus is deliberately Cloudflare-specific. Abstractions
  that work on AWS, GCP, and CF simultaneously are someone else's problem —
  and they always leak.

---

## Maintainer

Cadmus is maintained by one person (Baylee, BowenLabs). PRs are welcome.
There is no SLA. Issues will be triaged as time allows. If you're building
something critical on Cadmus at `0.x`, you should be comfortable reading
and if necessary patching the source.

This is honest, not a warning. Every great framework started here.

---

## Inspiration

**Vue / Evan You:** Progressive adoption, independent packages, extraordinary
documentation, built by one person solving a real problem, open source from
day one. The package architecture and the philosophy that a framework should
be completely understandable are direct influences.

**Hono:** Proof that a V8-first, tiny framework can be production-ready and
developer-friendly simultaneously. Cadmus uses Hono rather than reimplementing
what it does well.

**Cloudflare Workers platform:** The best framework for Cloudflare is one
that makes Cloudflare's own primitives feel like a complete full-stack.
Cadmus doesn't fight the platform — it amplifies it.

---

*Cadmus — V8-first. Cloudflare-native. Yours forever.*
*A BowenLabs project.*
