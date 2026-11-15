import { describe, it, expect } from 'vitest'
import { totalsByCurrency } from '../pettyCashTotals'

describe('totalsByCurrency', () => {
  it('keeps every currency apart: a USD float is never added to the IQD ones', () => {
    const totals = totalsByCurrency([
      { currency_code: 'IQD', current_balance: 58603502, authorized_limit: 68603502 },
      { currency_code: 'USD', current_balance: 194337.94, authorized_limit: 194337.94 },
    ])
    expect(totals).toEqual([
      { currency: 'IQD', held: 58603502, authorized: 68603502, spentPct: 15 },
      { currency: 'USD', held: 194337.94, authorized: 194337.94, spentPct: 0 },
    ])
    // the number the old page showed, labelled IQD, which added the two together
    expect(totals.some((t) => t.held === 58797839.94)).toBe(false)
  })

  it('sums several floats of the same currency', () => {
    const [iqd] = totalsByCurrency([
      { currency_code: 'IQD', current_balance: '100', authorized_limit: '400' },
      { currency_code: 'IQD', current_balance: 50, authorized_limit: 100 },
    ])
    expect(iqd).toEqual({ currency: 'IQD', held: 150, authorized: 500, spentPct: 70 })
  })

  it('reads the numeric strings the API returns', () => {
    const [usd] = totalsByCurrency([
      { currency_code: 'USD', current_balance: '12.50', authorized_limit: '50.00' },
    ])
    expect(usd.held).toBe(12.5)
    expect(usd.authorized).toBe(50)
  })

  it('orders the currencies alphabetically, whatever order the floats came in', () => {
    const codes = totalsByCurrency([
      { currency_code: 'USD', current_balance: 1, authorized_limit: 1 },
      { currency_code: 'EUR', current_balance: 1, authorized_limit: 1 },
      { currency_code: 'IQD', current_balance: 1, authorized_limit: 1 },
    ]).map((t) => t.currency)
    expect(codes).toEqual(['EUR', 'IQD', 'USD'])
  })

  it('reports 0% spent, not NaN, for a currency with nothing authorized', () => {
    const [row] = totalsByCurrency([
      { currency_code: 'USD', current_balance: 0, authorized_limit: 0 },
    ])
    expect(row.spentPct).toBe(0)
  })

  it('has no rows for no floats', () => {
    expect(totalsByCurrency([])).toEqual([])
  })
})
