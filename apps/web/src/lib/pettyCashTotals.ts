// The Petty Cash page's three summary cards (cash held, authorized, utilization).
//
// They used to add every float's balance into one number labelled IQD. A float has its own currency and nothing in this
// system is converted between currencies, so one USD float would have been added to the IQD ones and the sum called IQD
// (the same trap the Stock Balances page had, playbook #67). The figures are worked out per currency instead.

export interface FloatAmounts {
  currency_code: string
  current_balance: number | string
  authorized_limit: number | string
}

export interface CurrencyTotals {
  currency: string
  held: number
  authorized: number
  /** Share of the authorized amount already spent, 0 when nothing is authorized. */
  spentPct: number
}

/** One row per currency, alphabetical, summing every float in that currency and no other. */
export function totalsByCurrency(floats: readonly FloatAmounts[]): CurrencyTotals[] {
  const byCurrency = new Map<string, { held: number; authorized: number }>()
  for (const f of floats) {
    const sums = byCurrency.get(f.currency_code) ?? { held: 0, authorized: 0 }
    sums.held += Number(f.current_balance)
    sums.authorized += Number(f.authorized_limit)
    byCurrency.set(f.currency_code, sums)
  }
  return [...byCurrency.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, s]) => ({
      currency,
      held: s.held,
      authorized: s.authorized,
      spentPct: s.authorized > 0 ? Math.round((1 - s.held / s.authorized) * 100) : 0,
    }))
}
