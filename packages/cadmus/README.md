# @bowenlabs/cadmus

V8-first, Cloudflare-native full-stack framework primitives.

> **0.x — active development.** APIs will change. Not production-ready.
> Star [bowenlabs/salvation](https://github.com/bowenlabs/salvation) to follow along.

---

## What is Cadmus?

Cadmus provides the primitives needed to build complete web applications
on Cloudflare Workers without Node.js assumptions, adapter layers, or
configuration overhead.

Cloudflare is an exceptional platform — ethical, privacy-focused, at-cost
pricing. Cadmus makes building on it feel complete.

**Inspired by:** Vue's progressive adoption model, Hono's V8-first proof of concept.

---

## Install

```bash
npm install @bowenlabs/cadmus
# or
pnpm add @bowenlabs/cadmus
```

---

## Primitives

Each primitive is independently usable — import only what you need:

```typescript
import { db }              from '@bowenlabs/cadmus/db'
import { createMagicLink } from '@bowenlabs/cadmus/auth'
import { upload }          from '@bowenlabs/cadmus/storage'
import { purgeCache }      from '@bowenlabs/cadmus/cache'
import { sendEmail }       from '@bowenlabs/cadmus/email'
import { rateLimit }       from '@bowenlabs/cadmus/rate-limit'
import { createSession }   from '@bowenlabs/cadmus/session'
import { enqueue }         from '@bowenlabs/cadmus/queues'
```

Hono users get ergonomic middleware via a separate entrypoint:

```typescript
import { cadmusAuth, cadmusRateLimit } from '@bowenlabs/cadmus/hono'
```

---

## Design principles

- **V8-first** — no Node.js APIs. Web Crypto, Web Fetch, Web Streams throughout.
- **Independent primitives** — zero cross-primitive dependencies. Use one or all.
- **Raw bindings** — pass `env.KV`, `env.DB` directly. Explicit over magic.
- **Thrown errors** — `CadmusError` and typed subclasses. Reliable `instanceof` checks.
- **Composing, not wrapping** — Cadmus uses Hono, Drizzle, and Astro rather
  than reimplementing what they do well.

---

## Compatibility

| Framework | Status |
|---|---|
| Astro + `@astrojs/cloudflare` | ✅ Tested |
| TanStack Start + `@cloudflare/vite-plugin` | ✅ Tested |
| Hono on Workers | ✅ Tested |
| Raw Cloudflare Workers | ✅ Tested |
| Others | 🔲 Should work — PRs with tests welcome |

---

## Community primitives

Third-party integrations and opinionated patterns live under
`@cadmus-community/*`. Contribution guide forthcoming.

---

## License

MIT — [LICENSE](./LICENSE)

---

## Maintained by

[BowenLabs](https://bowenlabs.com) — one person, built with care.
PRs welcome. No SLA. If you're building something critical on `0.x`,
be comfortable reading and if necessary patching the source.
