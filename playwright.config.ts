import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

if (existsSync('.env.test') && typeof process.loadEnvFile === 'function') {
  process.loadEnvFile('.env.test');
}

export default defineConfig({
  testDir: 'tests/e2e',
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'mobile',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 3,
      },
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter @bm/api start',
      url: 'http://localhost:4100/api/ready',
      reuseExistingServer: !process.env.CI,
      env: {
        PORT: process.env.E2E_API_PORT || '4100',
      },
    },
    {
      command: 'pnpm --filter @bm/web build --mode test && pnpm --filter @bm/web preview',
      url: 'http://localhost:4173',
      reuseExistingServer: !process.env.CI,
      env: {
        API_PROXY_TARGET: 'http://localhost:4100',
        E2E_WEB_PORT: '4173',
      },
    },
  ],
});
