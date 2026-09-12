import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@apollo/client'
import {
  REQUISITION_QUERY,
  REQUISITION_CHILD_POS_QUERY,
  REQUISITION_STOCK_AVAILABILITY_QUERY,
  SUBMIT_REQUISITION_TO_INVENTORY_CHECK,
  CONFIRM_REQUISITION_INVENTORY_CHECK,
  SUBMIT_REQUISITION_STORE_PRICING,
  SUBMIT_REQUISITION_MARKET_PRICING,
  VERIFY_REQUISITION_PRICES,
  APPROVE_REQUISITION,
  REJECT_REQUISITION_APPROVAL,
  CANCEL_REQUISITION,
  SUBMIT_REQUISITION_EDIT_REQUEST,
  APPROVE_REQUISITION_EDIT_REQUEST,
  REJECT_REQUISITION_EDIT_REQUEST,
} from '../../../graphql/requisitions'
import { STOCK_LOCATIONS_QUERY } from '../../../graphql/inventory'
import { useAuthStore } from '../../../store/authStore'
import { useTheme } from '../../../theme/ThemeContext'
import { usePermission } from '../../../hooks/usePermission'
import { usePagePadding } from '../../../hooks/usePagePadding'
import { useEntityChanged } from '../../../hooks/useEntityChanged'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { StatusBar } from '../../../components/ui/StatusBar'
import { TabBar } from '../../../components/ui/TabBar'
import type { Column } from '../../../components/ui/Table'
import { Table } from '../../../components/ui/Table'
import { Input } from '../../../components/ui/Input'
import { Select } from '../../../components/ui/Select'
import { LineItemEditor, type LineItemField } from '../../../components/ui/LineItemEditor'
import {
  REQUISITION_STATUSES,
  REQUISITION_PRIORITY_LABELS,
  getRequisitionStatusVariant,
  getRequisitionStatusLabel,
} from '../../../lib/requisition-constants'
import { getPOStatusVariant, getPOStatusLabel } from '../../../lib/po-constants'
import { useToastStore } from '../../../store/toastStore'

const CURRENCIES = ['IQD', 'USD', 'EUR', 'TRY', 'AED']

// Statuses where per-vendor children may already exist (forked at Finish
// Buying, which happens on approveRequisition) — used to skip and to
// render the children section.
const CHILD_PO_VISIBLE_STATUSES = ['approved', 'items_bought', 'sourcing', 'completed']

interface Purchase {
  id: string
  vendor_id: string
  vendor_name?: string | null
  currency_code: string
  qty: string
  actual_unit_price: string
  bought_at: string
  over_tolerance: boolean
}

interface ReqLine {
  id: string
  description?: string | null
  product_id?: string | null
  product_name?: string | null
  sku?: string | null
  qty: string
  uom?: string | null
  currency_code: string
  unit_price: string
  initial_unit_price?: string | null
  qty_from_stock?: string | null
  source_location_id?: string | null
  source_location_name?: string | null
  store_price?: string | null
  store_price_currency?: string | null
  market_price?: string | null
  market_price_currency?: string | null
  verified_price?: string | null
  verified_price_currency?: string | null
  total: string
  qty_received?: string | null
  actual_unit_price?: string | null
  short_reason?: string | null
  short_marked_at?: string | null
  closed_at?: string | null
  closed_reason?: string | null
  purchases?: Purchase[] | null
}

interface ApprovalLogEntry {
  id: string
  from_status: string
  to_status: string
  action: string
  actor_id: string
  actor_name?: string | null
  actor_position?: string | null
  notes?: string | null
  created_at: string
}

interface EditRequest {
  id: string
  status: string
  changes: string
  request_notes?: string | null
  requested_by_email?: string | null
  reviewed_by_email?: string | null
  review_notes?: string | null
  reviewed_at?: string | null
  created_at: string
}

// Fields kept in step with applyRequisitionEditChanges' own whitelist
// (resolvers.ts) — header notes/priority, line description/qty_ordered/
// unit_price/uom. delivery_destination/branch_id and line product_id are
// also backend-allowed but left out of this form to keep it to the fields
// someone would realistically want to correct mid-flight.
interface EditLineDraft {
  id: string
  description: string
  qty: number
  unit_price: number
  uom: string
  _removed?: boolean
}
interface EditDraft {
  notes: string
  priority: string
  lines: EditLineDraft[]
  linesAdded: { description: string; qty: number; unit_price: number; uom: string }[]
}
type Tab = 'lines' | 'log' | 'changes'

interface Requisition {
  id: string
  requisition_number: string
  status: string
  priority?: string | null
  purpose?: string | null
  delivery_destination?: string | null
  project_id?: string | null
  projectName?: string | null
  branch_id?: string | null
  branch_name?: string | null
  organizer_id?: string | null
  organizerName?: string | null
  notes?: string | null
  created_at: string
  updated_at: string
  callerHasStoreKeeperPosition?: boolean
  callerHasStorePricingPosition?: boolean
  callerHasMarketPricingPosition?: boolean
  callerHasPriceVerificationPosition?: boolean
  callerCanApprove?: boolean
  currencyTotals: { currency_code: string; subtotal: string; line_count: number }[]
  lines: ReqLine[]
  approval_log: ApprovalLogEntry[]
  edit_requests?: EditRequest[] | null
}

interface ChildPO {
  id: string
  po_number: string
  status: string
  vendor_id?: string | null
  vendor_name?: string | null
  total_amount: string
  currency_code: string
  created_at: string
}

interface LineLocationAvailability {
  companyId: string
  companyName: string
  locationId: string
  locationName: string
  qtyOnHand: number
  qtyAvailable: number
}

interface LineAvailability {
  lineId: string
  qtyRequired: number
  qtyOnHand: number
  qtyAvailable: number
  isAvailable: boolean
  byLocation: LineLocationAvailability[]
}

const fmtN = (n: string | number | null | undefined) =>
  parseFloat(String(n ?? 0)).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

