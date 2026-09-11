import type { BadgeVariant } from '../components/ui/Badge'

// Ordered active statuses shown in the StatusBar (terminal states excluded)
export const PO_STATUSES = [
  { key: 'draft', label: 'Draft', sequence: 0 },
  { key: 'inventory_check', label: 'Inventory check', sequence: 1 },
  { key: 'store_pricing', label: 'Store pricing', sequence: 2 },
  { key: 'market_pricing', label: 'Market pricing', sequence: 3 },
  { key: 'price_verification', label: 'Price verification', sequence: 4 },
  { key: 'pending_approval', label: 'Pending approval', sequence: 5 },
  { key: 'approved', label: 'Approved', sequence: 6 },
  { key: 'ready_to_issue', label: 'Ready to issue', sequence: 7 },
  { key: 'items_bought', label: 'Items bought', sequence: 8 },
  { key: 'goods_received', label: 'Goods received', sequence: 9 },
  { key: 'finance_audit', label: 'Finance audit', sequence: 10 },
  { key: 'invoiced', label: 'Invoiced', sequence: 11 },
  { key: 'completed', label: 'Completed', sequence: 12 },
] as const

export type POStatus = (typeof PO_STATUSES)[number]['key'] | 'rejected' | 'cancelled' | 'deleted'

export const PO_TERMINAL_STATUSES = ['completed', 'rejected', 'cancelled', 'deleted'] as const

// G1 Phase 3 Milestone A — a per-vendor child PO (po.requisition_id set)
// shares the pre-'bought' sequence above but diverges from 'bought'
// onward: bought -> goods_received -> finance_review -> payment_pending ->
// closed. 'goods_received' is intentionally the same key as in
// PO_STATUSES (it's the same status in both vocabularies), so it's not
// repeated with a different label here. Added alongside PO_STATUSES
// rather than folding into it, since a single PO row is only ever in one
// vocabulary at a time — see getStatusesForPO below for the pick.
export const CHILD_PO_STATUSES = [
  ...PO_STATUSES.filter((s) => s.sequence <= 8), // draft .. items_bought
  { key: 'bought', label: 'Bought', sequence: 8.5 },
  { key: 'goods_received', label: 'Goods received', sequence: 9 },
  { key: 'finance_review', label: 'Finance review', sequence: 10 },
  { key: 'payment_pending', label: 'Payment pending', sequence: 11 },
  { key: 'closed', label: 'Closed', sequence: 12 },
] as const

export const CHILD_PO_TERMINAL_STATUSES = ['closed', 'rejected', 'cancelled', 'deleted'] as const

/** Picks the right ordered status list for a StatusBar, based on whether this PO is a G1 child. */
export function getStatusesForPO(po: { requisition_id?: string | null }): typeof PO_STATUSES | typeof CHILD_PO_STATUSES {
  return po.requisition_id ? CHILD_PO_STATUSES : PO_STATUSES
}

export const PO_POSITIONS = [
  {
    key: 'buyer',
    label: 'Buyer',
    description:
      'Ticks off PO lines as bought during the Items bought stage, once approved. Typically scoped by branch — the branch a PO belongs to determines whose buyer position applies.',
  },
  {
    key: 'store_keeper',
    label: 'Store Keeper',
    description:
      'Approves stock issuance (Store Out) and confirms Inventory Check (alongside the PO organizer).',
  },
  {
    key: 'store_pricing',
    label: 'Store Pricing',
    description: 'Enters internal stock pricing during the Store pricing stage.',
  },
  {
    key: 'procurement_officer',
    label: 'Procurement Officer',
    description: 'Adds vendor quotes during the Market pricing stage.',
  },
  {
    key: 'procurement_2nd',
    label: '2nd Procurement',
    description:
      'Cross-checks market prices and submits for approval during the Price verification stage.',
  },
  {
    key: 'po_admin',
    label: 'PO Admin',
    description:
      'Manages PO Position assignments company-wide. Project/department scope has no effect on this position — it always acts company-wide.',
  },
] as const

export type POPosition = (typeof PO_POSITIONS)[number]['key']

export const PO_STATUS_ACTIONS: Record<
  string,
  {
    label: string
    description: string
    requiredPosition?: string
    requiredRole?: string
    isOrganizer?: boolean
  }
