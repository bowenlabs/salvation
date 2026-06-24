import { defineConfig } from "vite-plus";

// Packaging config lives here, in the `pack` block, per vite-plus's own
// guidance — see DECISIONS.md's 2026-06-24 entries (the cadmus/cadmea
// migration, then the cadmea-design-system consistency-gap follow-up).
// This is the same follow-up applied to the remaining tsup holdouts: a
// direct port, not a redesign.
export default defineConfig({
  pack: {
    entry: { index: "src/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    clean: true,
    target: "es2022",
    // V8/Workers target. cadmus is a peer (the consumer always has it), so
    // it is resolved at runtime rather than bundled in.
    platform: "browser",
    deps: { neverBundle: ["@thebes/cadmus"] },
  },
});
