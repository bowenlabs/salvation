import type { CadmeaService } from "../../cadmea/app/service.js";

declare global {
  type Runtime = import("@astrojs/cloudflare").Runtime<Env>;

  interface Env {
    DB: D1Database;
    KV: KVNamespace;
    SESSION: KVNamespace;
    R2: R2Bucket;
    EMAIL: SendEmail;
    ASSETS: Fetcher;
    SESSION_SECRET: string;
    ADMIN_EMAIL: string;
    MEDIA_URL: string;
    CADMEA_URL: string;
    /** Service Binding RPC into Worker 2 (Cadmea) — see app/workers/cadmea/app/service.ts */
    CADMEA: Service<typeof CadmeaService>;
  }

  namespace App {
    interface Locals {
      runtime: { env: Env };
      user?: { id: number; email: string; role: string };
    }
  }
}
