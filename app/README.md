# Cadmea

A free, open-source, V8-native headless CMS and admin platform.
Built on [Cadmus](../packages/cadmus/README.md). Runs on Cloudflare.
This `app/` directory is Thebes's own deployment of Cadmea — the project's
reference implementation, and the docs+marketing site for both Cadmus and
Cadmea.

> **0.x — active development.** Not ready for production use.

---

## What is Cadmea?

Cadmea is Cadmus's reference implementation: define content as collections
in `cadmea.config.ts` (the equivalent of a `payload.config.ts`) and get a
generated admin UI, a typed query layer, and a REST API — on infrastructure
you own forever. It's also a deliberate proof of concept for what a
Payload-CMS-equivalent product looks like with zero Node.js dependency,
running natively in Cloudflare's V8 isolates.

- **Operator-owned** — your Cloudflare account, your data, your domain
- **Mobile-first** — the CMS admin works on phones and tablets, not just desktops
- **No AI defaults** — your content, your voice
- **MIT licensed** — no revenue thresholds, no commercial license required

---

## Deploy in 15 minutes

> Full guide in [GETTING_STARTED.md](../GETTING_STARTED.md)

```bash
# Prerequisites: Node 24+, pnpm 11+, wrangler
wrangler login

# Fork this repo, then:
git clone https://github.com/YOUR_USERNAME/thebes
cd thebes
pnpm install

# Create Cloudflare resources
wrangler d1 create thebes-db
wrangler kv namespace create KV
wrangler r2 bucket create thebes-media

# Configure .dev.vars, run migrations, seed, dev
pnpm db:migrate
pnpm seed
pnpm dev
```

---

## Architecture

Two Cloudflare Workers sharing the same D1, KV, and R2 bindings:

- **Worker 1** (`workers/site`) — Astro public site: docs + marketing for
  Cadmus and Cadmea, and the example deployment's public pages
- **Worker 2** (`workers/cadmea`) — TanStack Start CMS admin interface

Both built on `@thebes/cadmus` primitives.

---

## Licensing

MIT. See [LICENSE](../LICENSE) for full terms.

---

## Maintained by

[BowenLabs](https://bowenlabs.com)
