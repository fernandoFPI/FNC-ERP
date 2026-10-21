import type { POStatus } from '@fnc-erp/workflow'

// Whether an edit request on a purchase order needs an admin's approval, or is
// applied straight away (and recorded as an auto-approved request).
//
// This is an ALLOW-list of the statuses where an edit applies immediately: the
// ones before the PO is approved. Anything not named here needs approval, so a
// status added later is safe by default.
//
// It used to be the reverse, a list of post-approval statuses that needed approval
// and "everything else" auto-applied. It was written before the requisition-split
// child POs existed, so their statuses (bought, finance_review, payment_pending,
// closed) were missing from it and edits to a child PO in Finance review, quantities
// and prices included, applied with no admin review (12 edits on 10 POs, Oct 2026;
// playbook entry 33).
//
//  - A child PO is created already at 'bought' (Finish Buying forks it with its
//    buying done), so it never has a pre-approval stage and always needs approval.
//  - 'ready_to_issue' needs approval: 100%-stock-covered POs reach it by skipping
//    'approved', and that transition is itself their approval.
//  - 'cancelled' needs approval even though it is reachable from both pre- and
//    post-approval statuses: the current status alone can't tell them apart, so this
//    errs toward review rather than silently editing a PO that had been approved
//    before it was cancelled.
//  - 'rejected' and 'deleted' keep auto-applying, as they always have.
export const AUTO_APPLY_PO_STATUSES: readonly POStatus[] = [
  'draft',
  'inventory_check',
  'store_pricing',
  'market_pricing',
  'price_verification',
  'pending_approval',
  'rejected',
  'deleted',
]

export function poEditNeedsApproval(status: string): boolean {
  return !(AUTO_APPLY_PO_STATUSES as readonly string[]).includes(status)
}
