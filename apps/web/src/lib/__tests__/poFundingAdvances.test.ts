import { describe, it, expect } from 'vitest'
import {
  fundingCurrencies,
  advancesForCurrency,
  autoSelectAdvances,
  fundingSelectionComplete,
  fundingAdvancesInput,
  SETTLEABLE_ADVANCE_STATUSES,
  type FundingAdvanceOption,
} from '../poFundingAdvances'

const adv = (id: string, currency: string, status = 'approved'): FundingAdvanceOption => ({
  id,
  advance_number: `ADV-${id}`,
  outstanding_amount: 1000,
  currency_code: currency,
  status,
})

describe('fundingCurrencies', () => {
  it('is the stored currency of each line, one each, alphabetical', () => {
    expect(
      fundingCurrencies({
        currency_code: 'IQD',
        lines: [{ currency_code: 'USD' }, { currency_code: 'IQD' }, { currency_code: 'USD' }],
      }),
    ).toEqual(['IQD', 'USD'])
  })

  it('reads the lines, not the header: an all-IQD PO with a USD header needs an IQD advance', () => {
    expect(fundingCurrencies({ currency_code: 'USD', lines: [{ currency_code: 'IQD' }] })).toEqual([
      'IQD',
    ])
  })

  it('falls back to the header currency for a PO with no lines yet', () => {
    expect(fundingCurrencies({ currency_code: 'iqd', lines: [] })).toEqual(['IQD'])
    expect(fundingCurrencies({ currency_code: 'IQD' })).toEqual(['IQD'])
  })

  it('a line whose stored currency was not loaded counts in the PO currency (the page-wide rule)', () => {
    expect(fundingCurrencies({ currency_code: 'USD', lines: [{ currency_code: null }] })).toEqual([
      'USD',
    ])
  })
})

describe('advancesForCurrency', () => {
  const all = [
    adv('a', 'IQD'),
    adv('b', 'USD'),
    adv('c', 'IQD', 'partially_settled'),
    adv('d', 'IQD', 'draft'),
    adv('e', 'USD', 'settled'),
  ]

  it('offers only that currency, never converted', () => {
    expect(advancesForCurrency(all, 'USD').map((a) => a.id)).toEqual(['b'])
    expect(advancesForCurrency(all, 'EUR')).toEqual([])
  })

  it('offers only advances that can still pay: approved or partially settled', () => {
    expect(advancesForCurrency(all, 'IQD').map((a) => a.id)).toEqual(['a', 'c'])
  })

  it('the list of usable statuses is exactly these two (the server pins the same list)', () => {
    expect([...SETTLEABLE_ADVANCE_STATUSES].sort()).toEqual(['approved', 'partially_settled'])
  })

  it('reads a padded currency code as the same currency', () => {
    expect(advancesForCurrency([adv('p', 'USD ')], 'USD')).toHaveLength(1)
  })
})

describe('autoSelectAdvances', () => {
  it('takes the only advance on offer for a currency, and leaves a currency with a choice empty', () => {
    const advances = [adv('i1', 'IQD'), adv('u1', 'USD'), adv('u2', 'USD')]
    expect(autoSelectAdvances(['IQD', 'USD'], advances, {})).toEqual({ IQD: 'i1' })
  })

  it('keeps a choice that is still on offer, drops one that is not', () => {
    const advances = [adv('u1', 'USD'), adv('u2', 'USD')]
    expect(autoSelectAdvances(['USD'], advances, { USD: 'u2' })).toEqual({ USD: 'u2' })
    expect(autoSelectAdvances(['USD'], advances, { USD: 'gone' })).toEqual({})
  })

  it('a kept choice wins over the single-option rule', () => {
    expect(autoSelectAdvances(['USD'], [adv('u1', 'USD')], { USD: 'u1' })).toEqual({ USD: 'u1' })
  })

  it('forgets a currency the PO no longer has', () => {
    expect(
      autoSelectAdvances(['IQD'], [adv('i1', 'IQD'), adv('u1', 'USD')], { IQD: 'i1', USD: 'u1' }),
    ).toEqual({ IQD: 'i1' })
  })

  it('selects nothing when the employee has no usable advance in a currency', () => {
    expect(autoSelectAdvances(['IQD', 'USD'], [adv('i1', 'IQD')], {})).toEqual({ IQD: 'i1' })
    expect(autoSelectAdvances(['IQD'], [], {})).toEqual({})
  })
})

describe('fundingSelectionComplete', () => {
  it('needs every currency chosen', () => {
    expect(fundingSelectionComplete(['IQD', 'USD'], { IQD: 'i1' })).toBe(false)
    expect(fundingSelectionComplete(['IQD', 'USD'], { IQD: 'i1', USD: 'u1' })).toBe(true)
    expect(fundingSelectionComplete(['IQD'], { IQD: 'i1' })).toBe(true)
  })

  it('an empty choice (the blank option) is not a choice, and no currencies is not complete', () => {
    expect(fundingSelectionComplete(['IQD'], { IQD: '' })).toBe(false)
    expect(fundingSelectionComplete([], {})).toBe(false)
  })
})

describe('fundingAdvancesInput', () => {
  it('is one entry per currency in the PO’s order, and skips an empty one', () => {
    expect(fundingAdvancesInput(['IQD', 'USD'], { USD: 'u1', IQD: 'i1' })).toEqual([
      { currencyCode: 'IQD', advanceId: 'i1' },
      { currencyCode: 'USD', advanceId: 'u1' },
    ])
    expect(fundingAdvancesInput(['IQD', 'USD'], { IQD: 'i1' })).toEqual([
      { currencyCode: 'IQD', advanceId: 'i1' },
    ])
  })

  it('never sends a currency the PO does not have', () => {
    expect(fundingAdvancesInput(['IQD'], { IQD: 'i1', EUR: 'e1' })).toEqual([
      { currencyCode: 'IQD', advanceId: 'i1' },
    ])
  })
})
