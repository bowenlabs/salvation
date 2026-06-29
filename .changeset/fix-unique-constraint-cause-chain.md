---
"@thebes/cadmus": patch
---

Fix: classify D1 unique-constraint violations even when drizzle buries the SQLite text on `error.cause`.

`createLocalApi`'s write-error handling only inspected the top-level `error.message` when deciding whether a failed write was a unique-constraint violation. drizzle-orm's D1 driver wraps the underlying error so the `"UNIQUE constraint failed: …"` text lands on `error.cause` (sometimes deeper), leaving `message = "Failed query: …"`. As a result every unique violation against D1 fell through to the generic "Write failed for collection …" instead of "Unique constraint violated for collection …".

This broke callers that branch on the classified message — most visibly the `@thebes/cadmea-plugin-ecommerce` webhook/fulfillment dedup guards, which treat a duplicate `webhook_events.eventId` insert as "already processed" (HTTP 200). Pre-fix, a replayed payment/fulfillment webhook surfaced as a 500, so providers retried until the event dead-lettered (effects stayed idempotent — the failure happened before dispatch — but the response contract was wrong).

`wrapWriteError` now flattens the full `cause` chain before matching, so the classification holds regardless of how deep the driver nests the SQLite error.
