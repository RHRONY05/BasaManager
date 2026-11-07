import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      {
        test: {
          name: 'packages/shared',
          environment: 'node',
          include: ['packages/shared/src/**/*.test.ts', 'src/**/*.test.ts'],
          passWithNoTests: true,
        },
      },
      {
        test: {
          name: 'packages/domain',
          environment: 'node',
          include: ['packages/domain/src/**/*.test.ts', 'src/**/*.test.ts'],
          passWithNoTests: true,
        },
      },
      {
        test: {
          name: 'apps/api',
          environment: 'node',
          include: ['apps/api/src/**/*.test.ts', 'src/**/*.test.ts'],
          exclude: ['apps/api/**/*.int.test.ts', '**/*.int.test.ts'],
          passWithNoTests: true,
        },
      },
      {
        test: {
          name: 'apps/worker',
          environment: 'node',
          include: ['apps/worker/src/**/*.test.ts', 'src/**/*.test.ts'],
          passWithNoTests: true,
        },
      },
      {
        test: {
          name: 'apps/web',
          environment: 'jsdom',
          setupFiles: ['apps/web/src/test/setup.ts'],
          include: ['apps/web/src/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
          passWithNoTests: true,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: [
        'packages/shared/src/**',
        'packages/domain/src/**',
        'apps/api/src/**',
        'apps/worker/src/**',
        'apps/web/src/**',
      ],
      // Process bootstraps are exercised by integration/e2e boots, not unit tests; generated Prisma code and the
      // domain stub (real code from V8) are not ours to cover. Decided 2026-11-08 (PROGRESS.md).
      exclude: ['**/generated/**', '**/*.test.*', 'apps/api/src/server.ts', 'apps/worker/src/index.ts', 'packages/domain/src/index.ts'],
      thresholds: {
        'packages/domain/src/**': {
          lines: 95,
          branches: 95,
        },
        'apps/api/src/**': {
          lines: 80,
        },
      },
    },
  },
});
