// Copyright (c) 2026 BowenLabs. All rights reserved.
// Cadmus is MIT licensed. See LICENSE in the repo root.

import { Hono } from "hono";
import type { ClientErrorStatusCode } from "hono/utils/http-status";
import type { LocalApi } from "../cms/index.js";
import { CadmusCmsError } from "../errors.js";

export interface CmsRoutesOptions {
  // biome-ignore lint/suspicious/noExplicitAny: see above
  collections: Record<string, LocalApi<any>>;
}

// Coupled to the exact message strings localApi.ts's notFound() and
// wrapWriteError() author — both files are Cadmus-internal, so this is
// matching a contract we control, not arbitrary third-party text. The
// honest long-term fix is a status/discriminated-code field on
// CadmusCmsError; flagged as a follow-up, not built here (it would
// ripple across every existing primitive error).
function statusForError(error: CadmusCmsError): ClientErrorStatusCode {
  if (error.message.includes("document found with id")) return 404;
  if (error.message.includes("Unique constraint violated")) return 409;
  return 400;
}

function getApi(
  collections: CmsRoutesOptions["collections"],
  slug: string,
  // biome-ignore lint/suspicious/noExplicitAny: see CmsRoutesOptions
): LocalApi<any> {
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
export function mountCmsRoutes(app: Hono, options: CmsRoutesOptions): Hono {
  const router = new Hono();

  router.onError((error, c) => {
    if (error instanceof CadmusCmsError) {
      return c.json({ error: error.message }, statusForError(error));
    }
    throw error;
  });

  router.get("/:collection", async (c) => {
    const api = getApi(options.collections, c.req.param("collection"));
    return c.json(await api.find());
  });

  router.get("/:collection/:id", async (c) => {
    const api = getApi(options.collections, c.req.param("collection"));
    return c.json(await api.findByID(Number(c.req.param("id"))));
  });

  router.post("/:collection", async (c) => {
    const api = getApi(options.collections, c.req.param("collection"));
    return c.json(await api.create(await c.req.json()), 201);
  });

  router.patch("/:collection/:id", async (c) => {
    const api = getApi(options.collections, c.req.param("collection"));
    const id = Number(c.req.param("id"));
    return c.json(await api.update(id, await c.req.json()));
  });

  router.delete("/:collection/:id", async (c) => {
    const api = getApi(options.collections, c.req.param("collection"));
    return c.json(await api.deleteByID(Number(c.req.param("id"))));
  });

  app.route("/api", router);
  return app;
}
