// Copyright (c) 2026 BowenLabs. All rights reserved.
// MIT licensed. See LICENSE in the repo root.
//
// Browser-only client-side tokenization helper — a separate subpath
// (`@thebes/cadmea-plugin-ecommerce-square/client`) so the server-side
// provider entry never pulls in anything DOM-shaped, and vice versa.
//
// Square's Web Payments SDK is already vanilla, framework-agnostic,
// DOM-attach JS with no official Solid binding — same shape of gap as
// Phosphor icons and TipTap (both resolved in this codebase's DECISIONS.md
// 2026-06-19 entry by using the vendor's framework-agnostic build
// directly, not an unofficial wrapper). This file follows that precedent:
// it is NOT a Solid component, has no JSX — just script-tag loading + SDK
// init + card.attach()/card.tokenize() boilerplate, so every consumer
// doesn't hand-roll the same dance. Card data never reaches the Worker —
// tokenization happens entirely in the browser, here.

export interface SquareCardFieldOptions {
  applicationId: string;
  locationId: string;
  environment?: "sandbox" | "production";
}

export interface CardField {
  tokenize(): Promise<string>;
  destroy(): Promise<void>;
}

// biome-ignore lint/suspicious/noExplicitAny: the Square Web Payments SDK ships no official TypeScript types for the `window.Square` global
type SquareGlobal = any;

function sdkUrl(environment: SquareCardFieldOptions["environment"]): string {
  return environment === "production"
    ? "https://web.squarecdn.com/v1/square.js"
    : "https://sandbox.web.squarecdn.com/v1/square.js";
}

let sdkLoadPromise: Promise<SquareGlobal> | undefined;

function loadSquareSdk(
  environment: SquareCardFieldOptions["environment"],
): Promise<SquareGlobal> {
  if ((window as { Square?: SquareGlobal }).Square) {
    return Promise.resolve((window as { Square?: SquareGlobal }).Square);
  }
  if (sdkLoadPromise) return sdkLoadPromise;

  sdkLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = sdkUrl(environment);
    script.onload = () => resolve((window as { Square?: SquareGlobal }).Square);
    script.onerror = () =>
      reject(
        new Error(`Failed to load Square Web Payments SDK from ${script.src}`),
      );
    document.head.appendChild(script);
  });
  return sdkLoadPromise;
}

/**
 * Loads the Square Web Payments SDK (if not already present), initializes
 * a card field, and attaches it to `container`. The returned `tokenize()`
 * produces a one-time payment source token suitable for
 * `PaymentProvider.checkout`'s `paymentSourceToken` — raw card data never
 * leaves the browser.
 *
 * ```ts
 * const card = await createSquareCardField(containerEl, { applicationId, locationId });
 * // ...on checkout submit:
 * const token = await card.tokenize();
 * await fetch("/api/checkout", { method: "POST", body: JSON.stringify({ paymentSourceToken: token, ... }) });
 * ```
 */
export async function createSquareCardField(
  container: HTMLElement | string,
  options: SquareCardFieldOptions,
): Promise<CardField> {
  const Square = await loadSquareSdk(options.environment);
  const payments = Square.payments(options.applicationId, options.locationId);
  const card = await payments.card();
  await card.attach(container);

  return {
    async tokenize() {
      const result = await card.tokenize();
      if (result.status !== "OK") {
        throw new Error(
          `Square card tokenization failed: ${result.status}${
            result.errors ? ` — ${JSON.stringify(result.errors)}` : ""
          }`,
        );
      }
      return result.token as string;
    },
    async destroy() {
      await card.destroy();
    },
  };
}
