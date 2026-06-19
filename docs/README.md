# Cadmus Docs

> Coming in Phase 0 — full Astro site skeleton with pages stubbed.

This directory will contain the Cadmus documentation site, built with Astro.
Each `packages/cadmus/src/*/README.md` is the source of truth for that
primitive — the docs site consumes and presents them.

## Planned structure

```
docs/
├── src/
│   ├── pages/
│   │   ├── index.astro          ← Why Cadmus
│   │   ├── getting-started.astro
│   │   ├── primitives/
│   │   │   ├── auth.astro
│   │   │   ├── db.astro
│   │   │   ├── storage.astro
│   │   │   ├── cache.astro
│   │   │   ├── email.astro
│   │   │   ├── rate-limit.astro
│   │   │   ├── session.astro
│   │   │   ├── queues.astro
│   │   │   └── hono.astro
│   │   ├── guides/
│   │   │   ├── astro.astro      ← Cadmus + Astro integration seams
│   │   │   ├── tanstack.astro   ← Cadmus + TanStack Start
│   │   │   └── testing.astro    ← vitest-pool-workers pattern
│   │   └── community/
│   │       └── primitives.astro ← @cadmus-community contribution guide
│   └── layouts/
├── astro.config.ts
└── package.json
```

## Content principles

- Every page answers one question completely
- Code examples run — they are tested, not hand-written
- Integration seams are documented explicitly — not "read the framework docs"
- If something can't be documented clearly, the primitive design is wrong
