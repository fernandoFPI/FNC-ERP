// The small rules behind the employee Performance tab, and the pins that keep the page and the gateway agreeing.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  DEFAULT_PERFORMANCE_DAYS,
  PERFORMANCE_PERIODS,
  barMax,
  busiestApproverKind,
  ratePercent,
  rateText,
  waitText,
} from '../employeePerformance'

describe('rates', () => {
  it('is a whole percent, and a dash (never 0 %) when there is nothing to divide by', () => {
    expect(ratePercent(1, 3)).toBe(33)
    expect(ratePercent(2, 3)).toBe(67)
    expect(ratePercent(0, 5)).toBe(0)
    expect(ratePercent(5, 5)).toBe(100)
    expect(ratePercent(0, 0)).toBeNull()
    expect(ratePercent(3, 0)).toBeNull()
    expect(rateText(1, 4)).toBe('25%')
    expect(rateText(0, 0)).toBe('—')
    expect(rateText(0, 7)).toBe('0%')
  })
})

describe('how a wait is worded', () => {
  it('uses hours under two days, then days, and nothing for no answer', () => {
    expect(waitText(3)).toEqual({ unit: 'hours', value: 3 })
    expect(waitText(0.04)).toEqual({ unit: 'hours', value: 0 })
    expect(waitText(47.9)).toEqual({ unit: 'hours', value: 47.9 })
    expect(waitText(48)).toEqual({ unit: 'days', value: 2 })
    expect(waitText(72)).toEqual({ unit: 'days', value: 3 })
    expect(waitText(60)).toEqual({ unit: 'days', value: 2.5 })
    expect(waitText(null)).toBeNull()
    expect(waitText(undefined)).toBeNull()
    expect(waitText(-1)).toBeNull()
    expect(waitText(Number.NaN)).toBeNull()
  })
})

describe('the kind of decision shown in the tile', () => {
  const rows = [
    { key: 'expense_claim', approved: 3, sentBack: 1, medianHours: 6 },
    { key: 'requisition', approved: 20, sentBack: 5, medianHours: 3 },
    { key: 'advance_request', approved: 99, sentBack: 0, medianHours: null },
  ]
  it('is the kind they decide most often, and one with no measured wait is skipped', () => {
    expect(busiestApproverKind(rows)?.key).toBe('requisition')
    expect(busiestApproverKind([])).toBeNull()
    expect(
      busiestApproverKind([
        { key: 'advance_request', approved: 4, sentBack: 0, medianHours: null },
      ]),
    ).toBeNull()
  })
})

describe('bars', () => {
  it('never divides by zero', () => {
    expect(barMax([])).toBe(1)
    expect(barMax([0, 0])).toBe(1)
    expect(barMax([2, 7, 3])).toBe(7)
  })
})

describe('the periods agree with the gateway', () => {
  const server = readFileSync(
    path.resolve(__dirname, '../../../../../services/gateway/src/lib/employeePerformance.ts'),
    'utf8',
  )
  it("offers exactly the server's periods, plus all time, and starts on 90 days", () => {
    const m = /PERFORMANCE_PERIODS = \[([^\]]*)\]/.exec(server)
    const serverDays = (m?.[1] ?? '').split(',').map((s) => Number(s.trim()))
    expect(serverDays).toEqual([30, 90, 365])
    expect(PERFORMANCE_PERIODS.map((p) => p.days)).toEqual([...serverDays, null])
    expect(DEFAULT_PERFORMANCE_DAYS).toBe(90)
  })
})
