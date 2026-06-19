# examples/minimal

The smallest possible working Cadmus application.

One Worker. One D1 table. One Hono route. Cadmus primitives for
database access and caching. No UI framework.

This is the "hello world" — if you can run this, you understand
how Cadmus fits together.

> **Coming in Phase 0.** This example will be the first thing built
> after the Cadmus package structure is scaffolded. It validates that
> the framework primitives work end-to-end before Citadel builds on them.

---

## Planned structure

```
examples/minimal/
├── src/
│   └── index.ts      ← Hono Worker using @bowenlabs/cadmus/db
├── wrangler.jsonc
├── package.json
└── README.md
```

## Planned usage

```bash
cd examples/minimal
pnpm install
wrangler d1 create minimal-db
# update wrangler.jsonc with database_id
wrangler dev
# visit localhost:8787
```
