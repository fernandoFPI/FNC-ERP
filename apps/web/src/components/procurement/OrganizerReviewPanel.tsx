import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useMutation } from '@apollo/client'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../../theme/ThemeContext'
import { useToastStore } from '../../store/toastStore'
import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'
import { ActionButton } from '../ui/ActionButton'
import { Textarea } from '../ui/Textarea'
import { Checkbox } from '../ui/Checkbox'
import { Modal } from '../ui/Modal'
import { StageActionBar } from './StageActionBar'
import { LinePriceInput } from './LinePriceInput'
import { EntityAttachments } from '../inventory/EntityAttachments'
import { AddReviewItemModal } from './AddReviewItemModal'
import { TakeFromStockModal } from './TakeFromStockModal'
import { RowMenu } from './ListKit'
import type { MenuItem } from './ListKit'
import { useFocusRing } from '../ui/keyboardFocus'
import { menuFocusRing } from '../ui/menuStyles'
import { discountProblem, hasDiscount, purchaseUnitPrice } from '../../lib/purchaseDiscount'
import {
  APPROVE_REVIEW,
  CONFIRM_REVIEW,
  EDIT_REVIEW_PURCHASE,
  PUT_BACK_REVIEW_STOCK,
  UNDO_REVIEW_STOCK_INSTEAD,
  REJECT_REVIEW,
  APPROVE_REVIEW_STOCK,
  REJECT_REVIEW_STOCK,
  REMOVE_REVIEW_LINE,
  SEND_BACK_TO_BUYING,
  SUBMIT_REVIEW_FOR_APPROVAL,
} from '../../graphql/requisitions'

// The organizer review (migration 329, playbook #115). After Items Bought and before any purchase order exists, the
// organizer double-checks what was bought. He may change a purchase's quantity or price (receipts are view-only), confirm,
// ask a PO Admin to approve what he changed, or send the requisition back to the buyers. A PO Admin approves or rejects.
// Every rule (who may do what, whether a PO Admin is needed) comes from the server in `review`; this module keeps no copy.
//
// The review no longer has a table of its own: the requisition's Lines table IS the review table (one row per line). This
// module gives the page the pieces to do that: `useOrganizerReview` (all the state and mutations, called by the page),
// `ReviewPurchasesCell` and `ReviewActionsCell` (the cells the Lines table draws while the review is on),
// `ReviewRemovedLines` (what was removed, under the table) and `OrganizerReviewPanel` (the slim card above the table, the
// dialogs and the action bar).

// The currencies the organizer can move a purchase to (the same short list as the add-an-item dialog); a purchase already
// in another currency keeps its own as a choice.
const REVIEW_CURRENCIES = ['IQD', 'USD', 'EUR', 'TRY', 'AED']

export interface ReviewPurchaseRow {
  id: string
  vendor_name?: string | null
  currency_code: string
  qty: string
  actual_unit_price: string
  /** The unit price after the vendor's discount (migration 336). When set it is the price that counts; the quoted one is information only. */
  discounted_unit_price?: string | null
  bought_by?: string | null
  bought_by_name?: string | null
  over_tolerance: boolean
  tolerance_approved_by?: string | null
  receipt_file_id?: string | null
  review_original_qty?: string | null
  review_original_price?: string | null
  review_original_currency?: string | null
  /** Finance flagged this purchase's line when it sent its purchase order back to the organizer: why, who, when. Null otherwise. */
  finance_flag_reason?: string | null
  finance_flagged_by?: string | null
  finance_flagged_at?: string | null
  /** The vendor, which decides (with the purchase orders Finance sent back) whether the purchase can be changed in a reopened review. */
  vendor_id?: string | null
}

export interface ReviewLineRow {
  id: string
  line_number?: number | null
  description?: string | null
  product_name?: string | null
  /** Set on a line the organizer added in this review (migration 330). */
  review_added_at?: string | null
  /** Set on a line made from a purchase when the purchase orders were created; a reopened review shows the original line only. */
  origin_line_id?: string | null
  /** The catalog item, when there is one: a custom item has no stock to take from. */
  product_id?: string | null
  /** What the line was ordered for, and what stock already covers (the inventory check, or an earlier take in this review). */
  qty?: string | null
  qty_from_stock?: string | null
  source_location_name?: string | null
  /** The quantity he took from stock instead of buying it in this review (migration 332). */
  review_stock_qty?: string | null
  /** The purchases stock replaced on this line in the review, as they were (migration 333). */
  review_replaced?: ReviewRemovedPurchase[] | null
  /** A "Use stock instead" on this line can be undone (migration 334). */
  review_can_undo_stock?: boolean | null
  /** A flag the approver raised on this line when sending the review back (migration 279; flagged_from_status 'review_approval'). */
  flag_reason?: string | null
  flagged_at?: string | null
  flagged_by_name?: string | null
  flagged_from_status?: string | null
  flag_addressed_at?: string | null
  flag_resolved_at?: string | null
  /** The line's own total and currency: what a line with no purchase shows on a phone card. */
  total?: string | null
  currency_code?: string | null
  purchases?: ReviewPurchaseRow[] | null
}

export interface ReviewRemovedPurchase {
  vendor?: string | null
  qty?: string | null
  price?: string | null
  currency?: string | null
  had_receipt?: boolean | null
}

export interface ReviewRemovedLine {
  id: string
  line_number?: number | null
  description?: string | null
  qty_ordered?: string | null
  uom?: string | null
  reason: string
  removed_by_name?: string | null
  purchases: ReviewRemovedPurchase[]
}

export interface ReviewStockSignoff {
  /** pending, approved or rejected */
  status: string
  by_name?: string | null
  at?: string | null
  reason?: string | null
}

export interface ReviewData {
  /** The store keeper's sign-off on items taken from stock (null when none was): approved before the administrator can approve. */
  stock_review?: ReviewStockSignoff | null
  /** The caller may sign off or reject the items taken from stock (a store keeper of this requisition, or an admin). */
  caller_can_decide_stock?: boolean
  needs_approval: boolean
  approval_reason?: string | null
  edited_count: number
  organizer_bought_count: number
  unsigned_tolerance_count: number
  /** Lines added and removed in this review (migration 330), and the removed ones as they were. */
  added_count?: number
  stocked_count?: number
  removed_count?: number
  removed_lines?: ReviewRemovedLine[] | null
  caller_can_edit: boolean
  caller_can_approve: boolean
  /** The purchase orders Finance sent back when this review was reopened for them (migration 337); empty for an ordinary review. */
  reopened_pos?: ReviewReopenedPO[] | null
  last_rejection?: { reason?: string | null; by_name?: string | null; at?: string | null } | null
  totals: { currency_code: string; was: string; now: string; purchases: number }[]
}

export interface ReviewReopenedPO {
  id: string
  po_number: string
  vendor_id: string
  vendor_name?: string | null
  reason?: string | null
  at?: string | null
}

export interface ReviewRequisition {
  id: string
  requisition_number: string
  status: string
  organizerName?: string | null
  review?: ReviewData | null
  lines: ReviewLineRow[]
}

// Up to four decimals: a price of 12.345 must not read 12.35 in a screen that is about checking prices.
const fmt = (n: string | number | null | undefined) =>
  parseFloat(String(n ?? 0)).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  })
const num = (n: string | null | undefined) => parseFloat(String(n ?? 0)) || 0
// An empty product name or description must still fall back, so this tests for text rather than for null.
function orDash(s: string | null | undefined): string {
  if (s) return s
  return '—'
}
/**
 * "(quoted 42.5, 5.9% off)" beside a purchase that has a price after discount: the price that counts is the one printed first, and
 * the vendor's quoted price is information only. Draws nothing for a purchase without a discount.
 */
function QuotedNote({ purchase }: { purchase: ReviewPurchaseRow }) {
  const { t } = useTranslation()
  const { theme } = useTheme()
  if (!hasDiscount(purchase)) return null
  return (
    <span
      data-testid="quoted-note"
      style={{
        marginInlineStart: '6px',
        fontSize: '12px',
        fontWeight: 400,
        color: theme.textSecondary,
      }}
    >
      {t('req.review.quotedNote', { price: fmt(purchase.actual_unit_price) })}
    </span>
  )
}
/** Why Finance flagged this purchase's line: red edge, who flagged it, the reason in plain sight. Nothing for an unflagged purchase. */
function FinanceFlagNote({ purchase }: { purchase: ReviewPurchaseRow }) {
  const { t } = useTranslation()
  const { theme } = useTheme()
  if (!purchase.finance_flag_reason) return null
  return (
    <div
      data-testid="finance-flag-note"
      style={{
        borderInlineStart: `4px solid ${theme.danger}`,
        background: `${theme.danger}12`,
        borderRadius: '6px',
        padding: '6px 10px',
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
      }}
    >
      <div style={{ fontSize: '12px', fontWeight: 600, color: theme.danger }}>
        {t('req.review.financeFlagBy', { name: purchase.finance_flagged_by ?? '—' })}
      </div>
      <div style={{ fontSize: '13px', color: theme.textPrimary, overflowWrap: 'anywhere' }}>
        {purchase.finance_flag_reason}
      </div>
    </div>
  )
}
function lineNameOf(l: ReviewLineRow): string {
  if (l.product_name) return l.product_name
  if (l.description) return l.description
  return '—'
}

