// Copyright (c) 2026 BowenLabs. All rights reserved.
// Cadmus is MIT licensed. See LICENSE in the repo root.

// Errors — always export first so consumers can catch typed errors
// without importing the full primitive
export * from './errors.js'

// Primitives — deep imports are preferred for tree-shaking
// Import this root only when you need multiple primitives
export * from './auth/index.js'
export * from './db/index.js'
export * from './storage/index.js'
export * from './cache/index.js'
export * from './email/index.js'
export * from './rate-limit/index.js'
export * from './session/index.js'
export * from './queues/index.js'

// CadmusEnv — base interface for apps using multiple primitives
export interface CadmusEnv {
  DB:             D1Database
  KV:             KVNamespace
  R2:             R2Bucket
  EMAIL:          SendEmail
  SESSION_SECRET: string
}

// Note: @bowenlabs/cadmus/hono is intentionally excluded from the root
// export — it has hono as a peer dependency and is opt-in only.
// Import it directly: import { cadmusAuth } from '@bowenlabs/cadmus/hono'
