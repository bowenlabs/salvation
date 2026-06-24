import type { ErrorComponentProps } from "@tanstack/solid-router";
import { createFileRoute, Outlet, redirect } from "@tanstack/solid-router";
import {
  getLoginUrl,
  getLogoutUrl,
  getPublicSiteUrl,
  requireAuth,
} from "../../../app/middleware";
import PanelShell from "../../components/PanelShell";
import { getCadmeaSiteSettings } from "../../server-functions/site-settings";

// beforeLoad calls requireAuth(), a server function — must never be
// statically prerendered. See scripts/check-prerender.ts.
export const prerender = false;

// Registers admin-sw.js scoped to "/admin/" only — see that file's own
// comment. Runs client-side after hydration; failures are swallowed since
// PWA install is an enhancement, not a requirement to use the panel.
const SW_REGISTER_SCRIPT = `if ('serviceWorker' in navigator) { navigator.serviceWorker.register('/admin-sw.js', { scope: '/admin/' }).catch(function(){}); }`;

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "Cadmea" },
    ],
    links: [
      { rel: "manifest", href: "/admin/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/logo192.png" },
    ],
  }),
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
  // Re-fetches settings/URLs rather than reading __root.tsx's loader data —
  // those server functions are cheap (single D1 select / env var read) and
  // there's no parent-loaderData accessor in TanStack Router, only context.
  loader: async () => {
    const [settings, publicSiteUrl, logoutUrl] = await Promise.all([
      getCadmeaSiteSettings(),
      getPublicSiteUrl(),
      getLogoutUrl(),
    ]);
    return { settings, publicSiteUrl, logoutUrl };
  },
  component: AdminLayout,
  errorComponent: AdminErrorBoundary,
});

function AdminLayout() {
  const data = Route.useLoaderData();

  return (
    <>
      {/* Same inline-script pattern as __root.tsx's THEME_INIT_SCRIPT —
          runs after hydration, scoped to "/admin/" only. */}
      <script innerHTML={SW_REGISTER_SCRIPT} />
      <PanelShell
        siteName={data().settings?.siteName ?? "Cadmea"}
        publicSiteUrl={data().publicSiteUrl}
        logoutUrl={data().logoutUrl}
      >
        <Outlet />
      </PanelShell>
    </>
  );
}

// Catches thrown errors anywhere in /admin/* — loaders, server functions,
// or render. Reset re-runs the failing route's loader rather than a full
// page reload, matching TanStack Router's default retry contract.
function AdminErrorBoundary(props: ErrorComponentProps) {
  return (
    <div class="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-[var(--spacing-container-x)] text-center">
      <h1 class="font-display text-4xl font-semibold">Something went wrong</h1>
      <p class="text-lg opacity-80">{props.error.message}</p>
      <button
        type="button"
        class="btn btn-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        onClick={() => props.reset()}
      >
        Try again
      </button>
    </div>
  );
}
