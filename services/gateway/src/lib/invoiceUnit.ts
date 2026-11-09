// The unit of measure on a project invoice line (migration 318): Ea, M, Lot, Roll, Set, Box, ...
//
// The web offers a list but the server accepts any short text, so there is one rule here and no second copy of the
// list to drift (the same trap as lib/contractBilling.ts): trim it, collapse inner spaces, nothing is stored as an empty
// string (NULL means "no unit"), and it has to fit the column.

export const INVOICE_UNIT_MAX_LENGTH = 20

/**
 * `undefined` means "the caller said nothing" and is for the caller to handle (keep what is stored). Anything given is
 * returned cleaned: a string with text in it, or `null` for "no unit". Throws a plain message for what cannot be stored.
 */
export function normalizeInvoiceUnit(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') throw new Error('Unit must be text')
  const cleaned = value.replace(/\s+/g, ' ').trim()
  if (cleaned === '') return null
  if (cleaned.length > INVOICE_UNIT_MAX_LENGTH)
    throw new Error(`Unit must be ${INVOICE_UNIT_MAX_LENGTH} characters or fewer`)
  return cleaned
}
