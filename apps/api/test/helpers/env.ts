import path from 'node:path';
import fs from 'node:fs';

// Workers may not inherit what globalSetup loaded; load .env.test defensively (same as ready.int.test.ts).
const envTestPath = path.resolve(process.cwd(), '.env.test');
if (fs.existsSync(envTestPath)) {
  try {
    process.loadEnvFile(envTestPath);
  } catch {
    // already loaded
  }
}

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set (copy .env.test.example to .env.test)`);
  return v;
}

export const appUrl = (): string => need('DATABASE_URL'); // bm_app
export const ownerUrl = (): string => need('DATABASE_OWNER_URL'); // bm_owner (fixtures, DDL)
export const workerUrl = (): string => need('DATABASE_WORKER_URL'); // bm_worker (BYPASSRLS)

/** bm_readonly shares host/db with DATABASE_URL; password from infra/postgres/init/01-roles.sql. */
export function readonlyUrl(): string {
  const u = new URL(appUrl());
  u.username = 'bm_readonly';
  u.password = 'bm_readonly_dev';
  return u.toString();
}
