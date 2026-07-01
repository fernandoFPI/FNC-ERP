vi.mock('@fnc-erp/config', () => ({
  env: {
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    REDIS_URL: 'redis://localhost:6379',
    JWT_SECRET: 'test-secret-32-chars-minimum-pad!',
    JWT_REFRESH_SECRET: 'test-refresh-secret-32-chars-pad!',
    JWT_ACCESS_EXPIRES_IN: '15m',
    JWT_REFRESH_EXPIRES_IN: '7d',
    ENCRYPTION_KEY: '0'.repeat(64),
    SERVICE_TOKEN: 'service-token-change-in-prod-min32chars-padding',
    INVENTORY_SERVICE_URL: 'http://localhost:3005',
    PDF_STORAGE_FOLDER: 'generated-pdfs',
    EMAIL_FROM_NAME: 'FNC ERP',
    EMAIL_FROM_ADDRESS: 'noreply@test.com',
    LOG_LEVEL: 'error',
    SERVICE_NAME: 'worker-test',
    PUPPETEER_EXECUTABLE_PATH: undefined,
    EXCHANGE_RATE_API_KEY: 'test-api-key',
    OPEN_EXCHANGE_RATES_APP_ID: 'test-app-id',
  },
}))

vi.mock('@fnc-erp/db', () => ({
  pool: { connect: vi.fn(), query: vi.fn() },
  withTransaction: vi.fn(),
  query: vi.fn(),
}))

vi.mock('@fnc-erp/logger', () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}))

vi.mock('@fnc-erp/fx', () => ({
  fetchFromExchangeRateAPI: vi.fn(),
  fetchFromOpenExchangeRates: vi.fn(),
  validateRate: vi.fn(() => ({ valid: true })),
}))

vi.mock('@fnc-erp/fx/staleness', () => ({
  checkRateStaleness: vi.fn(),
}))

// Prevent cron registration during test
vi.mock('node-cron', () => ({
  default: { schedule: vi.fn() },
  schedule: vi.fn(),
}))

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchFromExchangeRateAPI, fetchFromOpenExchangeRates, validateRate } from '@fnc-erp/fx'
import { pool, withTransaction } from '@fnc-erp/db'

