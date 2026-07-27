import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { conditions: ['node', 'require', 'default'] },
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 15_000,
    hookTimeout: 15_000,
    include: process.env.PERF_TESTS ? ['tests/**/*.perf.ts'] : ['tests/**/*.test.ts'],
    fileParallelism: false,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
})

