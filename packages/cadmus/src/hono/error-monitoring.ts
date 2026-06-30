// Copyright (c) 2026 BowenLabs. All rights reserved.
// Cadmus is MIT licensed. See LICENSE in the repo root.
//
// A vendor-neutral error-monitoring hook. Cadmus stays free of any specific
// monitoring SDK: the consumer supplies a `capture` sink (Sentry, Axiom, a
// plain console.error, …) and this reports uncaught errors before producing the
// response. It plugs into Hono's single `onError` slot — a wrapping middleware
// can't observe downstream throws, because Hono routes every caught error
// straight to `onError` rather than rejecting `next()`.

import type { Context, ErrorHandler } from "hono";

export interface ErrorMonitoringOptions {
  /**
   * Vendor-neutral sink for an uncaught error. Receives the thrown value and the
   * Hono context (URL, method, headers, env). Called best-effort — its own
   * failures are swallowed so monitoring can never mask the original error.
   */
  capture: (error: unknown, c: Context) => void | Promise<void>;
  /**
   * Await `capture` before responding. Default `false`: when an execution
   * context is available the capture runs via `waitUntil` so the error response
   * isn't delayed; it falls back to awaiting when no context is present (e.g.
   * tests). Set `true` if your sink must flush before the worker returns.
   */
  awaitCapture?: boolean;
  /**
   * Produces the error response. Defaults to a plain `500`. Provide your own to
   * keep existing `onError` behavior — Hono allows only one `onError`, so route
   * your response logic through here instead of registering a second handler.
   */
  onError?: (error: Error, c: Context) => Response | Promise<Response>;
}

function scheduleOnContext(c: Context, promise: Promise<unknown>): boolean {
  try {
    c.executionCtx.waitUntil(promise);
    return true;
  } catch {
    // No execution context (e.g. test harness) — caller will await instead.
    return false;
  }
}

/**
 * Builds a Hono `onError` handler that reports the error to a `capture` sink and
 * then responds. Register it as the app's error handler — mount it on the
 * outermost app so it sees errors rethrown by inner routers too:
 *
 * ```ts
 * app.onError(createErrorMonitoring({
 *   capture: (e) => Sentry.captureException(e),
 *   onError: (_e, c) => c.text("Something went wrong", 500),
 * }));
 * ```
 */
export function createErrorMonitoring(
  options: ErrorMonitoringOptions,
): ErrorHandler {
  const { capture, awaitCapture = false, onError } = options;
  return async (error, c) => {
    const done = Promise.resolve()
      .then(() => capture(error, c))
      .catch(() => {
        // Swallow sink failures — never mask the original error.
      });
    if (awaitCapture || !scheduleOnContext(c, done)) {
      await done;
    }
    if (onError) return onError(error, c);
    return c.text("Internal Server Error", 500);
  };
}
