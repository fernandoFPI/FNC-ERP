// Small rules for the employee Performance tab. Everything the server sends is a count; the rates and the wording of a time are decided
// here, in one place, so a tile and the table beside it cannot disagree.

/** The periods the server accepts, as the tab offers them. `null` is all time. Pinned to the server's list by a test. */
export const PERFORMANCE_PERIODS: readonly {
  days: number | null
  key: 'p30' | 'p90' | 'p365' | 'pAll'
}[] = [
  { days: 30, key: 'p30' },
  { days: 90, key: 'p90' },
  { days: 365, key: 'p365' },
  { days: null, key: 'pAll' },
]
export const DEFAULT_PERFORMANCE_DAYS = 90

/** A share as a whole percent, or null when there is nothing to divide by (a rate over zero things is not 0 %). */
export function ratePercent(part: number, total: number): number | null {
  if (!(total > 0)) return null
  return Math.round((part * 100) / total)
}

/** "33%" or an em dash. */
export function rateText(part: number, total: number): string {
  const r = ratePercent(part, total)
  return r === null ? '—' : `${r}%`
}

/** Hours as a person would say them: under two days in hours, then in days. Null is a dash for the caller to draw. */
export function waitText(
  hours: number | null | undefined,
): { unit: 'hours' | 'days'; value: number } | null {
  if (hours === null || hours === undefined || !Number.isFinite(hours) || hours < 0) return null
  if (hours < 48) return { unit: 'hours', value: Math.max(Math.round(hours * 10) / 10, 0) }
  return { unit: 'days', value: Math.round((hours / 24) * 10) / 10 }
}

interface ApproverRow {
  key: string
  approved: number
  sentBack: number
  medianHours: number | null
}

/** The kind of decision this person makes most, for the "median time to answer" tile. Null when they decide nothing. */
export function busiestApproverKind(rows: ApproverRow[]): ApproverRow | null {
  let best: ApproverRow | null = null
  for (const r of rows) {
    if (r.medianHours === null) continue
    if (best === null || r.approved + r.sentBack > best.approved + best.sentBack) best = r
  }
  return best
}

/** The longest bar's value, never below 1 so an all-zero list draws empty bars instead of dividing by zero. */
export function barMax(counts: number[]): number {
  return Math.max(1, ...counts)
}
