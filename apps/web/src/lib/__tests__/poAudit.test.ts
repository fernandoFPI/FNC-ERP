// One rule for how far a PO's Finance audit has got, and for the price comparison on each line.
import { describe, it, expect } from 'vitest'
import { auditProgress, auditPrices } from '../poAudit'

describe('auditProgress', () => {
  it('counts ok, flagged and still-to-check lines', () => {
    expect(
      auditProgress([
        { audit_status: 'ok' },
        { audit_status: 'flagged' },
        { audit_status: 'pending' },
        { audit_status: null },
        {},
      ]),
    ).toEqual({ total: 5, ok: 1, flagged: 1, pending: 3, checked: 2, canPass: false })
  })

  it('can be passed only when nothing is flagged and nothing is left to check', () => {
    expect(auditProgress([{ audit_status: 'ok' }, { audit_status: 'ok' }]).canPass).toBe(true)
    expect(auditProgress([{ audit_status: 'ok' }, { audit_status: 'flagged' }]).canPass).toBe(false)
    expect(auditProgress([{ audit_status: 'ok' }, { audit_status: 'pending' }]).canPass).toBe(false)
    expect(auditProgress([{ audit_status: 'ok' }, {}]).canPass).toBe(false)
  })

  it('a flagged line blocks the pass even when every other line is ok', () => {
    const p = auditProgress([{ audit_status: 'flagged' }])
    expect(p).toMatchObject({ flagged: 1, pending: 0, canPass: false })
  })

  it('an order with no lines has nothing to check (the pass is not blocked, as before)', () => {
    expect(auditProgress([])).toMatchObject({ total: 0, checked: 0, canPass: true })
  })
})

describe('auditPrices', () => {
  it('compares the actual price with the PO price and totals what was bought', () => {
    const p = auditPrices({ qty: 10, qty_from_stock: 2, unit_price: 100, actual_unit_price: 110 })
    expect(p).toMatchObject({
      poPrice: 100,
      actualPrice: 110,
      toBuy: 8,
      variance: 10,
      purchaseTotal: 880,
    })
    expect(p.variancePct).toBeCloseTo(10)
  })

  it('a price below the PO price is a negative variance', () => {
    const p = auditPrices({ qty: 1, unit_price: 100, actual_unit_price: 90 })
    expect(p.variance).toBe(-10)
    expect(p.variancePct).toBeCloseTo(-10)
  })

  it('has no variance until the buyer has recorded a price, and prices the total at the PO price meanwhile', () => {
    const p = auditPrices({ qty: 3, unit_price: 50, actual_unit_price: null })
    expect(p).toMatchObject({
      actualPrice: null,
      variance: null,
      variancePct: null,
      purchaseTotal: 150,
    })
  })

  it('a line taken entirely from stock buys nothing, so its total is zero', () => {
    const p = auditPrices({ qty: 5, qty_from_stock: 5, unit_price: 40, actual_unit_price: null })
    expect(p).toMatchObject({ toBuy: 0, purchaseTotal: 0 })
  })

  it('never buys a negative amount when stock covers more than was ordered', () => {
    expect(auditPrices({ qty: 2, qty_from_stock: 5, unit_price: 1 }).toBuy).toBe(0)
  })

  it('has no percentage when the PO price is zero', () => {
    const p = auditPrices({ qty: 1, unit_price: 0, actual_unit_price: 25 })
    expect(p.variance).toBeNull()
    expect(p.variancePct).toBeNull()
  })

  it('reads the numeric strings the API sends', () => {
    const p = auditPrices({
      qty: '4.0000',
      qty_from_stock: '1',
      unit_price: '10.5000',
      actual_unit_price: '12',
    })
    expect(p).toMatchObject({ poPrice: 10.5, actualPrice: 12, toBuy: 3, purchaseTotal: 36 })
  })

  it('treats a bad number as zero', () => {
    expect(auditPrices({ qty: 'abc', unit_price: 'x' })).toMatchObject({
      poPrice: 0,
      toBuy: 0,
      purchaseTotal: 0,
    })
  })
})
