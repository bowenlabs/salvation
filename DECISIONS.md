# Decisions

> This file is operator-owned. Cadmea will never overwrite it.
> Record every significant architectural decision here with date, options
> considered, decision made, and rationale. This is the first file a new
> engineer reads after CLAUDE.md.
>
> Format: newest decisions at the top.

---

## 2026-06-22 — Cadmea worker CSP requires `'unsafe-inline'` on `script-src`

**Decision:** `script-src 'self'` (no `'unsafe-inline'`, nonce, or hash)
silently broke all client-side hydration in the Cadmea worker — TanStack
Start ships its hydration payload (the `$_TSR`/`$R` data script) and
`__root.tsx`'s `THEME_INIT_SCRIPT` as inline `<script>` tags. Under that
CSP, browsers must drop them: SSR HTML still renders correctly (looks
fine at a glance), but the client never re-executes route components, no
event listeners attach, and no client-side query (`createQuery`) ever
fires. Confirmed via direct instrumentation — a component's own
`console.log` proved it ran server-side but never again client-side.
Added `'unsafe-inline'` to `script-src` in `app/core/lib/security-headers.ts`.

**Why not a nonce instead:** `@tanstack/start-server-core` declares a
`nonce?: string` field on its request context type
(`request-handler.d.ts`), but no published version actually reads or
applies it — checked the current stable (`1.169.15`) and the `2.0.0-beta.22`
prerelease line directly (downloaded both, grepped the dist code): neither
wires that field into the rendered inline scripts. Upgrading wouldn't have
helped; the feature is reserved-but-unimplemented upstream.

**This likely explains prior "click doesn't work" observations**
dismissed as dev-tooling flakiness while building issues #10/#11/#12 in
earlier sessions (ThemeToggle, theme-preset cards, settings tabs) — same
root cause, not separate bugs.

**Revisit if:** TanStack Start ships a working `nonce` implementation —
switch to a per-request nonce instead of `'unsafe-inline'` at that point.

---

## 2026-06-22 — `array` fields support discriminated per-item editing

**Decision:** `ArrayFieldConfig` (`packages/cadmus/src/cms/types.ts`)
gained an optional `discriminator: { key, variants }`. `fields` still
renders for every item (including the discriminator's own field, normally
a `select`); `variants` maps each of that field's values to *additional*
fields layered on top only for items currently holding that value.
Storage is unaffected — `array` is still one JSON column either way (see
codegen.ts); this only changes what `CollectionEdit`'s `renderArrayInput`
renders. `app/cadmea.config.ts`'s `pages.blocks` now models the real
`Block` union from `app/core/lib/blocks.ts` (`richText | image | hero |
divider`) instead of a placeholder `{ type: { type: "text" } }` — image
blocks get a real `upload` field, wired directly into issue #12's
MediaUploader/`/api/media/upload` pipeline.

**Deferred, not solved by this:** there is still no way for
`CollectionEdit` itself to drive a live preview of the rendered page —
this only fixes what fields show per block type in the editor, not a
WYSIWYG canvas.

---

## 2026-06-22 — Issue #12 (Phase 11 — Media and R2) shipped

**Decision:** `POST /api/media/upload` (Hono route in
`app/workers/cadmea/app/server.ts`) — session-cookie auth (re-checked
independently of the route guard, same reasoning as
`requireSameOriginOrThrow`), same-origin check, KV rate limit
(20/hour/user), image MIME whitelist + 5MB cap (`validateImageFile`, new
in `packages/cadmus/src/storage`), `crypto.randomUUID()` keys (no
filename leakage into R2 keys — `createR2ImageService.upload()` was
fixed to drop the raw filename it previously appended), returns the
public `MEDIA_URL` URL. `<MediaUploader>` (drag-and-drop, progress, XHR
since the browser has no R2 binding) replaces the logoUrl/faviconUrl text
inputs in Settings → General, and is wired as `onUploadFile` through
`createCollectionEditPage`/`createCollectionCreatePage` so *any*
collection's `upload` fields work, not just pages.

**Also fixed while implementing this:** `BlockRenderer.astro`'s image
block, `SiteNav`/`HomepageGallery`/`coming-soon`'s logo `<img>` tags all
now read through `ImageService.render()` instead of a raw stored URL —
zero visual effect today (`render()` is a pass-through, see the 2026-06-17
"Image service architecture" entry below), but means a future Cloudflare
Images extension (Section 3+) can swap the implementation without
hunting down every direct URL read.

**CSP `img-src` needed the `MEDIA_URL` origin added** — uploaded images
are served from a different host than `'self'` in most deployments; CSP
is now built per-request in `security-headers.ts` instead of a static
module-level string, so it can read `env.MEDIA_URL`.

**Deferred to a separate follow-up, not in scope here:** a real
block-type-aware page-builder UI beyond generic field editing (tracked as
a discriminated-array-fields improvement, see the entry above — that one
*is* done; a true visual block canvas is not).

---

## 2026-06-22 — Issue #11 (Phase 10 — Settings and design CMS admin) shipped

**Decision:** Two new Panel routes — `/admin/settings`
(General/Contact/SEO/Export tabs) and `/admin/design`
(Theme/Colors/Typography/Spacing tabs) — hand-built, not
`CollectionEdit`-driven, since `site_settings` is confirmed to stay a
hand-written Drizzle table, not a `cadmus/cms` collection (see the
2026-06-21 "`site_settings` stays a hand-written core table" entry).
`saveSettings`/`saveDesignSettings` server functions follow `pages.ts`'s
exact auth/CSRF/rate-limit shape. Both pages share one Save button per
page (not per tab) and a `useBlocker`-based unsaved-changes guard.

**A real gap found and fixed in shared logic:** `buildTokenStyle()`
(`app/core/lib/design-system/build-token-style.ts`) never applied
`site_settings.fontPairing` — it loaded the Google Fonts `<link>` but
never wrote `--font-display-face`/`--font-body-face`, so picking a font
pairing had zero visual effect anywhere it was already wired (the public
site, the Panel, the preview-token listener). Fixed once in the shared
function; all three existing callers benefit.

**Live preview mechanism:** a small Solid context
(`design-preview-context.tsx`) lets `/admin/design`'s form push
uncommitted edits up to the already-mounted `<BrandColorProvider>` in
`__root.tsx` so the Panel itself re-themes before saving, reverting on
unsaved navigation-away. `<SettingsPreviewPane>` mirrors the same
postMessage wire format `preview-token-listener.ts` already expected.

**Known dev-only limitation:** the preview iframe needs both Workers on
the same origin — `pnpm dev`'s `:3000`/`:3001` split means it won't load
cross-port locally. Works wherever both Workers share one custom domain.

---

## 2026-06-22 — Issue #10 (Phase 9 — Citadel CMS shell) shipped

**Decision:** `<PanelShell>`/`<PanelNav>`/`<PanelHeader>` — mobile
sidebar with a real focus trap, metadata-driven nav (built from
`cadmeaConfig.collections`, not a hardcoded link list — see the issue's
own reframing comment), `/admin/extensions` static placeholder. Nav scope
is metadata-driven and core-only: Forms/Inbox/Contacts are
example-template collections, not Cadmea core, so they're deliberately
not nav items.

**`__root.tsx` now hides the public Header/Footer under `/admin/*`** —
`<PanelShell>` owns the entire admin chrome instead.

---

## 2026-06-22 — `@bowenlabs/cadmea`'s `CollectionEdit`/`CollectionList` render all 9 field types

**Decision:** Closes the gap flagged at the end of Phase 4 (see the entry
below) — `checkbox`, `upload`, `richText`, `array`, and `relationship`
(`hasMany:false` only) now render in `CollectionEdit`/`CollectionList`,
alongside the existing `text`/`select`/`number`/`date`. Blocks issue #11
otherwise.

