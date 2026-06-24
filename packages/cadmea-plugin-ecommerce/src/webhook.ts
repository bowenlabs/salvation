// Copyright (c) 2026 BowenLabs. All rights reserved.
// MIT licensed. See LICENSE in the repo root.

import type { LocalApi } from "@thebes/cadmus/cms";
import type { Context } from "hono";
import type { NormalizedWebhookEvent, PaymentProvider } from "./types.js";

// biome-ignore lint/suspicious/noExplicitAny: see checkout.ts's identical note
type AnyLocalApi<TContext> = LocalApi<any, TContext>;

export interface WebhookHandlerOptions<TContext> {
  provider: PaymentProvider;
  webhookEvents: AnyLocalApi<TContext>;
  orders: AnyLocalApi<TContext>;
  payments: AnyLocalApi<TContext>;
  /** Only needed if `provider.subscriptions` is wired and the consumer included the optional `subscriptions` collection. */
  subscriptions?: AnyLocalApi<TContext>;
  secret: string;
  /** Some providers (Square) sign over the full notification URL. */
  notificationUrl?: string;
  /**
   * Webhooks are server-to-server calls with no real user session behind
   * them — same reasoning as `@thebes/cadmea-plugin-crm`'s
   * `createContactUpsertHook`'s `context` option. Pass whatever trusted
   * context value the `orders`/`payments`/`webhookEvents` collections'
   * own `access` config accepts for system-level writes.
   */
  context: TContext;
}

// Matches the exact message text `localApi.ts`'s `wrapWriteError` authors
// for a unique-constraint failure — Cadmus-internal, a contract this
// plugin controls indirectly (same precedent as `@thebes/cadmus/hono`'s
// `mountCmsRoutes`'s own `statusForError`, which matches the same way
// rather than importing `CadmusCmsError` from the root `@thebes/cadmus`
// package — see errors.ts's doc comment for why that root import is
// avoided here).
function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.includes("Unique constraint violated")
  );
}

async function findOneByField<TContext>(
  api: AnyLocalApi<TContext>,
  context: TContext,
  field: string,
  value: string,
): Promise<Record<string, unknown> | undefined> {
  // In-memory filter after a plain find() rather than a `where`-filtered
  // query — the same "don't build for scale you don't have" tradeoff
  // `cadmea-plugin-redirects`/`cadmea-plugin-crm` make elsewhere. Revisit
  // with an indexed lookup if a high-volume store's orders/payments
  // tables make this a measured problem, not a theoretical one.
  const rows = (await api.find(context)) as Array<Record<string, unknown>>;
  return rows.find((row) => row[field] === value);
}

async function dispatchEvent<TContext>(
  event: NormalizedWebhookEvent,
  options: WebhookHandlerOptions<TContext>,
): Promise<void> {
  switch (event.kind) {
    case "payment.updated": {
      const payment = await findOneByField(
        options.payments,
        options.context,
        "providerPaymentRef",
        event.providerPaymentRef,
      );
      if (payment) {
        await options.payments.update(options.context, payment.id as number, {
          status: event.status,
        });
      }
      const order = await findOneByField(
        options.orders,
        options.context,
        "providerPaymentRef",
        event.providerPaymentRef,
      );
      if (order) {
        const status =
          event.status === "succeeded"
            ? "paid"
            : event.status === "refunded"
              ? "refunded"
              : "failed";
        await options.orders.update(options.context, order.id as number, {
          status,
        });
      }
      return;
    }
    case "order.updated": {
      const order = await findOneByField(
        options.orders,
        options.context,
        "providerOrderRef",
        event.providerOrderRef,
      );
      if (order) {
        await options.orders.update(options.context, order.id as number, {
          status: event.status,
        });
      }
      return;
    }
    case "subscription.updated": {
      if (!options.subscriptions) return;
      const subscription = await findOneByField(
        options.subscriptions,
        options.context,
        "providerSubscriptionRef",
        event.providerSubscriptionRef,
      );
      if (subscription) {
        await options.subscriptions.update(
          options.context,
          subscription.id as number,
          { status: event.status },
        );
      }
      return;
    }
    case "unhandled":
      return;
  }
}

/**
 * Returns a Hono handler implementing inbound webhook handling against a
 * `PaymentProvider`: verify signature (raw body, before any parsing) →
 * dedup via the `webhook_events` collection's unique `eventId` constraint
 * → dispatch by normalized event kind. Each step isolated so a handler bug
 * never prevents the 200 response a provider needs to stop retrying — the
 * dedup write IS the source of truth for "already processed," checked
 * before dispatch, not after.
 *
 * Mount alongside `mountCmsRoutes`, same as `createCheckoutHandler` — not
 * part of the generic CMS REST surface.
 */
export function createWebhookHandler<TContext>(
  options: WebhookHandlerOptions<TContext>,
) {
  return async (c: Context): Promise<Response> => {
    // Read raw body as text *before* any JSON parsing — signature is
    // computed over raw bytes, matching @thebes/cadmus/cms's own
    // outbound webhooks.ts HMAC idiom.
    const rawBody = await c.req.text();

    const verified = await options.provider.verifyWebhookSignature({
      rawBody,
      headers: c.req.raw.headers,
      secret: options.secret,
      notificationUrl: options.notificationUrl,
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
        // Already processed — the unique constraint is the actual guard,
        // not a preceding find() (avoids a TOCTOU window on concurrent
        // delivery of the same event).
        return c.json({ ok: true, duplicate: true }, 200);
      }
      throw error;
    }

    try {
      await dispatchEvent(event, options);
    } catch (error) {
      // A dispatch-handler bug must not cause the provider to retry the
      // whole event (it's already recorded as processed above) — log and
      // move on, same "each handler isolated" precedent the reference
      // Square plugin's own webhook.ts follows.
      console.error("[cadmea-plugin-ecommerce] webhook dispatch failed", error);
    }

    return c.json({ ok: true }, 200);
  };
}
