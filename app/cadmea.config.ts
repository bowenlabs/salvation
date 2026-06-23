import { seoPlugin } from "@bowenlabs/cadmea-plugin-seo";
import { defineCmsConfig } from "@bowenlabs/cadmus/cms";
import type { Session } from "./core/lib/session.js";

// The context every collection's `access` functions receive, passed
// through unchanged from each Local API call site. `session` is the
// logged-in admin's session (null for unauthenticated callers — pages are
// publicly readable, so `read` never even inspects this). `internal` marks
// the trusted Service Binding RPC (app/workers/cadmea/app/service.ts,
// reachable only Worker-to-Worker, never from the internet) so it can
// perform writes without a real admin session.
export interface PagesAccessContext {
  session: Session | null;
  internal?: boolean;
}

function requireSessionOrInternal({ session, internal }: PagesAccessContext) {
  return internal === true || session !== null;
}

// The base `pages` definition. NOTE: consumers must not import this — they
// import the resolved `pagesCollection` below, which is this definition
// *after* plugins have run (e.g. the SEO plugin's injected meta fields and
// its metaTitle-default hook). Reading the base directly would bypass every
// plugin. It drives both the admin UI's field introspection and the
// generated DB schema. Run `pnpm db:generate` after editing this file — it
// regenerates app/core/db/schema.generated.ts (via @bowenlabs/cadmus/cms's
// generateSchemaSource) and then runs drizzle-kit generate against it.
const pagesBase = {
  slug: "pages",
  // Pages are public content — anyone may read them (the public site reads
  // through this same Local API, unauthenticated). Writes require either a
  // real admin session or the internal Service Binding RPC.
  access: {
    read: () => true,
    create: requireSessionOrInternal,
    update: requireSessionOrInternal,
    delete: requireSessionOrInternal,
  },
  fields: {
    id: { type: "number", autoIncrement: true },
    title: { type: "text", required: true },
    slug: { type: "text", required: true, unique: true },
    status: {
      type: "select",
      options: ["draft", "published"],
      required: true,
      defaultValue: "draft",
    },
    createdAt: { type: "date", mode: "timestamp", defaultValue: "now" },
    // TipTap-JSON-shaped block array — see app/core/lib/blocks.ts's Block
    // union (richText/image/hero/divider — core ships no form/columns
    // collection to back those example-template-only block types). The
    // discriminator switches which extra fields CollectionEdit renders
    // per item based on `type`'s value; storage is still one JSON column
    // either way (introspection only, not enforced at write time — see
    // cadmus/cms's array field docs). The real shape contract lives in
    // blocks.ts.
    blocks: {
      type: "array",
      fields: {
        type: {
          type: "select",
          options: ["richText", "image", "hero", "divider"],
          required: true,
        },
      },
      discriminator: {
        key: "type",
        variants: {
          richText: {
            content: { type: "richText" },
          },
          image: {
            url: { type: "upload", required: true },
            alt: { type: "text", required: true },
            caption: { type: "text" },
          },
          hero: {
            heading: { type: "text", required: true },
            subtext: { type: "text" },
            ctaLabel: { type: "text" },
            ctaHref: { type: "text" },
          },
          divider: {},
        },
      },
    },
  },
} as const;

// The resolved config — plugins have run, fields are injected, hooks are
// registered. This is the single source of truth every consumer reads:
// schema codegen (app/scripts/generate-schema.ts), the admin UI's field
// introspection, and the Local API. Add plugins here, never in consumers.
export const cadmeaConfig = defineCmsConfig({
  collections: [pagesBase],
  plugins: [seoPlugin({ collections: ["pages"] })],
});

// The post-plugin `pages` collection. Every consumer imports THIS, not the
// base, so injected SEO fields flow to the DB schema, the admin form, and
// the Local API's validation/hooks alike.
export const pagesCollection =
  // biome-ignore lint/style/noNonNullAssertion: 'pages' is always present in the config above
  cadmeaConfig.collections.find((collection) => collection.slug === "pages")!;
