import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@solidjs/testing-library";
import { QueryClient, QueryClientProvider } from "@tanstack/solid-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/solid-router";
import type { CollectionConfig } from "@thebes/cadmus/cms";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCollectionEditPage } from "./edit.js";

const pagesCollection: CollectionConfig = {
  slug: "pages",
  fields: {
    id: { type: "number", autoIncrement: true },
    title: { type: "text", required: true },
  },
};

const versionedPagesCollection: CollectionConfig = {
  ...pagesCollection,
  versions: { drafts: true },
};

afterEach(cleanup);

// Same single-route memory-router harness as list.test.tsx — needed
// because createCollectionEditPage's returned component calls
// useBlocker(), which requires real router context.
function renderPage(Page: () => unknown) {
  const rootRoute = createRootRoute({ component: Page as never });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  const queryClient = new QueryClient();
  render(() => (
    <QueryClientProvider client={queryClient}>
      {/* biome-ignore lint/suspicious/noExplicitAny: test-only router/router-tree mismatch, same shortcut used in list.test.tsx */}
      <RouterProvider router={router as any} />
    </QueryClientProvider>
  ));
}

function buildOptions(
  capabilities?: () => { canUpdate?: boolean; canDelete?: boolean } | undefined,
) {
  return {
    collection: pagesCollection,
    queryKey: () => ["pages", 1],
    queryFn: async () => ({ id: 1, title: "Home" }),
    updateFn: async () => ({ id: 1, title: "Home" }),
    deleteFn: async () => ({ id: 1, title: "Home" }),
    invalidateQueryKey: ["pages"],
    capabilities,
  };
}

describe("createCollectionEditPage", () => {
  it("shows the Delete button when capabilities.canDelete is not false", async () => {
    const Page = createCollectionEditPage(
      buildOptions(() => ({ canDelete: true })),
    );
    renderPage(Page);
    expect(
      await screen.findByRole("button", { name: "Delete pages" }),
    ).toBeInTheDocument();
  });

  it("hides the Delete button when capabilities.canDelete is false", async () => {
    const Page = createCollectionEditPage(
      buildOptions(() => ({ canDelete: false })),
    );
    renderPage(Page);
    await waitFor(() =>
      expect(screen.getByLabelText("Title *")).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("button", { name: "Delete pages" }),
    ).not.toBeInTheDocument();
  });

  it("hides the Save button when capabilities.canUpdate is false", async () => {
    const Page = createCollectionEditPage(
      buildOptions(() => ({ canUpdate: false })),
    );
    renderPage(Page);
    await waitFor(() =>
      expect(screen.getByLabelText("Title *")).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("button", { name: "Save changes" }),
    ).not.toBeInTheDocument();
  });

  it("shows Save and Delete when capabilities is omitted (default allowed)", async () => {
    const Page = createCollectionEditPage(buildOptions());
    renderPage(Page);
    expect(
      await screen.findByRole("button", { name: "Save changes" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Delete pages" }),
    ).toBeInTheDocument();
  });

  it("resolves a preview URL via previewFn and opens it, only after a draft is saved", async () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    const previewFn = vi.fn(async (versionId: number) => ({
      url: `https://thebes-site.example/preview/pages/home?token=v${versionId}`,
    }));
    const Page = createCollectionEditPage({
      ...buildOptions(),
      collection: versionedPagesCollection,
      draftActions: {
        saveDraftFn: async () => ({ id: 7 }),
        publishFn: async () => ({}),
        previewFn,
      },
    });
    renderPage(Page);

    const previewButton = await screen.findByRole("button", {
      name: "Preview",
    });
    expect(previewButton).toBeDisabled();

    fireEvent.click(await screen.findByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(previewButton).not.toBeDisabled());

    fireEvent.click(previewButton);
    await waitFor(() =>
      expect(openSpy).toHaveBeenCalledWith(
        "https://thebes-site.example/preview/pages/home?token=v7",
        "_blank",
        "noopener,noreferrer",
      ),
    );
    expect(previewFn).toHaveBeenCalledWith(7);

    openSpy.mockRestore();
  });
});
