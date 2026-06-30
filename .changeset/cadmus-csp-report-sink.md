---
"@thebes/cadmus": minor
---

Add a CSP violation report sink to `createSecurityHeaders`. New `reportUri` (and
optional `reportTo` group, default `"csp"`) options append `report-uri` +
`report-to` directives to the policy and emit a `Reporting-Endpoints` response
header, so browsers POST violations to a same-origin collector. Adds
`createCspReportHandler()` — a Hono handler that parses reports (content-type
agnostic), forwards them to an `onReport` callback (defaults to `console.warn`
so they surface in Logpush / Sentry), and always answers `204`.
