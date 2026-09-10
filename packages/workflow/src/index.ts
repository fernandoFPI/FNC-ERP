export class WorkflowError extends Error {
  constructor(
    message: string,
    public readonly currentStatus: string,
    public readonly action: string,
  ) {
    super(message)
    this.name = 'WorkflowError'
  }
}

interface Transition<TStatus extends string, TAction extends string> {
  from: TStatus | TStatus[]
  to: TStatus
  action: TAction
  guards?: ((context: unknown) => boolean | Promise<boolean>)[]
}

interface StateMachineConfig<TStatus extends string, TAction extends string> {
  initial: TStatus
  transitions: Transition<TStatus, TAction>[]
}

export class StateMachine<TStatus extends string, TAction extends string> {
  private readonly config: StateMachineConfig<TStatus, TAction>

  constructor(config: StateMachineConfig<TStatus, TAction>) {
    this.config = config
  }

  allowedActions(currentStatus: TStatus): TAction[] {
    return this.config.transitions
      .filter((t) => {
        const froms = Array.isArray(t.from) ? t.from : [t.from]
        return froms.includes(currentStatus)
      })
      .map((t) => t.action)
  }

  canTransition(currentStatus: TStatus, action: TAction): boolean {
    return this.config.transitions.some((t) => {
      const froms = Array.isArray(t.from) ? t.from : [t.from]
      return froms.includes(currentStatus) && t.action === action
    })
  }

  async transition(currentStatus: TStatus, action: TAction, context?: unknown): Promise<TStatus> {
    const transition = this.config.transitions.find((t) => {
      const froms = Array.isArray(t.from) ? t.from : [t.from]
      return froms.includes(currentStatus) && t.action === action
    })

    if (!transition) {
      throw new WorkflowError(
        `Action '${action}' is not allowed from status '${currentStatus}'. Allowed: [${this.allowedActions(currentStatus).join(', ')}]`,
        currentStatus,
        action,
      )
    }

    if (transition.guards) {
      for (const guard of transition.guards) {
        const passed = await guard(context)
        if (!passed) {
          throw new WorkflowError(
            `Guard condition failed for action '${action}' from status '${currentStatus}'`,
            currentStatus,
            action,
          )
        }
      }
    }

    return transition.to
  }
}

// ── Project State Machine ──────────────────────────────────────────────────

export type ProjectStatus =
  | 'pending'
  | 'ongoing'
  | 'submitted'
  | 'approved'
  | 'completed'
  | 'cancelled'
  | 'cancelled_after_approval'
  | 'on_hold'

export type ProjectAction =
  | 'start'
  | 'submit_to_team'
  | 'cancel'
  | 'hold'
  | 'submit'
  | 'resume'
  | 'approve'
  | 'approve_rfq'
  | 'reject_back'
  | 'reject_rfq'
  | 'complete'
  | 'cancel_after_approval'

export const projectStateMachine = new StateMachine<ProjectStatus, ProjectAction>({
  initial: 'pending',
  transitions: [
    // pending → ongoing (project manager starts / submits to team)
    { from: 'pending', to: 'ongoing', action: 'start' },
    { from: 'pending', to: 'ongoing', action: 'submit_to_team' },
    // pending → cancelled
    { from: 'pending', to: 'cancelled', action: 'cancel' },
    // pending → on_hold (rare but possible)
    { from: 'pending', to: 'on_hold', action: 'hold' },

    // ongoing → submitted (PM submits deliverable to client)
    { from: 'ongoing', to: 'submitted', action: 'submit' },
    // ongoing → on_hold (temporary pause)
    { from: 'ongoing', to: 'on_hold', action: 'hold' },
    // ongoing → cancelled
    { from: 'ongoing', to: 'cancelled', action: 'cancel' },

    // submitted → approved (admin approves RFQ / project deliverable)
    { from: 'submitted', to: 'approved', action: 'approve' },
    { from: 'submitted', to: 'approved', action: 'approve_rfq' },
    // submitted → ongoing (reject for rework)
    { from: 'submitted', to: 'ongoing', action: 'reject_back' },
    // submitted → pending (admin sends RFQ back for full revision)
    { from: 'submitted', to: 'pending', action: 'reject_rfq' },
    // submitted → cancelled
    { from: 'submitted', to: 'cancelled', action: 'cancel' },

    // approved → completed (all work done, project closed)
    { from: 'approved', to: 'completed', action: 'complete' },
    // approved → cancelled_after_approval (rare — client cancels)
    { from: 'approved', to: 'cancelled_after_approval', action: 'cancel_after_approval' },

    // on_hold → ongoing (resume)
    { from: 'on_hold', to: 'ongoing', action: 'resume' },
    // on_hold → cancelled
    { from: 'on_hold', to: 'cancelled', action: 'cancel' },
  ],
})

