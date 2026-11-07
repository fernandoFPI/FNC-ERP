import type { PoolClient } from '@fnc-erp/db'

// The project cost of a PO line that was delivered straight to a jobsite (recordDirectDelivery), and what a
// price edit or a vendor return does to it. One place for every path that can change that cost, so they cannot
// drift (playbook #6, #23). Before this:
//   - the cost row said 'IQD' whatever the line's currency (a USD 9.00 line was booked as "9.00 IQD"),
//   - a price edited after delivery left the old price in the cost (3 units at 5.25 plus 9 at 1.75 = 31.50 for a
//     line now worth 21.00, which is what Finance would pay),
//   - a removed line left its cost behind,
//   - and an approved vendor return changed nothing at all.
//
// Money is computed in SQL, in the line's own currency, never converted (CLAUDE.md: no cross-currency conversion,
// fx_rate_to_base is dead). A delivery still ADDS its own cost at the price current at that moment, as it always did:
// the material-return flow prices returned goods from that accumulated cost. Only an approved price edit re-prices
// what was already delivered, because the PO line has one price and that edit is what Finance pays.

type Exec = Pick<PoolClient, 'query'>

/**
 * A delivery of `qty` units of a PO line adds qty x unit_price to the project cost of that line, in the line's own
 * currency. The caller has already checked the PO is a project PO delivered to the jobsite.
 */
export async function addDirectDeliveryCost(
  exec: Exec,
  poLineId: string,
  qty: number,
  entryDate: string,
): Promise<void> {
  await exec.query(
    `INSERT INTO project_cost_actuals (project_id, source_type, source_id, cost_category, amount, currency_code, entry_date)
     SELECT po.linked_project_id, 'po_direct_delivery', pl.id, 'materials',
            ROUND($2::numeric * pl.unit_price, 4), pl.currency_code, $3::date
     FROM po_lines pl JOIN purchase_orders po ON po.id = pl.po_id
     WHERE pl.id = $1 AND po.linked_project_id IS NOT NULL AND $2::numeric * pl.unit_price > 0
     ON CONFLICT (source_id) WHERE source_type = 'po_direct_delivery' AND source_id IS NOT NULL
     DO UPDATE SET amount = project_cost_actuals.amount + EXCLUDED.amount, currency_code = EXCLUDED.currency_code`,
    [poLineId, qty, entryDate],
  )
}

/**
 * After a price, quantity or currency edit on a line that was already delivered to the jobsite, its cost becomes
 * what was received at the new price (received qty x unit_price), in the line's currency. Only lines that already
 * carry a direct-delivery cost are touched, and only rows that were never converted (a handful of old rows were
 * booked at fx_rate_to_base into IQD; those are left exactly as they were). Safe to run twice.
 */
export async function repriceDirectDeliveryCost(exec: Exec, lineIds: string[]): Promise<void> {
  if (lineIds.length === 0) return
  await exec.query(
    `UPDATE project_cost_actuals pca
     SET amount = ROUND(pl.qty_received * pl.unit_price, 4), currency_code = pl.currency_code
     FROM po_lines pl
     WHERE pca.source_type = 'po_direct_delivery' AND pca.source_id = pl.id AND pl.id = ANY($1::uuid[])
       AND COALESCE(NULLIF(pl.fx_rate_to_base, 0), 1) = 1
       AND pl.qty_received * pl.unit_price > 0`,
    [lineIds],
  )
}

/** The cost rows of lines that are being deleted go with them (nothing else points at those rows). */
export async function dropDirectDeliveryCost(exec: Exec, lineIds: string[]): Promise<void> {
  if (lineIds.length === 0) return
  await exec.query(
    `DELETE FROM project_cost_actuals WHERE source_type = 'po_direct_delivery' AND source_id = ANY($1::uuid[])`,
    [lineIds],
  )
}

/**
 * An approved vendor return takes its value back off the project: one negative cost row per returned item
 * (source_type po_vendor_return, source_id = the return item), in the return's own currency. Only for items whose
 * line carries a direct-delivery cost: goods delivered to inventory cost the project nothing until a Store Out, so
 * there is nothing to take back here. The original cost row stays untouched (append-only, like material_return)
 * and the item's unique source_id makes running it twice a no-op. Returns how many rows it made.
 */
export async function offsetVendorReturnCost(exec: Exec, returnId: string): Promise<number> {
  const r = await exec.query(
    `INSERT INTO project_cost_actuals (project_id, source_type, source_id, cost_category, amount, currency_code, entry_date)
     SELECT po.linked_project_id, 'po_vendor_return', ri.id, 'materials', -ri.line_total, ret.currency_code, CURRENT_DATE
     FROM po_return_items ri
     JOIN po_returns ret ON ret.id = ri.return_id
     JOIN purchase_orders po ON po.id = ret.po_id
     WHERE ri.return_id = $1 AND ri.line_total > 0 AND po.linked_project_id IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM project_cost_actuals dd
         WHERE dd.source_type = 'po_direct_delivery' AND dd.source_id = ri.po_line_id
       )
     ON CONFLICT (source_id) WHERE source_type = 'po_vendor_return' AND source_id IS NOT NULL DO NOTHING`,
    [returnId],
  )
  return r.rowCount ?? 0
}
