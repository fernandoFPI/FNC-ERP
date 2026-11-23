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
import { Modal } from '../ui/Modal'
import { Table } from '../ui/Table'
import type { Column } from '../ui/Table'
import { StageActionBar } from './StageActionBar'
import { LinePriceInput } from './LinePriceInput'
import { EntityAttachments } from '../inventory/EntityAttachments'
import { AddReviewItemModal } from './AddReviewItemModal'
import { TakeFromStockModal } from './TakeFromStockModal'
import {
  APPROVE_REVIEW,
  CONFIRM_REVIEW,
  EDIT_REVIEW_PURCHASE,
  PUT_BACK_REVIEW_STOCK,
  REJECT_REVIEW,
  REMOVE_REVIEW_LINE,
  SEND_BACK_TO_BUYING,
  SUBMIT_REVIEW_FOR_APPROVAL,
} from '../../graphql/requisitions'

// The organizer review (migration 329, playbook #115). After Items Bought and before any purchase order exists, the
// organizer double-checks what was bought. He may change a purchase's quantity or price (receipts are view-only), confirm,
// ask a PO Admin to approve what he changed, or send the requisition back to the buyers. A PO Admin approves or rejects.
// Every rule (who may do what, whether a PO Admin is needed) comes from the server in `review`; this component keeps no copy.

// The currencies the organizer can move a purchase to (the same short list as the add-an-item dialog); a purchase already
// in another currency keeps its own as a choice.
const REVIEW_CURRENCIES = ['IQD', 'USD', 'EUR', 'TRY', 'AED']

export interface ReviewPurchaseRow {
  id: string
  vendor_name?: string | null
  currency_code: string
  qty: string
  actual_unit_price: string
  bought_by?: string | null
  bought_by_name?: string | null
  over_tolerance: boolean
  tolerance_approved_by?: string | null
  receipt_file_id?: string | null
  review_original_qty?: string | null
  review_original_price?: string | null
  review_original_currency?: string | null
}

export interface ReviewLineRow {
  id: string
  line_number?: number | null
  description?: string | null
  product_name?: string | null
  /** Set on a line the organizer added in this review (migration 330). */
  review_added_at?: string | null
  /** The catalog item, when there is one: a custom item has no stock to take from. */
  product_id?: string | null
  /** What the line was ordered for, and what stock already covers (the inventory check, or an earlier take in this review). */
  qty?: string | null
  qty_from_stock?: string | null
  source_location_name?: string | null
  /** The quantity he took from stock instead of buying it in this review (migration 332). */
  review_stock_qty?: string | null
  purchases?: ReviewPurchaseRow[] | null
}

export interface ReviewRemovedLine {
  id: string
  line_number?: number | null
  description?: string | null
  qty_ordered?: string | null
  uom?: string | null
  reason: string
  removed_by_name?: string | null
  purchases: {
    vendor?: string | null
    qty?: string | null
    price?: string | null
    currency?: string | null
    had_receipt?: boolean | null
  }[]
}

export interface ReviewData {
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
  last_rejection?: { reason?: string | null; by_name?: string | null; at?: string | null } | null
  totals: { currency_code: string; was: string; now: string; purchases: number }[]
}

export interface OrganizerReviewPanelProps {
  requisition: {
    id: string
    requisition_number: string
    status: string
    organizerName?: string | null
    review?: ReviewData | null
    lines: ReviewLineRow[]
  }
  /** Called after any change, so the page reads the requisition again. */
  onChanged: () => void
  /**
   * An element at the very end of the page. The action bar is drawn into it so that it sticks to the bottom of the window
   * (a sticky bar only pins when it is the last thing in the page). Without one the bar is drawn right under the card.
   */
  barSlot?: HTMLElement | null
}

interface Row extends ReviewPurchaseRow {
  lineName: string
  lineId: string
  /** The line was added in this review. */
  added: boolean
  /** A line with nothing bought on it (covered from stock, or marked short): drawn as one row so it can still be removed. */
  noPurchase?: boolean
  /** The first row of its line: what belongs to the whole line (the stock notes and buttons) is drawn once, here. */
  firstOfLine: boolean
  /** What is left to cover on the line: ordered, minus stock, minus what was bought (zero or more). */
  shortfall: number
  /** The quantity taken from stock in this review, and where from. */
  stockTaken: number
  stockLocation: string | null
  hasProduct: boolean
  fromStock: number
}

