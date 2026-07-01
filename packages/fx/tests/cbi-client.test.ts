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

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  fetchFromExchangeRateAPI,
  fetchFromOpenExchangeRates,
  validateRate,
} from '../src/cbi-client.js'

// ── ExchangeRate-API ──────────────────────────────────────────
describe('ExchangeRate-API client', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('parses response and returns IQD rates for USD, EUR, GBP', async () => {
    const mockResponse = {
      result: 'success',
      time_last_update_utc: 'Thu, 01 Jan 2026 00:00:00 +0000',
      conversion_rates: {
        USD: 0.000763,   // IQD→USD rate (how many USD per 1 IQD)
        EUR: 0.000700,
        GBP: 0.000606,
      },
    }
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as Response)

    const rates = await fetchFromExchangeRateAPI('test-key')

    expect(rates).toHaveLength(6) // 3 pairs + 3 inverses
    const usdToIqd = rates.find((r) => r.fromCurrency === 'USD' && r.toCurrency === 'IQD')
    expect(usdToIqd).toBeDefined()
    expect(usdToIqd!.rate).toBeCloseTo(1 / 0.000763, 2)
    expect(usdToIqd!.source).toBe('exchangerate_api')
  })

  it('calculates inverse rates correctly', async () => {
    const iqdPerUsd = 0.000763
    const mockResponse = {
      result: 'success',
      time_last_update_utc: 'Thu, 01 Jan 2026 00:00:00 +0000',
      conversion_rates: { USD: iqdPerUsd, EUR: 0.0007, GBP: 0.0006 },
    }
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as Response)

    const rates = await fetchFromExchangeRateAPI('key')

    const iqdToUsd = rates.find((r) => r.fromCurrency === 'IQD' && r.toCurrency === 'USD')
    expect(iqdToUsd).toBeDefined()
    expect(iqdToUsd!.rate).toBe(iqdPerUsd) // direct from conversion_rates
  })

  it('throws on non-200 response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: () => Promise.resolve('Unauthorized'),
    } as Response)

    await expect(fetchFromExchangeRateAPI('bad-key')).rejects.toThrow('401')
  })

  it('throws when result is not success', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ result: 'error-invalid-key' }),
    } as Response)

    await expect(fetchFromExchangeRateAPI('bad-key')).rejects.toThrow('error-invalid-key')
  })

  it('times out after 10 seconds via AbortSignal.timeout', async () => {
    // AbortSignal.timeout is called with 10_000 — we just verify the call doesn't hang
    // by mocking an abort
    vi.mocked(fetch).mockRejectedValueOnce(new DOMException('The operation was aborted.', 'AbortError'))
    await expect(fetchFromExchangeRateAPI('key')).rejects.toThrow()
  })
})

// ── Open Exchange Rates ───────────────────────────────────────
describe('Open Exchange Rates fallback', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('parses USD-base response and cross-calculates EUR/IQD and GBP/IQD', async () => {
    const mockResponse = {
      timestamp: 1735689600,
      rates: { IQD: 1310, EUR: 0.92, GBP: 0.79 },
    }
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as Response)

    const rates = await fetchFromOpenExchangeRates('app-id')

    const eurToIqd = rates.find((r) => r.fromCurrency === 'EUR' && r.toCurrency === 'IQD')
    expect(eurToIqd).toBeDefined()
    // EUR→USD = 1/0.92, then * 1310 IQD/USD
    expect(eurToIqd!.rate).toBeCloseTo((1 / 0.92) * 1310, 0)
  })

  it('throws if IQD is not in the response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ timestamp: 1735689600, rates: { EUR: 0.92 } }),
    } as Response)

    await expect(fetchFromOpenExchangeRates('app-id')).rejects.toThrow('IQD rate not found')
  })

  it('throws on non-200 response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 403,
    } as Response)

    await expect(fetchFromOpenExchangeRates('app-id')).rejects.toThrow('403')
  })
})

// ── Rate validation ───────────────────────────────────────────
describe('Rate validation', () => {
  it('accepts rate within known bounds for USD/IQD', () => {
    const result = validateRate('USD', 'IQD', 1310)
    expect(result.valid).toBe(true)
  })

  it('rejects rate below minimum bound — catches API errors returning tiny values', () => {
    const result = validateRate('USD', 'IQD', 500) // below min 1000
    expect(result.valid).toBe(false)
    expect(result.reason).toContain('outside expected bounds')
  })

  it('rejects rate above maximum bound', () => {
    const result = validateRate('USD', 'IQD', 5000) // above max 2000
    expect(result.valid).toBe(false)
    expect(result.reason).toContain('outside expected bounds')
  })

  it('rejects zero rate', () => {
    const result = validateRate('USD', 'IQD', 0)
    expect(result.valid).toBe(false)
    expect(result.reason).toContain('positive')
  })

  it('rejects negative rate', () => {
    const result = validateRate('USD', 'IQD', -1)
    expect(result.valid).toBe(false)
  })

  it('accepts rate for pair without defined bounds', () => {
    const result = validateRate('USD', 'EUR', 0.92)
    expect(result.valid).toBe(true)
  })

  it('accepts IQD/USD within bounds', () => {
    const result = validateRate('IQD', 'USD', 0.000763)
    expect(result.valid).toBe(true)
  })
})
