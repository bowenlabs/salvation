import { createFileRoute, Outlet, redirect } from "@tanstack/solid-router";
import { requireAuth } from "../../../app/middleware";

export const Route = createFileRoute("/admin")({
  beforeLoad: async () => {
    const user = await requireAuth();
    if (!user) throw redirect({ to: "/login" });
    return { user };
  },
  component: () => <Outlet />,
});
