import { createFileRoute, useNavigate } from "@tanstack/solid-router";
import { createCollectionCreatePage } from "@thebes/cadmea/tanstack-start";
import { pagesCollection } from "../../../../../../cadmea.config.js";
import { uploadMediaFile } from "../../../lib/upload-media";
import { createPage } from "../../../server-functions/pages";

// See admin/pages/index.tsx's comment — same prerender hazard, same fix.
export const prerender = false;

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
