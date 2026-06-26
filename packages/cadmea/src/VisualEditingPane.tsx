// Copyright (c) 2026 BowenLabs. All rights reserved.
// Cadmea is MIT licensed. See LICENSE in the repo root.

import {
  type EditRef,
  VISUAL_EDIT_MESSAGE,
  type VisualEditingMessage,
} from "@thebes/cadmus/cms";
import { onCleanup, onMount } from "solid-js";

/**
 * Visual-editing preview pane (issue #15, studio side). Embeds the site's
 * preview in an iframe and listens for the click-to-edit `postMessage` that
 * `@thebes/cadmus/cms`'s `mountVisualEditing` posts from inside the preview.
 * On a click, it calls `onEdit(ref)` so the studio can navigate to that
 * field's editor (e.g. `/admin/<collection>/<id>`).
 *
 * The preview page must (a) tag editable regions with `editAttr(...)` and
 * (b) call `mountVisualEditing()` client-side. This component is the parent
 * half of that handshake.
 */
export interface VisualEditingPaneProps {
  /** URL of the preview route to embed. */
  src: string;
  /** Called when an editable region in the preview is clicked. */
  onEdit?: (ref: EditRef) => void;
  /**
   * Origin the preview is served from — messages from any other origin are
   * ignored (postMessage security). Defaults to `src`'s origin.
   */
  allowedOrigin?: string;
  /** Class for the iframe (size it via the consumer's layout). */
  class?: string;
  title?: string;
}

function originOf(url: string): string | undefined {
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}

export function VisualEditingPane(props: VisualEditingPaneProps) {
  onMount(() => {
    const expected = props.allowedOrigin ?? originOf(props.src);
    const handler = (event: MessageEvent) => {
      // Same-origin-only: drop messages from any other window/origin.
      if (expected && event.origin !== expected) return;
      const data = event.data as Partial<VisualEditingMessage> | null;
      if (data?.type === VISUAL_EDIT_MESSAGE && data.ref) {
        props.onEdit?.(data.ref);
      }
    };
    window.addEventListener("message", handler);
    onCleanup(() => window.removeEventListener("message", handler));
  });

  return (
    <iframe
      src={props.src}
      title={props.title ?? "Preview"}
      class={props.class ?? "h-full w-full border-0"}
    />
  );
}
