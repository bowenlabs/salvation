import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { createErrorMonitoring } from "./error-monitoring.js";

function appWith(options: Parameters<typeof createErrorMonitoring>[0]) {
  const app = new Hono();
  app.onError(createErrorMonitoring({ awaitCapture: true, ...options }));
  app.get("/ok", (c) => c.text("ok"));
  app.get("/boom", () => {
    throw new Error("kaboom");
  });
  return app;
}

describe("createErrorMonitoring", () => {
  it("passes successful responses through and never calls capture", async () => {
    const capture = vi.fn();
    const res = await appWith({ capture }).request("/ok");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
    expect(capture).not.toHaveBeenCalled();
  });

  it("captures an uncaught error and responds 500 by default", async () => {
    const capture = vi.fn();
    const res = await appWith({ capture }).request("/boom");
    expect(res.status).toBe(500);
    expect(capture).toHaveBeenCalledOnce();
    expect((capture.mock.calls[0][0] as Error).message).toBe("kaboom");
  });

  it("delegates the response to a provided onError", async () => {
    const capture = vi.fn();
    const res = await appWith({
      capture,
      onError: (_e, c) => c.text("handled", 503),
    }).request("/boom");
    expect(res.status).toBe(503);
    expect(await res.text()).toBe("handled");
    expect(capture).toHaveBeenCalledOnce();
  });

  it("swallows a failing sink — still responds 500", async () => {
    const capture = vi.fn(async () => {
      throw new Error("sink down");
    });
    const res = await appWith({ capture }).request("/boom");
    expect(res.status).toBe(500);
    expect(capture).toHaveBeenCalledOnce();
  });

  it("catches errors rethrown by an inner mounted router", async () => {
    const capture = vi.fn();
    const inner = new Hono();
    inner.get("/fail", () => {
      throw new Error("inner boom");
    });
    const app = new Hono();
    app.onError(createErrorMonitoring({ capture, awaitCapture: true }));
    app.route("/api", inner);
    const res = await app.request("/api/fail");
    expect(res.status).toBe(500);
    expect(capture).toHaveBeenCalledOnce();
    expect((capture.mock.calls[0][0] as Error).message).toBe("inner boom");
  });
});
