---
"@thebes/cadmus": patch
---

`deliverWebhookMessage` now rejects non-http(s) URLs and hostnames matching
common private/loopback/link-local patterns (including the cloud metadata
address) before calling `fetch()`, throwing `CadmusQueueError` instead.
Defense-in-depth, not the primary control — `global_fetch_strictly_public`
already blocks `fetch()` to private IP literals at the platform level, and
`WEBHOOK_URL` is operator config, not attacker input — but this also catches
hostnames that *resolve* to a private address and gives a clear error
instead of a platform-level network failure on a misconfigured deploy.
