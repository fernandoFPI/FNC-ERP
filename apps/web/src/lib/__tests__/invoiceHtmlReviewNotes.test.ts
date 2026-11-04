import { describe, it, expect } from 'vitest'
import { buildInvoiceHTML, type InvoiceRenderData } from '../invoiceHtml'

// The invoice page hands the builder the very invoice it got from GraphQL, which now also carries the
// internal review notes (a line's flag, the last rejection). The printed invoice and the PDF go to the
// client, so none of it may appear there. The builder only reads the fields it knows; this pins that.
describe('buildInvoiceHTML and the internal review notes', () => {
  it('prints no flag and no rejection reason, even when the invoice carries them', () => {
    const data = {
      invoiceNumber: 'NY-INV-2026-0005',
      status: 'draft',
      invoiceDate: '2026-03-01',
      dueDate: '2026-04-01',
      billingMethod: 'milestone',
      paymentTermsDays: 30,
      currencyCode: 'USD',
      paymentType: 'wire_transfer',
      projectCode: 'P-1',
      projectName: 'Tower',
      contractNumber: 'C-1',
      clientName: 'Acme',
      companyName: 'Co',
      companyLegalName: 'Co Ltd',
      companyCountry: 'IQ',
      grossTotal: 100,
      retentionAmount: 0,
      retentionPct: 0,
      netPayable: 100,
      // What the app really passes in, beyond the builder's own type.
      rejectionReason: 'INTERNAL-NOTE-REJECTED',
      rejectedByName: 'INTERNAL-APPROVER',
      headerFlags: [
        {
          field: 'bill_to_address',
          reason: 'INTERNAL-NOTE-HEADER',
          flaggedByName: 'INTERNAL-APPROVER',
        },
      ],
      lines: [
        {
          lineNumber: 1,
          description: 'Cement',
          qty: 1,
          unitCost: 100,
          subtotal: 100,
          marginPct: 0,
          marginAmount: 0,
          taxPct: 0,
          taxAmount: 0,
          lineTotal: 100,
          flagReason: 'INTERNAL-NOTE-FLAG',
          flaggedByName: 'INTERNAL-APPROVER',
        },
      ],
    } as unknown as InvoiceRenderData
    const html = buildInvoiceHTML(data)
    expect(html).toContain('Cement')
    expect(html).not.toContain('INTERNAL-NOTE')
    expect(html).not.toContain('INTERNAL-APPROVER')
  })
})
