import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'lcov'],
      reportsDirectory: './.coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['**/*.test.{ts,tsx}', '**/*.d.ts'],
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.test.{ts,tsx}'],
        },
      },
      {
        extends: true,
        test: {
          name: 'patches',
          include: ['tests/patches/**/*.test.ts'],
          // The first run downloads each Next.js tarball, later runs read the cache
          testTimeout: 120_000,
          hookTimeout: 300_000,
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          exclude: ['**/node_modules/**', 'tests/integration/fixtures/**'],
          globalSetup: ['tests/integration/setup.ts'],
          // Every file starts its own Next.js servers, and `next build` is slow
          testTimeout: 60_000,
          hookTimeout: 300_000,
          maxWorkers: process.env.CI ? 2 : 4,
          // Run after the fast projects, which can share workers
          sequence: { groupOrder: 1 },
        },
      },
    ],
  },
});
