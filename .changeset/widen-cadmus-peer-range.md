---
"@thebes/cadmea-access-helpers": patch
"@thebes/cadmea-ecommerce-ui": patch
"@thebes/cadmea-plugin-crm": patch
"@thebes/cadmea-plugin-ecommerce": patch
"@thebes/cadmea-plugin-ecommerce-square": patch
"@thebes/cadmea-plugin-ecommerce-stripe": patch
"@thebes/cadmea-plugin-printful": patch
"@thebes/cadmea-plugin-redirects": patch
"@thebes/cadmea-plugin-seo": patch
"@thebes/cadmus-cloudflare-images": patch
---

chore: widen the `@thebes/cadmus` peer range to `>=0.4.0 <1.0.0`

Rebuilt against `@thebes/cadmus@0.5.0`. The peer range previously resolved to a
`0.x` caret (`^0.4.x`), so any `cadmus` minor fell out of range and forced a
major bump across the whole extension ecosystem. Widening it to span the full
`0.x` line keeps these packages in range for future `cadmus` minors. Strict
widening of the accepted range — no functional or API changes.
