// Copyright (c) 2026 BowenLabs. All rights reserved.
// MIT licensed. See LICENSE in the repo root.

import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { NormalizedWebhookEvent, PaymentProvider } from "./types.js";
import { createWebhookHandler } from "./webhook.js";

function createFakeLocalApi<TRow extends { id: number }>() {
  const rows: TRow[] = [];
  let nextId = 1;
  return {
    rows,
    async find(_context: unknown) {
      return rows;
    },
    async create(_context: unknown, input: Omit<TRow, "id">) {
      // Mirrors createLocalApi's real unique-constraint behavior for
      // eventId, the field the webhook dedup guard relies on.
      if (
        "eventId" in input &&
        rows.some(
          (r) =>
            (r as Record<string, unknown>).eventId ===
            (input as Record<string, unknown>).eventId,
        )
      ) {
        throw new Error(
          'Unique constraint violated for collection "webhook_events"',
        );
      }
      const row = { ...input, id: nextId++ } as TRow;
      rows.push(row);
      return row;
    },
    async update(_context: unknown, id: number, input: Partial<TRow>) {
      const row = rows.find((r) => r.id === id);
      if (!row) throw new Error(`no row with id ${id}`);
      Object.assign(row, input);
      return row;
    },
  };
}

interface WebhookEvent {
  id: number;
  provider: string;
  eventId: string;
  eventType: string;
}

interface Order {
  id: number;
  providerOrderRef: string;
  providerPaymentRef: string;
  status: string;
}

interface Payment {
  id: number;
  providerPaymentRef: string;
  status: string;
}

function createFakeProvider(
  event: NormalizedWebhookEvent,
  overrides: Partial<PaymentProvider> = {},
): PaymentProvider {
  return {
    name: "square",
    async checkCatalogPrices() {
      return [];
    },
    async findOrCreateCustomer() {
      return "cust_123";
    },
    async checkout() {
      throw new Error("not used in these tests");
    },
    async verifyWebhookSignature() {
      return true;
    },
    parseWebhookEvent() {
      return { eventId: "evt_1", event };
    },
    ...overrides,
  };
}

function buildApp<TContext>(
  provider: PaymentProvider,
  apis: {
    webhookEvents: ReturnType<typeof createFakeLocalApi<WebhookEvent>>;
    orders: ReturnType<typeof createFakeLocalApi<Order>>;
    payments: ReturnType<typeof createFakeLocalApi<Payment>>;
  },
) {
  const app = new Hono();
  app.post(
    "/webhook",
    createWebhookHandler<TContext>({
      provider,
      // biome-ignore lint/suspicious/noExplicitAny: fakes satisfy LocalApi's call shape
      webhookEvents: apis.webhookEvents as any,
      // biome-ignore lint/suspicious/noExplicitAny: fakes satisfy LocalApi's call shape
      orders: apis.orders as any,
      // biome-ignore lint/suspicious/noExplicitAny: fakes satisfy LocalApi's call shape
      payments: apis.payments as any,
      secret: "whsec_test",
      // biome-ignore lint/suspicious/noExplicitAny: test-only fixed context
      context: undefined as any,
    }),
  );
  return app;
}

