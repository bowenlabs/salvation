// Copyright (c) 2026 BowenLabs. All rights reserved.
// MIT licensed. See LICENSE in the repo root.
//
// Provider-agnostic — takes a `tokenize` callback rather than knowing
// about Square/Stripe itself. The consumer wires in whichever provider's
// `/client` helper (`createSquareCardField`/`createStripeCardField`) it's
// using; both share the exact `{ tokenize(): Promise<string> }` shape so
// swapping providers means swapping that one prop, not rewriting this
// component.

import { createSignal, onMount } from "solid-js";
import { useCart } from "./CartProvider.js";

export interface CheckoutFormProps {
  /** Mounts the provider's card field and produces a one-time payment source token — see this package's README for wiring either provider's `/client` helper here. */
  tokenize: () => Promise<string>;
  /** Called once the provider's card field should be mounted — receives the container element to attach to. Most consumers wire this to `createSquareCardField(el, opts)`/`createStripeCardField(el, opts)` directly and ignore the return value here (the `tokenize` prop is what's actually called on submit). */
  mountCardField?: (container: HTMLDivElement) => void;
  /** Default: "/api/checkout". */
  checkoutEndpoint?: string;
  onSuccess?: (order: unknown) => void;
  onError?: (error: Error) => void;
}

export function CheckoutForm(props: CheckoutFormProps) {
  const cart = useCart();
  const [email, setEmail] = createSignal("");
  const [submitting, setSubmitting] = createSignal(false);
  const [error, setError] = createSignal<string | undefined>();
  let cardContainer: HTMLDivElement | undefined;

  onMount(() => {
    if (cardContainer) props.mountCardField?.(cardContainer);
  });

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    setError(undefined);
    setSubmitting(true);
    try {
      const paymentSourceToken = await props.tokenize();
      const response = await fetch(props.checkoutEndpoint ?? "/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lineItems: cart.items().map((item) => ({
            catalogRef: item.catalogRef,
            quantity: item.quantity,
            clientUnitPrice: item.unitPrice,
          })),
          paymentSourceToken,
          customerEmail: email(),
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(
          typeof body?.error === "string" ? body.error : "Checkout failed",
        );
      }
      cart.clear();
      props.onSuccess?.(body.order ?? body);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message);
      props.onError?.(cause instanceof Error ? cause : new Error(message));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form class="checkout-form flex flex-col gap-4" onSubmit={handleSubmit}>
      <label class="form-control">
        <span class="label-text">Email</span>
        <input
          type="email"
          required
          class="input input-bordered"
          value={email()}
          onInput={(e) => setEmail(e.currentTarget.value)}
        />
      </label>

      <div ref={cardContainer} data-testid="card-field-container" />

      {error() && (
        <p class="text-error" role="alert" data-testid="checkout-error">
          {error()}
        </p>
      )}

      <button type="submit" class="btn btn-primary" disabled={submitting()}>
        {submitting() ? "Processing…" : "Pay now"}
      </button>
    </form>
  );
}
