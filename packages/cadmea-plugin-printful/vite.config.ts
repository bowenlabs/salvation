import { defineConfig } from "vite-plus";

// Single entry, same shape as cadmea-plugin-ecommerce-stripe's "index" entry
// — this plugin has no client-side counterpart (Printful order creation is
// entirely server-side, triggered by the ecommerce plugin's onOrderPaid
// hook, not a browser-side tokenization step).
export default defineConfig({
  pack: {
    entry: { index: "src/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    clean: true,
    target: "es2022",
    // V8/Workers target — no Node.js built-ins, no Printful Node SDK.
    // cadmus and the ecommerce core plugin are types-only/peer
    // dependencies, erased at build time.
    platform: "browser",
    deps: {
      neverBundle: ["@thebes/cadmus", "@thebes/cadmea-plugin-ecommerce"],
    },
  },
});
