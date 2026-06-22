import { defineConfig } from 'drizzle-kit'

// `pnpm db:studio` talks to remote D1 over Cloudflare's HTTP API (the
// d1-http driver can't introspect the local wrangler sqlite file), so it
// needs real Cloudflare credentials — never committed. Set these in a
// root .env (gitignored), see .env.example.
export default defineConfig({
	schema: [
		'./app/core/db/schema.ts',
		'./app/core/db/schema.generated.ts',
	],
	out: './app/core/db/migrations',
	dialect: 'sqlite',
	driver: 'd1-http',
	dbCredentials: {
		accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
		databaseId: process.env.CLOUDFLARE_DATABASE_ID!,
		token: process.env.CLOUDFLARE_D1_TOKEN!,
	},
})
