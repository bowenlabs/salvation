import { env, SELF } from "cloudflare:test";
import { db } from "@thebes/cadmus/db";
import { createMagicLinkToken } from "@core/lib/auth";
import { users } from "@core/db/schema";
import { beforeEach, describe, expect, it } from "vitest";

// Exercises the full magic-link flow against real D1 + KV — no mocking.
// createMagicLinkToken is called directly to obtain the raw token (the
// request route only logs/emails it, never returns it in the response —
// by design, see app.ts), then the verify endpoint is driven exactly as
// a browser would.
describe("magic-link auth", () => {
  beforeEach(async () => {
    await db(env.DB, { users }).delete(users);
  });

  it("verifies a real token and creates a session", async () => {
    await db(env.DB, { users })
      .insert(users)
      .values({ email: "owner@example.com", role: "owner" });

    const { token } = await createMagicLinkToken(env.KV, "owner@example.com");

    const verifyResponse = await SELF.fetch(
      `https://localhost/api/auth/verify?token=${token}`,
      { redirect: "manual" },
    );
    expect(verifyResponse.status).toBe(302);
    expect(verifyResponse.headers.get("set-cookie")).toContain("cadmea_session=");

    // Single-use — the same token must be rejected on a second attempt.
    const replayResponse = await SELF.fetch(
      `https://localhost/api/auth/verify?token=${token}`,
      { redirect: "manual" },
    );
    expect(replayResponse.headers.get("location")).toContain("error=invalid");
  });

  it("rejects an unknown token", async () => {
    const verifyResponse = await SELF.fetch(
      "https://localhost/api/auth/verify?token=not-a-real-token",
      { redirect: "manual" },
    );
    expect(verifyResponse.status).toBe(302);
    expect(verifyResponse.headers.get("location")).toContain("error=invalid");
  });

  it("never reveals whether an email is registered", async () => {
    const response = await SELF.fetch("https://localhost/api/auth/magic-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "nobody@example.com" }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });

    // No token issued for an unknown email — nothing written to KV.
    const keys = await env.KV.list({ prefix: "magiclink:" });
    expect(keys.keys).toHaveLength(0);
  });
});
