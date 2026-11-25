// The status filter on a project's Procurement tab (Purchase Orders and Requisitions sections, playbook #126). Both lists are loaded
// whole, so the filter is the page's own: a person ticks one or more statuses and sees only those; ticking none shows everything.
// Pure functions, so one test file pins the rules and the two sections cannot drift.
import { REQUISITION_STATUSES } from './requisition-constants'
import { ALL_PO_STATUSES } from './po-constants'

export interface StatusOption {
  value: string
  label: string
  count: number
}

// The order the chips come in: the workflow, then the ways it can stop. `rejected` comes right after the live statuses so it is
// easy to find; a status this list does not know yet is put last, never dropped (a status added later must still be filterable).
const STOPPED = ['rejected', 'cancelled', 'deleted']
export const REQUISITION_STATUS_ORDER: string[] = [
  ...REQUISITION_STATUSES.map((s) => s.key),
  ...STOPPED,
]
export const PO_STATUS_ORDER: string[] = [...ALL_PO_STATUSES.map((s) => s.key), ...STOPPED]

/** One option per status that actually occurs in `rows`, with how many rows carry it, in `order` (unknown statuses last, by name). */
export function statusOptions<T>(
  rows: readonly T[],
  statusOf: (row: T) => string,
  order: readonly string[],
  labelOf: (status: string) => string,
): StatusOption[] {
  const counts = new Map<string, number>()
  for (const row of rows) {
    const s = statusOf(row)
    if (!s) continue
    counts.set(s, (counts.get(s) ?? 0) + 1)
  }
  const rank = (s: string) => {
    const i = order.indexOf(s)
    return i === -1 ? order.length : i
  }
  return [...counts.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([value, count]) => ({ value, label: labelOf(value), count }))
}

/**
 * The statuses that count as selected: the remembered selection minus any status no row carries any more (a filter kept from an
 * earlier visit must not hide everything because the last rejected one has since been reopened).
 */
export function effectiveSelection(
  selected: readonly string[],
  options: readonly StatusOption[],
): string[] {
  const present = new Set(options.map((o) => o.value))
  return selected.filter((s) => present.has(s))
}

/** Rows whose status is selected; nothing selected means no filter. */
export function filterByStatus<T>(
  rows: readonly T[],
  statusOf: (row: T) => string,
  selected: readonly string[],
): T[] {
  if (selected.length === 0) return [...rows]
  const wanted = new Set(selected)
  return rows.filter((r) => wanted.has(statusOf(r)))
}

/** Ticks a status that is off and unticks one that is on. */
export function toggleStatus(selected: readonly string[], value: string): string[] {
  return selected.includes(value) ? selected.filter((s) => s !== value) : [...selected, value]
}
