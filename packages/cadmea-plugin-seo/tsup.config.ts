import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts" },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2022",
  // V8/Workers target — no Node.js built-ins. cadmus is a types-only peer,
  // erased at build time, so it is never bundled in.
  platform: "browser",
  external: ["@thebes/cadmus"],
});
