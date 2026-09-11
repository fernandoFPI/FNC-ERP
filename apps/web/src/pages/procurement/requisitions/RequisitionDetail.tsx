import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@apollo/client'
import {
  REQUISITION_QUERY,
  REQUISITION_CHILD_POS_QUERY,
  SUBMIT_REQUISITION_TO_INVENTORY_CHECK,
  CONFIRM_REQUISITION_INVENTORY_CHECK,
  SUBMIT_REQUISITION_STORE_PRICING,
  SUBMIT_REQUISITION_MARKET_PRICING,
  VERIFY_REQUISITION_PRICES,
  APPROVE_REQUISITION,
  REJECT_REQUISITION_APPROVAL,
  CANCEL_REQUISITION,
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
import type { Column } from '../../../components/ui/Table'
import { Table } from '../../../components/ui/Table'
import { Input } from '../../../components/ui/Input'
import { Select } from '../../../components/ui/Select'
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
  line_number?: number
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

      <Card style={sectionCard}>
        <div style={sectionTitle}>Summary</div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: '14px',
            marginTop: '10px',
          }}
        >
          {[
            { label: 'Priority', value: REQUISITION_PRIORITY_LABELS[req.priority ?? 'low'] ?? req.priority ?? '—' },
            { label: 'Project', value: req.projectName ?? '—' },
            { label: 'Branch', value: req.branch_name ?? '—' },
            { label: 'Delivery to', value: req.delivery_destination ?? '—' },
            { label: 'Organizer', value: req.organizerName ?? '—' },
            { label: 'Created', value: req.created_at.slice(0, 10) },
          ].map((f) => (
            <div key={f.label}>
              <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '2px' }}>{f.label}</div>
              <div style={{ fontSize: '13px', color: theme.textPrimary, fontWeight: 500 }}>{f.value}</div>
            </div>
          ))}
        </div>
        {req.notes && (
          <div style={{ marginTop: '14px', fontSize: '13px', color: theme.textSecondary }}>
            <strong style={{ color: theme.textPrimary }}>Notes: </strong>
            {req.notes}
          </div>
        )}
        {req.currencyTotals.length > 0 && (
          <div style={{ marginTop: '14px', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            {req.currencyTotals.map((ct) => (
              <div key={ct.currency_code} style={{ fontSize: '13px' }}>
                <span style={{ color: theme.textMuted }}>{ct.currency_code}: </span>
                <strong style={{ color: theme.textPrimary }}>{fmtN(ct.subtotal)}</strong>
                <span style={{ color: theme.textMuted }}> ({ct.line_count} line{ct.line_count !== 1 ? 's' : ''})</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card style={sectionCard}>
        <div style={sectionTitle}>Lines</div>
        <Table columns={lineColumns} data={req.lines} rowKey="id" />
      </Card>

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
              {req.lines.map((l) => (
                <div
                  key={l.id}
                  style={{ padding: '12px', borderRadius: '8px', border: `1px solid ${theme.border}` }}
                >
                  <div style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary, marginBottom: '8px' }}>
                    {l.description || l.product_name} — needs {fmtN(l.qty)} {l.uom}
                  </div>
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
              ))}
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
          <div style={{ fontSize: '13px', color: theme.textMuted }}>
            Recording purchases per vendor happens on the Items Bought screen.
          </div>
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
