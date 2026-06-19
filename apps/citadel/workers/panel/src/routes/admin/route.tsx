import { createFileRoute, Outlet, redirect } from "@tanstack/solid-router";
import { getLoginUrl, requireAuth } from "../../../app/middleware";

export const Route = createFileRoute("/admin")({
  beforeLoad: async ({ location }) => {
    const user = await requireAuth();
    if (!user) {
      // Login lives in Worker 1 (Astro SSR), not here — see CLAUDE.md
      // "Authentication" and Phase 0 milestone 0.6. `href` (not `to`)
      // is required for a cross-Worker redirect.
      const href = await getLoginUrl({ data: location.href });
      throw redirect({ href });
    }
    return { user };
  },
  component: () => <Outlet />,
});
