// @ts-check
import { defineConfig } from 'astro/config'
import cloudflare from '@astrojs/cloudflare'
import starlight from '@astrojs/starlight'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  adapter: cloudflare(),
  output: 'server',
  integrations: [
    starlight({
      title: 'Thebes Docs',
      // The site already has its own src/pages/404.astro — without this,
      // Starlight's own injected 404 route collides with it.
      disable404Route: true,
      description:
        'Documentation for @thebes/cadmus, @thebes/cadmea, and every first-party extension.',
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/bowenlabs/project-thebes',
        },
      ],
      // Content lives under src/content/docs/docs/** (not src/content/docs/**
      // directly) so generated routes land at /docs/** instead of claiming
      // the site root — see Starlight's "Using Starlight at a Subpath" guide.
      // The existing literal pages (index.astro, about.astro, etc.) keep
      // routing priority over Starlight's catch-all for any path they
      // already own.
      sidebar: [
        {
          label: 'Framework',
          items: [{ label: 'Cadmus', link: '/docs/cadmus/' }],
        },
        { label: 'CMS', items: [{ label: 'Cadmea', link: '/docs/cadmea/' }] },
        {
          label: 'Extensions',
          items: [{ autogenerate: { directory: 'docs/extensions' } }],
        },
      ],
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
})