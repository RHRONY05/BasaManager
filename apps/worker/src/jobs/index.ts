import { activateDueLeasesJob } from './activateDueLeases.js';
import { generateBillsJob } from './generateBills.js';
import { applyLateFeesJob } from './applyLateFees.js';
import type { Db } from '@bm/api/config/db';
import type { RedisClient } from '@bm/api/config/redis';
import type { Logger } from 'pino';

export interface JobContext {
  prisma: Db;
  redis: RedisClient;
  logger: Logger;
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

/**
 * Registry of background worker jobs.
 */
export const jobs: Job[] = [activateDueLeasesJob, generateBillsJob, applyLateFeesJob];
