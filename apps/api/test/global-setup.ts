import path from 'node:path';
import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';

/**
 * Global setup for integration tests (09-TESTING.md "Test data, users and isolation").
 * 1. Loads `.env.test` from the repository root if it exists.
 * 2. Creates a FRESH database for this run, `<base>_<timestamp>_<random>`, as the owner role. `<base>` is
 *    `TEST_DB_NAME` when set, else `scripts/ports.mjs` TEST_DB_NAME (per worktree task), else the database of
 *    `DATABASE_OWNER_URL`. The owner URL's own database is only used to run CREATE/DROP DATABASE.
 * 3. Applies the real migrations with `prisma migrate deploy` (non-destructive; never `migrate reset`, which
 *    Prisma refuses to run for AI agents without a human's consent) and points DATABASE_URL (bm_app),
 *    DATABASE_OWNER_URL (bm_owner) and DATABASE_WORKER_URL (bm_worker) at the new database. Vitest workers
 *    inherit this process's environment, and `process.loadEnvFile` in the helpers never overrides it.
 * 4. Teardown drops ONLY the database this run created.
 */
export default async function setup(): Promise<() => Promise<void>> {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  for (const candidate of [path.resolve(process.cwd(), '.env.test'), path.join(repoRoot, '.env.test')]) {
    if (fs.existsSync(candidate)) {
      process.loadEnvFile(candidate);
      break;
    }
  }

  const ownerUrl = need('DATABASE_OWNER_URL');
  const appUrl = need('DATABASE_URL');
  const workerUrl = need('DATABASE_WORKER_URL');

  const base = await baseName(repoRoot, ownerUrl);
  const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
  const dbName = `${base.slice(0, 40)}_${stamp}_${randomBytes(3).toString('hex')}`;
  if (!/^[a-z0-9_]+$/.test(dbName)) throw new Error(`unsafe test database name: ${dbName}`);

  await onMaintenanceDb(ownerUrl, (c) => c.query(`create database "${dbName}"`));

  const withDb = (url: string): string => {
    const u = new URL(url);
    u.pathname = `/${dbName}`;
    return u.toString();
  };
  process.env['DATABASE_OWNER_URL'] = withDb(ownerUrl);
  process.env['DATABASE_URL'] = withDb(appUrl);
  process.env['DATABASE_WORKER_URL'] = withDb(workerUrl);

  try {
    execSync('corepack pnpm --filter @bm/api exec prisma migrate deploy', {
      cwd: repoRoot,
      stdio: 'inherit',
      env: process.env,
    });
  } catch (e) {
    await dropDb(ownerUrl, dbName);
    throw e;
  }

  return async () => {
    await dropDb(ownerUrl, dbName);
  };
}

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set (copy .env.test.example to .env.test)`);
  return v;
}

async function baseName(repoRoot: string, ownerUrl: string): Promise<string> {
  const fromEnv = process.env['TEST_DB_NAME']?.trim();
  if (fromEnv) return fromEnv.toLowerCase();
  const portsFile = pathToFileURL(path.join(repoRoot, 'scripts', 'ports.mjs')).href;
  const mod = (await import(portsFile)) as {
    resolveTaskId: () => string | undefined;
    ports: () => { TEST_DB_NAME: string };
  };
  if (mod.resolveTaskId()) return mod.ports().TEST_DB_NAME;
  return decodeURIComponent(new URL(ownerUrl).pathname.slice(1)).toLowerCase() || 'basamanager_test';
}

async function onMaintenanceDb(ownerUrl: string, fn: (c: pg.Client) => Promise<unknown>): Promise<void> {
  const c = new pg.Client({ connectionString: ownerUrl });
  await c.connect();
  try {
    await fn(c);
  } finally {
    await c.end();
  }
}

async function dropDb(ownerUrl: string, dbName: string): Promise<void> {
  // WITH (FORCE) ends connections a test left open; the name is the one this run generated.
  await onMaintenanceDb(ownerUrl, (c) => c.query(`drop database if exists "${dbName}" with (force)`));
}
