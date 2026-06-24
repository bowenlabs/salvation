// Copyright (c) 2026 BowenLabs. All rights reserved.
// MIT licensed. See LICENSE in the repo root.

import { For, type JSX, Show } from "solid-js";
import { useCart } from "./CartProvider.js";

function formatPrice(cents: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
  }).format(cents / 100);
}

export interface CartDrawerProps {
  /** Rendered inside the drawer below the line items, typically a checkout link/button. */
  checkoutSlot?: () => JSX.Element;
}

export function CartDrawer(props: CartDrawerProps) {
  const cart = useCart();

  return (
    <Show when={cart.isOpen()}>
      <div class="cart-drawer fixed inset-0 z-50" data-testid="cart-drawer">
        <button
          type="button"
          class="fixed inset-0 bg-[var(--color-backdrop)]"
          aria-label="Close cart"
          onClick={() => cart.close()}
        />
        <aside class="fixed right-0 top-0 h-full w-full max-w-sm bg-base-100 p-4 shadow-xl">
          <div class="flex items-center justify-between">
            <h2 class="text-lg font-bold">Your cart</h2>
            <button
              type="button"
              class="btn btn-sm btn-circle"
              aria-label="Close cart"
              onClick={() => cart.close()}
            >
              <i class="ph ph-x" aria-hidden="true" />
            </button>
          </div>

          <Show
            when={cart.items().length > 0}
            fallback={<p class="opacity-70">Your cart is empty.</p>}
          >
            <ul class="mt-4 flex flex-col gap-3">
              <For each={cart.items()}>
                {(item) => (
                  <li class="flex items-center justify-between gap-2">
                    <div>
                      <p class="font-medium">{item.name}</p>
                      <p class="text-sm opacity-70">
                        {formatPrice(
                          item.unitPrice.amount,
                          item.unitPrice.currency,
                        )}{" "}
                        × {item.quantity}
                      </p>
                    </div>
                    <div class="flex items-center gap-1">
                      <button
                        type="button"
                        class="btn btn-xs"
                        aria-label={`Decrease quantity of ${item.name}`}
                        onClick={() =>
                          cart.updateQuantity(
                            item.catalogRef,
                            item.quantity - 1,
                          )
                        }
                      >
                        −
                      </button>
                      <span data-testid={`quantity-${item.catalogRef}`}>
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        class="btn btn-xs"
                        aria-label={`Increase quantity of ${item.name}`}
                        onClick={() =>
                          cart.updateQuantity(
                            item.catalogRef,
                            item.quantity + 1,
                          )
                        }
                      >
                        +
                      </button>
                      <button
                        type="button"
                        class="btn btn-xs btn-ghost"
                        aria-label={`Remove ${item.name}`}
                        onClick={() => cart.removeItem(item.catalogRef)}
                      >
                        <i class="ph ph-trash" aria-hidden="true" />
                      </button>
                    </div>
                  </li>
                )}
              </For>
            </ul>

            <div class="mt-4 flex items-center justify-between border-t pt-4">
              <span class="font-semibold">Subtotal</span>
              <span data-testid="cart-subtotal">
                {formatPrice(
                  cart.subtotal(),
                  cart.items()[0]?.unitPrice.currency ?? "USD",
                )}
              </span>
            </div>

            {props.checkoutSlot?.()}
          </Show>
        </aside>
      </div>
    </Show>
  );
}
