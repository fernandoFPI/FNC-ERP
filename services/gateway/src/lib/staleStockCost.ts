import { query } from '@fnc-erp/db'

// Stale stock cost (playbook #111).
//
// A requisition line covered from stock gets its store price from the product's own Cost (`products.standard_cost`): the Inventory Check
// copies it onto the line and moves on, no person types it. If that Cost has not been touched for more than a month, the store keeper is
// asked to double-check it before the project is charged at it (a Store Out charges the product's Cost when it is confirmed).
//
// The AGE of a Cost is the number of whole days since the newest of
//   - its last real change (`product_cost_history`; a save that changes nothing logs nothing),
//   - the last time a store keeper confirmed it as still right (`products.cost_confirmed_at`, migration 328),
//   - and, for a product with neither, the day it was created.
// ONE definition, used by the line reader (the highlight), the notification and the confirm button, so they cannot drift.

/** More than this many days without a change or a confirmation, and a from-stock line is flagged. */
export const STOCK_COST_STALE_DAYS = 30

/**
 * The requisition stages in which a from-stock line's store price can still matter: from the inventory check until the requisition
 * completes (its Store Outs may still be unconfirmed until then, and confirming one charges the project). An ALLOW-list on purpose: a
 * status added later is not flagged until somebody decides it should be (a flag on a finished requisition would only age for ever).
 * `lib/__tests__`-style guard: `tests/stale-stock-cost.test.ts` reads every status from the CHECK constraint and fails until a new one is classified.
 */
export const STOCK_COST_WATCH_STATUSES = [
  'inventory_check',
  'store_pricing',
  'market_pricing',
  'price_verification',
  'pending_approval',
  'approved',
  'items_bought',
  // the organizer review sits between Items Bought and Sourcing; its from-stock Store Outs are still unconfirmed (migration 329)
  'organizer_review',
  'review_approval',
  'sourcing',
] as const

/** Statuses that are deliberately NOT watched (draft has no stock quantities yet; the rest are finished or stopped). */
export const STOCK_COST_UNWATCHED_STATUSES = [
  'draft',
  'completed',
  'rejected',
  'cancelled',
  'deleted',
] as const

const WATCH_LIST_SQL = STOCK_COST_WATCH_STATUSES.map((s) => `'${s}'`).join(', ')

/**
 * SQL: whole days since the product's Cost was last touched, NULL when the line has no product. `productAlias` is the alias of the
 * `products` row in the caller's query. GREATEST ignores NULLs, so a product with no history and no confirmation falls back to its
 * creation date. All inputs are constants of this file, never user input.
 */
export function costAgeDaysSql(productAlias = 'p'): string {
  const p = productAlias
  return `(CASE WHEN ${p}.id IS NULL THEN NULL ELSE FLOOR(EXTRACT(EPOCH FROM (NOW() - COALESCE(
      GREATEST((SELECT MAX(h.changed_at) FROM product_cost_history h WHERE h.product_id = ${p}.id), ${p}.cost_confirmed_at),
      ${p}.created_at))) / 86400)::int END)`
}

/**
 * SQL: is the Cost behind this line old, while the requisition is in a watched stage? Whether the line is actually covered from stock is
 * the reader's question: at the Inventory Check the quantity is still being typed (it is saved only when the check is confirmed), so the
 * screen combines this flag with the quantity it holds, and the notification adds `qty_from_stock > 0` itself.
 */
export function costStaleSql(productAlias: string, requisitionStatusSql: string): string {
  return `COALESCE(${costAgeDaysSql(productAlias)} > ${STOCK_COST_STALE_DAYS} AND ${requisitionStatusSql} IN (${WATCH_LIST_SQL}), false)`
}

export interface StaleStockCostLine {
  line_id: string
  product_id: string
  sku: string | null
  product_name: string | null
  age_days: number
}

/**
 * The lines of a requisition that ARE covered from stock (a saved quantity above 0) and whose product Cost is older than the limit.
 * One row per product (the same item on two lines is one thing to check). Scoped to the requisition's own company.
 */
export async function staleStockCostLines(
  requisitionId: string,
  companyId: string,
): Promise<StaleStockCostLine[]> {
  const r = await query<StaleStockCostLine>(
    `SELECT DISTINCT ON (pol.product_id)
            pol.id AS line_id, pol.product_id, p.sku, p.name AS product_name, ${costAgeDaysSql('p')} AS age_days
       FROM po_lines pol
       JOIN requisitions req ON req.id = pol.requisition_id
       JOIN products p ON p.id = pol.product_id
      WHERE pol.requisition_id = $1 AND req.company_id = $2
        AND COALESCE(pol.qty_from_stock, 0) > 0
        AND req.status IN (${WATCH_LIST_SQL})
        AND ${costAgeDaysSql('p')} > ${STOCK_COST_STALE_DAYS}
      ORDER BY pol.product_id, pol.line_number`,
    [requisitionId, companyId],
  )
  return r.rows.map((x) => ({ ...x, age_days: Number(x.age_days) }))
}

/** The in-app / email notice for the store keepers: names the items and says what to do. Bounded so a long list stays one readable sentence. */
export function staleStockCostNotice(
  lines: readonly StaleStockCostLine[],
  requisitionNumber?: string | null,
): { title: string; body: string } {
  const shown = lines
    .slice(0, 5)
    .map((l) => `${l.sku ?? l.product_name ?? 'item'} (${l.age_days} days)`)
  const more = lines.length > shown.length ? ` and ${lines.length - shown.length} more` : ''
  const noun = lines.length === 1 ? 'item drawn from stock has' : 'items drawn from stock have'
  const ref = requisitionNumber ? ` on ${requisitionNumber}` : ''
  return {
    title: 'Double-check a store price',
    body: `${lines.length} ${noun} a cost that has not changed for over ${STOCK_COST_STALE_DAYS} days${ref}: ${shown.join(', ')}${more}. Double-check the store price, then press Price confirmed on the requisition.`,
  }
}
