// Copyright (c) 2026 BowenLabs. All rights reserved.
// Cadmus is MIT licensed. See LICENSE in the repo root.
//
// A strict, configurable security-headers Hono middleware (HSTS, CSP,
// X-Content-Type-Options, Referrer-Policy, Permissions-Policy), with
// same-origin framing by default and a per-response opt-out.

import type { Context, MiddlewareHandler } from "hono";

/**
 * Per-response marker a route handler can set to opt this one response out of
 * the default same-origin framing lock. The value is the origin allowed to
 * frame it (e.g. a studio origin for a visual-edit preview iframe).
 * `createSecurityHeaders` consumes and strips it, turning it into a scoped
 * `frame-ancestors` directive — so every other response stays SAMEORIGIN.
 */
export const FRAME_ANCESTORS_HEADER = "x-cadmus-frame-ancestors";

/** Extra sources appended to each CSP directive, beyond the secure defaults. */
export interface CspSources {
  scriptSrc?: string[];
  styleSrc?: string[];
  fontSrc?: string[];
  imgSrc?: string[];
  connectSrc?: string[];
  frameSrc?: string[];
}

export interface SecurityHeadersOptions {
  /** Static per-directive source additions (analytics, fonts, a captcha, …). */
  csp?: CspSources;
  /**
   * Per-request source additions — e.g. a media-host origin read from
   * `c.env`. Merged into `csp` for each response.
   */
  dynamicCsp?: (c: Context) => CspSources;
  /**
   * CSP violation report sink. When set, the policy gains `report-uri <url>`
   * (legacy, still widely honored) and `report-to <group>`, and each response
   * declares the group via a `Reporting-Endpoints` header — so the browser
   * POSTs violations here. Usually a same-origin collector path
   * (e.g. `/csp-report`, mounted with {@link createCspReportHandler}).
   */
  reportUri?: string;
  /** Group name for the `report-to` directive / `Reporting-Endpoints` header. Default `"csp"`. */
  reportTo?: string;
}

const DIRECTIVE_KEYS = [
  "scriptSrc",
  "styleSrc",
  "fontSrc",
  "imgSrc",
  "connectSrc",
  "frameSrc",
] as const;

function mergeSources(a: CspSources, b: CspSources): CspSources {
  const out: CspSources = {};
  for (const key of DIRECTIVE_KEYS) {
    const merged = [...(a[key] ?? []), ...(b[key] ?? [])];
    if (merged.length) out[key] = merged;
  }
  return out;
}

interface CspReport {
  uri: string;
  group: string;
}

function buildCsp(
  extra: CspSources,
  frameAncestors?: string,
  report?: CspReport,
): string {
  const src = (base: string[], add?: string[]) =>
    [...base, ...(add ?? [])].join(" ");
  const directives = [
    "default-src 'self'",
    // 'unsafe-inline' is required by SSR frameworks that inline their hydration
    // payload as <script> with no nonce/hash (e.g. TanStack Start) — without it
    // SSR HTML renders but the client never hydrates. Revisit once a nonce is wired.
    `script-src ${src(["'self'", "'unsafe-inline'"], extra.scriptSrc)}`,
    `style-src ${src(["'self'", "'unsafe-inline'"], extra.styleSrc)}`,
    `font-src ${src(["'self'"], extra.fontSrc)}`,
    `img-src ${src(["'self'", "data:"], extra.imgSrc)}`,
    `connect-src ${src(["'self'"], extra.connectSrc)}`,
  ];
  if (extra.frameSrc?.length) {
    directives.push(`frame-src ${extra.frameSrc.join(" ")}`);
  }
  directives.push("base-uri 'self'", "form-action 'self'", "object-src 'none'");
  if (frameAncestors) directives.push(`frame-ancestors ${frameAncestors}`);
  if (report) {
    // report-uri is deprecated but still the most broadly honored; report-to is
    // the modern Reporting API form (its group is declared via the
    // Reporting-Endpoints response header, set alongside this in the middleware).
    directives.push(`report-uri ${report.uri}`, `report-to ${report.group}`);
  }
  return directives.join("; ");
}

