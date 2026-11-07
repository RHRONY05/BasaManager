import path from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * Global setup for integration tests.
 * 1. Loads `.env.test` from the repository root if it exists.
 * 2. Rebuilds the test database from zero with the real migrations, as the owner role
 *    (`prisma migrate reset --force`, 09-TESTING.md). Tests then connect as `bm_app`.
 */
export default function setup(): void {
  const envTestPath = path.resolve(process.cwd(), '.env.test');
  if (fs.existsSync(envTestPath)) {
    process.loadEnvFile(envTestPath);
  } else {
    // Fallback: check one directory up if run from apps/api
    const parentEnvTestPath = path.resolve(process.cwd(), '../../.env.test');
    if (fs.existsSync(parentEnvTestPath)) {
      process.loadEnvFile(parentEnvTestPath);
    }
  }

  const ownerUrl = process.env['DATABASE_OWNER_URL'];
  if (!ownerUrl) {
    throw new Error('DATABASE_OWNER_URL is not set (copy .env.test.example to .env.test)');
  }
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  execSync('corepack pnpm --filter @bm/api exec prisma migrate reset --force', {
    cwd: repoRoot,
    stdio: 'inherit',
    env: { ...process.env, DATABASE_OWNER_URL: ownerUrl },
  });
}
