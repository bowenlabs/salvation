import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@solidjs/testing-library";
import type { CollectionConfig } from "@thebes/cadmus/cms";
import { BLOCK_KEY } from "@thebes/cadmus/cms";
import { createSignal, Show } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type BlockFocusTarget, CollectionEdit } from "./CollectionEdit.js";

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

  it("renders a relationship field as a searchable combobox, submitting the chosen id", async () => {
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
    const combobox = screen.getByLabelText("Author id") as HTMLInputElement;
    expect(combobox).toHaveAttribute("role", "combobox");
    // Filter to "Grace", then pick it from the listbox.
    fireEvent.focus(combobox);
    fireEvent.input(combobox, { target: { value: "gra" } });
    expect(screen.queryByText("Ada")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Grace"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() => expect(submitted).toEqual({ authorId: 2 }));
  });

  it("renders a hasMany relationship as a multi-select, adding and removing chips", async () => {
    const config: CollectionConfig = {
      slug: "posts",
      fields: {
        tagIds: { type: "relationship", relationTo: "tags", hasMany: true },
      },
    };
    let submitted: Record<string, unknown> | undefined;
    render(() => (
      <CollectionEdit
        config={config}
        relationshipOptions={{
          tags: [
            { id: 1, label: "React" },
            { id: 2, label: "Solid" },
          ],
        }}
        onSubmit={(values) => {
          submitted = values;
        }}
      />
    ));
    const combobox = screen.getByLabelText("Tag ids") as HTMLInputElement;
    fireEvent.focus(combobox);
    fireEvent.click(screen.getByText("React"));
    fireEvent.click(screen.getByText("Solid"));
    // Both selected as chips; removing one leaves the other.
    fireEvent.click(screen.getByRole("button", { name: "Remove React" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() => expect(submitted).toEqual({ tagIds: [2] }));
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
    await vi.waitFor(() =>
      expect(submitted).toEqual({ links: [{ label: "First" }] }),
    );
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

  it("clears dirty state after a successful save (re-baselines to saved values)", async () => {
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
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    // After a successful submit the form re-baselines to the saved values, so
    // the unsaved-changes guard clears. Without the reset it would stay dirty
    // forever — the bug this guards against.
    await vi.waitFor(() => expect(dirtyStates.at(-1)).toBe(false));
  });

  it("stays dirty after a failed save (onSubmit throws)", async () => {
    const dirtyStates: boolean[] = [];
    render(() => (
      <CollectionEdit
        config={pagesCollection}
        initialValues={{ title: "Home" }}
        onSubmit={() => {
          throw new Error("save failed");
        }}
        onDirtyChange={(dirty) => dirtyStates.push(dirty)}
      />
    ));
    fireEvent.input(screen.getByLabelText("Title *"), {
      target: { value: "Changed" },
    });
    expect(dirtyStates.at(-1)).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    // A failed save must leave the guard armed so the user can retry.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(dirtyStates.at(-1)).toBe(true);
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
      fields: {
        metaDescription: { type: "text", admin: { label: "SEO blurb" } },
      },
    };
    render(() => <CollectionEdit config={config} onSubmit={() => {}} />);
    expect(screen.getByLabelText("SEO blurb")).toBeInTheDocument();
  });

  it("renders admin.description as help text", () => {
    const config: CollectionConfig = {
      slug: "pages",
      fields: {
        title: {
          type: "text",
          admin: { description: "Shown in the browser tab" },
        },
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

describe("CollectionEdit — create-form behaviors (#98)", () => {
  it("seeds a field from admin.defaultFrom and lets the user override it", async () => {
    const config: CollectionConfig = {
      slug: "pages",
      fields: {
        kind: { type: "select", options: ["", "wildlife", "landscape"] },
        title: { type: "text", admin: { defaultFrom: { field: "kind" } } },
      },
    };
    render(() => <CollectionEdit config={config} onSubmit={() => {}} />);
    const title = () => screen.getByLabelText("Title") as HTMLInputElement;
    expect(title().value).toBe("");

    // Picking a source value seeds the pristine target…
    fireEvent.change(screen.getByLabelText("Kind"), {
      target: { value: "wildlife" },
    });
    await vi.waitFor(() => expect(title().value).toBe("wildlife"));

    // …switching the source re-seeds while the target is still untouched…
    fireEvent.change(screen.getByLabelText("Kind"), {
      target: { value: "landscape" },
    });
    await vi.waitFor(() => expect(title().value).toBe("landscape"));

    // …but a value the user typed is never clobbered.
    fireEvent.input(title(), { target: { value: "My own title" } });
    fireEvent.change(screen.getByLabelText("Kind"), {
      target: { value: "wildlife" },
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(title().value).toBe("My own title");
  });

  it("defaults a title from a relationship's selected option label", async () => {
    const config: CollectionConfig = {
      slug: "pages",
      fields: {
        category: { type: "relationship", relationTo: "categories" },
        title: {
          type: "text",
          admin: {
            defaultFrom: { field: "category", map: ({ label }) => label },
          },
        },
      },
    };
    render(() => (
      <CollectionEdit
        config={config}
        relationshipOptions={{
          categories: [
            { id: 1, label: "Wildlife" },
            { id: 2, label: "Landscapes" },
          ],
        }}
        onSubmit={() => {}}
      />
    ));
    fireEvent.focus(screen.getByLabelText("Category"));
    fireEvent.click(screen.getByRole("option", { name: "Wildlife" }));
    await vi.waitFor(() =>
      expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe(
        "Wildlife",
      ),
    );
  });

  it("appends an admin.appendOnCreate array item on create, but not on edit", async () => {
    const config: CollectionConfig = {
      slug: "pages",
      fields: {
        id: { type: "number", autoIncrement: true },
        template: { type: "select", options: ["default", "portfolio"] },
        blocks: {
          type: "array",
          fields: { type: { type: "select", options: ["portfolioGallery"] } },
          admin: {
            appendOnCreate: {
              when: (v) => v.template === "portfolio",
              item: (v) => ({
                type: "portfolioGallery",
                category: v.category ?? null,
              }),
            },
          },
        },
      },
    };

    // Create: when the condition holds, the derived block is appended at submit.
    let created: Record<string, unknown> | undefined;
    render(() => (
      <CollectionEdit
        config={config}
        onSubmit={(v) => {
          created = v;
        }}
      />
    ));
    fireEvent.change(screen.getByLabelText("Template"), {
      target: { value: "portfolio" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() =>
      expect(created).toEqual({
        template: "portfolio",
        blocks: [{ type: "portfolioGallery", category: null }],
      }),
    );

    cleanup();

    // Edit (initialValues carry an id → operation "update"): never appends.
    let updated: Record<string, unknown> | undefined;
    render(() => (
      <CollectionEdit
        config={config}
        initialValues={{ id: 5, template: "portfolio" }}
        onSubmit={(v) => {
          updated = v;
        }}
      />
    ));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() => expect(updated).toBeDefined());
    expect(updated).not.toHaveProperty("blocks");
  });
});

describe("CollectionEdit — visual block builder (B)", () => {
  const blocksConfig: CollectionConfig = {
    slug: "pages",
    fields: {
      blocks: {
        type: "array",
        fields: { type: { type: "select", options: ["hero", "text"] } },
        discriminator: {
          key: "type",
          variants: {
            hero: { heading: { type: "text", required: true } },
            text: { body: { type: "text" } },
          },
          variantsAdmin: {
            hero: { label: "Hero banner", icon: "ph ph-image" },
          },
        },
      },
    },
  };

  it("offers an Add-block picker with one entry per variant (admin label or humanized)", () => {
    render(() => <CollectionEdit config={blocksConfig} onSubmit={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Add block" }));
    expect(
      screen.getByRole("button", { name: "Hero banner" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Text" })).toBeInTheDocument();
  });

  it("adds a block of the chosen variant, presetting its type and showing its fields", () => {
    render(() => <CollectionEdit config={blocksConfig} onSubmit={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Add block" }));
    fireEvent.click(screen.getByRole("button", { name: "Hero banner" }));
    // The hero variant's field is shown, and the block header reflects the type.
    expect(screen.getByLabelText("Heading *")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Hero banner" }),
    ).toBeInTheDocument();
  });

  it("stamps a stable, non-numeric _key on each new block", async () => {
    let submitted: Record<string, unknown> | undefined;
    render(() => (
      <CollectionEdit config={blocksConfig} onSubmit={(v) => (submitted = v)} />
    ));
    fireEvent.click(screen.getByRole("button", { name: "Add block" }));
    fireEvent.click(screen.getByRole("button", { name: "Hero banner" }));
    fireEvent.input(screen.getByLabelText("Heading *"), {
      target: { value: "Hi" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() => expect(submitted).toBeDefined());
    const blocks = (submitted as { blocks: Record<string, unknown>[] }).blocks;
    expect(blocks[0]).toMatchObject({ type: "hero", heading: "Hi" });
    expect(blocks[0][BLOCK_KEY]).toEqual(expect.any(String));
    // Non-numeric so the studio can tell `blocks.<_key>` from `blocks.<index>`.
    expect(String(blocks[0][BLOCK_KEY])).not.toMatch(/^\d+$/);
  });

  it("gives a duplicated block its own _key, not the source's", async () => {
    let submitted: Record<string, unknown> | undefined;
    render(() => (
      <CollectionEdit config={blocksConfig} onSubmit={(v) => (submitted = v)} />
    ));
    fireEvent.click(screen.getByRole("button", { name: "Add block" }));
    fireEvent.click(screen.getByRole("button", { name: "Text" }));
    fireEvent.input(screen.getByLabelText("Body"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() => expect(submitted).toBeDefined());
    const blocks = (submitted as { blocks: Record<string, unknown>[] }).blocks;
    expect(blocks).toHaveLength(2);
    expect(blocks[0][BLOCK_KEY]).not.toBe(blocks[1][BLOCK_KEY]);
  });

  it("expands and reveals a collapsed block when focusBlock targets its _key", () => {
    const key = "btarget01";
    const [focus, setFocus] = createSignal<BlockFocusTarget>();
    render(() => (
      <CollectionEdit
        config={blocksConfig}
        initialValues={{
          blocks: [{ type: "hero", heading: "Find me", [BLOCK_KEY]: key }],
        }}
        focusBlock={focus()}
        onSubmit={() => {}}
      />
    ));
    // Collapse the block so its input is hidden.
    fireEvent.click(screen.getByRole("button", { name: "Hero banner" }));
    expect(screen.queryByLabelText("Heading *")).not.toBeInTheDocument();
    // A focus request for its key re-expands it.
    setFocus({ field: "blocks", key, nonce: 1 });
    expect(screen.getByLabelText("Heading *")).toBeInTheDocument();
  });

  it("reorders blocks with Move down, reflecting the new order on submit", async () => {
    const config: CollectionConfig = {
      slug: "pages",
      fields: { items: { type: "array", fields: { label: { type: "text" } } } },
    };
    let submitted: Record<string, unknown> | undefined;
    render(() => (
      <CollectionEdit config={config} onSubmit={(v) => (submitted = v)} />
    ));
    fireEvent.click(screen.getByRole("button", { name: "Add Items" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Items" }));
    const labels = screen.getAllByLabelText("Label");
    fireEvent.input(labels[0], { target: { value: "A" } });
    fireEvent.input(labels[1], { target: { value: "B" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Move down" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() =>
      expect(submitted).toEqual({ items: [{ label: "B" }, { label: "A" }] }),
    );
  });

  it("duplicates a block", async () => {
    const config: CollectionConfig = {
      slug: "pages",
      fields: { items: { type: "array", fields: { label: { type: "text" } } } },
    };
    let submitted: Record<string, unknown> | undefined;
    render(() => (
      <CollectionEdit config={config} onSubmit={(v) => (submitted = v)} />
    ));
    fireEvent.click(screen.getByRole("button", { name: "Add Items" }));
    fireEvent.input(screen.getByLabelText("Label"), { target: { value: "A" } });
    fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() =>
      expect(submitted).toEqual({ items: [{ label: "A" }, { label: "A" }] }),
    );
  });

  it("collapses a block to hide its fields", () => {
    const config: CollectionConfig = {
      slug: "pages",
      fields: { items: { type: "array", fields: { label: { type: "text" } } } },
    };
    render(() => <CollectionEdit config={config} onSubmit={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Add Items" }));
    expect(screen.getByLabelText("Label")).toBeInTheDocument();
    // The header toggle is named after the block (the array label here).
    fireEvent.click(screen.getByRole("button", { name: "Items" }));
    expect(screen.queryByLabelText("Label")).not.toBeInTheDocument();
  });

  it("shows the variant's admin.icon as a tile in the block row", () => {
    render(() => (
      <CollectionEdit
        config={blocksConfig}
        initialValues={{
          blocks: [{ type: "hero", heading: "Hi", [BLOCK_KEY]: "k1" }],
        }}
        onSubmit={() => {}}
      />
    ));
    const icon = document.querySelector(".cadmea-block-icon i");
    expect(icon).toHaveClass("ph", "ph-image");
  });

  it("starts existing blocks collapsed when collapseBlocksByDefault is set", () => {
    render(() => (
      <CollectionEdit
        config={blocksConfig}
        initialValues={{
          blocks: [{ type: "hero", heading: "Hi", [BLOCK_KEY]: "k1" }],
        }}
        collapseBlocksByDefault
        onSubmit={() => {}}
      />
    ));
    // Collapsed → the hero's Heading input is hidden, but the row still shows.
    expect(screen.queryByLabelText("Heading *")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Hero banner" }),
    ).toBeInTheDocument();
  });
});

describe("CollectionEdit — autosave (D)", () => {
  const versioned: CollectionConfig = {
    slug: "pages",
    fields: { title: { type: "text", required: true } },
    versions: { drafts: true },
  };

  it("debounce-autosaves the draft after an edit when autosave is on", async () => {
    vi.useFakeTimers();
    try {
      let saved: Record<string, unknown> | undefined;
      render(() => (
        <CollectionEdit
          config={versioned}
          initialValues={{ title: "Home" }}
          onSubmit={() => {}}
          draftActions={{
            onSaveDraft: (v) => {
              saved = v;
            },
            autosave: true,
            autosaveMs: 500,
          }}
        />
      ));
      fireEvent.input(screen.getByLabelText("Title *"), {
        target: { value: "Updated" },
      });
      expect(saved).toBeUndefined(); // not yet — still debouncing
      await vi.advanceTimersByTimeAsync(500);
      expect(saved).toEqual({ title: "Updated" });
      expect(screen.getByText("Saved")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not autosave when the flag is off", async () => {
    vi.useFakeTimers();
    try {
      let saved: Record<string, unknown> | undefined;
      render(() => (
        <CollectionEdit
          config={versioned}
          initialValues={{ title: "Home" }}
          onSubmit={() => {}}
          draftActions={{
            onSaveDraft: (v) => {
              saved = v;
            },
          }}
        />
      ));
      fireEvent.input(screen.getByLabelText("Title *"), {
        target: { value: "Updated" },
      });
      await vi.advanceTimersByTimeAsync(2000);
      expect(saved).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("autosaves unchanged content only once even when draftActions is reactive", async () => {
    // Reproduces the studio integration: createCollectionEditPage passes
    // draftActions as a reactive getter whose `saving` reads the saveDraft
    // mutation's isPending (built eagerly here, same as the real getter).
    // Reading it inside the autosave effect subscribes the effect to that
    // signal, so each save (isPending toggling) re-runs the effect — and
    // because the draft path never re-baselines `dirty`, it used to re-arm the
    // debounce forever, hammering the server. The guard must save the same
    // content only once.
    vi.useFakeTimers();
    try {
      const [pending, setPending] = createSignal(false);
      let saveCount = 0;
      // A function call in the JSX prop → Solid wraps it in a reactive getter,
      // so `pending()` is read (and tracked) on every props.draftActions access.
      const buildDraftActions = () => ({
        saving: pending(),
        onSaveDraft: () => {
          saveCount += 1;
        },
        autosave: true,
        autosaveMs: 500,
      });
      render(() => (
        <CollectionEdit
          config={versioned}
          initialValues={{ title: "Home" }}
          onSubmit={() => {}}
          draftActions={buildDraftActions()}
        />
      ));
      fireEvent.input(screen.getByLabelText("Title *"), {
        target: { value: "Updated" },
      });
      await vi.advanceTimersByTimeAsync(500);
      expect(saveCount).toBe(1);
      // Flip isPending true→false as a real save would when it settles: this
      // re-runs the effect. The content is unchanged, so it must not re-fire.
      setPending(true);
      await vi.advanceTimersByTimeAsync(0);
      setPending(false);
      await vi.advanceTimersByTimeAsync(1000);
      expect(saveCount).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("CollectionEdit — live preview (D)", () => {
  it("emits editable values on change via onValuesChange", () => {
    const seen: Record<string, unknown>[] = [];
    render(() => (
      <CollectionEdit
        config={pagesCollection}
        onSubmit={() => {}}
        onValuesChange={(v) => seen.push(v)}
      />
    ));
    fireEvent.input(screen.getByLabelText("Title *"), {
      target: { value: "Hi" },
    });
    expect(seen.at(-1)).toEqual({ title: "Hi" });
  });
});

describe("CollectionEdit — publish confirmation (E)", () => {
  const versioned: CollectionConfig = {
    slug: "pages",
    fields: { title: { type: "text", required: true } },
    versions: { drafts: true },
  };

  it("confirms before publishing when confirmPublish is set", () => {
    let published = false;
    render(() => (
      <CollectionEdit
        config={versioned}
        onSubmit={() => {}}
        draftActions={{
          onSaveDraft: () => {},
          onPublish: () => {
            published = true;
          },
          canPublish: true,
          confirmPublish: true,
        }}
      />
    ));
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(published).toBe(false); // dialog first
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Publish" }));
    expect(published).toBe(true);
  });

  it("publishes immediately without confirmPublish", () => {
    let published = false;
    render(() => (
      <CollectionEdit
        config={versioned}
        onSubmit={() => {}}
        draftActions={{
          onSaveDraft: () => {},
          onPublish: () => {
            published = true;
          },
          canPublish: true,
        }}
      />
    ));
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(published).toBe(true);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("CollectionEdit — editor chrome slots (F)", () => {
  it("moves sidebarFields out of the main column, into the rail", () => {
    render(() => (
      <CollectionEdit
        config={pagesCollection}
        sidebarFields={["status"]}
        renderSidebar={(api) => (
          <input
            aria-label="Rail status"
            value={(api.values.status as string) ?? ""}
            onInput={(e) => api.setValue("status", e.currentTarget.value)}
          />
        )}
        onSubmit={() => {}}
      />
    ));
    // Title stays in the main column; the default Status select is gone —
    // the rail owns it now.
    expect(screen.getByLabelText("Title *")).toBeInTheDocument();
    expect(screen.queryByLabelText("Status *")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Rail status")).toBeInTheDocument();
  });

  it("lets renderSidebar edit the shared form via setValue, submitting the change", async () => {
    let submitted: Record<string, unknown> | undefined;
    render(() => (
      <CollectionEdit
        config={pagesCollection}
        initialValues={{ title: "Home", status: "draft" }}
        sidebarFields={["status"]}
        renderSidebar={(api) => (
          <button
            type="button"
            onClick={() => api.setValue("status", "published")}
          >
            Publish toggle
          </button>
        )}
        onSubmit={(v) => {
          submitted = v;
        }}
      />
    ));
    fireEvent.click(screen.getByRole("button", { name: "Publish toggle" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() =>
      expect(submitted).toEqual({ title: "Home", status: "published" }),
    );
  });

  it("renders a custom header and suppresses the default bottom action bar", async () => {
    let submitted: Record<string, unknown> | undefined;
    render(() => (
      <CollectionEdit
        config={pagesCollection}
        initialValues={{ title: "Home", status: "draft" }}
        renderHeader={(api) => (
          <button type="button" disabled={!api.dirty} onClick={api.save}>
            Header save
          </button>
        )}
        onSubmit={(v) => {
          submitted = v;
        }}
      />
    ));
    // The default bottom Save button is gone; the header owns the action.
    expect(
      screen.queryByRole("button", { name: "Save" }),
    ).not.toBeInTheDocument();
    const headerSave = screen.getByRole("button", { name: "Header save" });
    expect(headerSave).toBeDisabled(); // not dirty yet
    fireEvent.input(screen.getByLabelText("Title *"), {
      target: { value: "Updated" },
    });
    expect(headerSave).not.toBeDisabled();
    fireEvent.click(headerSave);
    await vi.waitFor(() =>
      expect(submitted).toEqual({ title: "Updated", status: "draft" }),
    );
  });

  it("exposes draft actions to a custom header for versioned collections", () => {
    const versionedCollection: CollectionConfig = {
      ...pagesCollection,
      versions: { drafts: true },
    };
    let published = false;
    render(() => (
      <CollectionEdit
        config={versionedCollection}
        initialValues={{ title: "Home" }}
        renderHeader={(api) => (
          <Show when={api.draft}>
            {(draft) => (
              <button
                type="button"
                disabled={!draft().canPublish}
                onClick={draft().publish}
              >
                Header publish
              </button>
            )}
          </Show>
        )}
        draftActions={{
          onSaveDraft: () => {},
          onPublish: () => {
            published = true;
          },
          canPublish: true,
        }}
        onSubmit={() => {}}
      />
    ));
    fireEvent.click(screen.getByRole("button", { name: "Header publish" }));
    expect(published).toBe(true);
  });
});
