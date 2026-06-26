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
    expect(screen.getByLabelText("Title *")).toBeInTheDocument();
    expect(screen.getByLabelText("Status *")).toBeInTheDocument();
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
    expect(screen.getByLabelText("Created at")).toHaveAttribute("readonly");
  });

  it("submits edited values, excluding date fields", async () => {
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
    fireEvent.input(screen.getByLabelText("Title *"), {
      target: { value: "Home" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() => expect(submitted).toEqual({ title: "Home" }));
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

  it("renders and submits checkbox fields as booleans", async () => {
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
    const checkbox = screen.getByLabelText("Is active") as HTMLInputElement;
    expect(checkbox.type).toBe("checkbox");
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() => expect(submitted).toEqual({ isActive: true }));
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
    const input = screen.getByLabelText("File url *") as HTMLInputElement;
    await fireEvent.change(input, { target: { files: [file] } });
    expect(
      await screen.findByText("https://media.example.com/photo.png"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() =>
      expect(submitted).toEqual({
        fileUrl: "https://media.example.com/photo.png",
      }),
    );
  });

  it("renders relationship fields as a select populated from relationshipOptions, submitting the selected id", async () => {
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
    const select = screen.getByLabelText("Author id") as HTMLSelectElement;
    expect(screen.getByText("Ada")).toBeInTheDocument();
    fireEvent.change(select, { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() => expect(submitted).toEqual({ authorId: 2 }));
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

  it("adds, fills, and removes array items, submitting the resulting array", async () => {
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
    fireEvent.click(screen.getByRole("button", { name: "Add Links" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Links" }));
    const labelInputs = screen.getAllByLabelText("Label *");
    expect(labelInputs).toHaveLength(2);
    fireEvent.input(labelInputs[0], { target: { value: "First" } });
    fireEvent.input(labelInputs[1], { target: { value: "Second" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[1]);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() => expect(submitted).toEqual({ links: [{ label: "First" }] }));
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
    fireEvent.input(screen.getByLabelText("Title *"), {
      target: { value: "Changed" },
    });
    expect(dirtyStates).toEqual([false, true]);
    fireEvent.input(screen.getByLabelText("Title *"), {
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

    fireEvent.input(screen.getByLabelText("Title *"), {
      target: { value: "Updated" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    expect(draftSaved).toEqual({ title: "Updated" });

    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(published).toBe(true);
  });

  it("renders Preview only when onPreview is provided, gated on canPreview", () => {
    const versionedCollection: CollectionConfig = {
      ...pagesCollection,
      versions: { drafts: true },
    };
    let previewed = false;
    render(() => (
      <CollectionEdit
        config={versionedCollection}
        onSubmit={() => {}}
        draftActions={{
          onSaveDraft: () => {},
          onPreview: () => {
            previewed = true;
          },
          canPreview: true,
        }}
      />
    ));
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(previewed).toBe(true);
  });

  it("omits the Preview button when onPreview isn't provided", () => {
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
    expect(
      screen.queryByRole("button", { name: "Preview" }),
    ).not.toBeInTheDocument();
  });

  it("disables Preview until canPreview is true", () => {
    const versionedCollection: CollectionConfig = {
      ...pagesCollection,
      versions: { drafts: true },
    };
    render(() => (
      <CollectionEdit
        config={versionedCollection}
        onSubmit={() => {}}
        draftActions={{ onSaveDraft: () => {}, onPreview: () => {} }}
      />
    ));
    expect(screen.getByRole("button", { name: "Preview" })).toBeDisabled();
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

describe("CollectionEdit — admin field metadata (A)", () => {
  it("humanizes the field key when no admin.label is set", () => {
    const config: CollectionConfig = {
      slug: "pages",
      fields: { metaDescription: { type: "text" } },
    };
    render(() => <CollectionEdit config={config} onSubmit={() => {}} />);
    expect(screen.getByLabelText("Meta description")).toBeInTheDocument();
  });

  it("uses admin.label over the humanized key", () => {
    const config: CollectionConfig = {
      slug: "pages",
      fields: { metaDescription: { type: "text", admin: { label: "SEO blurb" } } },
    };
    render(() => <CollectionEdit config={config} onSubmit={() => {}} />);
    expect(screen.getByLabelText("SEO blurb")).toBeInTheDocument();
  });

  it("renders admin.description as help text", () => {
    const config: CollectionConfig = {
      slug: "pages",
      fields: {
        title: { type: "text", admin: { description: "Shown in the browser tab" } },
      },
    };
    render(() => <CollectionEdit config={config} onSubmit={() => {}} />);
    expect(screen.getByText("Shown in the browser tab")).toBeInTheDocument();
  });

  it("groups fields into a titled fieldset by admin.group", () => {
    const config: CollectionConfig = {
      slug: "pages",
      fields: {
        title: { type: "text" },
        metaTitle: { type: "text", admin: { group: "SEO" } },
      },
    };
    render(() => <CollectionEdit config={config} onSubmit={() => {}} />);
    const legend = screen.getByText("SEO");
    expect(legend.tagName).toBe("LEGEND");
  });

  it("renders a half-width field as a single grid column on md+", () => {
    const config: CollectionConfig = {
      slug: "pages",
      fields: { title: { type: "text", admin: { width: "half" } } },
    };
    render(() => <CollectionEdit config={config} onSubmit={() => {}} />);
    const control = screen.getByLabelText("Title").closest(".form-control");
    expect(control?.className).toContain("md:col-span-1");
  });

  it("renders an admin.readOnly text field as read-only", () => {
    const config: CollectionConfig = {
      slug: "pages",
      fields: { slug: { type: "text", admin: { readOnly: true } } },
    };
    render(() => <CollectionEdit config={config} onSubmit={() => {}} />);
    expect(screen.getByLabelText("Slug")).toHaveAttribute("readonly");
  });

  it("hides a field whose admin.condition is false, and shows it when true", () => {
    const config: CollectionConfig = {
      slug: "pages",
      fields: {
        kind: { type: "select", options: ["plain", "promo"] },
        promoCode: {
          type: "text",
          admin: {
            condition: (values) => values.kind === "promo",
          },
        },
      },
    };
    render(() => <CollectionEdit config={config} onSubmit={() => {}} />);
    expect(screen.queryByLabelText("Promo code")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Kind"), {
      target: { value: "promo" },
    });
    expect(screen.getByLabelText("Promo code")).toBeInTheDocument();
  });

  it("surfaces a ValidationBuilder error inline and blocks submit", async () => {
    const config: CollectionConfig = {
      slug: "pages",
      fields: {
        title: { type: "text", validation: (r) => r.required().min(2) },
      },
    };
    let submitted: Record<string, unknown> | undefined;
    render(() => (
      <CollectionEdit
        config={config}
        onSubmit={(v) => {
          submitted = v;
        }}
      />
    ));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/not be empty/i)).toBeInTheDocument();
    expect(submitted).toBeUndefined();

    // Filling a valid value clears the error and lets the submit through.
    fireEvent.input(screen.getByLabelText("Title"), {
      target: { value: "Home" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() => expect(submitted).toEqual({ title: "Home" }));
  });
});
