import { db } from "@bowenlabs/cadmus/db";
import { pages } from "@core/db/schema.generated";
import { createFileRoute } from "@tanstack/solid-router";
import { createServerFn } from "@tanstack/solid-start";

// loader calls a server function — must never be statically prerendered.
// See scripts/check-prerender.ts.
export const prerender = false;

const getD1Test = createServerFn({ method: "GET" }).handler(async () => {
  const { env } = await import("cloudflare:workers");
  const result = await env.DB.prepare("SELECT 1 as ok").first<{ ok: number }>();
  const pagesResult = await db(env.DB).select().from(pages).all();
  return { result, pagesResult };
});

export const Route = createFileRoute("/test")({
  component: Test,
  loader: () => getD1Test(),
});

function Test() {
  const result = Route.useLoaderData();
  return <p>D1 from TanStack Start: {JSON.stringify(result())}</p>;
}
