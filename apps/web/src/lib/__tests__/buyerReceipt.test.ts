// hasBuyerReceipt mirrors confirmReceipt's acceptance rule (gateway resolvers.ts):
// a G1 child PO's per-purchase receipt counts regardless of category, a direct
// PO attachment only counts as category 'po_receipt_document', and the PO page's
// unrelated "Delivery Photos" uploader (category 'attachment') never counts.
import { describe, it, expect } from 'vitest'
import { hasBuyerReceipt } from '../buyerReceipt'

describe('hasBuyerReceipt', () => {
  it('is false when there are no attachments, or the list has not loaded', () => {
    expect(hasBuyerReceipt([])).toBe(false)
    expect(hasBuyerReceipt(undefined)).toBe(false)
    expect(hasBuyerReceipt(null)).toBe(false)
  })

  it('counts a receipt the buyer attached to a purchase while sourcing, whatever its category', () => {
    expect(
      hasBuyerReceipt([{ sourceEntityType: 'po_line_purchase', file: { category: 'attachment' } }]),
    ).toBe(true)
  })

  it('counts a receipt attached straight to the PO in the receipt-document category', () => {
    expect(
      hasBuyerReceipt([
        { sourceEntityType: 'purchase_order', file: { category: 'po_receipt_document' } },
      ]),
    ).toBe(true)
  })

  it('does not count a Delivery Photo (category attachment) on the PO itself', () => {
    expect(
      hasBuyerReceipt([{ sourceEntityType: 'purchase_order', file: { category: 'attachment' } }]),
    ).toBe(false)
  })

  it('finds a receipt among unrelated attachments, and tolerates empty rows', () => {
    expect(
      hasBuyerReceipt([
        null,
        { sourceEntityType: 'purchase_order', file: { category: 'attachment' } },
        { file: null },
        { sourceEntityType: 'po_line_purchase', file: { category: 'attachment' } },
      ]),
    ).toBe(true)
  })
})
