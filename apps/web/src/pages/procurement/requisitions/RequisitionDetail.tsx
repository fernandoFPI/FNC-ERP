import { useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@apollo/client'
import {
  REQUISITION_QUERY,
  REQUISITION_CHILD_POS_QUERY,
  REQUISITION_STOCK_AVAILABILITY_QUERY,
  REQUISITION_LINE_PRODUCT_AVAILABILITY_QUERY,
  SUBMIT_REQUISITION_TO_INVENTORY_CHECK,
  CONFIRM_REQUISITION_INVENTORY_CHECK,
  SUBMIT_REQUISITION_STORE_PRICING,
  SUBMIT_REQUISITION_MARKET_PRICING,
  VERIFY_REQUISITION_PRICES,
  REJECT_REQUISITION_VERIFICATION_TO_MARKET_PRICING,
  REJECT_REQUISITION_VERIFICATION_TO_STORE_PRICING,
  RESET_REQUISITION_TO_DRAFT,
  REJECT_REQUISITION_VERIFICATION_TO_INVENTORY_CHECK,
  APPROVE_REQUISITION,
  REJECT_REQUISITION_APPROVAL,
  REJECT_REQUISITION_TO_MARKET_PRICING,
  REJECT_REQUISITION_TO_INVENTORY_CHECK,
  CANCEL_REQUISITION,
  SUBMIT_REQUISITION_EDIT_REQUEST,
  APPROVE_REQUISITION_EDIT_REQUEST,
  REJECT_REQUISITION_EDIT_REQUEST,
} from '../../../graphql/requisitions'
import { NOTIFY_PO_OWNER_FOR_EDIT_REQUEST, RESOLVE_LINE_FLAG } from '../../../graphql/procurement'
import { PRODUCTS_QUERY } from '../../../graphql/inventory'
import { useAuthStore } from '../../../store/authStore'
import { useTheme } from '../../../theme/ThemeContext'
import { usePermission } from '../../../hooks/usePermission'
import { usePagePadding } from '../../../hooks/usePagePadding'
import { useBreakpoint } from '../../../hooks/useBreakpoint'
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
import { Textarea } from '../../../components/ui/Textarea'
import { Select } from '../../../components/ui/Select'
import { SearchableSelect } from '../../../components/ui/SearchableSelect'
import { LineItemEditor, type LineItemField } from '../../../components/ui/LineItemEditor'
import { buildRequisitionHTML } from '../../../lib/requisitionHtml'
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
  product_name_ar?: string | null
  sku?: string | null
  qty: string
  uom?: string | null
  currency_code: string
  unit_price: string
  initial_unit_price?: string | null
  qty_from_stock?: string | null
  source_location_id?: string | null
  source_location_name?: string | null
  source_average_cost?: string | null
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
  flag_reason?: string | null
  flagged_at?: string | null
  flagged_by_name?: string | null
  flagged_from_status?: string | null
  flag_addressed_at?: string | null
  flag_resolved_at?: string | null
  flag_resolved_by_name?: string | null
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
// (resolvers.ts) — header notes/priority/delivery_destination, line
// description/qty_ordered/unit_price/uom. branch_id and line product_id
// are also backend-allowed but left out of this form to keep it to the
// fields someone would realistically want to correct mid-flight.
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
  delivery_destination: string
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
  projectCode?: string | null
  linked_mo_id?: string | null
  linkedMoNumber?: string | null
  branch_id?: string | null
  branch_name?: string | null
  organizer_id?: string | null
  organizerName?: string | null
  assigned_receiver_id?: string | null
  assigned_receiver_name?: string | null
  notes?: string | null
  expected_delivery_date?: string | null
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
  productId?: string
  productName?: string
  productNameAr?: string | null
  qtyRequired: number
  qtyOnHand: number
  qtyAvailable: number
  isAvailable: boolean
  byLocation: LineLocationAvailability[]
}

const fmtN = (n: string | number | null | undefined) =>
  parseFloat(String(n ?? 0)).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

// Display-only — a fully-from-stock line's total_price is deliberately
// zeroed by confirmRequisitionInventoryCheck (nothing is being purchased,
// so nothing is owed; the item's real cost is booked to the project
// separately, via project_cost_actuals, once the Store Out that issues it
// is confirmed). That's correct for approval snapshots/tolerance checks,
// which must keep meaning "amount to purchase" — but it reads as if the
// item's value vanished entirely, so show store_price × qty here purely
// for display, in the line's own store_price_currency (which can differ
// from the line's currency_code).
function fromStockDisplayValue(l: ReqLine): { amount: number; currency: string } | null {
  const qty = parseFloat(l.qty) || 0
  const qtyFromStock = parseFloat(String(l.qty_from_stock ?? '0')) || 0
  const storePrice = parseFloat(String(l.store_price ?? '0')) || 0
  if (qty <= 0 || qtyFromStock + 0.0001 < qty || storePrice <= 0) return null
  return { amount: qtyFromStock * storePrice, currency: l.store_price_currency ?? '' }
}

