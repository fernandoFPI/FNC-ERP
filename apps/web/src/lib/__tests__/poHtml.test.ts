import { describe, it, expect } from 'vitest'
import { buildPurchaseOrderHTML } from '../poHtml'

const baseData = {
  po_number: 'PO-FNC-2026-0047',
  status: 'Approved',
  priority: 'low',
  created_at: '2026-09-21',
  currency_code: 'USD',
  total_amount: 9276,
  subtotal: 9276,
  currencyTotals: [],
}

describe('buildPurchaseOrderHTML', () => {
  it('shows the Arabic product name under the description, not the description repeated', () => {
    const html = buildPurchaseOrderHTML({
      ...baseData,
      currencyTotals: [{ currency: 'USD', amount: 44 }],
      lines: [
        {
          description: 'Galvanized steel pipe, 2 mm thickness, 8x4 cm.',
          product_name: 'Galvanized steel pipe, 2 mm thickness, 8x4 cm.',
          product_name_ar: 'أنبوب حديد مجلفن',
          qty: 2,
          uom: 'EA',
          currency_code: 'USD',
          unit_price: 22,
          total: 44,
        },
      ],
    })
    expect(html.match(/Galvanized steel pipe, 2 mm thickness, 8x4 cm\./g)?.length).toBe(1)
    expect(html).toContain('أنبوب حديد مجلفن')
    expect(html).toContain('dir="rtl"')
  })

  it('omits the Arabic line entirely when the line has no Arabic name', () => {
    const html = buildPurchaseOrderHTML({
      ...baseData,
      currencyTotals: [{ currency: 'IQD', amount: 5.4 }],
      lines: [
        {
          description: 'Bolt 38 * 4.8mm',
          product_name: null,
          product_name_ar: null,
          qty: 3,
          uom: 'Package',
          currency_code: 'IQD',
          unit_price: 1.8,
          total: 5.4,
        },
      ],
    })
    expect(html).toContain('Bolt 38 * 4.8mm')
    expect(html).not.toContain('dir="rtl"')
  })

  it("prints each line in its own currency, not the PO header's currency_code", () => {
    const html = buildPurchaseOrderHTML({
      ...baseData,
      currency_code: 'IQD', // PO header currency — deliberately NOT what the line is priced in
      currencyTotals: [
        { currency: 'IQD', amount: 9276 },
        { currency: 'USD', amount: 44 },
      ],
      lines: [
        {
          description: 'Wood Without cover 16mm 244*122cm CODE(10)',
          product_name: null,
          product_name_ar: null,
          qty: 18,
          uom: 'EA.',
          currency_code: 'IQD',
          unit_price: 515.33,
          total: 9276,
        },
        {
          description: 'Galvanized steel pipe, 2 mm thickness, 8x4 cm.',
          product_name: null,
          product_name_ar: null,
          qty: 2,
          uom: 'EA',
          currency_code: 'USD',
          unit_price: 22,
          total: 44,
        },
      ],
    })
    // The USD line's unit price and total must print in USD, not silently
    // converted/relabeled to the PO's own IQD header currency.
    expect(html).toContain('22.00 USD')
    expect(html).toContain('44.00 USD')
    expect(html).toContain('9,276.00 IQD')
  })

  it('shows a per-currency total breakdown, never one figure blending both currencies', () => {
    const html = buildPurchaseOrderHTML({
      ...baseData,
      currency_code: 'IQD',
      currencyTotals: [
        { currency: 'IQD', amount: 9276 },
        { currency: 'USD', amount: 44 },
      ],
      lines: [],
    })
    expect(html).toContain('Total (IQD)')
    expect(html).toContain('9,276.00 IQD')
    expect(html).toContain('Total (USD)')
    expect(html).toContain('44.00 USD')
  })
})
