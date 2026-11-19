// One rule for "how much of this line has arrived", read by the Next Step bar and by the Lines table's Received column
// (playbook #41: they used to disagree for a line covered from stock).
import { describe, it, expect } from 'vitest'
import { lineCoverage, orderCoverage } from '../poLineCoverage'

describe('lineCoverage', () => {
  it('is received plus what stock covers, out of what was ordered', () => {
    expect(lineCoverage({ qty: 10, qty_received: 4, qty_from_stock: 2 })).toMatchObject({
      ordered: 10,
      received: 4,
      fromStock: 2,
      covered: 6,
      pct: 60,
      state: 'partial',
    })
  })

  it('a line covered entirely from stock is full, not "0 received" (the #41 disagreement)', () => {
    expect(lineCoverage({ qty: 5, qty_received: 0, qty_from_stock: 5 })).toMatchObject({
      covered: 5,
      pct: 100,
      state: 'full',
    })
  })

  it('a line received in full is full', () => {
    expect(lineCoverage({ qty: 3, qty_received: 3 }).state).toBe('full')
  })

  it('a line with nothing arrived is none', () => {
    expect(lineCoverage({ qty: 3, qty_received: 0, qty_from_stock: 0 })).toMatchObject({
      state: 'none',
      pct: 0,
    })
  })

  it('never reports more covered than was ordered, so an over-receipt reads 100 %', () => {
    expect(lineCoverage({ qty: 4, qty_received: 6 })).toMatchObject({
      covered: 4,
      pct: 100,
      state: 'full',
    })
  })

  it('still says how much really arrived when that is more than was ordered', () => {
    expect(lineCoverage({ qty: 4, qty_received: 6 }).arrived).toBe(6)
    expect(lineCoverage({ qty: 5, qty_received: 3, qty_from_stock: 2 }).arrived).toBe(5)
  })

  it('reads the strings the API sends (NUMERIC arrives as text) and treats missing or bad values as zero', () => {
    expect(lineCoverage({ qty: '4.0000', qty_received: '1.5', qty_from_stock: null }).covered).toBe(
      1.5,
    )
    expect(lineCoverage({ qty: '4', qty_received: 'abc' }).received).toBe(0)
    expect(lineCoverage({ qty: 4 }).received).toBe(0)
  })

  it('a line with nothing ordered is never full', () => {
    expect(lineCoverage({ qty: 0, qty_received: 0 })).toMatchObject({ state: 'none', pct: 0 })
  })

  it('rounds the percentage to a whole number', () => {
    expect(lineCoverage({ qty: 3, qty_received: 1 }).pct).toBe(33)
  })
})

describe('orderCoverage', () => {
  it('counts the lines that are fully covered, and is complete only when all of them are', () => {
    const lines = [
      { qty: 2, qty_received: 2 },
      { qty: 2, qty_received: 0, qty_from_stock: 2 },
      { qty: 2, qty_received: 1 },
    ]
    expect(orderCoverage(lines)).toEqual({ lines: 3, fullyCovered: 2, complete: false })
    expect(orderCoverage(lines.slice(0, 2))).toEqual({ lines: 2, fullyCovered: 2, complete: true })
  })

  it('an order with no lines is not complete', () => {
    expect(orderCoverage([])).toEqual({ lines: 0, fullyCovered: 0, complete: false })
  })
})
