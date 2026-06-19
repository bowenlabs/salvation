# Contributing to Salvation

Thank you for your interest in contributing. Both Cadmus and Krypto
welcome contributions — please read this before opening a PR.

All contributions are welcome regardless of background, and all
participants are expected to follow the
[Code of Conduct](CODE_OF_CONDUCT.md).

---

## Before you start

- Check existing issues and PRs — your idea may already be in progress
- For significant changes, open an issue first to discuss the approach
- For new Cadmus primitives, open a GitHub Discussion before building
  to confirm the primitive fits the core scope

---

## Local setup

### Prerequisites

```bash
node --version   # 24+
pnpm --version   # 11+
wrangler --version
```

```bash
pnpm add -g wrangler
wrangler login
```

### Install

```bash
git clone https://github.com/bowenlabs/salvation
cd salvation
pnpm install
```

### Development

```bash
# Create Cloudflare resources (first time only)
wrangler d1 create krypto-db
wrangler kv namespace create KV
wrangler r2 bucket create krypto-media

# Update binding IDs in both wrangler.jsonc files, then:
pnpm db:migrate
pnpm seed

# Start development
pnpm dev          # both Workers
pnpm dev:site     # Worker 1 only (:3000)
pnpm dev:panel    # Worker 2 only (:3001)
```

### Local secrets

```bash
# apps/krypto/workers/site/.dev.vars
# apps/krypto/workers/panel/.dev.vars
SESSION_SECRET=dev-secret-change-in-production
OWNER_EMAIL=you@yourdomain.com
MEDIA_URL=http://localhost:3001/media
```

**Important:** Session cookies must be tested on a custom domain before
shipping. Cookie scoping on `*.workers.dev` differs from production.

---

## What to contribute

### Cadmus (`packages/cadmus/`)

- Bug fixes in existing primitives
- Tests for untested framework integrations (see compatibility table in CADMUS.md)
- Documentation improvements
- New primitives — open a Discussion first

**Hard rules for Cadmus PRs:**
- No Krypto-specific code — ever
- No cross-primitive dependencies
- No Node.js APIs
- Every change must pass `@cloudflare/vitest-pool-workers` tests
- Every public function must be documented

### Krypto (`apps/krypto/`)

- Bug fixes
- Accessibility improvements (zero axe-core violations is the bar)
- Panel UX improvements — mobile-first, always
- Documentation

---

## Code style

Biome handles formatting and linting:

```bash
pnpm lint        # check
pnpm format      # fix
```

PRs with Biome violations will not be merged.

---

## Commit style

```
type(scope): short description

feat(auth): add passkey support
fix(cache): correct dev bypass detection
docs(cadmus): add queues primitive guide
chore(deps): update drizzle-orm to 0.32
```

Types: `feat`, `fix`, `docs`, `chore`, `test`, `refactor`
Scopes: `cadmus`, `krypto`, `auth`, `db`, `storage`, `cache`, `email`,
`queues`, `session`, `rate-limit`, `hono`, `docs`, `examples`

---

## Pull requests

- Keep PRs focused — one concern per PR
- Update relevant documentation in the same PR as code changes
- Add tests for new behaviour
- The PR description should explain *why*, not just *what*

---

*BowenLabs reserves the right to decline PRs that don't fit the
project's direction. This is not a reflection of your code quality.*
