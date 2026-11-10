// Withholding tax (WHT) on a project, for the new-RFQ / edit-project form and the project Overview.
//
// MIRROR of the server's rules (services/gateway/src/lib/projectWht.ts, migration 320). The server stores the
// settings and refuses a bad one; this only lets the form say so before it is sent and show the estimate while
// the Bid Price is typed. A test reads the server file and fails if the scenario list or the rounding differ.
//
//   tax = Bid Price x rate, rounded to four decimals (as an invoice does), where the Bid Price is taken as the
//   column stores it: two decimals.

export const PROJECT_WHT_SCENARIOS = ['client_withholds', 'fnc_pays'] as const
export type ProjectWhtScenario = (typeof PROJECT_WHT_SCENARIOS)[number]

/** What the invoice wizard starts at, so a project and its invoices agree out of the box. */
export const DEFAULT_WHT_RATE_PERCENT = '3'

/**
 * '3.25' -> 0.0325. `null` when the text is not a number from 0 to 100 with at most two decimals (the column keeps
 * four decimals of a fraction, which is two of a percent), so the form never sends a rate the server would refuse.
 */
export function whtRateFromPercent(text: string): number | null {
  const t = text.trim()
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null
  const pct = Number(t)
  if (pct > 100) return null
  return Math.round(pct * 100) / 10000
}

/** 0.0325 -> '3.25', 0.03 -> '3' (what goes in the rate box when a project is opened for editing). */
export function whtPercentText(rate: number): string {
  return String(Math.round(rate * 10000) / 100)
}

/** The estimate the form shows. `null` while there is no usable Bid Price or rate. */
export function estimateProjectWht(
  bidPrice: string | number | null | undefined,
  rate: number | null,
): number | null {
  if (
    rate === null ||
    bidPrice === null ||
    bidPrice === undefined ||
    String(bidPrice).trim() === ''
  )
    return null
  const price = Number(bidPrice)
  if (!Number.isFinite(price)) return null
  const stored = Math.round(price * 100) / 100
  return Math.round(stored * rate * 10000) / 10000
}
