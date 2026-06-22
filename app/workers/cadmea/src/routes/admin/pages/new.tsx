import { createCollectionCreatePage } from "@bowenlabs/cadmea/tanstack-start";
import { createFileRoute, useNavigate } from "@tanstack/solid-router";
import { pagesCollection } from "../../../../../../cadmea.config.js";
import { uploadMediaFile } from "../../../lib/upload-media";
import { createPage } from "../../../server-functions/pages";

export const Route = createFileRoute("/admin/pages/new")({
  component: NewPagePage,
});

function NewPagePage() {
  const navigate = useNavigate();

  const Page = createCollectionCreatePage({
    collection: pagesCollection,
    label: "New page",
    submitLabel: "Create page",
    createFn: (values) => createPage({ data: values }),
    invalidateQueryKey: ["pages"],
    onCreated: (created) =>
      navigate({
        to: "/admin/pages/$pageId",
        params: { pageId: String(created.id) },
      }),
    onUploadFile: uploadMediaFile,
  });

  return <Page />;
}
