// Which purchase orders are still "open", in ONE place (playbook #92).
//
// Several screens and gates asked "is this PO still open?" with their own copy of `status NOT IN ('completed','deleted')`.
// That list dates from before the requisition split (G1): a child PO of the current flow ends as `closed`, never
// `completed`, so every finished PO counted as open. On NY-PRJ-2026-0032 that made all 22 closed POs "Pending" and
// "Committed" (17,802.91 USD), and it still blocks cancelling a project and the REST project completion.
//
// A PO is finished when it will never need anything again:
//   completed   the old flow's end
//   closed      the current flow's end (payment_pending -> closed)
//   cancelled   stopped
//   deleted     removed
// `rejected` is NOT finished: it can be reopened to draft (packages/workflow: rejected -> draft), so it still needs a person.
//
// This is a deny-list of the finished statuses, so a status nobody classified counts as open (visible, never silently
// hidden). A test reads purchase_orders_status_check and fails until a status added there is classified here.

/** Statuses a purchase order never leaves, or leaves only to be ignored. */
export const FINISHED_PO_STATUSES = ['completed', 'closed', 'cancelled', 'deleted'] as const

/**
 * The same list as a SQL tuple, for `status NOT IN ${FINISHED_PO_STATUSES_SQL}`. It is built from the constant above, never
 * from input, so it is safe to put in a query text.
 */
export const FINISHED_PO_STATUSES_SQL = `(${FINISHED_PO_STATUSES.map((s) => `'${s}'`).join(',')})`

/** True when the purchase order still needs something (anything not finished). */
export function isOpenPOStatus(status: string): boolean {
  return !(FINISHED_PO_STATUSES as readonly string[]).includes(status)
}
