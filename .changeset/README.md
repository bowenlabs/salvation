# Changesets

This folder is managed by [Changesets](https://github.com/changesets/changesets).
It is how the publishable Cadmus/Cadmea packages are versioned and released from
this monorepo.

Publishable packages:

- `@thebes/cadmus`
- `@thebes/cadmea`
- `@thebes/cadmea-design-system`
- `@thebes/cadmea-plugin-seo`
- `@thebes/cadmus-cloudflare-images`

The `site` and `cadmea` Workers (under `app/workers/`) are `private` and never
published — they are the reference app, ignored in `config.json`.

## Workflow

```bash
pnpm changeset          # describe a change + pick semver bumps
pnpm version-packages   # apply pending changesets, bump versions, write CHANGELOGs
pnpm release            # build packages, then publish to npm
```

See [the Changesets docs](https://github.com/changesets/changesets/blob/main/docs/intro-to-using-changesets.md)
for details.
