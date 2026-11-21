// Stale stock cost (playbook #111), the screen's half of the rule, and the places it has to agree with the server and the translations.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { isStaleStockLine, staleCostItems, STOCK_COST_STALE_DAYS } from '../staleStockCost'
import en from '../../i18n/locales/en.json'
import ar from '../../i18n/locales/ar.json'

const base = {
  id: 'l1',
  product_id: 'p1',
  product_name: 'Pipe',
  sku: 'P-1',
  qty_from_stock: '2',
  cost_stale: true,
  cost_age_days: 40,
}

describe('isStaleStockLine', () => {
  it('flags a line drawn from stock whose Cost the server calls old', () => {
    expect(isStaleStockLine(base)).toBe(true)
  })
  it('does not flag a recent Cost', () => {
    expect(isStaleStockLine({ ...base, cost_stale: false })).toBe(false)
    expect(isStaleStockLine({ ...base, cost_stale: null })).toBe(false)
  })
  it('does not flag a line no stock covers (the saved quantity is 0 or missing)', () => {
    expect(isStaleStockLine({ ...base, qty_from_stock: '0' })).toBe(false)
    expect(isStaleStockLine({ ...base, qty_from_stock: null })).toBe(false)
    expect(isStaleStockLine({ ...base, qty_from_stock: 'abc' })).toBe(false)
  })
  it('uses the quantity being typed instead of the saved one when it is given', () => {
    expect(isStaleStockLine({ ...base, qty_from_stock: '0' }, { liveQty: 3 })).toBe(true)
    expect(isStaleStockLine({ ...base, qty_from_stock: '5' }, { liveQty: 0 })).toBe(false)
  })
  it('makes no claim about a line whose item was replaced: the server age belongs to the original item', () => {
    expect(isStaleStockLine(base, { overridden: true })).toBe(false)
    expect(isStaleStockLine(base, { liveQty: 4, overridden: true })).toBe(false)
  })
})

describe('staleCostItems', () => {
  const lines = [
    // the oldest age comes on the FIRST line of p1, so "the last line wins" gives the wrong answer here
    { ...base, id: 'a', product_id: 'p1', cost_age_days: 65 },
    { ...base, id: 'b', product_id: 'p2', product_name: 'Cable', sku: 'C-1', cost_age_days: 90 },
    { ...base, id: 'c', product_id: 'p1', cost_age_days: 40 },
    { ...base, id: 'd', product_id: 'p3', cost_stale: false },
    { ...base, id: 'e', product_id: null },
  ]
  it('lists each item once, in line order, with the oldest age, and skips lines that are not flagged or have no item', () => {
    const items = staleCostItems(lines, (l) => isStaleStockLine(l))
    expect(items.map((i) => [i.productId, i.days])).toEqual([
      ['p1', 65],
      ['p2', 90],
    ])
    expect(items[1]).toMatchObject({ name: 'Cable', sku: 'C-1' })
  })
  it('names an item by its description, then its SKU, when it has no product name', () => {
    const [a] = staleCostItems(
      [{ ...base, product_name: null, description: 'Custom pipe' }],
      () => true,
    )
    expect(a.name).toBe('Custom pipe')
    const [b] = staleCostItems([{ ...base, product_name: null, description: null }], () => true)
    expect(b.name).toBe('P-1')
  })
  it('falls back to just over the limit when the age is missing, never to zero', () => {
    const [a] = staleCostItems([{ ...base, cost_age_days: null }], () => true)
    expect(a.days).toBe(STOCK_COST_STALE_DAYS + 1)
  })
})

describe('the limit the sentence names', () => {
  it('is the same number the server uses', () => {
    const server = readFileSync(
      path.resolve(__dirname, '../../../../../services/gateway/src/lib/staleStockCost.ts'),
      'utf8',
    )
    const m = /export const STOCK_COST_STALE_DAYS = (\d+)/.exec(server)
    if (!m) throw new Error('the limit was not found in the server file')
    expect(Number(m[1])).toBe(STOCK_COST_STALE_DAYS)
  })
})

describe('the translations', () => {
  const KEYS = [
    'staleCostTitle',
    'staleCostIntro',
    'staleCostConfirmHint',
    'staleCostAge',
    'staleCostOpenItem',
    'staleCostConfirm',
    'staleCostTag',
    'staleCostConfirmedToast',
  ]
  const vars = (s: string) => [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort()
  const enDetail = (en as unknown as { req: { detail: Record<string, string> } }).req.detail
  const arDetail = (ar as unknown as { req: { detail: Record<string, string> } }).req.detail

  it.each(KEYS)(
    '%s is in the req.detail group of both languages, not in a neighbouring group (playbook #26)',
    (key) => {
      expect(typeof enDetail[key]).toBe('string')
      expect(typeof arDetail[key]).toBe('string')
      expect(enDetail[key].length).toBeGreaterThan(3)
      expect(arDetail[key].length).toBeGreaterThan(3)
    },
  )
  it.each(KEYS)('%s uses the same placeholders in English and Arabic', (key) => {
    expect(vars(arDetail[key])).toEqual(vars(enDetail[key]))
  })
  it('every req.detail.staleCost key the source reads exists (a missing key prints the raw dotted key)', () => {
    const read = (f: string) => readFileSync(path.resolve(__dirname, f), 'utf8')
    const used = new Set<string>()
    for (const f of [
      '../../components/procurement/StaleCostNotice.tsx',
      '../../pages/procurement/requisitions/RequisitionDetail.tsx',
    ])
      for (const m of read(f).matchAll(/t\('req\.detail\.(staleCost\w+)'/g)) used.add(m[1])
    expect(used.size).toBeGreaterThanOrEqual(6)
    for (const k of used) {
      expect(enDetail[k], `en ${k}`).toBeTruthy()
      expect(arDetail[k], `ar ${k}`).toBeTruthy()
    }
  })
})
