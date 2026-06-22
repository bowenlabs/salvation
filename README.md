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
│   ├── cadmus/        @bowenlabs/cadmus — the framework
│   └── cadmea/        @bowenlabs/cadmea — Cadmea's admin-UI components
├── app/
│   ├── workers/site/   docs + marketing for Cadmus and Cadmea, example deployment
│   └── workers/cadmea/ Cadmea — the reference CMS admin
└── examples/          Standalone Cadmus usage examples
```

---

## Cadmus

A V8-first, Cloudflare-native framework. Provides the primitives needed
to build complete web applications on Cloudflare Workers without Node.js
assumptions, adapter layers, or configuration overhead.

```bash
npm install @bowenlabs/cadmus
```

Each primitive is independently usable:

```typescript
import { db }          from '@bowenlabs/cadmus/db'
import { createMagicLink } from '@bowenlabs/cadmus/auth'
import { upload }      from '@bowenlabs/cadmus/storage'
import { purgeCache }  from '@bowenlabs/cadmus/cache'
import { enqueue }     from '@bowenlabs/cadmus/queues'
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

**[Read the Cadmea docs →](./app/README.md)**

---

## Philosophy

Cloudflare is an exceptional platform — ethical, privacy-focused, at-cost
pricing. Cadmus exists to make building on Cloudflare so easy and secure
that reaching for a heavier stack feels like the wrong choice.

Inspired by Vue's progressive adoption model and Hono's proof that a
V8-first framework can be tiny, fast, and developer-friendly simultaneously.

---

## Status

| Project | Version | Status |
|---|---|---|
| Cadmus | 0.1.0 | 🚧 Active development — Phase 3 |
| Cadmea | 0.1.0 | 🚧 Active development — Phase 3 |

Both projects are `0.x`. Breaking changes will happen.
Stability guarantees begin at `1.0.0`.

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
