// Copyright (c) 2026 BowenLabs. All rights reserved.
// MIT licensed. See LICENSE in the repo root.

import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { createCheckoutHandler } from "./checkout.js";
import type {
  CatalogPriceCheck,
  CheckoutRequest,
  CheckoutResult,
  PaymentProvider,
} from "./types.js";

function createFakeLocalApi<TRow extends { id: number }>() {
  const rows: TRow[] = [];
  let nextId = 1;
  return {
    rows,
    async find(_context: unknown) {
      return rows;
    },
    async create(_context: unknown, input: Omit<TRow, "id">) {
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

interface Order {
  id: number;
  orderNumber: string;
  status: string;
  providerPaymentRef: string;
}

interface Payment {
  id: number;
  providerPaymentRef: string;
}

function createFakeProvider(
  overrides: Partial<PaymentProvider> = {},
): PaymentProvider {
  return {
    name: "square",
    async checkCatalogPrices(refs: string[]): Promise<CatalogPriceCheck[]> {
      return refs.map((catalogRef) => ({
        catalogRef,
        serverUnitPrice: { amount: 500, currency: "USD" },
        availableQuantity: 10,
      }));
    },
    async findOrCreateCustomer() {
      return "cust_123";
    },
    async checkout(_request: CheckoutRequest): Promise<CheckoutResult> {
      return {
        providerOrderRef: "order_abc",
        providerPaymentRef: "pay_abc",
        status: "succeeded",
        amount: { amount: 500, currency: "USD" },
        raw: { id: "pay_abc" },
      };
    },
    async verifyWebhookSignature() {
      return true;
    },
    parseWebhookEvent() {
      return { eventId: "evt_1", event: { kind: "unhandled", rawType: "x" } };
    },
    ...overrides,
  };
}

function buildApp(
  provider: PaymentProvider,
  orders: ReturnType<typeof createFakeLocalApi<Order>>,
  payments: ReturnType<typeof createFakeLocalApi<Payment>>,
) {
  const app = new Hono();
  app.post(
    "/checkout",
    createCheckoutHandler({
      provider,
      // biome-ignore lint/suspicious/noExplicitAny: fakes satisfy LocalApi's call shape
      orders: orders as any,
      // biome-ignore lint/suspicious/noExplicitAny: fakes satisfy LocalApi's call shape
      payments: payments as any,
      resolveContext: async () => undefined,
    }),
  );
  return app;
}

const validRequest = {
  lineItems: [
    {
      catalogRef: "sku-1",
      quantity: 2,
      clientUnitPrice: { amount: 500, currency: "USD" },
    },
  ],
  paymentSourceToken: "tok_abc",
  customerEmail: "buyer@example.com",
  idempotencyKey: "idem-1",
};

describe("createCheckoutHandler", () => {
  it("creates an order and a payment record on a successful charge", async () => {
    const orders = createFakeLocalApi<Order>();
    const payments = createFakeLocalApi<Payment>();
    const app = buildApp(createFakeProvider(), orders, payments);

    const res = await app.request("/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validRequest),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { order: { status: string } };
    expect(body.order.status).toBe("paid");
    expect(orders.rows).toHaveLength(1);
    expect(payments.rows).toHaveLength(1);
    expect(payments.rows[0]?.providerPaymentRef).toBe("pay_abc");
  });

  it("rejects when a line item's price doesn't match the live catalog", async () => {
    const provider = createFakeProvider({
      async checkCatalogPrices(refs) {
        return refs.map((catalogRef) => ({
          catalogRef,
          serverUnitPrice: { amount: 999, currency: "USD" },
        }));
      },
    });
    const app = buildApp(
      provider,
      createFakeLocalApi<Order>(),
      createFakeLocalApi<Payment>(),
    );

    const res = await app.request("/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validRequest),
    });

    expect(res.status).toBe(402);
  });

  it("rejects when requested quantity exceeds available inventory", async () => {
    const provider = createFakeProvider({
      async checkCatalogPrices(refs) {
        return refs.map((catalogRef) => ({
          catalogRef,
          serverUnitPrice: { amount: 500, currency: "USD" },
          availableQuantity: 1,
        }));
      },
    });
    const app = buildApp(
      provider,
      createFakeLocalApi<Order>(),
      createFakeLocalApi<Payment>(),
    );

    const res = await app.request("/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validRequest),
    });

    expect(res.status).toBe(402);
  });

  it("rejects a request with no line items", async () => {
    const app = buildApp(
      createFakeProvider(),
      createFakeLocalApi<Order>(),
      createFakeLocalApi<Payment>(),
    );
    const res = await app.request("/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...validRequest, lineItems: [] }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects a request with no idempotencyKey", async () => {
    const app = buildApp(
      createFakeProvider(),
      createFakeLocalApi<Order>(),
      createFakeLocalApi<Payment>(),
    );
    const { idempotencyKey, ...rest } = validRequest;
    const res = await app.request("/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rest),
    });
    expect(res.status).toBe(400);
  });

  it("returns a 200-with-warning (not an error) when the order write fails after a successful charge", async () => {
    const orders = createFakeLocalApi<Order>();
    orders.create = async () => {
      throw new Error("db write failed");
    };
    const app = buildApp(
      createFakeProvider(),
      orders,
      createFakeLocalApi<Payment>(),
    );

    const res = await app.request("/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validRequest),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.warning).toBeDefined();
    expect(body.providerPaymentRef).toBe("pay_abc");
  });
});
