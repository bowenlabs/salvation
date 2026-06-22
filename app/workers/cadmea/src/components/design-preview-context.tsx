import type { TokenStyleInput } from "@core/lib/design-system/build-token-style";
import {
  createContext,
  createSignal,
  type JSX,
  type Signal,
  useContext,
} from "solid-js";

export type DesignOverrides = Partial<TokenStyleInput & { darkMode?: boolean }>;

const DesignPreviewContext = createContext<Signal<DesignOverrides | null>>();

// Lets a descendant route (the /admin/design page, an Outlet child) push
// uncommitted edits up to <BrandColorProvider> — an ancestor in __root.tsx
// — without prop-drilling. BrandColorProvider merges these over its own
// loader-fed props; the Design route clears them (setOverrides(null)) on
// unmount so leaving without saving reverts the Panel to the saved state.
export function DesignPreviewProvider(props: { children: JSX.Element }) {
  const signal = createSignal<DesignOverrides | null>(null);
  return (
    <DesignPreviewContext.Provider value={signal}>
      {props.children}
    </DesignPreviewContext.Provider>
  );
}

export function useDesignPreviewOverrides(): Signal<DesignOverrides | null> {
  const signal = useContext(DesignPreviewContext);
  if (!signal) {
    throw new Error(
      "useDesignPreviewOverrides must be used within <DesignPreviewProvider>",
    );
  }
  return signal;
}
