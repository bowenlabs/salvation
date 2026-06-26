import { describe, expect, it } from "vitest";
import { buildStudioStructure, DEFAULT_STUDIO_GROUP } from "./structure.js";
import type { CmsConfig, CollectionConfig } from "./types.js";

function collection(
  slug: string,
  admin?: CollectionConfig["admin"],
): CollectionConfig {
  return {
    slug,
    admin,
    fields: { id: { type: "number", autoIncrement: true } },
  };
}

function config(...collections: CollectionConfig[]): CmsConfig {
  return { collections };
}

describe("buildStudioStructure", () => {
  it("groups ungrouped collections under the default group", () => {
    const structure = buildStudioStructure(config(collection("pages")));
    expect(structure).toEqual([
      {
        title: DEFAULT_STUDIO_GROUP,
        items: [
          {
            slug: "pages",
            label: "Pages",
            href: "/admin/pages",
            readOnly: false,
            singleton: false,
          },
        ],
      },
    ]);
  });

  it("drops hidden collections entirely", () => {
    const structure = buildStudioStructure(
      config(
        collection("pages"),
        collection("webhook_events", { hidden: true }),
      ),
    );
    const slugs = structure.flatMap((g) => g.items.map((i) => i.slug));
    expect(slugs).toEqual(["pages"]);
  });

  it("honors groups and explicit groupOrder", () => {
    const structure = buildStudioStructure(
      config(
        collection("products", { group: "Store" }),
        collection("pages", { group: "Content" }),
        collection("contacts", { group: "CRM" }),
      ),
      { groupOrder: ["Content", "CRM", "Store"] },
    );
    expect(structure.map((g) => g.title)).toEqual(["Content", "CRM", "Store"]);
  });

  it("falls back to first-appearance order for groups outside groupOrder", () => {
    const structure = buildStudioStructure(
      config(
        collection("a", { group: "Zeta" }),
        collection("b", { group: "Alpha" }),
      ),
    );
    expect(structure.map((g) => g.title)).toEqual(["Zeta", "Alpha"]);
  });

  it("sorts items within a group by order, then config index", () => {
    const structure = buildStudioStructure(
      config(
        collection("third", { order: 30 }),
        collection("first", { order: 10 }),
        collection("second", { order: 10 }),
        collection("last"),
      ),
    );
    // order 10 ties → config index (first before second); unset order sorts last.
    expect(structure[0].items.map((i) => i.slug)).toEqual([
      "first",
      "second",
      "third",
      "last",
    ]);
  });

  it("merges per-slug overrides over the collection's own admin block", () => {
    const structure = buildStudioStructure(
      config(collection("payments", { group: "Store" })),
      { overrides: { payments: { readOnly: true } } },
    );
    const payments = structure[0].items[0];
    expect(payments.readOnly).toBe(true);
    expect(structure[0].title).toBe("Store");
  });

  it("override can hide a plugin-injected collection", () => {
    const structure = buildStudioStructure(
      config(collection("webhook_events")),
      {
        overrides: { webhook_events: { hidden: true } },
      },
    );
    expect(structure).toEqual([]);
  });

  it("marks singletons and respects label/icon/basePath", () => {
    const structure = buildStudioStructure(
      config(
        collection("site_settings", {
          singleton: true,
          label: "Site Settings",
          icon: "gear",
        }),
      ),
      { basePath: "/studio" },
    );
    expect(structure[0].items[0]).toEqual({
      slug: "site_settings",
      label: "Site Settings",
      href: "/studio/site_settings",
      readOnly: false,
      singleton: true,
      icon: "gear",
    });
  });
});
