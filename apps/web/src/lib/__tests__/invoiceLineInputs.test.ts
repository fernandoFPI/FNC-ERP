// The wizard's lines as the createProjectInvoice mutation takes them (lib/invoiceLineInputs.ts), with the unit of measure
// (migration 318) sent along.
import { describe, it, expect } from 'vitest'
import { invoiceLineInputs } from '../invoiceLineInputs'

const lines = [
  { id: 'a', description: 'Chairs', quantity: 4, unit: 'Ea', unit_price: 35, tax_pct: 5 },
  { id: 'b', description: 'Cable', quantity: 120, unit: ' M ', unit_price: 1.5 },
  { id: 'c', description: 'Old style line', quantity: 1, unit_price: 10 },
]

describe('invoiceLineInputs', () => {
  it('sends each line with its unit, quantity, price and tax', () => {
    expect(invoiceLineInputs({ billing_method: 'fixed', lines })[0]).toEqual({
      description: 'Chairs',
      sourceType: 'manual',
      qty: 4,
      uom: 'Ea',
      unitCost: 35,
      marginPct: 0,
      taxPct: 5,
    })
  })

  it('tidies the unit, and sends an empty one for a line without a unit (the server stores that as none)', () => {
    const out = invoiceLineInputs({ billing_method: 'fixed', lines })
    expect(out.map((l) => l.uom)).toEqual(['Ea', 'M', ''])
  })

  it('marks the lines of a milestone invoice as milestone lines, and every other method as manual', () => {
    expect(
      invoiceLineInputs({ billing_method: 'milestone', lines }).every(
        (l) => l.sourceType === 'milestone',
      ),
    ).toBe(true)
    for (const method of ['fixed', 'time_material', 'percentage'] as const)
      expect(
        invoiceLineInputs({ billing_method: method, lines }).every(
          (l) => l.sourceType === 'manual',
        ),
      ).toBe(true)
  })

  it('defaults the tax to 0', () => {
    expect(invoiceLineInputs({ billing_method: 'fixed', lines })[1].taxPct).toBe(0)
  })
})
