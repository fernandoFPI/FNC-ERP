// The Overview's Financial Summary and "Purchase Orders: Value Ordered" cards (playbook #128, NY-PRJ-2026-0032): one column per
// currency, what is missing said in words instead of 0.00, and the cost booked shown under the total ordered.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import i18n from '../../../i18n'
import { ThemeProvider } from '../../../theme/ThemeContext'
import { buildFinancialSummary } from '../../../lib/projectFinancialSummary'
import { summarisePosByStatus } from '../../../lib/projectPoSummary'
import { ProjectFinancialSummaryCard } from '../ProjectFinancialSummaryCard'
import { ProjectPoSummaryCard } from '../ProjectPoSummaryCard'

const cost = [
  { currencyCode: 'USD', actualCosts: 15286.18, committedCosts: 0, budgetAmount: 0 },
  { currencyCode: 'IQD', actualCosts: 10229054.55, committedCosts: 0, budgetAmount: 0 },
]

const must = <T,>(v: T | null | undefined, what: string): T => {
  if (v === null || v === undefined) throw new Error(`missing: ${what}`)
  return v
}

function showSummary(entries: Record<string, unknown>[], completion: number) {
  const model = buildFinancialSummary(entries, completion, 'USD')
  return render(
    <ThemeProvider>
      <ProjectFinancialSummaryCard model={model} />
    </ThemeProvider>,
  )
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
})
afterEach(async () => {
  await i18n.changeLanguage('en')
})

