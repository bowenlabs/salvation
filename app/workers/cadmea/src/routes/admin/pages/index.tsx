import { createQuery } from "@tanstack/solid-query";
import { createFileRoute, useNavigate } from "@tanstack/solid-router";
import { createCollectionListPage } from "@thebes/cadmea/tanstack-start";
import { pagesCollection } from "../../../../../../cadmea.config.js";
import { getPageCapabilities, getPages } from "../../../server-functions/pages";

// getPages() is called from createCollectionListPage's createQuery (in
// the component body, not a loader/beforeLoad) — that call still needs
// request-time `cloudflare:workers` env, which doesn't exist at build
// time. Without this, TanStack Start prerenders the route statically and
// the component never hydrates client-side — see issue #19.
export const prerender = false;

export const Route = createFileRoute("/admin/pages/")({
  component: PagesPage,
});

function PagesPage() {
  const navigate = useNavigate();

  const capabilities = createQuery(() => ({
    queryKey: ["pages", "capabilities"],
    queryFn: () => getPageCapabilities(),
  }));

  const Page = createCollectionListPage({
    collection: pagesCollection,
    label: "Pages",
    queryKey: ["pages"],
    queryFn: (params) => getPages({ data: params }),
    newHref: "/admin/pages/new",
    newLabel: "New page",
    onRowClick: (row) =>
      navigate({
        to: "/admin/pages/$pageId",
        params: { pageId: String(row.id) },
      }),
    capabilities: () => capabilities.data,
  });

  return <Page />;
}
