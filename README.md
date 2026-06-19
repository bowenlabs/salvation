# Project Thebes

**Cadmus** — a V8-first, Cloudflare-native full-stack framework.
**Citadel** — a free, open-source web platform built on Cadmus.

> Both projects are under active development. APIs will change.
> Star the repo to follow along.

---

## What's in here

```
thebes/
├── packages/
│   └── cadmus/        @bowenlabs/cadmus — the framework
├── apps/
│   └── citadel/        Citadel — the reference app
├── docs/              Cadmus documentation site
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

## Citadel

A free, open-source web platform for small businesses, creatives, and
nonprofits. Built on Cadmus. One deploy gives operators a complete
digital presence — website, admin panel, forms, CRM, and notifications
— on infrastructure they own forever.

- **Free** for individuals and organisations under $1M annual revenue
- **Free forever** for verified nonprofits
- **Operator-owned** — your Cloudflare account, your data, your domain
- **Mobile-first** — the Panel is designed for phones and tablets first

**[Read the Citadel docs →](./apps/citadel/README.md)**

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
| Cadmus | 0.1.0 | 🚧 Active development — Phase 0 |
| Citadel | 0.1.0 | 🚧 Active development — Phase 0 |

Both projects are `0.x`. Breaking changes will happen.
Stability guarantees begin at `1.0.0`.

---

## Contributing

Cadmus is MIT licensed. Contributions welcome — read
[CONTRIBUTING.md](./CONTRIBUTING.md) before opening a PR.

Citadel uses a dual license. See [apps/citadel/LICENSE](./apps/citadel/LICENSE).

All contributors and operators are expected to follow the
[Code of Conduct & Acceptable Use](./CODE_OF_CONDUCT.md) — all
contributions are welcome, and Citadel may not be used for hateful,
discriminatory, or harassing purposes.

---

## Maintained by

[BowenLabs](https://bowenlabs.com) — one person, built with care.

*Thebes — Open source. Always free. Built with care.*
