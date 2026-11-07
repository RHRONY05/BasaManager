import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// Prisma CLI config (generate, migrate). Prisma 7 no longer loads .env files itself, so load the repo's
// root .env when the variable isn't already set (CI and the VPS pass it in the environment).
// This is tooling, not the app: the app reads env only through src/config/env.ts.
const rootEnv = new URL('../../.env', import.meta.url);
if (!process.env['DATABASE_OWNER_URL'] && existsSync(rootEnv)) {
  process.loadEnvFile(rootEnv);
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // Migrations run as the table owner (bm_owner). `prisma generate` doesn't need a URL, so it may be unset.
  datasource: { url: process.env['DATABASE_OWNER_URL'] },
});
