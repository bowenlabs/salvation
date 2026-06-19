# Citadel

Free, open-source web platform for small businesses, creatives, and nonprofits.
Built on [Cadmus](../../packages/cadmus/README.md). Runs on Cloudflare.

> **0.x — active development.** Not ready for production use.

---

## What is Citadel?

One deploy gives operators a complete digital presence — website, admin panel,
forms, CRM, and notifications — on infrastructure they own forever.

- **Free** for individuals and organisations under $1M annual revenue
- **Free forever** for verified nonprofits (501c3 or equivalent)
- **Operator-owned** — your Cloudflare account, your data, your domain
- **Mobile-first** — the Panel works on phones and tablets, not just desktops
- **No AI defaults** — your content, your voice

---

## Deploy in 15 minutes

> Full guide in [GETTING_STARTED.md](../../GETTING_STARTED.md)

```bash
# Prerequisites: Node 24+, pnpm 11+, wrangler
wrangler login

# Fork this repo, then:
git clone https://github.com/YOUR_USERNAME/thebes
cd thebes
pnpm install

# Create Cloudflare resources
wrangler d1 create citadel-db
wrangler kv namespace create KV
wrangler r2 bucket create citadel-media

# Configure .dev.vars, run migrations, seed, dev
pnpm db:migrate
pnpm seed
pnpm dev
```

---

## Architecture

Two Cloudflare Workers sharing the same D1, KV, and R2 bindings:

- **Worker 1** — Astro public site (your website)
- **Worker 2** — TanStack Start Panel (your admin interface)

Both built on `@bowenlabs/cadmus` primitives.

---

## Licensing

Citadel uses a dual license. See [LICENSE](./LICENSE) for full terms.

- **Free** — individuals and orgs under $1M annual revenue
- **Free** — verified nonprofits (apply at licensing@bowenlabs.io)
- **Commercial license required** — orgs over $1M annual revenue

Contact: licensing@bowenlabs.io

---

## Maintained by

[BowenLabs](https://bowenlabs.com)
