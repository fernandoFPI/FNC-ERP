import { describe, it, expect } from 'vitest'
import {
  formatDate,
  formatNumber,
  formatCurrency,
  formatRelativeTime,
  formatUptime,
} from '../format'

describe('formatDate', () => {
  it('formats in DD/MM/YYYY by default', () => {
    expect(formatDate('2026-06-15')).toBe('15/06/2026')
  })

  it('formats in MM/DD/YYYY when specified', () => {
    expect(formatDate('2026-06-15', 'MM/DD/YYYY')).toBe('06/15/2026')
  })

  it('formats in YYYY-MM-DD when specified', () => {
    expect(formatDate('2026-01-05', 'YYYY-MM-DD')).toBe('2026-01-05')
  })

  it('handles Date objects', () => {
    const d = new Date(2026, 5, 7) // June 7, 2026 (months are 0-indexed)
    expect(formatDate(d)).toBe('07/06/2026')
  })

  it('returns original string for invalid date', () => {
    expect(formatDate('not-a-date')).toBe('not-a-date')
  })

  it('pads single digit day and month', () => {
    expect(formatDate('2026-01-05')).toBe('05/01/2026')
  })
})

describe('formatNumber', () => {
  it('formats with standard locale by default', () => {
    const result = formatNumber(1234567.89)
    expect(result).toContain('1,234,567')
    expect(result).toContain('.89')
  })

  it('formats with european locale', () => {
    const result = formatNumber(1234567.89, 'european')
    expect(result).toContain('1.234.567')
  })

  it('shows 2 decimal places', () => {
    expect(formatNumber(100)).toBe('100.00')
  })
})

describe('formatCurrency', () => {
  it('appends currency code', () => {
    const result = formatCurrency(1500, 'IQD')
    expect(result).toContain('IQD')
    expect(result).toContain('1,500')
  })

  it('works with USD', () => {
    const result = formatCurrency(99.99, 'USD')
    expect(result).toContain('99.99')
    expect(result).toContain('USD')
  })
})

describe('formatRelativeTime', () => {
  it('returns "just now" for under 1 minute', () => {
    const recent = new Date(Date.now() - 30000)
    expect(formatRelativeTime(recent)).toBe('just now')
  })

  it('returns minutes ago', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000)
    expect(formatRelativeTime(fiveMinAgo)).toBe('5 min ago')
  })

  it('returns hours ago', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)
    expect(formatRelativeTime(twoHoursAgo)).toBe('2 hr ago')
  })

  it('returns Yesterday for ~24 hours ago', () => {
    const yesterday = new Date(Date.now() - 25 * 60 * 60 * 1000)
    expect(formatRelativeTime(yesterday)).toBe('Yesterday')
  })

  it('handles string input', () => {
    const recent = new Date(Date.now() - 10000).toISOString()
    expect(formatRelativeTime(recent)).toBe('just now')
  })
})

describe('formatUptime', () => {
  it('shows days and hours', () => {
    expect(formatUptime(7 * 86400 + 3 * 3600)).toBe('7d 3h')
  })

  it('shows hours and minutes for less than 1 day', () => {
    expect(formatUptime(2 * 3600 + 30 * 60)).toBe('2h 30m')
  })

  it('shows 0h 0m for 0 seconds', () => {
    expect(formatUptime(0)).toBe('0h 0m')
  })
})
