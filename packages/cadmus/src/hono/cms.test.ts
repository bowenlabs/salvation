import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { CadmusAccessDeniedError, CadmusCmsError } from "../errors.js";
import { mountCmsRoutes } from "./cms.js";

interface Widget {
  id: number;
  name: string;
}

// A hand-rolled fake LocalApi over an in-memory array — decouples these
// routing/status-code tests from createLocalApi and D1 entirely.
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
    // test-only helper to simulate a unique-constraint failure
    async createDuplicate(_context: unknown) {
      throw new CadmusCmsError(
        'Unique constraint violated for collection "widgets"',
      );
    },
    // test-only helper to simulate a genuine bug, not a CMS-level error
    async throwUnexpected(_context: unknown) {
      throw new Error("boom");
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
    // biome-ignore lint/suspicious/noExplicitAny: the fake satisfies LocalApi's call shape; cms.ts's generic is `any` for the same reason
    collections: { widgets: widgetsApi as any },
    resolveContext: async () => undefined,
  });
}

describe("mountCmsRoutes", () => {
  it("GET /api/:collection returns the full list", async () => {
    const app = buildApp(createFakeWidgetsApi());
    const res = await app.request("/api/widgets");
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveLength(2);
  });

  it("GET /api/:collection/search?q=... returns matching records", async () => {
    const app = buildApp(createFakeWidgetsApi());
    const res = await app.request("/api/widgets/search?q=alp");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: 1, name: "Alpha" }]);
  });

  it('GET /api/:collection/search is never parsed as findByID with id="search"', async () => {
    const app = buildApp(createFakeWidgetsApi());
    const res = await app.request("/api/widgets/search?q=alpha");
    expect(res.status).toBe(200);
    expect(await res.json()).not.toEqual({
      error: 'No "widgets" document found with id NaN',
    });
  });

  it("GET /api/:collection/:id returns a single record", async () => {
    const app = buildApp(createFakeWidgetsApi());
    const res = await app.request("/api/widgets/1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 1, name: "Alpha" });
  });

  it("GET /api/:collection/:id returns 404 for a missing id", async () => {
    const app = buildApp(createFakeWidgetsApi());
    const res = await app.request("/api/widgets/999");
    expect(res.status).toBe(404);
  });

  it("POST /api/:collection creates a record and returns 201", async () => {
    const app = buildApp(createFakeWidgetsApi());
    const res = await app.request("/api/widgets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Gamma" }),
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: 3, name: "Gamma" });
  });

  it("POST /api/:collection returns 400 on a validation failure", async () => {
    const app = buildApp(createFakeWidgetsApi());
    const res = await app.request("/api/widgets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("PATCH /api/:collection/:id updates a record", async () => {
    const app = buildApp(createFakeWidgetsApi());
    const res = await app.request("/api/widgets/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 1, name: "Updated" });
  });

  it("DELETE /api/:collection/:id deletes a record", async () => {
    const app = buildApp(createFakeWidgetsApi());
    const res = await app.request("/api/widgets/2", { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 2, name: "Beta" });
  });

  it("returns 409 for a unique-constraint violation", async () => {
    const widgetsApi = createFakeWidgetsApi();
    const app = new Hono();
    mountCmsRoutes(app, {
      collections: {
        // biome-ignore lint/suspicious/noExplicitAny: simulating create() throwing the unique-constraint error
        widgets: { ...widgetsApi, create: widgetsApi.createDuplicate } as any,
      },
      resolveContext: async () => undefined,
    });
    const res = await app.request("/api/widgets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Dup" }),
    });
    expect(res.status).toBe(409);
  });

  it("returns 403 when the Local API rejects access", async () => {
    const widgetsApi = createFakeWidgetsApi();
    const app = new Hono();
    mountCmsRoutes(app, {
      collections: {
        widgets: {
          ...widgetsApi,
          find: async () => {
            throw new CadmusAccessDeniedError(
              'Access denied for "read" on collection "widgets"',
            );
          },
          // biome-ignore lint/suspicious/noExplicitAny: simulating find() throwing CadmusAccessDeniedError
        } as any,
      },
      resolveContext: async () => undefined,
    });
    const res = await app.request("/api/widgets");
    expect(res.status).toBe(403);
  });

  it("returns 400 for an unknown collection", async () => {
    const app = buildApp(createFakeWidgetsApi());
    const res = await app.request("/api/not-a-collection");
    expect(res.status).toBe(400);
  });

  it("rethrows non-CadmusCmsError failures rather than swallowing them as a 200", async () => {
    const widgetsApi = createFakeWidgetsApi();
    const app = new Hono();
    mountCmsRoutes(app, {
      collections: {
        // biome-ignore lint/suspicious/noExplicitAny: simulating find() throwing a genuine bug
        widgets: { ...widgetsApi, find: widgetsApi.throwUnexpected } as any,
      },
      resolveContext: async () => undefined,
    });
    // router.onError rethrows non-CadmusCmsError failures; Hono's own
    // top-level default error handler then converts that into a 500 —
    // not a 200, and not a silently-rejected promise either.
    const res = await app.request("/api/widgets");
    expect(res.status).toBe(500);
  });

  it("calls resolveContext once per request and passes its result to the Local API", async () => {
    const widgetsApi = createFakeWidgetsApi();
    const findSpy = vi.fn(widgetsApi.find);
    const resolveContext = vi.fn(async () => ({ userId: 42 }));
    const app = mountCmsRoutes(new Hono(), {
      collections: {
        // biome-ignore lint/suspicious/noExplicitAny: simulating a typed TContext flowing through
        widgets: { ...widgetsApi, find: findSpy } as any,
      },
      resolveContext,
    });

    const res = await app.request("/api/widgets");
    expect(res.status).toBe(200);
    expect(resolveContext).toHaveBeenCalledTimes(1);
    expect(findSpy).toHaveBeenCalledWith({ userId: 42 });
  });
});
