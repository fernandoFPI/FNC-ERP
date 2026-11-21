// Who may change a requisition or a purchase order once it is approved (playbook #112): the screen's mirror of the server's rule
// (services/gateway/src/lib/poEditApproval.ts). Before approval the people who work on the document edit it and the edit applies at once.
// After approval only an administrator may change it or even ask for a change; an employee, the organizer included, cannot.
// The server is the authority and refuses anyone else; this only decides what the page offers, so nobody is shown a button that is refused.
// A test pins every list below to the server file, so the two cannot drift.

/** The roles that count as an administrator for edit requests: the ones that could already approve or reject one. */
export const EDIT_ADMIN_ROLES = ['system_admin', 'company_admin', 'module_admin'] as const

export function isEditAdminRole(role: string | null | undefined): boolean {
  return (EDIT_ADMIN_ROLES as readonly string[]).includes(role ?? '')
}

/** Requisition statuses where an edit applies at once (before approval). Anything else needs an administrator. */
export const REQUISITION_STATUSES_BEFORE_APPROVAL: readonly string[] = [
  'draft',
  'inventory_check',
  'store_pricing',
  'market_pricing',
  'price_verification',
  'pending_approval',
  'rejected',
  'deleted',
]

/** Purchase order statuses where an edit applies at once (before approval). Anything else needs an administrator. */
export const PO_STATUSES_BEFORE_APPROVAL: readonly string[] = [
  'draft',
  'inventory_check',
  'store_pricing',
  'market_pricing',
  'price_verification',
  'pending_approval',
  'rejected',
  'deleted',
]

/** True once the requisition is past approval, so only an administrator may change it. An unknown status counts as approved (safe by default). */
export function requisitionNeedsAdminToChange(status: string): boolean {
  return !REQUISITION_STATUSES_BEFORE_APPROVAL.includes(status)
}

/** The same for a purchase order. */
export function poNeedsAdminToChange(status: string): boolean {
  return !PO_STATUSES_BEFORE_APPROVAL.includes(status)
}
