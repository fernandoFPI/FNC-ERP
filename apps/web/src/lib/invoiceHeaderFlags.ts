// The fields of an invoice's printed header that an approver can flag when rejecting it (migration 314), in
// the order the header is printed. The keys are the CHECK constraint of project_invoice_header_flags.field
// (the projects service keeps its own copy, services/projects/src/lib/invoiceHeaderFlags.ts); a test pins
// this list to the migration, so a field added in one place and not the other fails.

export const INVOICE_HEADER_FLAG_FIELDS = [
  'invoice_date',
  'due_date',
  'invoice_number',
  'deliver_to_address',
  'bill_to_address',
  'client_contract_no',
  'job',
  'period_of_performance',
  'delivery_date',
  'reference',
] as const

export type InvoiceHeaderFlagField = (typeof INVOICE_HEADER_FLAG_FIELDS)[number]

/** The invoice as the page holds it: just the fields that make up the printed header. */
export interface InvoiceHeaderSource {
  invoiceDate?: string | null
  dueDate?: string | null
  invoiceNumber?: string | null
  deliverToAddress?: string | null
  billToAddress?: string | null
  clientContractNo?: string | null
  projectName?: string | null
  periodOfPerformance?: string | null
  deliveryDate?: string | null
  projectCode?: string | null
}

/** What the invoice currently says in that field (the approver reads this when deciding to flag it). */
export function invoiceHeaderValue(
  inv: InvoiceHeaderSource,
  field: InvoiceHeaderFlagField,
): string {
  const raw: Record<InvoiceHeaderFlagField, string | null | undefined> = {
    invoice_date: inv.invoiceDate,
    due_date: inv.dueDate,
    invoice_number: inv.invoiceNumber,
    deliver_to_address: inv.deliverToAddress,
    bill_to_address: inv.billToAddress,
    client_contract_no: inv.clientContractNo,
    job: inv.projectName,
    period_of_performance: inv.periodOfPerformance,
    delivery_date: inv.deliveryDate,
    reference: inv.projectCode,
  }
  const v = (raw[field] ?? '').trim()
  // Dates arrive as an ISO date or timestamp; show the day only.
  return field === 'invoice_date' || field === 'due_date' || field === 'delivery_date'
    ? v.slice(0, 10)
    : v
}
