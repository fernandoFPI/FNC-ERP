import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    // Use require/default conditions so CJS modules like pg can require('pg-pool')
    // and get the CJS build (not the ESM .mjs which breaks class extension).
    conditions: ['node', 'require', 'default'],
  },
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 15_000,
    hookTimeout: 15_000,
    include: ['tests/**/*.test.ts', 'tests/**/*.perf.ts'],
    setupFiles: [],
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
})

