import { activateDueLeasesJob } from './activateDueLeases.js';
import { generateBillsJob } from './generateBills.js';
import { applyLateFeesJob } from './applyLateFees.js';
import { renderReceiptsJob } from './renderReceipts.js';
import type { Db } from '@bm/api/config/db';
import type { RedisClient } from '@bm/api/config/redis';
import type { Env } from '@bm/api/config/env';
import type { Logger } from 'pino';

export interface JobContext {
  prisma: Db;
  redis: RedisClient;
  logger: Logger;
  env?: Pick<Env, 'APP_ENV'> & Partial<Pick<Env, 'STORAGE_DRIVER'>>;
  now?: () => Date;
}

export interface Job {
  name: string;
  schedule: string;
  ttlMs: number;
  run: (ctx: JobContext) => Promise<void>;
}

export { activateDueLeasesJob } from './activateDueLeases.js';
export { generateBillsJob } from './generateBills.js';
export { applyLateFeesJob } from './applyLateFees.js';
export { renderReceiptsJob } from './renderReceipts.js';

/**
 * Registry of background worker jobs.
 */
export const jobs: Job[] = [activateDueLeasesJob, generateBillsJob, applyLateFeesJob, renderReceiptsJob];
