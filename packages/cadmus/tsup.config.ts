import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    'index':            'src/index.ts',
    'auth/index':       'src/auth/index.ts',
    'db/index':         'src/db/index.ts',
    'storage/index':    'src/storage/index.ts',
    'cache/index':      'src/cache/index.ts',
    'email/index':      'src/email/index.ts',
    'rate-limit/index': 'src/rate-limit/index.ts',
    'session/index':    'src/session/index.ts',
    'queues/index':     'src/queues/index.ts',
    'hono/index':       'src/hono/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'es2022',
  // Cloudflare Workers target — no Node.js built-ins
  platform: 'browser',
  external: ['hono'],
})
