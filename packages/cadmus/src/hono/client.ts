// Copyright (c) 2026 BowenLabs. All rights reserved.
// Cadmus is MIT licensed. See LICENSE in the repo root.

import { CadmusApiError } from "../errors.js";

export interface CmsApiClientOptions {
  /**
   * Returns the value sent verbatim as the request's `Authorization`
   * header, or `undefined`/`""` to send no `Authorization` header at all.
   * This is the client's *only* auth surface — it never generates, stores,
   * refreshes, or validates a token itself. A bearer token, an OAuth2
   * access token obtained elsewhere, a shared service key — all the
   * caller's problem. No OAuth flow lives here; see EXTENDING.md's
   * provider-interface note if a real OAuth client flow is ever needed —
   * that's separate scope, not an extension of this option.
   */
  getAuthHeader?: () => string | undefined | Promise<string | undefined>;
}

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function errorMessage(body: unknown, status: number): string {
  if (body && typeof body === "object" && "error" in body) {
    const error = (body as { error: unknown }).error;
    if (typeof error === "string") return error;
  }
  return `Request failed with status ${status}`;
}

/**
 * The client-side counterpart to `mountCmsRoutes` — talks to exactly the
 * REST surface that function mounts (`GET/POST/PATCH/DELETE
 * /api/:collection[...]`), via plain `fetch()`. No Node APIs, works from
 * any environment (browser, Worker, Astro SSR).
 *
 * This is for callers *outside* the Worker process that's actually running
 * the CMS — an Astro island, an external operator's own client, anything
 * that can't call a `LocalApi` in-process. In-process callers (the same
 * Worker's own server functions, Cadmea's own Panel) should keep calling
 * the `LocalApi`/Hono RPC (`hc<AppType>`) directly — this client adds a
 * network hop neither of those needs.
 */
export function createCmsApiClient(
  baseUrl: string,
  options: CmsApiClientOptions = {},
) {
  async function request(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<unknown> {
    const headers: Record<string, string> = {};
    const authHeader = await options.getAuthHeader?.();
    if (authHeader) headers.Authorization = authHeader;
    if (body !== undefined) headers["Content-Type"] = "application/json";

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/api${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (cause) {
      throw new CadmusApiError(
        `Request to "${baseUrl}/api${path}" failed`,
        0,
        cause,
      );
    }

    const parsed = await parseBody(response);
    if (!response.ok) {
      throw new CadmusApiError(
        errorMessage(parsed, response.status),
        response.status,
        parsed,
      );
    }
    return parsed;
  }

  return {
    find(collection: string): Promise<unknown[]> {
      return request("GET", `/${collection}`) as Promise<unknown[]>;
    },
    findByID(collection: string, id: number): Promise<unknown> {
      return request("GET", `/${collection}/${id}`);
    },
    search(collection: string, query: string): Promise<unknown[]> {
      return request(
        "GET",
        `/${collection}/search?q=${encodeURIComponent(query)}`,
      ) as Promise<unknown[]>;
    },
    create(
      collection: string,
      data: Record<string, unknown>,
    ): Promise<unknown> {
      return request("POST", `/${collection}`, data);
    },
    update(
      collection: string,
      id: number,
      data: Record<string, unknown>,
    ): Promise<unknown> {
      return request("PATCH", `/${collection}/${id}`, data);
    },
    delete(collection: string, id: number): Promise<unknown> {
      return request("DELETE", `/${collection}/${id}`);
    },
  };
}

export type CmsApiClient = ReturnType<typeof createCmsApiClient>;
