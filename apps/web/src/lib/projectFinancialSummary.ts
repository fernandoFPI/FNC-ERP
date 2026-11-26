// The figures of the project Overview's Financial Summary card, one column per currency (playbook #128).
//
// The card used to read ONE currency's entry of `costSummary` (the project's header currency), so a project with cost in two
// currencies never showed the other one, and it printed 0.00 for figures that cannot be worked out (a forecast with no % complete,
// a profit with no budget). Nothing is converted or added across currencies: each currency is its own column. A figure that cannot be
// worked out is `null`, and the card says what is missing instead of showing a zero.

export interface CostSummaryEntry {
  currencyCode?: unknown
  actualCosts?: unknown
  committedCosts?: unknown
  storeCosts?: unknown
  budgetAmount?: unknown
  budgetRemaining?: unknown
}

export interface FinancialColumn {
  currency: string
  /** null: no budget set in this currency */
  budget: number | null
  /** cost booked so far (the project's cost ledger in this currency) */
  actual: number
  /** ordered and not yet received */
  committed: number
  /** part of committed that is the store price of stock-covered lines */
  store: number
  /** null without a budget */
  remaining: number | null
  /** null without a % complete */
  forecast: number | null
  /** budget minus forecast, null without both */
  profit: number | null
  /** profit as a percentage of the budget, null whenever profit is */
  margin: number | null
}

export interface FinancialSummaryModel {
  columns: FinancialColumn[]
  /** at least one currency has a budget */
  hasBudget: boolean
  /** the project has a % complete above zero */
  hasCompletion: boolean
  /** at least one currency has a store price inside its committed figure */
  hasStore: boolean
}

function num(v: unknown): number {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

const round2 = (n: number): number => Math.round(n * 100) / 100

export function buildFinancialSummary(
  entries: readonly CostSummaryEntry[],
  completionPct: number | null | undefined,
  fallbackCurrency: string,
): FinancialSummaryModel {
  const completion = Number(completionPct ?? 0)
  const hasCompletion = Number.isFinite(completion) && completion > 0
  const byCurrency = new Map<string, CostSummaryEntry>()
  for (const e of entries) {
    const code = String(e.currencyCode ?? '').trim()
    if (code && !byCurrency.has(code)) byCurrency.set(code, e)
  }
  // a project with no entries at all still shows one (empty) column, in the header currency
  if (byCurrency.size === 0) byCurrency.set(fallbackCurrency, {})

  const columns: FinancialColumn[] = [...byCurrency.keys()].sort().map((currency) => {
    const e = byCurrency.get(currency) ?? {}
    const budgetValue = num(e.budgetAmount)
    const budget = budgetValue > 0 ? budgetValue : null
    const actual = num(e.actualCosts)
    const committed = num(e.committedCosts)
    const remaining =
      budget === null
        ? null
        : e.budgetRemaining === null || e.budgetRemaining === undefined
          ? budget - actual - committed
          : num(e.budgetRemaining)
    const forecast = hasCompletion ? round2(actual / (completion / 100)) : null
    const profit = budget !== null && forecast !== null ? round2(budget - forecast) : null
    const margin = profit !== null && budget !== null ? (profit / budget) * 100 : null
    return {
      currency,
      budget,
      actual,
      committed,
      store: num(e.storeCosts),
      remaining,
      forecast,
      profit,
      margin,
    }
  })

  return {
    columns,
    hasBudget: columns.some((c) => c.budget !== null),
    hasCompletion,
    hasStore: columns.some((c) => c.store > 0),
  }
}
