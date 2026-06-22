import { CollectionEdit } from "@core/components/cms/CollectionEdit";
import { createMutation, useQueryClient } from "@tanstack/solid-query";
import { createFileRoute, useNavigate } from "@tanstack/solid-router";
import { createSignal } from "solid-js";
import { pagesCollection } from "../../../../../../cadmea.config.js";
import { createPage } from "../../../server-functions/pages";

export const Route = createFileRoute("/admin/pages/new")({
  component: NewPagePage,
});

function NewPagePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = createSignal<string>();

  const create = createMutation(() => ({
    mutationFn: (values: Record<string, unknown>) =>
      createPage({ data: values }),
    onSuccess: (created: { id: number }) => {
      queryClient.invalidateQueries({ queryKey: ["pages"] });
      navigate({
        to: "/admin/pages/$pageId",
        params: { pageId: String(created.id) },
      });
    },
    onError: (e: Error) => setError(e.message),
  }));

  return (
    <div class="flex flex-col gap-4">
      <h1 class="text-xl font-semibold">New page</h1>
      <CollectionEdit
        config={pagesCollection}
        submitLabel="Create page"
        error={error()}
        onSubmit={(values) => create.mutate(values)}
      />
    </div>
  );
}
