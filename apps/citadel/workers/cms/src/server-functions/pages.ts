import { createLocalApi } from "@bowenlabs/cadmus/cms";
import { db } from "@bowenlabs/cadmus/db";
import { pages } from "@core/db/schema.generated";
import { createServerFn } from "@tanstack/solid-start";
import { pagesCollection } from "../../../../citadel.config.js";

async function pagesApi() {
  const { env } = await import("cloudflare:workers");
  return createLocalApi(db(env.DB), pages, pagesCollection);
}

export const getPages = createServerFn({ method: "GET" }).handler(async () =>
  (await pagesApi()).find(),
);

export const getPage = createServerFn({ method: "GET" })
  .validator((id: number) => id)
  .handler(async ({ data: id }) => (await pagesApi()).findByID(id));

export const createPage = createServerFn({ method: "POST" })
  .validator((input: Record<string, unknown>) => input)
  .handler(async ({ data: input }) =>
    // biome-ignore lint/suspicious/noExplicitAny: validator only constrains the runtime shape, not the Local API's inferred insert type
    (await pagesApi()).create(input as any),
  );

export const updatePage = createServerFn({ method: "POST" })
  .validator((input: { id: number; values: Record<string, unknown> }) => input)
  .handler(async ({ data }) =>
    // biome-ignore lint/suspicious/noExplicitAny: see createPage above
    (await pagesApi()).update(data.id, data.values as any),
  );

export const deletePage = createServerFn({ method: "POST" })
  .validator((id: number) => id)
  .handler(async ({ data: id }) => (await pagesApi()).deleteByID(id));