**`checkbox` needed a `packages/cadmus` fix first, not just UI:**
`codegen.ts`'s `fieldToColumn()` had a real, separate gap — it threw
`CadmusCmsError` for `checkbox` (`richText`/`array`/`upload`/`relationship`
were already generating real columns; checkbox alone wasn't, per issue
#16 step 4's original scope). Added a `case "checkbox"` generating
`integer(columnName, { mode: "boolean" })` — the same convention already
used by the hand-written boolean columns in `app/core/db/schema.ts`
(`darkMode`, `disableIndexing`, etc.), rather than inventing a second
boolean representation. The existing test that asserted this throws was
flipped to assert the real column shape; drizzle reports its
`columnType` as `"SQLiteBoolean"`, not `"SQLiteInteger"` — worth knowing
if anyone else hits this, the docs/types don't make that naming obvious.

**`relationship` scoped to `hasMany:false`:** no collection in the repo
uses either variant today, so `hasMany:true` (join-table-backed
multi-select) was deliberately deferred rather than built against nothing
concrete. `CollectionEdit` renders nothing for `hasMany:true` fields
rather than guessing at a UI.

**`upload`/`relationship` keep `CollectionEdit` storage- and
collection-agnostic:** neither field type has `CollectionEdit` reach into
`cadmus/storage` or query another collection directly. Two new optional
props instead — `onUploadFile: (file: File) => Promise<{ url: string }>`
(matching `ImageService["upload"]`'s signature) and
`relationshipOptions: Partial<Record<string, Array<{id, label}>>>` keyed
by `relationTo` — both filled in by whatever route consumes the
component, which already has the actual D1/R2 access.

**`richText` uses `@tiptap/core` directly, lazy-loaded:** per CLAUDE.md's
preference for the framework-agnostic core API over an unofficial
community port (same call already made for Phosphor icons), `RichTextEditor.tsx`
wraps `@tiptap/core`'s vanilla `Editor` class in Solid's
`onMount`/`onCleanup` — no official Solid binding exists. Added
`@tiptap/core`/`@tiptap/starter-kit` (`^3.27.1`, matching the version
already pinned in `app/workers/cadmea/package.json`) as real
`dependencies` of `@bowenlabs/cadmea`, not peers — they're an
implementation detail of one component, not a framework choice every
consumer needs to align on.

**Caught and fixed during implementation, not after — TipTap's bundle
weight:** a first pass statically imported `RichTextEditor` at
`CollectionEdit.tsx`'s module top. Building `app/workers/cadmea` showed
this pulled `@tiptap/core` + `@tiptap/starter-kit` + ProseMirror into
*every* route that imports `CollectionEdit`, including ones with zero
richText fields — the `pages` route chunk grew from ~9KB to ~806KB
(200KB gzipped). Fixed by `lazy()`-loading `RichTextEditor` instead
(wrapped in `<Suspense>` only around the `richText` case, with a
DaisyUI spinner fallback) — confirmed via a rebuild that the `pages`
chunk dropped back to ~13KB with the TipTap weight isolated into its own
~793KB chunk, fetched only when a richText field is actually rendered.

**Verified:** `pnpm --filter @bowenlabs/cadmus test` (85/85),
`pnpm --filter @bowenlabs/cadmea test` (15/15, 10 new — one per field
type plus the hasMany:true no-render case and the array add/fill/remove
round-trip), `pnpm build` (full pipeline), `pnpm lint`. No collection in
the repo exercises any of these types yet (`pages` still only uses
`text`/`select`/`date`/`number`) — tests use throwaway collection configs
inline, not `pages`.

**Revisit if:** `hasMany:true` relationships get a real use case — needs
join-table query plumbing that doesn't exist yet. Also revisit if
`RichTextEditor` ever needs to be used outside `CollectionEdit` — it's
currently unexported from `packages/cadmea/src/index.ts`, deliberately
kept internal until something concrete needs it directly.

---

## 2026-06-22 — Phase 4 (design system) complete

**Decision:** Implemented all 12 milestones of issue #5 — six DaisyUI v5
theme presets, the OKLCH color-scale/contrast/font-pairing primitives, the
spacing/type token resolvers, the cross-Worker token cascade, and both
live-preview mechanisms (public-site postMessage listener, Panel
`BrandColorProvider`). See SECTION_1_PLAN.md's Phase 4 section for the
per-milestone breakdown and `app/core/lib/design-system/README.md` for the
ongoing reference doc (cascade architecture, token names, theme list).
This was blocked behind issue #16 (`@bowenlabs/cadmus/cms`); unblocked once
that closed.

**Reference implementation, not a clean-room build:** a sibling project
(internally referred to as "Louise" — Next.js/Payload, not part of this
monorepo) had already built nearly this exact system. Its math
(`color-scale.ts`'s OKLCH conversion, `contrast.ts`'s WCAG ratio, the
spacing/type-token resolvers, the 4-layer cascade architecture) ported
directly — zero framework dependency. Its actual CSS variable *names* did
not: that project used a hand-rolled ~200-token namespace (`--navbar`,
`--primary-50`...`--primary-950` as a fixed ramp), while Thebes uses
DaisyUI v5's own fixed namespace. Confirmed against
`node_modules/daisyui@5.5.23/theme/*.css` before writing any theme file —
this is exactly the class of mistake the 2026-06-19 G12 entry below
documents (DaisyUI v4 names silently doing nothing under v5). Theme preset
names were renamed from the source project's branding (`louise` →
`citadel`) to match Thebes' own naming.

**Real naming collision found and fixed:** Cadmea's pre-existing dark-mode
toggle (`ThemeToggle.tsx`, `__root.tsx`'s init script) already wrote
`data-theme="light"`/`"dark"` to mean *mode*. This phase's convention
(`data-theme="theme-{preset}"` for the *preset*, a separate `.dark` class
for mode) collides with that — same attribute, two meanings, silently
fighting each other. Fixed by making `BrandColorProvider` the sole writer
of `data-theme`; the toggle now only ever touches the `dark`/`light` class.
The now-unreachable `:root[data-theme="dark"]` CSS block in
`app/workers/cadmea/src/styles.css` was rewritten as `:root.dark` so dark
mode didn't silently stop working once the attribute write was removed.

**`pickContentColor()` — not in the original plan:** DaisyUI v5 pairs
every color role with a `-content` (text-on-color) token. The reference
project always used a fixed `--primary-foreground: white`, safe only
because its primary swatch's lightness was hand-tuned to stay dark.
Generic brand-color input (any hex an owner picks) can't assume that, so
`color-scale.ts` gained an OKLCH→sRGB inverse conversion and a real WCAG
AA check (via `contrast.ts`) to choose black or white content text per
generated swatch, rather than guessing.

**Theme files are duplicated across both Workers, not shared:** Cloudflare
Workers each have isolated static asset bindings — there's no mechanism in
this stack to serve one Worker's `public/` files from another. The six
theme CSS files exist in both `app/workers/site/public/themes/` and
`app/workers/cadmea/public/themes/`, kept in sync manually (each file
says so in a header comment). Revisit if a build step to copy them
automatically becomes worth the investment.

**Schema check before assuming a column was missing:** the original plan
draft (mid-implementation) assumed `displayFontOverride`/`bodyFontOverride`
columns existed on `site_settings`, since the reference project had them.
They don't — neither CLAUDE.md's `site_settings` field table nor
`core/db/schema.ts` defines them. Rather than add a migration for a
feature not actually in scope, the per-field font-override feature was
dropped from this phase; only `fontPairing` (which does exist) is wired
up. Revisit if per-field font overrides are wanted later — needs a real
migration, not just code assuming the column exists.

**Scope boundary:** issue #5's milestones stop at "verify token cascade on
a test page" (4.12). The Panel's actual design-settings *editing* UI
(theme picker, brand-color picker, font-pairing picker, spacing/type
editors, live-preview pane) was not built — it depends on
`@bowenlabs/cadmea`'s `CollectionEdit` supporting more field types than
`text`/`select`/`number`/`date` (a gap identified separately, not yet its
own issue). `app/workers/site/src/pages/token-test.astro` was rewritten
from a Phase-0 POC fixture into the real verification page for this
phase, but it's a manual test page, not the settings UI.

**Verified:** `pnpm build:cadmus`/`build:site`/`build:cadmea`, `pnpm lint`
(Biome + the prerender check — `__root.tsx`'s new `loader` reading
`site_settings` via a server function required adding
`export const prerender = false`, the same rule `admin/route.tsx` already
follows). Confirmed via live `wrangler dev` + curl that the built CSS's
`.bg-primary` rule resolves to `var(--color-primary)` and that
`public/themes/theme-{name}.css` serves correctly for all six presets —
the same check that would have caught the 2026-06-19 G12 incident had it
recurred. Did not get a real browser screenshot (Chrome extension wasn't
connected in this session) — the curl-based check above substitutes for
the substantive risk (CSS variable names actually wiring up) but isn't a
full visual confirmation.

**Revisit if:** the Panel settings-editing UI work starts — at that point
`CollectionEdit`'s field-type gap (richText/checkbox/relationship/array/
upload all currently render nothing) needs addressing first, and the
per-field font-override question above should be revisited.

---

## 2026-06-22 — `@bowenlabs/cadmea` gets a real build + a TanStack Start mounting helper

**Decision:** Closes the two gaps flagged when the package was first
extracted: it shipped as raw Solid JSX source (untested outside this
monorepo's workspace-symlink consumption) and had no equivalent of
Payload's `@payloadcms/next` catch-all route pattern.

**Real build, via `tsup-preset-solid`:** Added `tsup.config.ts` using
[`tsup-preset-solid`](https://github.com/solidjs-community/tsup-preset-solid)
(the Solid community's standard tool for exactly this), which runs JSX
through `babel-preset-solid` via `esbuild-plugin-solid` — plain
esbuild/tsup would have silently produced generic `createElement`-style
output instead of Solid's fine-grained-reactive `template()`/`insert()`
calls. Confirmed by inspecting the compiled output directly: the browser
build uses `template`/`insert`/`effect` from `solid-js/web`; the separate
server build uses `ssr`/`escape` — matching how `solid-js` itself ships
dual builds. The preset auto-writes `package.json`'s `exports` map with
`worker`/`browser`/`deno`/`node` conditions per entry, resolved correctly
in this app's case via the Workers SSR environment loading the `worker`
condition (confirmed via a live `wrangler dev` request rendering
correctly with no SSR-vs-browser API mismatch).

**`@bowenlabs/cadmea/tanstack-start` subpath:** Three factories —
`createCollectionListPage`, `createCollectionCreatePage`,
`createCollectionEditPage` — wrapping `CollectionList`/`CollectionEdit`
with `@tanstack/solid-query` fetch/mutate/cache-invalidation logic,
returning a ready-to-use route `component`. Not a true runtime catch-all
(TanStack Router's file-based routing needs a real file per route, unlike
Next.js's `[[...segments]]`), but shrinks each route file from ~40
hand-wired lines to ~15. Navigation (`onRowClick`/`onCreated`/`onDeleted`)
deliberately stays in the route file rather than the package calling
`useNavigate()` itself — TanStack Router's route-typing is generated
per-app, so a generic package can't produce a correctly-typed
`navigate()` call for routes it doesn't know about.

**Real bug caught during design, not just refactoring:** the original
`$pageId.tsx` route's `queryKey: ["pages", id()]` evaluated `id()` once
at component-creation time — fine when written inline inside
`createQuery`'s own reactive tracking function (the original code), but
would have gone stale if naively lifted into a factory's plain options
object, since TanStack Router can reuse this component across a
`$pageId` param change without remounting. Fixed by typing
`CollectionEditPageOptions.queryKey` as `() => readonly unknown[]`,
evaluated inside the factory's own `createQuery` tracking scope — so
`id()` reads stay properly reactive regardless of which file calls it.

**`app/workers/cadmea/src/routes/admin/pages/{index,new,$pageId}.tsx`**
now consume the factories instead of hand-rolling query/mutation logic —
refactor verified behavior-parity via direct SSR HTML inspection of all
three routes (list header+new-link+loading-state, full create form with
all four fields, edit heading+delete button), against a live `wrangler
dev` instance.

**Verified:** `pnpm lint`, `pnpm build` (cadmus → cadmea-pkg → site →
cadmea-worker — note the new `build:cadmea-pkg` step inserted before the
app builds, since `app/workers/cadmea` now needs the package's `dist/`
output, not raw source), `pnpm test:cadmus` (85/85), `pnpm
test:cadmea-pkg` (8/8), and the live SSR parity check above.

**Revisit if:** more collections get added to `cadmea.config.ts` — at
that point a code-generation CLI step (writing the thin per-collection
route files automatically, closer to Payload's actual zero-boilerplate
experience) becomes worth the investment. Also revisit once
`@bowenlabs/cadmea` is actually published to npm (still pending — see the
2026-06-22 entry below from earlier today) and someone tries consuming it
from a genuinely separate project, to confirm the export-conditions
resolution holds outside this monorepo's own toolchain too.

---

## 2026-06-22 — `@bowenlabs/cadmea` package extracted; admin-UI components no longer live inline in the app

**Decision:** Executed the extraction deferred in the previous entry. New
`packages/cadmea/` package, mirroring Payload's split between engine
(`payload` core, already done here as `cadmus/cms`) and UI delivery
(`@payloadcms/next`/`@payloadcms/ui`). `CollectionList.tsx` and
`CollectionEdit.tsx` moved from `app/core/components/cms/` into
`packages/cadmea/src/`, published as `@bowenlabs/cadmea` (workspace
package, `@bowenlabs/` scope per the prior rename decision).
`app/workers/cadmea` now depends on it like any other package rather than
owning the components directly — the same relationship Payload's own
example apps have to `@payloadcms/next`.

**Built as source, not a tsup bundle — deliberately different from
`packages/cadmus`'s build:** Cadmus is pure TS with no JSX, so tsup/esbuild
compiles it correctly. Cadmea is SolidJS, and Solid's JSX must go through
`babel-preset-solid` to produce its fine-grained-reactive output — plain
esbuild JSX transform would silently produce React-style (non-reactive)
output. Rather than wire up a Solid-aware bundler (e.g. `tsup-preset-solid`)
for two small components, `package.json`'s `exports` map points directly
at `./src/index.ts`. Vite (already in `app/workers/cadmea`'s toolchain via
`vite-plugin-solid`) processes the workspace-linked package's `.tsx`
source directly — confirmed working: `pnpm build` bundles
`CollectionEdit-*.js` correctly from the package into the Worker's output.
Revisit if this is ever published outside the monorepo (an external
consumer's bundler may not be configured for Solid JSX in a dependency).

**Real pre-existing bug found and fixed while verifying:** `/admin/pages`
has apparently never actually rendered at runtime — `useQuery`/`useMutation`
calls throughout the pages routes had no `QueryClientProvider` anywhere in
the app, throwing `Cannot read properties of undefined (reading
'defaultQueryOptions')` the moment a query tried to run. Unrelated to
today's extraction (the crash is in `PagesPage` itself, before
`CollectionList` ever renders) but only surfaced because verifying the
extraction required actually checking rendered output, not just HTTP
status codes. Fixed: `QueryClient` is now created fresh inside
`getRouter()` (`app/workers/cadmea/src/router.tsx`) — not at module scope,
since Workers reuse the same isolate (and its module state) across
requests, and a singleton would leak one admin's query cache into
another's response — attached to the router context via
`createRootRouteWithContext`, and provided via `<QueryClientProvider>` in
`__root.tsx`.

**Verified:** `pnpm test:cadmea-pkg` (8/8, new), `pnpm test:cadmus`
(85/85, unaffected), `pnpm lint`, `pnpm build` (all three), and a live
`wrangler dev` check confirming `/admin/pages` now renders the page
chrome without the prior crash (full query-resolution render is streamed/
hydration-dependent, not visible in a single `curl`, but the crash itself
is gone and the correct components are present in the bundle).

**Revisit if:** more collections get added — at that point a real
route-mounting helper (the part of Payload's `@payloadcms/next` this
extraction didn't attempt, since one collection doesn't justify designing
that API yet) becomes worth building.

---

## 2026-06-22 — Rename: Citadel → Cadmea; apps/citadel → app/; docs/ folded into workers/site

**Decision:** "Citadel" was always meant to be the generic word for what
Cadmus built in the myth — the proper name is **Cadmea**, the actual
fortified citadel. The product/CMS name never caught up to that, despite
the root README already explaining the correct mapping. Fixed:

- `apps/citadel/` → `app/` (singular — there's one app, and the old
  directory had no `package.json` of its own anyway; only the two
  Workers underneath it are real pnpm packages)
- `apps/citadel/workers/cms/` → `app/workers/cadmea/`
- `citadel.config.ts` → `cadmea.config.ts`, `cmsConfig` → `cadmeaConfig`
- `CmsService` → `CadmeaService` (the Service Binding RPC class)
- Cookie `citadel_session` → `cadmea_session`
- Wrangler worker names `citadel-site`/`citadel-cms` →
  `thebes-site`/`thebes-cadmea`; D1 `citadel-db` → `thebes-db`; R2
  `citadel-media` → `thebes-media` (labels only — the live D1 resource
  has been `krypto-db` in the Cloudflare dashboard since an earlier,
  never-propagated rename; same pattern continues here)
- `CMS_URL` env var → `CADMEA_URL`; `CITADEL_SERVICE_KEY`/`CITADEL_SITE_ID`
  → `THEBES_SERVICE_KEY`/`THEBES_SITE_ID` (these identify the project to
  the external `citadel-tooling` Orchestrator repo, whose own name is
  unchanged — separate private repo, out of scope for this rename)
- `app/custom/components/panel/` → `app/custom/components/cadmea/` — this
  was already stale before today: the 2026-06-20 entry below renamed the
  Worker "Panel"→"CMS" but never updated this directory
- `docs/` (a README-only stub, no real content) deleted; `app/workers/site`
  is now positioned as the combined docs+marketing site for both Cadmus
  and Cadmea, replacing it. Its planned structure (primitive pages,
  guides, community-contribution docs) is preserved here rather than
  lost: `pages/index`, `pages/getting-started`, `pages/primitives/{auth,
  db,storage,cache,email,rate-limit,session,queues,hono}`,
  `pages/guides/{astro,tanstack,testing}`,
  `pages/community/primitives` — still not built, just relocated intent.
- Fixed a real Cadmus-core boundary leak found along the way:
  `packages/cadmus/src/cms/schema-gen.ts` hardcoded
  `apps/citadel/citadel.config.ts` into every generated schema file's
  header comment — a framework file embedding an app-specific path,
  which CLAUDE.md's own rules forbid. Genericized regardless of this
  rename.

**Deferred, not executed this pass:** extracting Cadmea's admin-UI
SolidJS components (`CollectionList.tsx`/`CollectionEdit.tsx`, currently
inline in `app/core/components/cms/`) into a separate `@bowenlabs/cadmea`
package — the Payload-equivalent split between `payload` (engine, already
done here as `cadmus/cms`) and `@payloadcms/next`+`@payloadcms/ui`
(UI delivery, not yet extracted here). This is real new-package
scaffolding (build tooling, an exports map, a route-mounting API for
TanStack Start consumers), not a rename — worth its own planning pass.

**What does not change:** `@bowenlabs/cadmus` itself (package name,
exports, the `cadmus/cms` engine subpath) — both packages keep the
`@bowenlabs/` scope. `domainRegisteredViaCitadel` (a `site_settings`
column name) and every reference to `citadel-tooling` are deliberately
left as-is — both name the external Orchestrator repo, not the CMS
product, and that repo's name is unchanged.

**Verified:** `pnpm test:cadmus` (85/85, package untouched by this
rename), `wrangler types` regenerated cleanly for both renamed Workers
confirming `CADMEA`/`CADMEA_URL`/`CadmeaService` resolve correctly.

**Revisit if:** the deferred `@bowenlabs/cadmea` package extraction
happens — this entry's "what does not change" section will need a
follow-up.

---

## 2026-06-21 — Phase 3 (authentication) complete

**Decision:** Phase 3 milestones (issue #4) are done — magic-link auth,
session management, and the two still-open security-audit gaps from
issue #4's comments (rate-limiting on CMS write paths, CSRF) are all
landed. One scope addition beyond the original milestones, two
corrections to the original plan, and one real bug found and fixed along
the way:

**Cadmus primitives implemented** (`cadmus/auth`, `cadmus/session`,
`cadmus/rate-limit`, `cadmus/email` — all were empty stubs):
- `auth`: `generateToken`/`hashToken`/`generateSessionId`/`signSession`/
  `verifySession`, Web Crypto only.
- `session`: generic JSON-over-KV store with retry-on-miss (G3) —
  no key-prefix convention baked in, that's Citadel's to own.
- `rate-limit`: fixed-window counter over KV, best-effort (not atomic —
  acceptable at this scale; a Durable Object would be the answer if exact
  counts ever mattered).
- `email`: wraps the CF `send_email` binding via `mimetext/browser` (no
  Node APsIs) for raw MIME construction. Added `mimetext` as a real
  dependency of `@bowenlabs/cadmus`.
- `cloudflare:email` added to `tsup.config.ts`'s `external` list — it's a
  Workers-runtime built-in, not bundleable.

**Binding split (per discussion):** sessions now live in the dedicated
`SESSION` KV namespace (already provisioned in `wrangler.jsonc` but
unused until now); magic-link tokens and rate-limit counters stay in the
generic `KV` namespace. `middleware.ts`'s `requireAuth()` was refactored
to use this plus `core/lib/session.ts`'s retry-aware `getSession`.

**Real bug found and fixed:** TanStack Start's `beforeLoad` route guards
(`src/routes/admin/route.tsx`) only run during client-side navigation —
they do **not** protect a server function's own HTTP endpoint
(`/_serverFn/*`) from being called directly. `pages.ts`'s
`createPage`/`updatePage`/`deletePage`/`getPages`/`getPage` had **no auth
check at all** on the actual mutating endpoints — anyone who found the
endpoint URL could read or write pages unauthenticated, route guard
notwithstanding. Added `requireAuthOrThrow()` (middleware.ts) and call it
first thing in every one of these handlers.

**CSRF finding, partially redundant:** issue #4 flagged that admin
mutations rely solely on `SameSite=Lax`. Added `requireSameOriginOrThrow()`
and wired it into the three mutating `pages.ts` functions — but discovered
mid-implementation that TanStack Start already ships a default CSRF
middleware (`Sec-Fetch-Site`/Origin/Referer same-origin check) applied to
every server function automatically, since this app never overrode
`requestMiddleware`. The custom check is redundant with that default but
kept anyway as explicit, visible defense-in-depth that doesn't silently
disappear if someone later adds a custom start config.

**Rate-limiting scope, narrower than the issue's literal ask:** wired
`checkRateLimit` into `pages.ts`'s three write paths (30 req/min per
session email). Did **not** wire it into `CmsService`'s RPC or
`mountCmsRoutes`'s REST surface — the RPC is a Cloudflare Service Binding,
which isn't internet-reachable at all (only callable by other Workers on
the same account), and `mountCmsRoutes` isn't actually mounted anywhere
in this app yet. Rate-limiting either would add complexity defending
against a caller that doesn't exist yet.

**Build gotcha, worth remembering:** a server-functions file
(`pages.ts`) statically importing a module that dynamically imports
`cloudflare:workers` (`middleware.ts`) breaks the client build — TanStack
tries to bundle the whole imported module for the client-side RPC stub,
and `cloudflare:workers` doesn't resolve outside the Workers runtime. Fix
was making `requireAuthOrThrow`/`requireSameOriginOrThrow` themselves
`createServerFn`-wrapped (matching the file's other exports) rather than
plain functions — TanStack's plugin specifically knows to strip
`createServerFn` handler bodies from the client bundle.

**Dev/prod email detection, corrected from initial design:** originally
planned to detect dev mode by checking whether the `send_email` binding
call failed (no real Email Routing domain locally). Verified experimentally
that `wrangler dev`'s local `send_email` emulation doesn't fail that way —
it silently writes an `.eml` file instead. Switched to checking the
request hostname (`localhost`/`127.0.0.1`) — deterministic, no deployed
environment is ever literally `localhost`.

**Verified:** full magic-link → verify → authenticated `/admin/pages`
request → logout cycle against real `wrangler dev` instances for both
Workers (shared local KV/D1 state), including single-use token
enforcement (replay correctly redirects to `/login?error=invalid`) and
post-logout session invalidation. `pnpm build` (cadmus → site → cms),
`pnpm lint`, `pnpm test:cadmus` (85/85) all clean.

**Revisit if:** `mountCmsRoutes` or `CmsService`'s RPC surface ever
becomes genuinely internet-reachable (e.g. RPC exposed via a public Hono
route) — the rate-limiting/CSRF reasoning above would no longer hold.

---

## 2026-06-21 — Phase 2 (database and schema) complete

**Decision:** Phase 2 milestones (issue #3) are done, with scope narrowed
from the original `SECTION_1_PLAN.md` list per the two entries below this
one. `apps/citadel/core/db/schema.ts` now hand-writes `users` and
`site_settings` only — `sessions`/`magic_link_tokens` were dropped (they
live in KV, not D1; the original plan predates the documented KV-based
auth design) and `forms`/`form_submissions`/`contacts`/`activities` were
dropped (moved to `examples/citadel-smb-template/` per the CMS
repositioning). `pages` remains the only `cadmus/cms`-generated table.

**What changed:**
- `core/db/schema.ts` — `users` (unique `email` index) and `site_settings`
  (singleton enforced via a `CHECK(id = 1)` constraint, verified to
  actually reject a second row on the local D1 instance).
- `drizzle.config.ts` — `schema` now globs both `schema.ts` (hand-written)
  and `schema.generated.ts` (cms-generated) so `db:generate` diffs both.
- `core/lib/db.ts` — merges both schema modules so Drizzle's typed client
  sees `users`/`siteSettings`/`pages` together.
- `apps/citadel/seed.ts` — idempotent (`INSERT OR IGNORE`), inserts
  `site_settings` (id=1) and an owner user from `ADMIN_EMAIL` (renamed from
  `OWNER_EMAIL` the same day — read from `workers/cms/.dev.vars`). Shells
  out to `wrangler d1 execute` rather than holding a `D1Database` binding
  directly, since it runs under Node/tsx as dev tooling, not inside the
  Worker isolate.
- Found and fixed a real bug during verification: `users.createdAt` used
  Drizzle's `$defaultFn`, which only applies on inserts through Drizzle's
  query builder — raw SQL inserts (like the seed script's) hit a silent
  `NOT NULL` failure, swallowed by `INSERT OR IGNORE`. Switched to a real
  SQL-level default (`default(sql\`(unixepoch())\`)`) so both insert paths
  work.
- `drizzle.config.ts` `dbCredentials` wired to `CLOUDFLARE_ACCOUNT_ID` /
  `CLOUDFLARE_DATABASE_ID` / `CLOUDFLARE_D1_TOKEN` env vars (`.env`,
  gitignored, see `.env.example`) — `pnpm db:studio` uses the `d1-http`
  driver, which talks to remote D1 over Cloudflare's HTTP API and cannot
  introspect the local wrangler sqlite file.

**Verified:** `pnpm db:generate` (clean diff, `pages` untouched), `pnpm
db:migrate` (applies locally, singleton CHECK confirmed to reject a second
`site_settings` row via direct `wrangler d1 execute`), `pnpm seed` (run
twice — confirmed idempotent, exactly one row each), `pnpm lint` (zero
violations), `pnpm test:cadmus` (68/68 passing).

**Update, same day:** maintainer supplied real Cloudflare credentials.
`pnpm db:studio` confirmed working end-to-end against the remote database
(named `krypto-db` in the Cloudflare dashboard — same UUID as
`database_id` in `wrangler.jsonc`, so the binding is correct regardless of
the display-name mismatch). Discovered via the same credentials that
production D1 hadn't received the Phase 2 migrations yet (`db:migrate:prod`
had never been run) — ran it, confirmed table count went from 2 to 4
(`pages`, `d1_migrations` → plus `users`, `site_settings`). Phase 2 is now
fully closed end-to-end, local and production.

---

## 2026-06-21 — `site_settings` stays a hand-written core table, not an example collection

**Decision:** Partially reverses the 2026-06-20 CMS-repositioning entry's
treatment of `site_settings`. That entry framed `site_settings`-beyond-the-
singleton-infra-fields as moving to `examples/citadel-smb-template/` along
with `forms`/`contacts`/`activities`. Instead, `site_settings` (identity,
appearance, structural colors, contact, nav, seo, domain, features) stays a
hand-written Drizzle table in `apps/citadel/core/db/schema.ts`, alongside
`users`/`sessions`/`magic_link_tokens` — not a `cadmus/cms` collection, and
not moved to the example template.

**Rationale:** `site_settings` is a singleton, not a content collection —
every Citadel deployment needs exactly one row of site-wide config
(theme, domain, nav) to render at all. That's infra, same category as
`users`/`sessions`, not an example of "content an operator might model."
Forms/contacts/activities remain in the example template — those are
genuinely optional SMB-specific content types.

**What changes for Phase 2 (issue #3):** `core/db/schema.ts` now covers
`users`, `sessions`, `magic_link_tokens`, `site_settings` as hand-written
tables — `pages` remains the only `cadmus/cms`-generated collection. Seed
skeleton inserts a `site_settings` row (id=1) alongside the owner user.

**Revisit if:** Section 2+ wants per-tenant or multi-site settings, at
which point the singleton assumption breaks and this needs to move to a
real collection.

---

## 2026-06-21 — Phase 1 (project foundation) complete

**Decision:** Phase 1 milestones (issue #2, `SECTION_1_PLAN.md`) are done.
Both Workers promoted from POC scaffolds to production-ready skeletons;
all tooling configured; `pnpm lint`/`pnpm build` pass clean; `core/`/
`custom/` boundary established and enforced.

**What changed, in order:**
- Added a shared `core/lib/security-headers.ts` Hono middleware (HSTS,
  `nosniff`, `SAMEORIGIN`, referrer-policy, permissions-policy, CSP) and
  wired it into both `app.ts` and `server.ts`. It lives in `core/`, not
  `packages/cadmus/`, since the header set is Citadel's own choice, not a
  framework-level primitive.
- Added `.dev.vars.example` for both Workers; Worker 1 had no `.dev.vars`
  at all and now does.
- Added the `@custom/*` path alias to both `tsconfig.json`s. Discovered in
  the process that the Biome `core/` → `custom/` boundary rule already
  existed in `biome.json` but matched a pattern (`@apps/citadel/custom/**`)
  nothing actually imports — corrected to `@custom/**` and confirmed it
  fires on a throwaway violation.
- Removed the Phase 0 POC routes (`/api/ping`, `/api/cache/*` in Worker 1;
  `/api/ping`, `/api/crypto-test` in Worker 2) — their job (proving binding
  access and Cache/Web-Crypto API behavior) was done. `/api/cms-test` in
  Worker 1 was deliberately kept; it's tracked under issue #16, not Phase 0
  scaffold debt.
- Added `core/lib/auth.ts` and `core/lib/session.ts` as signature-only
  stubs (Phase 3 implements them) and `core/lib/image-service.ts`
  (`createR2ImageService`), backed by an `ImageService` interface added to
  `packages/cadmus/src/storage/index.ts` — that primitive was an empty
  stub before this; CLAUDE.md specs the interface as living in Cadmus and
  the R2 implementation in Citadel's `core/`.
- Installed `@phosphor-icons/web` in Worker 1 (already present in Worker
  2) and wired it into `layout.astro`.
- Installed TipTap (`@tiptap/core`, `@tiptap/starter-kit`, `@tiptap/html`)
  in Worker 2 — install only, no editor wired up yet (Phase 6).
- `index.astro` now reads live data from D1 instead of rendering a static
  placeholder — see the superseding note below on what it reads and why.
- Added `apps/citadel/workers/site/public/custom/` for operator static
  assets.
- Added `apps/citadel/scripts/check-prerender.ts`, wired into `pnpm lint`.
  It flags any Panel route calling a server function from `loader`/
  `beforeLoad` without `export const prerender = false` — caught two real
  violations on its first run (`admin/route.tsx`, `test.tsx`), both fixed.
- Removed the early, unimplemented Phase 3/7/11 stub routes that had
  landed in `server.ts` (`/api/form/:slug`, `/api/auth/magic-link`,
  `/api/auth/verify`, `/api/auth/logout`, `/api/media/upload`) — see the
  separate entry below for why.

**Superseding note on `index.astro` (milestone 1.6):** the milestone text
says "reads `site_settings.siteName`," but `site_settings` doesn't exist
in this schema — it was repositioned to `examples/citadel-smb-template/`
in the 2026-06-20 CMS-repositioning entry below, and
`apps/citadel/core/db/schema.generated.ts` only has `pages`. `index.astro`
reads `pages` instead, as the one collection Citadel core actually ships.

**Verified:** `pnpm lint` (zero violations, including the new
`check-prerender.ts` check), `pnpm build:cadmus`/`build:site`/`build:cms`
(all clean), `pnpm test:cadmus` (68/68 passing), and a live `wrangler dev`
smoke test of Worker 1 confirming both the new `index.astro` query and the
security headers are present on the actual response.

**Update, same day:** the maintainer ran `pnpm dev:cms`, `pnpm dev` (both
Workers concurrently), and `pnpm deploy` live — all three worked. Phase 1
is now fully closed, both code-complete and operationally verified.

**Revisit if:** Phase 2+ work reveals the `core/lib/auth.ts`/`session.ts`
stub signatures don't match what the real magic-link flow needs — they
were written from CLAUDE.md's documented flow, not from an implementation
attempt, so some signature drift during Phase 3 would be unsurprising.

---

## 2026-06-21 — Drop "Flowbite Charts" as a dependency; use ApexCharts directly

**Decision:** The CMS admin chart stack is ApexCharts alone, styled to
match Flowbite's chart examples. No `flowbite` package dependency.

**Rationale:** "Flowbite Charts" was never a real npm package — Flowbite's
chart documentation is just ApexCharts markup with Tailwind classes, not a
separate library. The `flowbite` package itself has no official SolidJS
integration (only `flowbite-react` and `flowbite-svelte` exist), and its
init model — vanilla JS that queries the DOM for `data-*` attributes on
load — is built around traditional full-page-reload sites. Pulling it into
a SolidJS app risks stale event listeners or double-init on TanStack
Router navigation, since Solid's fine-grained DOM updates don't trigger
the same lifecycle a vanilla-JS library expects. None of that risk buys
anything charts actually need.

**Options considered:**
- Keep `flowbite` for its other components (dropdowns, modals) in
  addition to charts — not evaluated here; this decision is scoped to
  charts only. If `flowbite` comes up again for other Panel UI, the same
  Solid-integration question should be asked fresh.
- `flowbite-react` via a React island inside the Solid Panel — rejected:
  disproportionate to add a second UI framework just for chart styling
  when plain ApexCharts + Tailwind achieves the same look.

**What changes:** `apexcharts` is a Worker 2 (`apps/citadel/workers/cms/`)
dependency; `flowbite` is not. CLAUDE.md's stack table corrected from
"Flowbite Charts (ApexCharts, MIT)" to "ApexCharts (MIT), styled to match
Flowbite's chart examples."

**Revisit if:** a future Panel feature wants `flowbite`'s non-chart
components and Solid compatibility is confirmed safe at that point —
treat that as its own decision rather than reopening this one.

---

## 2026-06-21 — Remove early Phase 3/7/11 stub routes from `server.ts`

**Decision:** Delete the unimplemented `/api/form/:slug`, `/api/auth/*`,
and `/api/media/upload` routes that had landed in
`apps/citadel/workers/cms/app/server.ts` ahead of the phases that actually
own them, rather than keep them as documented forward stubs.

**Rationale:** Phase 1's own acceptance criteria require "no scaffold/demo
content remains," and these routes — while not literal `pnpm create
cloudflare` scaffold output — are the same kind of debt: unimplemented
surface that looks more finished than it is. The deciding factor was
`/api/auth/verify`, which unconditionally executed
`return c.redirect("/admin/dashboard")` with no token check whatsoever.
A stub that returns `{ ok: true }` is obviously fake; a stub that performs
a real-looking redirect is not — anyone wiring a login UI against it
before Phase 3 lands would see what looks like a working flow.

**Options considered:**
- Keep them as documented forward stubs — rejected: the redirect-without-
  validation case above means "documented" isn't enough to make them safe
  to leave in `main`; the risk is in what the code *does*, not whether
  it's labeled.
- Keep only the routes that return inert `{ ok: true }`/`{ url: "" }` and
  remove just `/api/auth/verify` — rejected as inconsistent: all five were
  added together as a batch for phases that haven't started, so all five
  go together.

**What changes:** `server.ts` now has a comment at the top of the custom
routes section explaining why no Phase 3/7/11 stubs are pre-added, and
pointing at this entry. The real routes get added in Phase 3 (auth),
Phase 7 (forms), and Phase 11 (media) alongside their actual
implementations and tests.

**Revisit if:** never — this is a one-time correction, not a standing
policy question. The standing policy (don't pre-add unimplemented routes
for future phases) is now captured in the `server.ts` comment itself.

---

## 2026-06-20 — Citadel relicensed to MIT, dropping the revenue-threshold dual license

**Decision:** Replace the source-available dual license (free under $1M
annual revenue, commercial license required above that threshold,
permanent nonprofit exemption) with a plain MIT license across the whole
repo — Citadel now matches Cadmus, which was already MIT.

**Rationale:** The revenue threshold and commercial-license requirement
were built around Citadel as a monetizable SMB product. Now that Citadel
is repositioned as a generic, V8-native, Payload-equivalent CMS (see the
entry immediately below) intended as an open proof of concept to show the
Payload team, a usage-gated license works against the goal — it adds
friction for exactly the kind of broad, no-strings adoption and external
scrutiny the POC needs to be credible. MIT removes that friction and
matches Cadmus's existing license, so the whole monorepo is now licensed
consistently.

**What changes:** root `LICENSE` replaced with the standard MIT text
(same copyright holder, BowenLabs). `apps/citadel/README.md`'s licensing
section simplified accordingly — the revenue-threshold language and
licensing@bowenlabs.io contact info are removed, not just reworded.

**Revisit if:** Citadel later needs a sustainable-funding mechanism again
— if so, treat it as a new decision rather than reinstating this one,
since the context (a Payload-facing POC) will likely have changed by then.

---

## 2026-06-20 — Citadel repositioned as a V8-native, Payload-equivalent CMS; supersedes 2026-06-17 "no CMS"

**Decision:** Citadel's product identity changes from "SMB website/CRM
platform" to "a free, open-source, V8-native headless CMS and admin
platform" — a from-scratch, Cloudflare-native equivalent of Payload's
collection/field/admin-generation engine. A new Cadmus primitive,
`@bowenlabs/cadmus/cms`, provides collection/field config, schema codegen,
a Local API, and admin-UI introspection metadata. Citadel's admin Worker
is renamed from "Panel" to "CMS" (`apps/citadel/workers/panel/` →
`apps/citadel/workers/cms/`) to match Payload's own vocabulary, since this
is explicitly intended as a proof of concept to show the Payload team what
a Node-free, edge-native version of their product could look like —
directly inspired by the architecture of
[jherr/tanstack-payload](https://github.com/jherr/tanstack-payload).

**This explicitly supersedes the 2026-06-17 "CMS and data layer" entry
below**, which stated "Revisit if: Never." That entry is left unedited —
it was correct about what it rejected. It rejected running *actual Payload*
as a dependency (Node-based, admin UI disabled, version-pinning anxiety).
It did not anticipate building an equivalent primitive natively, with no
Node dependency, where the admin UI is the entire point rather than a
disabled liability. The "never" was about a specific integration path, not
about the outcome Payload provides.

**What does not change:** the two-Worker VMFE architecture, magic-link
auth, KV sessions, cross-Worker login redirect, cache purge — all of Phase
0's verified production behavior is preserved untouched. Drizzle + D1
remain the underlying data layer; `cadmus/cms` generates Drizzle schema
from collection config rather than replacing Drizzle.

**Former SMB-specific concepts** (forms, CRM/contacts, site_settings
beyond the singleton infra fields, SMB block types) are not deleted — they
move to `examples/citadel-smb-template/` as a worked example of a site
built on Citadel, rather than being part of Citadel core. The `pages`
collection (Phase 0's only real table) becomes the one example collection
Citadel core ships, proving the generated-schema path against
already-live production data.

**Revisit if:** the `cadmus/cms` primitive proves too heavy to maintain
solo, or the Payload-equivalence framing turns out not to matter for the
POC's purpose.

---

## 2026-06-19 — First production deploy; POC 4 verified post-deploy

**Decision:** Both Workers deployed for the first time, completing the
one acceptance-criteria item Phase 0 close-out couldn't verify locally
("all 4 POC scenarios pass... after `wrangler deploy`").

- **R2 bucket name mismatch fixed.** The Krypto→Citadel rename never
  touched the actual Cloudflare resources — `wrangler.jsonc` already said
  `bucket_name: "citadel-media"`, but the account only had `krypto-media`.
  D1/KV bind by ID so this was harmless for them, but R2 binds by name, so
  any upload would have failed at runtime. Created a fresh `citadel-media`
  bucket (empty either way — nothing had been uploaded yet) and enabled
  its public r2.dev URL for `MEDIA_URL`.
- **Deployed:** `citadel-site` → `https://citadel-site.baylee-c3e.workers.dev`,
  `citadel-panel` → `https://citadel-panel.baylee-c3e.workers.dev`.
  Production D1 migrated via `pnpm db:migrate:prod` first.
- **`SESSION_SECRET`** is the same value on both Workers' production
  secrets (`wrangler secret put`) — required, since Panel's HMAC verify
  must match whatever the (future, Phase 3) magic-link flow signs.
- **Panel's `SERVER_URL`** now points at the real deployed site URL in
  `wrangler.jsonc`. Local dev keeps `http://localhost:3000` via
  `panel/.dev.vars`, which overrides the `wrangler.jsonc` default during
  `wrangler dev`.
- **POC 4 reverified against the live deploy:** `GET /api/cache/test`
  returned `X-Cache: MISS` → `HIT` (identical body) → `POST
  /api/cache/purge` → `MISS` again with a new timestamp. The cross-Worker
  login redirect was also reverified live: `GET
  https://citadel-panel.../admin` → `307` →
  `https://citadel-site.../login?redirect=%2Fadmin`.

Phase 0's acceptance criteria are now fully satisfied.

---

## 2026-06-19 — Phase 0 close-out: milestones 0.6 and 0.12 completed

**Decision:** The two milestones deliberately left open in the prior
close-out entry (below) are now done, closing out Phase 0 entirely.

**0.6 — login page moved to Worker 1.** Added `src/pages/login.astro` to
the site Worker (Astro SSR), accepting a `?redirect=` query param. The
Panel's `/admin` `beforeLoad` guard (`src/routes/admin/route.tsx`) no
longer redirects to a same-app TanStack route — it calls a new
`getLoginUrl` server function (`app/middleware.ts`) that reads
`env.SERVER_URL` server-side and returns an absolute URL into Worker 1,
then throws `redirect({ href })` (not `redirect({ to })`, which only
resolves same-app routes). `env.SERVER_URL` is a non-secret public origin,
so it's set in `wrangler.jsonc`'s `vars` block rather than `.dev.vars`.
The placeholder `src/routes/login.tsx` in Panel (POC-only, see prior entry)
is deleted — nothing targets it anymore.

**0.12 — POC 4 cache match/put proven.** Added `GET /api/cache/test` to
the site Worker's Hono entrypoint (`src/app.ts`), with explicit
`caches.default.match()`/`.put()` calls — the missing piece identified in
the prior entry, since a `Cache-Control` header alone never populates the
Workers Cache API for a custom fetch handler. Verified against
`wrangler dev`: first request `X-Cache: MISS`, second request `X-Cache:
HIT` with an identical body, `POST /api/cache/purge` against the same
URL, then a third request `X-Cache: MISS` again with a new timestamp.
"Purge after a real `wrangler deploy`" (the other unverified half of POC
4) is intentionally left for whoever runs that deploy — it isn't
something a local dev loop can confirm.

**Also fixed in passing:** the Panel Worker had no `.dev.vars`, so
`wrangler types` had silently dropped `SESSION_SECRET`/`OWNER_EMAIL`/
`MEDIA_URL` from the generated `Env` interface for anyone running a fresh
checkout. Added a local `.dev.vars` (gitignored, placeholder values) so
the full env interface regenerates correctly — replace the placeholder
`SESSION_SECRET` before relying on auth locally.

---

## 2026-06-19 — POC 3/4 fixes, bundle size measurement, two milestone corrections

**Decision:** POC 3 uses a TanStack Router `beforeLoad` guard (not
`createMiddleware`), confirmed end-to-end. POC 4's `caches.default`
availability assumption is corrected. Bundle sizes are measured. Two
Phase 0 milestones are flagged as needing correction, not just completion.

**POC 3 fix:** `createMiddleware()` with no options defaults to
**function** middleware, not **request** middleware — wrong tool for
guarding routes, and request middleware requires global `createStart()`
registration besides. Switched to `beforeLoad` on a `/admin` layout route,
with the auth check wrapped in a `createServerFn` (not a plain async
function) since `getCookie()` is server-only and `beforeLoad` can run
client-side during navigation. Verified: unauthenticated `/admin/pages` →
`307` to `/login`; valid signed cookie + real KV session → `200` with the
user threaded through `beforeLoad` context. Caught a self-inflicted bug
mid-verification: test session was written to the `SESSION` KV namespace
(Astro's own unrelated framework feature) instead of `KV` (what the app
actually reads).

**POC 4 finding:** `caches.default` is actually available under
`wrangler dev` with `wrangler@4.101.0`/`workerd@1.20260616.1` — confirmed
via a direct diagnostic route, contradicting the original G4 gotcha and
POC 4 write-up's assumption. Purge itself verified working (4ms, real
`caches.default.delete()` call, not the dev-bypass branch). Not verified:
"served from cache on second request" — that requires explicit
`caches.default.match()`/`.put()` calls in the request path, which don't
exist anywhere yet; setting a `Cache-Control` header alone doesn't
populate the Workers Cache API for a custom Worker fetch handler.

**Bundle sizes measured** (`wrangler deploy --dry-run`, milestone 0.22):
Site 762.79 KiB (gzip 180.43 KiB), Panel 1089.47 KiB (gzip 238.05 KiB).
Both well under the 10MB Workers Paid limit.

**Milestone 0.15 doesn't map onto TanStack Start's actual API.** "Verify
`prerender = false` on all Panel routes that use server functions" carries
over an Astro-specific concept — TanStack Router/Start in this version has
no per-route `prerender`/`ssr` export at all (confirmed: no match for
either in `@tanstack/react-router`'s route types). With the Cloudflare
deployment target, nothing is statically prerendered by default regardless
— there's no flag to set or verify. This milestone needs rewording, not
completion work.

**Milestone 0.6 ("login page is Astro SSR, not Panel Worker") is not yet
satisfied** despite a `src/routes/login.tsx` existing in Panel right now.
That file is a deliberate POC-only placeholder — it was the fastest way to
give `beforeLoad`'s `redirect({ to: '/login' })` a valid same-app route to
target while testing the guard mechanic in isolation. It is **not** the
real architecture: M6 still requires the actual login page to be an Astro
SSR page in Worker 1, with the redirect crossing Workers (an absolute URL,
not a same-app TanStack route). Don't mistake the placeholder for 0.6
being done.

**Fixed in:** `app/middleware.ts`, `src/routes/admin/route.tsx`,
`src/routes/login.tsx` (placeholder), `app.ts` (cache diagnostic routes),
`GETTING_STARTED.md` (Steps 18, 21), `SECTION_1_PLAN.md` (POC 3, POC 4,
G4 gotcha).

---

## 2026-06-19 — Monorepo renamed: Salvation → Thebes

**Decision:** The monorepo is renamed from "Salvation" to "Thebes" — fits
the naming theme better. `Cadmus` and `Citadel` are unaffected (see
`CLAUDE.md`'s naming table — those two were never in scope for this
rename). The GitHub repository itself (`bowenlabs/salvation` →
`bowenlabs/thebes`) is renamed by the operator directly; all in-repo text
references, GitHub URLs, and the root `package.json` `name` field were
updated to match ahead of that.

**Fixed in:** `README.md`, `CADMUS.md`, `CONTRIBUTING.md`, `CLAUDE.md`,
`GETTING_STARTED.md`, `SECTION_1_PLAN.md`, `package.json`,
`packages/cadmus/package.json`, `packages/cadmus/README.md`,
`.github/workflows/update.yml`, `apps/citadel/README.md`.

**Not touched:** the 2026-06-18 "Project restructure" entry below, which
records the original "Salvation" naming decision as a historical fact —
rewriting decision-log entries after the fact defeats the point of a
decision log. `.planning/` (an archival snapshot directory, separate from
the live docs) was also left untouched — renaming inside an intentional
snapshot would defeat its purpose as a snapshot.

---

## 2026-06-19 — `core/` dependency resolution, `@core/*` alias, and shared local D1

**Decision:** `drizzle-orm` is installed at the **repo root**, not only
inside each Worker. `core/db/schema.ts` and `core/lib/db.ts` are imported
via the `@core/*` alias (not `@apps/citadel/core/*`). `dev:site`,
`dev:panel`, and `db:migrate` all pass the same explicit `--persist-to`
path. One Worker's `wrangler.jsonc` D1 binding sets `migrations_dir` to
Drizzle's actual output path.

**What broke, found while wiring up Phase 0 milestone 0.17 for real (not
just writing the docs):**

1. **`Cannot find module '@apps/citadel/core/lib/db'`** — a real file
   (`src/server-functions/pages.ts`, created by following the docs) used
   this alias. The canonical alias defined everywhere else in
   `SECTION_1_PLAN.md`/`GETTING_STARTED.md` is `@core/*`; one code sample
   had the wrong one and never got caught because it was never built.

2. **`Rollup failed to resolve import "drizzle-orm/d1"`** even with
   `drizzle-orm` correctly installed in each Worker's own `package.json`.
   Root cause: `apps/citadel/core/` is not a declared workspace package —
   pnpm's strict, non-hoisted `node_modules` means a file resolving a bare
   import searches its own ancestor directories for `node_modules`, and
   `core/`'s ancestor chain reaches the **repo root**, not either Worker's
   `node_modules`. Installing `drizzle-orm` at the root with `-w` fixes it.
   `drizzle-kit` doesn't need this — it's only invoked via CLI scripts,
   never imported from `core/`.

3. **`No configuration file found` running `pnpm db:migrate` from the repo
   root.** The script (`wrangler d1 migrations apply citadel-db --local`)
   has no wrangler config to read at the root. Needed `--config` pointing
   at a Worker's `wrangler.jsonc`.

4. **`No migrations present at .../workers/site/migrations`** after
   fixing #3. `wrangler d1 migrations` defaults to a `migrations/` folder
   relative to the wrangler config's own directory — not Drizzle's actual
   `out` path (`apps/citadel/core/db/migrations`). Fixed by adding
   `"migrations_dir": "../../core/db/migrations"` to the D1 binding.

5. **The two Workers don't share local D1 data even with the same
   `database_id`.** `wrangler dev`'s local persistence (`--persist-to`)
   defaults to a path relative to its own working directory. `dev:site`
   (run from `workers/site/`) and `dev:panel` (run from `workers/panel/`)
   each got their own separate local D1 emulation. This is silent — no
   error, just two Workers quietly looking at different "local" databases
   despite the plan's stated intent ("both Workers see same tables").
   Fixed by passing the same `--persist-to ./.wrangler/state` (relative
   path adjusted per script) to `dev:site`, `dev:panel`, and `db:migrate`.

**Verified end-to-end, not just "no error":** ran `pnpm db:generate` +
`pnpm db:migrate`, confirmed the `pages` table query succeeds from both
Workers (previously: `D1_ERROR: no such table` / `Failed query: select
... from "pages"` on both), then inserted a row via `wrangler d1 execute`
against the shared persisted state and confirmed it was visible from a
query inside the *other* Worker's running `wrangler dev` instance — actual
proof of shared data, not just shared configuration values.

**Fixed in:** `package.json` (root scripts), `apps/citadel/workers/site/wrangler.jsonc`
(`migrations_dir`), `apps/citadel/workers/panel/src/server-functions/pages.ts`
(alias), `drizzle.config.ts` (new file), `apps/citadel/core/db/schema.ts` +
`apps/citadel/core/lib/db.ts` (new files), both Workers' `tsconfig.json`
(`@core/*` alias), `SECTION_1_PLAN.md` (milestones 0.17, 1.34, 2.5),
`GETTING_STARTED.md` (Steps 16, 19, 20, troubleshooting section).

**Revisit if:** `core/` ever becomes its own workspace package (would
change the dependency-resolution story) or the monorepo's `--persist-to`
convention changes when Section 2 adds more Workers.

---

## 2026-06-19 — Worker 2's custom Hono entrypoint: wrong `main`, `getCloudflareContext()` doesn't exist, `app/routes` should be `src/routes`

**Decision:** Worker 2's custom entrypoint (`app/server.ts`) wraps TanStack
Start's `server-entry` default export with Hono, exactly mirroring Worker
1's `handle()` pattern — but with a different call signature, since
TanStack's `RequestHandler` only takes a `Request`, not `(request, env,
ctx)`. Bindings inside server functions are read via a dynamic
`cloudflare:workers` import, never `getCloudflareContext()`. All TanStack
Start application code (routes, components, server functions) lives under
`src/`, matching what `@tanstack/cli`'s scaffold actually produces — `app/`
is reserved for the one custom Worker entrypoint file.

**What broke, three separate things, found while building this out:**

1. **`wrangler.jsonc`'s `main` pointed at a file that doesn't exist.**
   The original `"main": "app/server.ts"` was aspirational — written before
   the file existed. Building with it failed the same way Worker 1's did
   earlier: the Cloudflare Vite plugin resolves `main` against the
   filesystem before any custom code is added. Confirmed
   `@tanstack/react-start/server-entry` (the framework's own default
   server entry, exposed as a package export) is the correct value *until*
   you add your own custom entrypoint file — then `main` must point at
   that file instead.

2. **`getCloudflareContext()` from `@tanstack/react-start/cloudflare` does
   not exist** in `@tanstack/react-start@1.168.26` — there is no
   `./cloudflare` export at all (confirmed via the package's own
   `exports` map). This is the same shape of bug as `Astro.locals.runtime.env`
   above: an API referenced throughout the original docs that was never
   verified against the actually-installed version. The real mechanism is
   the same `cloudflare:workers` import used everywhere else in this
   stack — but as a **dynamic** `await import('cloudflare:workers')`
   inside the handler, not a static top-level import (verified working in
   a server function; static import wasn't tested and isn't assumed safe
   inside code that might also be reachable from a client bundle).
   `createMiddleware` has the same kind of stale-subpath problem —
   `@tanstack/react-start/middleware` doesn't exist; it's a root export of
   `@tanstack/react-start`, same as `createServerFn`.

3. **The scaffold puts everything under `src/`, not `app/`.** The original
   docs and plan assumed an `app/routes/`, `app/server-functions/`
   structure (mirroring a different, older TanStack Start convention).
   The actual `@tanstack/cli@0.69.3` scaffold (confirmed by direct
   inspection) generates `src/routes/`, `src/components/`, `src/styles.css`
   — there is no `app/` directory at all until you create one yourself for
   the custom entrypoint. Every future-phase milestone in `SECTION_1_PLAN.md`
   referencing `app/routes/...` was updated to `src/routes/...`.

**Verified end-to-end:** built `app/server.ts` with a custom `/api/ping`
route (reads D1 + KV) and a catch-all `app.all('*', ...)` falling through
to `startHandler.fetch(c.req.raw)`; added `hono` as a dependency (not
present in the vanilla scaffold); confirmed via `wrangler dev` against the
real built output that both the custom route and TanStack Start SSR
(`/`, `/test`) return `200` with correct data.

**Not verified:** the full auth-middleware/cookie/redirect flow shown in
the "POC 3" section — only the import paths were confirmed against the
package's type declarations, not run end-to-end. That's genuinely Phase 3
scope; flagged in `GETTING_STARTED.md` rather than presented as confirmed.

**Fixed in:** `apps/citadel/workers/panel/wrangler.jsonc`, `app/server.ts`
(new file), `package.json` (added `hono`), `CLAUDE.md`, `SECTION_1_PLAN.md`
(all `app/routes`/`app/server-functions` references across every future
phase, the binding-access code samples, the architecture diagrams),
`GETTING_STARTED.md` (Steps 11–18, the troubleshooting section, the
milestone checklist).

**Revisit if:** `@tanstack/react-start` ships a `./cloudflare` export in a
future release, or TanStack Start's scaffold changes its directory
convention again.

---

## 2026-06-19 — TanStack Start scaffold hangs on a git prompt; bypass create-cloudflare's wrapper

**Decision:** Scaffold Worker 2 (Panel) by calling `@tanstack/cli` directly
with its real non-interactive flags, not via `pnpm create cloudflare@latest
. --framework=tanstack-start`.

**What broke:** `pnpm create cloudflare@latest . --framework=tanstack-start`
appeared to hang indefinitely with no error and no visible prompt.

**Root cause:** `create-cloudflare` shells out to
`pnpm dlx @tanstack/cli@0.69.3 create panel --deployment cloudflare
--framework react --no-git`. That subprocess gets through dependency
install and route generation, then stops at an arrow-key selection prompt:
"Do you want to use git for version control? Yes / No" — **even though
`--no-git` was already passed.** This looks like an upstream flag bug in
`@tanstack/cli@0.69.3` (`--no-git` doesn't suppress the prompt). The prompt
uses raw-mode TTY input, which a piped/scripted stdin can never satisfy —
confirmed by reproducing it both via `create-cloudflare`'s wrapper and by
invoking the TanStack CLI directly with only `--no-git` (no
`--non-interactive`/`--yes`): both hang identically, in both a real
terminal session and a backgrounded/piped one.

**The fix:** call `@tanstack/cli` directly with `--non-interactive --yes`,
which actually does suppress every prompt (unlike `--no-git` alone):
```bash
pnpm dlx @tanstack/cli@0.69.3 create panel \
  --framework react \
  --deployment cloudflare \
  --no-git \
  --non-interactive \
  --yes \
  --target-dir .
```

**A second bug compounded this while debugging:** the scaffold's own
`generate-routes` step (`tsr generate`) failed on first run
(`sh: tsr: command not found`) because it ran before `pnpm install` had
actually completed — `@tanstack/router-cli` (which provides the `tsr`
binary) was listed in `package.json` but never installed yet at that point
in the scaffold sequence. Re-running `pnpm install` then `pnpm run
generate-routes` afterward resolves it.

**A third bug, only visible after fixing the first two:** `pnpm install`
from the repo root reported "Already up to date" and silently produced no
`node_modules` for `panel/` at all. Root cause: `apps/citadel/workers/panel`
sits three directory levels under `apps/`, but `pnpm-workspace.yaml`'s
`apps/*` pattern only matches one level deep — `panel` was never recognized
as a workspace member. Phase 1's own gotcha list already called for
`pnpm-workspace.yaml` to list both Workers explicitly, but the pattern
actually checked in (`apps/*`) didn't satisfy that. Fixed by adding
`apps/citadel/workers/*` to the `packages` list.

**Fixed in:** `pnpm-workspace.yaml`, `SECTION_1_PLAN.md` (milestone 0.7 +
Phase 1 gotcha), `GETTING_STARTED.md` (Step 10).

**Revisit if:** a newer `@tanstack/cli` release fixes `--no-git`'s
behavior, or the monorepo's directory depth under `apps/` changes again
(re-check the workspace glob whenever a new Worker is added at a different
nesting level).

---

## 2026-06-19 — `Astro.locals.runtime.env` removed in Astro v6; use `cloudflare:workers`

**Decision:** All binding access in Astro pages/components uses
`import { env } from 'cloudflare:workers'`, not `Astro.locals.runtime.env`.

**What broke:** Verifying POC 1a (Phase 0 — confirm an Astro page can read
D1), `src/pages/test.astro` threw on every request:
```
Error: Astro.locals.runtime.env has been removed in Astro v6.
Use 'import { env } from "cloudflare:workers"' instead.
```

**Root cause:** `Astro.locals.runtime.env`/`.cf`/`.caches`/`.ctx` were the
Astro v5-era binding-access API. Astro v6 removed all four in favor of
direct imports — confirmed in `@astrojs/cloudflare`'s own source
(`utils/cf-helpers.js`), which throws this exact message on access:
- `Astro.locals.runtime.env` → `import { env } from 'cloudflare:workers'`
- `Astro.locals.runtime.cf` → `Astro.request.cf`
- `Astro.locals.runtime.caches` → the global `caches` object
- `Astro.locals.runtime.ctx` → `Astro.locals.cfContext`

This is the second outdated-API mismatch found in one Phase 0 pass (after
the DaisyUI v5 token names above) — both `CLAUDE.md` and `SECTION_1_PLAN.md`
had code samples written against an older library API version that throws
a clear, helpful runtime error rather than failing silently. Worth treating
"throws on first real request" findings as gating, not just the silent
ones — they're cheap to catch precisely because they're loud.

**Fixed in:** `src/pages/test.astro`, `CLAUDE.md`, `SECTION_1_PLAN.md`
(G1 gotcha + POC 1/POC 2 examples), `GETTING_STARTED.md` (Step 8,
troubleshooting section).

**Revisit if:** Astro ships a new binding-access convenience API — check
release notes before reintroducing an `Astro.locals`-based pattern.

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
// apps/citadel/workers/site/src/app.ts
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

**Superseded by:** the 2026-06-19 "Panel UI framework: React → SolidJS" entry
at the end of this file. The Panel/`core/` tier below is no longer React —
it's SolidJS. The Alpine.js (public site) and operator-extension tiers are
unaffected and still apply as written.

**Decision (historical — Panel tier no longer current):** Standardize on React as the only UI component framework inside
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
  pool with no real benefit to Citadel's own maintenance burden.

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
- Defer to post-Citadel Section 1 — rejected: Queues are core CF
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

## 2026-06-18 — Project restructure: Salvation monorepo, Cadmus framework, Citadel product

**Decision:** Restructure the project as a monorepo (`salvation`) containing
the Cadmus framework (`packages/cadmus/`, `@bowenlabs/cadmus`) and the Citadel
reference application (`apps/citadel/`). What was previously `citadel` becomes
`citadel`. What was previously `core/` shared utilities becomes the foundation
of the Cadmus framework package.

**Options considered:**
- Continue as a single-product repo (Citadel) — rejected: misses the framework opportunity, `core/` was already framework-shaped
- Separate repos from day one (cadmus repo + citadel repo) — rejected: coordination overhead while both are moving fast, no shared tooling
- Monorepo from day one — chosen

**Rationale:**
The `core/` boundary was already functioning as a proto-framework. Formalising
it as `@bowenlabs/cadmus` makes the abstraction explicit, forces the right
separation, and means Citadel builds against the real package API from day one.
The monorepo avoids cross-repo coordination cost until Cadmus is mature enough
to stand alone — at which point `packages/cadmus/` is extracted cleanly.

Citadel serves as Cadmus's reference implementation, proving every primitive
in production before stability guarantees are made. Cadmus `1.0.0` is not
tagged until at least one app other than Citadel uses it in production.

**Naming:**
- Monorepo: `salvation` (github.com/bowenlabs/salvation)
- Framework: Cadmus (`@bowenlabs/cadmus`)
- Product: Citadel (`apps/citadel/`)
- Private tooling: `citadel-tooling` (was `citadel-tooling`)
- Extensions: replaces "extensions" throughout

**Revisit if:** Cadmus gets meaningful independent adoption and needs its own
repo, docs site, and release cadence separate from Citadel's.

---

## 2026-06-18 — Domain onboarding strategy (Section 2 forward-planning)

**Decision:** DNS delegation (nameserver transfer to Cloudflare) as the default path for clients with existing domains. CF account + domain registration via Stripe provisioning protocol for new domains. Domain state tracked in `site_settings` from Section 1.

**Context:**
Section 2 will need to provision Cloudflare accounts and configure domains on behalf of clients. Three provisioning paths exist depending on the client's situation. This decision captures the architecture for each and the data model implications that must be in place from Section 1.

**Client onboarding spectrum:**

The client population is not cleanly bimodal — it spans a spectrum:
- **No domain, doesn't know what one is** — needs Citadel to handle everything invisibly
- **Has a domain, doesn't know where** — registered years ago, login email likely defunct
- **Has a domain, knows what it is** — can follow instructions if they're clear
- **Has a domain and a live site** — needs zero-downtime cutover, can't break anything

**Provisioning paths:**

**Path A — New domain, new CF account (Stripe provisioning protocol)**
- Client has no domain or chooses a new one
- Citadel (via the Orchestrator) triggers CF account provisioning in the client's name using the Stripe-integrated protocol (launched April 2026)
- Domain registered via CF Registrar API (currently in beta)
- Client ends up as the actual account owner with their own CF dashboard
- Citadel holds a scoped, revocable API token for ongoing deployments
- At handoff, token is revoked or transferred — client has full independent ownership
- **Known beta gaps:** CF Registrar API does not yet support renewals, transfers, or contact updates programmatically. These are manual processes post-registration. Track for resolution.

**Path B — Existing domain, DNS delegation (recommended for most existing-domain cases)**
- Client owns a domain at an external registrar (Namecheap, GoDaddy, Squarespace, etc.)
- Citadel instructs the client to point their nameservers at Cloudflare
- Once delegated, Citadel manages DNS records programmatically (CNAME, A, MX, etc.)
- Client does not need to transfer the domain — registrar relationship is unchanged
- Citadel gains full DNS control without touching the registrar
- **Identity note:** The Stripe provisioning protocol uses the client's email to match or create a CF account. The client's Citadel login email may differ from their Stripe billing email — identity reconciliation must be explicit in the Section 2 onboarding flow, not assumed.

**Path C — Full domain transfer to CF Registrar**
- Client transfers domain ownership to Cloudflare Registrar
- Cleaner long-term (one fewer vendor), but: transfers take days, 60-day post-registration lock window, Registrar API cannot initiate transfers programmatically
- Not a primary path — offer as an option after onboarding is complete, never as a blocker

**Path D — CNAME/A record only, client keeps DNS control**
- Client updates a single DNS record, Citadel doesn't control DNS
- Lowest friction, but Citadel loses the ability to manage DNS going forward
- Fragile for Section 2+ workflows that require DNS management
- Only appropriate as a fallback if the client refuses nameserver delegation

**Onboarding UX framing (not technical paths):**

The client-facing onboarding questions should be plain-language, not technical:

1. "Do you have a website address already?" → Yes / No / I'm not sure
2. If yes: "Do you know where it's registered?" → Yes / No / I'm not sure

"I'm not sure" on both should funnel into a domain search flow, not a dead end. Searching a name they want lets Citadel check availability, suggest alternatives, and surface whether they already own it (CF's provisioning protocol detects matching accounts). Never present a 404 or error state — always offer a next step.

**Section 1 data model requirement:**

The following fields must be present on `site_settings` from Section 1. Section 1 does not act on them — they exist so Section 2's onboarding flow has state to read and write without a migration.

```
domain:           primaryDomain (text)
                  domainProvider: 'cloudflare' | 'external' | 'unknown' | null
                  nameserverDelegated: boolean (default false)
                  domainRegisteredViaCitadel: boolean (default false)
                  cfAccountId (text, nullable) — populated by Orchestrator in Section 2
                  cfApiTokenScoped: boolean (default false) — true while Citadel holds deploy token
```

`domainProvider: 'unknown'` is a valid and expected state — never treat null/unknown as an error. The "I don't know" client is a first-class case.

**Cloudflare ownership model:**

Citadel uses Path B (agent provisioning via Stripe protocol), not the Tenant API. The distinction matters:
- **Tenant API** (rejected): Cloudflare user account is BowenLabs' — client is invited as a member, not a true owner. Wrong for Citadel's ownership philosophy.
- **Agent provisioning** (chosen): CF account is provisioned in the client's name. Client is the actual account owner. Citadel holds a scoped token, not ownership.

**Zero-downtime cutover (Section 2 concern, flag for Section 1 Phase 13):**

Clients with an existing live site need Citadel to be fully deployed and DNS-ready before the nameserver flip. This is a staging → live promotion flow. Phase 13 (seed, export, hardening) should leave a hook for this — specifically, the ability to deploy to a preview URL before the domain is pointed.

**Registrar API beta gaps to track:**
- Renewals, transfers, contact updates not yet available programmatically
- Stripe Projects (the provisioning protocol) is in open beta — validate for Citadel's non-agent, platform-driven use case before building Section 2
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
- Separate Go/Node service with Sharp — rejected: absorbs infrastructure cost for every Citadel site, violates free-forever promise
- Cloudflare Images — deferred to Section 2+ as a paid extension add-on
- R2 direct serving with HTML best practices — chosen for Section 1

**Decision:**
Store originals in R2. Serve as-is. Use `loading="lazy"`, `decoding="async"`, `srcset`, and `sizes` for browser-side optimization. Enforce 5MB upload limit in Panel with a clear warning.

All image rendering goes through `core/lib/image-service.ts` — never construct or transform image URLs inline. This allows a Cloudflare Images extension to replace the service implementation without touching any component, renderer, or block data.

**Rationale:** No server-side image processing in Section 1 keeps Citadel free and infrastructure-simple. The `ImageService` interface pattern means the upgrade path to Cloudflare Images is a extension, not a refactor. Original R2 URLs stored in the database; transformation is a render-time concern.

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
- Managed hosting — rejected: violates operator data ownership, changes Citadel's product category
- Manual updates — rejected: non-starters for a "white glove" experience
- GitHub fork + upstream merge — chosen

**Decision:**
Citadel is distributed as a GitHub template. Operators fork it and own their instance. `update.yml` (GitHub Actions, weekly) fetches from `bowenlabs/citadel:main` and auto-merges if CI passes. Opens a GitHub issue if there are conflicts.

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

**Rationale:** For an open source project where contributors need a fast feedback loop, Biome's speed advantage is meaningful. No ESLint/Prettier config conflict edge cases to debug. One tool, one config file (`biome.json`), one `pnpm lint` command. The ecosystem is large enough for Citadel's needs.

**Revisit if:** A specific lint rule required by Citadel is unavailable in Biome and has no equivalent. Check Biome's rule coverage before adding any custom ESLint rule.

---

---

## 2026-06-19 — Panel UI framework: React → SolidJS

**Decision:** Rewrite the Panel (Worker 2) from React + TanStack Start to
SolidJS + TanStack Start. Supersedes the "Component framework tiering"
entry above for the Panel/`core/` tier; the Alpine.js and operator-extension
tiers from that entry are unchanged.

**Context:** Citadel was renamed from Krypto around the same time, as part
of a broader direction shift toward a more generic, plugin-extensible CMS
(see README.md/CADMUS.md for current framing). SolidJS was chosen because
it compiles to direct DOM updates with no virtual DOM, giving a smaller
runtime payload and faster cold starts in Cloudflare's V8 isolates — more
aligned with Cadmus's V8-first principle than React.

**What changed the calculus since the earlier decision:** That entry's own
"Revisit if" clause said: *"TanStack Start ships a stable non-React
adapter."* It already has — TanStack Start is a multi-framework
meta-framework (same as TanStack Router/Query), with first-party Solid
support documented at
https://tanstack.com/start/latest/docs/framework/solid. This was the
detail missed when first scoping the migration (an early draft of the plan
incorrectly assumed Start was React-only and planned to replace server
functions with raw Hono routes) — confirmed via `npm view
@tanstack/solid-start exports` showing the same `./server-entry`,
`./plugin/vite`, etc. export map as `@tanstack/react-start`.

**What carried over almost unchanged:** file-based routing, `createServerFn`
server functions, and SSR — all work the same way under the Solid target.
Only the component layer (JSX syntax, `useState`/`useEffect` →
`createSignal`/`createEffect`) and the TanStack Router/Query framework
bindings (`@tanstack/react-router` → `@tanstack/solid-router`,
`@tanstack/react-query` → `@tanstack/solid-query`) needed rewriting.

**Two real gaps found during the rewrite:**
1. No official `@phosphor-icons/solid` package exists — only unofficial
   community ports (`phosphor-solid-js`, `@transitionsag/phosphor-solid`,
   etc.). Used the official framework-agnostic `@phosphor-icons/web`
   (web-component/CSS build) instead of depending on an unofficial port.
2. TipTap's React/Vue packages are framework-specific wrappers around the
   framework-agnostic `@tiptap/core`; no official Solid wrapper exists
   either. Deferred — TipTap integration is Section 2+ work — but
   `@tiptap/core` direct integration (or the unofficial `solid-tiptap`
   bindings) is the path when that's built.

**A real bug hit during verification, root-caused rather than worked
around:** after swapping dependencies, `pnpm dev` threw `useRouter()
returns null inside HeadContent` on first boot. Bisecting `__root.tsx`
(stripping it to a bare shell, adding pieces back one at a time, then a
cache-cleared restart) showed this was a stale `node_modules/.vite`
SSR dependency-optimization cache left over from the old React-targeted
dependency graph — not a SolidStart/solid-router bug. `rm -rf
node_modules/.vite` before the next `pnpm dev` resolved it. See
GETTING_STARTED.md's vite.config.ts section for the operational note.

**Also found:** `tsr.config.json`'s `"target"` field defaults to `"react"`
regardless of which framework the project actually uses, and
`@tanstack/router-cli generate` will silently inject a stray
`@tanstack/react-router` import into every route file if left unset. Fixed
by setting `"target": "solid"` explicitly.

**Revisit if:** an official `@phosphor-icons/solid` or TipTap Solid wrapper
ships, at which point swap off the web-component/vanilla-core fallbacks.

---

*Citadel — Open source. Always free. Built with care.*
*A BowenLabs project.*
