// Copyright (c) 2026 BowenLabs. All rights reserved.
// Cadmus is MIT licensed. See LICENSE in the repo root.

import { CadmusCmsError } from "../errors.js";
import type { CmsConfig, CollectionConfig, FieldConfig } from "./types.js";

const KNOWN_FIELD_TYPES: ReadonlySet<FieldConfig["type"]> = new Set([
  "text",
  "select",
  "number",
  "date",
  "richText",
  "checkbox",
  "relationship",
  "array",
  "upload",
]);

function validateCollectionConfig(config: CollectionConfig): void {
  if (!config.slug || config.slug.trim().length === 0) {
    throw new CadmusCmsError("Collection config requires a non-empty slug");
  }

  const fieldEntries = Object.entries(config.fields ?? {});
  if (fieldEntries.length === 0) {
    throw new CadmusCmsError(
      `Collection "${config.slug}" must define at least one field`,
    );
  }

  for (const [key, field] of fieldEntries) {
    if (!KNOWN_FIELD_TYPES.has(field.type)) {
      throw new CadmusCmsError(
        `Collection "${config.slug}" field "${key}" has unrecognized type "${field.type}"`,
      );
    }

    if (field.type === "relationship" && !field.relationTo) {
      throw new CadmusCmsError(
        `Collection "${config.slug}" field "${key}" is a relationship field and requires "relationTo"`,
      );
    }

    if (
      field.type === "array" &&
      Object.keys(field.fields ?? {}).length === 0
    ) {
      throw new CadmusCmsError(
        `Collection "${config.slug}" field "${key}" is an array field and must define at least one nested field`,
      );
    }
  }
}

function validateUniqueSlugs(collections: readonly CollectionConfig[]): void {
  const seen = new Set<string>();
  for (const collection of collections) {
    if (seen.has(collection.slug)) {
      throw new CadmusCmsError(
        `Duplicate collection slug "${collection.slug}" — collection slugs must be unique`,
      );
    }
    seen.add(collection.slug);
  }
}

export function defineCollection(config: CollectionConfig): CollectionConfig {
  validateCollectionConfig(config);
  return config;
}

export function defineCmsConfig(config: CmsConfig): CmsConfig {
  for (const collection of config.collections) {
    validateCollectionConfig(collection);
  }
  validateUniqueSlugs(config.collections);
  return config;
}
