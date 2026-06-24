import babel from "@rolldown/plugin-babel";
import { defineConfig } from "vite-plus";

// Single dom-generate build — unlike @thebes/cadmea (which needs a
// matching ssr-generate build for components also rendered server-side
// via TanStack Start), every component here is a pure client-side island
// (mounted into Astro pages via @astrojs/solid-js), never imported into
// any SSR render path. See DECISIONS.md's "Component framework tiering"
// entry for why this package is SolidJS at all (extension-author
// discretion, not the public site's own Alpine.js sprinkle-on tier).
function solidBabel() {
  return babel({
    presets: [["solid", { generate: "dom", hydratable: false }]],
  });
}

const external = ["@thebes/cadmus", "solid-js"];

export default defineConfig({
  pack: {
    outDir: "dist",
    platform: "browser",
    target: "es2022",
    format: ["esm"],
    sourcemap: true,
    deps: { neverBundle: external },
    entry: { index: "src/index.ts" },
    dts: true,
    clean: true,
    plugins: [solidBabel()],
  },
});
