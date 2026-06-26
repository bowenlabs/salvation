# @thebes/cadmea-plugin-printful

Printful `FulfillmentProvider` for [`@thebes/cadmea-plugin-ecommerce`](../cadmea-plugin-ecommerce) — raw `fetch()` + `crypto.subtle`, no Printful Node SDK.

## Usage

```ts
import { createWebhookHandler } from "@thebes/cadmea-plugin-ecommerce";
import { createPrintfulProvider } from "@thebes/cadmea-plugin-printful";
import { createFulfillmentOrder } from "@thebes/cadmea-plugin-ecommerce";

const printful = createPrintfulProvider({ apiKey: env.PRINTFUL_API_KEY });

app.post(
  "/api/webhooks/stripe",
  createWebhookHandler({
    provider: stripeProvider,
    orders,
    payments,
    webhookEvents,
    secret: env.STRIPE_WEBHOOK_SECRET,
    context,
    onOrderPaid: (order) =>
      createFulfillmentOrder(order, { provider: printful, orders, context }),
  }),
);
```

```ts
import { createFulfillmentWebhookHandler } from "@thebes/cadmea-plugin-ecommerce";

app.post(
  "/api/webhooks/printful",
  createFulfillmentWebhookHandler({
    provider: printful,
    orders,
    webhookEvents,
    secret: env.PRINTFUL_WEBHOOKS_SECRET,
    context,
  }),
);
```

## `catalogRef` format

A Printful order line needs both a catalog variant id and a file id; `FulfillmentLineItem.catalogRef` is a single opaque string, so this provider expects it in `"{catalogVariantId}:{fileId}"` form — set directly on each `products` variant's `catalogRef` field once the print file has been uploaded to Printful. See `provider.ts`'s top-of-file note for the reasoning and what a future real catalog-sync collection would replace this with.
