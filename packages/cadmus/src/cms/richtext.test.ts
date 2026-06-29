import { describe, expect, it } from "vitest";
import { renderRichText } from "./richtext.js";

describe("renderRichText", () => {
  it("renders paragraphs and headings", () => {
    const html = renderRichText({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Hello" }] },
        { type: "heading", content: [{ type: "text", text: "Title" }] },
      ],
    });
    expect(html).toBe("<p>Hello</p><h2>Title</h2>");
  });

  it("applies inline marks", () => {
    const html = renderRichText({
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "bold", marks: [{ type: "bold" }] }],
        },
      ],
    });
    expect(html).toBe("<p><strong>bold</strong></p>");
  });

  it("renders bullet lists", () => {
    const html = renderRichText({
      content: [
        {
          type: "bulletList",
          content: [{ type: "listItem", content: [{ type: "text", text: "a" }] }],
        },
      ],
    });
    expect(html).toBe("<ul><li>a</li></ul>");
  });

  it("escapes HTML in text", () => {
    const html = renderRichText({
      content: [
        { type: "paragraph", content: [{ type: "text", text: '<x> & "y"' }] },
      ],
    });
    expect(html).toContain('&lt;x&gt; &amp; &quot;y&quot;');
    expect(html).not.toContain("<x>");
  });

  it("returns an empty string for empty content", () => {
    expect(renderRichText({})).toBe("");
  });
});
