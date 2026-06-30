---
"@thebes/cadmus": minor
---

Add `createErrorMonitoring` — a vendor-neutral Hono `onError` handler factory.
The consumer supplies a `capture(error, c)` sink (Sentry, Axiom, console, …) and
cadmus stays SDK-free. It reports the error best-effort (swallowing sink
failures, running via `waitUntil` when an execution context is present), then
responds via an optional `onError` delegate (default `500`). Registered on the
outermost app it also catches errors rethrown by inner mounted routers.
