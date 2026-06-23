import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import type { CollectionConfig } from "@thebes/cadmus/cms";
import { afterEach, describe, expect, it, vi } from "vitest";
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

  it("renders and submits checkbox fields as booleans", () => {
    const config: CollectionConfig = {
      slug: "people",
      fields: { isActive: { type: "checkbox" } },
    };
    let submitted: Record<string, unknown> | undefined;
    render(() => (
      <CollectionEdit
        config={config}
        onSubmit={(values) => {
          submitted = values;
        }}
      />
    ));
    const checkbox = screen.getByLabelText("isActive") as HTMLInputElement;
    expect(checkbox.type).toBe("checkbox");
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(submitted).toEqual({ isActive: true });
  });

  it("uploads a file via onUploadFile and submits the resolved URL", async () => {
    const config: CollectionConfig = {
      slug: "media",
      fields: { fileUrl: { type: "upload", required: true } },
    };
    let submitted: Record<string, unknown> | undefined;
    const file = new File(["contents"], "photo.png", { type: "image/png" });
    render(() => (
      <CollectionEdit
        config={config}
        onUploadFile={async () => ({
          url: "https://media.example.com/photo.png",
        })}
        onSubmit={(values) => {
          submitted = values;
        }}
      />
    ));
    const input = screen.getByLabelText("fileUrl *") as HTMLInputElement;
    await fireEvent.change(input, { target: { files: [file] } });
    expect(
      await screen.findByText("https://media.example.com/photo.png"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(submitted).toEqual({
      fileUrl: "https://media.example.com/photo.png",
    });
  });

  it("renders relationship fields as a select populated from relationshipOptions, submitting the selected id", () => {
    const config: CollectionConfig = {
      slug: "comments",
      fields: { authorId: { type: "relationship", relationTo: "users" } },
    };
    let submitted: Record<string, unknown> | undefined;
    render(() => (
      <CollectionEdit
        config={config}
        relationshipOptions={{
          users: [
            { id: 1, label: "Ada" },
            { id: 2, label: "Grace" },
          ],
        }}
        onSubmit={(values) => {
          submitted = values;
        }}
      />
    ));
    const select = screen.getByLabelText("authorId") as HTMLSelectElement;
    expect(screen.getByText("Ada")).toBeInTheDocument();
    fireEvent.change(select, { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(submitted).toEqual({ authorId: 2 });
  });

  it("does not render a select for hasMany relationship fields", () => {
    const config: CollectionConfig = {
      slug: "posts",
      fields: {
        tagIds: { type: "relationship", relationTo: "tags", hasMany: true },
      },
    };
    render(() => <CollectionEdit config={config} onSubmit={() => {}} />);
    expect(screen.queryByLabelText("tagIds")).not.toBeInTheDocument();
  });

  it("adds, fills, and removes array items, submitting the resulting array", () => {
    const config: CollectionConfig = {
      slug: "forms",
      fields: {
        links: {
          type: "array",
          fields: { label: { type: "text", required: true } },
        },
      },
    };
    let submitted: Record<string, unknown> | undefined;
    render(() => (
      <CollectionEdit
        config={config}
        onSubmit={(values) => {
          submitted = values;
        }}
      />
    ));
    fireEvent.click(screen.getByRole("button", { name: "Add links" }));
    fireEvent.click(screen.getByRole("button", { name: "Add links" }));
    const labelInputs = screen.getAllByLabelText("label *");
    expect(labelInputs).toHaveLength(2);
    fireEvent.input(labelInputs[0], { target: { value: "First" } });
    fireEvent.input(labelInputs[1], { target: { value: "Second" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[1]);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(submitted).toEqual({ links: [{ label: "First" }] });
  });

  it("disables Save and shows a spinner while saving", () => {
    render(() => (
      <CollectionEdit config={pagesCollection} onSubmit={() => {}} saving />
    ));
    expect(screen.getByRole("button")).toBeDisabled();
    expect(screen.queryByText("Save")).not.toBeInTheDocument();
  });

  it("hides the Save button when capabilities.canUpdate is false", () => {
    render(() => (
      <CollectionEdit
        config={pagesCollection}
        onSubmit={() => {}}
        capabilities={{ canUpdate: false }}
      />
    ));
    expect(
      screen.queryByRole("button", { name: "Save" }),
    ).not.toBeInTheDocument();
  });

  it("shows the Save button when capabilities is omitted (default allowed)", () => {
    render(() => (
      <CollectionEdit config={pagesCollection} onSubmit={() => {}} />
    ));
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("reports dirty state via onDirtyChange as fields are edited", () => {
    const dirtyStates: boolean[] = [];
    render(() => (
      <CollectionEdit
        config={pagesCollection}
        initialValues={{ title: "Home" }}
        onSubmit={() => {}}
        onDirtyChange={(dirty) => dirtyStates.push(dirty)}
      />
    ));
    expect(dirtyStates).toEqual([false]);
    fireEvent.input(screen.getByLabelText("title *"), {
      target: { value: "Changed" },
    });
    expect(dirtyStates).toEqual([false, true]);
    fireEvent.input(screen.getByLabelText("title *"), {
      target: { value: "Home" },
    });
    expect(dirtyStates).toEqual([false, true, false]);
  });

  it("renders the generic Save button when the collection isn't versioned", () => {
    render(() => (
      <CollectionEdit
        config={pagesCollection}
        onSubmit={() => {}}
        draftActions={{ onSaveDraft: () => {} }}
      />
    ));
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(screen.queryByText("Save draft")).not.toBeInTheDocument();
  });

  it("renders Save draft/Publish instead of Save when versioned with draftActions, and wires them up", () => {
    const versionedCollection: CollectionConfig = {
      ...pagesCollection,
      versions: { drafts: true },
    };
    let draftSaved: Record<string, unknown> | undefined;
    let published = false;
    render(() => (
      <CollectionEdit
        config={versionedCollection}
        initialValues={{ title: "Home" }}
        onSubmit={() => {}}
        draftActions={{
          onSaveDraft: (values) => {
            draftSaved = values;
          },
          onPublish: () => {
            published = true;
          },
          canPublish: true,
        }}
      />
    ));
    expect(
      screen.queryByRole("button", { name: "Save" }),
    ).not.toBeInTheDocument();

    fireEvent.input(screen.getByLabelText("title *"), {
      target: { value: "Updated" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    expect(draftSaved).toEqual({ title: "Updated" });

    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(published).toBe(true);
  });

  it("disables Publish until canPublish is true", () => {
    const versionedCollection: CollectionConfig = {
      ...pagesCollection,
      versions: { drafts: true },
    };
    render(() => (
      <CollectionEdit
        config={versionedCollection}
        onSubmit={() => {}}
        draftActions={{ onSaveDraft: () => {} }}
      />
    ));
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
  });

  it("renders richText fields as an editable container, lazy-loaded behind Suspense", async () => {
    const config: CollectionConfig = {
      slug: "blocks",
      fields: { body: { type: "richText" } },
    };
    render(() => <CollectionEdit config={config} onSubmit={() => {}} />);
    // The editor is dynamically imported (see CollectionEdit.tsx's
    // RichTextEditor lazy() comment) — it isn't in the DOM synchronously.
    expect(document.getElementById("body")).not.toBeInTheDocument();
    await vi.waitFor(() => {
      expect(document.getElementById("body")).toBeInTheDocument();
    });
  });
});
