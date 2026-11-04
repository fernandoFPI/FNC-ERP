// The fields of an invoice's printed header that an approver can flag when rejecting it (migration 314).
// The list is the CHECK constraint of project_invoice_header_flags.field; a test pins the two together, and
// the web keeps its own copy (apps/web/src/lib/invoiceHeaderFlags.ts), pinned to the migration the same way.

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

/** The labels printed on the invoice, for the rejection reason the server composes (backend text is English). */
export const INVOICE_HEADER_FLAG_LABELS: Record<InvoiceHeaderFlagField, string> = {
  invoice_date: 'Date of Issue',
  due_date: 'Due Date',
  invoice_number: 'Invoice No.',
  deliver_to_address: 'Deliver To',
  bill_to_address: 'Bill To',
  client_contract_no: 'Contract No.',
  job: 'Job',
  period_of_performance: 'Period of Performance',
  delivery_date: 'Date of Delivery',
  reference: 'Reference',
}
