// Copyright (c) 2026 BowenLabs. All rights reserved.
// Cadmea is MIT licensed. See LICENSE in the repo root.

import type { ImageCrop, ImageHotspot } from "@thebes/cadmus/storage";
import { createMemo, createSignal, For, Show } from "solid-js";

/**
 * Image hotspot/crop editor widget (issue #17). A custom field widget for
 * `upload` image fields: upload an image, then click it to set the focal
 * point (hotspot) and optionally enter a crop region. Stores the value as a
 * JSON string `{ url, hotspot?, crop? }` in the same column (back-compatible
 * — a plain URL string still parses). Pair with `ImageService.render`'s
 * `hotspot`/`crop` args on the read side (see @thebes/cadmus-cloudflare-images).
 *
 * Register it via `createCollectionEditPage`/`CollectionEdit`'s `fieldWidgets`
 * option, keyed by the field name.
 */

export interface ImageWithHotspot {
  url: string;
  hotspot?: ImageHotspot;
  crop?: ImageCrop;
  /** Source pixel dimensions captured at upload — required for ratio crops
   * (mapping a target ratio to crop edges needs the source ratio) and for
   * galleries to reserve tile space without layout shift. */
  width?: number;
  height?: number;
  /** "circle" marks a 1:1 crop rendered round (display: border-radius; print:
   * round products mask it). Defaults to rectangular. */
  shape?: "rect" | "circle";
}

const round2 = (n: number): number => Math.round(n * 100) / 100;
const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

/** Preset crop aspect ratios offered in the dropdown (label → w/h, or null
 * for the manual "Free" / "Custom" modes). */
const RATIO_PRESETS: { label: string; value: string; ratio: number | null }[] =
  [
    { label: "Free", value: "free", ratio: null },
    { label: "Original", value: "original", ratio: null },
    { label: "Square 1:1", value: "1:1", ratio: 1 },
    { label: "Portrait 4:5", value: "4:5", ratio: 4 / 5 },
    { label: "Portrait 2:3", value: "2:3", ratio: 2 / 3 },
    { label: "Portrait 3:4", value: "3:4", ratio: 3 / 4 },
    { label: "Portrait 5:7", value: "5:7", ratio: 5 / 7 },
    { label: "Wide 16:9", value: "16:9", ratio: 16 / 9 },
    { label: "Custom…", value: "custom", ratio: null },
  ];

/**
 * Compute crop edges (fractions of the source) that yield `targetRatio` from a
 * `sourceW × sourceH` image, as the largest centered band positioned over the
 * focal point (clamped to stay in-bounds). Returns the {top,right,bottom,left}
 * shape the renderer + ImageService already understand.
 */
export function cropForRatio(
  targetRatio: number,
  sourceW: number,
  sourceH: number,
  hotspot?: ImageHotspot,
): ImageCrop {
  const sourceRatio = sourceW / sourceH;
  let fw = 1;
  let fh = 1;
  if (targetRatio >= sourceRatio) {
    fh = sourceRatio / targetRatio; // crop top/bottom
  } else {
    fw = targetRatio / sourceRatio; // crop left/right
  }
  const left = clamp01(
    Math.min(Math.max((hotspot?.x ?? 0.5) - fw / 2, 0), 1 - fw),
  );
  const top = clamp01(
    Math.min(Math.max((hotspot?.y ?? 0.5) - fh / 2, 0), 1 - fh),
  );
  return {
    top: round2(top),
    right: round2(1 - left - fw),
    bottom: round2(1 - top - fh),
    left: round2(left),
  };
}

/**
 * Parse an upload-field value into `{ url, hotspot?, crop? }`. Accepts the
 * JSON object this widget writes, an already-parsed object, or a bare URL
 * string (legacy / non-hotspot uploads). Returns null for empty values.
 */
export function parseImageHotspotValue(
  value: unknown,
): ImageWithHotspot | null {
  if (!value) return null;
  if (typeof value === "object") return value as ImageWithHotspot;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.startsWith("{")) {
      try {
        return JSON.parse(trimmed) as ImageWithHotspot;
      } catch {
        // fall through to treating it as a plain URL
      }
    }
    return trimmed ? { url: trimmed } : null;
  }
  return null;
}

/** Serialize an {@link ImageWithHotspot} for storage in an upload field. */
export function serializeImageHotspotValue(value: ImageWithHotspot): string {
  return JSON.stringify(value);
}

/** Props every `fieldWidgets` widget receives from CollectionEdit. */
export interface FieldWidgetProps {
  fieldKey: string;
  value: unknown;
  setValue: (value: unknown) => void;
  onUploadFile?: (
    file: File,
  ) => Promise<{ url: string; width?: number; height?: number }>;
}