/**
 * Hono middleware setting a strict baseline of security headers on every
 * response, with same-origin framing by default. Pass `csp` / `dynamicCsp` to
 * allowlist the few external sources your app needs.
 *
 * ```ts
 * app.use("*", createSecurityHeaders({
 *   csp: { fontSrc: ["https://fonts.gstatic.com"] },
 *   dynamicCsp: (c) =>
 *     c.env.MEDIA_URL ? { imgSrc: [new URL(c.env.MEDIA_URL).origin] } : {},
 * }));
 * ```
 *
 * A route can opt one response into cross-origin framing by setting
 * `FRAME_ANCESTORS_HEADER` to the allowed origin; the middleware swaps
 * X-Frame-Options for a scoped `frame-ancestors` on just that response and
 * strips the internal marker.
 */
export function createSecurityHeaders(
  options: SecurityHeadersOptions = {},
): MiddlewareHandler {
  return async (c, next) => {
    await next();
    c.header(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload",
    );
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "strict-origin-when-cross-origin");
    c.header(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=(), payment=(), interest-cohort=()",
    );

    const extra = mergeSources(
      options.csp ?? {},
      options.dynamicCsp?.(c) ?? {},
    );

    const report: CspReport | undefined = options.reportUri
      ? { uri: options.reportUri, group: options.reportTo ?? "csp" }
      : undefined;
    if (report) {
      // Declare the report-to group's endpoint. Reporting-Endpoints is the
      // current standard (supersedes the older Report-To JSON header).
      c.header("Reporting-Endpoints", `${report.group}="${report.uri}"`);
    }

    const frameAncestors = c.res.headers.get(FRAME_ANCESTORS_HEADER);
    if (frameAncestors) {
      // This response opted into cross-origin framing. Strip the internal
      // marker and emit a scoped frame-ancestors instead of X-Frame-Options
      // (the latter has no allowlist form and would override frame-ancestors).
      c.res.headers.delete(FRAME_ANCESTORS_HEADER);
      c.header(
        "Content-Security-Policy",
        buildCsp(extra, frameAncestors, report),
      );
    } else {
      c.header("X-Frame-Options", "SAMEORIGIN");
      c.header("Content-Security-Policy", buildCsp(extra, undefined, report));
    }
  };
}

/** A parsed CSP violation report plus the request that delivered it. */
export interface CspReportHandlerOptions {
  /**
   * Sink for each delivered report. Receives the parsed JSON body (shape varies
   * by browser: a legacy `{ "csp-report": {...} }` for `report-uri`, or an array
   * of reports for `report-to`) and the Hono context. Defaults to a
   * `console.warn` so violations surface in `wrangler tail` / Logpush / Sentry.
   */
  onReport?: (report: unknown, c: Context) => void | Promise<void>;
}

/**
 * Hono handler for a same-origin CSP report collector. Mount it at the path you
 * passed as `reportUri`:
 *
 * ```ts
 * app.post("/csp-report", createCspReportHandler());
 * ```
 *
 * Always answers `204` (even on a malformed body) so a misbehaving reporter can
 * never turn into a user-visible error.
 */
export function createCspReportHandler(
  options: CspReportHandlerOptions = {},
): MiddlewareHandler {
  const onReport =
    options.onReport ??
    ((report: unknown) => {
      console.warn("[csp-report]", JSON.stringify(report));
    });
  return async (c) => {
    try {
      // Parse the raw text rather than c.req.json(): browsers send CSP reports
      // as application/csp-report or application/reports+json, and json() warns
      // on those non-application/json content types.
      const raw = await c.req.text();
      if (raw) await onReport(JSON.parse(raw), c);
    } catch {
      // Ignore malformed / empty bodies — a report endpoint must never 5xx.
    }
    return c.body(null, 204);
  };
}
