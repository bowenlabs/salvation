// Copyright (c) 2026 BowenLabs. All rights reserved.
// MIT licensed. See LICENSE in the repo root.
//
// @thebes/cadmea-access-helpers
//
// Not a Cadmus adapter (it doesn't implement a Cadmus-defined interface)
// and not a Cadmea plugin (it doesn't take or return a CmsConfig) — a
// plain library of composable predicates for collections' `access` blocks,
// the same "neither axis" categorization EXTENDING.md gives
// @thebes/cadmea-design-system. It's Cadmea-shaped (it knows about
// AccessFn/CollectionAccess from @thebes/cadmus/cms) rather than a Cadmus
// primitive, since AccessFn only means anything to a Cadmus consumer that
// actually has a CMS config to write access blocks against.
//
// cadmus is a types-only peer — nothing here imports it at runtime.

import type { AccessFn } from "@thebes/cadmus/cms";

/**
 * The shape every helper below expects: a `session` (or `null` if
 * unauthenticated) carrying a `role`, plus an optional `internal` flag for
 * trusted Service Binding RPC callers that should always pass regardless
 * of role — mirrors `app/cadmea.config.ts`'s own `PagesAccessContext`,
 * generalized. `TRole` is left to the consumer (Cadmea doesn't standardize
 * role names any more than Cadmus standardizes the context shape itself).
 */
export interface RoleAccessContext<TRole extends string = string> {
  session: { role: TRole } | null;
  internal?: boolean;
}

/**
 * `true` iff `role` is one of `allowed`. `role` may be `null`/`undefined`
 * (an unauthenticated caller) — always `false` in that case, regardless of
 * `allowed`.
 */
export function checkRole<TRole extends string>(
  allowed: readonly TRole[],
  role: TRole | null | undefined,
): boolean {
  return role != null && allowed.includes(role);
}

/**
 * Returns an `AccessFn` that allows `internal` callers unconditionally, and
 * otherwise checks the session's `role` against `allowed` — generalizes
 * `app/cadmea.config.ts`'s hand-rolled `requireRole`/`requireEditorOrAbove`.
 *
 * Note the real narrowing versus the row-aware `access` patterns some
 * Payload-based projects use: Cadmus's `AccessFn` returns a boolean, not a
 * `Where` filter, so there's no way to express "can read documents it
 * owns" inside the access function itself — per-row ownership scoping has
 * to happen by the caller passing a `where` filter into `find()`/`count()`
 * directly, not in here.
 *
 * ```ts
 * const requireEditorOrAbove = requireRole<Role>("owner", "editor");
 * defineCollection({
 *   slug: "pages",
 *   access: { create: requireEditorOrAbove, update: requireEditorOrAbove },
 *   // ...
 * });
 * ```
 */
export function requireRole<
  TRole extends string,
  TContext extends RoleAccessContext<TRole> = RoleAccessContext<TRole>,
>(...allowed: TRole[]): AccessFn<TContext> {
  return ({ session, internal }) =>
    internal === true || checkRole(allowed, session?.role ?? null);
}

/**
 * Sugar over `requireRole(adminRole)` for the common single-role admin
 * case — kept as its own named export since "is this caller an admin" is
 * common enough to read better than `requireRole("admin")` at every call
 * site, even though it's not a different mechanism.
 */
export function isAdmin<
  TRole extends string,
  TContext extends RoleAccessContext<TRole> = RoleAccessContext<TRole>,
>(adminRole: TRole): AccessFn<TContext> {
  return requireRole<TRole, TContext>(adminRole);
}

/** Always allows the operation — for collections with genuinely public access (e.g. `read`). */
export const publicAccess: AccessFn<unknown> = () => true;

/**
 * Allows the operation for any caller with a non-null `session`, regardless
 * of role — internal callers also pass, matching `requireRole`'s own
 * trusted-RPC carve-out.
 */
export function authenticatedOnly<
  TContext extends { session: unknown; internal?: boolean } = {
    session: unknown;
    internal?: boolean;
  },
>(): AccessFn<TContext> {
  return ({ session, internal }) =>
    internal === true || (session !== null && session !== undefined);
}
