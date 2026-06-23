// Copyright (c) 2026 BowenLabs. All rights reserved.
// Cadmus is MIT licensed. See LICENSE in the repo root.
//
// @thebes/cadmus/auth
//
// Web Crypto primitives for magic-link/token-based auth flows. No
// passwords, no Node.js crypto — every operation here runs on
// `crypto.subtle` / `crypto.getRandomValues`, available natively in the
// V8 isolate. Callers own the KV storage and cookie wiring; this module
// is pure functions over bytes.

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/** Generates a 32-byte random token, hex-encoded — for magic-link URLs. */
export function generateToken(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(32)));
}

/** SHA-256 hashes a token for storage — raw tokens never touch KV. */
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return toHex(new Uint8Array(digest));
}

/** Generates a 16-byte random session ID, hex-encoded. */
export function generateSessionId(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(16)));
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/** HMAC-SHA256-signs a session ID, base64url-encoded. */
export async function signSession(
  sessionId: string,
  secret: string,
): Promise<string> {
  const key = await hmacKey(secret);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(sessionId),
  );
  return toBase64Url(new Uint8Array(signature));
}

/** Verifies an HMAC-SHA256 session signature. */
export async function verifySession(
  sessionId: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  const key = await hmacKey(secret);
  let signatureBytes: Uint8Array;
  try {
    signatureBytes = fromBase64Url(signature);
  } catch {
    return false;
  }
  return crypto.subtle.verify(
    "HMAC",
    key,
    signatureBytes as BufferSource,
    new TextEncoder().encode(sessionId),
  );
}
