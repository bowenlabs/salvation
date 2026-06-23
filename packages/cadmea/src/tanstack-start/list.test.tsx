import { cleanup, render, screen, waitFor } from "@solidjs/testing-library";
import { QueryClient, QueryClientProvider } from "@tanstack/solid-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/solid-router";
import type { CollectionConfig } from "@thebes/cadmus/cms";
import { afterEach, describe, expect, it } from "vitest";
import { createCollectionListPage } from "./list.js";

const pagesCollection: CollectionConfig = {
  slug: "pages",
  fields: {
    id: { type: "number", autoIncrement: true },
    title: { type: "text", required: true },
  },
};

afterEach(cleanup);

// createCollectionListPage's returned component renders a <Link>, which
// needs real router context (not just a no-op mock) — a minimal
// single-route memory router is enough to satisfy that without pulling in
// the app's actual route tree.
function renderPage(Page: () => unknown) {
  const rootRoute = createRootRoute({ component: Page as never });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  const queryClient = new QueryClient();
  render(() => (
    <QueryClientProvider client={queryClient}>
      {/* biome-ignore lint/suspicious/noExplicitAny: test-only router/router-tree mismatch, same shortcut RouterProvider's own examples use for a single-route test harness */}
      <RouterProvider router={router as any} />
    </QueryClientProvider>
  ));
}

describe("createCollectionListPage", () => {
  it("shows the New link when capabilities.canCreate is not false", async () => {
    const Page = createCollectionListPage({
      collection: pagesCollection,
      queryKey: ["pages"],
      queryFn: async () => ({ rows: [], total: 0 }),
      newHref: "/admin/pages/new",
      newLabel: "New page",
      capabilities: () => ({ canCreate: true }),
    });
    renderPage(Page);
    expect(
      await screen.findByRole("link", { name: "New page" }),
    ).toBeInTheDocument();
  });

  it("hides the New link when capabilities.canCreate is false", async () => {
    const Page = createCollectionListPage({
      collection: pagesCollection,
      queryKey: ["pages"],
      queryFn: async () => ({ rows: [], total: 0 }),
      newHref: "/admin/pages/new",
      newLabel: "New page",
      capabilities: () => ({ canCreate: false }),
    });
    renderPage(Page);
    await waitFor(() =>
      expect(screen.queryByText("No pages yet.")).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("link", { name: "New page" }),
    ).not.toBeInTheDocument();
  });

  it("shows the New link when capabilities is omitted (default allowed)", async () => {
    const Page = createCollectionListPage({
      collection: pagesCollection,
      queryKey: ["pages"],
      queryFn: async () => ({ rows: [], total: 0 }),
      newHref: "/admin/pages/new",
      newLabel: "New page",
    });
    renderPage(Page);
    expect(
      await screen.findByRole("link", { name: "New page" }),
    ).toBeInTheDocument();
  });
});