// What the review needs to know about one line, worked out once.
function lineFacts(l: ReviewLineRow) {
  const purchases = l.purchases ?? []
  const bought = purchases.reduce((s, p) => s + num(p.qty), 0)
  return {
    purchases,
    lineName: lineNameOf(l),
    added: !!l.review_added_at,
    /** What is left to cover on the line: ordered, minus stock, minus what was bought (zero or more). */
    shortfall: Math.max(num(l.qty) - num(l.qty_from_stock) - bought, 0),
    /** The quantity taken from stock in this review, and where from. */
    stockTaken: num(l.review_stock_qty),
    stockLocation: l.source_location_name ?? null,
    hasProduct: !!l.product_id,
    fromStock: num(l.qty_from_stock),
    /** Ordered minus what stock already covers: what "Use stock instead" would cover. */
    toCover: Math.max(num(l.qty) - num(l.qty_from_stock), 0),
    /** The purchases stock replaced on the line in this review. */
    replaced: l.review_replaced ?? [],
    /** The last "Use stock instead" on the line can be reversed (the server keeps what it removed or reduced). */
    canUndo: !!l.review_can_undo_stock,
    /** Some purchase on the line was changed in this review. */
    changed: purchases.some(
      (p) =>
        p.review_original_qty != null ||
        p.review_original_price != null ||
        p.review_original_currency != null,
    ),
    /** A purchase over its price tolerance that nobody has signed off yet: the only thing that blocks the review. */
    needsAttention: purchases.some((p) => p.over_tolerance && !p.tolerance_approved_by),
  }
}

const changedPurchase = (p: ReviewPurchaseRow) =>
  p.review_original_qty != null ||
  p.review_original_price != null ||
  p.review_original_currency != null

// ── The controller: every piece of state and every mutation of the review ────────────────────────────────

export function useOrganizerReview(
  requisition: ReviewRequisition | null | undefined,
  onChanged: () => void,
) {
  const { t } = useTranslation()
  const addToast = useToastStore((s) => s.addToast)
  const review = requisition?.review ?? null
  const inReview = requisition?.status === 'organizer_review'
  const inApproval = requisition?.status === 'review_approval'
  /** The review is on: the requisition is in one of the two review statuses and the server sent the review. */
  const active = !!requisition && !!review && (inReview || inApproval)
  const requisitionId = requisition?.id ?? ''
  // A review reopened for purchase orders Finance sent back (migration 337): nothing new is created, so the wording differs
  const reopenedPos = review?.reopened_pos ?? []
  const reopened = reopenedPos.length > 0

  const [editing, setEditing] = useState<{
    id: string
    qty: string
    price: string
    /** The price after the vendor's discount; empty means no discount. */
    discounted: string
    currency: string
  } | null>(null)
  const [receiptsFor, setReceiptsFor] = useState<string | null>(null)
  const [sendBackOpen, setSendBackOpen] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [reason, setReason] = useState('')
  // the store keeper's "no" on the items taken from stock: a reason the administrator reads
  const [stockRejectOpen, setStockRejectOpen] = useState(false)
  const [stockReason, setStockReason] = useState('')
  const [removeIds, setRemoveIds] = useState<string[]>([])
  const [addOpen, setAddOpen] = useState(false)
  const [removeLineFor, setRemoveLineFor] = useState<{ id: string; name: string } | null>(null)
  const [stockFor, setStockFor] = useState<{
    id: string
    name: string
    shortfall: number
    location?: string | null
    mode: 'take' | 'replace'
  } | null>(null)
  const [removeLineReason, setRemoveLineReason] = useState('')
  // The simplified review (playbook #121): a line shows one status and its details only when opened; what was removed is a chip.
  const [expanded, setExpanded] = useState<string[]>([])
  const toggleExpanded = (lineId: string) => {
    setExpanded((cur) =>
      cur.includes(lineId) ? cur.filter((x) => x !== lineId) : [...cur, lineId],
    )
  }
  const [showRemoved, setShowRemoved] = useState(false)
  // Lines the approver flags while sending the review back, as at the approval stages: lineId -> that line's own reason.
  const [flagged, setFlagged] = useState<Record<string, string>>({})

  const done = (message: string) => () => {
    addToast({ message, type: 'success' })
    onChanged()
  }
  const failed = (e: { message: string }) => {
    addToast({ message: e.message, type: 'error' })
  }

  const [editPurchase, { loading: editSaving }] = useMutation(EDIT_REVIEW_PURCHASE, {
    onCompleted: () => {
      setEditing(null)
      done(t('req.review.toastChanged'))()
    },
    onError: failed,
  })
  const [confirmReview, { loading: confirming }] = useMutation(CONFIRM_REVIEW, {
    onCompleted: done(
      reopened ? t('req.review.toastConfirmedReopened') : t('req.review.toastConfirmed'),
    ),
    onError: failed,
  })
  const [submitReview, { loading: submitting }] = useMutation(SUBMIT_REVIEW_FOR_APPROVAL, {
    onCompleted: done(t('req.review.toastSubmitted')),
    onError: failed,
  })
  const [approveReview, { loading: approving }] = useMutation(APPROVE_REVIEW, {
    onCompleted: done(
      reopened ? t('req.review.toastApprovedReopened') : t('req.review.toastApproved'),
    ),
    onError: failed,
  })
  const [approveStock, { loading: approvingStock }] = useMutation(APPROVE_REVIEW_STOCK, {
    onCompleted: done(t('req.review.toastStockApproved')),
    onError: failed,
  })
  const [rejectStock, { loading: rejectingStock }] = useMutation(REJECT_REVIEW_STOCK, {
    onCompleted: () => {
      setStockRejectOpen(false)
      setStockReason('')
      done(t('req.review.toastStockRejected'))()
    },
    onError: failed,
  })
  const [rejectReview, { loading: rejecting }] = useMutation(REJECT_REVIEW, {
    onCompleted: () => {
      setRejectOpen(false)
      setReason('')
      setFlagged({})
      done(t('req.review.toastRejected'))()
    },
    onError: failed,
  })
  const [removeLine, { loading: removingLine }] = useMutation(REMOVE_REVIEW_LINE, {
    onCompleted: () => {
      setRemoveLineFor(null)
      setRemoveLineReason('')
      done(t('req.review.toastRemoved'))()
    },
    onError: failed,
  })
  const [putBackStock, { loading: puttingBack }] = useMutation(PUT_BACK_REVIEW_STOCK, {
    onCompleted: done(t('req.review.toastStockPutBack')),
    onError: failed,
  })
  const [undoStock, { loading: undoingStock }] = useMutation(UNDO_REVIEW_STOCK_INSTEAD, {
    onCompleted: done(t('req.review.toastStockUndone')),
    onError: failed,
  })
  const [sendBack, { loading: sendingBack }] = useMutation(SEND_BACK_TO_BUYING, {
    onCompleted: () => {
      setSendBackOpen(false)
      setReason('')
      setRemoveIds([])
      done(t('req.review.toastSentBack'))()
    },
    onError: failed,
  })

  const canEdit = inReview && !!review?.caller_can_edit
  // A review reopened for purchase orders Finance sent back (migration 337): only those orders' purchases can be changed, nothing is
  // taken from stock and nothing goes back to the buyers. The server enforces all of it; the screen just does not offer what it refuses.
  const heldVendorIds = new Set(reopenedPos.map((p) => p.vendor_id))
  const canChangePurchase = (p: { vendor_id?: string | null }) =>
    canEdit && (!reopened || (!!p.vendor_id && heldVendorIds.has(p.vendor_id)))
  const lines = [...(requisition?.lines ?? [])]
    // the lines the fork made from the purchases are shown through their original line
    .filter((l) => !(reopened && l.origin_line_id))
    .sort((a, b) => (a.line_number ?? 0) - (b.line_number ?? 0))
  // Purchases only: what the "send back" dialog can remove.
  const purchaseRows = lines.flatMap((l) =>
    (l.purchases ?? []).map((p) => ({ ...p, lineName: lineNameOf(l) })),
  )
  const defaultCurrency =
    review && review.totals.length === 1 ? review.totals[0]?.currency_code : undefined
  // The review column is worth a column only for someone who can act on it, or when something was added (its badge).
  const showActions = canEdit || lines.some((l) => !!l.review_added_at)

  const startEdit = (p: ReviewPurchaseRow) => {
    setEditing({
      id: p.id,
      qty: String(num(p.qty)),
      price: String(num(p.actual_unit_price)),
      discounted: hasDiscount(p) ? String(num(p.discounted_unit_price)) : '',
      currency: p.currency_code,
    })
  }
  const saveEdit = (p: ReviewPurchaseRow) => {
    if (!editing) return
    const qty = parseFloat(editing.qty)
    const price = parseFloat(editing.price)
    if (!(qty > 0) || !(price > 0)) {
      addToast({ message: t('req.review.numbersMustBePositive'), type: 'error' })
      return
    }
    // The price after discount is optional: empty means no discount, otherwise it must be above 0 and not above the quoted price.
    const problem = discountProblem(price, editing.discounted)
    if (problem) {
      addToast({
        message: t(
          problem === 'zero' ? 'req.review.discountMustBePositive' : 'req.review.discountTooHigh',
        ),
        type: 'error',
      })
      return
    }
    const discounted = editing.discounted.trim() === '' ? null : parseFloat(editing.discounted)
    const qtyChanged = Math.abs(qty - num(p.qty)) > 0.00005
    const priceChanged = Math.abs(price - num(p.actual_unit_price)) > 0.00005
    const currentDiscounted = hasDiscount(p) ? num(p.discounted_unit_price) : null
    const discountChanged =
      (discounted === null) !== (currentDiscounted === null) ||
      (discounted !== null &&
        currentDiscounted !== null &&
        Math.abs(discounted - currentDiscounted) > 0.00005)
    const currencyChanged = editing.currency !== p.currency_code
    if (!qtyChanged && !priceChanged && !discountChanged && !currencyChanged) {
      setEditing(null)
      return
    }
    void editPurchase({
      variables: {
        purchaseId: p.id,
        qty: qtyChanged ? qty : undefined,
        actualUnitPrice: priceChanged ? price : undefined,
        // Sent only when it changed; null takes the discount off.
        ...(discountChanged ? { discountedUnitPrice: discounted } : {}),
        currencyCode: currencyChanged ? editing.currency : undefined,
      },
    })
  }

  // Only the person who can approve flags lines, and only while the review waits for them.
  const flagging = inApproval && !!review?.caller_can_approve
  const flaggedNow: Record<string, string> = flagging ? flagged : {}
  const flaggedIds = Object.keys(flaggedNow)
  const toggleFlag = (lineId: string) => {
    setFlagged((cur) => {
      if (lineId in cur) {
        const next = { ...cur }
        Reflect.deleteProperty(next, lineId)
        return next
      }
      return { ...cur, [lineId]: '' }
    })
    // a flagged line opens, so its reason box is in front of the person
    setExpanded((cur) => (cur.includes(lineId) ? cur : [...cur, lineId]))
  }
  const setFlagReason = (lineId: string, text: string) => {
    setFlagged((cur) => ({ ...cur, [lineId]: text }))
  }
  const flagsValid = flaggedIds.every((id) => (flaggedNow[id] ?? '').trim().length > 0)
  const lineFlags = flaggedIds.map((id) => ({ lineId: id, reason: (flaggedNow[id] ?? '').trim() }))

  return {
    active,
    requisition,
    requisitionId,
    review,
    inReview,
    inApproval,
    canEdit,
    reopened,
    reopenedPos,
    canChangePurchase,
    showActions,
    onChanged,
    organizerName: requisition?.organizerName ?? '',
    defaultCurrency,
    purchaseRows,
    editing,
    setEditing,
    editSaving,
    startEdit,
    saveEdit,
    receiptsFor,
    setReceiptsFor,
    sendBackOpen,
    setSendBackOpen,
    sendingBack,
    sendBack,
    rejectOpen,
    setRejectOpen,
    rejecting,
    rejectReview,
    stockRejectOpen,
    setStockRejectOpen,
    stockReason,
    setStockReason,
    approveStock,
    approvingStock,
    rejectStock,
    rejectingStock,
    reason,
    setReason,
    removeIds,
    setRemoveIds,
    addOpen,
    setAddOpen,
    removeLineFor,
    setRemoveLineFor,
    removeLine,
    removingLine,
    removeLineReason,
    setRemoveLineReason,
    stockFor,
    setStockFor,
    putBackStock,
    puttingBack,
    undoStock,
    undoingStock,
    expanded,
    toggleExpanded,
    flagging,
    flagged: flaggedNow,
    flaggedIds,
    toggleFlag,
    setFlagReason,
    flagsValid,
    lineFlags,
    showRemoved,
    setShowRemoved,
    lines,
    confirmReview,
    confirming,
    submitReview,
    submitting,
    approveReview,
    approving,
  }
}

