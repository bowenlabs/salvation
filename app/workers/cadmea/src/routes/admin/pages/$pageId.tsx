import { createFileRoute, useNavigate } from "@tanstack/solid-router";
import { createCollectionEditPage } from "@thebes/cadmea/tanstack-start";
import { pagesCollection } from "../../../../../../cadmea.config.js";
import { uploadMediaFile } from "../../../lib/upload-media";
import {
  deletePage,
  getPage,
  publishPage,
  saveDraft,
  updatePage,
} from "../../../server-functions/pages";

// See admin/pages/index.tsx's comment — same prerender hazard, same fix.
export const prerender = false;

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
    // pagesCollection has versions.drafts: true (app/cadmea.config.ts) —
    // see CollectionEdit's draftActions doc for why this replaces the
    // generic Save button with Save draft/Publish.
    draftActions: {
      saveDraftFn: (values) => saveDraft({ data: { id: id(), values } }),
      publishFn: (versionId) => publishPage({ data: versionId }),
    },
  });

  return <Page />;
}
