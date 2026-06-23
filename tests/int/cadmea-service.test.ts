import {
  createExecutionContext,
  env,
  waitOnExecutionContext,
} from "cloudflare:test";
import { db } from "@thebes/cadmus/db";
import { pages } from "@core/db/schema.generated";
import { beforeEach, describe, expect, it } from "vitest";
import { CadmeaService } from "../../app/workers/cadmea/app/service";

// Closes the gap flagged on issue #15: CadmeaService (the Service Binding
// entrypoint Worker 1 calls cross-Worker — see app/workers/site/src/app.ts's
// /api/cadmea-test route) had only a manual `wrangler dev` + curl
// round-trip verifying it. This instantiates the real class directly
// against real local D1 instead of mocking it — the RPC wire itself
// (cross-Worker `services` binding) isn't exercised here since this pool
// only starts one Worker, but every line of logic the wire calls into is.
describe("CadmeaService", () => {
  beforeEach(async () => {
    await db(env.DB, { pages }).delete(pages);
  });

  it("creates, updates, and deletes a page", async () => {
    const ctx = createExecutionContext();
    const service = new CadmeaService(ctx, env);

    const created = await service.create("pages", {
      title: "Service Test",
      slug: `service-test-${Date.now()}`,
      status: "draft",
    });
    expect(created.status).toBe("draft");

    const updated = await service.update("pages", created.id, {
      status: "published",
    });
    expect(updated.status).toBe("published");

    const deleted = await service.deleteByID("pages", created.id);
    expect(deleted.id).toBe(created.id);

    await waitOnExecutionContext(ctx);
  });

  it("rejects an unknown collection", async () => {
    const ctx = createExecutionContext();
    const service = new CadmeaService(ctx, env);
    await expect(service.create("not-a-collection", {})).rejects.toThrow();
    await waitOnExecutionContext(ctx);
  });
});