describe("createWebhookHandler", () => {
  it("returns 401 when signature verification fails", async () => {
    const provider = createFakeProvider(
      { kind: "unhandled", rawType: "x" },
      { verifyWebhookSignature: async () => false },
    );
    const app = buildApp(provider, {
      webhookEvents: createFakeLocalApi<WebhookEvent>(),
      orders: createFakeLocalApi<Order>(),
      payments: createFakeLocalApi<Payment>(),
    });

    const res = await app.request("/webhook", { method: "POST", body: "{}" });
    expect(res.status).toBe(401);
  });

  it("records the event and returns 200 for an unhandled event kind", async () => {
    const webhookEvents = createFakeLocalApi<WebhookEvent>();
    const provider = createFakeProvider({
      kind: "unhandled",
      rawType: "some.event",
    });
    const app = buildApp(provider, {
      webhookEvents,
      orders: createFakeLocalApi<Order>(),
      payments: createFakeLocalApi<Payment>(),
    });

    const res = await app.request("/webhook", { method: "POST", body: "{}" });
    expect(res.status).toBe(200);
    expect(webhookEvents.rows).toHaveLength(1);
  });

  it("deduplicates a webhook event already recorded (no double-processing)", async () => {
    const webhookEvents = createFakeLocalApi<WebhookEvent>();
    const orders = createFakeLocalApi<Order>();
    orders.rows.push({
      id: 1,
      providerOrderRef: "order_abc",
      providerPaymentRef: "pay_abc",
      status: "pending",
    });
    const provider = createFakeProvider({
      kind: "order.updated",
      providerOrderRef: "order_abc",
      status: "paid",
    });
    const app = buildApp(provider, {
      webhookEvents,
      orders,
      payments: createFakeLocalApi<Payment>(),
    });

    const first = await app.request("/webhook", { method: "POST", body: "{}" });
    expect(first.status).toBe(200);
    expect(orders.rows[0]?.status).toBe("paid");

    // Reset the order status to prove the second delivery doesn't re-dispatch.
    orders.rows[0].status = "pending";
    const second = await app.request("/webhook", {
      method: "POST",
      body: "{}",
    });
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as Record<string, unknown>;
    expect(secondBody.duplicate).toBe(true);
    expect(orders.rows[0]?.status).toBe("pending");
  });

  it("updates the matching order's status on an order.updated event", async () => {
    const orders = createFakeLocalApi<Order>();
    orders.rows.push({
      id: 1,
      providerOrderRef: "order_abc",
      providerPaymentRef: "pay_abc",
      status: "pending",
    });
    const provider = createFakeProvider({
      kind: "order.updated",
      providerOrderRef: "order_abc",
      status: "paid",
    });
    const app = buildApp(provider, {
      webhookEvents: createFakeLocalApi<WebhookEvent>(),
      orders,
      payments: createFakeLocalApi<Payment>(),
    });

    await app.request("/webhook", { method: "POST", body: "{}" });
    expect(orders.rows[0]?.status).toBe("paid");
  });

  it("updates the matching payment and order on a payment.updated event", async () => {
    const orders = createFakeLocalApi<Order>();
    orders.rows.push({
      id: 1,
      providerOrderRef: "order_abc",
      providerPaymentRef: "pay_abc",
      status: "pending",
    });
    const payments = createFakeLocalApi<Payment>();
    payments.rows.push({
      id: 1,
      providerPaymentRef: "pay_abc",
      status: "pending",
    });
    const provider = createFakeProvider({
      kind: "payment.updated",
      providerPaymentRef: "pay_abc",
      status: "succeeded",
    });
    const app = buildApp(provider, {
      webhookEvents: createFakeLocalApi<WebhookEvent>(),
      orders,
      payments,
    });

    await app.request("/webhook", { method: "POST", body: "{}" });
    expect(payments.rows[0]?.status).toBe("succeeded");
    expect(orders.rows[0]?.status).toBe("paid");
  });

  it("still returns 200 (and doesn't throw) if a dispatch handler errors", async () => {
    const orders = createFakeLocalApi<Order>();
    orders.update = async () => {
      throw new Error("boom");
    };
    orders.rows.push({
      id: 1,
      providerOrderRef: "order_abc",
      providerPaymentRef: "pay_abc",
      status: "pending",
    });
    const provider = createFakeProvider({
      kind: "order.updated",
      providerOrderRef: "order_abc",
      status: "paid",
    });
    const app = buildApp(provider, {
      webhookEvents: createFakeLocalApi<WebhookEvent>(),
      orders,
      payments: createFakeLocalApi<Payment>(),
    });

    const res = await app.request("/webhook", { method: "POST", body: "{}" });
    expect(res.status).toBe(200);
  });
});
