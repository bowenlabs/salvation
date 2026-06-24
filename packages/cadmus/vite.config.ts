import { defineConfig } from "vite-plus";

// Packaging config lives here, in the `pack` block, per vite-plus's own
// guidance — see DECISIONS.md's 2026-06-24 entry. `vp pack`'s `pack`
// block accepts the same shape tsdown.config.ts did (PackUserConfig
// extends tsdown's UserConfig), so this is a direct port of the previous
// tsdown.config.ts, just read from vite.config.ts instead.
export default defineConfig({
  pack: {
    entry: {
      index: "src/index.ts",
      "auth/index": "src/auth/index.ts",
      "db/index": "src/db/index.ts",
      "storage/index": "src/storage/index.ts",
      "cache/index": "src/cache/index.ts",
      "email/index": "src/email/index.ts",
      "rate-limit/index": "src/rate-limit/index.ts",
      "session/index": "src/session/index.ts",
      "queues/index": "src/queues/index.ts",
      "hono/index": "src/hono/index.ts",
      "cms/index": "src/cms/index.ts",
      "astro/index": "src/astro/index.ts",
    },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    clean: true,
    target: "es2022",
    // Cloudflare Workers target — no Node.js built-ins
    platform: "browser",
    deps: { neverBundle: ["hono", "drizzle-orm", "cloudflare:email", "astro"] },
  },
});
