import { createQuery } from "@tanstack/solid-query";
import { createFileRoute } from "@tanstack/solid-router";
import { Show } from "solid-js";
import { getPages } from "../../../server-functions/pages";

export const Route = createFileRoute("/admin/pages/")({
  component: PagesPage,
});

function PagesPage() {
  const pages = createQuery(() => ({
    queryKey: ["pages"],
    queryFn: () => getPages(),
    // pages type inferred from Drizzle schema — no manual typing
  }));

  return (
    <Show
      when={!pages.isLoading}
      fallback={<div class="loading loading-spinner" />}
    >
      <pre>{JSON.stringify(pages.data, null, 2)}</pre>
    </Show>
  );
}
