import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@solidjs/testing-library";
import type { CollectionConfig } from "@thebes/cadmus/cms";
import { afterEach, describe, expect, it } from "vitest";
import { CollectionList } from "./CollectionList.js";

const pagesCollection: CollectionConfig = {
  slug: "pages",
  fields: {
    id: { type: "number", autoIncrement: true },
    title: { type: "text", required: true },
    slug: { type: "text", required: true, unique: true },
  },
};

afterEach(cleanup);

// CollectionList renders a desktop <table> and a mobile card list in
// parallel (CSS — `hidden md:table` / `md:hidden` — switches between them;
// jsdom doesn't evaluate media queries, so both are always present in the
// DOM here). Tests that care about one layout specifically scope into the
// `table` element or the card container rather than querying the whole
// document, which would otherwise see every cell value twice.
function desktopTable() {
  const table = document.querySelector("table");
  if (!table) throw new Error("desktop table not found");
  return within(table as HTMLElement);
}

describe("CollectionList", () => {
  it("renders a column per field, excluding id", () => {
    render(() => (
      <CollectionList
        config={pagesCollection}
        rows={[{ id: 1, title: "Home", slug: "home" }]}
      />
    ));
    const table = desktopTable();
    expect(table.getByText("title")).toBeInTheDocument();
    expect(table.getByText("slug")).toBeInTheDocument();
    expect(table.queryByText("id")).not.toBeInTheDocument();
  });

  it("shows an empty-state message when there are no rows", () => {
    render(() => <CollectionList config={pagesCollection} rows={[]} />);
    expect(screen.getByText("No pages yet.")).toBeInTheDocument();
  });

  it("renders a row per item", () => {
    render(() => (
      <CollectionList
        config={pagesCollection}
        rows={[{ id: 1, title: "Home", slug: "home" }]}
      />
    ));
    // Once in the desktop table, once in the mobile card list.
    expect(screen.getAllByText("Home")).toHaveLength(2);
    expect(screen.getAllByText("home")).toHaveLength(2);
  });

  it("calls onRowClick with the clicked row", () => {
    const clicked: Record<string, unknown>[] = [];
    render(() => (
      <CollectionList
        config={pagesCollection}
        rows={[{ id: 1, title: "Home", slug: "home" }]}
        onRowClick={(row) => clicked.push(row)}
      />
    ));
    const row = desktopTable().getByText("Home").closest("tr");
    if (!row) throw new Error("row not found");
    fireEvent.click(row);
    expect(clicked).toEqual([{ id: 1, title: "Home", slug: "home" }]);
  });

  it("excludes richText, array, and relationship fields from columns", () => {
    const config: CollectionConfig = {
      slug: "posts",
      fields: {
        id: { type: "number", autoIncrement: true },
        title: { type: "text", required: true },
        body: { type: "richText" },
        links: { type: "array", fields: { label: { type: "text" } } },
        authorId: { type: "relationship", relationTo: "users" },
      },
    };
    render(() => (
      <CollectionList config={config} rows={[{ id: 1, title: "Home" }]} />
    ));
    const table = desktopTable();
    expect(table.getByText("title")).toBeInTheDocument();
    expect(table.queryByText("body")).not.toBeInTheDocument();
    expect(table.queryByText("links")).not.toBeInTheDocument();
    expect(table.queryByText("authorId")).not.toBeInTheDocument();
  });

  it("hides the pagination bar when page/pageSize are omitted", () => {
    render(() => (
      <CollectionList
        config={pagesCollection}
        rows={[{ id: 1, title: "Home", slug: "home" }]}
      />
    ));
    expect(screen.queryByText("Prev")).not.toBeInTheDocument();
    expect(screen.queryByText("Next")).not.toBeInTheDocument();
  });

  it("renders the pagination bar and disables Prev on page 1", () => {
    render(() => (
      <CollectionList
        config={pagesCollection}
        rows={[{ id: 1, title: "Home", slug: "home" }]}
        page={1}
        pageSize={10}
        totalCount={1}
      />
    ));
    expect(screen.getByText("Prev")).toBeDisabled();
    expect(screen.getByText("Next")).toBeDisabled();
    expect(screen.getByText("Page 1")).toBeInTheDocument();
  });

  it("enables Next when totalCount indicates more rows, and calls onPageChange", () => {
    const pages: number[] = [];
    render(() => (
      <CollectionList
        config={pagesCollection}
        rows={[{ id: 1, title: "Home", slug: "home" }]}
        page={1}
        pageSize={1}
        totalCount={2}
        onPageChange={(p) => pages.push(p)}
      />
    ));
    const next = screen.getByText("Next");
    expect(next).not.toBeDisabled();
    fireEvent.click(next);
    expect(pages).toEqual([2]);
  });

  it("falls back to a rows.length heuristic for Next when totalCount is omitted", () => {
    render(() => (
      <CollectionList
        config={pagesCollection}
        rows={[{ id: 1, title: "Home", slug: "home" }]}
        page={1}
        pageSize={10}
      />
    ));
    // 1 row returned but pageSize is 10 — no more rows to fetch.
    expect(screen.getByText("Next")).toBeDisabled();
  });

  it("renders a sort field/direction picker and calls onSortChange", () => {
    const changes: Array<[string, "asc" | "desc"]> = [];
    render(() => (
      <CollectionList
        config={pagesCollection}
        rows={[{ id: 1, title: "Home", slug: "home" }]}
        sortField="title"
        sortDirection="asc"
        onSortChange={(field, dir) => changes.push([field, dir])}
      />
    ));
    fireEvent.change(screen.getByLabelText("Sort by"), {
      target: { value: "slug" },
    });
    fireEvent.change(screen.getByLabelText("Sort direction"), {
      target: { value: "desc" },
    });
    expect(changes).toEqual([
      ["slug", "asc"],
      ["title", "desc"],
    ]);
  });

  it("hides the sort picker when onSortChange is omitted", () => {
    render(() => (
      <CollectionList
        config={pagesCollection}
        rows={[{ id: 1, title: "Home", slug: "home" }]}
      />
    ));
    expect(screen.queryByLabelText("Sort by")).not.toBeInTheDocument();
  });

  it("shows a Select toggle only when selectable, and toggles selection on click", () => {
    const selections: Set<number>[] = [];
    render(() => (
      <CollectionList
        config={pagesCollection}
        rows={[{ id: 1, title: "Home", slug: "home" }]}
        selectable
        onSelectionChange={(ids) => selections.push(ids)}
      />
    ));
    const toggle = screen.getByText("Select");
    fireEvent.click(toggle);
    expect(screen.getByText("Done")).toBeInTheDocument();

    const checkbox = desktopTable().getByRole("checkbox");
    fireEvent.click(checkbox);
    expect(selections).toEqual([new Set([1])]);
  });

  it("does not show the Select toggle when selectable is false/omitted", () => {
    render(() => (
      <CollectionList
        config={pagesCollection}
        rows={[{ id: 1, title: "Home", slug: "home" }]}
      />
    ));
    expect(screen.queryByText("Select")).not.toBeInTheDocument();
  });

  it("clicking a row in select mode toggles selection instead of calling onRowClick", () => {
    const clicked: Record<string, unknown>[] = [];
    const selections: Set<number>[] = [];
    render(() => (
      <CollectionList
        config={pagesCollection}
        rows={[{ id: 1, title: "Home", slug: "home" }]}
        onRowClick={(row) => clicked.push(row)}
        selectable
        onSelectionChange={(ids) => selections.push(ids)}
      />
    ));
    fireEvent.click(screen.getByText("Select"));
    const row = desktopTable().getByText("Home").closest("tr");
    if (!row) throw new Error("row not found");
    fireEvent.click(row);
    expect(clicked).toEqual([]);
    expect(selections).toEqual([new Set([1])]);
  });
});
