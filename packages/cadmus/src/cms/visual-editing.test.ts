import { describe, expect, it } from "vitest";
import {
  applyPreviewValues,
  BLOCK_KEY,
  decodeEditRef,
  EDIT_ATTR,
  type EditRef,
  editAttr,
  encodeEditRef,
  newBlockKey,
  parseBlockFieldRef,
} from "./visual-editing.js";

describe("edit-ref encoding", () => {
  const ref: EditRef = { collection: "pages", id: 7, field: "title" };

  it("round-trips encode → decode", () => {
    expect(decodeEditRef(encodeEditRef(ref))).toEqual(ref);
  });

  it("editAttr produces the data attribute", () => {
    expect(editAttr(ref)).toEqual({ [EDIT_ATTR]: "pages:7:title" });
  });

  it("decodeEditRef rejects malformed values", () => {
    expect(decodeEditRef("pages:7")).toBeNull();
    expect(decodeEditRef("pages:notanumber:title")).toBeNull();
    expect(decodeEditRef("")).toBeNull();
  });
});

describe("block keys", () => {
  it("newBlockKey is non-numeric so it can't be mistaken for an index", () => {
    for (let i = 0; i < 50; i++) {
      const key = newBlockKey();
      expect(key).not.toMatch(/^\d+$/);
      expect(key.length).toBeGreaterThan(1);
    }
  });

  it("newBlockKey is reasonably unique", () => {
    const keys = new Set(Array.from({ length: 200 }, () => newBlockKey()));
    expect(keys.size).toBe(200);
  });

  it("BLOCK_KEY is the conventional _key", () => {
    expect(BLOCK_KEY).toBe("_key");
  });
});

describe("parseBlockFieldRef", () => {
  it("splits a per-block wrapper ref into field + key", () => {
    expect(parseBlockFieldRef("blocks.babc1234")).toEqual({
      field: "blocks",
      key: "babc1234",
    });
  });

  it("takes the block segment from a per-field live-preview path", () => {
    expect(parseBlockFieldRef("blocks.0.heading")).toEqual({
      field: "blocks",
      key: "0",
    });
  });

  it("returns null for a bare array ref naming no block", () => {
    expect(parseBlockFieldRef("blocks")).toBeNull();
    expect(parseBlockFieldRef("")).toBeNull();
  });
});

describe("applyPreviewValues", () => {
  // The Workers test pool has no DOM (mountVisualEditing/mountPreviewSync are
  // browser-only and untested here for the same reason); a mock ParentNode
  // exercises the selector construction + value handling.
  function mockRoot(bySelector: Record<string, { textContent: string }[]>) {
    return {
      querySelectorAll: (sel: string) => bySelector[sel] ?? [],
    } as unknown as ParentNode;
  }

  it("patches string fields by their edit-ref selector", () => {
    const titleEl = { textContent: "old" };
    const root = mockRoot({
      '[data-cadmus-edit="pages:7:title"]': [titleEl],
    });
    applyPreviewValues(root, { collection: "pages", id: 7 }, { title: "New" });
    expect(titleEl.textContent).toBe("New");
  });

  it("ignores non-string values", () => {
    const el = { textContent: "old" };
    const root = mockRoot({ '[data-cadmus-edit="pages:7:count"]': [el] });
    applyPreviewValues(
      root,
      { collection: "pages", id: 7 },
      { count: 5 as unknown as string },
    );
    expect(el.textContent).toBe("old");
  });
});
