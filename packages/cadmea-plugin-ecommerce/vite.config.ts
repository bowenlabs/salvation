import { defineConfig } from "vite-plus";

// Packaging config lives here, in the `pack` block, per vite-plus's own
// guidance — see DECISIONS.md's 2026-06-24 entries.
export default defineConfig({
  pack: {
    entry: { index: "src/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    clean: true,
    target: "es2022",
    // V8/Workers target — no Node.js built-ins. cadmus and hono are
    // types-only/peer dependencies, erased at build time, never bundled in.
    platform: "browser",
    deps: { neverBundle: ["@thebes/cadmus", "hono"] },
  },
});
