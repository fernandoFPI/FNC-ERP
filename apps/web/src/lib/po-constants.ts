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
      'Approves stock issuance (Store Out). Does not gate any purchase order stage — inventory check is confirmed by the PO organizer instead.',
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
    description: 'The organizer confirms which items are available in stock',
    isOrganizer: true,
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
      "The assigned buyer ticks each line as bought (tracking only). A receipt still needs to be recorded to move on to goods_received.",
    requiredPosition: 'buyer',
  },
  ready_to_issue: {
    label: 'Issue stock',
    description:
      'Every line is fully covered from stock — the store keeper approves the issuance to complete the PO.',
    requiredPosition: 'store_keeper',
  },
  goods_received: {
    label: 'Send to finance audit',
    description: 'Organizer sends PO to finance team for three-way match audit',
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
    default:
      return 'neutral'
  }
}

export function getPOStatusLabel(status: string): string {
  const found = PO_STATUSES.find((s) => s.key === status)
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
