import type { TokenStyleInput } from "@thebes/cadmea-design-system";
import { createEffect, type JSX, on, onCleanup } from "solid-js";

export interface SettingsPreviewPaneProps {
  publicSiteUrl: string;
  values: TokenStyleInput & { darkMode?: boolean };
  /** Bump this after a successful save to force a full iframe reload. */
  reloadToken: number;
}

const DEBOUNCE_MS = 150;

// Posts `cadmea:token-update` messages to the public-site iframe, mirroring
// the wire format `preview-token-listener.ts` (mounted there only when
// `?preview=1` is present) expects. targetOrigin is the public site's own
// origin — never "*" — matching that listener's `event.origin` check.
//
// Dev-only caveat: `pnpm dev:site` (:3000) and `pnpm dev:cadmea` (:3001)
// are different localhost origins, so this iframe may fail to load/receive
// messages locally. Works wherever both Workers share one custom domain.
export default function SettingsPreviewPane(
  props: SettingsPreviewPaneProps,
): JSX.Element {
  let iframeRef: HTMLIFrameElement | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function postUpdate() {
    if (!iframeRef?.contentWindow) return;
    const targetOrigin = new URL(props.publicSiteUrl).origin;
    iframeRef.contentWindow.postMessage(
      { type: "cadmea:token-update", payload: props.values },
      targetOrigin,
    );
  }

  createEffect(
    on(
      () => JSON.stringify(props.values),
      () => {
        clearTimeout(timer);
        timer = setTimeout(postUpdate, DEBOUNCE_MS);
      },
      { defer: true },
    ),
  );
  onCleanup(() => clearTimeout(timer));

  createEffect(
    on(
      () => props.reloadToken,
      (token, prevToken) => {
        if (prevToken === undefined || token === prevToken) return;
        if (iframeRef) {
          iframeRef.src = `${props.publicSiteUrl}?preview=1&t=${token}`;
        }
      },
    ),
  );

  return (
    <div class="overflow-hidden rounded-2xl border border-[var(--line)]">
      <iframe
        ref={iframeRef}
        src={`${props.publicSiteUrl}?preview=1`}
        title="Public site preview"
        class="h-[600px] w-full"
        onLoad={postUpdate}
      />
    </div>
  );
}
