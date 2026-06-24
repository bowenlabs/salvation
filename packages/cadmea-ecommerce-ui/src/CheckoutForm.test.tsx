// Copyright (c) 2026 BowenLabs. All rights reserved.
// MIT licensed. See LICENSE in the repo root.

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@solidjs/testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CartProvider, useCart } from "./CartProvider.js";
import { CheckoutForm } from "./CheckoutForm.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
beforeEach(() => window.localStorage.clear());

function AddItem() {
  useCart().addItem({
    catalogRef: "sku-1",
    name: "Widget",
    unitPrice: { amount: 500, currency: "USD" },
  });
  return null;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("CheckoutForm", () => {
  it("calls tokenize, posts to the checkout endpoint with cart line items, and reports success", async () => {
    const tokenize = vi.fn().mockResolvedValue("tok_abc");
    let seenBody: Record<string, unknown> | undefined;
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      seenBody = JSON.parse(init.body as string);
      return jsonResponse({ order: { id: 1 } }, 201);
    });
    const onSuccess = vi.fn();

    render(() => (
      <CartProvider>
        <AddItem />
        <CheckoutForm tokenize={tokenize} onSuccess={onSuccess} />
      </CartProvider>
    ));

    fireEvent.input(screen.getByLabelText("Email"), {
      target: { value: "buyer@example.com" },
    });
    fireEvent.click(screen.getByText("Pay now"));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(tokenize).toHaveBeenCalled();
    expect(seenBody?.paymentSourceToken).toBe("tok_abc");
    expect(seenBody?.customerEmail).toBe("buyer@example.com");
    expect(seenBody?.lineItems).toEqual([
      {
        catalogRef: "sku-1",
        quantity: 1,
        clientUnitPrice: { amount: 500, currency: "USD" },
      },
    ]);
  });

  it("clears the cart on a successful checkout", async () => {
    vi.stubGlobal("fetch", async () => jsonResponse({ order: { id: 1 } }, 201));
    let itemCountAfter: number | undefined;

    function CheckoutFormWithCartProbe() {
      // Captured during render, inside the provider's context — calling
      // useCart() again later, from inside the plain onSuccess closure,
      // would throw (no component render in progress at that point).
      const cart = useCart();
      return (
        <CheckoutForm
          tokenize={async () => "tok_abc"}
          onSuccess={() => {
            itemCountAfter = cart.items().length;
          }}
        />
      );
    }

    render(() => (
      <CartProvider>
        <AddItem />
        <CheckoutFormWithCartProbe />
      </CartProvider>
    ));

    fireEvent.input(screen.getByLabelText("Email"), {
      target: { value: "buyer@example.com" },
    });
    fireEvent.click(screen.getByText("Pay now"));

    await waitFor(() => expect(itemCountAfter).toBe(0));
  });

  it("shows an error message and calls onError when the checkout request fails", async () => {
    vi.stubGlobal("fetch", async () =>
      jsonResponse({ error: "Price mismatch" }, 402),
    );
    const onError = vi.fn();

    render(() => (
      <CartProvider>
        <AddItem />
        <CheckoutForm tokenize={async () => "tok_abc"} onError={onError} />
      </CartProvider>
    ));

    fireEvent.input(screen.getByLabelText("Email"), {
      target: { value: "buyer@example.com" },
    });
    fireEvent.click(screen.getByText("Pay now"));

    await waitFor(() =>
      expect(screen.getByTestId("checkout-error").textContent).toBe(
        "Price mismatch",
      ),
    );
    expect(onError).toHaveBeenCalled();
  });

  it("shows an error and never calls fetch when tokenize() rejects", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const tokenize = vi.fn().mockRejectedValue(new Error("card declined"));

    render(() => (
      <CartProvider>
        <AddItem />
        <CheckoutForm tokenize={tokenize} />
      </CartProvider>
    ));

    fireEvent.input(screen.getByLabelText("Email"), {
      target: { value: "buyer@example.com" },
    });
    fireEvent.click(screen.getByText("Pay now"));

    await waitFor(() =>
      expect(screen.getByTestId("checkout-error").textContent).toBe(
        "card declined",
      ),
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("calls mountCardField with the container element on mount", () => {
    const mountCardField = vi.fn();
    render(() => (
      <CartProvider>
        <CheckoutForm
          tokenize={async () => "tok_abc"}
          mountCardField={mountCardField}
        />
      </CartProvider>
    ));
    expect(mountCardField).toHaveBeenCalledWith(
      screen.getByTestId("card-field-container"),
    );
  });
});
