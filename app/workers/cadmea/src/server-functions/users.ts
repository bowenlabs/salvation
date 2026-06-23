import { users } from "@core/db/schema";
import type { Role } from "@core/lib/session";
import { createServerFn } from "@tanstack/solid-start";
import { db } from "@thebes/cadmus/db";
import { checkRateLimit } from "@thebes/cadmus/rate-limit";
import { eq } from "drizzle-orm";
import {
  requireAuthOrThrow,
  requireSameOriginOrThrow,
} from "../../app/middleware.js";

// users is a hand-written infra table, not a cadmus/cms collection (see
// app/core/db/schema.ts's header comment) — no Local API/access fn to
// hang this off, so role is checked by hand here. Only an owner may view
// or change other users' roles — see issue #26's "first place role
// becomes load-bearing".
function requireOwner(session: { role: Role }) {
  if (session.role !== "owner") {
    throw new Error("Only an owner can manage users");
  }
}

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

export const getUsers = createServerFn({ method: "GET" }).handler(async () => {
  const session = await requireAuthOrThrow();
  requireOwner(session);
  const { env } = await import("cloudflare:workers");
  return db(env.DB, { users }).select().from(users).all();
});

export const getUser = createServerFn({ method: "GET" })
  .validator((id: number) => id)
  .handler(async ({ data: id }) => {
    const session = await requireAuthOrThrow();
    requireOwner(session);
    const { env } = await import("cloudflare:workers");
    const row = await db(env.DB, { users })
      .select()
      .from(users)
      .where(eq(users.id, id))
      .get();
    if (!row) throw new Error(`No user found with id ${id}`);
    return row;
  });

export const updateUserRole = createServerFn({ method: "POST" })
  .validator((input: { id: number; role: Role }) => input)
  .handler(async ({ data }) => {
    const session = await requireAuthOrThrow();
    requireOwner(session);
    await requireSameOriginOrThrow();
    await checkWriteRateLimit(session);
    const { env } = await import("cloudflare:workers");
    const [row] = await db(env.DB, { users })
      .update(users)
      .set({ role: data.role })
      .where(eq(users.id, data.id))
      .returning();
    if (!row) throw new Error(`No user found with id ${data.id}`);
    return row;
  });