// ── MO State Machine ───────────────────────────────────────────────────────

export type MOStatus = 'draft' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled'
export type MOAction = 'confirm' | 'start' | 'complete' | 'cancel'

export const moStateMachine = new StateMachine<MOStatus, MOAction>({
  initial: 'draft',
  transitions: [
    { from: 'draft', to: 'confirmed', action: 'confirm' },
    { from: 'draft', to: 'cancelled', action: 'cancel' },
    { from: 'confirmed', to: 'in_progress', action: 'start' },
    { from: 'confirmed', to: 'cancelled', action: 'cancel' },
    { from: 'in_progress', to: 'completed', action: 'complete' },
    { from: 'in_progress', to: 'cancelled', action: 'cancel' },
  ],
})

// ── PO State Machine ───────────────────────────────────────────────────────
//
// SAP/Oracle-inspired Procure-to-Pay flow:
//
// PHASE 1 — INTERNAL ROUTING
//   draft → inventory_check → store_pricing → market_pricing → price_verification → pending_approval
//                           ↘ ready_to_issue → completed  (100% in-stock shortcut)
//   price_verification → market_pricing (reject_verification_to_market_pricing)
//   price_verification → store_pricing  (reject_verification_to_store_pricing)
//
// PHASE 2 — APPROVAL
//   pending_approval → approved       (approve)
//   pending_approval → rejected       (reject)
//   pending_approval → market_pricing (reject_to_market_pricing)
//   rejected → draft                  (reopen)
//
// PHASE 3 — P2P FULFILLMENT
//   approved → items_bought           (start_buying — auto-chained by approvePO in the
//                                       same transaction, for every PO; no PO is ever
//                                       observably left at 'approved')
//   items_bought → goods_received     (finish_buying — explicit action (finishBuyingPO),
//                                       gated on the checklist being fully ticked AND at
//                                       least one buyer receipt already uploaded. Neither
//                                       alone is enough, and there's no single tick/upload
//                                       event to safely auto-trigger off since either can
//                                       legitimately happen last. Record Receipt (the real
//                                       one, creating an actual po_receipt) only becomes
//                                       available once the PO is in goods_received — it
//                                       can no longer happen while still in items_bought)
//   approved → goods_received         (receive_goods — legacy direct path, kept for
//                                       recordReceipt's status check but effectively
//                                       unreachable now that 'approved' is instantaneous)
//   goods_received → finance_audit    (send_to_audit — requires every line fully
//                                       received first)
//   finance_audit → goods_received    (fail_audit — finance returns with flags)
//   finance_audit → invoiced          (pass_audit — three-way match OK)
//   invoiced → completed              (complete — triggered by payment voucher paid)
//
// CANCELLATION: any non-terminal state → cancelled
// DELETION:     draft | inventory_check → deleted

export type POStatus =
  | 'draft'
  | 'inventory_check'
  | 'store_pricing'
  | 'market_pricing'
  | 'price_verification'
  | 'pending_approval'
  | 'approved'
  | 'ready_to_issue'
  | 'items_bought'
  | 'goods_received'
  | 'finance_audit'
  | 'invoiced'
  | 'completed'
  | 'rejected'
  | 'cancelled'
  | 'deleted'

export type POAction =
  | 'submit_to_inventory_check'
  | 'submit_emergency_for_approval'
  | 'confirm_inventory_check'
  | 'submit_to_market_pricing'
  | 'submit_to_price_verification'
  | 'submit_for_approval'
  | 'reject_to_market_pricing'
  | 'reject_verification_to_market_pricing'
  | 'reject_verification_to_store_pricing'
  | 'approve'
  | 'reject'
  | 'reopen'
  | 'start_buying'
  | 'finish_buying'
  | 'receive_goods'
  | 'send_to_audit'
  | 'fail_audit'
  | 'pass_audit'
  | 'complete'
  | 'approve_stock_issuance'
  | 'cancel'
  | 'delete'

