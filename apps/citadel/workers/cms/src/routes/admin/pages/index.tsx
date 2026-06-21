import { CollectionList } from "@core/components/cms/CollectionList";
import { createQuery } from "@tanstack/solid-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/solid-router";
import { Show } from "solid-js";
import { pagesCollection } from "../../../../../../citadel.config.js";
import { getPages } from "../../../server-functions/pages";

export const Route = createFileRoute("/admin/pages/")({
  component: PagesPage,
});

function PagesPage() {
  const navigate = useNavigate();
  const pages = createQuery(() => ({
    queryKey: ["pages"],
    queryFn: () => getPages(),
  }));

  return (
    <div class="flex flex-col gap-4">
      <div class="flex items-center justify-between">
        <h1 class="text-xl font-semibold">Pages</h1>
        <Link to="/admin/pages/new" class="btn btn-primary btn-sm">
          New page
        </Link>
      </div>
      <Show
        when={!pages.isLoading}
        fallback={<div class="loading loading-spinner" />}
      >
        <CollectionList
          config={pagesCollection}
          rows={pages.data ?? []}
          onRowClick={(row) =>
            navigate({
              to: "/admin/pages/$pageId",
              params: { pageId: String(row.id) },
            })
          }
        />
      </Show>
    </div>
  );
}
