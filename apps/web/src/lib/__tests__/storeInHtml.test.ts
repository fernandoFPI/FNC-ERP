import { describe, it, expect } from 'vitest'
import { buildStoreInHTML } from '../storeInHtml'

const baseLine = {
  productName: 'Widget',
  sku: 'WID-1',
  qtyReceived: 2,
  uom: 'pc',
}

function print(overrides: Parameters<typeof buildStoreInHTML>[0]) {
  return buildStoreInHTML(overrides)
}

describe('buildStoreInHTML', () => {
  it('shows the per-line total in that line\'s own currency, not the base currency', () => {
    const html = print({
      receiptNumber: 'RCPT-1',
      receiptDate: '2026-09-17',
      baseCurrencyCode: 'IQD',
      lines: [{ ...baseLine, unitPrice: 6, currencyCode: 'USD', fxRateToBase: 1546 }],
    })
    // 2 * 6 = 12, in USD — not 2 * 6 * 1546 = 18,552 IQD. The bottom overall
    // Total legitimately still shows the converted 18,552.00 IQD figure
    // (see the next test) — this is specifically about the per-line cell.
    expect(html).toContain('12.00 USD')
  })

  it('still converts the overall bottom Total to the base currency, summed across lines', () => {
    const html = print({
      receiptNumber: 'RCPT-2',
      receiptDate: '2026-09-17',
      baseCurrencyCode: 'IQD',
      lines: [
        { ...baseLine, unitPrice: 6, currencyCode: 'USD', fxRateToBase: 1546 },
        { ...baseLine, qtyReceived: 1, unitPrice: 1000, currencyCode: 'IQD', fxRateToBase: 1 },
      ],
    })
    // (2 * 6 * 1546) + (1 * 1000 * 1) = 18552 + 1000 = 19552
    expect(html).toContain('19,552.00 IQD')
  })

  it('falls back to the base currency for a line with no currency of its own', () => {
    const html = print({
      receiptNumber: 'RCPT-3',
      receiptDate: '2026-09-17',
      baseCurrencyCode: 'IQD',
      lines: [{ ...baseLine, unitPrice: 500, currencyCode: null, fxRateToBase: null }],
    })
    expect(html).toContain('1,000.00 IQD')
  })
})
