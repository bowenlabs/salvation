import babel from "@rolldown/plugin-babel";
import { defineConfig } from "tsdown";

// Replaces tsup + tsup-preset-solid — see DECISIONS.md's 2026-06-23 entry.
// Note the 2026-06-24 follow-up there: `vp pack` does compile Solid JSX
// correctly when the babel plugin is declared in a `pack` block inside
// `vite.config.ts` (the documented config surface) rather than a
// standalone `tsdown.config.ts` like this one — the original "doesn't
// compile Solid JSX at all" finding was against the wrong config surface,
// not a real vite-plus bug. tsdown is the real engine vite-plus's pack
// command wraps; this package calls it directly and wires in
// @rolldown/plugin-babel + babel-preset-solid — the same pattern Void's
// own React scaffold uses for React (@rolldown/plugin-babel +
// reactCompilerPreset()) — producing genuine
// template()/insert()/delegateEvents() output, verified in the issue #30
// spike. Switching to `vp pack` instead is a separate decision, not made.
//
// tsup-preset-solid built every Solid entry twice (esbuild-plugin-solid,
// `generate: server ? "ssr" : "dom"`) to get separate browser and SSR
// codegen from the same source, and used `platform: "node"` for the
// server build (SolidStart's default Node SSR assumption). Both builds
// stay on `platform: "browser"` here instead — per CLAUDE.md, Cadmea's
// server-side rendering happens inside the Cloudflare Worker V8 isolate
// (Worker 2), never Node, regardless of which build it is.
//
// All four configs share one `dist` outDir (subfolder baked into the
// entry key) so `clean: true` on the first config clears once for the
// whole package, matching the preset's old `i === 0` clean logic — a
// per-subfolder outDir would only ever clean the first subfolder.
function solidBabel(generate: "dom" | "ssr") {
  return babel({ presets: [["solid", { generate, hydratable: false }]] });
}

const external = [
  "@thebes/cadmus",
  "@tanstack/solid-query",
  "@tanstack/solid-router",
  "solid-js",
];

const shared = {
  outDir: "dist",
  platform: "browser" as const,
  target: "es2022" as const,
  format: ["esm"] as const,
  sourcemap: true,
  deps: { neverBundle: external },
};

export default defineConfig([
  {
    ...shared,
    entry: { "index/index": "src/index.ts" },
    dts: true,
    clean: true,
    plugins: [solidBabel("dom")],
  },
  {
    ...shared,
    entry: { "index/server": "src/index.ts" },
    dts: false,
    clean: false,
    plugins: [solidBabel("ssr")],
  },
  {
    ...shared,
    entry: { "tanstack-start/index": "src/tanstack-start/index.ts" },
    dts: true,
    clean: false,
    plugins: [solidBabel("dom")],
  },
  {
    ...shared,
    entry: { "tanstack-start/server": "src/tanstack-start/index.ts" },
    dts: false,
    clean: false,
    plugins: [solidBabel("ssr")],
  },
]);
