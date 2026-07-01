---
"@thebes/cadmea-plugin-printful": minor
---

Migrate Printful order creation + confirmation to API v2 (#94).

`createPrintfulProvider` now posts orders to `POST /v2/orders` (using the v2
`items` shape) and confirms via `POST /v2/orders/{id}/confirm`, replacing the
legacy v1 `/orders` + `/orders/{id}/confirmation` endpoints. Printful has been
winding down v1, and the fulfillment order path — the most critical piece — was
the last part still on it.

Webhook parsing + signature verification are intentionally left on the v1
webhook format for now: v2's new webhook system uses different event payloads
and request signing whose exact header/algorithm isn't published in the rendered
v2 docs, so reconciling it safely needs a live v2 webhook sample. This is inert
until v2 webhooks are explicitly registered (see the note in provider.ts).
