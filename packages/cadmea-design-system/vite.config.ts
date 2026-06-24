import { defineConfig } from "vite-plus";

// Packaging config lives here, in the `pack` block, per vite-plus's own
// guidance — see DECISIONS.md's 2026-06-24 entry. Direct port of the
// previous tsup.config.ts, same shape `packages/cadmus`'s migration used.
export default defineConfig({
  pack: {
    entry: { index: "src/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    clean: true,
    target: "es2022",
    // Pure functions producing CSS strings — no platform APIs, no deps.
    platform: "browser",
  },
});
