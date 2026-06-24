import type { APIContext } from "astro";
import { describe, expect, it } from "vitest";
import { signSession } from "../auth/index.js";
import {
  cadmusAuthGuard,
  createLogoutHandler,
  createMagicLinkHandlers,
} from "./index.js";

interface User {
  id: number;
  email: string;
}

const SECRET = "test-secret";

// A hand-rolled stand-in for Astro's real AstroCookies/APIContext — same
// reasoning as the fake LocalApi in hono/cms.test.ts: decouples this
// module's tests from astro's actual runtime entirely (the `astro`
// import above is `import type` only) rather than pulling in the real
// package. Mirrors AstroCookies' own semantics where relevant — a
// deleted cookie reads back as undefined, not an empty string.
class FakeCookieJar {
  private readonly values = new Map<string, string>();
  private readonly deleted = new Set<string>();

  constructor(request: Request) {
    const header = request.headers.get("cookie");
    if (!header) return;
    for (const pair of header.split(";")) {
      const [key, ...rest] = pair.trim().split("=");
      if (key) this.values.set(key, rest.join("="));
    }
  }

  get(key: string): { value: string } | undefined {
    if (this.deleted.has(key)) return undefined;
    const value = this.values.get(key);
    return value === undefined ? undefined : { value };
  }

  set(key: string, value: string): void {
    this.deleted.delete(key);
    this.values.set(key, value);
  }

  delete(key: string): void {
    this.deleted.add(key);
    this.values.delete(key);
  }
}

function context(request: Request): APIContext {
  return {
    request,
    url: new URL(request.url),
    cookies: new FakeCookieJar(request),
    redirect: (path: string, status = 302) =>
      new Response(null, { status, headers: { Location: path } }),
    locals: {},
  } as unknown as APIContext;
}

// A minimal in-memory stand-in covering the get/put/delete surface
// cadmus/auth and cadmus/rate-limit actually call — same reasoning as
// FakeCookieJar above.
function createFakeKV(): KVNamespace {
  const store = new Map<string, { value: string; expiresAt: number | null }>();
  function read(key: string): string | null {
    const entry = store.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt < Date.now()) {
      store.delete(key);
      return null;
    }
    return entry.value;
  }
  return {
    get: async (key: string, options?: unknown) => {
      const value = read(key);
      if (value === null) return null;
      const type =
        typeof options === "string"
          ? options
          : (options as { type?: string } | undefined)?.type;
      return type === "json" ? JSON.parse(value) : value;
    },
    put: async (
      key: string,
      value: string,
      options?: { expirationTtl?: number },
    ) => {
      store.set(key, {
        value,
        expiresAt: options?.expirationTtl
          ? Date.now() + options.expirationTtl * 1000
          : null,
      });
    },
    delete: async (key: string) => {
      store.delete(key);
    },
  } as unknown as KVNamespace;
}