// Up to four decimals: a price of 12.345 must not read 12.35 in a screen that is about checking prices.
const fmt = (n: string | number | null | undefined) =>
  parseFloat(String(n ?? 0)).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  })
const num = (n: string | null | undefined) => parseFloat(String(n ?? 0)) || 0
// An empty product name or description must still fall back, so this tests for text rather than for null.
// A removed line's name: an empty description still falls back to a dash, so this tests for text rather than for null.
function orDash(s: string | null | undefined): string {
  if (s) return s
  return '—'
}
function lineNameOf(l: ReviewLineRow): string {
  if (l.product_name) return l.product_name
  if (l.description) return l.description
  return '—'
}

export function OrganizerReviewPanel({
  requisition,
  onChanged,
  barSlot,
}: OrganizerReviewPanelProps) {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)
  const review = requisition.review
  const inReview = requisition.status === 'organizer_review'
  const inApproval = requisition.status === 'review_approval'

  const [editing, setEditing] = useState<{
    id: string
    qty: string
    price: string
    currency: string
  } | null>(null)
  const [receiptsFor, setReceiptsFor] = useState<string | null>(null)
  const [sendBackOpen, setSendBackOpen] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [removeIds, setRemoveIds] = useState<string[]>([])
  const [addOpen, setAddOpen] = useState(false)
  const [removeLineFor, setRemoveLineFor] = useState<{ id: string; name: string } | null>(null)
  const [stockFor, setStockFor] = useState<{
    id: string
    name: string
    shortfall: number
    location?: string | null
  } | null>(null)
  const [removeLineReason, setRemoveLineReason] = useState('')

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
    onCompleted: done(t('req.review.toastConfirmed')),
    onError: failed,
  })
  const [submitReview, { loading: submitting }] = useMutation(SUBMIT_REVIEW_FOR_APPROVAL, {
    onCompleted: done(t('req.review.toastSubmitted')),
    onError: failed,
  })
  const [approveReview, { loading: approving }] = useMutation(APPROVE_REVIEW, {
    onCompleted: done(t('req.review.toastApproved')),
    onError: failed,
  })
  const [rejectReview, { loading: rejecting }] = useMutation(REJECT_REVIEW, {
    onCompleted: () => {
      setRejectOpen(false)
      setReason('')
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
  const [sendBack, { loading: sendingBack }] = useMutation(SEND_BACK_TO_BUYING, {
    onCompleted: () => {
      setSendBackOpen(false)
      setReason('')
      setRemoveIds([])
      done(t('req.review.toastSentBack'))()
    },
    onError: failed,
  })

  if (!review) return null

  const rows: Row[] = [...requisition.lines]
    .sort((a, b) => (a.line_number ?? 0) - (b.line_number ?? 0))
    .flatMap((l): Row[] => {
      const purchases = l.purchases ?? []
      const bought = purchases.reduce((s, p) => s + num(p.qty), 0)
      const base = {
        lineName: lineNameOf(l),
        lineId: l.id,
        added: !!l.review_added_at,
        shortfall: Math.max(num(l.qty) - num(l.qty_from_stock) - bought, 0),
        stockTaken: num(l.review_stock_qty),
        stockLocation: l.source_location_name ?? null,
        hasProduct: !!l.product_id,
        fromStock: num(l.qty_from_stock),
      }
      if (purchases.length === 0)
        return [
          {
            ...base,
            firstOfLine: true,
            id: `line:${l.id}`,
            currency_code: '',
            qty: '',
            actual_unit_price: '',
            over_tolerance: false,
            noPurchase: true,
          },
        ]
      return purchases.map((p, i) => ({ ...p, ...base, firstOfLine: i === 0 }))
    })
  // Purchases only: what the "send back" dialog can remove and what the totals are about.
  const purchaseRows = rows.filter((r) => !r.noPurchase)
  const defaultCurrency = review.totals.length === 1 ? review.totals[0]?.currency_code : undefined

  const canEdit = inReview && review.caller_can_edit
  const changed = (p: ReviewPurchaseRow) =>
    p.review_original_qty != null ||
    p.review_original_price != null ||
    p.review_original_currency != null

  const startEdit = (p: Row) => {
    setEditing({
      id: p.id,
      qty: String(num(p.qty)),
      price: String(num(p.actual_unit_price)),
      currency: p.currency_code,
    })
  }
  const saveEdit = (p: Row) => {
    if (!editing) return
    const qty = parseFloat(editing.qty)
    const price = parseFloat(editing.price)
    if (!(qty > 0) || !(price > 0)) {
      addToast({ message: t('req.review.numbersMustBePositive'), type: 'error' })
      return
    }
    const qtyChanged = Math.abs(qty - num(p.qty)) > 0.00005
    const priceChanged = Math.abs(price - num(p.actual_unit_price)) > 0.00005
    const currencyChanged = editing.currency !== p.currency_code
    if (!qtyChanged && !priceChanged && !currencyChanged) {
      setEditing(null)
      return
    }
    void editPurchase({
      variables: {
        purchaseId: p.id,
        qty: qtyChanged ? qty : undefined,
        actualUnitPrice: priceChanged ? price : undefined,
        currencyCode: currencyChanged ? editing.currency : undefined,
      },
    })
  }

  const columns: Column<Row>[] = [
    {
      key: 'item',
      header: t('req.review.item'),
      wrap: true,
      minWidth: '160px',
      mobilePrimary: true,
      render: (p) => (
        <div>
          <span style={{ fontWeight: 600, color: theme.textPrimary }}>{p.lineName}</span>
          {p.firstOfLine && p.stockTaken > 0 && (
            <div style={{ fontSize: '12px', color: theme.info }}>
              {p.stockLocation
                ? t('req.review.stockTaken', { qty: fmt(p.stockTaken), location: p.stockLocation })
                : t('req.review.stockTakenNoWhere', { qty: fmt(p.stockTaken) })}
            </div>
          )}
          {p.firstOfLine && p.shortfall > 0.0001 && !p.noPurchase && (
            <div style={{ fontSize: '12px', color: theme.textSecondary }}>
              {t('req.review.notBought', { n: fmt(p.shortfall) })}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'vendor',
      header: t('req.review.vendor'),
      wrap: true,
      minWidth: '120px',
      render: (p) =>
        p.noPurchase ? (
          <span style={{ color: theme.textSecondary, fontSize: '13px' }}>
            {t('req.review.noPurchase')}
          </span>
        ) : (
          <span style={{ color: theme.textPrimary }}>{p.vendor_name ?? '—'}</span>
        ),
    },
    {
      key: 'qty',
      header: t('req.review.qty'),
      render: (p) =>
        p.noPurchase ? (
          <span style={{ color: theme.textSecondary }}>—</span>
        ) : editing?.id === p.id ? (
          <LinePriceInput
            value={editing.qty}
            width="96px"
            placeholder="0"
            invalid={!(parseFloat(editing.qty) > 0)}
            onChange={(v) => {
              setEditing({ ...editing, qty: v })
            }}
            ariaLabel={t('req.review.qtyOf', { item: p.lineName })}
          />
        ) : (
          <div>
            <span style={{ fontWeight: 600, color: theme.textPrimary }}>{fmt(p.qty)}</span>
            {p.review_original_qty != null && (
              <div style={{ fontSize: '12px', color: theme.textSecondary }}>
                {t('req.review.was', { value: fmt(p.review_original_qty) })}
              </div>
            )}
          </div>
        ),
    },
    {
      key: 'price',
      header: t('req.review.unitPrice'),
      render: (p) =>
        p.noPurchase ? (
          <span style={{ color: theme.textSecondary }}>—</span>
        ) : editing?.id === p.id ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <LinePriceInput
              value={editing.price}
              invalid={!(parseFloat(editing.price) > 0)}
              onChange={(v) => {
                setEditing({ ...editing, price: v })
              }}
              ariaLabel={t('req.review.priceOf', { item: p.lineName })}
            />
            <select
              aria-label={t('req.review.currencyOf', { item: p.lineName })}
              value={editing.currency}
              onChange={(e) => {
                setEditing({ ...editing, currency: e.target.value })
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
          </div>
        ) : (
          <div>
            <span style={{ fontWeight: 600, color: theme.textPrimary }}>
              {fmt(p.actual_unit_price)} {p.currency_code}
            </span>
            {p.review_original_price != null && (
              <div style={{ fontSize: '12px', color: theme.textSecondary }}>
                {t('req.review.was', {
                  value:
                    p.review_original_currency != null &&
                    p.review_original_currency !== p.currency_code
                      ? `${fmt(p.review_original_price)} ${p.review_original_currency}`
                      : fmt(p.review_original_price),
                })}
              </div>
            )}
          </div>
        ),
    },
    {
      key: 'total',
      header: t('req.review.total'),
      render: (p) =>
        p.noPurchase ? (
          <span style={{ color: theme.textSecondary }}>—</span>
        ) : (
          <span style={{ fontWeight: 600, color: theme.textPrimary }}>
            {fmt(num(p.qty) * num(p.actual_unit_price))} {p.currency_code}
          </span>
        ),
    },
    {
      key: 'receipts',
      header: t('req.review.receipts'),
      render: (p) =>
        p.noPurchase ? (
          <span style={{ color: theme.textSecondary }}>—</span>
        ) : p.receipt_file_id ? (
          <ActionButton
            variant="ghost"
            size="sm"
            onClick={() => {
              setReceiptsFor(p.id)
            }}
          >
            {t('req.review.viewReceipts')}
          </ActionButton>
        ) : (
          <span style={{ color: theme.danger, fontSize: '13px' }}>{t('req.review.noReceipt')}</span>
        ),
    },
    {
      key: 'boughtBy',
      header: t('req.review.boughtBy'),
      wrap: true,
      minWidth: '110px',
      render: (p) => (
        <span style={{ color: theme.textSecondary }}>
          {p.noPurchase ? '—' : (p.bought_by_name ?? '—')}
        </span>
      ),
    },
    {
      key: 'state',
      header: t('req.review.state'),
      mobileAction: true,
      render: (p) => (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
          {p.added && <Badge variant="info">{t('req.review.addedBadge')}</Badge>}
          {changed(p) && <Badge variant="warning">{t('req.review.changed')}</Badge>}
          {p.over_tolerance && (
            <Badge variant={p.tolerance_approved_by ? 'success' : 'danger'}>
              {t('req.review.overTolerance')}
            </Badge>
          )}
          {editing?.id === p.id ? (
            <>
              <ActionButton
                variant="solid"
                size="sm"
                loading={editSaving}
                onClick={() => {
                  saveEdit(p)
                }}
              >
                {t('req.review.save')}
              </ActionButton>
              <ActionButton
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditing(null)
                }}
              >
                {t('req.review.cancel')}
              </ActionButton>
            </>
          ) : (
            canEdit && (
              <>
                {!p.noPurchase && (
                  <ActionButton
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      startEdit(p)
                    }}
                  >
                    {t('req.review.change')}
                  </ActionButton>
                )}
                {p.firstOfLine && p.hasProduct && p.shortfall > 0.0001 && (
                  <ActionButton
                    variant="outline"
                    size="sm"
                    ariaLabel={t('req.review.takeFromStockAria', { item: p.lineName })}
                    onClick={() => {
                      setStockFor({
                        id: p.lineId,
                        name: p.lineName,
                        shortfall: p.shortfall,
                        location: p.fromStock > 0 ? p.stockLocation : null,
                      })
                    }}
                  >
                    {t('req.review.takeFromStock')}
                  </ActionButton>
                )}
                {p.firstOfLine && p.stockTaken > 0 && (
                  <ActionButton
                    variant="ghost"
                    size="sm"
                    loading={puttingBack}
                    ariaLabel={t('req.review.putBackAria', { item: p.lineName })}
                    onClick={() => {
                      void putBackStock({
                        variables: { requisitionId: requisition.id, lineId: p.lineId },
                      })
                    }}
                  >
                    {t('req.review.putBack')}
                  </ActionButton>
                )}
                <ActionButton
                  variant="ghost"
                  size="sm"
                  ariaLabel={t('req.review.removeItemAria', { item: p.lineName })}
                  onClick={() => {
                    setRemoveLineReason('')
                    setRemoveLineFor({ id: p.lineId, name: p.lineName })
                  }}
                >
                  {t('req.review.removeItem')}
                </ActionButton>
              </>
            )
          )}
          {p.added && (inApproval || canEdit) && (
            <span style={{ fontSize: '12px', color: theme.textSecondary }}>
              {t('req.review.addedNote')}
            </span>
          )}
        </div>
      ),
    },
  ]

  const organizerName = requisition.organizerName ?? ''
  const totalsText = (tot: ReviewData['totals'][number]) =>
    Math.abs(num(tot.was) - num(tot.now)) < 0.00005
      ? t('req.review.totalSame', { now: fmt(tot.now), currency: tot.currency_code })
      : t('req.review.totalChanged', {
          was: fmt(tot.was),
          now: fmt(tot.now),
          currency: tot.currency_code,
        })

  const reasonOk = reason.trim().length > 0

  const bar = (
    <>
      {inReview && (
        <StageActionBar
          title={t('req.review.barReview')}
          hint={t('req.review.barReviewHint')}
          status={
            review.caller_can_edit ? (
              <span style={{ fontSize: '13px', color: theme.textSecondary }}>
                {review.needs_approval
                  ? t('req.review.barNeedsApproval', { reason: review.approval_reason ?? '' })
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
              <ActionButton
                variant="outline"
                onClick={() => {
                  setReason('')
                  setRemoveIds([])
                  setSendBackOpen(true)
                }}
              >
                {t('req.review.sendBack')}
              </ActionButton>
              {review.needs_approval ? (
                <ActionButton
                  variant="solid"
                  loading={submitting}
                  disabled={editing !== null}
                  onClick={() =>
                    void submitReview({ variables: { requisitionId: requisition.id } })
                  }
                >
                  {t('req.review.submit')}
                </ActionButton>
              ) : (
                <ActionButton
                  variant="solid"
                  loading={confirming}
                  disabled={editing !== null}
                  onClick={() =>
                    void confirmReview({ variables: { requisitionId: requisition.id } })
                  }
                >
                  {t('req.review.confirm')}
                </ActionButton>
              )}
            </>
          )}
        </StageActionBar>
      )}

      {inApproval && (
        <StageActionBar
          title={
            review.caller_can_approve ? t('req.review.barApprove') : t('req.review.barApproval')
          }
          hint={t('req.review.barApprovalHint')}
          status={
            review.caller_can_approve ? undefined : (
              <span style={{ fontSize: '13px', color: theme.textSecondary }}>
                {t('req.review.barWaitingApproval')}
              </span>
            )
          }
        >
          {review.caller_can_approve && (
            <>
              <ActionButton
                variant="outline"
                onClick={() => {
                  setReason('')
                  setRejectOpen(true)
                }}
              >
                {t('req.review.reject')}
              </ActionButton>
              <ActionButton
                variant="solid"
                loading={approving}
                onClick={() => void approveReview({ variables: { requisitionId: requisition.id } })}
              >
                {t('req.review.approve')}
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
                    : t('req.review.introWaitingApproval')
                  : t('req.review.introReview')}
              </div>
            </div>
            {canEdit && (
              <ActionButton
                variant="outline"
                onClick={() => {
                  setAddOpen(true)
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

          <Table<Row>
            columns={columns}
            data={rows}
            rowKey="id"
            emptyMessage={t('req.review.nothingBought')}
            mobileLayout="fields"
            readable
          />

          {(review.removed_lines ?? []).length > 0 && (
            <div
              data-testid="review-removed-lines"
              style={{
                borderTop: `1px solid ${theme.borderStrong}`,
                paddingTop: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ fontSize: '13px', fontWeight: 700, color: theme.textPrimary }}>
                {t('req.review.removedHeading')}
              </div>
              {(review.removed_lines ?? []).map((r) => (
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
          )}
        </div>
      </Card>

      <AddReviewItemModal
        open={addOpen}
        requisitionId={requisition.id}
        defaultCurrency={defaultCurrency}
        onClose={() => {
          setAddOpen(false)
        }}
        onAdded={onChanged}
      />

      <TakeFromStockModal
        line={stockFor}
        requisitionId={requisition.id}
        onClose={() => {
          setStockFor(null)
        }}
        onDone={onChanged}
      />

      <Modal
        open={removeLineFor !== null}
        onClose={() => {
          setRemoveLineFor(null)
        }}
        title={t('req.review.removeItemTitle', { item: removeLineFor?.name ?? '' })}
        size="md"
        footer={
          <>
            <ActionButton
              variant="outline"
              onClick={() => {
                setRemoveLineFor(null)
              }}
            >
              {t('req.review.cancel')}
            </ActionButton>
            <ActionButton
              variant="danger"
              loading={removingLine}
              disabled={removeLineReason.trim().length === 0}
              onClick={() => {
                if (!removeLineFor) return
                void removeLine({
                  variables: {
                    requisitionId: requisition.id,
                    lineId: removeLineFor.id,
                    reason: removeLineReason.trim(),
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
            value={removeLineReason}
            rows={3}
            autoFocus
            onChange={(e) => {
              setRemoveLineReason(e.target.value)
            }}
          />
        </div>
      </Modal>

      {barSlot ? createPortal(bar, barSlot) : bar}

      <Modal
        open={receiptsFor !== null}
        onClose={() => {
          setReceiptsFor(null)
        }}
        title={t('req.review.receiptsTitle')}
        size="md"
      >
        {receiptsFor && (
          <EntityAttachments
            entityType="po_line_purchase"
            entityId={receiptsFor}
            title={t('req.review.receiptsTitle')}
            category="attachment"
            readOnly
          />
        )}
      </Modal>

      <Modal
        open={sendBackOpen}
        onClose={() => {
          setSendBackOpen(false)
        }}
        title={t('req.review.sendBackTitle', { number: requisition.requisition_number })}
        size="md"
        footer={
          <>
            <ActionButton
              variant="outline"
              onClick={() => {
                setSendBackOpen(false)
              }}
            >
              {t('req.review.cancel')}
            </ActionButton>
            <ActionButton
              variant="solid"
              loading={sendingBack}
              disabled={!reasonOk}
              onClick={() =>
                void sendBack({
                  variables: {
                    requisitionId: requisition.id,
                    reason: reason.trim(),
                    purchaseIds: removeIds,
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
            value={reason}
            rows={3}
            autoFocus
            onChange={(e) => {
              setReason(e.target.value)
            }}
          />
          {purchaseRows.length > 0 && (
            <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
              <legend style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary }}>
                {t('req.review.removeTitle')}
              </legend>
              <div style={{ fontSize: '12px', color: theme.textSecondary, margin: '4px 0 8px' }}>
                {t('req.review.removeHint')}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {purchaseRows.map((p) => (
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
                      checked={removeIds.includes(p.id)}
                      onChange={(e) => {
                        setRemoveIds((prev) =>
                          e.target.checked ? [...prev, p.id] : prev.filter((id) => id !== p.id),
                        )
                      }}
                    />
                    <span>
                      {p.lineName} — {p.vendor_name ?? ''}, {fmt(p.qty)} ×{' '}
                      {fmt(p.actual_unit_price)} {p.currency_code}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
        </div>
      </Modal>

      <Modal
        open={rejectOpen}
        onClose={() => {
          setRejectOpen(false)
        }}
        title={t('req.review.rejectTitle', { name: organizerName })}
        size="md"
        footer={
          <>
            <ActionButton
              variant="outline"
              onClick={() => {
                setRejectOpen(false)
              }}
            >
              {t('req.review.cancel')}
            </ActionButton>
            <ActionButton
              variant="danger"
              loading={rejecting}
              disabled={!reasonOk}
              onClick={() =>
                void rejectReview({
                  variables: { requisitionId: requisition.id, reason: reason.trim() },
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
          <Textarea
            field
            label={t('req.review.reasonLabel')}
            placeholder={t('req.review.reasonPlaceholder')}
            value={reason}
            rows={3}
            autoFocus
            onChange={(e) => {
              setReason(e.target.value)
            }}
          />
        </div>
      </Modal>
    </>
  )
}
