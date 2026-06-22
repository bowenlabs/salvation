// app/workers/cadmea/app/server.ts

import { securityHeaders } from "@core/lib/security-headers";
import startHandler from "@tanstack/solid-start/server-entry";
import { Hono } from "hono";

export { CadmeaService } from "./service.js";

const app = new Hono<{ Bindings: Env }>();

app.use("*", securityHeaders);

// 1. Custom API routes — checked first
//
// Form submission, magic-link auth, and media upload routes land in
// Phase 3/7/11 respectively, alongside their real implementations — see
// SECTION_1_PLAN.md's 2026-06-21 Phase 1 audit. Don't pre-add unimplemented
// stubs here; an early draft of this file had them and they were removed
// for looking functional when they weren't (`/api/auth/verify` redirected
// to `/admin/dashboard` with no token check at all).

// 2. TanStack Start — fallback for everything else, must be last
app.all("*", async (c) => startHandler.fetch(c.req.raw));

export default app;
