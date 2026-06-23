import { createLocalApi } from "@bowenlabs/cadmus/cms";
import { db } from "@bowenlabs/cadmus/db";
import { checkRateLimit } from "@bowenlabs/cadmus/rate-limit";
import { pages } from "@core/db/schema.generated";
import { createServerFn } from "@tanstack/solid-start";
import type { PagesAccessContext } from "../../../../cadmea.config.js";
import { pagesCollection } from "../../../../cadmea.config.js";
import {
  requireAuthOrThrow,
  requireSameOriginOrThrow,
} from "../../app/middleware.js";

async function pagesApi() {
  const { env } = await import("cloudflare:workers");
  return createLocalApi<typeof pages, PagesAccessContext>(
    db(env.DB),
    pages,
    pagesCollection,
  );
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

export const getPages = createServerFn({ method: "GET" }).handler(async () => {
  const session = await requireAuthOrThrow();
  return (await pagesApi()).find({ session });
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
