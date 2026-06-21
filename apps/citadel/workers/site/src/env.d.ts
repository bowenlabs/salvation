import type { CmsService } from "../../cms/app/service.js";

declare global {
  type Runtime = import("@astrojs/cloudflare").Runtime<Env>;

  interface Env {
    DB: D1Database;
    KV: KVNamespace;
    R2: R2Bucket;
    ASSETS: Fetcher;
    SESSION_SECRET: string;
    OWNER_EMAIL: string;
    MEDIA_URL: string;
    /** Service Binding RPC into Worker 2 (CMS) — see apps/citadel/workers/cms/app/service.ts */
    CMS: Service<typeof CmsService>;
  }

  namespace App {
    interface Locals {
      runtime: { env: Env };
      user?: { id: number; email: string; role: string };
    }
  }
}