> = {
  draft: {
    label: 'Submit for inventory check',
    description: 'The organizer submits the PO to verify stock availability',
    isOrganizer: true,
  },
  inventory_check: {
    label: 'Confirm inventory check',
    description:
      'The organizer or a Store Keeper confirms which items are available in stock',
    isOrganizer: true,
    requiredPosition: 'store_keeper',
  },
  store_pricing: {
    label: 'Submit store pricing',
    description: 'Store pricing adds internal prices for available items',
    requiredPosition: 'store_pricing',
  },
  market_pricing: {
    label: 'Submit market pricing',
    description: 'Procurement officer adds external vendor quotes',
    requiredPosition: 'procurement_officer',
  },
  price_verification: {
    label: 'Submit for approval',
    description: '2nd procurement cross-checks market prices and submits directly for approval',
    requiredPosition: 'procurement_2nd',
  },
  pending_approval: {
    label: 'Approve',
    description: 'Department head or admin approves the PO',
    requiredRole: 'dept_head_or_admin',
  },
  approved: {
    label: 'Record receipt',
    description: 'Record goods received — auto-transitions PO to goods_received',
    isOrganizer: true,
  },
  items_bought: {
    label: 'Mark items bought',
    description:
      'The assigned buyer ticks each line as bought and uploads the vendor receipt, then clicks Finish Buying to move the PO on to Goods Received.',
    requiredPosition: 'buyer',
  },
  ready_to_issue: {
    label: 'Issue stock',
    description:
      'Every line is fully covered from stock — the store keeper approves the issuance to complete the PO.',
    requiredPosition: 'store_keeper',
  },
  goods_received: {
    label: 'Record receipt / send to audit',
    description:
      'Organizer records the goods receipt, then sends the PO to finance for three-way match audit once every line is fully received.',
    isOrganizer: true,
  },
  finance_audit: {
    label: 'Audit lines / Pass or Fail audit',
    description:
      'Finance audits each line (qty, price). Pass → invoiced. Fail → back to goods_received.',
    requiredRole: 'finance',
  },
  invoiced: {
    label: 'Complete',
    description: 'Finance marks PO as completed after payment voucher is paid',
    requiredRole: 'finance',
  },
  // G1 Phase 3 Milestone A — child-vocabulary counterparts of the entries
  // above (bought instead of items_bought/approved, finance_review
  // instead of finance_audit, payment_pending instead of invoiced).
  bought: {
    label: 'Mark items bought',
    description:
      'The assigned buyer ticks each line as bought and uploads the vendor receipt, then clicks Finish Buying to move the PO on to Goods Received.',
    requiredPosition: 'buyer',
  },
  finance_review: {
    label: 'Audit lines / Pass or Fail audit',
    description:
      'Finance audits each line (qty, price). Pass → payment_pending. Fail → back to goods_received.',
    requiredRole: 'finance',
  },
  payment_pending: {
    label: 'Complete',
    description: 'Finance marks the child PO as closed after payment voucher is paid',
    requiredRole: 'finance',
  },
}

export function getPOStatusVariant(status: string): BadgeVariant {
  switch (status) {
    case 'draft':
      return 'neutral'
    case 'inventory_check':
      return 'info'
    case 'store_pricing':
      return 'info'
    case 'market_pricing':
      return 'info'
    case 'price_verification':
      return 'warning'
    case 'pending_approval':
      return 'warning'
    case 'approved':
      return 'accent'
    case 'ready_to_issue':
      return 'accent'
    case 'items_bought':
      return 'accent'
    case 'goods_received':
      return 'success'
    case 'finance_audit':
      return 'warning'
    case 'invoiced':
      return 'info'
    case 'completed':
      return 'success'
    case 'rejected':
      return 'danger'
    case 'cancelled':
      return 'neutral'
    case 'deleted':
      return 'danger'
    // G1 Phase 3 Milestone A — child vocabulary from 'bought' onward.
    case 'bought':
      return 'accent'
    case 'finance_review':
      return 'warning'
    case 'payment_pending':
      return 'info'
    case 'closed':
      return 'success'
    default:
      return 'neutral'
  }
}

export function getPOStatusLabel(status: string): string {
  const found = PO_STATUSES.find((s) => s.key === status) ?? CHILD_PO_STATUSES.find((s) => s.key === status)
  if (found) return found.label
  switch (status) {
    case 'rejected':
      return 'Rejected'
    case 'cancelled':
      return 'Cancelled'
    case 'deleted':
      return 'Deleted'
    default:
      return status.replace(/_/g, ' ')
  }
}
