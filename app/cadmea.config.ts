import { defineCmsConfig } from "@bowenlabs/cadmus/cms";

// The single source of truth for the `pages` collection: drives both
// the admin UI's field introspection (labels, types, options, required)
// and the generated DB schema. Run `pnpm db:generate` after editing this
// file — it regenerates app/core/db/schema.generated.ts (via
// @bowenlabs/cadmus/cms's generateSchemaSource) and then runs
// drizzle-kit generate against it.
export const pagesCollection = {
  slug: "pages",
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

export const cadmeaConfig = defineCmsConfig({ collections: [pagesCollection] });
