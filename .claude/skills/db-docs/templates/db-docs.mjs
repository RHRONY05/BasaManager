#!/usr/bin/env node
/**
 * db-docs.mjs — generate ER diagrams + per-table schema docs from the LIVE database with tbls.
 *
 * tbls runs inside Docker, so nothing has to be installed on the machine.
 * The connection string is read from TBLS_DSN, or from DATABASE_URL in the env files below,
 * and passed to the container as an env var (never written to the config or the repo).
 *
 * Usage:
 *   node scripts/db-docs.mjs          # regenerate docs (tbls doc)
 *   node scripts/db-docs.mjs diff     # fail if committed docs no longer match the database
 *   node scripts/db-docs.mjs lint     # check schema quality rules from .tbls.yml
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const TBLS_IMAGE = 'ghcr.io/k1low/tbls:v1.96.1';
// Passed explicitly: tbls does not auto-discover .tbls.yml inside the container.
const CONFIG_FILE = '.tbls.yml';
// Checked in order; the first file that defines DATABASE_URL wins.
const ENV_FILES = ['backend/.env', '.env'];
// Prisma-only query params that Postgres drivers reject.
const PRISMA_PARAMS = ['schema', 'connection_limit', 'pool_timeout', 'pgbouncer', 'socket_timeout'];

const COMMANDS = {
  doc: ['doc', '--rm-dist'], // --rm-dist drops pages of tables that no longer exist
  diff: ['diff'],
  lint: ['lint'],
};

function readEnvValue(file, key) {
  if (!existsSync(file)) return undefined;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(new RegExp(`^\\s*${key}\\s*=\\s*(.*)\\s*$`));
    if (match) return match[1].replace(/^(['"])(.*)\1$/, '$2');
  }
  return undefined;
}

function resolveDsn() {
  let raw = process.env.TBLS_DSN;
  for (const file of ENV_FILES) {
    if (raw) break;
    raw = readEnvValue(file, 'DATABASE_URL');
  }
  if (!raw) {
    throw new Error(`No database URL found. Set TBLS_DSN or DATABASE_URL in one of: ${ENV_FILES.join(', ')}`);
  }

  const url = new URL(raw);
  // tbls runs in a container, where "localhost" is the container itself.
  if (['localhost', '127.0.0.1'].includes(url.hostname)) url.hostname = 'host.docker.internal';
  PRISMA_PARAMS.forEach((param) => url.searchParams.delete(param));
  if (!url.searchParams.has('sslmode') && url.hostname === 'host.docker.internal') {
    url.searchParams.set('sslmode', 'disable');
  }
  return url.toString();
}

const [command = 'doc', ...extraArgs] = process.argv.slice(2);
if (!COMMANDS[command]) {
  console.error(`Unknown command "${command}". Use one of: ${Object.keys(COMMANDS).join(', ')}`);
  process.exit(1);
}
if (!existsSync(CONFIG_FILE)) {
  console.error(`db-docs: ${CONFIG_FILE} not found. Run this from the project root.`);
  process.exit(1);
}

let dsn;
try {
  dsn = resolveDsn();
} catch (err) {
  console.error(`db-docs: ${err.message}`);
  process.exit(1);
}

const dockerArgs = [
  'run', '--rm',
  '-v', `${path.resolve('.')}:/work`, '-w', '/work',
  '-e', 'TBLS_DSN', // value comes from the env below, so the password never shows in the process list
  '--add-host', 'host.docker.internal:host-gateway', // Linux; Docker Desktop already provides it
  ...(process.getuid ? ['--user', `${process.getuid()}:${process.getgid()}`] : []),
  TBLS_IMAGE,
  ...COMMANDS[command],
  '-c', CONFIG_FILE,
  ...extraArgs,
];

const result = spawnSync('docker', dockerArgs, {
  stdio: 'inherit',
  env: { ...process.env, TBLS_DSN: dsn },
});

if (result.error) {
  console.error(`db-docs: could not start Docker (${result.error.message}). Is Docker Desktop running?`);
  process.exit(1);
}
if (result.status !== 0 && command === 'doc') {
  console.error('db-docs: tbls failed. Is the database container running and migrated?');
}
process.exit(result.status ?? 1);