describe("createMagicLinkHandlers", () => {
  function handlers(
    overrides: { findUser?: (email: string) => User | null } = {},
  ) {
    const sentEmails: { email: string; verifyUrl: URL }[] = [];
    const sessions = new Map<string, User>();
    let nextSessionId = 1;
    const kv = createFakeKV();

    const { POST, GET } = createMagicLinkHandlers<User>({
      kv: () => kv,
      secret: () => SECRET,
      findUser: async (_context, email) =>
        (overrides.findUser ?? (() => ({ id: 1, email })))(email),
      createSession: async (_context, user) => {
        const sessionId = `session-${nextSessionId++}`;
        sessions.set(sessionId, user);
        return { sessionId };
      },
      sendMagicLinkEmail: async (_context, params) => {
        sentEmails.push(params);
      },
      isLocalDev: () => false,
      rateLimit: false,
    });

    return { POST, GET, sentEmails, sessions };
  }

  it("always returns ok, even for an unknown email, to avoid enumeration", async () => {
    const { POST, sentEmails } = handlers({ findUser: () => null });
    const request = new Request("https://example.com/api/auth/magic-link", {
      method: "POST",
      body: JSON.stringify({ email: "ghost@example.com" }),
    });
    const response = await POST(context(request));
    expect(await response.json()).toEqual({ ok: true });
    expect(sentEmails).toHaveLength(0);
  });

  it("sends a magic-link email for a known user", async () => {
    const { POST, sentEmails } = handlers();
    const request = new Request("https://example.com/api/auth/magic-link", {
      method: "POST",
      body: JSON.stringify({ email: "Owner@Example.com" }),
    });
    await POST(context(request));
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0]?.email).toBe("owner@example.com");
    expect(sentEmails[0]?.verifyUrl.pathname).toBe("/api/auth/verify");
    expect(sentEmails[0]?.verifyUrl.searchParams.get("token")).toBeTruthy();
  });

  it("drops an unsafe redirect instead of forwarding it", async () => {
    const { POST, sentEmails } = handlers();
    const request = new Request("https://example.com/api/auth/magic-link", {
      method: "POST",
      body: JSON.stringify({
        email: "owner@example.com",
        redirect: "//evil.com",
      }),
    });
    await POST(context(request));
    expect(sentEmails[0]?.verifyUrl.searchParams.get("redirect")).toBeNull();
  });

  it("verifies a token, creates a session, and sets a signed cookie", async () => {
    const { POST, GET, sentEmails, sessions } = handlers();
    await POST(
      context(
        new Request("https://example.com/api/auth/magic-link", {
          method: "POST",
          body: JSON.stringify({ email: "owner@example.com" }),
        }),
      ),
    );

    const verifyUrl = sentEmails[0]?.verifyUrl;
    expect(verifyUrl).toBeDefined();
    const verifyContext = context(new Request(verifyUrl as URL));
    const response = await GET(verifyContext);

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/");
    const cookie = verifyContext.cookies.get("cadmus_session");
    expect(cookie).toBeDefined();
    const sessionId = cookie?.value.split(".")[0];
    expect(sessionId && sessions.get(sessionId)).toEqual({
      id: 1,
      email: "owner@example.com",
    });
  });

  it("is single use — verifying the same token twice fails the second time", async () => {
    const { POST, GET, sentEmails } = handlers();
    await POST(
      context(
        new Request("https://example.com/api/auth/magic-link", {
          method: "POST",
          body: JSON.stringify({ email: "owner@example.com" }),
        }),
      ),
    );

    const verifyUrl = sentEmails[0]?.verifyUrl;
    expect(verifyUrl).toBeDefined();
    await GET(context(new Request(verifyUrl as URL)));
    const second = await GET(context(new Request(verifyUrl as URL)));

    expect(second.status).toBe(302);
    expect(second.headers.get("location")).toBe("/login?error=invalid");
  });

  it("redirects to loginPath with error=invalid for a missing token", async () => {
    const { GET } = handlers();
    const response = await GET(
      context(new Request("https://example.com/api/auth/verify")),
    );
    expect(response.headers.get("location")).toBe("/login?error=invalid");
  });

  it("stops sending emails once the per-email rate limit is hit", async () => {
    const sentEmails: { email: string; verifyUrl: URL }[] = [];
    const kv = createFakeKV();
    const { POST } = createMagicLinkHandlers<User>({
      kv: () => kv,
      secret: () => SECRET,
      findUser: async (_context, email) => ({ id: 1, email }),
      createSession: async () => ({ sessionId: "session-1" }),
      sendMagicLinkEmail: async (_context, params) => {
        sentEmails.push(params);
      },
      isLocalDev: () => false,
      rateLimit: { limit: 2, windowSeconds: 900 },
    });

    const send = () =>
      POST(
        context(
          new Request("https://example.com/api/auth/magic-link", {
            method: "POST",
            body: JSON.stringify({ email: "rate-limited@example.com" }),
          }),
        ),
      );

    await send();
    await send();
    await send();

    expect(sentEmails).toHaveLength(2);
  });
});

describe("createLogoutHandler", () => {
  it("deletes the session and the cookie, then redirects", async () => {
    const deleted: string[] = [];
    const logout = createLogoutHandler({
      deleteSession: async (_context, sessionId) => {
        deleted.push(sessionId);
      },
    });

    const request = new Request("https://example.com/api/auth/logout", {
      method: "POST",
      headers: { cookie: "cadmus_session=session-1.signature" },
    });
    const logoutContext = context(request);
    const response = await logout(logoutContext);

    expect(deleted).toEqual(["session-1"]);
    expect(response.headers.get("location")).toBe("/login");
    // AstroCookies.get returns undefined for a key marked deleted, not
    // an empty-string value — the pipeline still emits a Set-Cookie
    // header expiring it, this just isn't visible through .get().
    expect(logoutContext.cookies.get("cadmus_session")).toBeUndefined();
  });
});

describe("cadmusAuthGuard", () => {
  it("populates locals with null when there is no cookie", async () => {
    const guard = cadmusAuthGuard<User>({
      secret: () => SECRET,
      getSession: async () => {
        throw new Error("should not be called");
      },
    });

    const guardContext = context(new Request("https://example.com/admin"));
    await guard(guardContext, async () => new Response(null));
    expect(guardContext.locals.session).toBeNull();
  });

  it("populates locals with the session for a validly signed cookie", async () => {
    const guard = cadmusAuthGuard<User>({
      secret: () => SECRET,
      getSession: async (_context, sessionId) =>
        sessionId === "session-1"
          ? { id: 1, email: "owner@example.com" }
          : null,
    });

    const signature = await signSession("session-1", SECRET);
    const guardContext = context(
      new Request("https://example.com/admin", {
        headers: { cookie: `cadmus_session=session-1.${signature}` },
      }),
    );
    await guard(guardContext, async () => new Response(null));
    expect(guardContext.locals.session).toEqual({
      id: 1,
      email: "owner@example.com",
    });
  });

  it("treats a tampered signature as unauthenticated", async () => {
    const guard = cadmusAuthGuard<User>({
      secret: () => SECRET,
      getSession: async () => ({ id: 1, email: "owner@example.com" }),
    });

    const guardContext = context(
      new Request("https://example.com/admin", {
        headers: { cookie: "cadmus_session=session-1.not-a-real-signature" },
      }),
    );
    await guard(guardContext, async () => new Response(null));
    expect(guardContext.locals.session).toBeNull();
  });
});