const CANCELLABLE: POStatus[] = [
  'draft',
  'inventory_check',
  'store_pricing',
  'market_pricing',
  'price_verification',
  'pending_approval',
  'approved',
  'ready_to_issue',
  'items_bought',
  'goods_received',
  'finance_audit',
  'invoiced',
]

export const poStateMachine = new StateMachine<POStatus, POAction>({
  initial: 'draft',
  transitions: [
    // Phase 1 — internal routing
    { from: 'draft', to: 'inventory_check', action: 'submit_to_inventory_check' },
    { from: 'draft', to: 'pending_approval', action: 'submit_emergency_for_approval' },
    { from: 'inventory_check', to: 'store_pricing', action: 'confirm_inventory_check' },
    { from: 'inventory_check', to: 'ready_to_issue', action: 'confirm_inventory_check' },
    { from: 'ready_to_issue', to: 'completed', action: 'approve_stock_issuance' },
    { from: 'store_pricing', to: 'market_pricing', action: 'submit_to_market_pricing' },
    { from: 'market_pricing', to: 'price_verification', action: 'submit_to_price_verification' },
    { from: 'price_verification', to: 'pending_approval', action: 'submit_for_approval' },
    {
      from: 'price_verification',
      to: 'market_pricing',
      action: 'reject_verification_to_market_pricing',
    },
    {
      from: 'price_verification',
      to: 'store_pricing',
      action: 'reject_verification_to_store_pricing',
    },

    // Phase 2 — approval
    { from: 'pending_approval', to: 'approved', action: 'approve' },
    { from: 'pending_approval', to: 'rejected', action: 'reject' },
    { from: 'pending_approval', to: 'market_pricing', action: 'reject_to_market_pricing' },
    { from: 'rejected', to: 'draft', action: 'reopen' },

    // Phase 3 — P2P fulfillment
    // Every PO: approvePO chains straight from 'approved' into
    // 'items_bought' in the same transaction, regardless of funding
    // source (that's decided later, by Finance, at 'invoiced'). The buyer
    // ticks each line bought there and uploads a receipt, then explicitly
    // finishes buying (finishBuyingPO) once both are done. Record Receipt
    // only becomes available once the PO reaches goods_received, not before.
    { from: 'approved', to: 'items_bought', action: 'start_buying' },
    { from: 'items_bought', to: 'goods_received', action: 'finish_buying' },
    // Legacy direct path — kept so recordReceipt's status check still has
    // somewhere to point if 'approved' is ever reached directly again, but
    // approvePO no longer leaves any PO there in practice.
    { from: 'approved', to: 'goods_received', action: 'receive_goods' },
    { from: 'goods_received', to: 'finance_audit', action: 'send_to_audit' },
    { from: 'finance_audit', to: 'goods_received', action: 'fail_audit' },
    { from: 'finance_audit', to: 'invoiced', action: 'pass_audit' },
    { from: 'invoiced', to: 'completed', action: 'complete' },

    // Cancellation (any active non-terminal state)
    ...CANCELLABLE.map((s) => ({
      from: s,
      to: 'cancelled' as POStatus,
      action: 'cancel' as POAction,
    })),

    // Deletion (only from early draft states)
    { from: 'draft', to: 'deleted', action: 'delete' },
    { from: 'inventory_check', to: 'deleted', action: 'delete' },
  ],
})