describe('Financial Summary card', () => {
  it('has a column for each currency, so the IQD cost is on the Overview', () => {
    showSummary(cost, 0)
    expect(screen.getByTestId('fs-head-IQD').textContent).toBe('IQD')
    expect(screen.getByTestId('fs-head-USD').textContent).toBe('USD')
    expect(screen.getByTestId('fs-cell-cost-IQD').textContent).toBe('10,229,054.55')
    expect(screen.getByTestId('fs-cell-cost-USD').textContent).toBe('15,286.18')
    expect(screen.getByTestId('fs-cell-committed-IQD').textContent).toBe('0.00')
  })

  it('says what is missing instead of 0.00 for a project with no budget and no % complete', () => {
    showSummary(cost, 0)
    expect(screen.getByTestId('fs-missing-budget').textContent).toBe(
      'No budget set for this project',
    )
    expect(screen.getByTestId('fs-missing-remaining').textContent).toBe('Needs a budget')
    expect(screen.getByTestId('fs-missing-forecast').textContent).toBe('Needs % complete')
    expect(screen.getByTestId('fs-missing-profit').textContent).toBe(
      'Needs a budget and % complete',
    )
    // no zero stands in for them
    expect(screen.queryByTestId('fs-cell-forecast-USD')).toBeNull()
    expect(screen.queryByTestId('fs-cell-profit-USD')).toBeNull()
  })

  it('asks only for what is still missing', () => {
    showSummary([{ currencyCode: 'USD', actualCosts: 400, budgetAmount: 1000 }], 0)
    expect(screen.queryByTestId('fs-missing-budget')).toBeNull()
    expect(screen.queryByTestId('fs-missing-remaining')).toBeNull()
    expect(screen.getByTestId('fs-missing-forecast').textContent).toBe('Needs % complete')
    expect(screen.getByTestId('fs-missing-profit').textContent).toBe('Needs % complete')
  })

  it('shows forecast, profit and margin once there is a budget and a % complete', () => {
    showSummary(
      [{ currencyCode: 'USD', actualCosts: 400, committedCosts: 100, budgetAmount: 1000 }],
      50,
    )
    expect(screen.getByTestId('fs-cell-budget-USD').textContent).toBe('1,000.00')
    expect(screen.getByTestId('fs-cell-remaining-USD').textContent).toBe('500.00')
    expect(screen.getByTestId('fs-cell-forecast-USD').textContent).toBe('800.00')
    expect(screen.getByTestId('fs-cell-profit-USD').textContent).toBe('200.00 (20.0%)')
  })

  it('shows a dash, not a number, for a currency with no budget beside one that has a budget', () => {
    showSummary(
      [
        { currencyCode: 'USD', actualCosts: 400, budgetAmount: 1000 },
        { currencyCode: 'IQD', actualCosts: 5000, budgetAmount: 0 },
      ],
      50,
    )
    expect(screen.getByTestId('fs-cell-budget-IQD').textContent).toBe('—')
    expect(screen.getByTestId('fs-cell-remaining-IQD').textContent).toBe('—')
    expect(screen.getByTestId('fs-cell-profit-IQD').textContent).toBe('—')
    expect(screen.getByTestId('fs-cell-budget-USD').textContent).toBe('1,000.00')
  })

  it('colours a loss and an overspent budget as a problem, a profit as fine', () => {
    showSummary(
      [{ currencyCode: 'USD', actualCosts: 900, committedCosts: 300, budgetAmount: 1000 }],
      50,
    )
    const remaining = must(
      screen.getByTestId('fs-cell-remaining-USD').firstElementChild,
      'remaining span',
    )
    const profit = must(screen.getByTestId('fs-cell-profit-USD').firstElementChild, 'profit span')
    expect(remaining.textContent).toBe('-200.00')
    expect(profit.textContent).toBe('-800.00 (-80.0%)')
    expect(remaining.getAttribute('style')).toContain('color')
    const ok = showSummary([{ currencyCode: 'EUR', actualCosts: 100, budgetAmount: 1000 }], 50)
    const okProfit = must(
      within(ok.container).getByTestId('fs-cell-profit-EUR').firstElementChild,
      'ok profit span',
    )
    expect(okProfit.getAttribute('style')).not.toBe(profit.getAttribute('style'))
  })

  it('draws the store price row only when a currency has one', () => {
    showSummary(cost, 0)
    expect(screen.queryByTestId('fs-row-store')).toBeNull()
  })

  it('draws the store price row, dashing a currency without one', () => {
    showSummary(
      [
        { currencyCode: 'USD', actualCosts: 1, storeCosts: 12.5 },
        { currencyCode: 'IQD', actualCosts: 1, storeCosts: 0 },
      ],
      0,
    )
    expect(screen.getByTestId('fs-cell-store-USD').textContent).toBe('12.50')
    expect(screen.getByTestId('fs-cell-store-IQD').textContent).toBe('—')
  })

  it('explains each figure under its label and notes the currency columns only when there are several', () => {
    showSummary(cost, 0)
    expect(
      screen.getByText('Jobsite deliveries, stock issued, returns, posted journals'),
    ).toBeTruthy()
    expect(screen.getByText('Ordered and not yet received')).toBeTruthy()
    expect(screen.getByText('One column per currency')).toBeTruthy()
  })

  it('has no per-currency hint for a one-currency project', () => {
    showSummary([{ currencyCode: 'USD', actualCosts: 5 }], 0)
    expect(screen.queryByText('One column per currency')).toBeNull()
  })

  it('reads in Arabic with no raw key', async () => {
    await i18n.changeLanguage('ar')
    const { container } = showSummary(cost, 0)
    expect(container.textContent).not.toMatch(/proj\.detail\./)
    expect(screen.getByTestId('fs-missing-budget').textContent).toBe('لا توجد ميزانية لهذا المشروع')
  })
})

// a PO as the project query returns it: what its lines hold, one entry per line currency
const pos = [
  {
    status: 'closed',
    currency_code: 'USD',
    line_totals: [
      { currency_code: 'IQD', amount: 8916887.3 },
      { currency_code: 'USD', amount: 10169.69 },
    ],
  },
]

function showPos(opts: {
  rows?: ReturnType<typeof summarisePosByStatus>
  booked?: Record<string, number>
  onViewAll?: () => void
}) {
  const summary = opts.rows ?? summarisePosByStatus(pos as never)
  return render(
    <ThemeProvider>
      <ProjectPoSummaryCard
        summary={summary}
        booked={opts.booked ?? { IQD: 10229054.55, USD: 15286.18 }}
        onViewAll={opts.onViewAll ?? (() => undefined)}
      />
    </ThemeProvider>,
  )
}

