import { describe, expect, it } from "vitest";
import {
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
