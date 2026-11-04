import { describe, it, expect } from 'vitest'
import { buildExpenseClaimHTML, type ExpenseClaimPrintData } from '../expenseClaimHtml'

const base: ExpenseClaimPrintData = {
  claimNumber: 'EXP-2026-0043',
  employeeName: 'Nadia',
  currencyCode: 'IQD',
  totalAmount: 35000,
  createdAt: '2026-03-04T00:00:00Z',
  lines: [
    { lineNumber: 1, expenseDate: '2026-03-03', description: 'Taxi', amount: 10000 },
    { lineNumber: 2, expenseDate: '2026-03-02', description: 'Diesel', amount: 20000 },
    // Line 3 was removed during an edit; the next line keeps the number it was given.
    { lineNumber: 4, expenseDate: '2026-03-01', description: 'Lunch', amount: 5000 },
  ],
}

// The grey first cell of each line row is the "#" column: a bare number in a cell.
const firstCells = (html: string): string[] =>
  [...html.matchAll(/font-size:12px;color:#888">(\d+)<\/td>/g)].map((m) => m[1])

describe('buildExpenseClaimHTML line numbers', () => {
  it('prints the stored line number, so a quoted "Line 4" matches the paper', () => {
    expect(firstCells(buildExpenseClaimHTML(base))).toEqual(['1', '2', '4'])
  })

  it('falls back to the position for a line without a stored number', () => {
    const html = buildExpenseClaimHTML({
      ...base,
      lines: base.lines.map((l) => ({ ...l, lineNumber: undefined })),
    })
    expect(firstCells(html)).toEqual(['1', '2', '3'])
  })
})
