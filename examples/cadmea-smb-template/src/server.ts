// The backend half of this example: one Cloudflare Worker mounting the
// generic CMS REST API (mountCmsRoutes) alongside the ecommerce plugin's
// checkout/webhook routes — wired to Square here, with a one-line note on
// swapping to Stripe (see `paymentProvider` below). The frontend half
// (src/pages/shop/[slug].astro) talks to this Worker's /api/*, /checkout,
// and /webhook routes from the browser.
//
// Wiring pattern mirrors app/core/lib/cms-api.ts's mountPublicCmsApi
// exactly: D1/KV bindings only exist on a request's `c.env`, not at
// module scope, so every binding-dependent route is built fresh per
// request inside a middleware/handler — a throwaway Hono sub-app is
// mounted and the request handed to it directly, rather than teaching
// mountCmsRoutes/createCheckoutHandler/createWebhookHandler to rebuild
// their own dependencies per call.

import {
  createCheckoutHandler,
  createWebhookHandler,
} from "@thebes/cadmea-plugin-ecommerce";
import { createSquarePaymentProvider } from "@thebes/cadmea-plugin-ecommerce-square";
// To use Stripe instead, swap this one import + the one call below:
// import { createStripePaymentProvider } from "@thebes/cadmea-plugin-ecommerce-stripe";
import { collectionToTable, createLocalApi } from "@thebes/cadmus/cms";
import { db } from "@thebes/cadmus/db";
import { mountCmsRoutes } from "@thebes/cadmus/hono";
import { Hono } from "hono";
import { type AccessContext, cmsConfig, registry } from "../cadmea.config.js";

interface Env {
  DB: D1Database;
  KV: KVNamespace;
  SQUARE_ACCESS_TOKEN: string;
  SQUARE_LOCATION_ID: string;
  SQUARE_WEBHOOK_SECRET: string;
  SQUARE_WEBHOOK_URL: string;
}

function buildLocalApis(env: Env) {
  const database = db(env.DB, {});
  const apis: Record<string, ReturnType<typeof createLocalApi>> = {};
  for (const collection of cmsConfig.collections) {
    const table = collectionToTable(collection);
    registry.tables[collection.slug] = table;
    registry.configs[collection.slug] = collection;
    apis[collection.slug] = createLocalApi(
      database,
      table,
      collection,
      registry,
    );
  }
  // Populated only after every createLocalApi call above returns — see
  // CmsRegistry's doc comment (@thebes/cadmus/cms) for why this order is
  // required for the crmPlugin's cross-collection upsert hook to work.
  registry.apis = apis;
  return apis;
}

function buildPaymentProvider(env: Env) {
  return createSquarePaymentProvider({
    accessToken: env.SQUARE_ACCESS_TOKEN,
    locationId: env.SQUARE_LOCATION_ID,
    environment: "sandbox",
  });
}

const resolveContext = async (): Promise<AccessContext> => ({
  session: null,
  internal: true,
});

const app = new Hono<{ Bindings: Env }>();

app.use("/api/*", async (c) => {
  const cmsApp = new Hono();
  mountCmsRoutes(cmsApp, {
    collections: buildLocalApis(c.env),
    resolveContext,
  });
  return cmsApp.fetch(c.req.raw, c.env, c.executionCtx);
});

app.post("/checkout", async (c) => {
  const apis = buildLocalApis(c.env);
  const handler = createCheckoutHandler({
    provider: buildPaymentProvider(c.env),
    orders: apis.orders,
    payments: apis.payments,
    resolveContext,
    rateLimit: { kv: c.env.KV, limit: 10, windowSeconds: 60 },
  });
  return handler(c);
});

app.post("/webhook", async (c) => {
  const apis = buildLocalApis(c.env);
  const handler = createWebhookHandler({
    provider: buildPaymentProvider(c.env),
    webhookEvents: apis.webhook_events,
    orders: apis.orders,
    payments: apis.payments,
    secret: c.env.SQUARE_WEBHOOK_SECRET,
    notificationUrl: c.env.SQUARE_WEBHOOK_URL,
    context: { session: null, internal: true },
  });
  return handler(c);
});

export default app;
