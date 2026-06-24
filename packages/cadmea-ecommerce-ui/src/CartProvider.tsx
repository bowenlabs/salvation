// Copyright (c) 2026 BowenLabs. All rights reserved.
// MIT licensed. See LICENSE in the repo root.
//
// localStorage-backed cart state, the same pattern found independently in
// two of the three Next.js + Payload reference repos this package's
// design was generalized from (a `CartContext`-style provider, no DB sync
// needed until checkout). Pure SolidJS reactivity (createSignal), no
// React-isms.

import {
  type Accessor,
  createContext,
  createSignal,
  type JSX,
  onMount,
  useContext,
} from "solid-js";

export interface CartLineItem {
  catalogRef: string;
  name: string;
  quantity: number;
  unitPrice: { amount: number; currency: string };
}

export interface CartContextValue {
  items: Accessor<CartLineItem[]>;
  isOpen: Accessor<boolean>;
  subtotal: Accessor<number>;
  addItem: (item: Omit<CartLineItem, "quantity">, quantity?: number) => void;
  removeItem: (catalogRef: string) => void;
  updateQuantity: (catalogRef: string, quantity: number) => void;
  clear: () => void;
  open: () => void;
  close: () => void;
}

const CartContext = createContext<CartContextValue>();

const STORAGE_KEY = "cadmea-ecommerce-cart";

function loadStoredItems(): CartLineItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CartLineItem[]) : [];
  } catch {
    // A corrupted or inaccessible localStorage entry shouldn't crash the
    // storefront — fall back to an empty cart, same as a first-ever visit.
    return [];
  }
}

export interface CartProviderProps {
  children: JSX.Element;
}

export function CartProvider(props: CartProviderProps) {
  const [items, setItems] = createSignal<CartLineItem[]>([]);
  const [isOpen, setIsOpen] = createSignal(false);

  // Deferred to onMount rather than read at module/signal-init time —
  // keeps this component safe to import in a context where `window` isn't
  // defined yet (e.g. a build-time render pass), even though every real
  // usage is a client-only island.
  onMount(() => setItems(loadStoredItems()));

  function persist(next: CartLineItem[]) {
    setItems(next);
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  const value: CartContextValue = {
    items,
    isOpen,
    subtotal: () =>
      items().reduce(
        (sum, item) => sum + item.unitPrice.amount * item.quantity,
        0,
      ),
    addItem(item, quantity = 1) {
      const existing = items().find((i) => i.catalogRef === item.catalogRef);
      if (existing) {
        persist(
          items().map((i) =>
            i.catalogRef === item.catalogRef
              ? { ...i, quantity: i.quantity + quantity }
              : i,
          ),
        );
      } else {
        persist([...items(), { ...item, quantity }]);
      }
    },
    removeItem(catalogRef) {
      persist(items().filter((i) => i.catalogRef !== catalogRef));
    },
    updateQuantity(catalogRef, quantity) {
      if (quantity <= 0) {
        persist(items().filter((i) => i.catalogRef !== catalogRef));
        return;
      }
      persist(
        items().map((i) =>
          i.catalogRef === catalogRef ? { ...i, quantity } : i,
        ),
      );
    },
    clear() {
      persist([]);
    },
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
  };

  return (
    <CartContext.Provider value={value}>{props.children}</CartContext.Provider>
  );
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart() must be called within a <CartProvider>");
  }
  return context;
}
