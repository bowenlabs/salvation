import { describe, expect, it } from "vitest";
import {
  applyPatch,
  computePatch,
  diffDocuments,
  type Patch,
} from "./patch.js";

describe("diffDocuments", () => {
  it("reports added, removed, and changed fields", () => {
    const before = { title: "A", slug: "a", drop: 1 };
    const after = { title: "B", slug: "a", add: 2 };
    const changes = diffDocuments(before, after);
    expect(changes).toContainEqual({
      path: "title",
      kind: "changed",
      before: "A",
      after: "B",
    });
    expect(changes).toContainEqual({
      path: "drop",
      kind: "removed",
      before: 1,
    });
    expect(changes).toContainEqual({ path: "add", kind: "added", after: 2 });
    // slug unchanged → not reported
    expect(changes.find((c) => c.path === "slug")).toBeUndefined();
  });

  it("compares values structurally (deep-equal)", () => {
    const before = { blocks: [{ type: "hero", heading: "Hi" }] };
    const after = { blocks: [{ type: "hero", heading: "Hi" }] };
    expect(diffDocuments(before, after)).toEqual([]);

    const changed = diffDocuments(before, {
      blocks: [{ type: "hero", heading: "Yo" }],
    });
    expect(changed).toHaveLength(1);
    expect(changed[0]).toMatchObject({ path: "blocks", kind: "changed" });
  });

  it("respects ignore + fields options", () => {
    const before = { id: 1, title: "A", createdAt: 10 };
    const after = { id: 2, title: "B", createdAt: 20 };
    expect(
      diffDocuments(before, after, { ignore: ["id", "createdAt"] }).map(
        (c) => c.path,
      ),
    ).toEqual(["title"]);
    expect(
      diffDocuments(before, after, { fields: ["title"] }).map((c) => c.path),
    ).toEqual(["title"]);
  });
});

describe("computePatch / applyPatch", () => {
  it("computePatch then applyPatch reproduces the target", () => {
    const before = { title: "A", slug: "a", drop: 1 };
    const after = { title: "B", slug: "a", add: 2 };
    const patch = computePatch(before, after);
    expect(applyPatch(before, patch)).toEqual(after);
  });

  it("set writes/overwrites, unset removes; input is not mutated", () => {
    const doc = { a: 1, b: 2 };
    const patch: Patch = [
      { op: "set", path: "a", value: 9 },
      { op: "set", path: "c", value: 3 },
      { op: "unset", path: "b" },
    ];
    expect(applyPatch(doc, patch)).toEqual({ a: 9, c: 3 });
    expect(doc).toEqual({ a: 1, b: 2 }); // immutable
  });

  it("empty patch is a no-op", () => {
    const doc = { a: 1 };
    expect(applyPatch(doc, computePatch(doc, { a: 1 }))).toEqual(doc);
  });
});
