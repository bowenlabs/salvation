// Copyright (c) 2026 BowenLabs. All rights reserved.
// MIT licensed. See LICENSE in the repo root.

import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CartDrawer } from "./CartDrawer.js";
import { CartProvider, useCart } from "./CartProvider.js";

afterEach(cleanup);
beforeEach(() => window.localStorage.clear());

function OpenCartAndAddItem() {
  const cart = useCart();
  cart.addItem({
    catalogRef: "sku-1",
    name: "Widget",
    unitPrice: { amount: 500, currency: "USD" },
  });
  cart.open();
  return null;
}

describe("CartDrawer", () => {
  it("renders nothing when the cart is closed", () => {
    render(() => (
      <CartProvider>
        <CartDrawer />
      </CartProvider>
    ));
    expect(screen.queryByTestId("cart-drawer")).not.toBeInTheDocument();
  });

  it("shows an empty-cart message when open with no items", () => {
    function OpenCart() {
      useCart().open();
      return null;
    }
    render(() => (
      <CartProvider>
        <OpenCart />
        <CartDrawer />
      </CartProvider>
    ));
    expect(screen.getByText("Your cart is empty.")).toBeInTheDocument();
  });

  it("lists items and the subtotal when open with items", () => {
    render(() => (
      <CartProvider>
        <OpenCartAndAddItem />
        <CartDrawer />
      </CartProvider>
    ));
    expect(screen.getByText("Widget")).toBeInTheDocument();
    expect(screen.getByTestId("quantity-sku-1").textContent).toBe("1");
    expect(screen.getByTestId("cart-subtotal").textContent).toContain("5");
  });

  it("increases quantity via the + button", () => {
    render(() => (
      <CartProvider>
        <OpenCartAndAddItem />
        <CartDrawer />
      </CartProvider>
    ));
    fireEvent.click(screen.getByLabelText("Increase quantity of Widget"));
    expect(screen.getByTestId("quantity-sku-1").textContent).toBe("2");
  });

  it("removes the item via the trash button", () => {
    render(() => (
      <CartProvider>
        <OpenCartAndAddItem />
        <CartDrawer />
      </CartProvider>
    ));
    fireEvent.click(screen.getByLabelText("Remove Widget"));
    expect(screen.getByText("Your cart is empty.")).toBeInTheDocument();
  });

  it("closes when the close button is clicked", () => {
    render(() => (
      <CartProvider>
        <OpenCartAndAddItem />
        <CartDrawer />
      </CartProvider>
    ));
    fireEvent.click(screen.getAllByLabelText("Close cart")[0]);
    expect(screen.queryByTestId("cart-drawer")).not.toBeInTheDocument();
  });

  it("renders the checkoutSlot when provided", () => {
    render(() => (
      <CartProvider>
        <OpenCartAndAddItem />
        <CartDrawer
          checkoutSlot={() => <button type="button">Checkout</button>}
        />
      </CartProvider>
    ));
    expect(screen.getByText("Checkout")).toBeInTheDocument();
  });
});
