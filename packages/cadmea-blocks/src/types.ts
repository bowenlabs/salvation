// Copyright (c) 2026 BowenLabs. All rights reserved.
// MIT licensed. See LICENSE in the repo root.
//
// Per-block prop shapes. Each block component takes only its own data, so the
// components stay decoupled from any one site's Block union — a site's renderer
// registry maps a stored block to the matching component + props.

import type { TipTapJSONContent } from "@thebes/cadmus/cms";
import type { ImageService } from "@thebes/cadmus/storage";

export type { TipTapJSONContent };

export interface RichTextBlockProps {
  content: TipTapJSONContent;
}

export interface ImageBlockProps {
  /** A bare URL, or the hotspot/crop JSON an image editor writes (parsed via
   *  `@thebes/cadmus/storage`'s `parseImageRef`). */
  url: string;
  alt: string;
  caption?: string;
  /** Resolves the stored ref to a responsive `<img>` (applies hotspot/crop). */
  imageService: ImageService;
}

export interface HeroBlockProps {
  heading: string;
  subtext?: string;
  ctaLabel?: string;
  ctaHref?: string;
}

export interface BannerBlockProps {
  style?: "info" | "success" | "warning" | "error";
  content: TipTapJSONContent;
}

export interface ContentColumn {
  content: TipTapJSONContent;
}

export interface ContentBlockProps {
  layout?: "single" | "two" | "three";
  columns?: ContentColumn[];
}
