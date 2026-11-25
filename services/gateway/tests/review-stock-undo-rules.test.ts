import { describe, it, expect } from 'vitest'
import { planPurchaseReduction, splitStockQuantity, undoBlockedReason } from '../src/lib/reviewStockUndo.js'

// The pure rules of "use stock instead" for part of a line, and of Undo (playbook #120). The real flows are in
// requisition-review-add-remove.test.ts; these pin each rule on its own.

describe('planPurchaseReduction', () => {
  const ps = [
    { id: 'new', qty: 4 },
    { id: 'old', qty: 6 },
  ]
  it('takes from the first listed purchase first', () => {
    expect(planPurchaseReduction(ps, 3)).toEqual([{ id: 'new', before: 4, after: 1 }])
  })
  it('removes a purchase nothing is left of and carries on to the next', () => {
    expect(planPurchaseReduction(ps, 5)).toEqual([
      { id: 'new', before: 4, after: null },
      { id: 'old', before: 6, after: 5 },
    ])
  })
  it('an exact amount removes that purchase and touches no other', () => {
    expect(planPurchaseReduction(ps, 4)).toEqual([{ id: 'new', before: 4, after: null }])
  })
  it('never takes more than the purchases hold', () => {
    const steps = planPurchaseReduction(ps, 99)
    expect(steps.every((s) => s.after === null)).toBe(true)
    expect(steps.reduce((s, x) => s + x.before, 0)).toBe(10)
  })
  it('nothing to take changes nothing', () => {
    expect(planPurchaseReduction(ps, 0)).toEqual([])
  })
})

describe('splitStockQuantity', () => {
  it('the whole remaining quantity is the full replacement and every purchase goes', () => {
    expect(splitStockQuantity({ toCover: 10, bought: 10, take: 10 })).toEqual({ all: true, take: 10, shortfall: 0, reduceBy: 10 })
  })
  it('just under the whole counts as the whole (rounding noise)', () => {
    expect(splitStockQuantity({ toCover: 3.6, bought: 3.6, take: 3.59999 }).all).toBe(true)
  })
  it('a part comes off the purchases when everything was bought', () => {
    expect(splitStockQuantity({ toCover: 10, bought: 10, take: 4 })).toEqual({ all: false, take: 4, shortfall: 0, reduceBy: 4 })
  })
  it('what was never bought is covered first, so the purchases give up only the rest', () => {
    expect(splitStockQuantity({ toCover: 12, bought: 10, take: 3 })).toEqual({ all: false, take: 3, shortfall: 2, reduceBy: 1 })
    expect(splitStockQuantity({ toCover: 12, bought: 10, take: 2 }).reduceBy).toBe(0)
  })
  it('a line bought for more than it was ordered gives up the full part', () => {
    expect(splitStockQuantity({ toCover: 10, bought: 13, take: 4 }).reduceBy).toBe(4)
  })
})

describe('undoBlockedReason', () => {
  const base = { lineFromStockNow: 4, lineFromStockAfter: 4, reduced: [{ id: 'p', now: 6, after: 6 }] }
  it('nothing changed since: can be undone', () => {
    expect(undoBlockedReason(base)).toBeNull()
  })
  it('the quantity from stock moved', () => {
    expect(undoBlockedReason({ ...base, lineFromStockNow: 5 })).toMatch(/covered from stock/)
  })
  it('a reduced purchase holds another quantity, or is gone', () => {
    expect(undoBlockedReason({ ...base, reduced: [{ id: 'p', now: 5, after: 6 }] })).toMatch(/purchase/)
    expect(undoBlockedReason({ ...base, reduced: [{ id: 'p', now: null, after: 6 }] })).toMatch(/purchase/)
  })
  it('an operation that reduced nothing has no purchase to check', () => {
    expect(undoBlockedReason({ ...base, reduced: [] })).toBeNull()
  })
})
