// The unit of measure on an invoice line (migration 318): Ea, M, Lot, Roll, Set, Box, ...
//
// The list is what the pickers offer. The server accepts any text up to 20 characters (services/gateway/src/lib/
// invoiceUnit.ts), so a unit somebody typed, or one that came from an older record, is still valid: this list is only
// a convenience and is not checked against anywhere.

export const INVOICE_UNITS = [
  'Ea',
  'M',
  'Lot',
  'Roll',
  'Set',
  'Box',
  'Kg',
  'L',
  'Pack',
  'Pair',
  'Day',
] as const

// A new line starts as Ea (each). Lines that existed before the Unit column have none and are not guessed at.
export const DEFAULT_INVOICE_UNIT = 'Ea'

// Same as the column and as the server's check.
export const INVOICE_UNIT_MAX_LENGTH = 20

/** What gets sent: the unit tidied the way the server tidies it; an empty one means "no unit". */
export function cleanInvoiceUnit(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim()
}

/** What is shown where there may be no unit: the unit, or a dash. */
export function invoiceUnitText(value: string | null | undefined): string {
  const unit = cleanInvoiceUnit(value)
  return unit === '' ? '—' : unit
}
