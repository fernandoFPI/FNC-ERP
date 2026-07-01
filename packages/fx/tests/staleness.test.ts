vi.mock('@fnc-erp/db', () => ({
  query: vi.fn(),
  pool: { connect: vi.fn(), query: vi.fn() },
}))

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { checkRateStaleness, getLastKnownRate } from '../src/staleness.js'
import { query } from '@fnc-erp/db'

function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 3_600_000).toISOString()
}

describe('Rate staleness detection', () => {
  beforeEach(() => {
    vi.mocked(query).mockReset()
  })

  it('returns fresh status for rate updated in the last 24 hours', async () => {
    // Config query
    vi.mocked(query).mockResolvedValueOnce({ rows: [{ warn_after_hours: 48, critical_after_hours: 96 }] } as never)
    // Rate query
    vi.mocked(query).mockResolvedValueOnce({ rows: [{ rate: '1310', rate_date: hoursAgo(10) }] } as never)

    const [status] = await checkRateStaleness('company-1', [{ from: 'USD', to: 'IQD' }])
    expect(status!.status).toBe('fresh')
  })

  it('returns warn status for rate older than warn_after_hours', async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [{ warn_after_hours: 48, critical_after_hours: 96 }] } as never)
    vi.mocked(query).mockResolvedValueOnce({ rows: [{ rate: '1310', rate_date: hoursAgo(50) }] } as never)

    const [status] = await checkRateStaleness('company-1', [{ from: 'USD', to: 'IQD' }])
    expect(status!.status).toBe('warn')
    expect(status!.message).toContain('hours old')
  })

  it('returns critical status for rate older than critical_after_hours', async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [{ warn_after_hours: 48, critical_after_hours: 96 }] } as never)
    vi.mocked(query).mockResolvedValueOnce({ rows: [{ rate: '1310', rate_date: hoursAgo(100) }] } as never)

    const [status] = await checkRateStaleness('company-1', [{ from: 'USD', to: 'IQD' }])
    expect(status!.status).toBe('critical')
  })

  it('returns missing status when no rate exists for pair', async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [{ warn_after_hours: 48, critical_after_hours: 96 }] } as never)
    vi.mocked(query).mockResolvedValueOnce({ rows: [] } as never)

    const [status] = await checkRateStaleness('company-1', [{ from: 'USD', to: 'IQD' }])
    expect(status!.status).toBe('missing')
    expect(status!.lastRate).toBeNull()
  })

  it('respects company-specific threshold configuration', async () => {
    // Custom config: warn after 12h, critical after 24h
    vi.mocked(query).mockResolvedValueOnce({ rows: [{ warn_after_hours: 12, critical_after_hours: 24 }] } as never)
    vi.mocked(query).mockResolvedValueOnce({ rows: [{ rate: '1310', rate_date: hoursAgo(15) }] } as never)

    const [status] = await checkRateStaleness('company-1', [{ from: 'USD', to: 'IQD' }])
    // 15h old with 12h warn threshold → warn (not fresh)
    expect(status!.status).toBe('warn')
  })

  it('ageHours is rounded to 1 decimal place', async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [{ warn_after_hours: 48, critical_after_hours: 96 }] } as never)
    vi.mocked(query).mockResolvedValueOnce({ rows: [{ rate: '1310', rate_date: hoursAgo(25.357) }] } as never)

    const [status] = await checkRateStaleness('company-1', [{ from: 'USD', to: 'IQD' }])
    expect(status!.ageHours).not.toBeNull()
    // Should have at most 1 decimal place
    const str = String(status!.ageHours)
    const decimals = str.includes('.') ? str.split('.')[1]!.length : 0
    expect(decimals).toBeLessThanOrEqual(1)
  })

  it('uses default thresholds when no config row exists', async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [] } as never) // no config
    vi.mocked(query).mockResolvedValueOnce({ rows: [{ rate: '1310', rate_date: hoursAgo(50) }] } as never)

    const [status] = await checkRateStaleness('company-1', [{ from: 'USD', to: 'IQD' }])
    // Default warn_after_hours=48, 50h > 48h → warn
    expect(status!.status).toBe('warn')
  })
})

describe('getLastKnownRate', () => {
  beforeEach(() => {
    vi.mocked(query).mockReset()
  })

  it('returns rate and ageHours when rate exists', async () => {
    vi.mocked(query).mockResolvedValueOnce({
      rows: [{ rate: '1310.5', rate_date: hoursAgo(5) }],
    } as never)

    const result = await getLastKnownRate('USD', 'IQD')
    expect(result).not.toBeNull()
    expect(result!.rate).toBe(1310.5)
    expect(result!.ageHours).toBeGreaterThan(4.9)
    expect(result!.ageHours).toBeLessThan(5.5)
  })

  it('returns null when no rate exists', async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [] } as never)
    const result = await getLastKnownRate('USD', 'IQD')
    expect(result).toBeNull()
  })
})
