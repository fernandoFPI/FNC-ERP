// Which currency a PO line is shown in. The stored one (po_lines.currency_code) is what the totals, the purchases
// and the cost rows follow, so it wins; the old guesses (market, requested, the PO's own) are only a fallback.
import { describe, it, expect } from 'vitest'
import { poLineCurrency } from '../poLineCurrency'

describe('poLineCurrency', () => {
  it('is the stored currency of the line, even on a USD purchase order', () => {
    // NF-PO-2026-0163 line 3: added after approval, stored IQD, no market or requested currency
    expect(poLineCurrency({ currency_code: 'IQD' }, 'USD')).toBe('IQD')
  })

  it('beats a stale market or requested currency', () => {
    expect(
      poLineCurrency(
        { currency_code: 'USD', market_price_currency: 'IQD', requested_currency_code: 'IQD' },
        'IQD',
      ),
    ).toBe('USD')
    expect(poLineCurrency({ currency_code: 'IQD', requested_currency_code: 'USD' }, 'USD')).toBe(
      'IQD',
    )
  })

  it('ignores padding on the stored code', () => {
    expect(poLineCurrency({ currency_code: 'USD ' }, 'IQD')).toBe('USD')
  })

  it('falls back to market, then requested, then the purchase order, when no stored currency was loaded', () => {
    expect(
      poLineCurrency({ market_price_currency: 'EUR', requested_currency_code: 'USD' }, 'IQD'),
    ).toBe('EUR')
    expect(poLineCurrency({ requested_currency_code: 'USD' }, 'IQD')).toBe('USD')
    expect(poLineCurrency({}, 'IQD')).toBe('IQD')
    expect(poLineCurrency({ currency_code: null, market_price_currency: null }, 'USD')).toBe('USD')
    expect(poLineCurrency({ currency_code: '' }, 'USD')).toBe('USD')
  })
})