export default function RequisitionDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { theme } = useTheme()
  const { isSystemLevel } = usePermission()
  const currentUserId = useAuthStore((s) => s.user?.id)
  const addToast = useToastStore((s) => s.addToast)
  const padding = usePagePadding()

  const { data, loading, refetch } = useQuery(REQUISITION_QUERY, {
    variables: { id },
    skip: !id,
    fetchPolicy: 'cache-and-network',
  })
  useEntityChanged('requisition', () => void refetch())
  const req: Requisition | undefined = data?.requisition

  const onErr = (e: Error) => addToast({ type: 'error', message: e.message })
  const mutOpts = {
    onCompleted: () => void refetch(),
    onError: onErr,
  }

  const [submitToInventory, { loading: lSubmit }] = useMutation(
    SUBMIT_REQUISITION_TO_INVENTORY_CHECK,
    mutOpts,
  )
  const [confirmInventory, { loading: lConfirm }] = useMutation(
    CONFIRM_REQUISITION_INVENTORY_CHECK,
    mutOpts,
  )
  const [submitStorePricing, { loading: lStore }] = useMutation(SUBMIT_REQUISITION_STORE_PRICING, mutOpts)
  const [submitMarketPricing, { loading: lMarket }] = useMutation(
    SUBMIT_REQUISITION_MARKET_PRICING,
    mutOpts,
  )
  const [verifyPrices, { loading: lVerify }] = useMutation(VERIFY_REQUISITION_PRICES, mutOpts)
  const [approve, { loading: lApprove }] = useMutation(APPROVE_REQUISITION, mutOpts)
  const [reject, { loading: lReject }] = useMutation(REJECT_REQUISITION_APPROVAL, {
    onCompleted: () => {
      setRejectReason('')
      void refetch()
    },
    onError: onErr,
  })
  const [cancel, { loading: lCancel }] = useMutation(CANCEL_REQUISITION, {
    onCompleted: () => {
      setCancelReason('')
      void refetch()
    },
    onError: onErr,
  })
  const [submitEditRequest, { loading: leSubmit }] = useMutation(SUBMIT_REQUISITION_EDIT_REQUEST, {
    onCompleted: () => {
      setEditDraft(null)
      void refetch()
    },
    onError: onErr,
  })
  const [approveEditRequest, { loading: leApprove }] = useMutation(
    APPROVE_REQUISITION_EDIT_REQUEST,
    mutOpts,
  )
  const [rejectEditRequest, { loading: leReject }] = useMutation(REJECT_REQUISITION_EDIT_REQUEST, mutOpts)

  const showChildren = !!req && CHILD_PO_VISIBLE_STATUSES.includes(req.status)
  const { data: childData } = useQuery(REQUISITION_CHILD_POS_QUERY, {
    variables: { requisitionId: id },
    skip: !id || !showChildren,
    fetchPolicy: 'cache-and-network',
  })
  const children: ChildPO[] = childData?.requisitionChildPurchaseOrders ?? []

  const { data: locData } = useQuery(STOCK_LOCATIONS_QUERY, {
    variables: { isActive: true },
    skip: !req || req.status !== 'inventory_check',
  })
  const locations: { id: string; name: string }[] = locData?.stockLocations ?? []

  const { data: availData } = useQuery(REQUISITION_STOCK_AVAILABILITY_QUERY, {
    variables: { requisitionId: id },
    skip: !id || !req || req.status !== 'inventory_check',
    fetchPolicy: 'cache-and-network',
  })
  const availabilityByLine = new Map<string, LineAvailability>(
    (availData?.requisitionStockAvailability ?? []).map((a: LineAvailability) => [a.lineId, a]),
  )

  // ── Per-line form state (keyed by lineId) ───────────────────────────────
  const [invQty, setInvQty] = useState<Record<string, string>>({})
  const [invLoc, setInvLoc] = useState<Record<string, string>>({})
  const [storePrices, setStorePrices] = useState<Record<string, string>>({})
  const [marketPrices, setMarketPrices] = useState<Record<string, string>>({})
  const [marketCurrency, setMarketCurrency] = useState<Record<string, string>>({})
  const [quoteRefs, setQuoteRefs] = useState<Record<string, string>>({})
  const [verifiedPrices, setVerifiedPrices] = useState<Record<string, string>>({})
  const [rejectReason, setRejectReason] = useState('')
  const [cancelReason, setCancelReason] = useState('')
  const [showCancelBox, setShowCancelBox] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>('lines')
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null)
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({})

  if (!id) return null

  if (loading && !req) {
    return (
      <div style={{ ...padding, maxWidth: '1100px', margin: '0 auto' }}>
        <div style={{ color: theme.textMuted, fontSize: '13px' }}>Loading requisition…</div>
      </div>
    )
  }

  if (!req) {
    return (
      <div style={{ ...padding, maxWidth: '1100px', margin: '0 auto' }}>
        <div style={{ color: theme.textMuted, fontSize: '13px' }}>Requisition not found.</div>
      </div>
    )
  }

  const isOrganizer = req.organizer_id === currentUserId
  const canSubmitDraft = isSystemLevel || isOrganizer
  const canConfirmInventory = isSystemLevel || isOrganizer || !!req.callerHasStoreKeeperPosition
  const canStorePrice = isSystemLevel || !!req.callerHasStorePricingPosition
  const canMarketPrice = isSystemLevel || !!req.callerHasMarketPricingPosition
  const canVerifyPrice = isSystemLevel || !!req.callerHasPriceVerificationPosition
  const canApprove = isSystemLevel || !!req.callerCanApprove
  const canCancel =
    isSystemLevel || isOrganizer || !!req.callerCanApprove
      ? !['completed', 'cancelled', 'rejected', 'deleted'].includes(req.status)
      : false

  const sectionCard: React.CSSProperties = {
    padding: '20px',
    marginBottom: '16px',
  }
  const sectionTitle: React.CSSProperties = {
    fontSize: '14px',
    fontWeight: 600,
    color: theme.textPrimary,
    marginBottom: '4px',
  }
  const sectionHint: React.CSSProperties = {
    fontSize: '12px',
    color: theme.textMuted,
    marginBottom: '14px',
  }

  // ── Lines table (columns adapt to current stage) ────────────────────────
  const lineColumns: Column<ReqLine>[] = [
    {
      key: 'description',
      header: 'Item',
      render: (l) => (
        <div>
          <div style={{ fontSize: '13px', color: theme.textPrimary }}>
            {l.description || l.product_name || '—'}
          </div>
          {l.sku && <div style={{ fontSize: '11px', color: theme.textMuted }}>{l.sku}</div>}
        </div>
      ),
    },
    { key: 'qty', header: 'Qty', render: (l) => <span style={{ fontSize: '13px' }}>{fmtN(l.qty)} {l.uom ?? ''}</span> },
    ...(['inventory_check', 'store_pricing', 'market_pricing', 'price_verification', 'pending_approval', 'approved', 'items_bought', 'sourcing', 'completed'].includes(
      req.status,
    )
      ? [
          {
            key: 'qty_from_stock',
            header: 'From stock',
            render: (l: ReqLine) => <span style={{ fontSize: '13px' }}>{fmtN(l.qty_from_stock ?? 0)}</span>,
          },
        ]
      : []),
    ...(['store_pricing', 'market_pricing', 'price_verification', 'pending_approval', 'approved', 'items_bought', 'sourcing', 'completed'].includes(
      req.status,
    )
      ? [
          {
            key: 'store_price',
            header: 'Store price',
            render: (l: ReqLine) => (
              <span style={{ fontSize: '13px', color: theme.textMuted }}>
                {l.store_price ? `${fmtN(l.store_price)} ${l.store_price_currency ?? ''}` : '—'}
              </span>
            ),
          },
        ]
      : []),
    ...(['market_pricing', 'price_verification', 'pending_approval', 'approved', 'items_bought', 'sourcing', 'completed'].includes(
      req.status,
    )
      ? [
          {
            key: 'market_price',
            header: 'Market price',
            render: (l: ReqLine) => (
              <span style={{ fontSize: '13px' }}>
                {l.market_price ? `${fmtN(l.market_price)} ${l.market_price_currency ?? ''}` : '—'}
              </span>
            ),
          },
        ]
      : []),
    ...(['price_verification', 'pending_approval', 'approved', 'items_bought', 'sourcing', 'completed'].includes(
      req.status,
    )
      ? [
          {
            key: 'verified_price',
            header: 'Verified price',
            render: (l: ReqLine) => (
              <span style={{ fontSize: '13px', fontWeight: 600 }}>
                {l.verified_price ? `${fmtN(l.verified_price)} ${l.verified_price_currency ?? ''}` : '—'}
              </span>
            ),
          },
        ]
      : []),
    ...(['items_bought', 'sourcing', 'completed'].includes(req.status)
      ? [
          {
            key: 'purchases',
            header: 'Bought',
            render: (l: ReqLine) => {
              const purchases = l.purchases ?? []
              if (purchases.length === 0)
                return (
                  <span style={{ fontSize: '12px', color: l.closed_at ? theme.textMuted : theme.warning }}>
                    {l.closed_at ? `Closed — ${l.closed_reason ?? ''}` : 'Not yet bought'}
                  </span>
                )
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  {purchases.map((p) => (
                    <span key={p.id} style={{ fontSize: '12px', color: theme.textSecondary }}>
                      {fmtN(p.qty)} @ {fmtN(p.actual_unit_price)} {p.currency_code} — {p.vendor_name ?? 'vendor'}
                      {p.over_tolerance && (
                        <span style={{ color: theme.warning, marginLeft: '4px' }}>⚠</span>
                      )}
                    </span>
                  ))}
                </div>
              )
            },
          },
        ]
      : []),
    { key: 'total', header: 'Total', render: (l) => <span style={{ fontSize: '13px' }}>{fmtN(l.total)} {l.currency_code}</span> },
  ]

  // ── Edit requests: diff builder (mirrors PurchaseOrderDetail's own
  // 'changes' tab, scoped to the fields applyRequisitionEditChanges allows)
  const initEditDraft = (): EditDraft => ({
    notes: req.notes ?? '',
    priority: req.priority ?? 'low',
    lines: req.lines.map((l) => ({
      id: l.id,
      description: l.description ?? '',
      qty: parseFloat(String(l.qty)) || 0,
      unit_price: parseFloat(String(l.unit_price)) || 0,
      uom: l.uom ?? '',
    })),
    linesAdded: [],
  })

  const buildEditChanges = (draft: EditDraft) => {
    const header: Record<string, { from: unknown; to: unknown }> = {}
    if (draft.notes !== (req.notes ?? '')) header.notes = { from: req.notes ?? '', to: draft.notes }
    if (draft.priority !== (req.priority ?? 'low'))
      header.priority = { from: req.priority ?? 'low', to: draft.priority }

    const edited: { id: string; field: string; from: unknown; to: unknown }[] = []
    const removed: string[] = []
    for (const dl of draft.lines) {
      if (dl._removed) {
        removed.push(dl.id)
        continue
      }
      const orig = req.lines.find((l) => l.id === dl.id)
      if (!orig) continue
      if (dl.description !== (orig.description ?? ''))
        edited.push({ id: dl.id, field: 'description', from: orig.description, to: dl.description })
      if (dl.qty !== (parseFloat(String(orig.qty)) || 0))
        edited.push({ id: dl.id, field: 'qty_ordered', from: orig.qty, to: dl.qty })
      if (dl.unit_price !== (parseFloat(String(orig.unit_price)) || 0))
        edited.push({ id: dl.id, field: 'unit_price', from: orig.unit_price, to: dl.unit_price })
      if (dl.uom !== (orig.uom ?? '')) edited.push({ id: dl.id, field: 'uom', from: orig.uom, to: dl.uom })
    }
    return { header, lines: { edited, added: draft.linesAdded, removed } }
  }

  return (
    <div style={{ ...padding, maxWidth: '1100px', margin: '0 auto' }}>
      <PageHeader
        title={req.requisition_number}
        subtitle={req.purpose ? `Purpose: ${req.purpose}` : undefined}
        backPath="/procurement/requisitions"
        backLabel="Requisitions"
        status={
          <Badge variant={getRequisitionStatusVariant(req.status)}>
            {getRequisitionStatusLabel(req.status)}
          </Badge>
        }
        actions={
          canCancel ? (
            <Button variant="danger" size="sm" onClick={() => setShowCancelBox((v) => !v)}>
              Cancel
            </Button>
          ) : undefined
        }
      />

      {showCancelBox && (
        <Card style={{ padding: '14px 20px', marginTop: '12px', borderLeft: `3px solid ${theme.danger}` }}>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: 1, minWidth: '200px' }}>
              <Input
                label="Reason (optional)"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Why is this requisition being cancelled?"
              />
            </div>
            <Button
              variant="danger"
              size="sm"
              loading={lCancel}
              onClick={() => void cancel({ variables: { id: req.id, reason: cancelReason || undefined } })}
            >
              Confirm Cancel
            </Button>
          </div>
        </Card>
      )}

      <div style={{ marginTop: '16px', marginBottom: '16px' }}>
        <StatusBar
          steps={REQUISITION_STATUSES.map((s) => ({ key: s.key, label: s.label }))}
          currentStep={req.status}
          rejectedSteps={['rejected', 'cancelled', 'deleted']}
        />
      </div>

      {/* Summary — colored stat-card grid, matching PurchaseOrderDetail's own "PO Summary" */}
      <Card style={{ padding: '24px', marginBottom: '16px' }}>
        <div style={{ fontWeight: 600, fontSize: '15px', color: theme.textPrimary, marginBottom: '16px' }}>
          Summary
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: '12px',
          }}
        >
          {[
            {
              label: 'Total',
              value:
                req.currencyTotals.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    {req.currencyTotals.map((ct) => (
                      <span key={ct.currency_code}>
                        {fmtN(ct.subtotal)} {ct.currency_code}
                      </span>
                    ))}
                  </div>
                ) : (
                  '—'
                ),
            },
            { label: 'Priority', value: REQUISITION_PRIORITY_LABELS[req.priority ?? 'low'] ?? req.priority ?? '—' },
            { label: 'Project', value: req.projectName ?? '—' },
            { label: 'Branch', value: req.branch_name ?? '—' },
            { label: 'Organizer', value: req.organizerName ?? '—' },
            { label: 'Created', value: req.created_at.slice(0, 10) },
          ].map((f) => (
            <div
              key={f.label}
              style={{
                padding: '14px',
                borderRadius: '10px',
                background: theme.bgCanvas,
                border: `1px solid ${theme.border}`,
                minWidth: 0,
              }}
            >
              <div style={{ fontSize: '11px', fontWeight: 500, color: theme.textMuted, marginBottom: '6px' }}>
                {f.label}
              </div>
              <div
                style={{
                  fontSize: '16px',
                  fontWeight: 700,
                  color: theme.textPrimary,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {f.value}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Tabs — Lines / Log / Edit requests (Receipts/Returns/Finance-Audit
          tabs from PurchaseOrderDetail don't apply: those are post-fork,
          PO-side concerns this page never reaches) */}
      <div style={{ marginBottom: '16px' }}>
        <TabBar
          tabs={[
            { key: 'lines', label: 'Lines' },
            { key: 'log', label: 'Log' },
            {
              key: 'changes',
              label: 'Edit requests',
              badge: (req.edit_requests ?? []).filter((r) => r.status === 'pending').length || undefined,
            },
          ]}
          active={activeTab}
          onChange={(key) => setActiveTab(key as Tab)}
        />
      </div>

      {activeTab === 'lines' && (
        <Card style={sectionCard}>
          <Table columns={lineColumns} data={req.lines} rowKey="id" />
        </Card>
      )}

      {activeTab === 'log' && (
        <Card>
          <div
            style={{
              padding: '16px 20px',
              borderBottom: `1px solid ${theme.border}`,
              fontWeight: 600,
              fontSize: '15px',
              color: theme.textPrimary,
            }}
          >
            Approval Log
          </div>
          {req.notes && (
            <div style={{ padding: '14px 16px', borderBottom: `1px solid ${theme.border}`, background: theme.bgSurface }}>
              <div
                style={{
                  fontSize: '11px',
                  color: theme.textMuted,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: '6px',
                }}
              >
                Requisition Notes
              </div>
              <div style={{ fontSize: '13px', color: theme.textPrimary, whiteSpace: 'pre-wrap' }}>{req.notes}</div>
            </div>
          )}
          {req.approval_log.length === 0 && (
            <div style={{ padding: '32px', textAlign: 'center', color: theme.textMuted, fontSize: '13px' }}>
              No activity yet.
            </div>
          )}
          {req.approval_log.map((entry) => (
            <div
              key={entry.id}
              style={{
                display: 'flex',
                gap: '16px',
                padding: '12px 16px',
                borderBottom: `1px solid ${theme.border}22`,
                alignItems: 'center',
                flexWrap: 'wrap',
              }}
            >
              <Badge
                variant={
                  entry.action === 'approved' ? 'success' : entry.action.startsWith('reject') ? 'danger' : 'info'
                }
              >
                {entry.action.replace(/_/g, ' ')}
              </Badge>
              <span style={{ fontSize: '13px', color: theme.textPrimary }}>
                {entry.actor_name ?? 'System'}
                {entry.actor_position ? ` (${entry.actor_position})` : ''}
              </span>
              {entry.notes && <span style={{ fontSize: '12px', color: theme.textMuted }}>{entry.notes}</span>}
              <span style={{ fontSize: '12px', color: theme.textMuted, marginLeft: 'auto' }}>
                {entry.created_at.slice(0, 16).replace('T', ' ')}
              </span>
            </div>
          ))}
        </Card>
      )}

      {activeTab === 'changes' &&
        (() => {
          const inputStyle: React.CSSProperties = {
            width: '100%',
            padding: '7px 10px',
            borderRadius: '6px',
            border: `1px solid ${theme.borderInput}`,
            background: theme.bgCanvas,
            color: theme.textPrimary,
            fontSize: '13px',
            boxSizing: 'border-box',
          }
          const hasPendingEdit = (req.edit_requests ?? []).some((r) => r.status === 'pending')

          const lineFields: LineItemField<EditLineDraft>[] = [
            {
              key: 'description',
              label: 'Description',
              render: (line, i) => (
                <input
                  value={line.description}
                  style={inputStyle}
                  disabled={line._removed}
                  onChange={(e) => {
                    const lines = [...editDraft!.lines]
                    lines[i] = { ...lines[i]!, description: e.target.value }
                    setEditDraft({ ...editDraft!, lines })
                  }}
                />
              ),
            },
            {
              key: 'qty',
              label: 'Qty',
              width: '90px',
              render: (line, i) => (
                <input
                  type="number"
                  value={line.qty}
                  style={inputStyle}
                  disabled={line._removed}
                  onChange={(e) => {
                    const lines = [...editDraft!.lines]
                    lines[i] = { ...lines[i]!, qty: parseFloat(e.target.value) || 0 }
                    setEditDraft({ ...editDraft!, lines })
                  }}
                />
              ),
            },
            {
              key: 'unit_price',
              label: 'Unit Price',
              width: '110px',
              render: (line, i) => (
                <input
                  type="number"
                  value={line.unit_price}
                  style={inputStyle}
                  disabled={line._removed}
                  onChange={(e) => {
                    const lines = [...editDraft!.lines]
                    lines[i] = { ...lines[i]!, unit_price: parseFloat(e.target.value) || 0 }
                    setEditDraft({ ...editDraft!, lines })
                  }}
                />
              ),
            },
            {
              key: 'uom',
              label: 'UOM',
              width: '90px',
              render: (line, i) => (
                <input
                  value={line.uom}
                  style={inputStyle}
                  disabled={line._removed}
                  onChange={(e) => {
                    const lines = [...editDraft!.lines]
                    lines[i] = { ...lines[i]!, uom: e.target.value }
                    setEditDraft({ ...editDraft!, lines })
                  }}
                />
              ),
            },
          ]

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <Card style={{ padding: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <div style={{ fontWeight: 600, fontSize: '15px', color: theme.textPrimary }}>Request an edit</div>
                  {hasPendingEdit && <Badge variant="warning">Pending review — submit locked</Badge>}
                  {!editDraft && !hasPendingEdit && (
                    <Button size="sm" variant="secondary" onClick={() => setEditDraft(initEditDraft())}>
                      Start editing
                    </Button>
                  )}
                  {editDraft && (
                    <Button size="sm" variant="secondary" onClick={() => setEditDraft(null)}>
                      Cancel
                    </Button>
                  )}
                </div>

                {!editDraft && (
                  <div style={{ fontSize: '13px', color: theme.textMuted }}>
                    {hasPendingEdit
                      ? 'There is already a pending edit request. An admin must approve or reject it before a new one can be submitted.'
                      : 'Click "Start editing" to propose changes to the notes, priority, or lines. Once approved, the requisition is unaffected before approval is reached — a pre-approval edit applies immediately; a post-approval edit needs admin review first.'}
                  </div>
                )}

                {editDraft && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
                      <div style={{ flex: '1 1 240px' }}>
                        <Input
                          label="Notes"
                          value={editDraft.notes}
                          onChange={(e) => setEditDraft({ ...editDraft, notes: e.target.value })}
                        />
                      </div>
                      <div style={{ flex: '1 1 160px' }}>
                        <Select
                          label="Priority"
                          value={editDraft.priority}
                          onChange={(e) => setEditDraft({ ...editDraft, priority: e.target.value })}
                        >
                          <option value="low">Low</option>
                          <option value="high">High</option>
                          <option value="emergency">Emergency</option>
                        </Select>
                      </div>
                    </div>

                    <LineItemEditor
                      fields={lineFields}
                      rows={editDraft.lines}
                      onRemoveRow={(i) => {
                        const lines = [...editDraft.lines]
                        lines[i] = { ...lines[i]!, _removed: !lines[i]!._removed }
                        setEditDraft({ ...editDraft, lines })
                      }}
                      onAddRow={() =>
                        setEditDraft({
                          ...editDraft,
                          linesAdded: [...editDraft.linesAdded, { description: '', qty: 1, unit_price: 0, uom: 'unit' }],
                        })
                      }
                    />

                    {editDraft.linesAdded.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: theme.textMuted }}>New lines</div>
                        {editDraft.linesAdded.map((al, i) => (
                          <div key={i} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                            <input
                              value={al.description}
                              placeholder="Description"
                              style={{ ...inputStyle, flex: '1 1 200px' }}
                              onChange={(e) => {
                                const linesAdded = [...editDraft.linesAdded]
                                linesAdded[i] = { ...linesAdded[i]!, description: e.target.value }
                                setEditDraft({ ...editDraft, linesAdded })
                              }}
                            />
                            <input
                              type="number"
                              value={al.qty}
                              placeholder="Qty"
                              style={{ ...inputStyle, width: '80px' }}
                              onChange={(e) => {
                                const linesAdded = [...editDraft.linesAdded]
                                linesAdded[i] = { ...linesAdded[i]!, qty: parseFloat(e.target.value) || 0 }
                                setEditDraft({ ...editDraft, linesAdded })
                              }}
                            />
                            <input
                              type="number"
                              value={al.unit_price}
                              placeholder="Unit price"
                              style={{ ...inputStyle, width: '100px' }}
                              onChange={(e) => {
                                const linesAdded = [...editDraft.linesAdded]
                                linesAdded[i] = { ...linesAdded[i]!, unit_price: parseFloat(e.target.value) || 0 }
                                setEditDraft({ ...editDraft, linesAdded })
                              }}
                            />
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setEditDraft({
                                  ...editDraft,
                                  linesAdded: editDraft.linesAdded.filter((_, idx) => idx !== i),
                                })
                              }}
                            >
                              Remove
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}

                    <Button
                      variant="primary"
                      loading={leSubmit}
                      onClick={() => {
                        const changes = buildEditChanges(editDraft)
                        const totalChanges =
                          Object.keys(changes.header).length +
                          changes.lines.edited.length +
                          changes.lines.added.length +
                          changes.lines.removed.length
                        if (totalChanges === 0) {
                          addToast({ type: 'error', message: 'No changes to submit' })
                          return
                        }
                        void submitEditRequest({
                          variables: { requisitionId: req.id, changes: JSON.stringify(changes) },
                        })
                      }}
                    >
                      Submit edit request
                    </Button>
                  </div>
                )}
              </Card>

              {(req.edit_requests ?? []).length > 0 && (
                <Card style={{ padding: '20px' }}>
                  <div style={{ fontWeight: 600, fontSize: '15px', color: theme.textPrimary, marginBottom: '14px' }}>
                    History
                  </div>
                  {(req.edit_requests ?? []).map((er) => {
                    const parsed = JSON.parse(er.changes) as {
                      header?: Record<string, { from: unknown; to: unknown }>
                      lines?: {
                        edited?: { id: string; field: string; from: unknown; to: unknown }[]
                        added?: unknown[]
                        removed?: string[]
                      }
                    }
                    const headerChanges = Object.entries(parsed.header ?? {})
                    const editedLines = parsed.lines?.edited ?? []
                    const addedLines = parsed.lines?.added ?? []
                    const removedLines = parsed.lines?.removed ?? []
                    const totalChanges = headerChanges.length + editedLines.length + addedLines.length + removedLines.length
                    return (
                      <div
                        key={er.id}
                        style={{ padding: '14px 0', borderTop: `1px solid ${theme.border}` }}
                      >
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap' }}>
                          <Badge
                            variant={er.status === 'approved' ? 'success' : er.status === 'rejected' ? 'danger' : 'warning'}
                          >
                            {er.status}
                          </Badge>
                          <span style={{ fontSize: '13px', color: theme.textPrimary }}>{er.requested_by_email}</span>
                          <span style={{ fontSize: '12px', color: theme.textMuted }}>
                            {er.created_at.slice(0, 16).replace('T', ' ')}
                          </span>
                          <span style={{ fontSize: '12px', color: theme.textMuted, marginLeft: 'auto' }}>
                            {totalChanges} change{totalChanges !== 1 ? 's' : ''}
                          </span>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', marginBottom: '10px' }}>
                          {headerChanges.map(([field, diff]) => (
                            <div key={field} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                              <span style={{ color: theme.textMuted, minWidth: '110px' }}>{field.replace(/_/g, ' ')}</span>
                              <span style={{ color: theme.danger, textDecoration: 'line-through' }}>
                                {String(diff.from || '—')}
                              </span>
                              <span style={{ color: theme.textMuted }}>→</span>
                              <span style={{ color: theme.accent }}>{String(diff.to || '—')}</span>
                            </div>
                          ))}
                          {editedLines.map((e, i) => (
                            <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                              <span style={{ color: theme.textMuted, minWidth: '110px' }}>
                                line {e.field.replace(/_/g, ' ')}
                              </span>
                              <span style={{ color: theme.danger, textDecoration: 'line-through' }}>
                                {String(e.from ?? '—')}
                              </span>
                              <span style={{ color: theme.textMuted }}>→</span>
                              <span style={{ color: theme.accent }}>{String(e.to ?? '—')}</span>
                            </div>
                          ))}
                          {addedLines.length > 0 && (
                            <div style={{ color: theme.accent }}>
                              + {addedLines.length} line{addedLines.length !== 1 ? 's' : ''} added
                            </div>
                          )}
                          {removedLines.length > 0 && (
                            <div style={{ color: theme.danger }}>
                              − {removedLines.length} line{removedLines.length !== 1 ? 's' : ''} removed
                            </div>
                          )}
                        </div>

                        {er.request_notes && (
                          <div style={{ fontSize: '12px', color: theme.textMuted, fontStyle: 'italic', marginBottom: '8px' }}>
                            "{er.request_notes}"
                          </div>
                        )}

                        {er.status !== 'pending' && (
                          <div style={{ fontSize: '12px', color: theme.textMuted }}>
                            {er.status === 'approved' ? 'Approved' : 'Rejected'} by {er.reviewed_by_email} on{' '}
                            {er.reviewed_at?.slice(0, 16).replace('T', ' ')}
                            {er.review_notes && ` — "${er.review_notes}"`}
                          </div>
                        )}

                        {er.status === 'pending' && isSystemLevel && (
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                            <Button
                              size="sm"
                              variant="primary"
                              loading={leApprove}
                              onClick={() =>
                                void approveEditRequest({
                                  variables: {
                                    requisitionId: req.id,
                                    requestId: er.id,
                                    reviewNotes: reviewNotes[er.id] || undefined,
                                  },
                                })
                              }
                            >
                              Approve
                            </Button>
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                              <input
                                value={reviewNotes[er.id] ?? ''}
                                onChange={(e) => setReviewNotes((p) => ({ ...p, [er.id]: e.target.value }))}
                                placeholder="Rejection reason (required)"
                                style={{ ...inputStyle, width: '220px' }}
                              />
                              <Button
                                size="sm"
                                variant="danger"
                                loading={leReject}
                                disabled={!reviewNotes[er.id]?.trim()}
                                onClick={() =>
                                  void rejectEditRequest({
                                    variables: {
                                      requisitionId: req.id,
                                      requestId: er.id,
                                      reviewNotes: reviewNotes[er.id] ?? '',
                                    },
                                  })
                                }
                              >
                                Reject
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </Card>
              )}
            </div>
          )
        })()}

      {/* ── Panel 1: draft ────────────────────────────────────────────────── */}
      {req.status === 'draft' && (
        <Card style={sectionCard}>
          <div style={sectionTitle}>Next step: submit for inventory check</div>
          <div style={sectionHint}>
            Once submitted, the organizer or a Store Keeper confirms how much of each line can be
            covered from stock.
          </div>
          {canSubmitDraft ? (
            <Button
              variant="primary"
              loading={lSubmit}
              onClick={() => void submitToInventory({ variables: { id: req.id } })}
            >
              Submit for inventory check
            </Button>
          ) : (
            <div style={{ fontSize: '13px', color: theme.textMuted }}>
              Only the organizer or an admin can submit this requisition.
            </div>
          )}
        </Card>
      )}

      {/* ── Panel 2: inventory_check ─────────────────────────────────────── */}
      {req.status === 'inventory_check' && (
        <Card style={sectionCard}>
          <div style={sectionTitle}>Next step: confirm stock availability</div>
          <div style={sectionHint}>
            Enter the quantity to take from stock for each line — the rest will be purchased.
          </div>
          {!canConfirmInventory ? (
            <div style={{ fontSize: '13px', color: theme.textMuted }}>
              Only the organizer, a Store Keeper, or an admin can confirm this.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {req.lines.map((l) => {
                const avail = availabilityByLine.get(l.id)
                const qtyReserved = avail ? avail.qtyOnHand - avail.qtyAvailable : null
                return (
                <div
                  key={l.id}
                  style={{ padding: '12px', borderRadius: '8px', border: `1px solid ${theme.border}` }}
                >
                  <div style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary, marginBottom: '8px' }}>
                    {l.description || l.product_name} — needs {fmtN(l.qty)} {l.uom}
                  </div>
                  {avail ? (
                    <div
                      style={{
                        display: 'flex',
                        gap: '16px',
                        flexWrap: 'wrap',
                        fontSize: '12px',
                        color: theme.textMuted,
                        marginBottom: '10px',
                      }}
                    >
                      <span>
                        On hand: <strong style={{ color: theme.textPrimary }}>{fmtN(avail.qtyOnHand)}</strong>
                      </span>
                      <span>
                        Reserved: <strong style={{ color: theme.textPrimary }}>{fmtN(qtyReserved)}</strong>
                      </span>
                      <span>
                        Available:{' '}
                        <strong style={{ color: avail.isAvailable ? theme.success : theme.warning }}>
                          {fmtN(avail.qtyAvailable)}
                        </strong>
                      </span>
                      {avail.byLocation.length > 0 && (
                        <span style={{ width: '100%' }}>
                          {avail.byLocation.map((loc) => (
                            <span key={loc.locationId} style={{ marginRight: '12px' }}>
                              {loc.locationName}
                              {loc.companyName ? ` (${loc.companyName})` : ''}: {fmtN(loc.qtyAvailable)} avail.
                            </span>
                          ))}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '10px' }}>
                      Loading stock levels…
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <div style={{ width: '140px' }}>
                      <Input
                        label="Qty from stock"
                        type="number"
                        min="0"
                        max={l.qty}
                        value={invQty[l.id] ?? ''}
                        onChange={(e) => setInvQty((prev) => ({ ...prev, [l.id]: e.target.value }))}
                        placeholder="0"
                      />
                    </div>
                    <div style={{ flex: 1, minWidth: '180px' }}>
                      <Select
                        label="Source location (if any from stock)"
                        value={invLoc[l.id] ?? ''}
                        onChange={(e) => setInvLoc((prev) => ({ ...prev, [l.id]: e.target.value }))}
                        options={locations.map((loc) => ({ value: loc.id, label: loc.name }))}
                        placeholder="Select location"
                      />
                    </div>
                  </div>
                </div>
                )
              })}
              <Button
                variant="primary"
                loading={lConfirm}
                style={{ alignSelf: 'flex-start' }}
                onClick={() =>
                  void confirmInventory({
                    variables: {
                      id: req.id,
                      lineStockQtys: req.lines.map((l) => ({
                        lineId: l.id,
                        qtyFromStock: parseFloat(invQty[l.id] ?? '0') || 0,
                        sourceLocationId: invLoc[l.id] || undefined,
                      })),
                    },
                  })
                }
              >
                Confirm inventory check
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* ── Panel 3: store_pricing ───────────────────────────────────────── */}
      {req.status === 'store_pricing' && (
        <Card style={sectionCard}>
          <div style={sectionTitle}>Next step: store pricing</div>
          <div style={sectionHint}>
            Record what this would cost from internal stock, for reference — it doesn't set the
            line's total.
          </div>
          {!canStorePrice ? (
            <div style={{ fontSize: '13px', color: theme.textMuted }}>
              Only someone holding the Store Pricing position (or an admin) can act here.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {req.lines.map((l) => (
                <div key={l.id} style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
                  <div style={{ flex: 1, fontSize: '13px', color: theme.textPrimary, paddingBottom: '10px' }}>
                    {l.description || l.product_name}
                  </div>
                  <div style={{ width: '140px' }}>
                    <Input
                      label="Store price"
                      type="number"
                      min="0"
                      value={storePrices[l.id] ?? ''}
                      onChange={(e) => setStorePrices((prev) => ({ ...prev, [l.id]: e.target.value }))}
                      placeholder="0.00"
                    />
                  </div>
                </div>
              ))}
              <Button
                variant="primary"
                loading={lStore}
                style={{ alignSelf: 'flex-start' }}
                onClick={() =>
                  void submitStorePricing({
                    variables: {
                      id: req.id,
                      linePrices: req.lines
                        .filter((l) => storePrices[l.id])
                        .map((l) => ({
                          lineId: l.id,
                          storePrice: parseFloat(storePrices[l.id]!) || 0,
                          currencyCode: l.currency_code,
                        })),
                    },
                  })
                }
              >
                Submit to market pricing
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* ── Panel 4: market_pricing ──────────────────────────────────────── */}
      {req.status === 'market_pricing' && (
        <Card style={sectionCard}>
          <div style={sectionTitle}>Next step: market pricing</div>
          <div style={sectionHint}>
            Enter the checked vendor quote per line — this becomes the line's real price and
            currency.
          </div>
          {!canMarketPrice ? (
            <div style={{ fontSize: '13px', color: theme.textMuted }}>
              Only a Procurement Officer (or an admin) can act here.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {req.lines.map((l) => (
                <div
                  key={l.id}
                  style={{ padding: '12px', borderRadius: '8px', border: `1px solid ${theme.border}` }}
                >
                  <div style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary, marginBottom: '8px' }}>
                    {l.description || l.product_name}
                  </div>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <div style={{ width: '140px' }}>
                      <Input
                        label="Market price"
                        type="number"
                        min="0"
                        value={marketPrices[l.id] ?? ''}
                        onChange={(e) => setMarketPrices((prev) => ({ ...prev, [l.id]: e.target.value }))}
                        placeholder="0.00"
                      />
                    </div>
                    <div style={{ width: '110px' }}>
                      <Select
                        label="Currency"
                        value={marketCurrency[l.id] ?? l.currency_code}
                        onChange={(e) => setMarketCurrency((prev) => ({ ...prev, [l.id]: e.target.value }))}
                        options={CURRENCIES.map((c) => ({ value: c, label: c }))}
                      />
                    </div>
                    <div style={{ flex: 1, minWidth: '160px' }}>
                      <Input
                        label="Vendor quote ref (optional)"
                        value={quoteRefs[l.id] ?? ''}
                        onChange={(e) => setQuoteRefs((prev) => ({ ...prev, [l.id]: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>
              ))}
              <Button
                variant="primary"
                loading={lMarket}
                style={{ alignSelf: 'flex-start' }}
                onClick={() =>
                  void submitMarketPricing({
                    variables: {
                      id: req.id,
                      linePrices: req.lines
                        .filter((l) => marketPrices[l.id])
                        .map((l) => ({
                          lineId: l.id,
                          marketPrice: parseFloat(marketPrices[l.id]!) || 0,
                          currencyCode: marketCurrency[l.id] ?? l.currency_code,
                          vendorQuoteRef: quoteRefs[l.id] || undefined,
                        })),
                    },
                  })
                }
              >
                Submit to price verification
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* ── Panel 5: price_verification ──────────────────────────────────── */}
      {req.status === 'price_verification' && (
        <Card style={sectionCard}>
          <div style={sectionTitle}>Next step: verify prices</div>
          <div style={sectionHint}>
            Cross-check each market price and adjust if needed, then submit directly for approval.
          </div>
          {!canVerifyPrice ? (
            <div style={{ fontSize: '13px', color: theme.textMuted }}>
              Only 2nd Procurement (or an admin) can act here.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {req.lines.map((l) => (
                <div key={l.id} style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
                  <div style={{ flex: 1, fontSize: '13px', color: theme.textPrimary, paddingBottom: '10px' }}>
                    {l.description || l.product_name}
                    <div style={{ fontSize: '11px', color: theme.textMuted }}>
                      Market: {fmtN(l.market_price)} {l.market_price_currency}
                    </div>
                  </div>
                  <div style={{ width: '140px' }}>
                    <Input
                      label="Verified price"
                      type="number"
                      min="0"
                      value={verifiedPrices[l.id] ?? l.market_price ?? ''}
                      onChange={(e) => setVerifiedPrices((prev) => ({ ...prev, [l.id]: e.target.value }))}
                      placeholder="0.00"
                    />
                  </div>
                </div>
              ))}
              <Button
                variant="primary"
                loading={lVerify}
                style={{ alignSelf: 'flex-start' }}
                onClick={() =>
                  void verifyPrices({
                    variables: {
                      id: req.id,
                      lineAdjustments: req.lines.map((l) => ({
                        lineId: l.id,
                        verifiedPrice: parseFloat(verifiedPrices[l.id] ?? l.market_price ?? '0') || 0,
                      })),
                    },
                  })
                }
              >
                Submit for approval
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* ── Panel 6: pending_approval ─────────────────────────────────────── */}
      {req.status === 'pending_approval' && (
        <Card style={sectionCard}>
          <div style={sectionTitle}>Next step: approve or reject</div>
          <div style={sectionHint}>Rejecting sends this requisition back to draft for revision.</div>
          {!canApprove ? (
            <div style={{ fontSize: '13px', color: theme.textMuted }}>
              Only the department head, the assigned approver, or an admin can act here.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <Button
                variant="primary"
                loading={lApprove}
                style={{ alignSelf: 'flex-start' }}
                onClick={() => void approve({ variables: { id: req.id } })}
              >
                Approve
              </Button>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div style={{ flex: 1, minWidth: '200px' }}>
                  <Input
                    label="Reject reason"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Enter reason"
                  />
                </div>
                <Button
                  variant="danger"
                  loading={lReject}
                  disabled={!rejectReason.trim()}
                  onClick={() => void reject({ variables: { id: req.id, reason: rejectReason } })}
                >
                  Reject
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* ── approved / items_bought: Items Bought lives on its own screen ─── */}
      {(req.status === 'approved' || req.status === 'items_bought') && (
        <Card style={sectionCard}>
          <div style={sectionTitle}>
            {req.status === 'approved' ? 'Approved — buying starts next' : 'Items Bought in progress'}
          </div>
          <div style={{ fontSize: '13px', color: theme.textMuted, marginBottom: req.status === 'items_bought' ? '10px' : 0 }}>
            Recording purchases per vendor happens on the Items Bought screen.
          </div>
          {req.status === 'items_bought' && (
            <Button variant="primary" size="sm" onClick={() => navigate(`/procurement/requisitions/${req.id}/items-bought`)}>
              Go to Items Bought
            </Button>
          )}
        </Card>
      )}

      {/* ── Children POs (once any exist) ───────────────────────────────── */}
      {showChildren && children.length > 0 && (
        <Card style={sectionCard}>
          <div style={sectionTitle}>Purchase orders</div>
          <div style={sectionHint}>One per vendor, forked at Finish Buying.</div>
          <Table
            columns={[
              {
                key: 'po_number',
                header: 'PO Number',
                render: (c: ChildPO) => (
                  <span style={{ fontFamily: 'monospace', color: theme.accent, fontSize: '13px' }}>
                    {c.po_number}
                  </span>
                ),
              },
              {
                key: 'vendor_name',
                header: 'Vendor',
                render: (c: ChildPO) => <span style={{ fontSize: '13px' }}>{c.vendor_name ?? '—'}</span>,
              },
              {
                key: 'status',
                header: 'Status',
                render: (c: ChildPO) => (
                  <Badge variant={getPOStatusVariant(c.status)}>{getPOStatusLabel(c.status)}</Badge>
                ),
              },
              {
                key: 'total_amount',
                header: 'Total',
                render: (c: ChildPO) => (
                  <span style={{ fontSize: '13px' }}>
                    {fmtN(c.total_amount)} {c.currency_code}
                  </span>
                ),
              },
            ]}
            data={children}
            rowKey="id"
            onRowClick={(c: ChildPO) => navigate(`/procurement/purchase-orders/${c.id}`)}
          />
        </Card>
      )}

      {req.status === 'sourcing' && (
        <Card style={sectionCard}>
          <div style={sectionTitle}>Sourcing</div>
          <div style={{ fontSize: '13px', color: theme.textMuted }}>
            Waiting on every line to resolve — either its stock-covered portion issued via Store
            Out, or its purchased portion's child PO reaching a finished state.
          </div>
        </Card>
      )}

      {req.status === 'completed' && (
        <Card style={sectionCard}>
          <div style={sectionTitle}>Completed</div>
          <div style={{ fontSize: '13px', color: theme.success }}>
            Every line on this requisition has been resolved.
          </div>
        </Card>
      )}

      {['rejected', 'cancelled', 'deleted'].includes(req.status) && (
        <Card style={sectionCard}>
          <div style={sectionTitle}>{getRequisitionStatusLabel(req.status)}</div>
          <div style={{ fontSize: '13px', color: theme.textMuted }}>
            This requisition is no longer active.
          </div>
        </Card>
      )}
    </div>
  )
}
