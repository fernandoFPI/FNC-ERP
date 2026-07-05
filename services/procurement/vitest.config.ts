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
    include: ['tests/**/*.test.ts', 'tests/**/*.perf.ts'],
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
  },
})

