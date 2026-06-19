import { defineConfig } from 'drizzle-kit'

export default defineConfig({
	schema: './apps/citadel/core/db/schema.ts',
	out: './apps/citadel/core/db/migrations',
	dialect: 'sqlite',
	driver: 'd1-http',
})
