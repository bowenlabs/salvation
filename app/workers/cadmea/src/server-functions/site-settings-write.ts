import { db } from "@bowenlabs/cadmus/db";
import { checkRateLimit } from "@bowenlabs/cadmus/rate-limit";
import { siteSettings } from "@core/db/schema";
import { createServerFn } from "@tanstack/solid-start";
import { eq } from "drizzle-orm";
import {
  requireAuthOrThrow,
  requireSameOriginOrThrow,
} from "../../app/middleware.js";

// site_settings is a hand-written singleton table, not a cadmus/cms
// collection (see DECISIONS.md's 2026-06-21 entry) — no Local API, so
// these write directly via Drizzle. Kept separate from the existing
// read-only site-settings.ts (getCadmeaSiteSettings is intentionally
// unauthenticated; these must not be).
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

// General/Contact/SEO tabs on /admin/settings.
export const saveSettings = createServerFn({ method: "POST" })
  .validator((input: Record<string, unknown>) => input)
  .handler(async ({ data }) => {
    const session = await requireAuthOrThrow();
    await requireSameOriginOrThrow();
    await checkWriteRateLimit(session);
    const { env } = await import("cloudflare:workers");
    await db(env.DB)
      .update(siteSettings)
      // biome-ignore lint/suspicious/noExplicitAny: validator only constrains the runtime shape, not Drizzle's inferred update type — same pattern as pages.ts's createPage/updatePage
      .set(data as any)
      .where(eq(siteSettings.id, 1));
  });

// Theme/Colors/Typography/Spacing tabs on /admin/design.
export const saveDesignSettings = createServerFn({ method: "POST" })
  .validator((input: Record<string, unknown>) => input)
  .handler(async ({ data }) => {
    const session = await requireAuthOrThrow();
    await requireSameOriginOrThrow();
    await checkWriteRateLimit(session);
    const { env } = await import("cloudflare:workers");
    await db(env.DB)
      .update(siteSettings)
      // biome-ignore lint/suspicious/noExplicitAny: see saveSettings above
      .set(data as any)
      .where(eq(siteSettings.id, 1));
  });
