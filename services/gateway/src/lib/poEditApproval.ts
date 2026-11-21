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

// ── Who may change a document once it is approved (playbook #112) ────────────────────────────────────────────────────
//
// Before approval, the people who work on a requisition or PO edit it and the edit applies at once (above). AFTER approval only an
// administrator may change it, and only through the edit request flow (file, then approve): an employee can neither edit nor ask.
// One rule, used by the submit resolver for both documents, so the two cannot drift and the screens' gates mirror one list.

/** Who counts as an administrator for edit requests: the roles that could already approve or reject one. */
export const EDIT_ADMIN_ROLES = ['system_admin', 'company_admin', 'module_admin'] as const

export function isEditAdminRole(role: string | null | undefined): boolean {
  return (EDIT_ADMIN_ROLES as readonly string[]).includes(role ?? '')
}

/**
 * The requisition statuses where an edit applies at once: the ones before approval. An ALLOW-list for the same reason as the PO one above:
 * it used to be a deny-list of the post-approval statuses (`POST_APPROVAL_REQUISITION_STATUSES`), so a status added later would have
 * been editable by anyone by omission. The statuses are the requisitions CHECK constraint; a test fails until a new one is classified.
 *  - 'rejected' and 'deleted' keep applying at once, as they always have.
 *  - 'cancelled' needs approval even though it can be reached before approval, for the same reason as a cancelled PO.
 */
export const AUTO_APPLY_REQUISITION_STATUSES: readonly string[] = [
  'draft',
  'inventory_check',
  'store_pricing',
  'market_pricing',
  'price_verification',
  'pending_approval',
  'rejected',
  'deleted',
]

export function requisitionEditNeedsApproval(status: string): boolean {
  return !AUTO_APPLY_REQUISITION_STATUSES.includes(status)
}

/** What a non-administrator is told when they try to change an approved document. */
export function approvedEditRefusal(kind: 'requisition' | 'purchase order'): string {
  return `Only an administrator can change an approved ${kind}. Ask an administrator to make the change.`
}
