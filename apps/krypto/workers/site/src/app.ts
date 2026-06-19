import { Hono } from 'hono'
import { handle } from '@astrojs/cloudflare/handler'

const app = new Hono<{ Bindings: Env }>()

// 1. Custom API routes — checked first
app.get('/api/ping', async (c) => {
    const result = await c.env.DB.prepare('SELECT 1 as ok').first()
    await c.env.KV.put('ping', 'pong')
    const kv = await c.env.KV.get('ping')
    return c.json({ db: result, kv, worker: 'site' })
})

// 2. Astro SSR — fallback for everything else
app.all('*', async (c) => {
    // @ts-expect-error — Hono's bundled ExecutionContext type lacks the
    // `exports`/`props` fields that wrangler-generated types now require.
    // Upstream bug, no runtime effect: https://github.com/honojs/hono/issues/4493
    return handle(c.req.raw, c.env, c.executionCtx)
})

export default app