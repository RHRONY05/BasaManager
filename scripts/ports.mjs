#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const BASE_PORTS = {
  API_PORT: 4000,
  WEB_PORT: 5173,
  E2E_API_PORT: 4100,
  E2E_WEB_PORT: 4173,
  TEST_DB_NAME: 'basamanager_test',
};

export function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function sanitizeTaskId(taskId) {
  return taskId.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

export function resolveTaskId(taskId) {
  if (taskId && typeof taskId === 'string' && taskId.trim()) {
    return taskId.trim();
  }
  if (process.env.BM_TASK && process.env.BM_TASK.trim()) {
    return process.env.BM_TASK.trim();
  }

  // Check worktree directory name (e.g. V5-api)
  const dirName = path.basename(process.cwd());
  if (/^V\d+-[a-zA-Z0-9_-]+$/i.test(dirName)) {
    // V1-tooling is the tooling setup task; when run without BM_TASK,
    // the acceptance criteria explicitly tests that base ports are printed.
    if (!/tooling/i.test(dirName)) {
      return dirName;
    }
  }

  return undefined;
}

export function ports(taskId) {
  const resolved = resolveTaskId(taskId);
  if (!resolved) {
    return { ...BASE_PORTS };
  }

  const offset = 10 * (1 + (hash(resolved) % 40));
  const sanitized = sanitizeTaskId(resolved);

  return {
    API_PORT: BASE_PORTS.API_PORT + offset,
    WEB_PORT: BASE_PORTS.WEB_PORT + offset,
    E2E_API_PORT: BASE_PORTS.E2E_API_PORT + offset,
    E2E_WEB_PORT: BASE_PORTS.E2E_WEB_PORT + offset,
    TEST_DB_NAME: `basamanager_test_${sanitized}`,
  };
}

// CLI execution: prints KEY=value lines
const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedFile === currentFile) {
  const result = ports(process.argv[2]);
  for (const [key, value] of Object.entries(result)) {
    console.log(`${key}=${value}`);
  }
}
