// What a project's page says about its purchase orders (playbook #92).
//
// The project query hands the page `recentPos`: one raw JSON object per PO ({ status, currency_code, total_amount,
// line_totals: [{ currency_code, amount }] }). Three things went wrong when the Overview read it:
//   * it looked for `totalAmount` / `amount`, but the real key is `total_amount`, so every amount was 0;
//   * it added every amount into one number labelled with the project's currency, although POs (and even one PO's lines)
//     can be in several currencies and nothing here is ever converted;
//   * a PO's HEADER total is one number in one currency: it is empty for some mixed POs and, on older ones, adds an IQD line
//     into a USD total (NY-PO-2026-0063). The lines are the truth, so money is read from `line_totals`.
// Everything the page needs from that list is here, so it can be tested without rendering a 36,000-line page.

import { getPOStatusLabel } from './po-constants'

/** Money per currency code. Never converted, never added across currencies. */
export type MoneyByCurrency = Record<string, number>

/** A PO as the project query returns it (raw JSON, snake_case). */
export interface ProjectPoLike {
  status?: unknown
  currency_code?: unknown
  total_amount?: unknown
  line_totals?: unknown
}

// Every status in purchase_orders_status_check belongs to exactly ONE of these three groups. A test reads that constraint
// (migration 258) and fails until a status added to it is placed here.
/** Before approval: the PO is still being prepared. */
export const BEFORE_APPROVAL_PO_STATUSES: readonly string[] = [
  'draft',
  'inventory_check',
  'store_pricing',
  'market_pricing',
  'price_verification',
  'pending_approval',
  'rejected',
]
/** Approved, and everything after it up to the end of the flow (the old end `completed`, the current end `closed`). */
export const APPROVED_OR_LATER_PO_STATUSES: readonly string[] = [
  'approved',
  'ready_to_issue',
  'items_bought',
  'bought',
  'goods_received',
  'finance_audit',
  'finance_review',
  'invoiced',
  'payment_pending',
  'completed',
  'closed',
]
/** Stopped for good: not part of the project's procurement any more. */
export const DEAD_PO_STATUSES: readonly string[] = ['cancelled', 'deleted']

/**
 * Mirror of FINISHED_PO_STATUSES in packages/db/src/poStatus.ts, which the server uses for every "open PO" count; a test
 * reads that file and fails if the two differ.
 */
export const FINISHED_PO_STATUSES: readonly string[] = [
  'completed',
  'closed',
  'cancelled',
  'deleted',
]

/** The order the Overview lists statuses in (the workflow's own order). */
const STATUS_ORDER: readonly string[] = [
  ...BEFORE_APPROVAL_PO_STATUSES,
  ...APPROVED_OR_LATER_PO_STATUSES,
]

const statusOf = (po: ProjectPoLike): string =>
  typeof po.status === 'string' ? po.status : 'draft'

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isFinite(n) ? n : 0
}

/** True when the PO still needs something (anything not finished): the same rule as the server's open-PO count. */
export function isOpenPo(po: ProjectPoLike): boolean {
  return !FINISHED_PO_STATUSES.includes(statusOf(po))
}

export function isApprovedOrLater(po: ProjectPoLike): boolean {
  return APPROVED_OR_LATER_PO_STATUSES.includes(statusOf(po))
}

export function isDeadPo(po: ProjectPoLike): boolean {
  return DEAD_PO_STATUSES.includes(statusOf(po))
}

/**
 * What a PO holds, per currency. From its lines when the server sent them. An answer without `line_totals` at all (an older
 * server) falls back to the header total in the header currency, and only when that total is a real number.
 */
export function poAmountsByCurrency(po: ProjectPoLike): MoneyByCurrency {
  const out: MoneyByCurrency = {}
  if (Array.isArray(po.line_totals)) {
    for (const entry of po.line_totals as { currency_code?: unknown; amount?: unknown }[]) {
      const ccy = typeof entry.currency_code === 'string' ? entry.currency_code : ''
      if (!ccy) continue
      out[ccy] = (out[ccy] ?? 0) + num(entry.amount)
    }
    return out
  }
  const ccy = typeof po.currency_code === 'string' ? po.currency_code : ''
  if (ccy && po.total_amount != null) out[ccy] = num(po.total_amount)
  return out
}

function addInto(target: MoneyByCurrency, add: MoneyByCurrency): void {
  for (const [ccy, amount] of Object.entries(add)) target[ccy] = (target[ccy] ?? 0) + amount
}

export interface PoStatusSummaryRow {
  status: string
  label: string
  count: number
  amounts: MoneyByCurrency
}

export interface PoSummary {
  rows: PoStatusSummaryRow[]
  /** Live POs (not cancelled or deleted): the total the footer shows. */
  total: number
  totals: MoneyByCurrency
}

/**
 * One row per status that has POs, in workflow order, with the money per currency. Cancelled and deleted POs are left out of
 * the rows AND of the total, so the rows always add up to the total (the Purchase Orders tab still lists every PO).
 */
export function summarisePosByStatus(pos: readonly ProjectPoLike[]): PoSummary {
  const byStatus = new Map<string, PoStatusSummaryRow>()
  const totals: MoneyByCurrency = {}
  let total = 0
  for (const po of pos) {
    if (isDeadPo(po)) continue
    const status = statusOf(po)
    let row = byStatus.get(status)
    if (!row) {
      row = { status, label: getPOStatusLabel(status), count: 0, amounts: {} }
      byStatus.set(status, row)
    }
    const amounts = poAmountsByCurrency(po)
    row.count += 1
    addInto(row.amounts, amounts)
    addInto(totals, amounts)
    total += 1
  }
  // known statuses in workflow order, then any status this list has never heard of (it still shows, never silently dropped)
  const known = STATUS_ORDER.filter((s) => byStatus.has(s))
  const unknown = [...byStatus.keys()].filter((s) => !STATUS_ORDER.includes(s))
  const rows = [...known, ...unknown].flatMap((s) => {
    const row = byStatus.get(s)
    return row ? [row] : []
  })
  return { rows, total, totals }
}

/** How many POs are approved or later and not cancelled. */
export function countApprovedOrLater(pos: readonly ProjectPoLike[]): number {
  return pos.filter(isApprovedOrLater).length
}

function sumInCurrency(pos: readonly ProjectPoLike[], currency: string): number {
  return pos.reduce((s, po) => s + (poAmountsByCurrency(po)[currency] ?? 0), 0)
}

/** What approved-or-later POs hold in ONE currency (their lines in that currency, whatever the PO header says). */
export function approvedOrLaterAmount(pos: readonly ProjectPoLike[], currency: string): number {
  return sumInCurrency(pos.filter(isApprovedOrLater), currency)
}

/** What POs waiting for approval hold in ONE currency. */
export function pendingApprovalAmount(pos: readonly ProjectPoLike[], currency: string): number {
  return sumInCurrency(
    pos.filter((po) => statusOf(po) === 'pending_approval'),
    currency,
  )
}

/** What one PO holds, one entry per currency that has money, for a list row (empty when there is nothing to show). */
export function poAmountLines(po: ProjectPoLike): { currency: string; amount: number }[] {
  const amounts = poAmountsByCurrency(po)
  return currenciesWithMoney(amounts).map((currency) => ({
    currency,
    amount: amounts[currency] ?? 0,
  }))
}

/** The currency codes of an amounts object that actually hold something, in a stable order. */
export function currenciesWithMoney(amounts: MoneyByCurrency): string[] {
  return Object.keys(amounts)
    .filter((c) => Math.abs(amounts[c] ?? 0) > 0)
    .sort()
}
