#!/usr/bin/env node
/**
 * db-docs.mjs — ER diagram + per-table docs from a LIVE database with tbls (skill `db-docs`).
 * tbls runs in Docker (nothing to install) and only reads the database.
 *
 *   node scripts/db-docs.mjs          # regenerate docs/database (tbls doc --rm-dist)
 *   node scripts/db-docs.mjs diff     # exit 1 if docs/database no longer matches the migrations
 *   node scripts/db-docs.mjs lint     # schema quality rules from .tbls.yml
 *
 * Which database:
 *   - TBLS_DSN set → document that database as is.
 *   - otherwise (default) → a scratch database built from the migrations on the TEST Postgres
 *     (`DATABASE_OWNER_URL` from the environment, `.env.test`, or `.env.test.example`): create
 *     `basamanager_docs_<stamp>`, `prisma migrate deploy`, read it as `bm_readonly`, drop it. So the docs
 *     always describe exactly the committed migrations, never leftover dev data.
 * The DSN goes to the container as an env var, never into the config, a file or the process list.
 */
import { spawnSync, execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const TBLS_IMAGE = 'ghcr.io/k1low/tbls:v1.96.1';
const CONFIG_FILE = '.tbls.yml';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV_FILES = ['.env.test', '.env.test.example'];
// Dev/test-only password of bm_readonly (infra/postgres/init/01-roles.sql); used only for local hosts.
const LOCAL_READONLY_PASSWORD = 'bm_readonly_dev';

const COMMANDS = { doc: ['doc', '--rm-dist'], diff: ['diff'], lint: ['lint'] };

function readEnvValue(file, key) {
  const full = path.join(ROOT, file);
  if (!existsSync(full)) return undefined;
  for (const line of readFileSync(full, 'utf8').split(/\r?\n/)) {
    const match = line.match(new RegExp(`^\\s*${key}\\s*=\\s*(.*)\\s*$`));
    if (match && match[1]) return match[1].replace(/^(['"])(.*)\1$/, '$2');
  }
  return undefined;
}

function forDocker(raw) {
  const url = new URL(raw);
  if (['localhost', '127.0.0.1'].includes(url.hostname)) url.hostname = 'host.docker.internal';
  if (!url.searchParams.has('sslmode') && url.hostname === 'host.docker.internal') {
    url.searchParams.set('sslmode', 'disable');
  }
  return url.toString();
}

function runTbls(command, dsn, extraArgs) {
  const result = spawnSync(
    'docker',
    [
      'run', '--rm',
      '-v', `${ROOT}:/work`, '-w', '/work',
      '-e', 'TBLS_DSN',
      '--add-host', 'host.docker.internal:host-gateway',
      ...(process.getuid ? ['--user', `${process.getuid()}:${process.getgid()}`] : []),
      TBLS_IMAGE,
      ...COMMANDS[command],
      '-c', CONFIG_FILE,
      ...extraArgs,
    ], // prettier-ignore
    { stdio: 'inherit', env: { ...process.env, TBLS_DSN: forDocker(dsn) } },
  );
  if (result.error) {
    console.error(`db-docs: could not start Docker (${result.error.message}). Is Docker running?`);
    return 1;
  }
  return result.status ?? 1;
}

async function withScratchDb(ownerUrl, fn) {
  const require = createRequire(path.join(ROOT, 'apps/api/package.json'));
  const pg = require('pg');
  const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
  const name = `basamanager_docs_${stamp}_${randomBytes(3).toString('hex')}`;
  const admin = async (sql) => {
    const c = new pg.Client({ connectionString: ownerUrl });
    await c.connect();
    try {
      await c.query(sql);
    } finally {
      await c.end();
    }
  };
  const at = (raw, user, password) => {
    const u = new URL(raw);
    u.pathname = `/${name}`;
    if (user) {
      u.username = user;
      u.password = password;
    }
    return u.toString();
  };
  await admin(`create database "${name}"`);
  try {
    execSync('corepack pnpm --filter @bm/api exec prisma migrate deploy', {
      cwd: ROOT,
      stdio: ['ignore', 'ignore', 'inherit'],
      env: { ...process.env, DATABASE_OWNER_URL: at(ownerUrl) },
    });
    const host = new URL(ownerUrl).hostname;
    const local = ['localhost', '127.0.0.1', 'host.docker.internal'].includes(host);
    const readUrl = local ? at(ownerUrl, 'bm_readonly', LOCAL_READONLY_PASSWORD) : at(ownerUrl);
    return await fn(readUrl);
  } finally {
    await admin(`drop database if exists "${name}" with (force)`);
  }
}

const [command = 'doc', ...extraArgs] = process.argv.slice(2);
if (!COMMANDS[command]) {
  console.error(`Unknown command "${command}". Use one of: ${Object.keys(COMMANDS).join(', ')}`);
  process.exit(1);
}
if (!existsSync(path.join(ROOT, CONFIG_FILE))) {
  console.error(`db-docs: ${CONFIG_FILE} not found at the repo root.`);
  process.exit(1);
}

let status;
if (process.env.TBLS_DSN) {
  status = runTbls(command, process.env.TBLS_DSN, extraArgs);
} else {
  let ownerUrl = process.env.DATABASE_OWNER_URL;
  for (const f of ENV_FILES) ownerUrl ??= readEnvValue(f, 'DATABASE_OWNER_URL');
  if (!ownerUrl) {
    console.error('db-docs: set TBLS_DSN, or DATABASE_OWNER_URL of the test Postgres (.env.test).');
    process.exit(1);
  }
  try {
    status = await withScratchDb(ownerUrl, (dsn) => runTbls(command, dsn, extraArgs));
  } catch (err) {
    console.error(`db-docs: ${err.message} (is the test Postgres up? docker compose -f infra/compose.test.yml up -d)`);
    process.exit(1);
  }
}
if (status !== 0 && command === 'doc') console.error('db-docs: tbls failed.');
process.exit(status);
