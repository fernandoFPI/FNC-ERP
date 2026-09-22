import { describe, it, expect } from 'vitest'
import { buildRequisitionHTML } from '../requisitionHtml'

const baseData = {
  requisition_number: 'REQ-2026-0012',
  status: 'Pending Approval',
  priority: 'low',
  created_at: '2026-09-21',
  currencyTotals: [],
  fromStockTotals: [],
}

describe('buildRequisitionHTML', () => {
  it('shows the Arabic product name under the description, not the description repeated', () => {
    const html = buildRequisitionHTML({
      ...baseData,
      lines: [
        {
          description: 'Wood Without cover 16mm 244*122cm CODE(10)',
          product_name: 'Wood Without cover 16mm 244*122cm CODE(10)',
          product_name_ar: 'خشب بدون غطاء',
          qty: 18,
          uom: 'EA.',
          currency_code: 'IQD',
          unit_price: 0,
          total: 252,
        },
      ],
    })
    // The description/product name appears exactly once, not twice.
    expect(html.match(/Wood Without cover 16mm 244\*122cm CODE\(10\)/g)?.length).toBe(1)
    expect(html).toContain('خشب بدون غطاء')
    expect(html).toContain('dir="rtl"')
  })

  it('omits the Arabic line entirely when the line has no Arabic name', () => {
    const html = buildRequisitionHTML({
      ...baseData,
      lines: [
        {
          description: 'Thermal pad',
          product_name: null,
          product_name_ar: null,
          qty: 4,
          uom: 'pc',
          currency_code: 'IQD',
          unit_price: 0,
          total: 0,
        },
      ],
    })
    expect(html).toContain('Thermal pad')
    expect(html).not.toContain('dir="rtl"')
  })

  it('shows the store price (not 0.00) and a from-stock qty note for a fully-from-stock line', () => {
    const html = buildRequisitionHTML({
      ...baseData,
      lines: [
        {
          description: 'Wood Without cover 16mm 244*122cm CODE(10)',
          qty: 18,
          qty_from_stock: 18,
          uom: 'EA.',
          currency_code: 'IQD',
          unit_price: 0,
          total: 0,
          store_price: 14,
          store_price_currency: 'IQD',
          fromStock: { amount: 252, currency: 'IQD' },
        },
      ],
    })
    // Unit price shows the store price behind the total, not the unset
    // purchase price — "14.00 IQD", not "0.00 IQD".
    expect(html).toContain('14.00 IQD')
    expect(html).not.toContain('0.00 IQD')
    expect(html).toContain('18 EA. from stock')
    expect(html).toContain('252.00 IQD')
    expect(html).toContain('(from stock)')
  })

  it('shows both the purchased total and the from-stock portion for a partially-covered line', () => {
    const html = buildRequisitionHTML({
      ...baseData,
      lines: [
        {
          description: 'Bolt 38 * 4.8mm',
          qty: 10,
          qty_from_stock: 4,
          uom: 'Package',
          currency_code: 'IQD',
          unit_price: 5,
          total: 30, // 6 purchased * 5
          store_price: 1.8,
          store_price_currency: 'IQD',
          fromStock: { amount: 7.2, currency: 'IQD' }, // 4 from stock * 1.8
        },
      ],
    })
    // Previously this case showed only the purchased total, with no
    // indication anything came from stock at all.
    expect(html).toContain('4 Package from stock')
    expect(html).toContain('6 Package to buy')
    expect(html).toContain('30.00 IQD')
    expect(html).toContain('7.20 IQD')
    expect(html).toContain('(from stock)')
    // Unit price still reflects the purchase price for the bought portion.
    expect(html).toContain('5.00 IQD')
  })

  it('leaves a fully-purchased line (no stock coverage) unchanged', () => {
    const html = buildRequisitionHTML({
      ...baseData,
      currencyTotals: [{ currency: 'USD', amount: 44 }],
      lines: [
        {
          description: 'Galvanized steel pipe',
          qty: 2,
          qty_from_stock: 0,
          uom: 'EA',
          currency_code: 'USD',
          unit_price: 22,
          total: 44,
        },
      ],
    })
    expect(html).toContain('22.00 USD')
    expect(html).toContain('44.00 USD')
    expect(html).not.toContain('from stock')
  })
})
