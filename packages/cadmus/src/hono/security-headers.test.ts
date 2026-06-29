import { type Context, Hono } from "hono";
import { describe, expect, it } from "vitest";
import {
  createSecurityHeaders,
  FRAME_ANCESTORS_HEADER,
} from "./security-headers.js";

type Bindings = { MEDIA_URL: string };
const ENV: Bindings = { MEDIA_URL: "https://media.example.com" };

// A representative config: a captcha (script + frame) + the media host (img).
const middleware = createSecurityHeaders({
  csp: {
    scriptSrc: ["https://challenges.example.com"],
    frameSrc: ["https://challenges.example.com"],
  },
  dynamicCsp: (c) =>
    c.env.MEDIA_URL ? { imgSrc: [new URL(c.env.MEDIA_URL).origin] } : {},
});

function appWith(handler: (c: Context) => Response) {
  const app = new Hono<{ Bindings: Bindings }>();
  app.use("*", middleware);
  app.get("/", (c) => handler(c));
  return app;
}

describe("createSecurityHeaders", () => {
  it("locks framing to same-origin and sets the baseline directives", async () => {
    const res = await appWith((c) => c.text("ok")).request("/", {}, ENV);
    expect(res.headers.get("X-Frame-Options")).toBe("SAMEORIGIN");
    const csp = res.headers.get("Content-Security-Policy") ?? "";
    expect(csp).not.toContain("frame-ancestors");
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Strict-Transport-Security")).toContain("max-age=");
  });

  it("appends static csp sources to the right directives", async () => {
    const csp =
      (await appWith((c) => c.text("ok")).request("/", {}, ENV)).headers.get(
        "Content-Security-Policy",
      ) ?? "";
    expect(csp).toContain(
      "script-src 'self' 'unsafe-inline' https://challenges.example.com",
    );
    expect(csp).toContain("frame-src https://challenges.example.com");
  });

  it("merges per-request dynamic sources (a media host) into img-src", async () => {
    const csp =
      (await appWith((c) => c.text("ok")).request("/", {}, ENV)).headers.get(
        "Content-Security-Policy",
      ) ?? "";
    expect(csp).toContain("img-src 'self' data: https://media.example.com");
  });

  it("opts a marked response into cross-origin framing and strips the marker", async () => {
    const origin = "https://cms.example.com";
    const res = await appWith((c) => {
      c.header(FRAME_ANCESTORS_HEADER, origin);
      return c.text("framed");
    }).request("/", {}, ENV);
    // X-Frame-Options would override frame-ancestors, so it must be absent.
    expect(res.headers.get("X-Frame-Options")).toBeNull();
    expect(res.headers.get("Content-Security-Policy")).toContain(
      `frame-ancestors ${origin}`,
    );
    expect(res.headers.get(FRAME_ANCESTORS_HEADER)).toBeNull();
    // Hardening stays on the framed response.
    expect(res.headers.get("Content-Security-Policy")).toContain(
      "object-src 'none'",
    );
  });

  it("scopes framing per-response — a later unmarked response stays locked", async () => {
    const app = new Hono<{ Bindings: Bindings }>();
    app.use("*", middleware);
    app.get("/edit", (c) => {
      c.header(FRAME_ANCESTORS_HEADER, "https://cms.example.com");
      return c.text("framed");
    });
    app.get("/public", (c) => c.text("public"));
    const framed = await app.request("/edit", {}, ENV);
    const normal = await app.request("/public", {}, ENV);
    expect(framed.headers.get("X-Frame-Options")).toBeNull();
    expect(normal.headers.get("X-Frame-Options")).toBe("SAMEORIGIN");
    expect(normal.headers.get("Content-Security-Policy")).not.toContain(
      "frame-ancestors",
    );
  });
});
