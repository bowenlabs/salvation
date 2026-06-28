---
"@thebes/cadmea-plugin-printful": patch
---

fix: republish with `dist/` (1.1.2 shipped without built output)

`@thebes/cadmea-plugin-printful@1.1.2` was published without its `dist/`
directory because the package was missing from the release build chain
(`build:packages`), so its build never ran in CI and the tarball contained only
`package.json`, `README.md`, and `LICENSE`. The build pipeline now builds every
workspace package (`pnpm -r`), so this can't recur, and this release ships the
compiled output. Use 1.1.3+; 1.1.2 is broken.
