import { describe, expect, it } from "vitest";
import { parseImageRef } from "./index.js";

describe("parseImageRef", () => {
  it("treats a bare URL as the url", () => {
    expect(parseImageRef("https://x.com/a.png")).toEqual({
      url: "https://x.com/a.png",
    });
  });

  it("parses a JSON ref with hotspot/crop/dims/shape", () => {
    const ref = parseImageRef(
      JSON.stringify({
        url: "https://x.com/a.png",
        hotspot: { x: 0.5, y: 0.3 },
        crop: { top: 0.1, bottom: 0, left: 0, right: 0 },
        width: 2000,
        height: 1000,
        shape: "circle",
      }),
    );
    expect(ref.url).toBe("https://x.com/a.png");
    expect(ref.hotspot).toEqual({ x: 0.5, y: 0.3 });
    expect(ref.shape).toBe("circle");
    expect(ref.width).toBe(2000);
  });

  it("falls back to a bare url for malformed JSON", () => {
    expect(parseImageRef("{not json")).toEqual({ url: "{not json" });
  });

  it("trims surrounding whitespace", () => {
    expect(parseImageRef("  https://x.com/a.png  ")).toEqual({
      url: "https://x.com/a.png",
    });
  });
});
