import { describe, expect, it, vi } from "vitest";
import { CadmusQueueError } from "../errors.js";
import {
  createWebhookHook,
  deliverWebhookMessage,
  type WebhookMessage,
} from "./webhooks.js";

function fakeQueue(send: Queue<WebhookMessage>["send"]): Queue<WebhookMessage> {
  return { send } as Queue<WebhookMessage>;
}

describe("createWebhookHook", () => {
  it("enqueues the doc, event, and secret on a matching operation", async () => {
    let sent: WebhookMessage | undefined;
    const hook = createWebhookHook(
      fakeQueue(async (message) => {
        sent = message as WebhookMessage;
      }),
      { url: "https://example.com/hook", secret: "shh" },
    );

    await hook({ doc: { id: 1, title: "Home" }, operation: "create" });

    expect(sent).toMatchObject({
      url: "https://example.com/hook",
      secret: "shh",
      event: "create",
      doc: { id: 1, title: "Home" },
    });
    expect(typeof sent?.timestamp).toBe("number");
  });

  it("respects the events filter", async () => {
    let calls = 0;
    const hook = createWebhookHook(
      fakeQueue(async () => {
        calls++;
      }),
      { url: "https://example.com/hook", events: ["create"] },
    );

    await hook({ doc: { id: 1 }, operation: "update" });
    expect(calls).toBe(0);

    await hook({ doc: { id: 1 }, operation: "create" });
    expect(calls).toBe(1);
  });

  it("fires for both operations when events is unset", async () => {
    let calls = 0;
    const hook = createWebhookHook(
      fakeQueue(async () => {
        calls++;
      }),
      { url: "https://example.com/hook" },
    );

    await hook({ doc: { id: 1 }, operation: "create" });
    await hook({ doc: { id: 1 }, operation: "update" });
    expect(calls).toBe(2);
  });
});

describe("deliverWebhookMessage", () => {
  const baseMessage: WebhookMessage = {
    url: "https://example.com/hook",
    event: "create",
    doc: { id: 1, title: "Home" },
    timestamp: 1700000000000,
  };

  it("POSTs the event/doc/timestamp body with no signature header by default", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));

    await deliverWebhookMessage(baseMessage);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://example.com/hook");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      event: "create",
      doc: { id: 1, title: "Home" },
      timestamp: 1700000000000,
    });
    expect(
      (init.headers as Record<string, string>)["X-Cadmus-Signature"],
    ).toBeUndefined();

    fetchSpy.mockRestore();
  });

  it("signs the payload with HMAC-SHA256 when a secret is configured", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));

    await deliverWebhookMessage({ ...baseMessage, secret: "shh" });

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const signature = (init.headers as Record<string, string>)[
      "X-Cadmus-Signature"
    ];
    expect(signature).toMatch(/^[0-9a-f]{64}$/);

    fetchSpy.mockRestore();
  });

  it("throws CadmusQueueError on a non-2xx response", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 500 }));

    await expect(deliverWebhookMessage(baseMessage)).rejects.toBeInstanceOf(
      CadmusQueueError,
    );

    fetchSpy.mockRestore();
  });

  it("throws CadmusQueueError when fetch itself rejects", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("network down"));

    await expect(deliverWebhookMessage(baseMessage)).rejects.toBeInstanceOf(
      CadmusQueueError,
    );

    fetchSpy.mockRestore();
  });

  it.each([
    "http://localhost/hook",
    "http://127.0.0.1/hook",
    "http://169.254.169.254/latest/meta-data/", // cloud metadata endpoint
    "http://10.0.0.5/hook",
    "http://172.16.0.5/hook",
    "http://192.168.1.5/hook",
    "http://[::1]/hook",
    "ftp://example.com/hook",
    "not-a-url",
  ])("rejects %s without calling fetch", async (url) => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(
      deliverWebhookMessage({ ...baseMessage, url }),
    ).rejects.toBeInstanceOf(CadmusQueueError);
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  it("still allows a normal https URL through", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));

    await deliverWebhookMessage(baseMessage);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    fetchSpy.mockRestore();
  });
});
