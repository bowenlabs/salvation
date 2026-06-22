import type { CollectionConfig } from "@bowenlabs/cadmus/cms";
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
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

describe("CollectionList", () => {
  it("renders a column per field, excluding id", () => {
    render(() => (
      <CollectionList
        config={pagesCollection}
        rows={[{ id: 1, title: "Home", slug: "home" }]}
      />
    ));
    expect(screen.getByText("title")).toBeInTheDocument();
    expect(screen.getByText("slug")).toBeInTheDocument();
    expect(screen.queryByText("id")).not.toBeInTheDocument();
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
    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.getByText("home")).toBeInTheDocument();
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
    const row = screen.getByText("Home").closest("tr");
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
    expect(screen.getByText("title")).toBeInTheDocument();
    expect(screen.queryByText("body")).not.toBeInTheDocument();
    expect(screen.queryByText("links")).not.toBeInTheDocument();
    expect(screen.queryByText("authorId")).not.toBeInTheDocument();
  });
});
