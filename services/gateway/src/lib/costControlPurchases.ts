// What the Cost Control tab counts from procurement.
//
// The tab used to be a separate planning ledger (cost codes, manually entered commitments, labor and equipment logs) and
// never looked at where a project's real purchases are recorded: `project_cost_actuals`, read through
// `v_project_cost_by_currency` (migration 304: posted journals plus stock issues and direct deliveries, one row per
// currency). On NY-PRJ-2026-0032 every tile read 0 while the project header showed 550.50 USD and 8.9 million IQD, and the
// "Sync PO" button found nothing because it still looked for the statuses that existed before the requisition split.
//
// Two rules, both per currency (nothing is ever converted):
//  - ACTUAL includes the ledger cost of the selected currency (`costControlCategoryForLedger` puts each row in one of the
//    tab's categories).
//  - COMMITTED from a purchase order is what was ordered and has NOT yet been received: for each line
//    `qty_ordered - qty_from_stock - qty_received`, never below zero, at the price paid (or quoted). A line that is
//    received is already actual (delivered to the jobsite) or is stock (cost reaches the project when it is issued), so
//    counting it as committed too would charge the project twice. A line covered from stock was never bought.

/** Statuses of a purchase order that can still hold something ordered and not received. Before approval nothing is
 *  committed; once completed or closed everything is settled. */
export const COMMITTED_PO_STATUSES = [
  'approved',
  'items_bought',
  'bought',
  'goods_received',
  'finance_audit',
  'finance_review',
  'invoiced',
  'payment_pending',
] as const

export type CostControlCategory =
  | 'labor'
  | 'material'
  | 'equipment'
  | 'subcontract'
  | 'overhead'
  | 'contingency'
  | 'other'

/** The tab's category for a ledger row. The ledger says `materials` (plural); a row with no category is `other`. */
export function costControlCategoryForLedger(
  category: string | null | undefined,
): CostControlCategory {
  switch ((category ?? '').trim().toLowerCase()) {
    case 'materials':
    case 'material':
      return 'material'
    case 'labor':
    case 'labour':
      return 'labor'
    case 'equipment':
    case 'equipment_rental':
      return 'equipment'
    case 'subcontract':
      return 'subcontract'
    case 'overhead':
      return 'overhead'
    case 'contingency':
      return 'contingency'
    default:
      return 'other'
  }
}

export interface POCommitmentRow {
  po_id: string
  po_number: string
  vendor_name: string | null
  created_at: string
  currency_code: string
  /** Money in SQL (numeric), two decimals, as text. */
  remaining: string
}

/** `(text, params) => rows`: the shared `query` helper, or a transaction client wrapped the same way. */
export type RunQuery = (text: string, params: unknown[]) => Promise<{ rows: unknown[] }>

/**
 * One row per (purchase order, line currency) with something still ordered and not received, for a project of the given
 * company. Scoped to the company on the purchase order itself and on its vendor.
 */
export async function projectPOCommitments(
  run: RunQuery,
  projectId: string,
  companyId: string,
): Promise<POCommitmentRow[]> {
  const r = await run(
    `SELECT po.id AS po_id, po.po_number, v.name AS vendor_name, po.created_at, pl.currency_code,
            ROUND(SUM(GREATEST(pl.qty_ordered - COALESCE(pl.qty_from_stock, 0) - COALESCE(pl.qty_received, 0), 0)
                      * COALESCE(pl.actual_unit_price, pl.unit_price, 0)), 2)::text AS remaining
       FROM purchase_orders po
       JOIN po_lines pl ON pl.po_id = po.id
       LEFT JOIN vendors v ON v.id = po.vendor_id AND v.company_id = po.company_id
      WHERE po.project_id = $1 AND po.company_id = $2 AND po.status = ANY($3::text[])
      GROUP BY po.id, po.po_number, v.name, po.created_at, pl.currency_code
     HAVING SUM(GREATEST(pl.qty_ordered - COALESCE(pl.qty_from_stock, 0) - COALESCE(pl.qty_received, 0), 0)
                * COALESCE(pl.actual_unit_price, pl.unit_price, 0)) > 0
      ORDER BY po.created_at, po.po_number, pl.currency_code`,
    [projectId, companyId, [...COMMITTED_PO_STATUSES]],
  )
  return r.rows as POCommitmentRow[]
}
