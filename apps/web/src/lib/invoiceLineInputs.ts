import type { InvoiceBuilderResult } from '../components/ui/InvoiceBuilder'
import { cleanInvoiceUnit } from './invoiceUnits'

// What the create-invoice wizard hands over, as the `lines` of the createProjectInvoice mutation. A milestone invoice
// marks its lines as milestone lines; every other method creates manual lines. The unit goes out tidied the way the
// server tidies it (an empty one means "no unit").
export function invoiceLineInputs(result: Pick<InvoiceBuilderResult, 'billing_method' | 'lines'>) {
  return result.lines.map((l) => ({
    description: l.description,
    sourceType: result.billing_method === 'milestone' ? 'milestone' : 'manual',
    qty: l.quantity,
    uom: cleanInvoiceUnit(l.unit),
    unitCost: l.unit_price,
    marginPct: 0,
    taxPct: l.tax_pct ?? 0,
  }))
}
