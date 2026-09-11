import type { BadgeVariant } from '../components/ui/Badge'

// Requisition's own status vocabulary (packages/db/migrations/258_g1_requisition_split_phase1.sql) —
// distinct from PurchaseOrder's (po-constants.ts). A requisition never
// reaches a vendor-specific stage itself; it forks per-vendor child POs at
// Finish Buying and then tracks them from 'sourcing' until every line is
// resolved.
export const REQUISITION_STATUSES = [
  { key: 'draft', label: 'Draft', sequence: 0 },
  { key: 'inventory_check', label: 'Inventory check', sequence: 1 },
  { key: 'store_pricing', label: 'Store pricing', sequence: 2 },
  { key: 'market_pricing', label: 'Market pricing', sequence: 3 },
  { key: 'price_verification', label: 'Price verification', sequence: 4 },
  { key: 'pending_approval', label: 'Pending approval', sequence: 5 },
  { key: 'approved', label: 'Approved', sequence: 6 },
  { key: 'items_bought', label: 'Items bought', sequence: 7 },
  { key: 'sourcing', label: 'Sourcing', sequence: 8 },
  { key: 'completed', label: 'Completed', sequence: 9 },
] as const

export const REQUISITION_TERMINAL_STATUSES = ['completed', 'rejected', 'cancelled', 'deleted'] as const

export function getRequisitionStatusVariant(status: string): BadgeVariant {
  switch (status) {
    case 'draft':
      return 'neutral'
    case 'inventory_check':
    case 'store_pricing':
    case 'market_pricing':
      return 'info'
    case 'price_verification':
    case 'pending_approval':
      return 'warning'
    case 'approved':
    case 'items_bought':
      return 'accent'
    case 'sourcing':
      return 'accent'
    case 'completed':
      return 'success'
    case 'rejected':
    case 'deleted':
      return 'danger'
    case 'cancelled':
      return 'neutral'
    default:
      return 'neutral'
  }
}

export function getRequisitionStatusLabel(status: string): string {
  const found = REQUISITION_STATUSES.find((s) => s.key === status)
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

export const REQUISITION_PRIORITY_LABELS: Record<string, string> = {
  low: 'Low',
  high: 'High',
  emergency: 'Emergency',
}
