// ProjectDetail.tsx is a 36,000-line page with no render harness, so what its Overview and header tiles do with purchase orders
// is pinned here at the source, next to the lib tests that prove the logic itself (lib/__tests__/projectPoSummary.test.ts).
// NY-PRJ-2026-0032 (playbook #92): the Overview PO Summary read `totalAmount ?? amount` (the data's key is `total_amount`, so
// every amount was 0), added every currency into one number, counted a cancelled PO in the total but not in the rows, and the
// header said "Remaining Budget -18,653.41 USD" and "Project is over budget" for a project with no budget at all.
//
// The checks are written as booleans with a message on purpose: `expect(src).toContain(...)` would print the whole 36,000-line
// file when it fails.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const src = fs.readFileSync(path.resolve(__dirname, '../ProjectDetail.tsx'), 'utf8')

const has = (text: string) => {
  expect(src.includes(text), `ProjectDetail.tsx should contain: ${text}`).toBe(true)
}
const hasNot = (re: RegExp) => {
  expect(re.test(src), `ProjectDetail.tsx should not match: ${String(re)}`).toBe(false)
}

describe('purchase orders on the project page', () => {
  it('no longer looks for the keys the data does not have', () => {
    hasNot(/\(po\)\.totalAmount/)
    hasNot(/\(po\)\.amount\b/)
    hasNot(/String\(po\.total_amount \?\? '—'\)/)
  })

  it('builds the PO Summary and the header tiles from lib/projectPoSummary (money per currency from the lines)', () => {
    has("from '../../../lib/projectPoSummary'")
    has('summarisePosByStatus(recentPos)')
    has('countApprovedOrLater(recentPos)')
    has('approvedOrLaterAmount(recentPos, hdrCcy)')
    has('pendingApprovalAmount(recentPos, hdrCcy)')
  })

  it('keeps no private list of PO statuses or colours for the summary any more', () => {
    hasNot(/const PO_ORDER\b/)
    hasNot(/const PO_LABELS\b/)
    hasNot(/const PO_DOT\b/)
    hasNot(/ovPoMap/)
  })

  it('shows the amounts of a PO per currency in the list, not the raw header total', () => {
    has('poAmountLines(po)')
  })

  it('does not label the PO summary amount column or its total with the project currency', () => {
    // only the PO summary block: the Financial Summary table elsewhere IS in the project currency and keeps its label
    const start = src.indexOf('const poSummaryColumns')
    const end = src.indexOf('const poSummaryFooter')
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    const block = src.slice(start, end)
    expect(
      block.includes('amount2'),
      'the PO summary amount column must not use the project-currency label',
    ).toBe(false)
    expect(
      block.includes('formatCurrency(row.amount, ovCcy)'),
      'a row amount must not be formatted in the project currency',
    ).toBe(false)
    expect(
      block.includes('renderPoAmounts(row.amounts)'),
      'rows render their money per currency',
    ).toBe(true)
    has('renderPoAmounts(poSummary.totals)')
  })
})

// playbook #95: the PO Summary card counts what was ORDERED on the project's closed POs, which is not the project's cost
// (goods delivered to inventory cost the project nothing until issued, Store Outs and expense claims never pass through these
// POs). The column said "Amount" and sat beside screens that show the cost ledger, so the two were read as one number.
describe('the PO summary says what it counts', () => {
  const block = () => {
    const start = src.indexOf('const poSummaryColumns')
    const end = src.indexOf('const poSummaryFooter')
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    return src.slice(start, end)
  }

  it('heads its money column "Ordered", in the header and in the custom header, not "Amount"', () => {
    const b = block()
    expect(
      b.split("t('proj.detail.poSummaryOrdered')").length - 1,
      'header and renderHeader both say Ordered',
    ).toBe(2)
    expect(
      b.includes("t('proj.detail.amount')"),
      'the generic Amount label is gone from this column',
    ).toBe(false)
  })

  it('draws one note under the table saying it is not the project cost', () => {
    has("t('proj.detail.poSummaryNote')")
    has('data-testid="po-summary-note"')
    // the note belongs to the PO Summary card: it comes after the table and before the Project Health card
    const note = src.indexOf("t('proj.detail.poSummaryNote')")
    const table = src.indexOf('footerRow={poSummaryFooter}')
    const health = src.indexOf("t('proj.detail.projectHealth')")
    expect(table).toBeGreaterThan(-1)
    expect(note).toBeGreaterThan(table)
    expect(health).toBeGreaterThan(note)
  })
})

describe('a project with no budget set', () => {
  it('the Remaining Budget tile says "No budget" instead of a negative number', () => {
    has('const hdrHasBudget = hdrBudget > 0')
    has("hdrHasBudget ? formatCurrency(hdrRemain, hdrCcy) : t('proj.detail.noBudget')")
  })

  it('the Overview Remaining Budget row says so too', () => {
    has('val: ovBudget > 0 ? ovRemaining : null')
    has("text: t('proj.detail.noBudget')")
  })

  it('"Project is over budget" needs a budget', () => {
    has('if (ovBudget > 0 && ovRemaining < 0) ovAlerts.push(')
    hasNot(/if \(ovRemaining < 0\) ovAlerts\.push/)
  })
})