export type ReviewController = ReturnType<typeof useOrganizerReview>

// ── The cells the Lines table draws while the review is on ───────────────────────────────────────────────

/**
 * The "Bought" cell of a line during the review, kept to what you decide on at a glance: each purchase as `qty @ price` with its
 * vendor and buyer and a Change button, then what was taken from stock. Everything else (what it was before, the receipts, the
 * badges, what stock replaced, what is not bought) is in `ReviewLineDetails`, shown when the line is opened (playbook #121).
 * `fallback` is what the Lines table says for a line with no purchase (covered from stock, closed, not bought).
 */
export function ReviewPurchasesCell({
  ctl,
  line,
  fallback,
  sheet = false,
}: {
  ctl: ReviewController
  line: ReviewLineRow
  fallback?: React.ReactNode
  /** The phone sheet's layout: each purchase's text, then Change and View side by side under it (full-size buttons for a thumb). */
  sheet?: boolean
}) {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const f = lineFacts(line)
  const { editing } = ctl

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {f.purchases.length === 0 && fallback}
      {f.purchases.map((p, i) => {
        const isEditing = editing !== null && editing.id === p.id
        return (
          <div
            key={p.id}
            data-testid="review-purchase"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              ...(i > 0 ? { borderTop: `1px solid ${theme.border}`, paddingTop: '8px' } : {}),
            }}
          >
            <FinanceFlagNote purchase={p} />
            {isEditing ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                <LinePriceInput
                  value={editing.qty}
                  width="84px"
                  placeholder="0"
                  invalid={!(parseFloat(editing.qty) > 0)}
                  onChange={(v) => {
                    ctl.setEditing({ ...editing, qty: v })
                  }}
                  ariaLabel={t('req.review.qtyOf', { item: f.lineName })}
                />
                <span aria-hidden="true" style={{ color: theme.textSecondary }}>
                  @
                </span>
                <LinePriceInput
                  value={editing.price}
                  invalid={!(parseFloat(editing.price) > 0)}
                  onChange={(v) => {
                    ctl.setEditing({ ...editing, price: v })
                  }}
                  ariaLabel={t('req.review.priceOf', { item: f.lineName })}
                />
                {/* The price after the vendor's discount: optional; when it is filled it is the price that counts. */}
                <LinePriceInput
                  value={editing.discounted}
                  placeholder={t('req.review.afterDiscountPlaceholder')}
                  invalid={discountProblem(editing.price, editing.discounted) !== null}
                  onChange={(v) => {
                    ctl.setEditing({ ...editing, discounted: v })
                  }}
                  ariaLabel={t('req.review.discountedPriceOf', { item: f.lineName })}
                />
                <select
                  aria-label={t('req.review.currencyOf', { item: f.lineName })}
                  value={editing.currency}
                  onChange={(e) => {
                    ctl.setEditing({ ...editing, currency: e.target.value })
                  }}
                  style={{
                    height: '36px',
                    borderRadius: '8px',
                    border: `1px solid ${theme.borderField}`,
                    background: theme.bgSurface,
                    color: theme.textPrimary,
                    padding: '0 8px',
                    fontSize: '13px',
                  }}
                >
                  {(REVIEW_CURRENCIES.includes(p.currency_code)
                    ? REVIEW_CURRENCIES
                    : [p.currency_code, ...REVIEW_CURRENCIES]
                  ).map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <ActionButton
                  variant="solid"
                  size="sm"
                  loading={ctl.editSaving}
                  onClick={() => {
                    ctl.saveEdit(p)
                  }}
                >
                  {t('req.review.save')}
                </ActionButton>
                <ActionButton
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    ctl.setEditing(null)
                  }}
                >
                  {t('req.review.cancel')}
                </ActionButton>
              </div>
            ) : sheet ? (
              <div
                data-testid="review-purchase-sheet"
                style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}
              >
                <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <div style={{ fontSize: '15px', color: theme.textPrimary, fontWeight: 700 }}>
                    {fmt(p.qty)} @ {fmt(purchaseUnitPrice(p))} {p.currency_code}
                    <QuotedNote purchase={p} />
                  </div>
                  <div style={{ fontSize: '13px', color: theme.textSecondary }}>
                    {p.vendor_name ?? '—'} · {t('req.review.boughtBy')}: {p.bought_by_name ?? '—'}
                  </div>
                  {p.over_tolerance && (
                    <div style={{ marginTop: '4px' }}>
                      <Badge variant={p.tolerance_approved_by ? 'success' : 'danger'}>
                        {t('req.review.overTolerance')}
                      </Badge>
                    </div>
                  )}
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns:
                      ctl.canChangePurchase(p) && p.receipt_file_id
                        ? 'repeat(2, minmax(0, 1fr))'
                        : 'minmax(0, 1fr)',
                    gap: '8px',
                    alignItems: 'center',
                  }}
                >
                  {ctl.canChangePurchase(p) && (
                    <ActionButton
                      fullWidth
                      variant="outline"
                      onClick={() => {
                        ctl.startEdit(p)
                      }}
                    >
                      {t('req.review.change')}
                    </ActionButton>
                  )}
                  {p.receipt_file_id ? (
                    <ActionButton
                      fullWidth
                      variant="outline"
                      onClick={() => {
                        ctl.setReceiptsFor(p.id)
                      }}
                    >
                      {t('req.review.viewReceipts')}
                    </ActionButton>
                  ) : (
                    <span style={{ color: theme.danger, fontSize: '13px' }}>
                      {t('req.review.noReceipt')}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: '12px',
                }}
              >
                <div
                  style={{
                    minWidth: 0,
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px',
                  }}
                >
                  <div style={{ fontSize: '13px', color: theme.textPrimary, fontWeight: 600 }}>
                    {fmt(p.qty)} @ {fmt(purchaseUnitPrice(p))} {p.currency_code}
                    <QuotedNote purchase={p} />
                  </div>
                  <div style={{ fontSize: '12px', color: theme.textSecondary }}>
                    {p.vendor_name ?? '—'} · {t('req.review.boughtBy')}: {p.bought_by_name ?? '—'}
                  </div>
                </div>
                {ctl.canChangePurchase(p) && (
                  <ActionButton
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      ctl.startEdit(p)
                    }}
                  >
                    {t('req.review.change')}
                  </ActionButton>
                )}
              </div>
            )}
          </div>
        )
      })}
      {f.stockTaken > 0 && (
        <div style={{ fontSize: '12px', color: theme.info }}>
          {f.stockLocation
            ? t('req.review.stockTaken', { qty: fmt(f.stockTaken), location: f.stockLocation })
            : t('req.review.stockTakenNoWhere', { qty: fmt(f.stockTaken) })}
        </div>
      )}
    </div>
  )
}

