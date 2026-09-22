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
}

describe('buildPurchaseOrderHTML', () => {
  it('shows the Arabic product name under the description, not the description repeated', () => {
    const html = buildPurchaseOrderHTML({
      ...baseData,
      lines: [
        {
          description: 'Galvanized steel pipe, 2 mm thickness, 8x4 cm.',
          product_name: 'Galvanized steel pipe, 2 mm thickness, 8x4 cm.',
          product_name_ar: 'أنبوب حديد مجلفن',
          qty: 2,
          uom: 'EA',
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
      lines: [
        {
          description: 'Bolt 38 * 4.8mm',
          product_name: null,
          product_name_ar: null,
          qty: 3,
          uom: 'Package',
          unit_price: 1.8,
          total: 5.4,
        },
      ],
    })
    expect(html).toContain('Bolt 38 * 4.8mm')
    expect(html).not.toContain('dir="rtl"')
  })
})
