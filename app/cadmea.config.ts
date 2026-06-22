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
    // union. The nested `fields` here is introspection only (not enforced
    // at write time, see cadmus/cms's array field docs); the real shape
    // contract lives in blocks.ts.
    blocks: {
      type: "array",
      fields: { type: { type: "text", required: true } },
    },
  },
} as const;

export const cadmeaConfig = defineCmsConfig({ collections: [pagesCollection] });
