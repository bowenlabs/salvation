// Copyright (c) 2026 BowenLabs. All rights reserved.
// Cadmus is MIT licensed. See LICENSE in the repo root.
//
// @thebes/cadmus/secrets
//
// A thin accessor over Cloudflare Secrets Store bindings that also works in
// local dev. In a deployed Worker a secret bound via `secrets_store_secrets` is
// an object with an async `.get()`; in local dev the same name is a plain string
// from `.dev.vars`. `getSecret` accepts either, so one call site works in both.
//
// The win over per-Worker `wrangler secret put`: a single value in the account's
// Secrets Store can be bound into every Worker that needs it — one source to
// rotate and audit, instead of duplicated copies drifting per Worker.
//
// ```ts
// const stripeKey = await requireSecret(env.STRIPE_SECRET_KEY, "STRIPE_SECRET_KEY");
// ```

/** A Cloudflare Secrets Store binding — resolves its value lazily via `.get()`. */
export interface SecretsStoreBinding {
  get(): Promise<string>;
}

/**
 * A secret as worker code sees it: a Secrets Store binding (deployed), a plain
 * string (local `.dev.vars`), or absent.
 */
export type SecretSource = SecretsStoreBinding | string | undefined | null;

function isBinding(source: SecretSource): source is SecretsStoreBinding {
  return (
    typeof source === "object" &&
    source !== null &&
    typeof (source as SecretsStoreBinding).get === "function"
  );
}

/**
 * Resolves a secret to its string value, or `undefined` when unset. Awaits a
 * Secrets Store binding's `.get()`; returns a plain string as-is (local dev). A
 * binding whose secret is missing rejects — that's a real misconfiguration, so
 * the error propagates rather than being swallowed.
 */
export async function getSecret(
  source: SecretSource,
): Promise<string | undefined> {
  if (isBinding(source)) return source.get();
  if (typeof source === "string") return source;
  return undefined;
}

/**
 * Like {@link getSecret} but throws when the secret is missing or empty. Call it
 * at worker startup to fail fast on a misconfigured secret instead of deep in a
 * request path.
 */
export async function requireSecret(
  source: SecretSource,
  name: string,
): Promise<string> {
  const value = await getSecret(source);
  if (value === undefined || value === "") {
    throw new Error(`Missing required secret: ${name}`);
  }
  return value;
}
