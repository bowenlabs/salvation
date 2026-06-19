# Decisions

> This file is operator-owned. Krypto will never overwrite it.
> Record every significant architectural decision here with date, options
> considered, decision made, and rationale. This is the first file a new
> engineer reads after CLAUDE.md.
>
> Format: newest decisions at the top.

---

## 2026-06-19 — DaisyUI v5 token names: confirmed `--color-primary`, not `--p`

**Decision:** All theme CSS files and brand-color override `<style>` tags
use DaisyUI v5's actual variable names (`--color-primary`,
`--color-primary-content`, etc.), not the DaisyUI v4 short names (`--p`,
`--pc`) that older tutorials and the original G12 gotcha write-up assumed.

**What broke:** Manually verifying POC 2 (Phase 0, token injection — see
`SECTION_1_PLAN.md` G12), a `theme-test.css` + `token-test.astro` pair built
exactly per the documented pattern (correct `<link>`/`<style>` source
order, no FOUC, no console errors) produced **no visible color change at
all**. The override appeared to silently do nothing.

**Root cause:** The test fixture set `--p`/`--pc`, but DaisyUI v5's
Tailwind-v4-native plugin generates utility CSS against `--color-primary`/
`--color-primary-content` — confirmed by inspecting the actual built
output:
```css
.bg-primary { background-color: var(--color-primary); }
.text-primary-content { color: var(--color-primary-content); }
```
Setting `--p` is not an error — it's a valid CSS custom property that
simply nothing reads. This is exactly the failure mode G12 already warned
about in the abstract ("DaisyUI v5 OKLCH token names differ from v4 —
confirm correct variable names before writing theme files") but the
original gotcha write-up's own example code used the old names anyway.

**A second, unrelated bug compounded the confusion while debugging this:**
`src/assets/app.css` had been left empty (the Step 4 `@import "tailwindcss";
@plugin "daisyui";` directives were never actually written to it), and the
test page never imported it. Both failures look identical from the
outside — "the color doesn't change" — but have different fixes. Checklist
for diagnosing this class of bug going forward:
1. Confirm `app.css` has content and is imported by the page under test.
2. Confirm the generated CSS (inspect the page, or grep built `_astro/*.css`)
   actually contains the utility classes you expect (`.bg-primary` etc.).
3. Only then check the override's variable names against what those
   generated rules actually reference.

**Fixed in:** `public/themes/theme-test.css`, `src/pages/token-test.astro`,
`SECTION_1_PLAN.md` (G12 + POC 2 example), `GETTING_STARTED.md` (Steps 4 + 9).

**Revisit if:** Upgrading DaisyUI major versions — re-verify variable names
against the new version's generated CSS before assuming they carried over.

---

## 2026-06-19 — astro/hono advanced routing is broken for custom Cloudflare entrypoints; use `@astrojs/cloudflare/handler` instead

**Decision:** Worker 1's `src/app.ts` does not use Astro's experimental
`astro/hono` advanced-routing exports (`middleware()`, `pages()`, etc.). It
uses a plain Hono app with custom routes checked first, falling through to
`handle()` from `@astrojs/cloudflare/handler` for everything else (Astro
SSR). `experimental.advancedRouting` is not set in `astro.config.mjs`, and
the (non-existent on this adapter version) `entrypoint` option is not passed
to `cloudflare()`.

**Versions:** `astro@6.4.8`, `@astrojs/cloudflare@13.7.0`.

**What broke:** Following the documented pattern (`CLAUDE.md`/
`SECTION_1_PLAN.md` originally specified `cf()` → `middleware()` → `pages()`
in that order) produced, on every single request:

```
Error: FetchState(request) called on a request without an attached app.
Ensure it runs inside Astro's request pipeline.
```

**Root cause:** `astro/hono`'s `middleware()` and `pages()` (and
`@astrojs/cloudflare/hono`'s `cf()`) all call `getFetchState(context)`,
which constructs `new FetchState(context.req.raw)`. That constructor reads
`Reflect.get(request, appSymbol)` and throws if the Astro `App` instance was
never attached to the request. Nothing in the build output ever attaches
it — `dist/server/entry.mjs` literally does `export { app as default }`
with no wrapping logic around it. This is part of Astro's *experimental*
"Advanced Routing" feature; it does not work as documented for a custom
Cloudflare Worker entrypoint in this version combination.

**How this was confirmed as a real bug, not local misconfiguration:**
- Reproduced with **zero custom code** — Astro's own officially blogged
  minimal example (`middleware()` + `pages()` only, no `cf()`, no custom
  routes) fails identically.
- Reproduced in both `astro dev` (Vite SSR) **and** a real `wrangler dev`
  run directly against the production-built `dist/server/entry.mjs` — not
  a dev-server-only artifact.
- Enabling `experimental.advancedRouting: true` (which the feature is
  gated behind) made no difference — the generated bundle was byte-for-byte
  the same `export { app as default }` with no attachment wrapper.
- Removing the (apparently non-existent) `entrypoint` option from
  `cloudflare()` made no difference either — Astro auto-detects
  `src/app.ts` regardless.
- No existing GitHub issue was found describing this exact error message
  as of this investigation (2026-06-19) — worth filing one, or watching
  `astro` / `@astrojs/cloudflare` release notes for advanced-routing fixes.

**The fix:**
```typescript
// apps/krypto/workers/site/src/app.ts
import { Hono } from 'hono'
import { handle } from '@astrojs/cloudflare/handler'

const app = new Hono<{ Bindings: Env }>()

// 1. Custom API routes — checked first
app.get('/api/ping', async (c) => { /* ... */ })

// 2. Astro SSR — fallback for everything else
app.all('*', async (c) => handle(c.req.raw, c.env, c.executionCtx))

export default app
```
`handle()` is the stable, documented public API for exactly this "custom
Worker + Astro fallback" use case — it does not depend on the experimental
advanced-routing wiring and is what Astro's own Cloudflare deploy docs
recommend for custom entrypoints.

Options considered:
- Keep debugging the experimental feature until it works — rejected: it's
  explicitly labeled experimental, the bug reproduces with zero custom code
  across both dev and built-output execution, and there's no indication
  it's something fixable from our side rather than upstream.
- Downgrade `astro`/`@astrojs/cloudflare` to an older version pair —
  not attempted; `handle()` is the documented stable path regardless of
  version, so there was no reason to chase a version pin instead.

**Revisit if:** `astro/hono`'s advanced routing matures out of experimental
status and a changelog entry specifically addresses custom Cloudflare
entrypoint + `appSymbol` attachment — at that point `cf()`/`middleware()`/
`pages()` may be worth reconsidering for the cleaner composition syntax.

---

## 2026-06-19 — Component framework tiering: React, Alpine, and extension flexibility

**Decision:** Standardize on React as the only UI component framework inside
`core/` and the Panel. Use Alpine.js for lightweight sprinkle-on interactivity
on the public site that doesn't justify a full island. Allow operator/community
extensions to bring their own framework (Vue, Svelte, etc.) for their own
isolated islands, since extensions sit outside the `core`/`custom` boundary.

Options considered:
- Single framework everywhere (React only) — rejected for the public site's
  small interactive bits: pulling in a full React island for something like a
  dropdown or dismissible banner is disproportionate, and the nav already
  avoids JS entirely via CSS-only `<details>/<summary>`.
- Svelte or Vue for the Panel instead of React — rejected: TanStack Start is
  React-specific (not just TanStack Router, which has experimental
  Solid/Vue adapters), and TipTap/Flowbite Charts are scoped as React
  dependencies. Switching frameworks here means abandoning the Phase 0
  framework decision, not swapping a library.
- Svelte or Vue for the public site's own islands — rejected: the public
  site already ships near-zero JS by design; the few islands it has are
  better kept in React for consistency with the Panel, since this is a
  one-person-maintained codebase and "which framework is this component in"
  is real cognitive overhead not worth paying for marginal bundle savings.
- Lock extensions to React only — rejected: extensions are isolated islands
  by nature (no shared reactivity with the rest of the page), live outside
  `core/`'s maintained surface, and Astro's whole multi-framework islands
  model exists for exactly this case. Forcing React narrows the contributor
  pool with no real benefit to Krypto's own maintenance burden.

**Chosen tiering:**
- `core/` and the Panel: React only — Astro/TanStack Start dependencies are
  already React-shaped, no exceptions.
- Public site sprinkle-on interactivity (dropdowns, banners, anything past
  what pure CSS can express): Alpine.js via `@astrojs/alpinejs` — no
  component file, no `client:*` hydration directive, just `x-data`/`x-show`/
  `x-on:click` attributes on existing markup, ~7-15kb runtime.
- Operator/community extensions: any Astro-supported framework (React, Vue,
  Svelte, Solid, Lit, Alpine) at the extension author's discretion.

**Known cost:** if an operator installs two extensions on the same page that
use different frameworks, that page ships two component runtimes instead of
zero or one — eroding the "near-zero JS" pitch for that specific page.
Accepted as a rare edge case rather than a reason to lock extensions to one
framework. Extension-authoring docs should nudge toward Svelte/Alpine/vanilla
for size-sensitive widgets when no other framework is already in use on the
page.

**Revisit if:** TanStack Start ships a stable non-React adapter, or the
extension ecosystem grows large enough that multi-framework runtime bloat
becomes a measured problem rather than a theoretical one.

---

## 2026-06-18 — Cadmus framework design decisions

**Decision:** Locked a set of foundational decisions governing Cadmus's
API surface, build pipeline, error model, integration story, and
community model. Recorded here as a single entry covering all decisions
made in the same session.

---

**Primitive API surface: raw Cloudflare bindings**

Each Cadmus primitive accepts specific raw Cloudflare binding types
(`D1Database`, `KVNamespace`, `R2Bucket`, etc.) rather than a full `Env`
interface or a Hono `Context`. Callers pass `env.KV`, `env.DB` explicitly.

Options considered:
- Hono Context — rejected: couples all Cadmus primitives to Hono, breaks
  framework-agnostic principle, can't use `cadmus/auth` in Astro without Hono
- Full `Env` interface — rejected: forces apps to satisfy all bindings even
  when only using one primitive
- Raw bindings — chosen: explicit, framework-agnostic, narrow signatures

A separate `@bowenlabs/cadmus/hono` entrypoint provides thin ergonomic
wrappers for Hono users that read bindings from `Context` automatically.
These wrappers call the raw primitives internally — no logic duplication.

**Revisit if:** A strongly dominant framework emerges that makes raw
binding access significantly more awkward than context-based access.

---

**Build pipeline: tsup → dist/**

`@bowenlabs/cadmus` is built with tsup, producing ESM + CJS + `.d.ts` in
`dist/`. The exports map points at `dist/` with explicit `types` and
`default` fields per entrypoint.

Options considered:
- Workspace reference only, no build — rejected: TypeScript source doesn't
  work for npm consumers; would silently break on first external install
- tsc only — rejected: doesn't produce CJS, slower, more config
- tsup — chosen: handles ESM + CJS + declarations in one pass, fast,
  used by TanStack and most modern TS packages

During development, workspace consumers resolve directly from `src/` via
tsconfig paths. CI validates that the `dist/` build also works. This
catches the class of bugs that only appear in published packages.

**Revisit if:** tsup stops being maintained or introduces breaking changes
that conflict with the Cloudflare Workers target.

---

**Error handling: thrown errors + CadmusError base class**

Cadmus primitives throw on failure. All thrown errors are instances of
`CadmusError` or a typed subclass (`CadmusAuthError`, `CadmusDbError`,
`CadmusStorageError`, etc.), enabling reliable `instanceof` checks.

Options considered:
- Throw native `Error` — rejected: no typed catching, poor DX
- Result types (`{ ok, err }`) — rejected: non-standard JS pattern,
  adds friction at every call site, diverges from Vue's philosophy
- `CadmusError` hierarchy — chosen: matches Vue's approach, standard
  JS expectations, typed subtypes without Result monad overhead

Error messages must be descriptive enough to diagnose the problem
without reading Cadmus source code. Never throw a raw `Error` from
a Cadmus primitive.

**Revisit if:** Effect or a similar Result-type library becomes the
de facto standard in the JS ecosystem.

---

**Hono integration: @bowenlabs/cadmus/hono entrypoint**

Hono-specific helpers ship as a separate exports entrypoint within the
same `@bowenlabs/cadmus` package — not a separate npm package. This
keeps the install to one package while maintaining the independent
primitive model.

Options considered:
- Separate `@bowenlabs/cadmus-hono` package — rejected: unnecessary
  install friction for Hono users who are already the primary audience
- Baked into core primitives — rejected: couples all primitives to Hono
- Separate entrypoint in same package — chosen: one install, opt-in,
  clean exports map, `hono` as peer dependency not dependency

`@bowenlabs/cadmus/hono` has `hono` as a peer dependency. Users who
don't import `@bowenlabs/cadmus/hono` don't pay for the Hono dependency.

**Revisit if:** The Hono layer grows large enough to warrant its own
release cadence or versioning.

---

**Queues: first-class primitive from the start**

Cloudflare Queues are included in the Cadmus primitive set from Phase 0.
Not deferred. The `@bowenlabs/cadmus/queues` primitive provides a producer
helper and a consumer handler wrapper.

Options considered:
- Defer to post-Krypto Section 1 — rejected: Queues are core CF
  infrastructure, not an advanced feature; excluding them would make
  Cadmus feel incomplete for any real app
- Out of scope — rejected outright
- Include now — chosen

The Queues primitive covers: `enqueue()` for producers, `createQueueHandler()`
for consumers, and a dead letter queue pattern. Consumer Workers are
separate from producer Workers — this is a Cloudflare constraint,
not a Cadmus design choice, but it must be clearly documented.

**Revisit if:** Cloudflare changes the Queues architecture significantly.

---

**Compatibility: framework-agnostic, matrix is what's tested**

Cadmus primitives are framework-agnostic — they work in any environment
that provides Cloudflare binding objects. The compatibility matrix lists
what is actually tested, not what Cadmus claims to support.

Officially tested: Astro, TanStack Start, Hono, raw Workers.
Untested but expected to work: SvelteKit + CF adapter, Remix + CF adapter.
Unknown: everything else. PRs with tests welcome.

This framing is honest. "Framework-agnostic" means the primitives don't
depend on any framework — not that they're guaranteed to work everywhere.

**Revisit if:** A major framework requires Cadmus-specific integration
work that can't be handled at the primitive level.

---

**Community primitives: @cadmus-community/* ecosystem model**

The `@bowenlabs/cadmus` core package stays small. Community-built
primitives live under `@cadmus-community/*` as separately maintained
packages. BowenLabs maintains core. The community maintains extensions.

Options considered:
- BowenLabs only — rejected: unsustainable as surface area grows,
  discourages ecosystem contribution
- Open PRs to core — rejected: core would grow unbounded, maintenance
  burden scales with community size
- Core + community split — chosen: keeps core lean, enables ecosystem
  growth, clear ownership model

The `@cadmus-community` npm org does not yet exist. A contribution
guide and community primitive template are forthcoming in `docs/`.
Do not publish under `@cadmus-community` until the org is created and
a governance model is in place.

**Revisit if:** Cadmus achieves significant adoption and the community
model needs formalising with a governance structure.

---

**Docs site: full skeleton in Phase 0**

The `docs/` Astro site runs with pages stubbed by end of Phase 0 —
not deferred until primitives stabilise.

Options considered:
- Stub only — rejected: docs structure should inform primitive design
- Content plan only — rejected: not concrete enough, easy to defer
- Full skeleton running — chosen: forces honest thinking about what
  Cadmus actually covers before primitives are locked in

The docs structure is treated as a design artefact, not just marketing.
If something can't be documented clearly, the primitive design is wrong.

**Revisit if:** Never. Documentation is the product. This principle is
permanent.

---

## 2026-06-18 — Project restructure: Salvation monorepo, Cadmus framework, Krypto product

**Decision:** Restructure the project as a monorepo (`salvation`) containing
the Cadmus framework (`packages/cadmus/`, `@bowenlabs/cadmus`) and the Krypto
reference application (`apps/krypto/`). What was previously `krypto` becomes
`krypto`. What was previously `core/` shared utilities becomes the foundation
of the Cadmus framework package.

**Options considered:**
- Continue as a single-product repo (Krypto) — rejected: misses the framework opportunity, `core/` was already framework-shaped
- Separate repos from day one (cadmus repo + krypto repo) — rejected: coordination overhead while both are moving fast, no shared tooling
- Monorepo from day one — chosen

**Rationale:**
The `core/` boundary was already functioning as a proto-framework. Formalising
it as `@bowenlabs/cadmus` makes the abstraction explicit, forces the right
separation, and means Krypto builds against the real package API from day one.
The monorepo avoids cross-repo coordination cost until Cadmus is mature enough
to stand alone — at which point `packages/cadmus/` is extracted cleanly.

Krypto serves as Cadmus's reference implementation, proving every primitive
in production before stability guarantees are made. Cadmus `1.0.0` is not
tagged until at least one app other than Krypto uses it in production.

**Naming:**
- Monorepo: `salvation` (github.com/bowenlabs/salvation)
- Framework: Cadmus (`@bowenlabs/cadmus`)
- Product: Krypto (`apps/krypto/`)
- Private tooling: `krypto-tooling` (was `krypto-tooling`)
- Extensions: replaces "extensions" throughout

**Revisit if:** Cadmus gets meaningful independent adoption and needs its own
repo, docs site, and release cadence separate from Krypto's.

---

## 2026-06-18 — Domain onboarding strategy (Section 2 forward-planning)

**Decision:** DNS delegation (nameserver transfer to Cloudflare) as the default path for clients with existing domains. CF account + domain registration via Stripe provisioning protocol for new domains. Domain state tracked in `site_settings` from Section 1.

**Context:**
Section 2 will need to provision Cloudflare accounts and configure domains on behalf of clients. Three provisioning paths exist depending on the client's situation. This decision captures the architecture for each and the data model implications that must be in place from Section 1.

**Client onboarding spectrum:**

The client population is not cleanly bimodal — it spans a spectrum:
- **No domain, doesn't know what one is** — needs Krypto to handle everything invisibly
- **Has a domain, doesn't know where** — registered years ago, login email likely defunct
- **Has a domain, knows what it is** — can follow instructions if they're clear
- **Has a domain and a live site** — needs zero-downtime cutover, can't break anything

**Provisioning paths:**

**Path A — New domain, new CF account (Stripe provisioning protocol)**
- Client has no domain or chooses a new one
- Krypto (via the Orchestrator) triggers CF account provisioning in the client's name using the Stripe-integrated protocol (launched April 2026)
- Domain registered via CF Registrar API (currently in beta)
- Client ends up as the actual account owner with their own CF dashboard
- Krypto holds a scoped, revocable API token for ongoing deployments
- At handoff, token is revoked or transferred — client has full independent ownership
- **Known beta gaps:** CF Registrar API does not yet support renewals, transfers, or contact updates programmatically. These are manual processes post-registration. Track for resolution.

**Path B — Existing domain, DNS delegation (recommended for most existing-domain cases)**
- Client owns a domain at an external registrar (Namecheap, GoDaddy, Squarespace, etc.)
- Krypto instructs the client to point their nameservers at Cloudflare
- Once delegated, Krypto manages DNS records programmatically (CNAME, A, MX, etc.)
- Client does not need to transfer the domain — registrar relationship is unchanged
- Krypto gains full DNS control without touching the registrar
- **Identity note:** The Stripe provisioning protocol uses the client's email to match or create a CF account. The client's Krypto login email may differ from their Stripe billing email — identity reconciliation must be explicit in the Section 2 onboarding flow, not assumed.

**Path C — Full domain transfer to CF Registrar**
- Client transfers domain ownership to Cloudflare Registrar
- Cleaner long-term (one fewer vendor), but: transfers take days, 60-day post-registration lock window, Registrar API cannot initiate transfers programmatically
- Not a primary path — offer as an option after onboarding is complete, never as a blocker

**Path D — CNAME/A record only, client keeps DNS control**
- Client updates a single DNS record, Krypto doesn't control DNS
- Lowest friction, but Krypto loses the ability to manage DNS going forward
- Fragile for Section 2+ workflows that require DNS management
- Only appropriate as a fallback if the client refuses nameserver delegation

**Onboarding UX framing (not technical paths):**

The client-facing onboarding questions should be plain-language, not technical:

1. "Do you have a website address already?" → Yes / No / I'm not sure
2. If yes: "Do you know where it's registered?" → Yes / No / I'm not sure

"I'm not sure" on both should funnel into a domain search flow, not a dead end. Searching a name they want lets Krypto check availability, suggest alternatives, and surface whether they already own it (CF's provisioning protocol detects matching accounts). Never present a 404 or error state — always offer a next step.

**Section 1 data model requirement:**

The following fields must be present on `site_settings` from Section 1. Section 1 does not act on them — they exist so Section 2's onboarding flow has state to read and write without a migration.

```
domain:           primaryDomain (text)
                  domainProvider: 'cloudflare' | 'external' | 'unknown' | null
                  nameserverDelegated: boolean (default false)
                  domainRegisteredViaKrypto: boolean (default false)
                  cfAccountId (text, nullable) — populated by Orchestrator in Section 2
                  cfApiTokenScoped: boolean (default false) — true while Krypto holds deploy token
```

`domainProvider: 'unknown'` is a valid and expected state — never treat null/unknown as an error. The "I don't know" client is a first-class case.

**Cloudflare ownership model:**

Krypto uses Path B (agent provisioning via Stripe protocol), not the Tenant API. The distinction matters:
- **Tenant API** (rejected): Cloudflare user account is BowenLabs' — client is invited as a member, not a true owner. Wrong for Krypto's ownership philosophy.
- **Agent provisioning** (chosen): CF account is provisioned in the client's name. Client is the actual account owner. Krypto holds a scoped token, not ownership.

**Zero-downtime cutover (Section 2 concern, flag for Section 1 Phase 13):**

Clients with an existing live site need Krypto to be fully deployed and DNS-ready before the nameserver flip. This is a staging → live promotion flow. Phase 13 (seed, export, hardening) should leave a hook for this — specifically, the ability to deploy to a preview URL before the domain is pointed.

**Registrar API beta gaps to track:**
- Renewals, transfers, contact updates not yet available programmatically
- Stripe Projects (the provisioning protocol) is in open beta — validate for Krypto's non-agent, platform-driven use case before building Section 2
- Confirm scoped token permissions needed for deploy-only access

**Revisit if:** Registrar API exits beta with full programmatic support (simplifies Path A). Better Auth's Cloudflare story improves (affects Section 2 auth model, not domain provisioning). Tenant API introduces client ownership transfer as a native feature (changes the Path A vs Tenant API calculus).

---

## 2026-06-17 — Panel framework: TanStack Start

**Decision:** TanStack Start for the Panel (Worker 2), Astro for the public site (Worker 1), VMFE architecture via Cloudflare Service Bindings

**Options considered:**
- Hono + TanStack Router SPA — stable, Hono RPC typed client, two build pipelines
- TanStack Start + Astro VMFE — Panel gets server functions (no explicit API layer), one Vite build, RC risk contained by Worker isolation

**Decision:** TanStack Start for Panel, Astro for public site, vertical microfrontend architecture.

**Rationale:**
- The split between a content site (public) and an application (Panel) maps exactly to Astro vs TanStack Start strengths — this pattern is independently crystallizing in the community
- TanStack Start server functions remove the explicit Hono API layer for Panel data fetching — Drizzle types flow directly to Panel components via `getCloudflareContext()` in server functions
- VMFE architecture means the Panel Worker is completely independent — RC risk doesn't affect the public site or operator fork update merges
- Both Workers share the same D1, KV, R2 bindings — same database_id and bucket_name, one schema, one migration run
- Cloudflare is a financial sponsor of TanStack — the RC label means "not 1.0" not "don't use in production"
- One Vite build pipeline instead of two (Astro + separate Vite) reduces ongoing complexity

**Architecture:**
```
Worker 1: Astro public site  — bindings: DB, KV, R2
Worker 2: TanStack Start Panel — bindings: DB, KV, R2 (same IDs)
Shared:   core/db/schema.ts, core/lib/* — imported by both
Hono:     lives in Worker 2 custom server entrypoint for public API routes
          (form submission, auth, media upload — unauthenticated callers)
```

**Revisit if:** TanStack Start 1.0 introduces breaking changes that require significant migration. Monitor the changelog before running `update.yml` on major version bumps.

---

## 2026-06-17 — TanStack DB: deferred to Section 2+

**Decision:** Do not use TanStack DB in Section 1. Introduce in Section 2+.

**What it is:** TanStack DB extends TanStack Query with reactive client-side collections, live cross-collection queries, and optimistic mutations. It is not a replacement for TanStack Query — Query handles server communication, DB adds a local reactive data layer on top.

**Why not Section 1:**
- TanStack DB is in beta (0.x). Section 1 has enough RC/beta risk with TanStack Start.
- Section 1's Panel has simple data needs — single owner, small datasets, no real-time collaboration. TanStack Query alone is the right tool.
- TanStack DB's value compounds with relational complexity (contacts → activities → submissions cross-queries) and collaborative features (team members editing simultaneously). Neither exists in Section 1.

**Why Section 2+:**
- Team access means multiple users editing the Panel simultaneously — optimistic mutations become critical
- Real-time inbox (form submissions arriving while Panel is open) is a natural TanStack DB use case
- Cross-collection queries (contacts with their activities, submissions with their contacts) are where TanStack DB's relational layer pays off
- Migration from TanStack Query to TanStack DB is explicitly designed to be incremental — existing Query code continues working

**Revisit when:** Team access ships in Section 2. Evaluate TanStack DB beta maturity at that point.

---

## 2026-06-17 — Image service architecture

**Decision:** `ImageService` interface pattern with `defaultImageService` (R2 direct, no transformation)

**Options considered:**
- Sharp for server-side resizing — rejected: Sharp requires native binaries, does not run on Cloudflare V8 isolate
- Separate Go/Node service with Sharp — rejected: absorbs infrastructure cost for every Krypto site, violates free-forever promise
- Cloudflare Images — deferred to Section 2+ as a paid extension add-on
- R2 direct serving with HTML best practices — chosen for Section 1

**Decision:**
Store originals in R2. Serve as-is. Use `loading="lazy"`, `decoding="async"`, `srcset`, and `sizes` for browser-side optimization. Enforce 5MB upload limit in Panel with a clear warning.

All image rendering goes through `core/lib/image-service.ts` — never construct or transform image URLs inline. This allows a Cloudflare Images extension to replace the service implementation without touching any component, renderer, or block data.

**Rationale:** No server-side image processing in Section 1 keeps Krypto free and infrastructure-simple. The `ImageService` interface pattern means the upgrade path to Cloudflare Images is a extension, not a refactor. Original R2 URLs stored in the database; transformation is a render-time concern.

**Revisit if:** Image quality becomes a meaningful barrier to adoption, especially for the portfolio extension. Cloudflare Images is the planned Section 2+ answer.

---

## 2026-06-17 — Authentication strategy

**Decision:** Hand-rolled magic link (Web Crypto + Cloudflare KV)

**Options considered:**
- Cloudflare Zero Trust (CF Access) — rejected: seed-time complexity, CF Access setup is fragile, creates operational dependency
- Better Auth — rejected: known Cloudflare Workers runtime failures as of late 2025, module import errors, D1 adapter issues documented as "quick fixes not solutions"
- Resend magic link — rejected: third-party dependency, requires operator account, violates free-forever infrastructure promise
- Passkeys (WebAuthn) — considered: clean for single owner, but recovery story is complex and team/customer auth (Section 2) needs a different solution anyway
- Hand-rolled magic link — chosen

**Decision:**
Magic link flow using Web Crypto API for token generation and HMAC session signing, Cloudflare KV for token and session storage.

```
Owner enters email → token generated (crypto.getRandomValues)
→ hashed token stored in KV (15 min TTL)
→ raw token sent via CF Email Workers
→ owner clicks link → token hashed + validated
→ KV entry deleted (single use)
→ session created → signed cookie set → session stored in KV (7 day TTL)
```

**Rationale:** No third-party dependency. No operator account required beyond Cloudflare (already required). Web Crypto is available in all Workers contexts. Magic link UX is well understood by non-technical users. Single-owner Section 1 use case does not justify the complexity of a full auth framework.

**Revisit if:** Team access and customer portals are needed (Section 2). Better Auth's Cloudflare story should be re-evaluated then — runtime issues may be resolved. Do not stub auth abstractions for future use in Section 1.

---

## 2026-06-17 — CMS and data layer

**Decision:** Drizzle ORM + Cloudflare D1 directly — no CMS

**Options considered:**
- Payload CMS 3.x — used in v1, rejected for v2: admin UI disabled (we built the Panel ourselves), bundle weight from a dependency whose main feature we disabled, Payload adapter for D1 adds a layer we don't need, Next.js version pinning anxiety from Payload compatibility constraints
- Contentful / Sanity / other hosted CMS — rejected: violates operator data ownership, requires third-party account, adds cost
- Drizzle + D1 directly — chosen

**Decision:**
Drizzle ORM with drizzle-kit for migrations. D1 as the database. No abstraction layer between Drizzle and the application — raw Drizzle queries everywhere.

**Rationale:** Payload v1 was used primarily for: schema definition, migrations, typed queries, hooks, auth, and the admin UI. By v1 completion, the admin UI was disabled, auth was replaced (CF Zero Trust), and the Panel was fully custom. What remained was essentially Drizzle with extra steps. Drizzle + D1 directly is cleaner, lighter, and removes a significant source of bundle weight and version constraint.

**Revisit if:** Never. This is a permanent decision for Section 1–4.

---

## 2026-06-17 — Framework selection

**Decision:** Hono + Astro + TanStack Router

**Options considered:**

**Option A: Next.js + OpenNext**
- Pros: one build pipeline, high familiarity from v1, large ecosystem, OpenNext actively maintained by SST
- Cons: OpenNext adapter layer adds cold start overhead, `getRequestContext()` shim for binding access, ISR revalidation behavior on Workers unverified and known to have quirks, bundle size grows with roadmap (10MB Worker limit becomes a constraint as extensions ship), Next.js + OpenNext version lag on security patches

**Option B: Hono + Astro + TanStack Router** (chosen)
- Pros: native Cloudflare Workers (no adapter), `c.env.DB` / `Astro.locals.runtime.env` for clean binding access, Astro zero-JS public site, Hono RPC gives end-to-end type safety, explicit CF Cache API control, customer portals and future SPAs fit naturally as additional Vite builds served by the same Hono spine, bundle size never a constraint (Panel is static assets), smaller dependency surface
- Cons: two build pipelines, lower familiarity, three frameworks to track across releases

**Scored comparison:**

| Dimension | Next.js + OpenNext | Hono + Astro + TanStack | Winner |
|---|---|---|---|
| Cold start performance | Slower (adapter) | Faster (native) | B |
| Public site performance | Good (RSC) | Excellent (Astro zero-JS) | B |
| Security model | Good | Slightly better (explicit API boundary) | B |
| Maintainability (single dev) | Better (one pipeline) | More moving parts | A |
| Maintainability (fork model) | Better (simpler) | More complex updates | A |
| Section 2 compatibility | Good | Better (multiple SPAs) | B |
| Section 3 extensions | Good | Better (independent layers) | B |
| Section 4+ roadmap | Constrained (bundle) | Naturally extensible | B |
| Current velocity | Higher (familiarity) | Lower (learning curve) | A |

**Rationale:**
Option B wins on architecture (6/9 criteria) and on the dimensions that compound over time — roadmap compatibility, bundle size, security model, public site performance. Option A wins on near-term maintainability and velocity, but those advantages diminish as familiarity with Option B grows. The bundle size constraint of Option A is the decisive factor: as extensions ship in Section 3, a Next.js app serving everything in a single Worker will approach the 10MB limit and require active management. Option B never has this problem.

The Hono RPC typed client (`hc<AppType>`) is a genuine DX superpower — end-to-end type safety from Drizzle schema to Panel SPA component with zero manual type maintenance. This multiplies a one-person studio's ability to refactor confidently.

**Architecture:**
```
Cloudflare Worker (Hono — spine)
├── /* → Astro SSR handler (public site)
├── /admin/* → Panel SPA shell (TanStack Router, served as static assets)
└── /api/* → Hono route groups (typed, RPC-compatible)
```

Two build pipelines unified by a single `wrangler deploy`:
- Astro → `dist/site/` (SSR Worker + public assets)
- Vite → `dist/panel/` (Panel SPA static bundle)

**Revisit if:** Hono + Astro integration proves significantly more complex than expected during Phase 0 POC. The POC must validate all four risk scenarios before Phase 1 begins.

---

## 2026-06-17 — Update and maintenance model

**Decision:** GitHub template with weekly upstream merge via `update.yml`

**Options considered:**
- npm package distribution — rejected: does not allow operators to own and modify their codebase
- Managed hosting — rejected: violates operator data ownership, changes Krypto's product category
- Manual updates — rejected: non-starters for a "white glove" experience
- GitHub fork + upstream merge — chosen

**Decision:**
Krypto is distributed as a GitHub template. Operators fork it and own their instance. `update.yml` (GitHub Actions, weekly) fetches from `bowenlabs/krypto:main` and auto-merges if CI passes. Opens a GitHub issue if there are conflicts.

The `core/` vs `custom/` folder boundary is enforced by ESLint rules and documented convention. Operators never edit `core/` — if they do, `update.yml` merges will produce conflicts.

**Maintenance tiers:**
- Tier 0 — Self-maintained (free): operator manages fork, `update.yml` handles updates
- Tier 1 — Managed updates (Section 2+): Orchestrator monitors forks, BowenLabs resolves conflicts
- Tier 2 — Fully managed (Section 3+): BowenLabs manages full deployment lifecycle

**Rationale:** Tier 0 costs BowenLabs nothing per operator at scale. GitHub Actions is free for public repos. The self-maintaining fork model is the foundation that makes all paid tiers possible affordably. The `core/custom` boundary is the mechanism that makes weekly auto-merges safe.

**Revisit if:** Never for the core model. Managed tiers are additive, not replacements.

---

## 2026-06-17 — Linting and formatting

**Decision:** Biome

**Options considered:**
- ESLint + Prettier — the traditional choice, well understood, large ecosystem
- Biome — fast (Rust), unified (one tool for lint + format), zero config conflicts between linter and formatter, becoming production standard

**Decision:** Biome. Replaces both ESLint and Prettier.

**Rationale:** For an open source project where contributors need a fast feedback loop, Biome's speed advantage is meaningful. No ESLint/Prettier config conflict edge cases to debug. One tool, one config file (`biome.json`), one `pnpm lint` command. The ecosystem is large enough for Krypto's needs.

**Revisit if:** A specific lint rule required by Krypto is unavailable in Biome and has no equivalent. Check Biome's rule coverage before adding any custom ESLint rule.

---

*Krypto — Open source. Always free. Built with care.*
*A BowenLabs project.*
