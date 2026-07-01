import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { QueryClient, QueryClientProvider } from "@tanstack/solid-query";
import type { CollectionConfig } from "@thebes/cadmus/cms";
import { afterEach, describe, expect, it } from "vitest";
import { createCollectionCreatePage } from "./create.js";

afterEach(cleanup);

// createCollectionCreatePage uses useQueryClient (createMutation) but no router,
// so a bare QueryClientProvider is enough — unlike the edit factory's useBlocker.
function renderPage(Page: () => unknown) {
  const queryClient = new QueryClient();
  render(() => (
    <QueryClientProvider client={queryClient}>
      {(Page as () => never)()}
    </QueryClientProvider>
  ));
}

describe("createCollectionCreatePage", () => {
  it("forwards relationshipOptions so a create form can populate a relationship picker", () => {
    const config: CollectionConfig = {
      slug: "pages",
      fields: {
        category: { type: "relationship", relationTo: "categories" },
      },
    };
    const Page = createCollectionCreatePage({
      collection: config,
      createFn: async (v) => ({ id: 1, ...v }),
      invalidateQueryKey: ["pages"],
      relationshipOptions: {
        categories: [
          { id: 1, label: "Wildlife" },
          { id: 2, label: "Landscapes" },
        ],
      },
    });
    renderPage(Page);
    // Open the category combobox — the forwarded options render as listbox items.
    // Without the forward, the picker would have no options at create time.
    fireEvent.focus(screen.getByLabelText("Category"));
    expect(
      screen.getByRole("option", { name: "Wildlife" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Landscapes" }),
    ).toBeInTheDocument();
  });
});
