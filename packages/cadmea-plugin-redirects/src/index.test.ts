// Copyright (c) 2026 BowenLabs. All rights reserved.
// MIT licensed. See LICENSE in the repo root.

import type { CmsConfig } from "@thebes/cadmus/cms";
import { describe, expect, it } from "vitest";
import { lookupRedirect, redirectsPlugin } from "./index.js";

const pagesCollection = {
  slug: "pages",
  fields: { title: { type: "text" as const, required: true } },
};

describe("redirectsPlugin", () => {
  it("adds a redirects collection with the expected fields", () => {
    const config: CmsConfig = { collections: [pagesCollection] };
    const plugin = redirectsPlugin();
    const resolved = plugin(config);

    expect(resolved.collections).toHaveLength(2);
    const redirects = resolved.collections.find((c) => c.slug === "redirects");
    expect(redirects).toBeDefined();
    expect(Object.keys(redirects?.fields ?? {})).toEqual([
      "id",
      "from",
      "to",
      "statusCode",
      "createdAt",
    ]);
  });

  it("leaves the original config's collections array untouched (returns a new object)", () => {
    const config: CmsConfig = { collections: [pagesCollection] };
    redirectsPlugin()(config);
    expect(config.collections).toHaveLength(1);
  });

  it("supports a custom collection slug", () => {
    const config: CmsConfig = { collections: [pagesCollection] };
    const resolved = redirectsPlugin({ collectionSlug: "url_redirects" })(
      config,
    );
    expect(resolved.collections.map((c) => c.slug)).toContain("url_redirects");
  });

  it("is a no-op if a collection with the same slug already exists", () => {
    const existing = {
      slug: "redirects",
      fields: { from: { type: "text" as const } },
    };
    const config: CmsConfig = { collections: [pagesCollection, existing] };
    const resolved = redirectsPlugin()(config);
    expect(resolved.collections).toHaveLength(2);
    expect(resolved.collections.find((c) => c.slug === "redirects")).toBe(
      existing,
    );
  });
});

describe("lookupRedirect", () => {
  function fakeApi(
    rows: Array<{ from: string; to: string; statusCode: string }>,
  ) {
    return { find: async () => rows };
  }

  it("returns the matching redirect", async () => {
    const api = fakeApi([
      { from: "/old", to: "/new", statusCode: "301" },
      { from: "/foo", to: "/bar", statusCode: "302" },
    ]);
    // biome-ignore lint/suspicious/noExplicitAny: see lookupRedirect's own LocalApi generic note
    const found = await lookupRedirect(api as any, undefined, "/old");
    expect(found).toEqual({ from: "/old", to: "/new", statusCode: "301" });
  });

  it("returns null when no redirect matches", async () => {
    const api = fakeApi([{ from: "/old", to: "/new", statusCode: "301" }]);
    // biome-ignore lint/suspicious/noExplicitAny: see lookupRedirect's own LocalApi generic note
    const found = await lookupRedirect(api as any, undefined, "/missing");
    expect(found).toBeNull();
  });
});
