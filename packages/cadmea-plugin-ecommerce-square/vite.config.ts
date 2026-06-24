import { defineConfig } from "vite-plus";

// Packaging config lives here, in the `pack` block, per vite-plus's own
// guidance — see DECISIONS.md's 2026-06-24 entries. Two entries, same
// multi-key `entry` map shape packages/cadmus's own vite.config.ts uses
// for its subpath exports (index/client → dist/index.js, dist/client.js).
export default defineConfig({
  pack: {
    entry: { index: "src/index.ts", client: "src/client.ts" },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    clean: true,
    target: "es2022",
    // V8/Workers (index) / browser (client) target — no Node.js
    // built-ins, no Square Node SDK. cadmus and the ecommerce core
    // plugin are types-only/peer dependencies, erased at build time.
    platform: "browser",
    deps: {
      neverBundle: ["@thebes/cadmus", "@thebes/cadmea-plugin-ecommerce"],
    },
  },
});
