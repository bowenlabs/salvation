// Copyright (c) 2026 BowenLabs. All rights reserved.
// Cadmus is MIT licensed. See LICENSE in the repo root.

import type { Context } from "hono";
import { Hono } from "hono";
import type { ClientErrorStatusCode } from "hono/utils/http-status";
import type { LocalApi } from "../cms/index.js";
import { CadmusAccessDeniedError, CadmusCmsError } from "../errors.js";

export interface CmsRoutesOptions<TContext> {
  // biome-ignore lint/suspicious/noExplicitAny: see above
  collections: Record<string, LocalApi<any, TContext>>;
  /**
   * Resolves the per-request access context passed as the first argument
   * to every Local API call below — called once per request, not once per
   * collection method, so e.g. a session lookup only happens once even
   * though a write touches `create` and its `afterChange` hooks. Cadmus
   * doesn't standardize the context shape (see LocalApi's `TContext`) —
   * the caller's `resolveContext` is the one place that decides it, the
   * same way Cadmea's server functions each call `requireAuthOrThrow()`
   * themselves today.
   */
  resolveContext: (c: Context) => Promise<TContext>;
}

// Coupled to the exact message strings localApi.ts's notFound() and
// wrapWriteError() author — both files are Cadmus-internal, so this is
// matching a contract we control, not arbitrary third-party text. The
// honest long-term fix is a status/discriminated-code field on
// CadmusCmsError; flagged as a follow-up, not built here (it would
// ripple across every existing primitive error).
function statusForError(error: CadmusCmsError): ClientErrorStatusCode {
  if (error instanceof CadmusAccessDeniedError) return 403;
  if (error.message.includes("document found with id")) return 404;
  if (error.message.includes("Unique constraint violated")) return 409;
  return 400;
}

function getApi<TContext>(
  collections: CmsRoutesOptions<TContext>["collections"],
  slug: string,
  // biome-ignore lint/suspicious/noExplicitAny: see CmsRoutesOptions
): LocalApi<any, TContext> {
  const api = collections[slug];
  if (!api) throw new CadmusCmsError(`Unknown collection "${slug}"`);
  return api;
}

// Mounts a Payload-equivalent REST surface at /api:
//   GET    /api/:collection
//   GET    /api/:collection/:id
//   POST   /api/:collection
//   PATCH  /api/:collection/:id
//   DELETE /api/:collection/:id
export function mountCmsRoutes<TContext>(
  app: Hono,
  options: CmsRoutesOptions<TContext>,
): Hono {
  const router = new Hono();

  router.onError((error, c) => {
    if (error instanceof CadmusCmsError) {
      return c.json({ error: error.message }, statusForError(error));
    }
    throw error;
  });

  // `resolveContext` runs once per request, before any Local API call —
  // every route below shares the one resolved context across its method
  // call and that method's own hooks (e.g. create()'s afterChange).
  router.get("/:collection", async (c) => {
    const api = getApi(options.collections, c.req.param("collection"));
    const context = await options.resolveContext(c);
    return c.json(await api.find(context));
  });

  router.get("/:collection/:id", async (c) => {
    const api = getApi(options.collections, c.req.param("collection"));
    const context = await options.resolveContext(c);
    return c.json(await api.findByID(context, Number(c.req.param("id"))));
  });

  router.post("/:collection", async (c) => {
    const api = getApi(options.collections, c.req.param("collection"));
    const context = await options.resolveContext(c);
    return c.json(await api.create(context, await c.req.json()), 201);
  });

  router.patch("/:collection/:id", async (c) => {
    const api = getApi(options.collections, c.req.param("collection"));
    const context = await options.resolveContext(c);
    const id = Number(c.req.param("id"));
    return c.json(await api.update(context, id, await c.req.json()));
  });

  router.delete("/:collection/:id", async (c) => {
    const api = getApi(options.collections, c.req.param("collection"));
    const context = await options.resolveContext(c);
    return c.json(await api.deleteByID(context, Number(c.req.param("id"))));
  });

  app.route("/api", router);
  return app;
}
