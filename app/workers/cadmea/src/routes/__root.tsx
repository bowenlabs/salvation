import phosphorCss from "@phosphor-icons/web/regular?url";
import { TanStackDevtools } from "@tanstack/solid-devtools";
import type { QueryClient } from "@tanstack/solid-query";
import { QueryClientProvider } from "@tanstack/solid-query";
import {
  createRootRouteWithContext,
  HeadContent,
  Scripts,
  useLocation,
} from "@tanstack/solid-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/solid-router-devtools";
import { type JSX, Show } from "solid-js";
import { HydrationScript } from "solid-js/web";
import BrandColorProvider from "../components/BrandColorProvider";
import { DesignPreviewProvider } from "../components/design-preview-context";
import Footer from "../components/Footer";
import Header from "../components/Header";
import { getCadmeaSiteSettings } from "../server-functions/site-settings";
import appCss from "../styles.css?url";

// Root's own loader now reads site_settings via a server function (for the
// design-system token cascade) — see check-prerender.ts's rule.
export const prerender = false;

// Only ever touches the `dark`/`light` class — `data-theme` is reserved for
// the design-system's theme preset slug, written server-side by the route
// loader / BrandColorProvider, never by this dark-mode init script.
const THEME_INIT_SCRIPT = `(function(){try{var stored=window.localStorage.getItem('theme');var mode=(stored==='light'||stored==='dark'||stored==='auto')?stored:'auto';var prefersDark=window.matchMedia('(prefers-color-scheme: dark)').matches;var resolved=mode==='auto'?(prefersDark?'dark':'light'):mode;var root=document.documentElement;root.classList.remove('light','dark');root.classList.add(resolved);root.style.colorScheme=resolved;}catch(e){}})();`;

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  // Runs for every route including the pre-auth redirect path — see
  // getCadmeaSiteSettings's comment on why it's not behind requireAuthOrThrow.
  loader: () => getCadmeaSiteSettings(),
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "Cadmea Panel",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      {
        rel: "stylesheet",
        href: phosphorCss,
      },
    ],
  }),
  shellComponent: RootDocument,
});

function RootDocument(props: { children: JSX.Element }) {
  const context = Route.useRouteContext();
  const settings = Route.useLoaderData();
  const location = useLocation();
  // <PanelShell> (mounted by routes/admin/route.tsx) owns the entire
  // admin chrome — the public Header/Footer would otherwise wrap it too.
  const isAdminRoute = () => location().pathname.startsWith("/admin");

  return (
    <html lang="en">
      <head>
        <script innerHTML={THEME_INIT_SCRIPT} />
        {/* Initializes Solid's `_$HY` global BEFORE the serialized
            hydration-data scripts <Scripts/> emits at end of body. Without
            it, those inline data scripts reference an undefined `_$HY` and
            throw, so the panel never hydrates client-side and every
            collection list renders empty. TanStack Solid Start's <Scripts/>
            does not emit this itself. */}
        <HydrationScript />
        <HeadContent />
      </head>
      <body class="font-sans antialiased [overflow-wrap:anywhere] selection:bg-[rgba(79,184,178,0.24)]">
        <DesignPreviewProvider>
          <BrandColorProvider
            theme={settings()?.theme}
            brandColor={settings()?.brandColor}
            secondaryColor={settings()?.secondaryColor}
            tertiaryColor={settings()?.tertiaryColor}
            spacingPreset={settings()?.spacingPreset}
            typeTokens={
              settings()?.typeTokens as
                | Record<string, string>
                | null
                | undefined
            }
            fontPairing={settings()?.fontPairing}
          >
            <QueryClientProvider client={context().queryClient}>
              <Show when={!isAdminRoute()}>
                <Header />
              </Show>
              {props.children}
              <Show when={!isAdminRoute()}>
                <Footer />
              </Show>
            </QueryClientProvider>
          </BrandColorProvider>
        </DesignPreviewProvider>
        <TanStackDevtools
          config={{
            position: "bottom-right",
          }}
          plugins={[
            {
              name: "Tanstack Router",
              render: () => <TanStackRouterDevtoolsPanel />,
            },
          ]}
        />
        <Scripts />
      </body>
    </html>
  );
}