export function ImageHotspotField(props: FieldWidgetProps) {
  const parsed = createMemo(() => parseImageHotspotValue(props.value));
  const [uploading, setUploading] = createSignal(false);
  const [error, setError] = createSignal<string>();

  const patch = (next: Partial<ImageWithHotspot>) => {
    const current = parsed() ?? { url: "" };
    props.setValue(serializeImageHotspotValue({ ...current, ...next }));
  };

  async function handleFile(e: Event & { currentTarget: HTMLInputElement }) {
    const file = e.currentTarget.files?.[0];
    if (!file) return;
    if (!props.onUploadFile) {
      setError("No upload handler configured for this form.");
      return;
    }
    setUploading(true);
    setError(undefined);
    try {
      const { url, width, height } = await props.onUploadFile(file);
      patch({ url, width, height });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  const source = () => {
    const p = parsed();
    return p?.width && p?.height ? { w: p.width, h: p.height } : null;
  };
  const isCircle = () => parsed()?.shape === "circle";

  const [ratioMode, setRatioMode] = createSignal("free");
  const [customW, setCustomW] = createSignal(1);
  const [customH, setCustomH] = createSignal(1);

  // The ratio currently in effect (preset, custom, original, or circle⇒1).
  const effectiveRatio = (): number | null => {
    if (isCircle()) return 1;
    const mode = ratioMode();
    if (mode === "custom")
      return customW() > 0 && customH() > 0 ? customW() / customH() : null;
    if (mode === "original") {
      const s = source();
      return s ? s.w / s.h : null;
    }
    return RATIO_PRESETS.find((p) => p.value === mode)?.ratio ?? null;
  };

  const applyRatio = (ratio: number | null, hotspot?: ImageHotspot) => {
    const s = source();
    if (!ratio || !s) return;
    patch({
      crop: cropForRatio(ratio, s.w, s.h, hotspot ?? parsed()?.hotspot),
    });
  };

  function handleImageClick(
    e: MouseEvent & { currentTarget: HTMLImageElement },
  ) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = clamp01((e.clientX - rect.left) / rect.width);
    const y = clamp01((e.clientY - rect.top) / rect.height);
    const hotspot = { x: round2(x), y: round2(y) };
    // If a ratio crop is active, re-center it on the new focal point.
    const ratio = effectiveRatio();
    const s = source();
    if (ratio && s) {
      patch({ hotspot, crop: cropForRatio(ratio, s.w, s.h, hotspot) });
    } else {
      patch({ hotspot });
    }
  }

  function onRatioSelect(value: string) {
    setRatioMode(value);
    if (value === "custom") return applyRatio(customW() / customH());
    if (value === "original") {
      const s = source();
      return applyRatio(s ? s.w / s.h : null);
    }
    applyRatio(RATIO_PRESETS.find((p) => p.value === value)?.ratio ?? null);
  }

  function setShape(shape: "rect" | "circle") {
    if (shape === "circle") {
      setRatioMode("1:1");
      patch({ shape: "circle" });
      applyRatio(1);
    } else {
      patch({ shape: "rect" });
    }
  }

  const crop = () => parsed()?.crop ?? { top: 0, right: 0, bottom: 0, left: 0 };
  const setCrop = (edge: keyof ImageCrop, raw: string) => {
    setRatioMode("free");
    patch({ crop: { ...crop(), [edge]: clamp01(Number(raw) || 0) } });
  };

  return (
    <div class="flex flex-col gap-3">
      <input
        id={props.fieldKey}
        class="file-input"
        type="file"
        accept="image/*"
        disabled={uploading()}
        onChange={handleFile}
      />
      <Show when={uploading()}>
        <span class="loading loading-spinner loading-sm" />
      </Show>
      <Show when={error()}>
        <p class="text-sm text-error">{error()}</p>
      </Show>

      <Show when={parsed()?.url}>
        {(url) => (
          <div class="flex flex-col gap-2">
            <p class="text-xs opacity-60">
              Click the image to set the focal point.
            </p>
            <div class="relative inline-block max-w-md">
              {/* biome-ignore lint/a11y/useKeyWithClickEvents: pointer-based focal-point picker; numeric inputs below are the keyboard-accessible path */}
              <img
                src={url()}
                alt="Set focal point"
                class="block w-full cursor-crosshair rounded"
                onClick={handleImageClick}
              />
              <Show when={parsed()?.hotspot}>
                {(hs) => (
                  <span
                    class="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[var(--accent,#56c6be)] shadow"
                    style={{
                      left: `${hs().x * 100}%`,
                      top: `${hs().y * 100}%`,
                    }}
                  />
                )}
              </Show>
              {/* Crop overlay — dims excluded area, highlights crop boundary */}
              <Show when={parsed()?.crop}>
                {(crop) => {
                  const maskId = `crop-mask-${props.fieldKey}`;
                  const t = () => `${(crop().top ?? 0) * 100}%`;
                  const l = () => `${(crop().left ?? 0) * 100}%`;
                  const w = () => `${(1 - (crop().left ?? 0) - (crop().right ?? 0)) * 100}%`;
                  const h = () => `${(1 - (crop().top ?? 0) - (crop().bottom ?? 0)) * 100}%`;
                  return (
                    <svg
                      class="pointer-events-none absolute inset-0 h-full w-full"
                      viewBox="0 0 100 100"
                      preserveAspectRatio="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <defs>
                        <mask id={maskId}>
                          {/* White = dark overlay visible; black = see-through (crop window) */}
                          <rect width="100" height="100" fill="white" />
                          <rect
                            x={(crop().left ?? 0) * 100}
                            y={(crop().top ?? 0) * 100}
                            width={(1 - (crop().left ?? 0) - (crop().right ?? 0)) * 100}
                            height={(1 - (crop().top ?? 0) - (crop().bottom ?? 0)) * 100}
                            fill="black"
                          />
                        </mask>
                      </defs>
                      {/* Dim area outside crop */}
                      <rect width="100" height="100" fill="rgba(0,0,0,0.45)" mask={`url(#${maskId})`} />
                      {/* Crop border */}
                      <rect
                        x={(crop().left ?? 0) * 100}
                        y={(crop().top ?? 0) * 100}
                        width={(1 - (crop().left ?? 0) - (crop().right ?? 0)) * 100}
                        height={(1 - (crop().top ?? 0) - (crop().bottom ?? 0)) * 100}
                        fill="none"
                        stroke="rgba(255,255,255,0.9)"
                        stroke-width="0.8"
                      />
                    </svg>
                  );
                }}
              </Show>
            </div>

            {/* Shape + aspect-ratio crop controls. Ratio crops need the
                source dimensions captured at upload; older uploads without them
                fall back to the manual edge inputs below. */}
            <div class="flex flex-wrap items-center gap-3">
              <div class="join">
                <button
                  type="button"
                  class="btn btn-xs join-item"
                  classList={{ "btn-active": !isCircle() }}
                  onClick={() => setShape("rect")}
                >
                  Rectangle
                </button>
                <button
                  type="button"
                  class="btn btn-xs join-item"
                  classList={{ "btn-active": isCircle() }}
                  onClick={() => setShape("circle")}
                >
                  Circle
                </button>
              </div>
              <Show when={!isCircle()}>
                <label class="flex items-center gap-2 text-sm">
                  <span class="opacity-70">Ratio</span>
                  <select
                    class="select select-sm"
                    value={ratioMode()}
                    disabled={!source()}
                    onChange={(e) => onRatioSelect(e.currentTarget.value)}
                  >
                    <For each={RATIO_PRESETS}>
                      {(p) => <option value={p.value}>{p.label}</option>}
                    </For>
                  </select>
                </label>
                <Show when={ratioMode() === "custom"}>
                  <span class="flex items-center gap-1 text-sm">
                    <input
                      class="input input-sm w-16"
                      type="number"
                      min="1"
                      value={customW()}
                      onInput={(e) => {
                        const w = Number(e.currentTarget.value) || 1;
                        setCustomW(w);
                        applyRatio(w / customH());
                      }}
                    />
                    <span class="opacity-60">:</span>
                    <input
                      class="input input-sm w-16"
                      type="number"
                      min="1"
                      value={customH()}
                      onInput={(e) => {
                        const h = Number(e.currentTarget.value) || 1;
                        setCustomH(h);
                        applyRatio(customW() / h);
                      }}
                    />
                  </span>
                </Show>
              </Show>
            </div>
            <Show when={!source()}>
              <p class="text-xs opacity-50">
                Re-upload to enable ratio/circle crops — older uploads have no
                stored dimensions.
              </p>
            </Show>

            <details class="text-sm">
              <summary class="cursor-pointer opacity-70">
                Manual crop edges
              </summary>
              <div class="mt-2 grid grid-cols-4 gap-2">
                {(["top", "right", "bottom", "left"] as const).map((edge) => (
                  <label class="flex flex-col gap-1 text-xs">
                    <span class="capitalize opacity-70">{edge}</span>
                    <input
                      class="input input-sm"
                      type="number"
                      min="0"
                      max="1"
                      step="0.05"
                      value={crop()[edge]}
                      onInput={(e) => setCrop(edge, e.currentTarget.value)}
                    />
                  </label>
                ))}
              </div>
            </details>

            <p class="break-all text-xs opacity-50">{url()}</p>
          </div>
        )}
      </Show>
    </div>
  );
}
