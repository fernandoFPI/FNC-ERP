// The kinds of cost a project's ledger holds (playbook #95): named once for the ledger list and for the cost summary cards on a
// project's analytic account page, and listed in a fixed order so the two cards of a project never read differently.
import { describe, it, expect } from 'vitest'
import i18n from '../../i18n'
import { COST_SOURCE_KEYS, orderCostKinds } from '../projectCostKinds'

const k = (sourceType: string | null) => ({ sourceType })

describe('orderCostKinds', () => {
  it('lists what physically reached the project first, in a fixed order', () => {
    const shuffled = [
      k('po_vendor_return'),
      k('material_return'),
      k('stock_issue'),
      k('po_direct_delivery'),
    ]
    expect(orderCostKinds(shuffled).map((x) => x.sourceType)).toEqual([
      'po_direct_delivery',
      'stock_issue',
      'material_return',
      'po_vendor_return',
    ])
  })

  it('puts journal kinds after the physical ones, by name, and a cost with no source last', () => {
    const out = orderCostKinds([
      k(null),
      k('manual'),
      k('combined'),
      k('stock_issue'),
      k('a_new_source'),
    ])
    expect(out.map((x) => x.sourceType)).toEqual([
      'stock_issue',
      'a_new_source',
      'combined',
      'manual',
      null,
    ])
  })

  it('does not reorder the list it was given, and keeps whatever else each entry carries', () => {
    const input = [
      { sourceType: 'stock_issue', amount: '1' },
      { sourceType: 'po_direct_delivery', amount: '2' },
    ]
    const out = orderCostKinds(input)
    expect(input.map((x) => x.sourceType)).toEqual(['stock_issue', 'po_direct_delivery'])
    expect(out[0]).toEqual({ sourceType: 'po_direct_delivery', amount: '2' })
  })

  it('returns an empty list for an empty list', () => {
    expect(orderCostKinds([])).toEqual([])
  })
})

describe('COST_SOURCE_KEYS', () => {
  it('names the combined journal entry the Finance posting makes', () => {
    expect(COST_SOURCE_KEYS.combined).toBe('fin.analyticDetail.costSourceCombined')
  })

  it.each(Object.entries(COST_SOURCE_KEYS))(
    '%s has a label in English and in Arabic',
    (_source, key) => {
      expect(i18n.exists(key, { lng: 'en' })).toBe(true)
      expect(i18n.exists(key, { lng: 'ar' })).toBe(true)
    },
  )
})
