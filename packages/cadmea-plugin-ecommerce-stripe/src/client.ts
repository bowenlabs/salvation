// Copyright (c) 2026 BowenLabs. All rights reserved.
// MIT licensed. See LICENSE in the repo root.
//
// Browser-only client-side tokenization helper — a separate subpath
// (`@thebes/cadmea-plugin-ecommerce-stripe/client`), matching
// `@thebes/cadmea-plugin-ecommerce-square/client`'s shape exactly
// (`createXCardField` → `{ tokenize(), destroy() }`) so a consumer's
// checkout UI can swap providers without rewriting its own component —
// the client-side mirror of `PaymentProvider`'s own swappability.
//
// Stripe.js/Elements is likewise vanilla and framework-agnostic with no
// official Solid binding — same precedent as the Square client (see
// DECISIONS.md's 2026-06-19 entry on Phosphor/TipTap). Card data never
// reaches the Worker — tokenization happens entirely in the browser, here.

export interface StripeCardFieldOptions {
  publishableKey: string;
}

export interface CardField {
  tokenize(): Promise<string>;
  destroy(): Promise<void>;
}

// biome-ignore lint/suspicious/noExplicitAny: Stripe.js ships no official TypeScript types loadable without the `@stripe/stripe-js` npm package, which this plugin deliberately doesn't depend on
type StripeGlobal = any;

const SDK_URL = "https://js.stripe.com/v3/";

let sdkLoadPromise: Promise<StripeGlobal> | undefined;

function loadStripeSdk(): Promise<StripeGlobal> {
  if ((window as { Stripe?: StripeGlobal }).Stripe) {
    return Promise.resolve((window as { Stripe?: StripeGlobal }).Stripe);
  }
  if (sdkLoadPromise) return sdkLoadPromise;

  sdkLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SDK_URL;
    script.onload = () => resolve((window as { Stripe?: StripeGlobal }).Stripe);
    script.onerror = () =>
      reject(new Error(`Failed to load Stripe.js from ${SDK_URL}`));
    document.head.appendChild(script);
  });
  return sdkLoadPromise;
}

/**
 * Loads Stripe.js (if not already present), mounts a Card Element on
 * `container`. The returned `tokenize()` produces a PaymentMethod id
 * suitable for `PaymentProvider.checkout`'s `paymentSourceToken` — raw
 * card data never leaves the browser.
 *
 * ```ts
 * const card = await createStripeCardField(containerEl, { publishableKey });
 * // ...on checkout submit:
 * const token = await card.tokenize();
 * await fetch("/api/checkout", { method: "POST", body: JSON.stringify({ paymentSourceToken: token, ... }) });
 * ```
 */
export async function createStripeCardField(
  container: HTMLElement | string,
  options: StripeCardFieldOptions,
): Promise<CardField> {
  const StripeCtor = await loadStripeSdk();
  const stripe = StripeCtor(options.publishableKey);
  const elements = stripe.elements();
  const card = elements.create("card");
  card.mount(container);

  return {
    async tokenize() {
      const { paymentMethod, error } = await stripe.createPaymentMethod({
        type: "card",
        card,
      });
      if (error) {
        throw new Error(`Stripe card tokenization failed: ${error.message}`);
      }
      return paymentMethod.id as string;
    },
    async destroy() {
      card.unmount();
    },
  };
}
