// Copyright (c) 2026 BowenLabs. All rights reserved.
// MIT licensed. See LICENSE in the repo root.

/**
 * Thrown by `createCheckoutHandler` on price-mismatch/inventory rejection,
 * and by `PaymentProvider` implementations on charge failure.
 * `createCheckoutHandler` catches it internally (`instanceof
 * CadmeaPaymentError`) and maps it to HTTP 402 itself — checkout/webhook
 * handlers are plain Hono routes, never mounted through
 * `@thebes/cadmus/hono`'s `mountCmsRoutes`, so there's no shared
 * error-to-status pipeline this needs to participate in.
 *
 * Deliberately a plain `Error` subclass, not a `CadmusCmsError` one — this
 * is a Cadmea-plugin-owned error, not a Cadmus-primitive one (every real
 * `CadmusError` subclass is owned by a `packages/cadmus/src/<primitive>/`
 * folder; a payment error belongs to a plugin, not a primitive), and
 * `CadmusCmsError` is only reachable via the root `@thebes/cadmus` package
 * export (not `@thebes/cadmus/cms`) — importing that root barrel here
 * would pull in every other primitive's runtime code (including
 * Workers-only modules like `cloudflare:email`) just for one base class.
 * Keeping this plugin-local and dependency-free is the honest shape.
 */
export class CadmeaPaymentError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "CadmeaPaymentError";
  }
}