describe('Purchase Orders: Value Ordered card', () => {
  it('has a column per currency with the ordered figures and "POs" for the count', () => {
    showPos({})
    expect(screen.getByTestId('po-head-IQD').textContent).toBe('IQD')
    expect(screen.getByTestId('po-head-USD').textContent).toBe('USD')
    expect(screen.getByText('POs')).toBeTruthy()
    expect(screen.queryByText('Qty')).toBeNull()
    expect(screen.getByTestId('po-cell-closed-IQD').textContent).toBe('8,916,887.30')
    expect(screen.getByTestId('po-cell-closed-USD').textContent).toBe('10,169.69')
  })

  it('totals what was ordered under the rows', () => {
    showPos({})
    const total = screen.getByTestId('po-row-total')
    expect(within(total).getByText('Total ordered')).toBeTruthy()
    expect(within(total).getByText('1')).toBeTruthy()
    expect(screen.getByTestId('po-cell-total-IQD').textContent).toBe('8,916,887.30')
    expect(screen.getByTestId('po-cell-total-USD').textContent).toBe('10,169.69')
  })

  it('puts the cost booked in the same currencies under the total ordered', () => {
    showPos({})
    const booked = screen.getByTestId('po-row-booked')
    expect(within(booked).getByText('Booked as project cost')).toBeTruthy()
    expect(within(booked).getByText('From the cost ledger')).toBeTruthy()
    expect(screen.getByTestId('po-cell-booked-IQD').textContent).toBe('10,229,054.55')
    expect(screen.getByTestId('po-cell-booked-USD').textContent).toBe('15,286.18')
  })

  it('draws no booked row when nothing is booked', () => {
    showPos({ booked: { IQD: 0, USD: 0 } })
    expect(screen.queryByTestId('po-row-booked')).toBeNull()
  })

  it('keeps a currency that has cost but no orders as a column, dashing its ordered cells', () => {
    showPos({ booked: { IQD: 10229054.55, USD: 15286.18, EUR: 40 } })
    expect(screen.getByTestId('po-head-EUR').textContent).toBe('EUR')
    expect(screen.getByTestId('po-cell-total-EUR').textContent).toBe('—')
    expect(screen.getByTestId('po-cell-booked-EUR').textContent).toBe('40.00')
  })

  it('explains why ordered and booked differ, in one note with a bold lead', () => {
    showPos({})
    const note = screen.getByTestId('po-summary-note')
    expect(note.textContent).toContain('Why the two differ.')
    expect(note.textContent).toContain('stock issued from the warehouse and expense claims')
    expect(must(note.querySelector('b'), 'bold lead').textContent).toBe('Why the two differ.')
  })

  it('says there are no purchase orders yet instead of drawing an empty table', () => {
    showPos({ rows: summarisePosByStatus([]), booked: {} })
    expect(screen.getByTestId('po-summary-empty').textContent).toBe('No purchase orders yet.')
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('leaves cancelled orders out of the rows and the total', () => {
    showPos({
      rows: summarisePosByStatus([
        ...pos,
        {
          status: 'cancelled',
          currency_code: 'USD',
          line_totals: [{ currency_code: 'USD', amount: 999 }],
        },
      ] as never),
    })
    expect(screen.queryByTestId('po-row-cancelled')).toBeNull()
    expect(screen.getByTestId('po-cell-total-USD').textContent).toBe('10,169.69')
  })

  it('opens the Procurement tab from View All', () => {
    const onViewAll = vi.fn()
    showPos({ onViewAll })
    fireEvent.click(screen.getByRole('button', { name: 'View All' }))
    expect(onViewAll).toHaveBeenCalledTimes(1)
  })

  it('reads in Arabic with no raw key', async () => {
    await i18n.changeLanguage('ar')
    const { container } = showPos({})
    expect(container.textContent).not.toMatch(/proj\.detail\./)
    expect(screen.getByTestId('po-summary-note').textContent).toContain('سبب الاختلاف')
  })
})
