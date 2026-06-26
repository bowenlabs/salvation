import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  filterSlashItems,
  matchSlashQuery,
  RichTextEditor,
} from "./RichTextEditor.js";

afterEach(cleanup);

describe("matchSlashQuery", () => {
  it("opens on a bare slash at the block start", () => {
    expect(matchSlashQuery("/")).toBe("");
  });
  it("captures the query after the slash", () => {
    expect(matchSlashQuery("/head")).toBe("head");
  });
  it("returns null when there is no leading slash", () => {
    expect(matchSlashQuery("hello")).toBeNull();
  });
  it("returns null when the slash is mid-text (not a trigger)", () => {
    expect(matchSlashQuery("hello /head")).toBeNull();
    expect(matchSlashQuery("/two words")).toBeNull();
  });
});

describe("filterSlashItems", () => {
  const items = [
    { label: "Bullet list", keywords: "ul unordered", run: () => {} },
    { label: "Quote", keywords: "blockquote", run: () => {} },
  ];
  it("returns all items for an empty query", () => {
    expect(filterSlashItems(items, "")).toHaveLength(2);
  });
  it("matches by label", () => {
    expect(filterSlashItems(items, "quote").map((i) => i.label)).toEqual([
      "Quote",
    ]);
  });
  it("matches by keyword", () => {
    expect(filterSlashItems(items, "ul").map((i) => i.label)).toEqual([
      "Bullet list",
    ]);
  });
});

describe("RichTextEditor toolbar", () => {
  it("renders a formatting toolbar", () => {
    render(() => <RichTextEditor id="body" onChange={() => {}} />);
    for (const label of [
      "Bold",
      "Italic",
      "Underline",
      "Link",
      "Heading 2",
      "Heading 3",
      "Bullet list",
      "Numbered list",
      "Quote",
      "Divider",
    ]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    // The editable surface mounts under the given id.
    expect(document.getElementById("body")).toBeInTheDocument();
  });

  it("hides the Image control unless onUploadFile is provided", () => {
    render(() => <RichTextEditor onChange={() => {}} />);
    expect(screen.queryByLabelText("Image")).not.toBeInTheDocument();
  });

  it("shows the Image control when onUploadFile is provided", () => {
    render(() => (
      <RichTextEditor
        onChange={() => {}}
        onUploadFile={vi.fn(async () => ({ url: "x" }))}
      />
    ));
    expect(screen.getByLabelText("Image")).toBeInTheDocument();
  });
});
