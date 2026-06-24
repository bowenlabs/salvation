import { env, SELF } from "cloudflare:test";
import { db } from "@thebes/cadmus/db";
import {
  createMagicLinkToken,
  createPreviewToken,
  verifyPreviewToken,
} from "@core/lib/auth";
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

// Mirrors the magic-link suite above, but for the stateless preview token
// (issue #28) — signature/expiry checks, no KV involved (see
// createPreviewToken's doc in app/core/lib/auth.ts for why).
describe("preview token", () => {
  it("verifies a freshly issued token", async () => {
    const { token } = await createPreviewToken(env.SESSION_SECRET, 1, 2);
    const verified = await verifyPreviewToken(env.SESSION_SECRET, token);
    expect(verified).toEqual({ parentId: 1, versionId: 2 });
  });

  it("rejects a token signed with a different secret", async () => {
    const { token } = await createPreviewToken("wrong-secret", 1, 2);
    const verified = await verifyPreviewToken(env.SESSION_SECRET, token);
    expect(verified).toBeNull();
  });

  it("rejects a tampered payload", async () => {
    const { token } = await createPreviewToken(env.SESSION_SECRET, 1, 2);
    const [parentId, versionId, expiresAt, signature] = token.split(".");
    const tampered = [parentId, "999", expiresAt, signature].join(".");
    const verified = await verifyPreviewToken(env.SESSION_SECRET, tampered);
    expect(verified).toBeNull();
  });

  it("rejects an expired token", async () => {
    const now = Math.floor(Date.now() / 1000);
    const payload = `1.2.${now - 10}`;
    const { signSession } = await import("@thebes/cadmus/auth");
    const signature = await signSession(payload, env.SESSION_SECRET);
    const expired = `${payload}.${signature}`;
    const verified = await verifyPreviewToken(env.SESSION_SECRET, expired);
    expect(verified).toBeNull();
  });

  it("rejects a malformed token", async () => {
    const verified = await verifyPreviewToken(env.SESSION_SECRET, "not-a-token");
    expect(verified).toBeNull();
  });
});
