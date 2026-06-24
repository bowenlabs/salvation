// Copyright (c) 2026 BowenLabs. All rights reserved.
// MIT licensed. See LICENSE in the repo root.

import { createMemo, createSignal, For, Show } from "solid-js";
import { useCart } from "./CartProvider.js";

export interface ProductVariant {
  sku: string;
  catalogRef: string;
  priceCents: number;
  currency: string;
  inventoryCount?: number;
}

export interface Product {
  id: number;
  name: string;
  description?: string;
  variants: ProductVariant[];
}

export interface ProductDetailProps {
  product: Product;
  onAddToCart?: (variant: ProductVariant) => void;
}

function formatPrice(cents: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
  }).format(cents / 100);
}

export function ProductDetail(props: ProductDetailProps) {
  const cart = useCart();
  const [selectedSku, setSelectedSku] = createSignal(
    props.product.variants[0]?.sku ?? "",
  );

  const selectedVariant = createMemo(() =>
    props.product.variants.find((v) => v.sku === selectedSku()),
  );

  function handleAddToCart() {
    const variant = selectedVariant();
    if (!variant) return;
    cart.addItem({
      catalogRef: variant.catalogRef,
      name: props.product.name,
      unitPrice: { amount: variant.priceCents, currency: variant.currency },
    });
    props.onAddToCart?.(variant);
  }

  return (
    <div class="product-detail" data-testid="product-detail">
      <h1 class="text-2xl font-bold">{props.product.name}</h1>
      <Show when={props.product.description}>
        <p class="opacity-80">{props.product.description}</p>
      </Show>

      <Show when={props.product.variants.length > 1}>
        <label class="form-control w-full max-w-xs">
          <span class="label-text">Variant</span>
          <select
            class="select select-bordered"
            value={selectedSku()}
            onChange={(e) => setSelectedSku(e.currentTarget.value)}
          >
            <For each={props.product.variants}>
              {(variant) => <option value={variant.sku}>{variant.sku}</option>}
            </For>
          </select>
        </label>
      </Show>

      <Show when={selectedVariant()}>
        {(variant) => (
          <p class="text-xl font-semibold" data-testid="product-price">
            {formatPrice(variant().priceCents, variant().currency)}
          </p>
        )}
      </Show>

      <button
        type="button"
        class="btn btn-primary"
        disabled={!selectedVariant()}
        onClick={handleAddToCart}
      >
        <i class="ph ph-shopping-cart-simple" aria-hidden="true" />
        Add to cart
      </button>
    </div>
  );
}
