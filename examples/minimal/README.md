# Cadmus example — minimal

The smallest possible Cadmus app: **one Worker, one primitive.** It rate-limits
each client IP to 5 requests/minute using
[`@thebes/cadmus/rate-limit`](../../packages/cadmus/src/rate-limit) — no
Node.js, no adapter layer, just a Cloudflare KV binding handed straight to the
primitive.

```ts
import { checkRateLimit } from "@thebes/cadmus/rate-limit";

const { allowed, remaining } = await checkRateLimit(env.KV, key, 5, 60);
```

## Run it

```bash
wrangler kv namespace create minimal-kv   # paste the id into wrangler.jsonc
pnpm --filter cadmus-example-minimal dev
```

Then hit `http://localhost:8787` repeatedly — the sixth request within a minute
returns `429`.

## What it shows

- **Raw bindings.** The primitive takes a `KVNamespace` directly — not `env`,
  not a framework `Context`. Explicit and framework-agnostic.
- **V8-first.** Runs in the Workers isolate with zero Node.js APIs.
- **Progressive adoption.** You imported exactly one primitive; nothing else
  ships.

See the other (planned) examples — `with-auth`, `with-d1` — and the full
framework docs in [`packages/cadmus`](../../packages/cadmus).
