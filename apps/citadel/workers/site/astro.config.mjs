// @ts-check
import { defineConfig } from 'astro/config'
import cloudflare from '@astrojs/cloudflare'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  adapter: cloudflare(),
  output: 'server',
  vite: {
    plugins: [tailwindcss()],
  },
})