// Playbook #105: the PO page's admin correction (a receipt's "Warehouse Location" box) has no render harness (the page is
// 8,000 lines), so the wiring is pinned in the source. The rule itself is tested in receivingLocations.test.ts and the
// receipt form is rendered in ReceiptFormLocations.test.tsx.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const here = __dirname
const poPagePath = path.resolve(
  here,
  '../../pages/procurement/purchase-orders/PurchaseOrderDetail.tsx',
)
const source = fs.readFileSync(poPagePath, 'utf8')

describe('PurchaseOrderDetail: where an admin can move a receipt', () => {
  it('reads the page (guards against an empty read making the checks below pass on nothing)', () => {
    expect(source.length).toBeGreaterThan(100_000)
  })

  it('offers the receipt Warehouse Location box only real locations, plus the one the receipt already has', () => {
    const box = /value=\{dr\.warehouse_location_id\}[\s\S]*?<\/select>/.exec(source)
    if (!box) throw new Error('could not find the admin correction Warehouse Location select')
    // the box draws `locationChoices`: the real locations plus the receipt's own current one
    expect(box[0]).toContain('{locationChoices.map(')
    expect(box[0]).not.toMatch(/\{stockLocations\.map\(/)
    expect(source).toMatch(
      /const locationChoices = receivableLocationsKeeping\(\s*stockLocations,\s*orig\?\.location_id,?\s*\)/,
    )
  })

  it('leaves the other location box (a PO line source location) unfiltered, on purpose: it is not a receiving location', () => {
    const plain = source.match(/\{stockLocations\.map\(/g) ?? []
    expect(plain).toHaveLength(1)
  })
})