export default function RequisitionDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { theme } = useTheme()
  const { isSystemLevel } = usePermission()
  const currentUserId = useAuthStore((s) => s.user?.id)
  const addToast = useToastStore((s) => s.addToast)
  const padding = usePagePadding()
  const { isPhone } = useBreakpoint()

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
  // price_verification-only reject destinations — mirror PurchaseOrderDetail's
  // rejectVerificationToMarket/rejectVerificationToStore, plus the two with no
  // PO equivalent (resetToDraft, rejectVerificationToInventory). All share
  // rejectReason with the pending_approval reject box below, same as PO does.
  const rejectOpts = {
    onCompleted: () => {
      setRejectReason('')
      setFlaggedLines({})
      void refetch()
    },
    onError: onErr,
  }
  const [rejectVerificationToMarket, { loading: lRejectVerifyMarket }] = useMutation(
    REJECT_REQUISITION_VERIFICATION_TO_MARKET_PRICING,
    rejectOpts,
  )
  const [rejectVerificationToStore, { loading: lRejectVerifyStore }] = useMutation(
    REJECT_REQUISITION_VERIFICATION_TO_STORE_PRICING,
    rejectOpts,
  )
  const [resetToDraft, { loading: lResetDraft }] = useMutation(RESET_REQUISITION_TO_DRAFT, rejectOpts)
  const [rejectVerificationToInventory, { loading: lRejectVerifyInventory }] = useMutation(
    REJECT_REQUISITION_VERIFICATION_TO_INVENTORY_CHECK,
    rejectOpts,
  )
  const [notifyOwnerForEdit, { loading: lNotifyOwner }] = useMutation(
    NOTIFY_PO_OWNER_FOR_EDIT_REQUEST,
    rejectOpts,
  )
  const [approve, { loading: lApprove }] = useMutation(APPROVE_REQUISITION, mutOpts)
  const [reject, { loading: lReject }] = useMutation(REJECT_REQUISITION_APPROVAL, rejectOpts)
  // pending_approval-only reject destinations — mirror REJECT_PO_TO_MARKET;
  // rejectToInventoryCheck has no PO equivalent.
  const [rejectToMarketPricing, { loading: lRejectToMarket }] = useMutation(
    REJECT_REQUISITION_TO_MARKET_PRICING,
    rejectOpts,
  )
  const [rejectToInventoryCheck, { loading: lRejectToInventory }] = useMutation(
    REJECT_REQUISITION_TO_INVENTORY_CHECK,
    rejectOpts,
  )
  const [resolveLineFlag, { loading: lResolveFlag }] = useMutation(RESOLVE_LINE_FLAG, mutOpts)
  // Mirrors PurchaseOrderDetail's own anyLoading — every button within a
  // reject box (plus that panel's own primary action) shares one combined
  // flag so a click on one disables its siblings too. Without this, the
  // per-mutation FOR UPDATE row lock in reqTransition still prevents any
  // actual double-transition (the loser just gets a clean "Expected X, got
  // Y" error toast), but nothing stops the race from being triggerable in
  // the first place — this closes that off at the UI layer instead.
  const anyVerifyLoading =
    lVerify || lResetDraft || lRejectVerifyInventory || lRejectVerifyStore || lRejectVerifyMarket || lNotifyOwner
  const anyApprovalLoading = lApprove || lReject || lRejectToMarket || lRejectToInventory
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
  // Reselect-item flow, inventory check only — the store keeper is often
  // the first person to notice a line was created against the wrong
  // product, and this is the one point in the whole lifecycle where no
  // stock reservation exists yet for any line, so swapping it here is
  // safe by construction (nothing to orphan) — see
  // confirmRequisitionInventoryCheck's own comment for why every other
  // path (edit request, admin correction) has to reconcile an existing
  // reservation instead.
  const [reselectOpenFor, setReselectOpenFor] = useState<string | null>(null)
  const [productOverride, setProductOverride] = useState<Record<string, string>>({})
  const { data: productsData } = useQuery(PRODUCTS_QUERY, {
    // Same reasoning as RequisitionForm's own line-item picker — the item
    // being corrected here can legitimately live at the central warehouse
    // company, not just this one.
    variables: { includeCentralWarehouse: true },
    skip: !req || req.status !== 'inventory_check',
  })
  const products: { id: string; sku: string; name: string; name_ar?: string | null; uom: string }[] =
    productsData?.products ?? []
  const productOptions = products.map((p) => ({
    value: p.id,
    label: p.name,
    sublabel: p.sku,
    keywords: p.name_ar ?? undefined,
  }))
  const overrideEntries = Object.entries(productOverride)
  const { data: previewData } = useQuery(REQUISITION_LINE_PRODUCT_AVAILABILITY_QUERY, {
    variables: {
      requisitionId: id,
      overrides: overrideEntries.map(([lineId, productId]) => ({ lineId, productId })),
    },
    skip: !id || overrideEntries.length === 0,
    fetchPolicy: 'cache-and-network',
  })
  const previewByLine = new Map<string, LineAvailability>(
    (previewData?.requisitionLineProductAvailability ?? []).map((a: LineAvailability) => [a.lineId, a]),
  )
  const [storePrices, setStorePrices] = useState<Record<string, string>>({})
  const [marketPrices, setMarketPrices] = useState<Record<string, string>>({})
  const [marketCurrency, setMarketCurrency] = useState<Record<string, string>>({})
  const [quoteRefs, setQuoteRefs] = useState<Record<string, string>>({})
  const [verifiedPrices, setVerifiedPrices] = useState<Record<string, string>>({})
  const [rejectReason, setRejectReason] = useState('')
  // Per-line review flags for the price_verification/pending_approval reject
  // boxes — key=lineId, value=that line's own reason. At least one is
  // required to reject (see applyLineFlags's own comment); the overall
  // rejectReason textarea above is auto-composed from these but stays
  // editable. Shared across both boxes the same way rejectReason already is.
  const [flaggedLines, setFlaggedLines] = useState<Record<string, string>>({})
  const flaggedLineIds = Object.keys(flaggedLines)
  const toggleLineFlag = (lineId: string) => {
    setFlaggedLines((prev) => {
      if (lineId in prev) {
        const next = { ...prev }
        delete next[lineId]
        return next
      }
      return { ...prev, [lineId]: '' }
    })
  }
  // Every flagged line needs a non-empty reason before either reject box's
  // destination buttons enable — mirrors applyLineFlags's own backend
  // validation exactly, so the button never fires a request the resolver
  // would just reject anyway.
  const hasValidFlags =
    flaggedLineIds.length > 0 && flaggedLineIds.every((lid) => (flaggedLines[lid] ?? '').trim())
  const lineFlagsPayload = flaggedLineIds.map((lid) => ({ lineId: lid, reason: flaggedLines[lid]!.trim() }))
  // Auto-composed from the flagged lines, same as PurchaseOrderDetail's own
  // flagAutoReason — rejectReason stays editable on top of it rather than
  // being silently overwritten.
  const flagAutoReason = flaggedLineIds
    .map((lid) => {
      const line = req?.lines.find((l) => l.id === lid)
      const name = line?.description || line?.product_name || 'Unknown item'
      const note = (flaggedLines[lid] ?? '').trim()
      return `• ${name}: ${note || 'flagged for review'}`
    })
    .join('\n')
  const effectiveRejectReason = rejectReason || flagAutoReason
  const [cancelReason, setCancelReason] = useState('')
  const [showCancelBox, setShowCancelBox] = useState(false)
  const [showPrintModal, setShowPrintModal] = useState(false)
  const printIframeRef = useRef<HTMLIFrameElement>(null)
  const [activeTab, setActiveTab] = useState<Tab>('lines')
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null)
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({})

  if (!id) return null

  if (loading && !req) {
    return (
      <div style={{ ...padding, maxWidth: '1800px', margin: '0 auto' }}>
        <div style={{ color: theme.textMuted, fontSize: '13px' }}>Loading requisition…</div>
      </div>
    )
  }

  if (!req) {
    return (
      <div style={{ ...padding, maxWidth: '1800px', margin: '0 auto' }}>
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
  // Mirrors who the backend actually lets submit an edit request
  // (organizer, or admin — a project-member-but-not-organizer teammate
  // can also submit server-side, but there's no cheap client-side signal
  // for that here, so this stays a bit narrower than the backend on
  // purpose: it only ever hides the button, never grants a capability
  // the backend wouldn't also allow).
  const canRequestEdit = isSystemLevel || isOrganizer
  // Delivery Destination stops doing anything once Finish Buying has run
  // for every line (status 'sourcing'/'completed') — by then each child
  // PO already has its own frozen copy from fork time (finishBuyingRequisition),
  // and the Approval-time Store Out decision it also drives has already
  // happened too. Editing it after that point is a silent no-op, not a
  // correction — surfaced as disabled-with-explanation rather than left
  // to quietly do nothing.
  const deliveryDestinationEditable = !['sourcing', 'completed'].includes(req.status)

  // Shared by both reject boxes (price_verification/pending_approval) — the
  // actual flag checkbox + reason live on each row in the Lines tab (right
  // side), not duplicated here as a second list of line names. This is just
  // a pointer + live count so the action panel still shows where things
  // stand without repeating the line names.
  const renderLineFlagHint = () => (
    <div
      style={{
        fontSize: '12px',
        color: flaggedLineIds.length > 0 ? theme.accent : theme.textMuted,
        marginBottom: '12px',
      }}
    >
      {flaggedLineIds.length > 0
        ? `${flaggedLineIds.length} line${flaggedLineIds.length === 1 ? '' : 's'} flagged — check the Lines tab to add more or edit reasons.`
        : 'Check the line(s) that need attention in the Lines tab on the right (required to reject).'}
    </div>
  )

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
    // Flag-to-reject checkbox — only at the two statuses a reject box can
    // appear for. Leftmost deliberately: this table can grow wider than the
    // visible card (many price columns), and only leading columns are
    // guaranteed visible without horizontal scroll. Lives here, next to the
    // actual line, instead of a second list of line names in the action
    // panel — see toggleLineFlag.
    ...(req.status === 'price_verification' || req.status === 'pending_approval'
      ? [
          {
            key: 'flag_toggle',
            header: 'Flag',
            width: '36px',
            render: (l: ReqLine) => (
              <input
                type="checkbox"
                checked={l.id in flaggedLines}
                onChange={() => toggleLineFlag(l.id)}
                title="Flag this line for rejection"
              />
            ),
          },
        ]
      : []),
    {
      key: 'index',
      header: '#',
      width: '32px',
      render: (l) => (
        <span
          style={{
            fontSize: '12px',
            color: theme.textMuted,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {req.lines.findIndex((line) => line.id === l.id) + 1}
        </span>
      ),
    },
    {
      key: 'description',
      header: 'Item',
      render: (l) => (
        <div>
          <div style={{ fontSize: '13px', color: theme.textPrimary }}>
            {l.description || l.product_name || '—'}
          </div>
          {l.product_name_ar && (
            <div dir="rtl" style={{ fontSize: '12px', color: theme.textMuted, textAlign: 'left' }}>
              {l.product_name_ar}
            </div>
          )}
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
    {
      key: 'total',
      header: 'Total',
      render: (l) => {
        const fromStock = (parseFloat(String(l.total)) || 0) === 0 ? fromStockDisplayValue(l) : null
        if (fromStock) {
          return (
            <span style={{ fontSize: '13px', color: theme.textMuted }}>
              {fmtN(fromStock.amount)} {fromStock.currency}
              <span style={{ fontSize: '11px' }}> (from stock)</span>
            </span>
          )
        }
        return (
          <span style={{ fontSize: '13px' }}>
            {fmtN(l.total)} {l.currency_code}
          </span>
        )
      },
    },
  ]

  // ── Edit requests: diff builder (mirrors PurchaseOrderDetail's own
  // 'changes' tab, scoped to the fields applyRequisitionEditChanges allows)
  const initEditDraft = (): EditDraft => ({
    notes: req.notes ?? '',
    priority: req.priority ?? 'low',
    delivery_destination: req.delivery_destination ?? '',
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
    if (req.purpose === 'project' && draft.delivery_destination !== (req.delivery_destination ?? ''))
      header.delivery_destination = {
        from: req.delivery_destination ?? '',
        to: draft.delivery_destination,
      }

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
    <div
      style={{
        ...padding,
        paddingBottom: isPhone ? 'calc(env(safe-area-inset-bottom, 0px) + 120px)' : padding.paddingBottom,
        maxWidth: '1800px',
        margin: '0 auto',
      }}
    >
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
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button variant="secondary" size="sm" onClick={() => setShowPrintModal(true)}>
              Print
            </Button>
            {canCancel && (
              <Button variant="danger" size="sm" onClick={() => setShowCancelBox((v) => !v)}>
                Cancel
              </Button>
            )}
          </div>
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
              value: (() => {
                // Purchased amount (per currency) plus, folded in separately
                // since it's display-only, each from-stock line's reference
                // value — see fromStockDisplayValue's own comment for why
                // this stays out of req.currencyTotals itself (that number
                // feeds the approval snapshot/tolerance checks and must keep
                // meaning "amount to purchase").
                const fromStockTotals = new Map<string, number>()
                for (const l of req.lines) {
                  const fromStock = (parseFloat(String(l.total)) || 0) === 0 ? fromStockDisplayValue(l) : null
                  if (fromStock) {
                    fromStockTotals.set(
                      fromStock.currency,
                      (fromStockTotals.get(fromStock.currency) ?? 0) + fromStock.amount,
                    )
                  }
                }
                if (req.currencyTotals.length === 0 && fromStockTotals.size === 0) return '—'
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    {req.currencyTotals.map((ct) => (
                      <span key={ct.currency_code}>
                        {fmtN(ct.subtotal)} {ct.currency_code}
                      </span>
                    ))}
                    {[...fromStockTotals.entries()].map(([currency, amount]) => (
                      <span key={`stock-${currency}`} style={{ color: theme.textMuted, fontSize: '12px' }}>
                        + {fmtN(amount)} {currency} (from stock)
                      </span>
                    ))}
                  </div>
                )
              })(),
            },
            { label: 'Priority', value: REQUISITION_PRIORITY_LABELS[req.priority ?? 'low'] ?? req.priority ?? '—' },
            {
              label: 'Project',
              value: req.projectCode ? `${req.projectCode} — ${req.projectName ?? ''}` : (req.projectName ?? '—'),
            },
            ...(req.linkedMoNumber ? [{ label: 'Manufacturing Order', value: req.linkedMoNumber }] : []),
            { label: 'Branch', value: req.branch_name ?? '—' },
            { label: 'Organizer', value: req.organizerName ?? '—' },
            { label: 'Received By', value: req.assigned_receiver_name ?? '—' },
            { label: 'Expected Delivery', value: req.expected_delivery_date?.slice(0, 10) ?? '—' },
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

      {/* Next Step (left) and Tabs/Lines (right) side by side instead of
          stacked, matching PurchaseOrderDetail's own layout — both are tall
          on their own and the page has plenty of unused horizontal room on
          wide screens. CSS `order` puts the per-status panels column first
          visually without moving that ~400-line block in the source; it
          stays exactly where it was, right before the closing </div>. */}
      <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flex: '3 1 560px', minWidth: 0, order: 2 }}>
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
          <Table
            columns={lineColumns}
            data={req.lines}
            rowKey="id"
            getRowStyle={(l) => {
              // Currently checked for the reject box in progress — takes
              // priority over an older, already-resolved-away flag.
              if (l.id in flaggedLines) {
                return { borderLeft: `4px solid ${theme.accent}`, background: `${theme.accent}0c` }
              }
              if (!l.flag_reason || l.flag_resolved_at) return {}
              const open = !l.flag_addressed_at
              const color = open ? theme.danger : theme.warning
              return { borderLeft: `4px solid ${color}`, background: `${color}0c` }
            }}
            renderExpanded={(l) => {
              const hasOpenFlag = !!l.flag_reason && !l.flag_resolved_at
              const isComposing = l.id in flaggedLines
              if (!hasOpenFlag && !isComposing) return null
              const open = hasOpenFlag && !l.flag_addressed_at
              const color = open ? theme.danger : theme.warning
              // Whoever could have created a flag from that same stage may
              // resolve it — mirrors resolveLineFlag's own backend gate
              // exactly (procurement_2nd for price_verification-origin,
              // dept-head/approver/admin for pending_approval-origin).
              const canResolve =
                (l.flagged_from_status === 'price_verification' && (isSystemLevel || canVerifyPrice)) ||
                (l.flagged_from_status === 'pending_approval' && (isSystemLevel || canApprove))
              // Stacked (not side-by-side) deliberately — this cell is
              // colSpan'd across every column, so its rendered width matches
              // the table's full (often wider-than-viewport, horizontally-
              // scrolled) width, not the visible card. A flex row with
              // justifyContent:'space-between' would push the Resolve button
              // out past the visible area, reachable only by scrolling right
              // with no hint to do so.
              return (
                <div>
                  {hasOpenFlag && (
                    <div style={{ marginBottom: isComposing ? '10px' : 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                            padding: '2px 8px',
                            borderRadius: '999px',
                            background: `${color}18`,
                            color,
                            border: `1px solid ${color}40`,
                          }}
                        >
                          {open ? 'Flagged' : 'Addressed — awaiting confirmation'}
                        </span>
                        <span style={{ fontSize: '11px', color: theme.textMuted }}>
                          by {l.flagged_by_name ?? 'someone'} during{' '}
                          {l.flagged_from_status === 'price_verification' ? 'Price Verification' : 'Pending Approval'}
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: '13px',
                          color: theme.textPrimary,
                          marginBottom: canResolve && !open ? '8px' : 0,
                        }}
                      >
                        {l.flag_reason}
                      </div>
                      {canResolve && !open && (
                        <Button
                          variant="secondary"
                          size="sm"
                          loading={lResolveFlag}
                          onClick={() => void resolveLineFlag({ variables: { lineId: l.id } })}
                        >
                          Resolve
                        </Button>
                      )}
                    </div>
                  )}
                  {isComposing && (
                    <div>
                      <div
                        style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          color: theme.accent,
                          marginBottom: '4px',
                        }}
                      >
                        Flagging this line — required to reject
                      </div>
                      <Textarea
                        value={flaggedLines[l.id] ?? ''}
                        onChange={(e) => setFlaggedLines((prev) => ({ ...prev, [l.id]: e.target.value }))}
                        placeholder="What's wrong with this line?"
                        rows={2}
                      />
                    </div>
                  )}
                </div>
              )
            }}
          />
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
                  {!editDraft && !hasPendingEdit && canRequestEdit && (
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
                    {!canRequestEdit
                      ? 'Only the organizer or an admin can request an edit here.'
                      : hasPendingEdit
                        ? 'There is already a pending edit request. An admin must approve or reject it before a new one can be submitted.'
                        : 'Click "Start editing" to propose changes to the notes, priority, delivery destination, or lines. A pre-approval edit applies immediately; a post-approval edit needs admin review first.'}
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
                      {req.purpose === 'project' && (
                        <div style={{ flex: '1 1 220px' }}>
                          <Select
                            label="Delivery Destination"
                            value={editDraft.delivery_destination}
                            disabled={!deliveryDestinationEditable}
                            onChange={(e) =>
                              setEditDraft({ ...editDraft, delivery_destination: e.target.value })
                            }
                          >
                            <option value="">— Not set —</option>
                            <option value="inventory">Delivered to inventory</option>
                            <option value="jobsite">Delivered directly to the jobsite</option>
                          </Select>
                          {!deliveryDestinationEditable && (
                            <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '4px' }}>
                              No longer editable — buying already forked this into one or more
                              Purchase Orders, each with its own frozen copy of this value.
                            </div>
                          )}
                        </div>
                      )}
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
                                {String(diff.from ?? '—') || '—'}
                              </span>
                              <span style={{ color: theme.textMuted }}>→</span>
                              <span style={{ color: theme.accent }}>{String(diff.to ?? '—') || '—'}</span>
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
        </div>

        <div style={{ flex: '1 1 340px', minWidth: 0, order: 1 }}>
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
                const isOverridden = !!productOverride[l.id]
                const avail = isOverridden ? previewByLine.get(l.id) : availabilityByLine.get(l.id)
                const qtyReserved = avail ? avail.qtyOnHand - avail.qtyAvailable : null
                return (
                <div
                  key={l.id}
                  style={{ padding: '12px', borderRadius: '8px', border: `1px solid ${theme.border}` }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      gap: '10px',
                      marginBottom: '8px',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary }}>
                        {(isOverridden ? avail?.productName : null) ?? l.description ?? l.product_name} — needs{' '}
                        {fmtN(l.qty)} {l.uom}
                      </div>
                      {(isOverridden ? avail?.productNameAr : l.product_name_ar) && (
                        <div dir="rtl" style={{ fontSize: '12px', color: theme.textMuted, textAlign: 'left' }}>
                          {isOverridden ? avail?.productNameAr : l.product_name_ar}
                        </div>
                      )}
                    </div>
                    {canConfirmInventory && (
                      <button
                        type="button"
                        onClick={() => {
                          setReselectOpenFor((cur) => (cur === l.id ? null : l.id))
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          flexShrink: 0,
                          fontSize: '11px',
                          color: theme.accent,
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                        }}
                      >
                        {isOverridden ? 'Change selection' : 'Wrong item? Reselect'}
                      </button>
                    )}
                  </div>
                  {reselectOpenFor === l.id && (
                    <div style={{ marginBottom: '10px' }}>
                      <SearchableSelect
                        label="Correct item"
                        value={productOverride[l.id] ?? ''}
                        onChange={(productId) => {
                          setProductOverride((prev) => ({ ...prev, [l.id]: productId }))
                          setInvQty((prev) => ({ ...prev, [l.id]: '' }))
                          setInvLoc((prev) => {
                            const next = { ...prev }
                            delete next[l.id]
                            return next
                          })
                          setReselectOpenFor(null)
                        }}
                        options={productOptions}
                        placeholder="Search by name or SKU…"
                        minDropdownWidth={360}
                      />
                    </div>
                  )}
                  {avail ? (
                    <div
                      style={{
                        display: 'flex',
                        gap: '16px',
                        flexWrap: 'wrap',
                        fontSize: '12px',
                        color: theme.textMuted,
                        marginBottom: '12px',
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
                    </div>
                  ) : (
                    <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '10px' }}>
                      {isOverridden ? 'Checking stock for the newly selected item…' : 'Loading stock levels…'}
                    </div>
                  )}
                  {avail && (
                    // Only locations that actually have stock of this item —
                    // matches PurchaseOrderDetail's own inventory-check card
                    // list, fed by the same byLocation shape instead of a
                    // plain dropdown built from every active stock location.
                    avail.byLocation.length > 0 ? (
                      <div style={{ marginBottom: '12px' }}>
                        <label
                          style={{
                            fontSize: '12px',
                            fontWeight: 500,
                            color: theme.textSecondary,
                            display: 'block',
                            marginBottom: '6px',
                          }}
                        >
                          Source location
                        </label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {avail.byLocation.map((loc) => {
                            const selected = invLoc[l.id] === loc.locationId
                            return (
                              <button
                                key={loc.locationId}
                                type="button"
                                onClick={() => {
                                  setInvLoc((prev) => ({ ...prev, [l.id]: loc.locationId }))
                                  const currentQty = parseFloat(invQty[l.id] ?? '0') || 0
                                  if (currentQty > loc.qtyAvailable) {
                                    setInvQty((prev) => ({ ...prev, [l.id]: String(Math.max(0, loc.qtyAvailable)) }))
                                  }
                                }}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  gap: '12px',
                                  padding: '10px 14px',
                                  borderRadius: '8px',
                                  textAlign: 'left',
                                  cursor: 'pointer',
                                  fontFamily: 'inherit',
                                  border: `1px solid ${selected ? theme.accent : theme.border}`,
                                  background: selected ? `${theme.accent}18` : theme.bgCanvas,
                                }}
                              >
                                <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                  <span
                                    style={{
                                      width: '14px',
                                      height: '14px',
                                      borderRadius: '50%',
                                      border: `2px solid ${selected ? theme.accent : theme.border}`,
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      flexShrink: 0,
                                    }}
                                  >
                                    {selected && (
                                      <span
                                        style={{
                                          width: '6px',
                                          height: '6px',
                                          borderRadius: '50%',
                                          background: theme.accent,
                                        }}
                                      />
                                    )}
                                  </span>
                                  <span>
                                    <div
                                      style={{
                                        fontSize: '13px',
                                        fontWeight: selected ? 600 : 500,
                                        color: selected ? theme.accent : theme.textPrimary,
                                      }}
                                    >
                                      {loc.locationName}
                                    </div>
                                    <div style={{ fontSize: '11px', color: theme.textMuted }}>
                                      {loc.companyName}
                                    </div>
                                  </span>
                                </span>
                                <span
                                  style={{
                                    fontSize: '13px',
                                    fontWeight: 600,
                                    color: selected ? theme.accent : theme.textSecondary,
                                    whiteSpace: 'nowrap',
                                    flexShrink: 0,
                                  }}
                                >
                                  {fmtN(loc.qtyAvailable)} avail.
                                </span>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ) : (
                      <div style={{ marginBottom: '12px', fontSize: '12px', color: theme.textMuted }}>
                        No stock available at any location for this item.
                      </div>
                    )
                  )}
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <div style={{ width: '140px' }}>
                      <Input
                        label="Qty from stock"
                        type="number"
                        min="0"
                        max={String(
                          (() => {
                            const qtyNeeded = parseFloat(l.qty) || 0
                            const selectedLoc = avail?.byLocation.find((loc) => loc.locationId === invLoc[l.id])
                            return selectedLoc ? Math.min(qtyNeeded, selectedLoc.qtyAvailable) : qtyNeeded
                          })(),
                        )}
                        value={invQty[l.id] ?? ''}
                        onChange={(e) => {
                          const qtyNeeded = parseFloat(l.qty) || 0
                          const selectedLoc = avail?.byLocation.find((loc) => loc.locationId === invLoc[l.id])
                          const max = selectedLoc ? Math.min(qtyNeeded, selectedLoc.qtyAvailable) : qtyNeeded
                          const v = Math.max(0, Math.min(max, parseFloat(e.target.value) || 0))
                          setInvQty((prev) => ({ ...prev, [l.id]: e.target.value === '' ? '' : String(v) }))
                        }}
                        placeholder="0"
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
                        productId: productOverride[l.id] || undefined,
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
            (() => {
              // Store price only values the from-stock portion of a line —
              // mirrors PurchaseOrderDetail's own stockLines filter. In the
              // normal flow this panel is auto-filled and skipped entirely
              // by confirmRequisitionInventoryCheck; it only renders at all
              // for the rare case a requisition is moved back here by some
              // other path, so pre-filling from each line's own source
              // average cost still matters here too.
              const stockLines = req.lines.filter(
                (l) => (parseFloat(String(l.qty_from_stock ?? '0')) || 0) > 0,
              )
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {stockLines.length === 0 && (
                    <div style={{ fontSize: '13px', color: theme.textMuted }}>
                      No lines on this requisition are being fulfilled from stock — there's
                      nothing to price here.
                    </div>
                  )}
                  {stockLines.map((l) => {
                    const defaultPrice = l.store_price ?? l.source_average_cost ?? ''
                    return (
                      <div key={l.id} style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
                        <div style={{ flex: 1, fontSize: '13px', color: theme.textPrimary, paddingBottom: '10px' }}>
                          {l.description || l.product_name}
                          {l.source_location_name && (
                            <span style={{ color: theme.textMuted }}>
                              {' '}
                              · from {l.source_location_name}
                              {l.source_average_cost != null && ` (last cost ${l.source_average_cost})`}
                            </span>
                          )}
                        </div>
                        <div style={{ width: '140px' }}>
                          <Input
                            label="Store price"
                            type="number"
                            min="0"
                            value={storePrices[l.id] ?? String(defaultPrice)}
                            onChange={(e) => setStorePrices((prev) => ({ ...prev, [l.id]: e.target.value }))}
                            placeholder="0.00"
                          />
                        </div>
                      </div>
                    )
                  })}
                  <Button
                    variant="primary"
                    loading={lStore}
                    style={{ alignSelf: 'flex-start' }}
                    onClick={() =>
                      void submitStorePricing({
                        variables: {
                          id: req.id,
                          linePrices: stockLines.map((l) => ({
                            lineId: l.id,
                            storePrice:
                              parseFloat(
                                storePrices[l.id] ?? String(l.store_price ?? l.source_average_cost ?? '0'),
                              ) || 0,
                            currencyCode: l.currency_code,
                          })),
                        },
                      })
                    }
                  >
                    Submit to market pricing
                  </Button>
                </div>
              )
            })()
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
          ) : (() => {
            // Only lines still needing purchase — a line fully covered
            // from stock was already zeroed and priced (for reference) at
            // inventory check, and never needs a market price. Mirrors
            // PurchaseOrderDetail's own purchaseLines filter exactly. A
            // free-text/service line has no qty_from_stock at all, so it
            // always shows up here.
            const purchaseLines = req.lines.filter(
              (l) => (parseFloat(l.qty) || 0) - (parseFloat(String(l.qty_from_stock ?? '0')) || 0) > 0.0001,
            )
            return purchaseLines.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'flex-start' }}>
                <div style={{ fontSize: '13px', color: theme.textMuted }}>
                  Nothing on this requisition needs a market price — every line is covered from stock.
                </div>
                <Button
                  variant="primary"
                  loading={lMarket}
                  onClick={() => void submitMarketPricing({ variables: { id: req.id, linePrices: [] } })}
                >
                  Continue to price verification
                </Button>
              </div>
            ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {purchaseLines.map((l) => {
                const raw = marketPrices[l.id]
                const missing = raw === undefined || raw === ''
                const invalid = !missing && (isNaN(parseFloat(raw)) || parseFloat(raw) < 0)
                return (
                  <div
                    key={l.id}
                    style={{
                      padding: '12px',
                      borderRadius: '8px',
                      border: `1px solid ${missing || invalid ? theme.dangerBorder : theme.border}`,
                    }}
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
                          value={raw ?? ''}
                          onChange={(e) => setMarketPrices((prev) => ({ ...prev, [l.id]: e.target.value }))}
                          placeholder="0.00"
                          error={missing ? 'Required' : invalid ? 'Enter a valid price' : undefined}
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
                )
              })}
              {(() => {
                const allPriced = purchaseLines.every((l) => {
                  const raw = marketPrices[l.id]
                  return raw !== undefined && raw !== '' && !isNaN(parseFloat(raw)) && parseFloat(raw) >= 0
                })
                return (
                  <>
                    {!allPriced && (
                      <div style={{ fontSize: '12px', color: theme.danger }}>
                        Enter a price for every line — including free-text/service lines — before submitting.
                      </div>
                    )}
                    <Button
                      variant="primary"
                      loading={lMarket}
                      disabled={!allPriced}
                      style={{ alignSelf: 'flex-start' }}
                      onClick={() =>
                        void submitMarketPricing({
                          variables: {
                            id: req.id,
                            linePrices: purchaseLines.map((l) => ({
                              lineId: l.id,
                              marketPrice: parseFloat(marketPrices[l.id]!),
                              currencyCode: marketCurrency[l.id] ?? l.currency_code,
                              vendorQuoteRef: quoteRefs[l.id] || undefined,
                            })),
                          },
                        })
                      }
                    >
                      Submit to price verification
                    </Button>
                  </>
                )
              })()}
            </div>
            )
          })()}
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
          ) : (() => {
            // Same purchaseLines filter as the market-pricing panel above —
            // a line fully covered from stock never got a market price
            // either, so there's nothing here to verify for it.
            const purchaseLines = req.lines.filter(
              (l) => (parseFloat(l.qty) || 0) - (parseFloat(String(l.qty_from_stock ?? '0')) || 0) > 0.0001,
            )
            return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {purchaseLines.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'flex-start' }}>
                  <div style={{ fontSize: '13px', color: theme.textMuted }}>
                    Nothing on this requisition needs price verification — every line is covered from stock.
                  </div>
                  <Button
                    variant="primary"
                    loading={anyVerifyLoading}
                    onClick={() => void verifyPrices({ variables: { id: req.id, lineAdjustments: [] } })}
                  >
                    Continue to approval
                  </Button>
                </div>
              ) : (
                <>
                  {purchaseLines.map((l) => {
                    const raw = verifiedPrices[l.id] ?? (l.market_price != null ? String(l.market_price) : '')
                    const missing = raw === ''
                    const invalid = !missing && (isNaN(parseFloat(raw)) || parseFloat(raw) < 0)
                    return (
                      <div key={l.id} style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
                        <div style={{ flex: 1, fontSize: '13px', color: theme.textPrimary, paddingBottom: '10px' }}>
                          {l.description || l.product_name}
                          <div style={{ fontSize: '11px', color: theme.textMuted }}>
                            Market: {l.market_price != null ? `${fmtN(l.market_price)} ${l.market_price_currency}` : 'not set'}
                          </div>
                        </div>
                        <div style={{ width: '140px' }}>
                          <Input
                            label="Verified price"
                            type="number"
                            min="0"
                            value={raw}
                            onChange={(e) => setVerifiedPrices((prev) => ({ ...prev, [l.id]: e.target.value }))}
                            placeholder="0.00"
                            error={missing ? 'Required' : invalid ? 'Enter a valid price' : undefined}
                          />
                        </div>
                      </div>
                    )
                  })}
                  {(() => {
                    const allVerified = purchaseLines.every((l) => {
                      const raw = verifiedPrices[l.id] ?? (l.market_price != null ? String(l.market_price) : '')
                      return raw !== '' && !isNaN(parseFloat(raw)) && parseFloat(raw) >= 0
                    })
                    return (
                      <>
                        {!allVerified && (
                          <div style={{ fontSize: '12px', color: theme.danger }}>
                            Enter a verified price for every line before submitting — a missing market price does
                            not default to 0.
                          </div>
                        )}
                        <Button
                          variant="primary"
                          loading={anyVerifyLoading}
                          disabled={!allVerified}
                          style={{ alignSelf: 'flex-start' }}
                          onClick={() =>
                            void verifyPrices({
                              variables: {
                                id: req.id,
                                lineAdjustments: purchaseLines.map((l) => ({
                                  lineId: l.id,
                                  verifiedPrice: parseFloat(
                                    verifiedPrices[l.id] ?? (l.market_price != null ? String(l.market_price) : ''),
                                  ),
                                })),
                              },
                            })
                          }
                        >
                          Submit for approval
                        </Button>
                      </>
                    )
                  })()}
                </>
              )}

              {/* ── Reject box — mirrors PurchaseOrderDetail's price_verification
                   "Not ready to approve?" panel, now with a required per-line
                   flag picker (migration 279) feeding both the destination
                   mutations' lineFlags and this composed reason ─────────── */}
              <div
                style={{
                  marginTop: '4px',
                  padding: '16px',
                  borderRadius: '10px',
                  background: theme.bgCanvas,
                  border: `1px solid ${theme.border}`,
                }}
              >
                <div style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary, marginBottom: '10px' }}>
                  Not ready to approve?
                </div>
                {renderLineFlagHint()}
                <Textarea
                  label="Overall reason (auto-filled from flagged lines — edit as needed)"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder={flagAutoReason || 'Enter reason…'}
                  rows={2}
                />
                <div style={{ fontSize: '11px', fontWeight: 500, color: theme.textMuted, margin: '12px 0 6px' }}>
                  Send back to
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <Button
                    variant="danger"
                    disabled={!hasValidFlags}
                    loading={anyVerifyLoading}
                    onClick={() =>
                      void resetToDraft({
                        variables: { id: req.id, reason: effectiveRejectReason, lineFlags: lineFlagsPayload },
                      })
                    }
                  >
                    Reset to Draft
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={!hasValidFlags}
                    loading={anyVerifyLoading}
                    onClick={() =>
                      void rejectVerificationToInventory({
                        variables: { id: req.id, reason: effectiveRejectReason, lineFlags: lineFlagsPayload },
                      })
                    }
                  >
                    Inventory Check
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={!hasValidFlags}
                    loading={anyVerifyLoading}
                    onClick={() =>
                      void rejectVerificationToStore({
                        variables: { id: req.id, reason: effectiveRejectReason, lineFlags: lineFlagsPayload },
                      })
                    }
                  >
                    Store Pricing
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={!hasValidFlags}
                    loading={anyVerifyLoading}
                    onClick={() =>
                      void rejectVerificationToMarket({
                        variables: { id: req.id, reason: effectiveRejectReason, lineFlags: lineFlagsPayload },
                      })
                    }
                  >
                    Market Pricing
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={!effectiveRejectReason.trim()}
                    loading={anyVerifyLoading}
                    onClick={() =>
                      void notifyOwnerForEdit({ variables: { requisitionId: req.id, reason: effectiveRejectReason } })
                    }
                  >
                    Owner (Request Edit)
                  </Button>
                </div>
              </div>
            </div>
            )
          })()}
        </Card>
      )}

      {/* ── Panel 6: pending_approval ─────────────────────────────────────── */}
      {req.status === 'pending_approval' && (
        <Card style={sectionCard}>
          <div style={sectionTitle}>Next step: approve or reject</div>
          <div style={sectionHint}>Rejecting sends this requisition back to an earlier stage for revision.</div>
          {!canApprove ? (
            <div style={{ fontSize: '13px', color: theme.textMuted }}>
              Only the department head, the assigned approver, or an admin can act here.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <Button
                variant="primary"
                loading={anyApprovalLoading}
                style={{ alignSelf: 'flex-start' }}
                onClick={() => void approve({ variables: { id: req.id } })}
              >
                Approve
              </Button>

              {/* ── Reject box — mirrors PurchaseOrderDetail's pending_approval
                   "Not ready to approve?" panel, now with a required per-line
                   flag picker (migration 279) feeding both the destination
                   mutations' lineFlags and this composed reason ─────────── */}
              <div
                style={{
                  marginTop: '4px',
                  padding: '16px',
                  borderRadius: '10px',
                  background: theme.bgCanvas,
                  border: `1px solid ${theme.border}`,
                }}
              >
                <div style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary, marginBottom: '10px' }}>
                  Not ready to approve?
                </div>
                {renderLineFlagHint()}
                <Textarea
                  label="Overall reason (auto-filled from flagged lines — edit as needed)"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder={flagAutoReason || 'Enter reason…'}
                  rows={2}
                />
                <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
                  <Button
                    variant="danger"
                    disabled={!hasValidFlags}
                    loading={anyApprovalLoading}
                    onClick={() =>
                      void reject({
                        variables: { id: req.id, reason: effectiveRejectReason, lineFlags: lineFlagsPayload },
                      })
                    }
                  >
                    Reset to Draft
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={!hasValidFlags}
                    loading={anyApprovalLoading}
                    onClick={() =>
                      void rejectToInventoryCheck({
                        variables: { id: req.id, reason: effectiveRejectReason, lineFlags: lineFlagsPayload },
                      })
                    }
                  >
                    Send Back to Inventory Check
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={!hasValidFlags}
                    loading={anyApprovalLoading}
                    onClick={() =>
                      void rejectToMarketPricing({
                        variables: { id: req.id, reason: effectiveRejectReason, lineFlags: lineFlagsPayload },
                      })
                    }
                  >
                    Send Back to Market Pricing
                  </Button>
                </div>
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
      </div>

      {/* Print dialog — mirrors PurchaseOrderDetail's own print modal
          (buildRequisitionHTML instead of buildPurchaseOrderHTML: no vendor
          block since a requisition predates vendor selection, and no
          "include internal notes" toggle since — unlike a PO — a
          requisition is never sent outside the company, so there's no
          vendor-copy/internal-copy distinction to redact for. */}
      {showPrintModal &&
        (() => {
          const fromStockTotals = new Map<string, number>()
          for (const l of req.lines) {
            const fromStock = (parseFloat(String(l.total)) || 0) === 0 ? fromStockDisplayValue(l) : null
            if (fromStock) {
              fromStockTotals.set(fromStock.currency, (fromStockTotals.get(fromStock.currency) ?? 0) + fromStock.amount)
            }
          }
          const approvalTrail = [
            { action: 'confirm_inventory_check', label: 'Inventory Checked By' },
            { action: 'submit_to_market_pricing', label: 'Store Priced By' },
            { action: 'submit_to_price_verification', label: 'Market Priced By' },
            { action: 'submit_for_approval', label: 'Price Verified By' },
            { action: 'approve', label: 'Approved By' },
          ]
            .map(({ action, label }) => {
              const entry = [...req.approval_log].reverse().find((e) => e.action === action)
              return entry ? { label, name: entry.actor_name ?? '—', date: entry.created_at } : null
            })
            .filter((s): s is { label: string; name: string; date: string } => s !== null)

          return (
            <div
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 9999,
                background: 'rgba(0,0,0,0.45)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '24px',
              }}
              onClick={() => setShowPrintModal(false)}
            >
              <div
                style={{
                  background: theme.bgSurface,
                  borderRadius: '12px',
                  boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
                  width: '94vw',
                  maxWidth: '1100px',
                  height: '92vh',
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Dialog header */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '16px 20px',
                    borderBottom: `1px solid ${theme.border}`,
                    flexShrink: 0,
                  }}
                >
                  <span style={{ fontWeight: 600, fontSize: '15px', color: theme.textPrimary }}>
                    Print Requisition — {req.requisition_number}
                  </span>
                  <button
                    onClick={() => setShowPrintModal(false)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: theme.textMuted,
                      fontSize: '18px',
                      lineHeight: 1,
                      padding: '2px 6px',
                      borderRadius: '4px',
                    }}
                  >
                    ×
                  </button>
                </div>

                {/* iframe preview */}
                <div style={{ flex: 1, overflow: 'hidden', background: '#f3f4f6', minHeight: 0 }}>
                  <iframe
                    ref={printIframeRef}
                    srcDoc={buildRequisitionHTML({
                      requisition_number: req.requisition_number,
                      status: getRequisitionStatusLabel(req.status),
                      priority: req.priority ?? 'low',
                      purpose: req.purpose,
                      created_at: req.created_at,
                      expected_delivery_date: req.expected_delivery_date,
                      projectCode: req.projectCode,
                      projectName: req.projectName,
                      branchName: req.branch_name,
                      organizerName: req.organizerName,
                      lines: req.lines.map((l) => ({
                        description: l.description ?? l.product_name ?? '',
                        product_name: l.product_name,
                        qty: parseFloat(l.qty) || 0,
                        uom: l.uom ?? '',
                        currency_code: l.currency_code,
                        unit_price: parseFloat(l.unit_price) || 0,
                        total: parseFloat(l.total) || 0,
                        fromStock: (parseFloat(String(l.total)) || 0) === 0 ? fromStockDisplayValue(l) : null,
                      })),
                      currencyTotals: req.currencyTotals.map((ct) => ({
                        currency: ct.currency_code,
                        amount: parseFloat(ct.subtotal) || 0,
                      })),
                      fromStockTotals: [...fromStockTotals.entries()].map(([currency, amount]) => ({
                        currency,
                        amount,
                      })),
                      approvalTrail,
                    })}
                    style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
                    title={`Requisition ${req.requisition_number}`}
                  />
                </div>

                {/* Dialog footer */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    gap: '12px',
                    padding: '14px 20px',
                    borderTop: `1px solid ${theme.border}`,
                    flexShrink: 0,
                  }}
                >
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <Button variant="ghost" size="sm" onClick={() => setShowPrintModal(false)}>
                      Cancel
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => printIframeRef.current?.contentWindow?.print()}
                    >
                      Print / Save as PDF
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )
        })()}
    </div>
  )
}
