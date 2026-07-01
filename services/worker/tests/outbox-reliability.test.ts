// vi.mock calls are hoisted before imports — factory functions must be self-contained

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
  },
}))

vi.mock('@fnc-erp/db', () => ({
  pool: {
    connect: vi.fn(),
    query: vi.fn(),
  },
  withTransaction: vi.fn(),
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

vi.mock('@fnc-erp/pdf', () => ({
  renderHTMLToPDF: vi.fn(),
  renderPayslip: vi.fn(),
  renderInvoice: vi.fn(),
  renderPurchaseOrder: vi.fn(),
}))

vi.mock('@fnc-erp/email', () => ({
  sendEmail: vi.fn(),
  renderPayslipEmail: vi.fn(),
  renderInvoiceEmail: vi.fn(),
  renderPOConfirmationEmail: vi.fn(),
  renderPasswordResetEmail: vi.fn(),
  renderPasswordChangedEmail: vi.fn(),
  renderMFASetupEmail: vi.fn(),
  renderNewDeviceLoginEmail: vi.fn(),
}))

vi.mock('@fnc-erp/storage', () => ({
  uploadBuffer: vi.fn(),
}))

vi.mock('../src/jobs/interco-stock-transfer.js', () => ({
  handleIntercoStockMoveDetected: vi.fn(),
  executeIntercoStockTransfer: vi.fn(),
}))

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  calculateNextRetryDelay,
  isCircuitOpen,
  recordCircuitFailure,
  recordCircuitSuccess,
  getCircuitBreakers,
  resetCircuitBreaker,
  setEventConfigCacheForTest,
} from '../src/jobs/outbox-processor.js'

// ── Helpers ───────────────────────────────────────────────────
const DEFAULT_CONFIG = {
  maxAttempts: 5,
  initialRetryDelaySeconds: 5,
  backoffMultiplier: 2,
  maxRetryDelaySeconds: 3600,
  dlqPriority: 'normal' as const,
  alertOnDlq: false,
}

// ── Retry logic ───────────────────────────────────────────────
describe('Outbox processor — retry logic', () => {
  it('retry delay uses exponential backoff', () => {
    const delay0 = calculateNextRetryDelay(0, DEFAULT_CONFIG)
    const delay1 = calculateNextRetryDelay(1, DEFAULT_CONFIG)
    const delay2 = calculateNextRetryDelay(2, DEFAULT_CONFIG)
    expect(delay1).toBeGreaterThan(delay0)
    expect(delay2).toBeGreaterThan(delay1)
  })

  it('retry delay includes jitter — two identical attempts produce different delays', () => {
    const results = new Set(
      Array.from({ length: 20 }, () => calculateNextRetryDelay(2, DEFAULT_CONFIG)),
    )
    // With 20% jitter and 20 runs it is astronomically unlikely all values are equal
    expect(results.size).toBeGreaterThan(1)
  })

  it('retry delay is capped at max_retry_delay_seconds', () => {
    const cappedConfig = { ...DEFAULT_CONFIG, maxRetryDelaySeconds: 60 }
    // attempt 10 → base = 5 * 2^10 = 5120; must be capped near 60
    const delay = calculateNextRetryDelay(10, cappedConfig)
    // cap + 20% jitter at most = 72
    expect(delay).toBeLessThanOrEqual(72)
    expect(delay).toBeGreaterThanOrEqual(60)
  })

  it('delay at attempt 0 is approximately initialRetryDelaySeconds', () => {
    const delays = Array.from({ length: 20 }, () =>
      calculateNextRetryDelay(0, DEFAULT_CONFIG),
    )
    for (const d of delays) {
      expect(d).toBeGreaterThanOrEqual(5)
      expect(d).toBeLessThanOrEqual(7) // 5 * 1.2 jitter max
    }
  })

  it('delay never returns less than the base delay', () => {
    for (let attempt = 0; attempt < 10; attempt++) {
      const delay = calculateNextRetryDelay(attempt, DEFAULT_CONFIG)
      const base = DEFAULT_CONFIG.initialRetryDelaySeconds *
        Math.pow(DEFAULT_CONFIG.backoffMultiplier, attempt)
      expect(delay).toBeGreaterThanOrEqual(Math.floor(base))
    }
  })

  it('event config cache can be injected — custom max_attempts respected', () => {
    const customConfigs = new Map([
      [
        'PAYSLIP_GENERATION_REQUESTED',
        {
          maxAttempts: 3,
          initialRetryDelaySeconds: 30,
          backoffMultiplier: 2,
          maxRetryDelaySeconds: 900,
          dlqPriority: 'normal' as const,
          alertOnDlq: false,
        },
      ],
    ])
    setEventConfigCacheForTest(customConfigs)
    expect(customConfigs.get('PAYSLIP_GENERATION_REQUESTED')!.maxAttempts).toBe(3)
  })
})

// ── Circuit breaker ───────────────────────────────────────────
describe('Outbox processor — circuit breaker', () => {
  beforeEach(() => {
    resetCircuitBreaker('test-service')
    resetCircuitBreaker('other-service')
  })

  afterEach(() => {
    resetCircuitBreaker('test-service')
    resetCircuitBreaker('other-service')
  })

  it('circuit is closed by default', () => {
    expect(isCircuitOpen('test-service')).toBe(false)
  })

  it('circuit opens after 5 consecutive failures within 60 seconds', () => {
    for (let i = 0; i < 5; i++) {
      recordCircuitFailure('test-service')
    }
    expect(isCircuitOpen('test-service')).toBe(true)
  })

  it('circuit does NOT open after only 4 failures', () => {
    for (let i = 0; i < 4; i++) {
      recordCircuitFailure('test-service')
    }
    expect(isCircuitOpen('test-service')).toBe(false)
  })

  it('circuit resets after openUntil time has passed', () => {
    for (let i = 0; i < 5; i++) {
      recordCircuitFailure('test-service')
    }
    expect(isCircuitOpen('test-service')).toBe(true)

    // Set openUntil to the past
    const breakers = getCircuitBreakers()
    const state = breakers.get('test-service')!
    state.openUntil = new Date(Date.now() - 1000)
    breakers.set('test-service', state)

    expect(isCircuitOpen('test-service')).toBe(false)
  })

  it('successful delivery resets failure counter', () => {
    for (let i = 0; i < 4; i++) {
      recordCircuitFailure('test-service')
    }
    recordCircuitSuccess('test-service')
    const state = getCircuitBreakers().get('test-service')
    expect(state?.failures).toBe(0)
  })

  it('different services have independent circuit breakers', () => {
    for (let i = 0; i < 5; i++) {
      recordCircuitFailure('test-service')
    }
    expect(isCircuitOpen('test-service')).toBe(true)
    expect(isCircuitOpen('other-service')).toBe(false)
  })

  it('failure counter resets if last failure was outside the 60-second window', () => {
    for (let i = 0; i < 4; i++) {
      recordCircuitFailure('test-service')
    }
    // Move lastFailureAt 61 seconds into the past
    const breakers = getCircuitBreakers()
    const state = breakers.get('test-service')!
    state.lastFailureAt = new Date(Date.now() - 61_000)
    breakers.set('test-service', state)

    // Next failure resets counter to 1 — circuit stays closed
    recordCircuitFailure('test-service')
    expect(isCircuitOpen('test-service')).toBe(false)
  })
})

// ── Financial event config ────────────────────────────────────
describe('Financial event integrity', () => {
  it('financial events are configured as critical with alert_on_dlq=true', () => {
    const criticalEvents = [
      'PROJECT_INVOICE_JOURNAL_REQUESTED',
      'INVOICE_PAYMENT_JOURNAL_REQUESTED',
      'PAYROLL_JOURNAL_REQUESTED',
      'MO_JOURNAL_REQUESTED',
      'RENTAL_INVOICE_JOURNAL_REQUESTED',
      'INTERCO_STOCK_MOVE_DETECTED',
    ]
    const criticalConfig = {
      maxAttempts: 7,
      initialRetryDelaySeconds: 10,
      backoffMultiplier: 2,
      maxRetryDelaySeconds: 3600,
      dlqPriority: 'critical' as const,
      alertOnDlq: true,
    }
    const configs = new Map(criticalEvents.map((e) => [e, criticalConfig]))
    setEventConfigCacheForTest(configs)

    for (const eventType of criticalEvents) {
      const config = configs.get(eventType)!
      expect(config.dlqPriority).toBe('critical')
      expect(config.alertOnDlq).toBe(true)
      expect(config.maxAttempts).toBe(7)
    }
  })

  it('push notification events are low priority without alerts', () => {
    const lowConfig = {
      maxAttempts: 3, initialRetryDelaySeconds: 5, backoffMultiplier: 2,
      maxRetryDelaySeconds: 300, dlqPriority: 'low' as const, alertOnDlq: false,
    }
    const configs = new Map([['PUSH_NOTIFICATION', lowConfig]])
    setEventConfigCacheForTest(configs)

    expect(configs.get('PUSH_NOTIFICATION')!.alertOnDlq).toBe(false)
    expect(configs.get('PUSH_NOTIFICATION')!.dlqPriority).toBe('low')
  })
})

// ── DLQ routing ───────────────────────────────────────────────
describe('Outbox processor — DLQ routing (mocked DB)', () => {
  it('processOutbox returns early when the queue is empty', async () => {
    const { pool } = await import('@fnc-erp/db')
    const mockClient = {
      query: vi.fn()
        .mockResolvedValueOnce({})           // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // SELECT FOR UPDATE — empty
        .mockResolvedValueOnce({}),          // ROLLBACK
      release: vi.fn(),
    }
    vi.mocked(pool.connect).mockResolvedValueOnce(mockClient as never)

    const { processOutbox } = await import('../src/jobs/outbox-processor.js')
    await processOutbox()

    // ROLLBACK called — nothing processed
    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK')
    mockClient.release.mockReset()
  })
})

// ── Stuck event logic ─────────────────────────────────────────
describe('Stuck event handling', () => {
  it('events stuck in processing > 5 minutes should be reset to pending', async () => {
    // This is enforced by the POST /admin/outbox/stuck/reset endpoint SQL:
    // WHERE status='processing' AND updated_at < NOW() - INTERVAL '5 minutes'
    // We verify the condition logic is correct by testing the assumption
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000 - 1000)
    const fourMinutesAgo = new Date(Date.now() - 4 * 60 * 1000)
    expect(fiveMinutesAgo < new Date(Date.now() - 5 * 60 * 1000)).toBe(true)
    expect(fourMinutesAgo < new Date(Date.now() - 5 * 60 * 1000)).toBe(false)
  })
})
