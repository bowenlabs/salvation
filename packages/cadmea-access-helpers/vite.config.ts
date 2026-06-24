import { defineConfig } from "vite-plus";

// Packaging config lives here, in the `pack` block, per vite-plus's own
// guidance — see DECISIONS.md's 2026-06-24 entry. This package is a plain
// library (no CMS-config opinion, no Cadmus interface — same "neither
// axis" categorization as @thebes/cadmea-design-system), so it follows
// that package's vp pack convention, not the tsup convention the actual
// plugin packages (@thebes/cadmea-plugin-*) use.
export default defineConfig({
  pack: {
    entry: { index: "src/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    clean: true,
    target: "es2022",
    platform: "browser",
    // @thebes/cadmus is a types-only peer — never bundled in.
    deps: { neverBundle: ["@thebes/cadmus"] },
  },
});
