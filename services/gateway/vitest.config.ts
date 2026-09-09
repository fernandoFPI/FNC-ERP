import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    conditions: ['node', 'require', 'default'],
  },
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 15_000,
    hookTimeout: 15_000,
    include: ['tests/**/*.test.ts'],
    // po-stock-locking.test.ts hits the real DB (unlike mobile-sync.test.ts,
    // which mocks @fnc-erp/db entirely) — same reasoning as every other
    // service with 2+ test files (see services/inventory/vitest.config.ts):
    // without this, two files' real-DB work can interleave and race.
    fileParallelism: false,
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
  },
})
