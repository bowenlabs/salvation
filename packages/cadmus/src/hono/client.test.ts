// Copyright (c) 2026 BowenLabs. All rights reserved.
// Cadmus is MIT licensed. See LICENSE in the repo root.

import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CadmusApiError, CadmusCmsError } from "../errors.js";
import { createCmsApiClient } from "./client.js";
import { mountCmsRoutes } from "./cms.js";

interface Widget {
  id: number;
  name: string;
}

// Mirrors cms.test.ts's fake LocalApi — kept local rather than shared so
// this file stays self-contained.
function createFakeWidgetsApi() {
  const rows: Widget[] = [
    { id: 1, name: "Alpha" },
    { id: 2, name: "Beta" },
  ];
  let nextId = 3;

  return {
    async find(_context: unknown) {
      return rows;
    },
    async findByID(_context: unknown, id: number) {
      const row = rows.find((r) => r.id === id);
      if (!row) {
        throw new CadmusCmsError(`No "widgets" document found with id ${id}`);
      }
      return row;
    },
    async create(_context: unknown, input: { name: string }) {
      if (!input.name) {
        throw new CadmusCmsError(
          'Missing required field "name" for collection "widgets"',
        );
      }
      const row = { id: nextId++, name: input.name };
      rows.push(row);
      return row;
    },
    async update(_context: unknown, id: number, input: Partial<Widget>) {
      const row = rows.find((r) => r.id === id);
      if (!row) {
        throw new CadmusCmsError(`No "widgets" document found with id ${id}`);
      }
      Object.assign(row, input);
      return row;
    },
    async deleteByID(_context: unknown, id: number) {
      const index = rows.findIndex((r) => r.id === id);
      if (index === -1) {
        throw new CadmusCmsError(`No "widgets" document found with id ${id}`);
      }
      const [row] = rows.splice(index, 1);
      return row;
    },
    async search(_context: unknown, query: string) {
      return rows.filter((row) =>
        row.name.toLowerCase().includes(query.toLowerCase()),
      );
    },
  };
}

function buildApp(widgetsApi: ReturnType<typeof createFakeWidgetsApi>) {
  return mountCmsRoutes(new Hono(), {
    // biome-ignore lint/suspicious/noExplicitAny: see cms.test.ts's identical comment
    collections: { widgets: widgetsApi as any },
    resolveContext: async () => undefined,
  });
}

describe("createCmsApiClient", () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    app = buildApp(createFakeWidgetsApi());
    // app.request() is Hono's in-memory test invocation — no real network.
    // Stubbing global fetch to delegate to it lets createCmsApiClient's own
    // `fetch()` calls exercise the exact same code path a real deployment
    // would use, without a server.
    vi.stubGlobal("fetch", (url: string, init?: RequestInit) =>
      app.request(url, init),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const client = () => createCmsApiClient("http://localhost");

  it("find() returns the full list", async () => {
    const widgets = await client().find("widgets");
    expect(widgets).toHaveLength(2);
  });

  it("findByID() returns a single record", async () => {
    const widget = await client().findByID("widgets", 1);
    expect(widget).toEqual({ id: 1, name: "Alpha" });
  });

  it("search() returns matching records", async () => {
    const results = await client().search("widgets", "alp");
    expect(results).toEqual([{ id: 1, name: "Alpha" }]);
  });

  it("create() posts the body and returns the created record", async () => {
    const created = await client().create("widgets", { name: "Gamma" });
    expect(created).toMatchObject({ name: "Gamma" });
  });

  it("update() patches the record", async () => {
    const updated = await client().update("widgets", 1, { name: "Updated" });
    expect(updated).toMatchObject({ id: 1, name: "Updated" });
  });

  it("delete() removes the record", async () => {
    const deleted = await client().delete("widgets", 2);
    expect(deleted).toMatchObject({ id: 2 });
    await expect(client().findByID("widgets", 2)).rejects.toThrow(
      CadmusApiError,
    );
  });

  it("sends the resolved Authorization header when getAuthHeader is set", async () => {
    let seenAuth: string | null = null;
    vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
      seenAuth =
        (init?.headers as Record<string, string> | undefined)?.Authorization ??
        null;
      return app.request(url, init);
    });
    await createCmsApiClient("http://localhost", {
      getAuthHeader: () => "Bearer test-token",
    }).find("widgets");
    expect(seenAuth).toBe("Bearer test-token");
  });

  it("throws CadmusApiError carrying the status and parsed body on a 404", async () => {
    await expect(client().findByID("widgets", 999)).rejects.toMatchObject({
      status: 404,
      body: { error: 'No "widgets" document found with id 999' },
    });
  });

  it("throws CadmusApiError carrying the status on a 400", async () => {
    await expect(client().create("widgets", {})).rejects.toMatchObject({
      status: 400,
    });
  });

  it("CadmusApiError is an instanceof CadmusError", async () => {
    try {
      await client().findByID("widgets", 999);
      throw new Error("expected findByID to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(CadmusApiError);
    }
  });
});
