// Copyright (c) 2026 BowenLabs. All rights reserved.
// Cadmus is MIT licensed. See LICENSE in the repo root.
//
// @thebes/cadmus/db
//
// Thin wrapper around Drizzle's D1 driver. Raw binding in, Drizzle
// instance out — the schema is the caller's, never Cadmus's. Cadmus has
// no opinion on what tables exist; that's app-specific.

import { drizzle } from "drizzle-orm/d1";

export function db<
  TSchema extends Record<string, unknown> = Record<string, never>,
>(d1: D1Database, schema?: TSchema) {
  return drizzle(d1, { schema });
}
