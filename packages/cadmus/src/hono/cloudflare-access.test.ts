import { Hono } from "hono";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  type AccessIdentity,
  createCloudflareAccess,
} from "./cloudflare-access.js";

const AUD = "test-app-aud";
const KID = "test-kid";

let privateKey: CryptoKey;
let jwk: JsonWebKey & { kid: string };

// Unique team domain per app so the module-level JWKS cache never bleeds
// between tests.
let teamCounter = 0;
function nextTeam(): { name: string; domain: string } {
  const name = `team-${teamCounter++}`;
  return { name, domain: `https://${name}.cloudflareaccess.com` };
}

function b64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function b64urlJson(value: unknown): string {
  return b64url(new TextEncoder().encode(JSON.stringify(value)));
}

async function signJwt(
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
): Promise<string> {
  const signingInput = `${b64urlJson(header)}.${b64urlJson(payload)}`;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${b64url(new Uint8Array(signature))}`;
}

function validPayload(domain: string, overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: domain,
    aud: [AUD],
    sub: "user-123",
    email: "owner@example.com",
    iat: now,
    exp: now + 3600,
    ...overrides,
  };
}

function stubJwks(domain: string): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string"
          ? input
          : ((input as Request).url ?? String(input));
      if (url === `${domain}/cdn-cgi/access/certs`) {
        return new Response(JSON.stringify({ keys: [jwk] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("not found", { status: 404 });
    }),
  );
}

function appFor(domain: string) {
  const app = new Hono();
  app.use("*", createCloudflareAccess({ teamDomain: domain, aud: AUD }));
  app.get("/protected", (c) => {
    const identity = c.get("accessIdentity") as AccessIdentity | undefined;
    return c.json({ email: identity?.email, sub: identity?.sub });
  });
  return app;
}

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  privateKey = pair.privateKey;
  const exported = (await crypto.subtle.exportKey(
    "jwk",
    pair.publicKey,
  )) as JsonWebKey;
  // Mirror Cloudflare's JWKS shape: a clean RSA verify key with a kid.
  jwk = {
    kty: exported.kty,
    n: exported.n,
    e: exported.e,
    alg: "RS256",
    use: "sig",
    kid: KID,
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createCloudflareAccess", () => {
  it("allows a valid token (header) and exposes the identity", async () => {
    const { domain } = nextTeam();
    stubJwks(domain);
    const token = await signJwt(
      { alg: "RS256", kid: KID },
      validPayload(domain),
    );
    const res = await appFor(domain).request("/protected", {
      headers: { "cf-access-jwt-assertion": token },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      email: "owner@example.com",
      sub: "user-123",
    });
  });

  it("accepts the token from the CF_Authorization cookie", async () => {
    const { domain } = nextTeam();
    stubJwks(domain);
    const token = await signJwt(
      { alg: "RS256", kid: KID },
      validPayload(domain),
    );
    const res = await appFor(domain).request("/protected", {
      headers: { cookie: `other=1; CF_Authorization=${token}` },
    });
    expect(res.status).toBe(200);
  });

  it("rejects a request with no token (403)", async () => {
    const { domain } = nextTeam();
    stubJwks(domain);
    const res = await appFor(domain).request("/protected");
    expect(res.status).toBe(403);
  });

  it("rejects a wrong audience", async () => {
    const { domain } = nextTeam();
    stubJwks(domain);
    const token = await signJwt(
      { alg: "RS256", kid: KID },
      validPayload(domain, { aud: ["someone-elses-app"] }),
    );
    const res = await appFor(domain).request("/protected", {
      headers: { "cf-access-jwt-assertion": token },
    });
    expect(res.status).toBe(403);
  });

  it("rejects an expired token", async () => {
    const { domain } = nextTeam();
    stubJwks(domain);
    const now = Math.floor(Date.now() / 1000);
    const token = await signJwt(
      { alg: "RS256", kid: KID },
      validPayload(domain, { exp: now - 100, iat: now - 200 }),
    );
    const res = await appFor(domain).request("/protected", {
      headers: { "cf-access-jwt-assertion": token },
    });
    expect(res.status).toBe(403);
  });

  it("rejects an issuer mismatch", async () => {
    const { domain } = nextTeam();
    stubJwks(domain);
    const token = await signJwt(
      { alg: "RS256", kid: KID },
      validPayload(domain, { iss: "https://evil.cloudflareaccess.com" }),
    );
    const res = await appFor(domain).request("/protected", {
      headers: { "cf-access-jwt-assertion": token },
    });
    expect(res.status).toBe(403);
  });

  it("rejects a tampered signature", async () => {
    const { domain } = nextTeam();
    stubJwks(domain);
    const token = await signJwt(
      { alg: "RS256", kid: KID },
      validPayload(domain),
    );
    const tampered = `${token.slice(0, -3)}AAA`;
    const res = await appFor(domain).request("/protected", {
      headers: { "cf-access-jwt-assertion": tampered },
    });
    expect(res.status).toBe(403);
  });

  it("rejects a non-RS256 alg (no alg-confusion / none downgrade)", async () => {
    const { domain } = nextTeam();
    stubJwks(domain);
    // A forged token claiming alg "none" with an empty signature.
    const forged = `${b64urlJson({ alg: "none", kid: KID })}.${b64urlJson(
      validPayload(domain),
    )}.`;
    const res = await appFor(domain).request("/protected", {
      headers: { "cf-access-jwt-assertion": forged },
    });
    expect(res.status).toBe(403);
  });

  it("uses a custom onUnauthorized response", async () => {
    const { domain } = nextTeam();
    stubJwks(domain);
    const app = new Hono();
    app.use(
      "*",
      createCloudflareAccess({
        teamDomain: domain,
        aud: AUD,
        onUnauthorized: (c) => c.text("nope", 401),
      }),
    );
    app.get("/protected", (c) => c.text("ok"));
    const res = await app.request("/protected");
    expect(res.status).toBe(401);
    expect(await res.text()).toBe("nope");
  });

  it("normalizes a bare team name to the full domain", async () => {
    const { name, domain } = nextTeam();
    stubJwks(domain);
    const token = await signJwt(
      { alg: "RS256", kid: KID },
      validPayload(domain),
    );
    // Pass just "team-N" — the middleware should resolve the JWKS URL + iss.
    const app = new Hono();
    app.use("*", createCloudflareAccess({ teamDomain: name, aud: AUD }));
    app.get("/protected", (c) => c.text("ok"));
    const res = await app.request("/protected", {
      headers: { "cf-access-jwt-assertion": token },
    });
    expect(res.status).toBe(200);
  });
});
