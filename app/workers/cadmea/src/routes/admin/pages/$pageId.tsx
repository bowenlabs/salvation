import { CollectionEdit } from "@core/components/cms/CollectionEdit";
import {
  createMutation,
  createQuery,
  useQueryClient,
} from "@tanstack/solid-query";
import { createFileRoute, useNavigate } from "@tanstack/solid-router";
import { createSignal, Show } from "solid-js";
import { pagesCollection } from "../../../../../../cadmea.config.js";
import {
  deletePage,
  getPage,
  updatePage,
} from "../../../server-functions/pages";

export const Route = createFileRoute("/admin/pages/$pageId")({
  component: EditPagePage,
});

function EditPagePage() {
  const params = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = createSignal<string>();

  const id = () => Number(params().pageId);

  const page = createQuery(() => ({
    queryKey: ["pages", id()],
    queryFn: () => getPage({ data: id() }),
  }));

  const update = createMutation(() => ({
    mutationFn: (values: Record<string, unknown>) =>
      updatePage({ data: { id: id(), values } }),
    onSuccess: () => {
      setError(undefined);
      queryClient.invalidateQueries({ queryKey: ["pages"] });
    },
    onError: (e: Error) => setError(e.message),
  }));

  const remove = createMutation(() => ({
    mutationFn: () => deletePage({ data: id() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pages"] });
      navigate({ to: "/admin/pages" });
    },
    onError: (e: Error) => setError(e.message),
  }));

  return (
    <div class="flex flex-col gap-4">
      <h1 class="text-xl font-semibold">Edit page</h1>
      <Show when={page.data}>
        <CollectionEdit
          config={pagesCollection}
          initialValues={page.data}
          submitLabel="Save changes"
          error={error()}
          onSubmit={(values) => update.mutate(values)}
        />
      </Show>
      <button
        type="button"
        class="btn btn-error btn-outline btn-sm self-start"
        onClick={() => remove.mutate()}
      >
        Delete page
      </button>
    </div>
  );
}
