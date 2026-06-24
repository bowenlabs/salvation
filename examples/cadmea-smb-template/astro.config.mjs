import cloudflare from "@astrojs/cloudflare";
import solidJs from "@astrojs/solid-js";
import { defineConfig } from "astro/config";

// Two-Worker structure, mirroring this monorepo's own site/cadmea split
// (see CLAUDE.md's VMFE architecture) — this Astro project is the public
// storefront frontend; src/server.ts (deployed separately, see its own
// wrangler.jsonc) is the backend API Worker it calls. Kept separate
// rather than wrapping Astro inside the Hono Worker (the "Hono as spine"
// pattern Thebes's real app/ uses) since that wiring isn't this example's
// point — the plugin/component integration is.
export default defineConfig({
  output: "server",
  adapter: cloudflare(),
  integrations: [solidJs()],
});
