// Copyright (c) 2026 BowenLabs. All rights reserved.
// Cadmus is MIT licensed. See LICENSE in the repo root.

/**
 * Visual editing / click-to-edit (issue #15) — adopts Sanity's
 * Presentation/visual-editing idea (pattern, not code): the rendered page
 * (in a preview context) tags editable regions with the source field they
 * came from, and an overlay turns those regions into click targets that tell
 * the studio which field to focus.
 *
 * This module ships the two reusable, framework-agnostic primitives:
 * 1. **Encoding** — `editAttr({ collection, id, field })` produces a data
 *    attribute the server renderer spreads onto an element; `decodeEditRef`
 *    reads it back. Pure, testable.
 * 2. **Overlay** — `mountVisualEditing()` (browser-only; references `document`
 *    lazily, so importing it server-side is harmless) highlights tagged
 *    elements on hover and, on click, calls `onSelect` and `postMessage`s the
 *    ref to the parent window (the studio shell hosting the preview iframe).
 *
 * The studio side listens for that message and navigates to
 * `/admin/<collection>/<id>` (and may focus `<field>`); that wiring is
 * consumer-side and not prescribed here.
 */

/** A reference from a rendered region back to the field that produced it. */
export interface EditRef {
  collection: string;
  id: number;
  field: string;
}

/** The data attribute editable regions are tagged with. */
export const EDIT_ATTR = "data-cadmus-edit";

/** `postMessage` payload type for a click-to-edit selection. */
export const VISUAL_EDIT_MESSAGE = "cadmus:visual-edit";

export function encodeEditRef(ref: EditRef): string {
  return `${ref.collection}:${ref.id}:${ref.field}`;
}

/** Parse an {@link EditRef} string, or null if malformed. */
export function decodeEditRef(value: string): EditRef | null {
  const parts = value.split(":");
  if (parts.length !== 3) return null;
  const [collection, idRaw, field] = parts;
  const id = Number.parseInt(idRaw, 10);
  if (!collection || !field || !Number.isFinite(id)) return null;
  return { collection, id, field };
}

/**
 * Attribute object to spread onto a rendered element so the overlay can map
 * it back to its source field, e.g. `<h1 {...editAttr({collection:'pages',
 * id, field:'title'})}>`.
 */
export function editAttr(ref: EditRef): Record<string, string> {
  return { [EDIT_ATTR]: encodeEditRef(ref) };
}

export interface VisualEditingMessage {
  type: typeof VISUAL_EDIT_MESSAGE;
  ref: EditRef;
}

export interface VisualEditingOptions {
  /** Called with the decoded ref when an editable region is clicked. */
  onSelect?: (ref: EditRef, element: Element) => void;
  /**
   * Origin to `postMessage` the selection to the parent window. Default
   * `"*"`. Set to the studio origin in production.
   */
  targetOrigin?: string;
  /** Outline color for the hover highlight. Default a teal accent. */
  highlightColor?: string;
}

/**
 * Mount the click-to-edit overlay. Browser-only — call from a preview page's
 * client script. Highlights `[data-cadmus-edit]` elements on hover and, on
 * click, calls `onSelect` and posts a {@link VisualEditingMessage} to the
 * parent window. Returns a cleanup function that removes the listeners.
 */
export function mountVisualEditing(
  options: VisualEditingOptions = {},
): () => void {
  const { onSelect, targetOrigin = "*", highlightColor = "#56c6be" } = options;

  const closest = (target: EventTarget | null): HTMLElement | null => {
    if (!(target instanceof Element)) return null;
    const el = target.closest(`[${EDIT_ATTR}]`);
    return el instanceof HTMLElement ? el : null;
  };

  let previous: { el: HTMLElement; outline: string } | null = null;
  const clearHighlight = () => {
    if (previous) {
      previous.el.style.outline = previous.outline;
      previous = null;
    }
  };

  const onOver = (event: Event) => {
    const el = closest(event.target);
    if (!el || el === previous?.el) return;
    clearHighlight();
    previous = { el, outline: el.style.outline };
    el.style.outline = `2px solid ${highlightColor}`;
    el.style.outlineOffset = "2px";
    el.style.cursor = "pointer";
  };

  const onClick = (event: Event) => {
    const el = closest(event.target);
    if (!el) return;
    const ref = decodeEditRef(el.getAttribute(EDIT_ATTR) ?? "");
    if (!ref) return;
    event.preventDefault();
    event.stopPropagation();
    onSelect?.(ref, el);
    const message: VisualEditingMessage = { type: VISUAL_EDIT_MESSAGE, ref };
    window.parent?.postMessage(message, targetOrigin);
  };

  document.addEventListener("mouseover", onOver, true);
  document.addEventListener("click", onClick, true);

  return () => {
    clearHighlight();
    document.removeEventListener("mouseover", onOver, true);
    document.removeEventListener("click", onClick, true);
  };
}
