type Runtime = import("@astrojs/cloudflare").Runtime<Env>;

interface Env {
  DB: D1Database;
  KV: KVNamespace;
  R2: R2Bucket;
  ASSETS: Fetcher;
  SESSION_SECRET: string;
  OWNER_EMAIL: string;
  MEDIA_URL: string;
}

declare namespace App {
  interface Locals {
    runtime: { env: Env };
    user?: { id: number; email: string; role: string };
  }
}
