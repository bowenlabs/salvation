import { db } from "@bowenlabs/cadmus/db";
import { pages } from "@core/db/schema";
import { createServerFn } from "@tanstack/solid-start";

export const getPages = createServerFn({ method: "GET" }).handler(async () => {
  const { env } = await import("cloudflare:workers");
  return db(env.DB).select().from(pages).all();
  // hover over the return type — must be InferSelectModel<typeof pages>[]
  // if it shows any[], the Drizzle schema import is broken
});
