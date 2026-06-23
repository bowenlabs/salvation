// Copyright (c) 2026 BowenLabs. All rights reserved.
// Cadmus is MIT licensed. See LICENSE in the repo root.

// `Error.captureStackTrace` is a real V8 engine feature available in
// workerd's V8 isolates — it's just not part of any spec, so it isn't in
// TypeScript's standard lib types without pulling in @types/node, which
// Cadmus deliberately doesn't (V8-first, no Node assumptions).
declare global {
  interface ErrorConstructor {
    // biome-ignore lint/complexity/noBannedTypes: matches the real V8 signature — this.constructor is typed as Function by TS itself
    captureStackTrace?(targetObject: object, constructorOpt?: Function): void;
  }
}

/**
 * Base class for all Cadmus errors.
 * All primitives throw CadmusError or a typed subclass — never a raw Error.
 *
 * @example
 * try {
 *   await createMagicLink({ kv, email, to })
 * } catch (e) {
 *   if (e instanceof CadmusAuthError) {
 *     // auth-specific handling
 *   } else if (e instanceof CadmusError) {
 *     // any cadmus error — e.code tells you which primitive threw
 *   } else {
 *     throw e // re-throw unknown errors
 *   }
 * }
 */
export class CadmusError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "CadmusError";
    // Maintains proper stack trace in V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/** Thrown by @thebes/cadmus/auth primitives */
export class CadmusAuthError extends CadmusError {
  constructor(message: string, cause?: unknown) {
    super(message, "AUTH_ERROR", cause);
    this.name = "CadmusAuthError";
  }
}

/** Thrown by @thebes/cadmus/db primitives */
export class CadmusDbError extends CadmusError {
  constructor(message: string, cause?: unknown) {
    super(message, "DB_ERROR", cause);
    this.name = "CadmusDbError";
  }
}

/** Thrown by @thebes/cadmus/storage primitives */
export class CadmusStorageError extends CadmusError {
  constructor(message: string, cause?: unknown) {
    super(message, "STORAGE_ERROR", cause);
    this.name = "CadmusStorageError";
  }
}

/** Thrown by @thebes/cadmus/cache primitives */
export class CadmusCacheError extends CadmusError {
  constructor(message: string, cause?: unknown) {
    super(message, "CACHE_ERROR", cause);
    this.name = "CadmusCacheError";
  }
}

/** Thrown by @thebes/cadmus/email primitives */
export class CadmusEmailError extends CadmusError {
  constructor(message: string, cause?: unknown) {
    super(message, "EMAIL_ERROR", cause);
    this.name = "CadmusEmailError";
  }
}

/** Thrown by @thebes/cadmus/session primitives */
export class CadmusSessionError extends CadmusError {
  constructor(message: string, cause?: unknown) {
    super(message, "SESSION_ERROR", cause);
    this.name = "CadmusSessionError";
  }
}

/** Thrown by @thebes/cadmus/rate-limit primitives */
export class CadmusRateLimitError extends CadmusError {
  constructor(message: string, cause?: unknown) {
    super(message, "RATE_LIMIT_ERROR", cause);
    this.name = "CadmusRateLimitError";
  }
}

/** Thrown by @thebes/cadmus/queues primitives */
export class CadmusQueueError extends CadmusError {
  constructor(message: string, cause?: unknown) {
    super(message, "QUEUE_ERROR", cause);
    this.name = "CadmusQueueError";
  }
}

/** Thrown by @thebes/cadmus/cms primitives */
export class CadmusCmsError extends CadmusError {
  constructor(message: string, cause?: unknown) {
    super(message, "CMS_ERROR", cause);
    this.name = "CadmusCmsError";
  }
}

/**
 * Thrown by @thebes/cadmus/cms's createLocalApi when a collection's
 * `access` function rejects an operation. A distinct subclass (rather than
 * a plain CadmusCmsError) so consumers like mountCmsRoutes can map it to
 * 403 by `instanceof`, not by matching on message text.
 */
export class CadmusAccessDeniedError extends CadmusCmsError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = "CadmusAccessDeniedError";
  }
}
