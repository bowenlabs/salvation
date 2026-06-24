// Copyright (c) 2026 BowenLabs. All rights reserved.
// MIT licensed. See LICENSE in the repo root.

import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CartProvider, useCart } from "./CartProvider.js";

afterEach(cleanup);
beforeEach(() => window.localStorage.clear());

function TestConsumer() {
  const cart = useCart();
  return (
    <div>
      <span data-testid="count">{cart.items().length}</span>
      <span data-testid="subtotal">{cart.subtotal()}</span>
      <button
        type="button"
        onClick={() =>
          cart.addItem({
            catalogRef: "sku-1",
            name: "Widget",
            unitPrice: { amount: 500, currency: "USD" },
          })
        }
      >
        add
      </button>
      <button
        type="button"
        onClick={() =>
          cart.addItem(
            {
              catalogRef: "sku-1",
              name: "Widget",
              unitPrice: { amount: 500, currency: "USD" },
            },
            2,
          )
        }
      >
        add-two
      </button>
      <button type="button" onClick={() => cart.removeItem("sku-1")}>
        remove
      </button>
      <button type="button" onClick={() => cart.updateQuantity("sku-1", 0)}>
        zero
      </button>
      <button type="button" onClick={() => cart.clear()}>
        clear
      </button>
    </div>
  );
}

describe("CartProvider / useCart", () => {
  it("starts empty", () => {
    render(() => (
      <CartProvider>
        <TestConsumer />
      </CartProvider>
    ));
    expect(screen.getByTestId("count").textContent).toBe("0");
  });

  it("adds an item and computes the subtotal", () => {
    render(() => (
      <CartProvider>
        <TestConsumer />
      </CartProvider>
    ));
    fireEvent.click(screen.getByText("add"));
    expect(screen.getByTestId("count").textContent).toBe("1");
    expect(screen.getByTestId("subtotal").textContent).toBe("500");
  });

  it("merges a duplicate catalogRef by incrementing quantity, not adding a second line", () => {
    render(() => (
      <CartProvider>
        <TestConsumer />
      </CartProvider>
    ));
    fireEvent.click(screen.getByText("add"));
    fireEvent.click(screen.getByText("add"));
    expect(screen.getByTestId("count").textContent).toBe("1");
    expect(screen.getByTestId("subtotal").textContent).toBe("1000");
  });

  it("removeItem removes the line entirely", () => {
    render(() => (
      <CartProvider>
        <TestConsumer />
      </CartProvider>
    ));
    fireEvent.click(screen.getByText("add"));
    fireEvent.click(screen.getByText("remove"));
    expect(screen.getByTestId("count").textContent).toBe("0");
  });

  it("updateQuantity to 0 removes the line", () => {
    render(() => (
      <CartProvider>
        <TestConsumer />
      </CartProvider>
    ));
    fireEvent.click(screen.getByText("add"));
    fireEvent.click(screen.getByText("zero"));
    expect(screen.getByTestId("count").textContent).toBe("0");
  });

  it("clear empties the cart", () => {
    render(() => (
      <CartProvider>
        <TestConsumer />
      </CartProvider>
    ));
    fireEvent.click(screen.getByText("add-two"));
    fireEvent.click(screen.getByText("clear"));
    expect(screen.getByTestId("count").textContent).toBe("0");
  });

  it("persists to localStorage and a fresh CartProvider mount picks it up", async () => {
    const first = render(() => (
      <CartProvider>
        <TestConsumer />
      </CartProvider>
    ));
    fireEvent.click(screen.getByText("add"));
    expect(window.localStorage.getItem("cadmea-ecommerce-cart")).toContain(
      "sku-1",
    );
    first.unmount();
    cleanup();

    render(() => (
      <CartProvider>
        <TestConsumer />
      </CartProvider>
    ));
    // onMount runs asynchronously relative to the initial render commit.
    await Promise.resolve();
    expect(screen.getByTestId("count").textContent).toBe("1");
  });

  it("throws a clear error when useCart is called outside a CartProvider", () => {
    expect(() =>
      render(() => {
        useCart();
        return null;
      }),
    ).toThrow(/useCart\(\) must be called within a <CartProvider>/);
  });
});
