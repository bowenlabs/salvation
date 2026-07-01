import { describe, expect, it } from "vitest";
import { composeMigrations, type MigrationSource } from "./index.js";

const cadmus: MigrationSource = {
  namespace: "cadmus",
  order: 0,
  migrations: [
    { id: "site_settings", sql: "CREATE TABLE site_settings (id);" },
  ],
};
const ecommerce: MigrationSource = {
  namespace: "ecommerce",
  order: 1000,
  migrations: [
    { id: "baseline", sql: "CREATE TABLE products (id);" },
    { id: "add_variants", sql: "ALTER TABLE products ADD variants;" },
  ],
};
const site: MigrationSource = {
  namespace: "site",
  order: 1_000_000,
  migrations: [{ id: "portfolio", sql: "CREATE TABLE portfolio (id);" }],
};

describe("composeMigrations", () => {
  it("orders sources by `order`, then migrations by array position", () => {
    const composed = composeMigrations([site, ecommerce, cadmus]);
    expect(composed.map((m) => m.filename)).toEqual([
      "0000000_cadmus__site_settings.sql",
      "0001000_ecommerce__baseline.sql",
      "0001001_ecommerce__add_variants.sql",
      "1000000_site__portfolio.sql",
    ]);
  });

  it("keeps the SQL of each migration unchanged", () => {
    const composed = composeMigrations([ecommerce]);
    expect(composed[0]).toEqual({
      filename: "0001000_ecommerce__baseline.sql",
      sql: "CREATE TABLE products (id);",
    });
  });

  it("filenames sort lexically into apply order", () => {
    const composed = composeMigrations([site, cadmus, ecommerce]);
    const names = composed.map((m) => m.filename);
    expect([...names].sort()).toEqual(names);
  });

  it("is stable: adding a migration to one source never renumbers another", () => {
    const before = composeMigrations([cadmus, ecommerce, site]);
    const ecommercePlus: MigrationSource = {
      ...ecommerce,
      migrations: [
        ...ecommerce.migrations,
        { id: "add_inventory", sql: "ALTER TABLE products ADD stock;" },
      ],
    };
    const after = composeMigrations([cadmus, ecommercePlus, site]);

    const nameFor = (list: typeof before, sql: string) =>
      list.find((m) => m.sql === sql)?.filename;
    // Every pre-existing migration keeps its exact filename.
    for (const m of before) {
      expect(nameFor(after, m.sql)).toBe(m.filename);
    }
    // The new one is appended within the ecommerce band.
    expect(nameFor(after, "ALTER TABLE products ADD stock;")).toBe(
      "0001002_ecommerce__add_inventory.sql",
    );
  });

  it("is deterministic regardless of input source order", () => {
    const a = composeMigrations([cadmus, ecommerce, site]);
    const b = composeMigrations([site, cadmus, ecommerce]);
    expect(a).toEqual(b);
  });

  it("throws when two sources' bands collide onto one filename", () => {
    const a: MigrationSource = {
      namespace: "a",
      order: 0,
      migrations: [{ id: "x", sql: "" }],
    };
    const b: MigrationSource = {
      namespace: "a",
      order: 0,
      migrations: [{ id: "x", sql: "" }],
    };
    expect(() => composeMigrations([a, b])).toThrow(/collision/);
  });

  it("throws on a duplicate migration id within a source", () => {
    const dupe: MigrationSource = {
      namespace: "crm",
      order: 0,
      migrations: [
        { id: "baseline", sql: "" },
        { id: "baseline", sql: "" },
      ],
    };
    expect(() => composeMigrations([dupe])).toThrow(/duplicate migration id/);
  });

  it("rejects a namespace with illegal characters", () => {
    const bad: MigrationSource = {
      namespace: "My Plugin",
      order: 0,
      migrations: [{ id: "x", sql: "" }],
    };
    expect(() => composeMigrations([bad])).toThrow(/namespace/);
  });
});
