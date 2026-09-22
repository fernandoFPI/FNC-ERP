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
})
