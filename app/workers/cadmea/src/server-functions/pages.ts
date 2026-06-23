import { pages, pages_versions } from "@core/db/schema.generated";
import { createServerFn } from "@tanstack/solid-start";
import { createVersionedLocalApi } from "@thebes/cadmus/cms";
import { db } from "@thebes/cadmus/db";
import { checkRateLimit } from "@thebes/cadmus/rate-limit";
import { asc, type Column, desc } from "drizzle-orm";
import type { PagesAccessContext } from "../../../../cadmea.config.js";
import { pagesCollection } from "../../../../cadmea.config.js";
import {
  requireAuthOrThrow,
  requireSameOriginOrThrow,
} from "../../app/middleware.js";

async function pagesApi() {
  const { env } = await import("cloudflare:workers");
  return createVersionedLocalApi<
    typeof pages,
    typeof pages_versions,
    PagesAccessContext
  >(db(env.DB), pages, pages_versions, pagesCollection);
}

// beforeLoad route guards (src/routes/admin/route.tsx) only run during
// client-side navigation — they don't protect these server functions'
// own HTTP endpoints from being called directly, so every one of these
// re-checks auth itself (see middleware.ts's requireAuthOrThrow).
async function checkWriteRateLimit(session: { email: string }) {
  const { env } = await import("cloudflare:workers");
  const { allowed } = await checkRateLimit(
    env.KV,
    `ratelimit:cms-write:${session.email}`,
    30,
    60,
  );
  if (!allowed) throw new Error("Rate limit exceeded");
}

export const getPages = createServerFn({ method: "GET" })
  .validator(
    (params: {
      page: number;
      pageSize: number;
      sortField?: string;
      sortDirection?: "asc" | "desc";
    }) => params,
  )
  .handler(async ({ data }) => {
    const session = await requireAuthOrThrow();
    const api = await pagesApi();
    // `sortField` comes from CollectionList's column picker, which only
    // ever lists this collection's own field keys (see listableFields in
    // @thebes/cadmea), so it's always a real column on `pages` — still
    // guarded here since it crosses a server-function boundary.
    const column = data.sortField
      ? (pages as unknown as Record<string, Column>)[data.sortField]
      : undefined;
    const orderBy = column
      ? data.sortDirection === "desc"
        ? desc(column)
        : asc(column)
      : undefined;
    const [rows, total] = await Promise.all([
      api.find(
        { session },
        {
          limit: data.pageSize,
          offset: (data.page - 1) * data.pageSize,
          orderBy,
        },
      ),
      api.count({ session }),
    ]);
    return { rows, total };
  });

export const getPage = createServerFn({ method: "GET" })
  .validator((id: number) => id)
  .handler(async ({ data: id }) => {
    const session = await requireAuthOrThrow();
    return (await pagesApi()).findByID({ session }, id);
  });

export const createPage = createServerFn({ method: "POST" })
  .validator((input: Record<string, unknown>) => input)
  .handler(async ({ data: input }) => {
    const session = await requireAuthOrThrow();
    await requireSameOriginOrThrow();
    await checkWriteRateLimit(session);
    // biome-ignore lint/suspicious/noExplicitAny: validator only constrains the runtime shape, not the Local API's inferred insert type
    return (await pagesApi()).create({ session }, input as any);
  });

export const updatePage = createServerFn({ method: "POST" })
  .validator((input: { id: number; values: Record<string, unknown> }) => input)
  .handler(async ({ data }) => {
    const session = await requireAuthOrThrow();
    await requireSameOriginOrThrow();
    await checkWriteRateLimit(session);
    // biome-ignore lint/suspicious/noExplicitAny: see createPage above
    return (await pagesApi()).update({ session }, data.id, data.values as any);
  });

export const deletePage = createServerFn({ method: "POST" })
  .validator((id: number) => id)
  .handler(async ({ data: id }) => {
    const session = await requireAuthOrThrow();
    await requireSameOriginOrThrow();
    await checkWriteRateLimit(session);
    return (await pagesApi()).deleteByID({ session }, id);
  });

export const getPageVersions = createServerFn({ method: "GET" })
  .validator((id: number) => id)
  .handler(async ({ data: id }) => {
    const session = await requireAuthOrThrow();
    return (await pagesApi()).findVersions({ session }, id);
  });

export const saveDraft = createServerFn({ method: "POST" })
  .validator((input: { id: number; values: Record<string, unknown> }) => input)
  .handler(async ({ data }) => {
    const session = await requireAuthOrThrow();
    await requireSameOriginOrThrow();
    await checkWriteRateLimit(session);
    // biome-ignore lint/suspicious/noExplicitAny: validator only constrains the runtime shape, not the Local API's inferred insert type
    const values = data.values as any;
    return (await pagesApi()).saveDraft({ session }, data.id, values);
  });

export const publishPage = createServerFn({ method: "POST" })
  .validator((versionId: number) => versionId)
  .handler(async ({ data: versionId }) => {
    const session = await requireAuthOrThrow();
    await requireSameOriginOrThrow();
    await checkWriteRateLimit(session);
    return (await pagesApi()).publish({ session }, versionId);
  });

export const unpublishPage = createServerFn({ method: "POST" })
  .validator((id: number) => id)
  .handler(async ({ data: id }) => {
    const session = await requireAuthOrThrow();
    await requireSameOriginOrThrow();
    await checkWriteRateLimit(session);
    return (await pagesApi()).unpublish({ session }, id);
  });
