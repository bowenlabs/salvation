// Copyright (c) 2026 BowenLabs. All rights reserved.
// MIT licensed. See LICENSE in the repo root.

import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CartProvider, useCart } from "./CartProvider.js";
import { type Product, ProductDetail } from "./ProductDetail.js";

afterEach(cleanup);
beforeEach(() => window.localStorage.clear());

const product: Product = {
  id: 1,
  name: "Widget",
  description: "A fine widget.",
  variants: [
    { sku: "SM", catalogRef: "sku-sm", priceCents: 500, currency: "USD" },
    { sku: "LG", catalogRef: "sku-lg", priceCents: 700, currency: "USD" },
  ],
};

function CartProbe() {
  const cart = useCart();
  return <span data-testid="count">{cart.items().length}</span>;
}

describe("ProductDetail", () => {
  it("renders the product name, description, and a price for the default variant", () => {
    render(() => (
      <CartProvider>
        <ProductDetail product={product} />
      </CartProvider>
    ));
    expect(screen.getByText("Widget")).toBeInTheDocument();
    expect(screen.getByText("A fine widget.")).toBeInTheDocument();
    expect(screen.getByTestId("product-price").textContent).toContain("5");
  });

  it("shows a variant selector only when there's more than one variant", () => {
    const single: Product = { ...product, variants: [product.variants[0]] };
    render(() => (
      <CartProvider>
        <ProductDetail product={single} />
      </CartProvider>
    ));
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("adds the selected variant to the cart on click", () => {
    render(() => (
      <CartProvider>
        <ProductDetail product={product} />
        <CartProbe />
      </CartProvider>
    ));
    fireEvent.click(screen.getByText("Add to cart"));
    expect(screen.getByTestId("count").textContent).toBe("1");
  });

  it("calls onAddToCart with the selected variant", () => {
    let captured: unknown;
    render(() => (
      <CartProvider>
        <ProductDetail
          product={product}
          onAddToCart={(variant) => {
            captured = variant;
          }}
        />
      </CartProvider>
    ));
    fireEvent.click(screen.getByText("Add to cart"));
    expect(captured).toMatchObject({ sku: "SM" });
  });
});
