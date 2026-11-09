// The unit list the pickers offer on an invoice line (lib/invoiceUnits.ts, migration 318). The server takes any text up
// to 20 characters, so this list is a convenience and nothing is checked against it; what matters is that it is the one
// the client asked for, in that order, that it fits the column, and that the helpers tidy a unit the way the server does.
import { describe, it, expect } from 'vitest'
import {
  DEFAULT_INVOICE_UNIT,
  INVOICE_UNITS,
  INVOICE_UNIT_MAX_LENGTH,
  cleanInvoiceUnit,
  invoiceUnitText,
} from '../invoiceUnits'

describe('INVOICE_UNITS', () => {
  it('starts with the six units the client named, in their order, then the common ones', () => {
    expect([...INVOICE_UNITS]).toEqual([
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
    ])
  })

  it('has no duplicates and every unit fits the database column', () => {
    expect(new Set(INVOICE_UNITS).size).toBe(INVOICE_UNITS.length)
    for (const u of INVOICE_UNITS) expect(u.length, u).toBeLessThanOrEqual(INVOICE_UNIT_MAX_LENGTH)
  })

  it('a new line starts as Ea, which is in the list', () => {
    expect(DEFAULT_INVOICE_UNIT).toBe('Ea')
    expect(INVOICE_UNITS).toContain(DEFAULT_INVOICE_UNIT)
  })

  it('uses the same length limit as the column (20)', () => {
    expect(INVOICE_UNIT_MAX_LENGTH).toBe(20)
  })
})

describe('cleanInvoiceUnit', () => {
  it('trims and collapses inner spaces, and turns nothing into an empty string', () => {
    expect(cleanInvoiceUnit('  Roll ')).toBe('Roll')
    expect(cleanInvoiceUnit('Man   Day')).toBe('Man Day')
    expect(cleanInvoiceUnit('   ')).toBe('')
    expect(cleanInvoiceUnit('')).toBe('')
    expect(cleanInvoiceUnit(null)).toBe('')
    expect(cleanInvoiceUnit(undefined)).toBe('')
  })
})

describe('invoiceUnitText', () => {
  it('shows the unit, or a dash for a line that has none', () => {
    expect(invoiceUnitText('Box')).toBe('Box')
    expect(invoiceUnitText(' M ')).toBe('M')
    expect(invoiceUnitText('')).toBe('—')
    expect(invoiceUnitText('  ')).toBe('—')
    expect(invoiceUnitText(null)).toBe('—')
    expect(invoiceUnitText(undefined)).toBe('—')
  })
})
