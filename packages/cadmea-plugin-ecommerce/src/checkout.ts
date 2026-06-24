// Copyright (c) 2026 BowenLabs. All rights reserved.
// MIT licensed. See LICENSE in the repo root.

import type { LocalApi } from "@thebes/cadmus/cms";
import { checkRateLimit } from "@thebes/cadmus/rate-limit";
import type { Context } from "hono";
import { CadmeaPaymentError } from "./errors.js";
import type { CartLineItem, PaymentProvider } from "./types.js";

// biome-ignore lint/suspicious/noExplicitAny: LocalApi's table generic is erased at this call boundary — same pattern as @thebes/cadmus/hono's CmsRoutesOptions
type AnyLocalApi<TContext> = LocalApi<any, TContext>;

export interface CheckoutRequestBody {
  lineItems: CartLineItem[];
  paymentSourceToken: string;
  customerEmail?: string;
  idempotencyKey: string;
  shippingAddress?: Record<string, string | undefined>;
  metadata?: Record<string, string>;
}

export interface CheckoutHandlerOptions<TContext> {
  provider: PaymentProvider;
  orders: AnyLocalApi<TContext>;
  payments: AnyLocalApi<TContext>;
  /**
   * Resolves the per-request access context passed to `orders`/`payments`
   * — called once per request, the same shape and timing as
   * `@thebes/cadmus/hono`'s `mountCmsRoutes`'s own `resolveContext`. This
   * is a real customer-initiated HTTP request (unlike a `CollectionHooks`
   * hook), so a real per-request context is available here, not a fixed
   * trusted value.
   */
  resolveContext: (c: Context) => Promise<TContext> | TContext;
  rateLimit?: {
    kv: KVNamespace;
    limit: number;
    windowSeconds: number;
    /** Default: "checkout". */
    keyPrefix?: string;
  };
}

function subtotalCents(lineItems: CartLineItem[]): number {
  return lineItems.reduce(
    (sum, item) => sum + item.clientUnitPrice.amount * item.quantity,
    0,
  );
}

function generateOrderNumber(): string {
  return `ORD-${crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
}

/**
 * Returns a Hono handler implementing the checkout flow against a
 * `PaymentProvider`: rate limit → re-verify cart prices/availability
 * (never trust client-submitted prices) → idempotent customer find-or-
 * create → charge → persist `orders`/`payments` rows. A DB-write failure
 * *after* a successful charge degrades to a 200-with-warning response,
 * never a false "payment failed" — the customer's card was actually
 * charged, telling them otherwise would be worse than a delayed manual
 * reconciliation.
 *
 * Mount it as a plain Hono route alongside `mountCmsRoutes` — checkout
 * isn't part of the generic CMS REST surface that function mounts.
 *
 * ```ts
 * app.post("/api/checkout", createCheckoutHandler({ provider, orders, payments, resolveContext }));
 * ```
 */
export function createCheckoutHandler<TContext>(
  options: CheckoutHandlerOptions<TContext>,
) {
  return async (c: Context): Promise<Response> => {
    if (options.rateLimit) {
      const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
      const key = `${options.rateLimit.keyPrefix ?? "checkout"}:${ip}`;
      const result = await checkRateLimit(
        options.rateLimit.kv,
        key,
        options.rateLimit.limit,
        options.rateLimit.windowSeconds,
      );
      if (!result.allowed) {
        return c.json({ error: "Rate limit exceeded" }, 429);
      }
    }

    const body = await c.req.json<CheckoutRequestBody>();
    // Malformed-request checks return 400 directly, not via
    // CadmeaPaymentError — that class is reserved for "the request was
    // well-formed but the checkout itself can't proceed" (price/inventory
    // rejections, charge failure below), which this function maps to 402.
    if (!Array.isArray(body.lineItems) || body.lineItems.length === 0) {
      return c.json(
        { error: "Checkout request must include at least one line item" },
        400,
      );
    }
    if (!body.idempotencyKey) {
      return c.json(
        { error: "Checkout request must include an idempotencyKey" },
        400,
      );
    }

    try {
      // Re-verify every line item's price/availability against the live
      // catalog — the client-submitted price is never trusted as-is.
      const refs = body.lineItems.map((item) => item.catalogRef);
      const priceChecks = await options.provider.checkCatalogPrices(refs);
      const checkByRef = new Map(
        priceChecks.map((check) => [check.catalogRef, check]),
      );
      for (const item of body.lineItems) {
        const check = checkByRef.get(item.catalogRef);
        if (!check) {
          throw new CadmeaPaymentError(
            `Unknown catalog item "${item.catalogRef}"`,
          );
        }
        if (check.serverUnitPrice.amount !== item.clientUnitPrice.amount) {
          throw new CadmeaPaymentError(
            `Price mismatch for "${item.catalogRef}" — checkout rejected`,
          );
        }
        if (
          check.availableQuantity !== undefined &&
          check.availableQuantity < item.quantity
        ) {
          throw new CadmeaPaymentError(
            `Insufficient inventory for "${item.catalogRef}"`,
          );
        }
      }
    } catch (error) {
      if (error instanceof CadmeaPaymentError) {
        return c.json({ error: error.message }, 402);
      }
      throw error;
    }

    if (body.customerEmail) {
      // Idempotent find-or-create — result isn't used directly below
      // (the provider's own checkout() call resolves the customer again
      // internally via paymentSourceToken/customerEmail), but calling it
      // here ensures a customer record exists in the provider before the
      // charge, matching the reference Square plugin's own step ordering.
      await options.provider.findOrCreateCustomer(
        body.customerEmail,
        body.idempotencyKey,
      );
    }

    const result = await options.provider.checkout({
      lineItems: body.lineItems,
      paymentSourceToken: body.paymentSourceToken,
      customerEmail: body.customerEmail,
      idempotencyKey: body.idempotencyKey,
      metadata: body.metadata,
    });

    const context = await options.resolveContext(c);
    const orderData = {
      orderNumber: generateOrderNumber(),
      status: result.status === "succeeded" ? "paid" : "pending",
      totalCents: result.amount.amount,
      subtotalCents: subtotalCents(body.lineItems),
      currency: result.amount.currency,
      provider: options.provider.name,
      providerOrderRef: result.providerOrderRef,
      providerPaymentRef: result.providerPaymentRef,
      guestEmail: body.customerEmail,
      lineItems: body.lineItems.map((item) => ({
        productName: item.catalogRef,
        quantity: item.quantity,
        unitPriceCents: item.clientUnitPrice.amount,
        totalPriceCents: item.clientUnitPrice.amount * item.quantity,
        catalogRef: item.catalogRef,
      })),
      shippingAddress: body.shippingAddress,
    };

    try {
      const order = await options.orders.create(context, orderData);
      await options.payments.create(context, {
        provider: options.provider.name,
        providerPaymentRef: result.providerPaymentRef,
        providerOrderRef: result.providerOrderRef,
        order: order.id,
        status: result.status,
        amountCents: result.amount.amount,
        currency: result.amount.currency,
        rawResponse: result.raw,
      });
      return c.json({ order }, 201);
    } catch (cause) {
      // The charge already succeeded — never report it as failed because
      // our own record-keeping write failed afterwards.
      return c.json(
        {
          warning:
            "Payment succeeded but order record-keeping failed — contact support",
          providerPaymentRef: result.providerPaymentRef,
          providerOrderRef: result.providerOrderRef,
          cause: cause instanceof Error ? cause.message : String(cause),
        },
        200,
      );
    }
  };
}
