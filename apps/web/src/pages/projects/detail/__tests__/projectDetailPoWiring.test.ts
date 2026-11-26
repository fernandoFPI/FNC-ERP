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

  it('draws the PO summary through its own card, which shows money per currency and never the project currency alone', () => {
    // the card itself is tested in components/projects/__tests__/ProjectOverviewMoneyCards.test.tsx
    has('<ProjectPoSummaryCard')
    has('summary={poSummary}')
    hasNot(/const poSummaryColumns/)
    hasNot(/const poSummaryFooter/)
    hasNot(/renderPoAmounts/)
  })
})

// playbook #128: the Overview's two money cards are components with one column per currency (the page keeps no table of its own),
// the PO card gets the cost booked under the total ordered from the same per-currency figures as the Financial Summary.
describe('the Overview money cards', () => {
  const overview = () => {
    const start = src.indexOf('// ── overview-local computations')
    const end = src.indexOf("t('proj.detail.projectHealth')")
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    return src.slice(start, end)
  }

  it('builds the Financial Summary from every currency of the project cost summary, not the header currency alone', () => {
    const b = overview()
    // compared without whitespace and trailing commas, so a formatter re-wrapping the call does not fail the pin
    const squash = (s: string) => s.replace(/[\s]+/g, '').replace(/,\)/g, ')')
    expect(
      squash(b).includes('buildFinancialSummary(costSummaryArr,p.overallCompletionPct,ovCcy)'),
      'the summary is built from every currency of the cost summary',
    ).toBe(true)
    expect(b.includes('<ProjectFinancialSummaryCard model={financialModel} />')).toBe(true)
    expect(b.includes('const financialSummaryRows'), 'no inline single-currency table').toBe(false)
  })

  it('gives the PO card the cost booked per currency, taken from the Financial Summary columns', () => {
    const b = overview()
    expect(b.includes('financialModel.columns.map((c) => [c.currency, c.actual])')).toBe(true)
    expect(b.includes('booked={bookedByCurrency}')).toBe(true)
  })

  it('opens the Procurement tab from the PO card', () => {
    const b = overview()
    const at = b.indexOf('<ProjectPoSummaryCard')
    expect(at).toBeGreaterThan(-1)
    expect(b.slice(at, at + 400).includes("setTab('procurement')")).toBe(true)
  })

  it('draws no per-currency cost cards of its own (they were tried and taken off)', () => {
    expect(src.includes('ProjectCostSummaryCards')).toBe(false)
  })
})

describe('a project with no budget set', () => {
  it('the Remaining Budget tile says "No budget" instead of a negative number', () => {
    has('const hdrHasBudget = hdrBudget > 0')
    has("hdrHasBudget ? formatCurrency(hdrRemain, hdrCcy) : t('proj.detail.noBudget')")
  })

  it('"Project is over budget" needs a budget', () => {
    has('if (ovBudget > 0 && ovRemaining < 0) ovAlerts.push(')
    hasNot(/if \(ovRemaining < 0\) ovAlerts\.push/)
  })
})
