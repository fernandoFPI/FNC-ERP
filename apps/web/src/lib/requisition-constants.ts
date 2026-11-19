import type { BadgeVariant } from '../components/ui/Badge'
import i18n from '../i18n'

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

// The ten statuses above grouped into the five phases the progress bar on the requisition page
// shows. The status names themselves (and their labels) are unchanged: a phase only says which
// stretch of the process a status belongs to. Every status sits in exactly one phase, in order;
// requisitionPhases.test.ts fails when a status is added to the list above and not placed here.
export const REQUISITION_PHASES = [
  { key: 'prepare', statuses: ['draft', 'inventory_check'] },
  { key: 'price', statuses: ['store_pricing', 'market_pricing', 'price_verification'] },
  { key: 'approve', statuses: ['pending_approval'] },
  { key: 'buy', statuses: ['approved', 'items_bought', 'sourcing'] },
  { key: 'done', statuses: ['completed'] },
] as const

// Direct supply is always tied to a project and skips inventory check and every pricing step (the Est. Unit Price
// typed at creation is the price), so its progress bar has no Price phase. The server (lib/directSupply.ts) is what
// keeps it out of those stages; this only says what to draw.
export const DIRECT_SUPPLY_PURPOSE = 'direct_supply'

export function requisitionPhasesFor(purpose: string | null | undefined) {
  return purpose === DIRECT_SUPPLY_PURPOSE
    ? REQUISITION_PHASES.filter((p) => p.key !== 'price')
    : REQUISITION_PHASES
}

const REQUISITION_PHASE_LABELS: Record<string, string> = {
  prepare: 'Prepare',
  price: 'Price',
  approve: 'Approve',
  buy: 'Buy',
  done: 'Done',
}

export function getRequisitionPhaseLabel(key: string): string {
  return i18n.t(`req.phase.${key}`, { defaultValue: REQUISITION_PHASE_LABELS[key] ?? key })
}

// The action names the approval log carries (requisition_approval_log.action) as the sentence the Log
// tab's timeline shows. A name that is not listed (an older or a newer action) shows its own words, so
// the timeline never drops an entry. The names stay English internally; only the sentence is translated.
const REQUISITION_LOG_ACTION_LABELS: Record<string, string> = {
  submit_to_inventory_check: 'Submitted for inventory check',
  submit_direct_supply: 'Submitted for approval',
  confirm_inventory_check: 'Confirmed the inventory check',
  submit_to_market_pricing: 'Submitted store pricing',
  submit_to_price_verification: 'Submitted market pricing',
  submit_for_approval: 'Verified the prices and sent for approval',
  reject_verification_to_market_pricing: 'Sent back to market pricing',
  reject_verification_to_store_pricing: 'Sent back to store pricing',
  reject_verification_to_inventory_check: 'Sent back to inventory check',
  reject_to_inventory_check: 'Sent back to inventory check',
  reject_to_market_pricing: 'Sent back to market pricing',
  reset_to_draft: 'Reset to draft',
  approve: 'Approved',
  approved: 'Approved',
  reject: 'Rejected',
  start_buying: 'Started buying',
  skip_buying: 'Skipped buying',
  finish_buying: 'Finished buying, purchase orders created',
  complete: 'Completed',
  cancel: 'Cancelled',
  delete: 'Deleted',
  edit_applied: 'Edit applied',
  edit_approved: 'Edit approved',
  edit_rejected: 'Edit rejected',
}

export function getRequisitionLogActionLabel(action: string): string {
  return i18n.t(`req.logAction.${action}`, {
    defaultValue: REQUISITION_LOG_ACTION_LABELS[action] ?? action.replace(/_/g, ' '),
  })
}

export type RequisitionLogTone = 'success' | 'danger' | 'info'

// The colour of an entry's dot on the timeline, decided from the action's name (never from its
// translated sentence, which differs by language).
export function getRequisitionLogActionTone(action: string): RequisitionLogTone {
  if (
    ['approve', 'approved', 'complete', 'finish_buying', 'edit_approved', 'edit_applied'].includes(
      action,
    )
  )
    return 'success'
  if (action.startsWith('reject') || ['cancel', 'delete', 'edit_rejected'].includes(action))
    return 'danger'
  return 'info'
}

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
  const fallback = (() => {
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
  })()
  return i18n.t(`req.status.${status}`, { defaultValue: fallback })
}

export const REQUISITION_PRIORITY_LABELS: Record<string, string> = {
  low: 'Low',
  high: 'High',
  emergency: 'Emergency',
}

export function getRequisitionPriorityLabel(priority: string): string {
  return i18n.t(`req.priority.${priority}`, {
    defaultValue: REQUISITION_PRIORITY_LABELS[priority] ?? priority,
  })
}

// G1 Phase 3 Milestone A screen 5 — mirrors po-constants.ts's
// PO_STATUS_ACTIONS exactly (same shape, same purpose: label a queue row
// by the action waiting on it and who can take it), scoped to the
// requisition's own pre-sourcing stages.
export const REQUISITION_STATUS_ACTIONS: Record<
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
    description: 'The organizer submits the requisition to verify stock availability',
    isOrganizer: true,
  },
  inventory_check: {
    label: 'Confirm inventory check',
    description: 'A Store Keeper confirms which items are available in stock',
    requiredPosition: 'store_keeper',
  },
  store_pricing: {
    label: 'Submit store pricing',
    description: 'Store pricing adds internal prices for available items',
    requiredPosition: 'store_pricing',
  },
  market_pricing: {
    label: 'Submit market pricing',
    description: 'Procurement officer adds checked vendor quotes',
    requiredPosition: 'procurement_officer',
  },
  price_verification: {
    label: 'Submit for approval',
    description: 'Procurement 2nd cross-checks market prices and submits directly for approval',
    requiredPosition: 'procurement_2nd',
  },
  pending_approval: {
    label: 'Approve',
    description: 'Department head or admin approves the requisition',
    requiredRole: 'dept_head_or_admin',
  },
  items_bought: {
    label: 'Record purchases',
    description: 'The assigned buyer records each purchase, per vendor, with its receipt',
    requiredPosition: 'buyer',
  },
}
