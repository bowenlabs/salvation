// Copyright (c) 2026 BowenLabs. All rights reserved.
// MIT licensed. See LICENSE in the repo root.

import type { LocalApi } from "@thebes/cadmus/cms";
import type { Context } from "hono";
import type {
  FulfillmentProvider,
  NormalizedFulfillmentWebhookEvent,
} from "./types.js";

// biome-ignore lint/suspicious/noExplicitAny: see checkout.ts's identical note
type AnyLocalApi<TContext> = LocalApi<any, TContext>;

export interface CreateFulfillmentOrderOptions<TContext> {
  provider: FulfillmentProvider;
  orders: AnyLocalApi<TContext>;
  context: TContext;
}

/**
 * The order-paid hook implementation: submits an already-paid order's line
 * items to a `FulfillmentProvider` and persists the resulting
 * `fulfillmentProvider`/`fulfillmentProviderRef`/`fulfillmentStatus` back
 * onto the order row. Wire it as `WebhookHandlerOptions.onOrderPaid` on the
 * *payment* provider's webhook handler:
 *
 * ```ts
 * createWebhookHandler({
 *   provider: stripeProvider,
 *   orders, payments, webhookEvents, secret, context,
 *   onOrderPaid: (order) =>
 *     createFulfillmentOrder(order, { provider: printfulProvider, orders, context }),
 * });
 * ```
 *
 * Digital-goods-only stores simply never wire this — `fulfillmentProvider`
 * is plugin-optional, not a hard dependency of `ecommercePlugin`.
 */
export async function createFulfillmentOrder<TContext>(
  order: Record<string, unknown>,
  options: CreateFulfillmentOrderOptions<TContext>,
): Promise<void> {
  const lineItems = (order.lineItems ?? []) as Array<{
    catalogRef?: string;
    quantity: number;
  }>;
  const shippingAddress =
    (order.shippingAddress as Record<string, string | undefined>) ?? {};

  const result = await options.provider.createFulfillmentOrder({
    orderId: order.id as number,
    lineItems: lineItems
      .filter((item): item is { catalogRef: string; quantity: number } =>
        Boolean(item.catalogRef),
      )
      .map((item) => ({
        catalogRef: item.catalogRef,
        quantity: item.quantity,
      })),
    shippingAddress,
    customerEmail: order.guestEmail as string | undefined,
  });

  await options.orders.update(options.context, order.id as number, {
    fulfillmentProvider: options.provider.name,
    fulfillmentProviderRef: result.providerFulfillmentRef,
    fulfillmentStatus: result.status,
  });
}

export interface FulfillmentWebhookHandlerOptions<TContext> {
  provider: FulfillmentProvider;
  orders: AnyLocalApi<TContext>;
  webhookEvents: AnyLocalApi<TContext>;
  secret: string;
  /** See `WebhookHandlerOptions.context`'s identical note in webhook.ts. */
  context: TContext;
}

async function findOrderByFulfillmentRef<TContext>(
  orders: AnyLocalApi<TContext>,
  context: TContext,
  providerFulfillmentRef: string,
): Promise<Record<string, unknown> | undefined> {
  // Same in-memory-filter tradeoff as webhook.ts's findOneByField — revisit
  // with an indexed lookup only once volume makes it a measured problem.
  const rows = (await orders.find(context)) as Array<Record<string, unknown>>;
  return rows.find(
    (row) => row.fulfillmentProviderRef === providerFulfillmentRef,
  );
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.includes("Unique constraint violated")
  );
}

async function dispatchFulfillmentEvent<TContext>(
  event: NormalizedFulfillmentWebhookEvent,
  options: FulfillmentWebhookHandlerOptions<TContext>,
): Promise<void> {
  if (event.kind === "unhandled") return;

  const order = await findOrderByFulfillmentRef(
    options.orders,
    options.context,
    event.providerFulfillmentRef,
  );
  if (!order) return;

  await options.orders.update(options.context, order.id as number, {
    fulfillmentStatus: event.status,
    trackingNumber: event.trackingNumber,
    trackingCarrier: event.trackingCarrier,
    trackingUrl: event.trackingUrl,
  });
}

/**
 * Returns a Hono handler implementing inbound fulfillment-webhook handling
 * (shipment created/delivered/failed) against a `FulfillmentProvider` —
 * verify signature → dedup via `webhook_events` (shared with the payment
 * webhook handler; `eventId` is provider-specific so cross-provider
 * collisions aren't a concern) → look up the order by
 * `fulfillmentProviderRef` → update shipment status/tracking. Mirrors
 * `createWebhookHandler`'s structure exactly; kept as a separate function
 * rather than a generic merge of the two because the payment and
 * fulfillment event vocabularies, dedup keys, and target collections don't
 * overlap enough to share logic without branching on provider kind.
 */
export function createFulfillmentWebhookHandler<TContext>(
  options: FulfillmentWebhookHandlerOptions<TContext>,
) {
  return async (c: Context): Promise<Response> => {
    const rawBody = await c.req.text();

    const verified = await options.provider.verifyWebhookSignature({
      rawBody,
      headers: c.req.raw.headers,
      secret: options.secret,
    });
    if (!verified) {
      return c.json({ error: "Invalid signature" }, 401);
    }

    const { eventId, event } = options.provider.parseWebhookEvent(rawBody);

    try {
      await options.webhookEvents.create(options.context, {
        provider: options.provider.name,
        eventId,
        eventType: event.kind,
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return c.json({ ok: true, duplicate: true }, 200);
      }
      throw error;
    }

    try {
      await dispatchFulfillmentEvent(event, options);
    } catch (error) {
      console.error(
        "[cadmea-plugin-ecommerce] fulfillment webhook dispatch failed",
        error,
      );
    }

    return c.json({ ok: true }, 200);
  };
}
