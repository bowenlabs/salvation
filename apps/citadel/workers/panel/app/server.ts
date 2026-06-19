// apps/citadel/workers/panel/app/server.ts

import startHandler from "@tanstack/solid-start/server-entry";
import { Hono } from "hono";

const app = new Hono<{ Bindings: Env }>();

// 1. Custom API routes — checked first
app.get("/api/ping", async (c) => {
  const result = await c.env.DB.prepare("SELECT 1 as ok").first();
  await c.env.KV.put("ping", "pong");
  const kv = await c.env.KV.get("ping");
  return c.json({ db: result, kv, worker: "panel" });
});

// Public form submission — unauthenticated
app.post("/api/form/:slug", async (c) => {
  // rate limit, honeypot check, validate, insert submission
  return c.json({ ok: true });
});

// Auth endpoints — called by Astro login page
app.post("/api/auth/magic-link", async (c) => {
  // rate limit, lookup user, generate token, store in KV, send email
  return c.json({ ok: true });
});
app.get("/api/auth/verify", async (c) => {
  // hash token, KV lookup, delete token, create session, set cookie
  return c.redirect("/admin/dashboard");
});
app.post("/api/auth/logout", async (c) => {
  // delete session from KV, clear cookie
  return c.redirect("/login");
});

// Media upload
app.post("/api/media/upload", async (c) => {
  // validate file, put to R2, return public URL
  return c.json({ url: "" });
});

app.get("/api/crypto-test", async (c) => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode("test-secret"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode("data"),
  );
  const sigHex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return c.json({ token: hex, hmac: sigHex });
});

// 2. TanStack Start — fallback for everything else, must be last
app.all("*", async (c) => startHandler.fetch(c.req.raw));

export default app;
