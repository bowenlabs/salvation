// Listens for `cadmea:token-update` postMessage events (sent by the Panel's
// design-settings preview pane, a later phase) and re-applies the token
// cascade live to this document — no reload. Only active when `?preview=1`
// is in the URL, so this never runs for normal visitors.
import {
  buildTokenStyle,
  type TokenStyleInput,
} from "@thebes/cadmea-design-system";

export function mountPreviewTokenListener(): void {
  if (!new URLSearchParams(window.location.search).has("preview")) return;

  function handler(event: MessageEvent) {
    if (event.origin !== window.location.origin) return;
    if (event.data?.type !== "cadmea:token-update") return;

    const payload = event.data.payload as TokenStyleInput & {
      darkMode?: boolean;
    };
    const root = document.documentElement;
    const themeName =
      payload.theme ??
      root.getAttribute("data-theme")?.replace("theme-", "") ??
      "citadel";

    root.setAttribute("data-theme", `theme-${themeName}`);
    if (payload.darkMode === true) {
      root.classList.add("dark");
    } else if (payload.darkMode === false) {
      root.classList.remove("dark");
    }

    const linkId = "cadmea-preview-theme-css";
    let link = document.getElementById(linkId) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.id = linkId;
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }
    link.href = `/themes/theme-${themeName}.css`;

    let style = document.getElementById(
      "cadmea-preview-tokens",
    ) as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement("style");
      style.id = "cadmea-preview-tokens";
      document.head.appendChild(style);
    }
    style.textContent = buildTokenStyle(payload);
  }

  window.addEventListener("message", handler);
}