describe('syncFXRates function', () => {
  beforeEach(() => {
    vi.mocked(pool.query).mockReset()
    vi.mocked(withTransaction).mockReset()
    vi.mocked(fetchFromExchangeRateAPI).mockReset()
    vi.mocked(fetchFromOpenExchangeRates).mockReset()
    vi.mocked(validateRate).mockReturnValue({ valid: true })
  })

  it('returns failed status when both sources fail', async () => {
    vi.mocked(fetchFromExchangeRateAPI).mockRejectedValueOnce(new Error('network error'))
    vi.mocked(fetchFromOpenExchangeRates).mockRejectedValueOnce(new Error('also down'))

    // Mock sync log INSERT
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ id: 'sync-log-id' }] } as never)
    // Mock sync log UPDATE
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never)
    // notifyAdmins query
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never)

    const { syncFXRates } = await import('../src/jobs/fx-sync.js')
    const result = await syncFXRates('scheduled')

    expect(result.status).toBe('failed')
    expect(result.ratesUpdated).toBe(0)
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('falls back to secondary source when primary fails', async () => {
    vi.mocked(fetchFromExchangeRateAPI).mockRejectedValueOnce(new Error('primary down'))
    vi.mocked(fetchFromOpenExchangeRates).mockResolvedValueOnce([
      {
        fromCurrency: 'USD', toCurrency: 'IQD',
        rate: 1310, rateDate: new Date(), source: 'open_exchange_rates',
      },
    ])

    // Sync log INSERT
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ id: 'sync-log-id' }] } as never)
    // withTransaction for rate upsert
    vi.mocked(withTransaction).mockImplementationOnce(async (_ctx, fn) => {
      const client = {
        query: vi.fn()
          .mockResolvedValueOnce({ rows: [] })                    // prev rate query
          .mockResolvedValueOnce({ rows: [{ id: 'rate-id' }] })  // upsert RETURNING
          .mockResolvedValueOnce({ rows: [] }),                   // fx_rate_changes insert
      }
      await fn(client as never)
    })
    // Sync log UPDATE
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never)

    const { syncFXRates } = await import('../src/jobs/fx-sync.js')
    const result = await syncFXRates('scheduled')

    expect(vi.mocked(fetchFromOpenExchangeRates)).toHaveBeenCalled()
    // partial: primary failed (1 error) but fallback succeeded — fetchedRates > 0 with errors
    expect(result.status).toBe('partial')
    expect(result.ratesUpdated).toBe(1)
  })

  it('skips duplicate rates for same date', async () => {
    vi.mocked(fetchFromExchangeRateAPI).mockResolvedValueOnce([
      { fromCurrency: 'USD', toCurrency: 'IQD', rate: 1310, rateDate: new Date(), source: 'exchangerate_api' },
    ])

    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ id: 'sync-log-id' }] } as never)
    // withTransaction — upsert returns empty (already exists)
    vi.mocked(withTransaction).mockImplementationOnce(async (_ctx, fn) => {
      const client = {
        query: vi.fn()
          .mockResolvedValueOnce({ rows: [] })   // prev rate
          .mockResolvedValueOnce({ rows: [] }),   // upsert DO NOTHING
      }
      await fn(client as never)
    })
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never)

    const { syncFXRates } = await import('../src/jobs/fx-sync.js')
    const result = await syncFXRates('scheduled')

    expect(result.ratesUpdated).toBe(0)
    expect(result.status).toBe('success') // no errors even though 0 updated
  })

  it('skips rates that fail validation with status partial', async () => {
    vi.mocked(fetchFromExchangeRateAPI).mockResolvedValueOnce([
      { fromCurrency: 'USD', toCurrency: 'IQD', rate: 99999, rateDate: new Date(), source: 'exchangerate_api' },
    ])
    vi.mocked(validateRate).mockReturnValueOnce({ valid: false, reason: 'out of bounds' })

    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ id: 'sync-log-id' }] } as never)
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never) // UPDATE sync log

    const { syncFXRates } = await import('../src/jobs/fx-sync.js')
    const result = await syncFXRates('scheduled')

    expect(result.status).toBe('partial')
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors[0]).toContain('validation failed')
  })

  it('creates sync log entry with correct syncType and triggeredBy', async () => {
    vi.mocked(fetchFromExchangeRateAPI).mockResolvedValueOnce([])
    // Guard: fallback must return [] so fetchedRates stays iterable
    vi.mocked(fetchFromOpenExchangeRates).mockResolvedValueOnce([])

    const insertCall: unknown[] = []
    vi.mocked(pool.query).mockImplementation(async (sql: unknown, params: unknown) => {
      if (typeof sql === 'string' && sql.includes('INSERT INTO fx_rate_sync_log')) {
        insertCall.push(...(params as unknown[]))
        return { rows: [{ id: 'sync-log-id' }] } as never
      }
      return { rows: [] } as never
    })

    const { syncFXRates } = await import('../src/jobs/fx-sync.js')
    await syncFXRates('manual', 'user-123')

    expect(insertCall[0]).toBe('manual')
    expect(insertCall[1]).toBe('user-123')
  })

  it('queues FX_RATE_MOVEMENT_ALERT when change >= 5%', async () => {
    const newRate = 1380 // was 1310 → ~5.3% increase
    vi.mocked(fetchFromExchangeRateAPI).mockResolvedValueOnce([
      { fromCurrency: 'USD', toCurrency: 'IQD', rate: newRate, rateDate: new Date(), source: 'exchangerate_api' },
    ])

    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ id: 'sync-log-id' }] } as never)

    let alertQueued = false
    vi.mocked(withTransaction).mockImplementationOnce(async (_ctx, fn) => {
      const client = {
        query: vi.fn()
          .mockResolvedValueOnce({ rows: [{ rate: '1310' }] })    // prev rate (1310)
          .mockResolvedValueOnce({ rows: [{ id: 'rate-id' }] })   // upsert returns
          .mockResolvedValueOnce({ rows: [] })                     // fx_rate_changes
          .mockImplementationOnce((sql: string) => {              // movement alert outbox
            if (sql.includes('FX_RATE_MOVEMENT_ALERT')) alertQueued = true
            return Promise.resolve({ rows: [] })
          }),
      }
      await fn(client as never)
    })
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never)

    const { syncFXRates } = await import('../src/jobs/fx-sync.js')
    await syncFXRates('scheduled')

    expect(alertQueued).toBe(true)
  })
})

describe('Manual trigger via FX_SYNC_REQUESTED outbox event', () => {
  it('syncFXRates is exported and callable with manual syncType', async () => {
    const { syncFXRates } = await import('../src/jobs/fx-sync.js')
    expect(typeof syncFXRates).toBe('function')
  })
})
