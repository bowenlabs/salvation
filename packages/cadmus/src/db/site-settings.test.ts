import { getTableConfig } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import { siteSettings, siteSettingsColumns } from "./site-settings.js";

describe("siteSettings", () => {
  it("is the site_settings singleton table with the framework-generic columns", () => {
    const { name, columns, checks } = getTableConfig(siteSettings);
    expect(name).toBe("site_settings");
    const columnNames = columns.map((column) => column.name);
    for (const expected of [
      "site_name",
      "brand_color",
      "nav_background",
      "meta_description",
      "features",
    ]) {
      expect(columnNames).toContain(expected);
    }
    // The `id = 1` singleton CHECK.
    expect(checks.length).toBeGreaterThan(0);
  });

  it("exposes the columns for composing an extended table", () => {
    const keys = Object.keys(siteSettingsColumns);
    expect(keys).toContain("id");
    expect(keys).toContain("siteName");
    expect(keys).toContain("features");
  });
});
