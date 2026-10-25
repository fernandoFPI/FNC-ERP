import { describe, it, expect } from 'vitest'
import { poTotalEntries, poTotalsText } from '../poTotals'

const fmt = (amount: number, ccy: string) => `${amount} ${ccy}`

describe('poTotalEntries', () => {
  it('lists one entry per currency for a mixed-currency PO whose total_amount is NULL', () => {
    const po = {
      total_amount: null,
      currency_code: 'IQD',
      currencyTotals: [
        { currency_code: 'IQD', subtotal: '200.0000' },
        { currency_code: 'USD', subtotal: '30.0000' },
      ],
    }
    expect(poTotalEntries(po)).toEqual([
      { currencyCode: 'IQD', amount: 200 },
      { currencyCode: 'USD', amount: 30 },
    ])
  })

  it('never reports a blended figure: nothing here equals 230', () => {
    const po = {
      total_amount: null,
      currencyTotals: [
        { currency_code: 'IQD', subtotal: '200' },
        { currency_code: 'USD', subtotal: '30' },
      ],
    }
    expect(poTotalEntries(po).some((e) => e.amount === 230)).toBe(false)
  })

  it('returns nothing for a PO with no lines (NULL total, empty currencyTotals) instead of 0 or NaN', () => {
    expect(
      poTotalEntries({ total_amount: null, currency_code: 'IQD', currencyTotals: [] }),
    ).toEqual([])
  })

  it('does not fall back to the redacted total_amount when currencyTotals is present but empty', () => {
    // a viewer who may not see totals gets total_amount '0' and currencyTotals []
    expect(poTotalEntries({ total_amount: '0', currency_code: 'IQD', currencyTotals: [] })).toEqual(
      [],
    )
  })

  it('falls back to the single total_amount/currency pair only when currencyTotals was never requested', () => {
    expect(poTotalEntries({ total_amount: '500.0000', currency_code: 'IQD' })).toEqual([
      { currencyCode: 'IQD', amount: 500 },
    ])
    expect(
      poTotalEntries({ total_amount: '500.0000', currency_code: 'IQD', currencyTotals: null }),
    ).toEqual([{ currencyCode: 'IQD', amount: 500 }])
  })

  it('returns nothing when total_amount is NULL and currencyTotals was never requested', () => {
    expect(poTotalEntries({ total_amount: null, currency_code: 'IQD' })).toEqual([])
  })

  it('skips an unparseable subtotal rather than emitting NaN', () => {
    expect(poTotalEntries({ currencyTotals: [{ currency_code: 'IQD', subtotal: 'abc' }] })).toEqual(
      [],
    )
  })

  it('accepts numeric subtotals', () => {
    expect(poTotalEntries({ currencyTotals: [{ currency_code: 'USD', subtotal: 12.5 }] })).toEqual([
      { currencyCode: 'USD', amount: 12.5 },
    ])
  })
})

describe('poTotalsText', () => {
  it('joins the per-currency figures and shows a dash when there are none', () => {
    const mixed = {
      total_amount: null,
      currencyTotals: [
        { currency_code: 'IQD', subtotal: '200' },
        { currency_code: 'USD', subtotal: '30' },
      ],
    }
    expect(poTotalsText(mixed, fmt)).toBe('200 IQD + 30 USD')
    expect(poTotalsText({ total_amount: null, currencyTotals: [] }, fmt)).toBe('—')
    expect(poTotalsText({ total_amount: null, currencyTotals: [] }, fmt, 'n/a')).toBe('n/a')
  })
})