/**
 * What the one-line status hides, shown when a line is opened: what a changed purchase was before, each purchase's receipt and
 * flags, what stock replaced, what is not bought yet, and why an added line needs the approver's eye.
 */
export function ReviewLineDetails({
  ctl,
  line,
  omitReceipts = false,
  showFlagToggle = false,
}: {
  ctl: ReviewController
  line: ReviewLineRow
  /** The phone sheet shows each purchase's View button beside its Change, so the receipts block would only repeat it. */
  omitReceipts?: boolean
  /** The phone sheet has no tick column, so the flag box is drawn here; on a desktop the table's own tick column does it. */
  showFlagToggle?: boolean
}) {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const f = lineFacts(line)
  const heading = (text: string) => (
    <div
      style={{
        fontSize: '11px',
        fontWeight: 700,
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        color: theme.textSecondary,
        marginBottom: '4px',
      }}
    >
      {text}
    </div>
  )
  const small = { fontSize: '13px', color: theme.textSecondary } as const
  const changedOnes = f.purchases.filter(changedPurchase)

  return (
    <div
      data-testid="review-line-details"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: '12px 32px',
      }}
    >
      {(openReviewFlag(line) || (ctl.flagging && showFlagToggle) || line.id in ctl.flagged) && (
        <div data-testid="review-flag-block" style={{ gridColumn: '1 / -1' }}>
          {openReviewFlag(line) && (
            <div
              style={{
                borderInlineStart: `4px solid ${line.flag_addressed_at ? theme.warning : theme.danger}`,
                paddingInlineStart: '10px',
                marginBottom: '8px',
              }}
            >
              {heading(
                t('req.review.flagBy', { name: line.flagged_by_name ?? '—' }) +
                  (line.flag_addressed_at ? ` · ${t('req.review.statusFlagAnswered')}` : ''),
              )}
              <div style={{ fontSize: '13px', color: theme.textPrimary }}>{line.flag_reason}</div>
            </div>
          )}
          {ctl.flagging && showFlagToggle && (
            <Checkbox
              label={t('req.review.flagThisLine')}
              checked={line.id in ctl.flagged}
              onChange={() => {
                ctl.toggleFlag(line.id)
              }}
              large
            />
          )}
          {ctl.flagging && line.id in ctl.flagged && (
            <div style={{ marginTop: '8px' }}>
              <Textarea
                field
                label={t('req.review.flagReasonLabel')}
                placeholder={t('req.review.flagReasonPlaceholder')}
                value={ctl.flagged[line.id] ?? ''}
                rows={2}
                autoFocus
                onChange={(e) => {
                  ctl.setFlagReason(line.id, e.target.value)
                }}
              />
            </div>
          )}
        </div>
      )}
      {f.purchases.length > 0 && (
        <div>
          {heading(t('req.review.detailChanged'))}
          {changedOnes.length === 0 ? (
            <div style={small}>{t('req.review.detailNothingChanged')}</div>
          ) : (
            changedOnes.map((p) => (
              <div key={p.id} style={small}>
                {p.review_original_qty != null && (
                  <span style={{ marginInlineEnd: '10px' }}>
                    {t('req.review.qty')}:{' '}
                    {t('req.review.was', { value: fmt(p.review_original_qty) })}
                  </span>
                )}
                {(p.review_original_price != null || p.review_original_currency != null) && (
                  <span>
                    {t('req.review.unitPrice')}:{' '}
                    {t('req.review.was', {
                      value:
                        p.review_original_currency != null &&
                        p.review_original_currency !== p.currency_code
                          ? `${fmt(p.review_original_price ?? purchaseUnitPrice(p))} ${p.review_original_currency}`
                          : fmt(p.review_original_price ?? purchaseUnitPrice(p)),
                    })}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      )}
      {f.purchases.length > 0 && !omitReceipts && (
        <div>
          {heading(t('req.review.detailReceipts'))}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {f.purchases.map((p) => (
              <div
                key={p.id}
                style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}
              >
                <span style={{ ...small, color: theme.textPrimary }}>
                  {fmt(p.qty)} @ {fmt(purchaseUnitPrice(p))} {p.currency_code} ={' '}
                  {fmt(num(p.qty) * purchaseUnitPrice(p))} {p.currency_code}
                  <QuotedNote purchase={p} />
                </span>
                {/* No View button here on a desktop: the receipts of every purchase are in the "Receipts & photos" window above the table. */}
                {!p.receipt_file_id && (
                  <span style={{ color: theme.danger, fontSize: '12px' }}>
                    {t('req.review.noReceipt')}
                  </span>
                )}
                {p.over_tolerance && (
                  <Badge variant={p.tolerance_approved_by ? 'success' : 'danger'}>
                    {t('req.review.overTolerance')}
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {(f.stockTaken > 0 || f.replaced.length > 0 || f.shortfall > 0.0001) && (
        <div>
          {heading(t('req.review.detailStock'))}
          {f.stockTaken > 0 && (
            <div style={{ ...small, color: theme.info }}>
              {f.stockLocation
                ? t('req.review.stockTaken', { qty: fmt(f.stockTaken), location: f.stockLocation })
                : t('req.review.stockTakenNoWhere', { qty: fmt(f.stockTaken) })}
            </div>
          )}
          {f.replaced.length > 0 && (
            <div style={small}>
              {t('req.review.replacedHeading')}
              {f.replaced.map((r, i) => (
                <div key={i}>
                  {t('req.review.replacedBought', {
                    vendor: orDash(r.vendor),
                    qty: fmt(r.qty),
                    price: fmt(r.price),
                    currency: orDash(r.currency),
                  })}
                </div>
              ))}
            </div>
          )}
          {f.purchases.length > 0 && f.shortfall > 0.0001 && (
            <div style={small}>{t('req.review.notBought', { n: fmt(f.shortfall) })}</div>
          )}
        </div>
      )}
      {f.added && (
        <div>
          {heading(t('req.review.detailHeadsUp'))}
          <div style={small}>{t('req.review.addedNote')}</div>
        </div>
      )}
    </div>
  )
}

/**
 * The Total column during the review: what was actually bought on the line (quantity x price, per currency), because the
 * line's own total is the estimate and would disagree with the purchase right beside it. A line with no purchase keeps its own.
 */
export function reviewLineTotals(line: ReviewLineRow): { currency: string; amount: number }[] {
  const sums = new Map<string, number>()
  for (const p of line.purchases ?? [])
    sums.set(p.currency_code, (sums.get(p.currency_code) ?? 0) + num(p.qty) * purchaseUnitPrice(p))
  return [...sums.entries()].map(([currency, amount]) => ({ currency, amount }))
}

// ── One status per line, one menu for the rare actions (playbook #121) ─────────────────────────────────────

export type ReviewChip =
  | 'attention'
  | 'added'
  | 'fromStock'
  | 'short'
  | 'changed'
  | 'asBought'
  | 'fromInventory'
  | 'notBought'
  | 'flagged'
  | 'flagAnswered'
  | 'financeFlagged'

/** The purchases of a line that Finance flagged when it sent the purchase order back, with the reason. Empty for any other line. */
export function financeFlaggedPurchases(line: ReviewLineRow): ReviewPurchaseRow[] {
  return (line.purchases ?? []).filter((p) => !!p.finance_flag_reason)
}

/** An approver flagged this line when sending the review back, and it is not settled yet. */
export function openReviewFlag(line: ReviewLineRow): boolean {
  return (
    line.flagged_from_status === 'review_approval' && !!line.flag_reason && !line.flag_resolved_at
  )
}

/**
 * What happened to a line in this review, as the few words the table shows. Several can apply (an added line that stock covers);
 * a line nothing happened to says how it stands: as bought, covered from inventory, or not bought.
 */
export function reviewLineChips(line: ReviewLineRow): ReviewChip[] {
  const f = lineFacts(line)
  const chips: ReviewChip[] = []
  if (f.needsAttention) chips.push('attention')
  if (f.added) chips.push('added')
  if (f.stockTaken > 0) chips.push('fromStock')
  if (f.purchases.length > 0 && f.shortfall > 0.0001) chips.push('short')
  if (f.changed) chips.push('changed')
  if (chips.length === 0) {
    if (f.purchases.length > 0) chips.push('asBought')
    else if (f.fromStock > 0) chips.push('fromInventory')
    else chips.push('notBought')
  }
  // an open flag comes first: it is what the organizer has to answer
  if (openReviewFlag(line)) chips.unshift(line.flag_addressed_at ? 'flagAnswered' : 'flagged')
  // Finance's flag on a returned purchase order comes before everything: it is why the review was reopened
  if (financeFlaggedPurchases(line).length > 0) chips.unshift('financeFlagged')
  return chips
}

const CHIP_VARIANT: Record<ReviewChip, 'danger' | 'info' | 'warning' | 'success' | 'neutral'> = {
  attention: 'danger',
  added: 'info',
  fromStock: 'info',
  short: 'warning',
  changed: 'warning',
  asBought: 'success',
  fromInventory: 'neutral',
  notBought: 'neutral',
  flagged: 'danger',
  flagAnswered: 'warning',
  financeFlagged: 'danger',
}
const CHIP_LABEL: Record<ReviewChip, string> = {
  attention: 'req.review.statusAttention',
  added: 'req.review.statusAdded',
  fromStock: 'req.review.statusFromStock',
  short: 'req.review.statusShort',
  changed: 'req.review.changed',
  asBought: 'req.review.statusAsBought',
  fromInventory: 'req.review.statusFromInventory',
  notBought: 'req.review.statusNotBought',
  flagged: 'req.review.statusFlagged',
  flagAnswered: 'req.review.statusFlagAnswered',
  financeFlagged: 'req.review.statusFinanceFlagged',
}

/** The line's status chips, in the order that matters most first. */
export function ReviewStatusChips({
  line,
  stacked = false,
}: {
  line: ReviewLineRow
  /** One chip under the other, left aligned: the desktop Status column, so every row's chips start at the same place. */
  stacked?: boolean
}) {
  const { t } = useTranslation()
  return (
    <div
      data-testid="review-status-chips"
      style={
        stacked
          ? { display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }
          : { display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }
      }
    >
      {reviewLineChips(line).map((c) => (
        <Badge key={c} variant={CHIP_VARIANT[c]}>
          {t(CHIP_LABEL[c])}
        </Badge>
      ))}
    </div>
  )
}

/**
 * The rare things the organizer can do to a whole line, as menu items. ONE list: the desktop row menu and the phone sheet both read
 * it, so they cannot drift. Each shows only when it applies to the line, exactly the rules the buttons had.
 */
export function reviewLineMenuItems(
  ctl: ReviewController,
  line: ReviewLineRow,
  t: (key: string) => string,
): MenuItem[] {
  const f = lineFacts(line)
  const items: MenuItem[] = []
  if (ctl.reopened) {
    if (f.purchases.length > 0 && f.purchases.every((p) => ctl.canChangePurchase(p)))
      items.push({
        label: t('req.review.removeItem'),
        tone: 'danger',
        onClick: () => {
          ctl.setRemoveLineReason('')
          ctl.setRemoveLineFor({ id: line.id, name: f.lineName })
        },
      })
    return items
  }
  if (f.purchases.length > 0 && f.hasProduct && f.toCover > 0.0001)
    items.push({
      label: t('req.review.useStock'),
      onClick: () => {
        ctl.setStockFor({
          id: line.id,
          name: f.lineName,
          shortfall: f.toCover,
          location: f.fromStock > 0 ? f.stockLocation : null,
          mode: 'replace',
        })
      },
    })
  if (f.hasProduct && f.shortfall > 0.0001)
    items.push({
      label: t('req.review.takeFromStock'),
      onClick: () => {
        ctl.setStockFor({
          id: line.id,
          name: f.lineName,
          shortfall: f.shortfall,
          location: f.fromStock > 0 ? f.stockLocation : null,
          mode: 'take',
        })
      },
    })
  if (f.canUndo)
    items.push({
      label: t('req.review.undoStock'),
      onClick: () => {
        void ctl.undoStock({ variables: { requisitionId: ctl.requisitionId, lineId: line.id } })
      },
    })
  if (f.stockTaken > 0 && f.replaced.length === 0 && !f.canUndo)
    items.push({
      label: t('req.review.putBack'),
      onClick: () => {
        void ctl.putBackStock({ variables: { requisitionId: ctl.requisitionId, lineId: line.id } })
      },
    })
  items.push({
    label: t('req.review.removeItem'),
    tone: 'danger',
    onClick: () => {
      ctl.setRemoveLineReason('')
      ctl.setRemoveLineFor({ id: line.id, name: f.lineName })
    },
  })
  return items
}

/** The small arrow that opens a line's details. */
function DetailsToggle({
  open,
  label,
  onToggle,
}: {
  open: boolean
  label: string
  onToggle: () => void
}) {
  const { theme } = useTheme()
  const { ring, handlers } = useFocusRing()
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-label={label}
      onClick={onToggle}
      {...handlers}
      style={{
        width: '28px',
        height: '28px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: 'none',
        borderRadius: '8px',
        background: open ? theme.accentBg : 'transparent',
        color: theme.textSecondary,
        cursor: 'pointer',
        outline: 'none',
        boxShadow: ring ? menuFocusRing(theme) : 'none',
      }}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}
      >
        <path d="M3 5l4 4 4-4" />
      </svg>
    </button>
  )
}

/**
 * The Status column of the Lines table during the review: what happened to the line as a chip or two, an arrow that opens its
 * details, and a ⋯ menu with the rare actions (for someone who can act; the approver gets the chips and the details only).
 */
export function ReviewActionsCell({ ctl, line }: { ctl: ReviewController; line: ReviewLineRow }) {
  const { t } = useTranslation()
  const f = lineFacts(line)
  // While one of the line's purchases is being edited its Save / Cancel are the only buttons that matter.
  const editingHere = f.purchases.some((p) => p.id === ctl.editing?.id)
  const open = ctl.expanded.includes(line.id)
  const items = reviewLineMenuItems(ctl, line, t)

  return (
    // Two parts that never move: the chips on the left, one under the other; the arrow and the ⋯ together on the right, centred
    // on the row. Before, they wrapped under the chip wherever it ended, so every row looked different.
    <div
      data-testid="review-status-cell"
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) auto',
        alignItems: 'center',
        columnGap: '8px',
        // A wide column must not push the arrow and the menu away from their chips
        maxWidth: '220px',
      }}
    >
      <ReviewStatusChips line={line} stacked />
      <div
        data-testid="review-status-actions"
        style={{ display: 'flex', alignItems: 'center', gap: '2px' }}
      >
        <DetailsToggle
          open={open}
          label={t(open ? 'req.review.hideDetails' : 'req.review.showDetails', {
            item: f.lineName,
          })}
          onToggle={() => {
            ctl.toggleExpanded(line.id)
          }}
        />
        {ctl.canEdit && !editingHere && items.length > 0 && (
          <RowMenu items={items} ariaLabel={t('req.review.moreActions', { item: f.lineName })} />
        )}
      </div>
    </div>
  )
}

/**
 * The line above the Lines table during the review: how many items, how many changed, added, taken from stock or needing attention,
 * and a chip for what was removed that opens the list (a removed line has no row of its own).
 */
export function ReviewSummaryStrip({ ctl }: { ctl: ReviewController }) {
  const { t } = useTranslation()
  const { theme } = useTheme()
  if (!ctl.active) return null
  const chips = ctl.lines.map((l) => reviewLineChips(l))
  const count = (c: ReviewChip) => chips.filter((list) => list.includes(c)).length
  const removed = ctl.review?.removed_lines?.length ?? 0
  const pill = (key: string, n: number, variant: 'danger' | 'info' | 'warning') =>
    n > 0 && (
      <Badge key={key} variant={variant}>
        {t(key, { count: n })}
      </Badge>
    )
  return (
    <div
      data-testid="review-summary"
      style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '14px', fontWeight: 600, color: theme.textPrimary }}>
          {t('req.review.summaryItems', { count: ctl.lines.length })}
        </span>
        {pill('req.review.summaryAttention', count('attention'), 'danger')}
        {pill('req.review.summaryChanged', count('changed'), 'warning')}
        {pill('req.review.summaryAdded', count('added'), 'info')}
        {pill('req.review.summaryFromStock', count('fromStock'), 'info')}
        {removed > 0 && (
          <button
            type="button"
            aria-expanded={ctl.showRemoved}
            onClick={() => {
              ctl.setShowRemoved(!ctl.showRemoved)
            }}
            style={{
              border: `1px solid ${ctl.showRemoved ? theme.accentSolid : theme.borderField}`,
              background: theme.bgSurface,
              color: ctl.showRemoved ? theme.accentSolid : theme.textSecondary,
              borderRadius: '999px',
              padding: '2px 10px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {t('req.review.summaryRemoved', { count: removed })} {ctl.showRemoved ? '▴' : '▾'}
          </button>
        )}
      </div>
      {ctl.showRemoved && <ReviewRemovedLines ctl={ctl} />}
    </div>
  )
}

/**
 * The actions of a line in the phone sheet: the ordinary ones two to a row (one alone takes the row), the destructive one on a row
 * of its own underneath, so Remove item is never next to something it could be tapped instead of.
 */
function SheetActions({ items, onPick }: { items: MenuItem[]; onPick: (item: MenuItem) => void }) {
  const ordinary = items.filter((it) => it.tone !== 'danger')
  const destructive = items.filter((it) => it.tone === 'danger')
  return (
    <div
      data-testid="review-sheet-actions"
      style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
    >
      {ordinary.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: '8px',
          }}
        >
          {ordinary.map((it) => (
            <ActionButton
              key={it.label}
              fullWidth
              variant="outline"
              onClick={() => {
                onPick(it)
              }}
            >
              {it.label}
            </ActionButton>
          ))}
        </div>
      )}
      {destructive.map((it) => (
        <ActionButton
          key={it.label}
          fullWidth
          variant="danger"
          onClick={() => {
            onPick(it)
          }}
        >
          {it.label}
        </ActionButton>
      ))}
    </div>
  )
}

/**
 * The review on a phone: one compact card per line, and a sheet with everything about the line (its purchases with Change, the
 * details, and the rare actions) when a card is tapped. No card carries buttons of its own.
 */
export function ReviewPhoneList({
  ctl,
  renderNotes,
}: {
  ctl: ReviewController
  /** What the page offers for a line's own notes; shown at the bottom of the sheet. */
  renderNotes?: (line: ReviewLineRow) => React.ReactNode
}) {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const [openId, setOpenId] = useState<string | null>(null)
  if (!ctl.active) return null
  const openLine = ctl.lines.find((l) => l.id === openId) ?? null
  const openFacts = openLine ? lineFacts(openLine) : null

  const oneLine = (l: ReviewLineRow): string => {
    const f = lineFacts(l)
    const first = f.purchases.at(0)
    if (first) {
      const more = f.purchases.length - 1
      return `${fmt(first.qty)} @ ${fmt(purchaseUnitPrice(first))} ${first.currency_code} · ${first.vendor_name ?? '—'}${
        more > 0 ? ` ${t('req.review.summaryMorePurchases', { count: more })}` : ''
      }`
    }
    if (f.stockTaken > 0)
      return f.stockLocation
        ? t('req.review.stockTaken', { qty: fmt(f.stockTaken), location: f.stockLocation })
        : t('req.review.stockTakenNoWhere', { qty: fmt(f.stockTaken) })
    if (f.fromStock > 0) return t('req.review.statusFromInventory')
    return t('req.review.statusNotBought')
  }
  const totalOf = (l: ReviewLineRow): string => {
    const sums = reviewLineTotals(l)
    if (sums.length > 0) return sums.map((s) => `${fmt(s.amount)} ${s.currency}`).join(' + ')
    return `${fmt(l.total)} ${l.currency_code ?? ''}`.trim()
  }

  return (
    <>
      <div
        data-testid="review-phone-list"
        style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
      >
        {ctl.lines.map((l) => {
          const name = lineNameOf(l)
          return (
            <button
              key={l.id}
              type="button"
              data-testid="review-line-card"
              aria-label={t('req.review.openLine', { item: name })}
              onClick={() => {
                setOpenId(l.id)
              }}
              style={{
                width: '100%',
                textAlign: 'start',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                padding: '12px',
                borderRadius: '12px',
                border: `1px solid ${
                  financeFlaggedPurchases(l).length > 0
                    ? theme.danger
                    : l.review_added_at
                      ? theme.accentSolid
                      : theme.border
                }`,
                background:
                  financeFlaggedPurchases(l).length > 0 ? `${theme.danger}0c` : theme.bgSurface,
                color: theme.textPrimary,
                cursor: 'pointer',
                fontFamily: 'inherit',
                touchAction: 'manipulation',
              }}
            >
              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: '14px', fontWeight: 600 }}>
                  {name}
                </span>
                <span
                  style={{
                    fontSize: '14px',
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {totalOf(l)}
                </span>
              </div>
              <div style={{ fontSize: '13px', color: theme.textSecondary }}>{oneLine(l)}</div>
              {financeFlaggedPurchases(l).map((p) => (
                <div
                  key={p.id}
                  data-testid="finance-flag-card-reason"
                  style={{ fontSize: '13px', color: theme.danger, overflowWrap: 'anywhere' }}
                >
                  {p.finance_flag_reason}
                </div>
              ))}
              <div
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
              >
                <ReviewStatusChips line={l} />
                <span aria-hidden="true" style={{ color: theme.textSecondary }}>
                  ›
                </span>
              </div>
            </button>
          )
        })}
      </div>

      <Modal
        open={openLine !== null}
        onClose={() => {
          setOpenId(null)
        }}
        title={openFacts?.lineName ?? ''}
        size="sm"
      >
        {openLine && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <ReviewStatusChips line={openLine} />
            <ReviewPurchasesCell ctl={ctl} line={openLine} sheet />
            <ReviewLineDetails ctl={ctl} line={openLine} omitReceipts showFlagToggle />
            {ctl.canEdit && ctl.editing === null && (
              <SheetActions
                items={reviewLineMenuItems(ctl, openLine, t)}
                onPick={(it) => {
                  setOpenId(null)
                  it.onClick()
                }}
              />
            )}
            {renderNotes?.(openLine)}
          </div>
        )}
      </Modal>
    </>
  )
}

/** What was removed in this review, as it was: shown under the Lines table, because a removed line has no row there. */
export function ReviewRemovedLines({ ctl }: { ctl: ReviewController }) {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const removed = ctl.review?.removed_lines ?? []
  if (!ctl.active || removed.length === 0) return null
  return (
    <div
      data-testid="review-removed-lines"
      style={{
        borderTop: `1px solid ${theme.borderStrong}`,
        marginTop: '12px',
        paddingTop: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}
    >
      <div style={{ fontSize: '13px', fontWeight: 700, color: theme.textPrimary }}>
        {t('req.review.removedHeading')}
      </div>
      {removed.map((r) => (
        <div key={r.id} style={{ fontSize: '13px', color: theme.textPrimary }}>
          <div style={{ fontWeight: 600 }}>
            {t('req.review.removedLine', {
              name: orDash(r.description),
              qty: fmt(r.qty_ordered),
              unit: r.uom ?? '',
            })}
          </div>
          {r.purchases.map((pp, i) => (
            <div key={i} style={{ color: theme.textSecondary }}>
              {t('req.review.removedBought', {
                vendor: pp.vendor ?? '—',
                qty: fmt(pp.qty),
                price: fmt(pp.price),
                currency: pp.currency ?? '',
              })}
            </div>
          ))}
          <div style={{ color: theme.textSecondary }}>
            {t('req.review.removedBy', {
              name: r.removed_by_name ?? '—',
              reason: r.reason,
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── The slim card above the table, the dialogs and the action bar ────────────────────────────────────────

export interface OrganizerReviewPanelProps {
  ctl: ReviewController
  /**
   * An element at the very end of the page. The action bar is drawn into it so that it sticks to the bottom of the window
   * (a sticky bar only pins when it is the last thing in the page). Without one the bar is drawn right under the card.
   */
  barSlot?: HTMLElement | null
}

export function OrganizerReviewPanel({ ctl, barSlot }: OrganizerReviewPanelProps) {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const { review, requisition, inReview, inApproval, canEdit, organizerName } = ctl
  if (!ctl.active || !review || !requisition) return null

  const totalsText = (tot: ReviewData['totals'][number]) =>
    Math.abs(num(tot.was) - num(tot.now)) < 0.00005
      ? t('req.review.totalSame', { now: fmt(tot.now), currency: tot.currency_code })
      : t('req.review.totalChanged', {
          was: fmt(tot.was),
          now: fmt(tot.now),
          currency: tot.currency_code,
        })

  const reasonOk = ctl.reason.trim().length > 0
  const { editing } = ctl
  // The store keeper signs off items taken from stock before the administrator can approve (migration 335)
  const stockSignoff = review.stock_review ?? null
  const stockWaiting = inApproval && !!stockSignoff && stockSignoff.status !== 'approved'
  const canDecideStock = inApproval && !!review.caller_can_decide_stock
  // What the bar says beside its buttons: the administrator is told what holds the approval back; the store keeper that
  // theirs is done and the administrator is next; anyone else only that a PO Admin has it.
  const barStatusText: string | null = review.caller_can_approve
    ? stockWaiting
      ? stockSignoff.status === 'rejected'
        ? t('req.review.barStockRejected')
        : t('req.review.barWaitingStock')
      : null
    : canDecideStock
      ? stockSignoff?.status === 'approved'
        ? t('req.review.barStockDone')
        : null
      : t('req.review.barWaitingApproval')
  // Sending back needs a reason of its own or flagged lines (their reasons are used), and every flagged line needs its reason.
  const flagAutoReason = ctl.flaggedIds
    .map((id) => {
      const l = ctl.lines.find((x) => x.id === id)
      return `• ${l ? lineNameOf(l) : ''}: ${(ctl.flagged[id] ?? '').trim()}`
    })
    .join('\n')
  const rejectReasonText = ctl.reason.trim() || flagAutoReason
  const rejectOk = rejectReasonText.length > 0 && ctl.flagsValid

  const bar = (
    <>
      {inReview && (
        <StageActionBar
          stackButtonsOnPhone
          collapsible
          title={t('req.review.barReview')}
          hint={
            ctl.reopened ? t('req.review.barReviewHintReopened') : t('req.review.barReviewHint')
          }
          status={
            review.caller_can_edit ? (
              <span style={{ fontSize: '13px', color: theme.textSecondary }}>
                {review.needs_approval
                  ? t('req.review.barNeedsApproval', { reason: review.approval_reason ?? '' })
                  : ctl.reopened
                    ? t('req.review.barCanConfirmReopened')
                    : t('req.review.barCanConfirm')}
              </span>
            ) : (
              <span style={{ fontSize: '13px', color: theme.textSecondary }}>
                {t('req.review.barWaitingOrganizer', { name: organizerName })}
              </span>
            )
          }
        >
          {review.caller_can_edit && (
            <>
              {!ctl.reopened && (
                <ActionButton
                  variant="outline"
                  onClick={() => {
                    ctl.setReason('')
                    ctl.setRemoveIds([])
                    ctl.setSendBackOpen(true)
                  }}
                >
                  {t('req.review.sendBack')}
                </ActionButton>
              )}
              {review.needs_approval ? (
                <ActionButton
                  variant="solid"
                  loading={ctl.submitting}
                  disabled={editing !== null}
                  onClick={() =>
                    void ctl.submitReview({ variables: { requisitionId: requisition.id } })
                  }
                >
                  {t('req.review.submit')}
                </ActionButton>
              ) : (
                <ActionButton
                  variant="solid"
                  loading={ctl.confirming}
                  disabled={editing !== null}
                  onClick={() =>
                    void ctl.confirmReview({ variables: { requisitionId: requisition.id } })
                  }
                >
                  {ctl.reopened ? t('req.review.confirmReopened') : t('req.review.confirm')}
                </ActionButton>
              )}
            </>
          )}
        </StageActionBar>
      )}

      {inApproval && (
        <StageActionBar
          stackButtonsOnPhone
          collapsible
          title={
            review.caller_can_approve
              ? t('req.review.barApprove')
              : canDecideStock
                ? t('req.review.barStock')
                : t('req.review.barApproval')
          }
          hint={
            canDecideStock
              ? t('req.review.barStockHint')
              : ctl.reopened
                ? t('req.review.barApprovalHintReopened')
                : t('req.review.barApprovalHint')
          }
          status={
            barStatusText ? (
              <span
                data-testid="review-bar-status"
                style={{ fontSize: '13px', color: theme.textSecondary }}
              >
                {barStatusText}
              </span>
            ) : undefined
          }
        >
          {canDecideStock && (
            <>
              <ActionButton
                variant="outline"
                onClick={() => {
                  ctl.setStockReason('')
                  ctl.setStockRejectOpen(true)
                }}
              >
                {t('req.review.stockReject')}
              </ActionButton>
              <ActionButton
                variant={review.caller_can_approve ? 'outline' : 'solid'}
                loading={ctl.approvingStock}
                disabled={stockSignoff?.status === 'approved'}
                onClick={() =>
                  void ctl.approveStock({ variables: { requisitionId: requisition.id } })
                }
              >
                {t('req.review.stockApprove')}
              </ActionButton>
            </>
          )}
          {review.caller_can_approve && (
            <>
              <ActionButton
                variant="outline"
                onClick={() => {
                  ctl.setReason('')
                  ctl.setRejectOpen(true)
                }}
              >
                {t('req.review.reject')}
              </ActionButton>
              <ActionButton
                variant="solid"
                loading={ctl.approving}
                disabled={stockWaiting}
                onClick={() =>
                  void ctl.approveReview({ variables: { requisitionId: requisition.id } })
                }
              >
                {ctl.reopened ? t('req.review.approveReopened') : t('req.review.approve')}
              </ActionButton>
            </>
          )}
        </StageActionBar>
      )}
    </>
  )

  return (
    <>
      <Card style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {ctl.reopened && (
            <div
              data-testid="reopened-banner"
              style={{
                padding: '12px 14px',
                borderRadius: '10px',
                border: `1px solid ${theme.warning}`,
                background: `${theme.warning}1f`,
                color: theme.textPrimary,
                fontSize: '13px',
                lineHeight: 1.5,
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: '4px' }}>
                {t('req.review.reopenedTitle')}
              </div>
              <ul style={{ margin: 0, paddingInlineStart: '18px' }}>
                {ctl.reopenedPos.map((p) => (
                  <li key={p.id}>
                    {t('req.review.reopenedPo', {
                      po: p.po_number,
                      vendor: p.vendor_name ?? '—',
                      reason: p.reason ?? '—',
                    })}
                  </li>
                ))}
              </ul>
              <div style={{ marginTop: '6px', color: theme.textSecondary }}>
                {t('req.review.reopenedRules')}
              </div>
            </div>
          )}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: '12px',
              flexWrap: 'wrap',
            }}
          >
            <div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: theme.textPrimary }}>
                {inApproval ? t('req.review.titleApproval') : t('req.review.titleReview')}
              </div>
              <div style={{ fontSize: '13px', color: theme.textSecondary, marginTop: '4px' }}>
                {inApproval
                  ? review.caller_can_approve
                    ? t('req.review.introApprover', { name: organizerName })
                    : ctl.reopened
                      ? t('req.review.introWaitingApprovalReopened')
                      : t('req.review.introWaitingApproval')
                  : ctl.reopened
                    ? t('req.review.introReviewReopened')
                    : t('req.review.introReview')}
              </div>
            </div>
            {canEdit && (
              <ActionButton
                variant="outline"
                onClick={() => {
                  ctl.setAddOpen(true)
                }}
              >
                {t('req.review.addItem')}
              </ActionButton>
            )}
          </div>

          {inReview && review.last_rejection && (
            <div
              role="status"
              style={{
                border: `1px solid ${theme.warning}`,
                background: theme.warningBg,
                borderRadius: '10px',
                padding: '10px 12px',
                fontSize: '13px',
                color: theme.textPrimary,
              }}
            >
              <strong>
                {t('req.review.sentBackBy', { name: review.last_rejection.by_name ?? '' })}
              </strong>{' '}
              {review.last_rejection.reason ?? ''}
            </div>
          )}

          {review.approval_reason && (inApproval || review.needs_approval) && (
            <div style={{ fontSize: '13px', color: theme.textSecondary }}>
              {t('req.review.whyApproval', { reason: review.approval_reason })}
            </div>
          )}

          {inApproval && stockSignoff && (
            <div
              role="status"
              data-testid="review-stock-signoff"
              style={{
                border: `1px solid ${
                  stockSignoff.status === 'approved'
                    ? theme.success
                    : stockSignoff.status === 'rejected'
                      ? theme.danger
                      : theme.warning
                }`,
                borderRadius: '10px',
                padding: '10px 12px',
                fontSize: '13px',
                color: theme.textPrimary,
              }}
            >
              <strong>
                {stockSignoff.status === 'approved'
                  ? t('req.review.stockApprovedBy', { name: stockSignoff.by_name ?? '—' })
                  : stockSignoff.status === 'rejected'
                    ? t('req.review.stockRejectedBy', { name: stockSignoff.by_name ?? '—' })
                    : t('req.review.stockPending', { count: review.stocked_count })}
              </strong>
              {stockSignoff.status === 'rejected' && stockSignoff.reason
                ? ` ${stockSignoff.reason}`
                : ''}
            </div>
          )}

          {review.totals.length > 0 && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {review.totals.map((tot) => (
                <Badge
                  key={tot.currency_code}
                  variant={Math.abs(num(tot.was) - num(tot.now)) < 0.00005 ? 'neutral' : 'warning'}
                >
                  {totalsText(tot)}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </Card>

      <AddReviewItemModal
        open={ctl.addOpen}
        requisitionId={requisition.id}
        defaultCurrency={ctl.defaultCurrency}
        onClose={() => {
          ctl.setAddOpen(false)
        }}
        onAdded={ctl.onChanged}
      />

      <TakeFromStockModal
        line={ctl.stockFor}
        mode={ctl.stockFor?.mode}
        requisitionId={requisition.id}
        onClose={() => {
          ctl.setStockFor(null)
        }}
        onDone={ctl.onChanged}
      />

      <Modal
        open={ctl.removeLineFor !== null}
        onClose={() => {
          ctl.setRemoveLineFor(null)
        }}
        title={t('req.review.removeItemTitle', { item: ctl.removeLineFor?.name ?? '' })}
        size="md"
        footer={
          <>
            <ActionButton
              variant="outline"
              onClick={() => {
                ctl.setRemoveLineFor(null)
              }}
            >
              {t('req.review.cancel')}
            </ActionButton>
            <ActionButton
              variant="danger"
              loading={ctl.removingLine}
              disabled={ctl.removeLineReason.trim().length === 0}
              onClick={() => {
                if (!ctl.removeLineFor) return
                void ctl.removeLine({
                  variables: {
                    requisitionId: requisition.id,
                    lineId: ctl.removeLineFor.id,
                    reason: ctl.removeLineReason.trim(),
                  },
                })
              }}
            >
              {t('req.review.removeItemConfirm')}
            </ActionButton>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ fontSize: '13px', color: theme.textSecondary }}>
            {t('req.review.removeItemIntro')}
          </div>
          <div style={{ fontSize: '13px', color: theme.textPrimary }}>
            {t('req.review.removeItemWarn')}
          </div>
          <Textarea
            field
            label={t('req.review.removeItemReasonLabel')}
            placeholder={t('req.review.removeItemReasonPlaceholder')}
            value={ctl.removeLineReason}
            rows={3}
            autoFocus
            onChange={(e) => {
              ctl.setRemoveLineReason(e.target.value)
            }}
          />
        </div>
      </Modal>

      {barSlot ? createPortal(bar, barSlot) : bar}

      <Modal
        open={ctl.receiptsFor !== null}
        onClose={() => {
          ctl.setReceiptsFor(null)
        }}
        title={t('req.review.receiptsTitle')}
        size="md"
      >
        {ctl.receiptsFor && (
          <EntityAttachments
            entityType="po_line_purchase"
            entityId={ctl.receiptsFor}
            title={t('req.review.receiptsTitle')}
            category="attachment"
            readOnly
          />
        )}
      </Modal>

      <Modal
        open={ctl.sendBackOpen}
        onClose={() => {
          ctl.setSendBackOpen(false)
        }}
        title={t('req.review.sendBackTitle', { number: requisition.requisition_number })}
        size="md"
        footer={
          <>
            <ActionButton
              variant="outline"
              onClick={() => {
                ctl.setSendBackOpen(false)
              }}
            >
              {t('req.review.cancel')}
            </ActionButton>
            <ActionButton
              variant="solid"
              loading={ctl.sendingBack}
              disabled={!reasonOk}
              onClick={() =>
                void ctl.sendBack({
                  variables: {
                    requisitionId: requisition.id,
                    reason: ctl.reason.trim(),
                    purchaseIds: ctl.removeIds,
                  },
                })
              }
            >
              {t('req.review.sendBackConfirm')}
            </ActionButton>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ fontSize: '13px', color: theme.textSecondary }}>
            {t('req.review.sendBackIntro')}
          </div>
          <Textarea
            field
            label={t('req.review.reasonLabel')}
            placeholder={t('req.review.reasonPlaceholder')}
            value={ctl.reason}
            rows={3}
            autoFocus
            onChange={(e) => {
              ctl.setReason(e.target.value)
            }}
          />
          {ctl.purchaseRows.length > 0 && (
            <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
              <legend style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary }}>
                {t('req.review.removeTitle')}
              </legend>
              <div style={{ fontSize: '12px', color: theme.textSecondary, margin: '4px 0 8px' }}>
                {t('req.review.removeHint')}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {ctl.purchaseRows.map((p) => (
                  <label
                    key={p.id}
                    style={{
                      display: 'flex',
                      gap: '8px',
                      alignItems: 'center',
                      fontSize: '13px',
                      color: theme.textPrimary,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={ctl.removeIds.includes(p.id)}
                      onChange={(e) => {
                        ctl.setRemoveIds(
                          e.target.checked
                            ? [...ctl.removeIds, p.id]
                            : ctl.removeIds.filter((id) => id !== p.id),
                        )
                      }}
                    />
                    <span>
                      {p.lineName} — {p.vendor_name ?? ''}, {fmt(p.qty)} ×{' '}
                      {fmt(purchaseUnitPrice(p))} {p.currency_code}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
        </div>
      </Modal>

      <Modal
        open={ctl.stockRejectOpen}
        onClose={() => {
          ctl.setStockRejectOpen(false)
        }}
        title={t('req.review.stockRejectTitle')}
        size="md"
        footer={
          <>
            <ActionButton
              variant="outline"
              onClick={() => {
                ctl.setStockRejectOpen(false)
              }}
            >
              {t('req.review.cancel')}
            </ActionButton>
            <ActionButton
              variant="danger"
              loading={ctl.rejectingStock}
              disabled={ctl.stockReason.trim().length === 0}
              onClick={() =>
                void ctl.rejectStock({
                  variables: { requisitionId: requisition.id, reason: ctl.stockReason.trim() },
                })
              }
            >
              {t('req.review.stockRejectConfirm')}
            </ActionButton>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ fontSize: '13px', color: theme.textSecondary }}>
            {t('req.review.stockRejectIntro')}
          </div>
          <Textarea
            field
            label={t('req.review.reasonLabel')}
            placeholder={t('req.review.stockRejectPlaceholder')}
            value={ctl.stockReason}
            rows={3}
            autoFocus
            onChange={(e) => {
              ctl.setStockReason(e.target.value)
            }}
          />
        </div>
      </Modal>

      <Modal
        open={ctl.rejectOpen}
        onClose={() => {
          ctl.setRejectOpen(false)
        }}
        title={t('req.review.rejectTitle', { name: organizerName })}
        size="md"
        footer={
          <>
            <ActionButton
              variant="outline"
              onClick={() => {
                ctl.setRejectOpen(false)
              }}
            >
              {t('req.review.cancel')}
            </ActionButton>
            <ActionButton
              variant="danger"
              loading={ctl.rejecting}
              disabled={!rejectOk}
              onClick={() =>
                void ctl.rejectReview({
                  variables: {
                    requisitionId: requisition.id,
                    reason: rejectReasonText,
                    lineFlags: ctl.lineFlags.length > 0 ? ctl.lineFlags : undefined,
                  },
                })
              }
            >
              {t('req.review.rejectConfirm')}
            </ActionButton>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ fontSize: '13px', color: theme.textSecondary }}>
            {t('req.review.rejectIntro')}
          </div>
          {ctl.flaggedIds.length > 0 && (
            <div data-testid="review-reject-flags">
              <div
                style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  color: theme.textSecondary,
                  marginBottom: '6px',
                }}
              >
                {t('req.review.rejectFlagged', { count: ctl.flaggedIds.length })}
              </div>
              <ul
                style={{
                  margin: 0,
                  paddingInlineStart: '18px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                }}
              >
                {ctl.flaggedIds.map((id) => {
                  const l = ctl.lines.find((x) => x.id === id)
                  const text = (ctl.flagged[id] ?? '').trim()
                  return (
                    <li key={id} style={{ fontSize: '13px', color: theme.textPrimary }}>
                      <strong>{l ? lineNameOf(l) : ''}</strong>
                      {': '}
                      {text || (
                        <span style={{ color: theme.danger }}>
                          {t('req.review.flagNeedsReason')}
                        </span>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
          <Textarea
            field
            label={
              ctl.flaggedIds.length > 0
                ? t('req.review.reasonLabelOptional')
                : t('req.review.reasonLabel')
            }
            placeholder={t('req.review.reasonPlaceholder')}
            value={ctl.reason}
            rows={3}
            autoFocus
            onChange={(e) => {
              ctl.setReason(e.target.value)
            }}
          />
        </div>
      </Modal>
    </>
  )
}
