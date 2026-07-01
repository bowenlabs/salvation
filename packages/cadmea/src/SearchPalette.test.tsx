import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SearchPalette, type SearchPaletteResult } from "./SearchPalette.js";

afterEach(cleanup);

const RESULTS: SearchPaletteResult[] = [
  { collection: "pages", id: 1, label: "Home", icon: "ph-house" },
  {
    collection: "products",
    id: 2,
    label: "Prairie Dawn",
    icon: "ph-package",
    meta: { label: "Available", tone: "positive" },
  },
];

function openWithQuery() {
  // Cmd+K opens the palette (the global listener lives on document).
  fireEvent.keyDown(document, { key: "k", metaKey: true });
  fireEvent.input(screen.getByRole("textbox"), { target: { value: "pra" } });
}

describe("SearchPalette", () => {
  it("groups results by collection with headers, icons, and a status badge", async () => {
    render(() => (
      <SearchPalette
        grouped
        onSearch={async () => RESULTS}
        onSelect={() => {}}
      />
    ));
    openWithQuery();

    // Group headers (humanized collection) + rows appear once onSearch resolves.
    await vi.waitFor(() =>
      expect(screen.getByText("Products")).toBeInTheDocument(),
    );
    expect(screen.getByText("Pages")).toBeInTheDocument();
    expect(screen.getByText("Home")).toBeInTheDocument();

    // Per-result icon + the status badge render.
    const product = screen.getByText("Prairie Dawn").closest("button");
    expect(product?.querySelector("i.ph.ph-package")).toBeTruthy();
    expect(screen.getByText("Available")).toBeInTheDocument();
  });

  it("selects a result on click and closes", async () => {
    const selected: SearchPaletteResult[] = [];
    render(() => (
      <SearchPalette
        grouped
        onSearch={async () => RESULTS}
        onSelect={(r) => selected.push(r)}
      />
    ));
    openWithQuery();
    await vi.waitFor(() => screen.getByText("Home"));

    fireEvent.click(screen.getByText("Home"));
    expect(selected).toHaveLength(1);
    expect(selected[0].label).toBe("Home");
    // Palette closes itself after a selection.
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("falls back to a flat list with the humanized collection tag when not grouped", async () => {
    render(() => (
      <SearchPalette onSearch={async () => RESULTS} onSelect={() => {}} />
    ));
    openWithQuery();
    await vi.waitFor(() => screen.getByText("Home"));

    // No grouped header row; a result without `meta` shows the humanized
    // collection as its right-aligned tag instead.
    expect(document.querySelector("li.font-mono")).toBeNull();
    expect(screen.getByText("Pages")).toBeInTheDocument(); // Home's collection tag
  });
});
