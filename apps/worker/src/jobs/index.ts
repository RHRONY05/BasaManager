export interface Job {
  name: string;
  schedule: string;
  ttlMs: number;
  run: () => Promise<void>;
}

/**
 * Registry of background worker jobs. Empty in V1; scheduled jobs added in subsequent tasks.
 */
export const jobs: Job[] = [];
