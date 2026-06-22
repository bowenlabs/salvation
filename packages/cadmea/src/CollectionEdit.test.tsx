import type { CollectionConfig } from "@bowenlabs/cadmus/cms";
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vitest";
import { CollectionEdit } from "./CollectionEdit.js";

const pagesCollection: CollectionConfig = {
  slug: "pages",
  fields: {
    id: { type: "number", autoIncrement: true },
    title: { type: "text", required: true },
    status: {
      type: "select",
      options: ["draft", "published"],
      required: true,
      defaultValue: "draft",
    },
    createdAt: { type: "date", mode: "timestamp", defaultValue: "now" },
  },
};

afterEach(cleanup);

describe("CollectionEdit", () => {
  it("renders an input per editable field, excluding id", () => {
    render(() => (
      <CollectionEdit config={pagesCollection} onSubmit={() => {}} />
    ));
    expect(screen.getByLabelText("title *")).toBeInTheDocument();
    expect(screen.getByLabelText("status *")).toBeInTheDocument();
    expect(screen.queryByLabelText("id")).not.toBeInTheDocument();
  });

  it("renders date fields as read-only", () => {
    render(() => (
      <CollectionEdit
        config={pagesCollection}
        initialValues={{ createdAt: new Date(0) }}
        onSubmit={() => {}}
      />
    ));
    expect(screen.getByLabelText("createdAt")).toHaveAttribute("readonly");
  });

  it("submits edited values, excluding date fields", () => {
    let submitted: Record<string, unknown> | undefined;
    render(() => (
      <CollectionEdit
        config={pagesCollection}
        initialValues={{ createdAt: new Date(0) }}
        onSubmit={(values) => {
          submitted = values;
        }}
      />
    ));
    fireEvent.input(screen.getByLabelText("title *"), {
      target: { value: "Home" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(submitted).toEqual({ title: "Home" });
  });

  it("shows the error message when provided", () => {
    render(() => (
      <CollectionEdit
        config={pagesCollection}
        onSubmit={() => {}}
        error="Something went wrong"
      />
    ));
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });
});
