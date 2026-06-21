// Copyright (c) 2026 BowenLabs. All rights reserved.
// Cadmus is MIT licensed. See LICENSE in the repo root.

import type { CmsConfig, CollectionConfig } from "./types.js";

export interface CollectionMeta {
  slug: string;
  fields: CollectionConfig["fields"];
}

// Serializable introspection contract a CMS admin (or any other
// consumer) uses to render generic UI without importing CollectionConfig
// or CmsConfig directly. CollectionConfig is already plain, serializable
// data — this is a stable, narrow public surface over it, not a
// transformation.
export function getCollectionsMeta(config: CmsConfig): CollectionMeta[] {
  return config.collections.map((collection) => ({
    slug: collection.slug,
    fields: collection.fields,
  }));
}
