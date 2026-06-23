# @bowenlabs/cadmus

V8-first, Cloudflare-native full-stack framework primitives.

> **0.x — active development.** APIs will change. Not production-ready.
> Star [bowenlabs/project-thebes](https://github.com/bowenlabs/project-thebes) to follow along.

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

**A CMS engine on top of the primitives above** — model content as
collections and get a generated Drizzle schema, a typed, access-controlled,
hook-driven Local API, and a Payload-equivalent REST API
(`mountCmsRoutes`, also from `@bowenlabs/cadmus/hono`):

```typescript
import { createLocalApi, defineCmsConfig } from '@bowenlabs/cadmus/cms'
```

See [`src/cms/README.md`](./src/cms/README.md) for the full reference —
config/plugins, access control, hooks, relationship `depth` resolution,
draft/publish versioning, and mounting the REST API.

---

## Design principles

- **V8-first** — no Node.js APIs. Web Crypto, Web Fetch, Web Streams throughout.
- **Independent primitives** — zero cross-primitive dependencies. Use one or all.
- **Raw bindings** — pass `env.KV`, `env.DB` directly. Explicit over magic.
- **Thrown errors** — `CadmusError` and typed subclasses. Reliable `instanceof` checks.
- **Composing, not wrapping** — Cadmus uses Hono, Drizzle, and Astro rather
  than reimplementing what they do well.

---

## Email (`@bowenlabs/cadmus/email`)

Thin wrapper over the CF Email Workers `send_email` binding.

```typescript
import { sendEmail } from '@bowenlabs/cadmus/email'

await sendEmail(env.EMAIL, {
  from: 'noreply@yourdomain.com',
  to: 'owner@example.com',
  subject: 'Your magic link',
  html: '<p>Click <a href="https://example.com">here</a></p>',
})
```

`sendEmail` throws `CadmusEmailError` on failure — wrap calls in a
best-effort handler if the surrounding flow shouldn't fail just because
an email didn't send (e.g. a form submission notification).

**Required setup — before sending anything:**

1. The `from` address must be on a domain with **Cloudflare Email Routing**
   enabled (Cloudflare dashboard → your domain → Email → Email Routing).
2. Add the DNS records Cloudflare generates for that domain:
   - **SPF** — `TXT` record authorizing Cloudflare to send on the domain's behalf
   - **DKIM** — `TXT` record for signing outbound mail
   - **DMARC** — `TXT` record (`_dmarc.yourdomain.com`) declaring your policy
   Cloudflare's Email Routing setup screen lists the exact records to add.
3. Add `send_email` to the binding's `wrangler.jsonc`:
   ```jsonc
   { "send_email": [{ "name": "EMAIL" }] }
   ```

**Local dev:** `env.EMAIL` is `undefined` in `wrangler dev` unless you
configure a destination address for it — there is no real routing for
`localhost`. Callers should check for the binding (or catch
`CadmusEmailError`) and fall back to logging rather than assuming
`sendEmail` always succeeds in dev.

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
