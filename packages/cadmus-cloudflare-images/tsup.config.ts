import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts" },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2022",
  // V8/Workers target. cadmus is a peer (the consumer always has it), so it
  // is resolved at runtime rather than bundled in.
  platform: "browser",
  external: ["@thebes/cadmus"],
});
