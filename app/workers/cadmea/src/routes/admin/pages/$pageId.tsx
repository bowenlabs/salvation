import { createCollectionEditPage } from "@bowenlabs/cadmea/tanstack-start";
import { createFileRoute, useNavigate } from "@tanstack/solid-router";
import { pagesCollection } from "../../../../../../cadmea.config.js";
import { uploadMediaFile } from "../../../lib/upload-media";
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
  const id = () => Number(params().pageId);

  const Page = createCollectionEditPage({
    collection: pagesCollection,
    label: "Edit page",
    deleteLabel: "Delete page",
    queryKey: () => ["pages", id()],
    queryFn: () => getPage({ data: id() }),
    updateFn: (values) => updatePage({ data: { id: id(), values } }),
    deleteFn: () => deletePage({ data: id() }),
    invalidateQueryKey: ["pages"],
    onDeleted: () => navigate({ to: "/admin/pages" }),
    onUploadFile: uploadMediaFile,
  });

  return <Page />;
}
