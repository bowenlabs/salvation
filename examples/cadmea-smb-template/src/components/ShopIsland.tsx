// One Astro island composing the whole storefront widget tree under a
// single <CartProvider> — Astro hydrates each `client:*` directive as its
// own isolated component root, so CartProvider's context would NOT be
// shared across multiple separate islands; everything that needs to share
// cart state has to live inside this one component, mounted once.

import {
  CartDrawer,
  CartProvider,
  CheckoutForm,
  type Product,
  ProductDetail,
  useCart,
} from "@thebes/cadmea-ecommerce-ui";
import { createSquareCardField } from "@thebes/cadmea-plugin-ecommerce-square/client";
import { createSignal } from "solid-js";

export interface ShopIslandProps {
  product: Product;
  squareApplicationId: string;
  squareLocationId: string;
  checkoutEndpoint: string;
}

function OpenCartButton() {
  const cart = useCart();
  return (
    <button
      type="button"
      class="btn btn-outline mt-4"
      onClick={() => cart.open()}
    >
      View cart ({cart.items().length})
    </button>
  );
}

export function ShopIsland(props: ShopIslandProps) {
  // The card field's tokenize() isn't available until the Square SDK has
  // loaded and attached — this signal is the bridge between that async
  // mount step (triggered by CheckoutForm's mountCardField callback) and
  // CheckoutForm's own (synchronous-looking) `tokenize` prop.
  const [tokenizeFn, setTokenizeFn] = createSignal<
    (() => Promise<string>) | undefined
  >();

  async function handleMountCardField(container: HTMLDivElement) {
    const card = await createSquareCardField(container, {
      applicationId: props.squareApplicationId,
      locationId: props.squareLocationId,
      environment: "sandbox",
    });
    setTokenizeFn(() => card.tokenize);
  }

  return (
    <CartProvider>
      <ProductDetail product={props.product} />
      <OpenCartButton />
      <CartDrawer
        checkoutSlot={() => (
          <div class="mt-4">
            <CheckoutForm
              tokenize={async () => {
                const fn = tokenizeFn();
                if (!fn) throw new Error("Card field not ready yet");
                return fn();
              }}
              mountCardField={handleMountCardField}
              checkoutEndpoint={props.checkoutEndpoint}
              onSuccess={() => alert("Order placed!")}
              onError={(error) => alert(error.message)}
            />
          </div>
        )}
      />
    </CartProvider>
  );
}
