import path from 'node:path';
import fs from 'node:fs';

/**
 * Global setup for integration tests.
 * Loads `.env.test` from the repository root if it exists.
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
}
