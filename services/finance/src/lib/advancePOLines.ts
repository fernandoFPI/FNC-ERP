// Which purchase-order lines an employee advance can settle, and how the settlement journal treats the project.
//
// A PO funded by an employee advance posts nothing when it is completed (completePO / postPOCompletionJournal return
// early for it): its lines queue for settlement against the advance, and settling books the expense per line.
// Two things in that path had drifted from the flow that has been in use since the requisition split (G1):
//
// 1. STATUS. The queue and the bundle-and-settle path only accepted POs with status 'completed'. A child PO of the
//    current flow closes as 'closed' (completePO: payment_pending -> closed; the old 'invoiced' -> 'completed' is
//    kept), so an advance-funded PO of the current flow could never be settled. Both statuses are settleable.
//
// 2. PROJECT COST. A settlement journal line carries the project's analytic account, and trg_sync_project_costs copies
//    every posted line with an analytic account into project_cost_actuals. A line whose cost is already on the project
//    through the current flow would be charged to the project a second time: a jobsite delivery books its cost when
//    the goods arrive (source_type 'po_direct_delivery', source_id = the PO line), and a PO delivered to inventory
//    reaches the project through a Store Out. Such a line is settled with its GL account and cost center only; the
//    project tag is kept for every other line (older POs, where the settlement is the only place the cost is booked).

/** A PO is settleable once it is finished: 'completed' (old flow) or 'closed' (child PO of the requisition split). */
export const SETTLEABLE_PO_STATUSES = ['completed', 'closed'] as const

/**
 * SQL boolean (needs `po` = purchase_orders and `pl` = po_lines in scope): the project's cost for this line is already
 * on the project, or will arrive through a Store Out, so the settlement journal must not tag the project again.
 */
export const PROJECT_COST_ALREADY_BOOKED_SQL = `(
  po.delivery_destination = 'inventory'
  OR EXISTS (
    SELECT 1 FROM project_cost_actuals pca
     WHERE pca.source_type = 'po_direct_delivery' AND pca.source_id = pl.id
  )
)`
