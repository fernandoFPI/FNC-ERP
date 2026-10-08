// Coarse workflow stages for the Procurement list pages and preview panel.
// Collapses the detailed status vocabularies (po-constants.ts,
// requisition-constants.ts) into a handful of user-facing stages. Display only —
// never used for permission or transition logic.

export interface StageInfo {
  /** Index of the stage the record is currently in; null for rejected/cancelled/unknown. */
  index: number | null
  /** True once the record has passed every stage (completed/closed). */
  complete: boolean
}

export const PO_STAGES = ['Draft', 'Approval', 'Vendor', 'Receiving', 'Invoice', 'Payment']

const PO_STAGE_BY_STATUS: Partial<Record<string, number>> = {
  draft: 0,
  inventory_check: 0,
  store_pricing: 0,
  market_pricing: 0,
  price_verification: 0,
  pending_approval: 1,
  approved: 2,
  ready_to_issue: 2,
  items_bought: 2,
  bought: 2,
  goods_received: 3,
  received: 3,
  finance_audit: 4,
  finance_review: 4,
  invoiced: 4,
  payment_pending: 5,
}

export function poStage(status: string): StageInfo {
  if (status === 'completed' || status === 'closed') return { index: null, complete: true }
  const index = PO_STAGE_BY_STATUS[status]
  return { index: index ?? null, complete: false }
}

export const REQUISITION_STAGES = ['Draft', 'Pricing', 'Approval', 'Buying', 'Sourcing']

const REQUISITION_STAGE_BY_STATUS: Partial<Record<string, number>> = {
  draft: 0,
  inventory_check: 1,
  store_pricing: 1,
  market_pricing: 1,
  price_verification: 1,
  pending_approval: 2,
  approved: 3,
  items_bought: 3,
  sourcing: 4,
}

export function requisitionStage(status: string): StageInfo {
  if (status === 'completed') return { index: null, complete: true }
  const index = REQUISITION_STAGE_BY_STATUS[status]
  return { index: index ?? null, complete: false }
}

/** Maps a stage index onto the 4-dot mini progress bar. */
export function miniReached(stage: StageInfo, stageCount: number): number | null {
  if (stage.complete) return 4
  if (stage.index === null) return null
  return Math.min(3, Math.floor((stage.index * 4) / stageCount))
}

export function stageLabel(stage: StageInfo, stages: string[]): string {
  if (stage.complete) return 'Complete'
  if (stage.index === null) return ''
  return stages[stage.index] ?? ''
}