// ── Requisition State Machine (G1) ──────────────────────────────────────────
//
// draft → inventory_check → store_pricing → market_pricing → price_verification → pending_approval
// pending_approval → approved   (ONE gate — covers both the stock issue for from-stock
//                                 lines and the spend for bought lines, shown per currency.
//                                 In the same transaction: draft Store Out created for every
//                                 from-stock quantity (full or partial coverage alike), and
//                                 any line still needing purchase moves toward items_bought)
// pending_approval → rejected   (reject — releases the requisition's own stock reservations)
// rejected → draft              (reopen)
// approved → items_bought       (start_buying — auto-chained by approveRequisition in the
//                                 same transaction, mirroring how approvePO used to. Always
//                                 taken, even when there are zero bought lines — items_bought
//                                 is just the buyer's checklist stage, trivially empty/no-op
//                                 for a 100%-stock requisition rather than a special case)
// items_bought → sourcing       (finish_buying — Finish Buying: groups bought entries by
//                                 actual vendor, forks one child purchase_orders row per
//                                 vendor, each starting at 'bought'. A line with no bought
//                                 entry at all — e.g. fully covered from stock — never forks.
//                                 With zero bought lines this is a trivial no-op transition too)
// sourcing → completed          (system-driven, via the completion evaluator — not a direct
//                                 user action. Fires once every line is resolved: issued from
//                                 stock, on a child that reached 'closed', or explicitly
//                                 closed via closeRequisitionLine. For a 100%-stock requisition
//                                 this fires almost immediately after the Store Out confirms,
//                                 since nothing else is outstanding — deliberately not a
//                                 separate state-machine shortcut, so the same linear pipeline
//                                 handles both cases uniformly and only the completion
//                                 evaluator (PR 5) needs to reason about "is everything done")
//
// CANCELLATION: any non-terminal state → cancelled, blocked if any child purchase_orders row
//               is at or past 'goods_received' (mirrors the old model's own no-reversal-past-
//               that-point rule — see cancelPO's CANCELLABLE-vs-exclusion boundary).
// DELETION:     draft | inventory_check → deleted (also reused, with superseded_by_requisition_id,
//               as the G1 Phase 1 migration's tombstone marker for pre-vendor legacy POs)

export type RequisitionStatus =
  | 'draft'
  | 'inventory_check'
  | 'store_pricing'
  | 'market_pricing'
  | 'price_verification'
  | 'pending_approval'
  | 'approved'
  | 'items_bought'
  | 'sourcing'
  | 'completed'
  | 'rejected'
  | 'cancelled'
  | 'deleted'

export type RequisitionAction =
  | 'submit_to_inventory_check'
  | 'confirm_inventory_check'
  | 'submit_to_market_pricing'
  | 'submit_to_price_verification'
  | 'submit_for_approval'
  | 'reject_verification_to_market_pricing'
  | 'reject_verification_to_store_pricing'
  | 'reject_to_market_pricing'
  | 'approve'
  | 'reject'
  | 'reopen'
  | 'start_buying'
  | 'finish_buying'
  | 'complete'
  | 'cancel'
  | 'delete'

const REQUISITION_CANCELLABLE: RequisitionStatus[] = [
  'draft',
  'inventory_check',
  'store_pricing',
  'market_pricing',
  'price_verification',
  'pending_approval',
  'approved',
  'items_bought',
  'sourcing',
]

export const reqStateMachine = new StateMachine<RequisitionStatus, RequisitionAction>({
  initial: 'draft',
  transitions: [
    { from: 'draft', to: 'inventory_check', action: 'submit_to_inventory_check' },
    { from: 'inventory_check', to: 'store_pricing', action: 'confirm_inventory_check' },
    { from: 'store_pricing', to: 'market_pricing', action: 'submit_to_market_pricing' },
    { from: 'market_pricing', to: 'price_verification', action: 'submit_to_price_verification' },
    { from: 'price_verification', to: 'pending_approval', action: 'submit_for_approval' },
    {
      from: 'price_verification',
      to: 'market_pricing',
      action: 'reject_verification_to_market_pricing',
    },
    {
      from: 'price_verification',
      to: 'store_pricing',
      action: 'reject_verification_to_store_pricing',
    },

    { from: 'pending_approval', to: 'approved', action: 'approve' },
    { from: 'pending_approval', to: 'rejected', action: 'reject' },
    { from: 'pending_approval', to: 'market_pricing', action: 'reject_to_market_pricing' },
    { from: 'rejected', to: 'draft', action: 'reopen' },

    { from: 'approved', to: 'items_bought', action: 'start_buying' },
    { from: 'items_bought', to: 'sourcing', action: 'finish_buying' },
    { from: 'sourcing', to: 'completed', action: 'complete' },

    ...REQUISITION_CANCELLABLE.map((s) => ({
      from: s,
      to: 'cancelled' as RequisitionStatus,
      action: 'cancel' as RequisitionAction,
    })),

    { from: 'draft', to: 'deleted', action: 'delete' },
    { from: 'inventory_check', to: 'deleted', action: 'delete' },
  ],
})
