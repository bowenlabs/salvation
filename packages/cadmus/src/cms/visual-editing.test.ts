import { describe, expect, it } from "vitest";
import {
  applyPreviewValues,
  decodeEditRef,
  EDIT_ATTR,
  type EditRef,
  editAttr,
  encodeEditRef,
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
