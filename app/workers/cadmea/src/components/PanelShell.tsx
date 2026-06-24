import { useNavigate } from "@tanstack/solid-router";
import { SearchPalette, type SearchPaletteResult } from "@thebes/cadmea";
import { createSignal, type JSX } from "solid-js";
import { searchCollections } from "../server-functions/search.js";
import PanelHeader from "./PanelHeader";
import PanelNav from "./PanelNav";

export interface PanelShellProps {
  siteName: string;
  publicSiteUrl: string;
  logoutUrl: string;
  children: JSX.Element;
}

// Owns mobile sidebar open/close state — the only state PanelNav/
// PanelHeader need to coordinate on. Theme (`data-theme`) is owned
// globally by <BrandColorProvider> in __root.tsx, not duplicated here.
export default function PanelShell(props: PanelShellProps): JSX.Element {
  const [sidebarOpen, setSidebarOpen] = createSignal(false);
  const navigate = useNavigate();

  function goToResult(result: SearchPaletteResult) {
    navigate({ to: `/admin/${result.collection}/${result.id}` });
  }

  return (
    <div class="lg:flex lg:min-h-screen">
      {/* Keyboard users would otherwise tab through the whole nav (plus
          search/logout) before reaching page content, on every route. */}
      <a
        href="#page-content"
        class="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-base-100 focus:px-4 focus:py-2 focus:shadow-lg"
      >
        Skip to main content
      </a>
      <PanelNav
        siteName={props.siteName}
        logoutUrl={props.logoutUrl}
        open={sidebarOpen()}
        onClose={() => setSidebarOpen(false)}
      />

      <div
        aria-hidden="true"
        onClick={() => setSidebarOpen(false)}
        class="fixed inset-0 z-40 bg-black/50 transition-opacity lg:hidden"
        classList={{ "pointer-events-none opacity-0": !sidebarOpen() }}
      />

      <div class="flex min-h-screen flex-1 flex-col lg:min-h-0">
        <PanelHeader
          publicSiteUrl={props.publicSiteUrl}
          onOpenSidebar={() => setSidebarOpen(true)}
        />
        <main id="page-content" class="page-wrap flex-1 px-4 py-6">
          {props.children}
        </main>
      </div>

      {/* Cmd+K (Ctrl+K) search palette — issue #29. Fans out across every
          collection with `search` configured in cadmea.config.ts via the
          searchCollections server function. */}
      <SearchPalette
        onSearch={(query) => searchCollections({ data: query })}
        onSelect={goToResult}
      />
    </div>
  );
}
