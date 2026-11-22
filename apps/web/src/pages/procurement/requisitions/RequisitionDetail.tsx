import { useTranslation } from 'react-i18next'
import { useState, useRef, useEffect, useCallback, useMemo, type ReactNode } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@apollo/client'
import {
  REQUISITION_QUERY,
  REQUISITION_CHILD_POS_QUERY,
  REQUISITION_STOCK_AVAILABILITY_QUERY,
  REQUISITION_LINE_PRODUCT_AVAILABILITY_QUERY,
  SUBMIT_REQUISITION_TO_INVENTORY_CHECK,
  SUBMIT_REQUISITION_DIRECT_SUPPLY,
  CONFIRM_REQUISITION_INVENTORY_CHECK,
  CONFIRM_REQUISITION_STOCK_COST,
  SUBMIT_REQUISITION_STORE_PRICING,
  SUBMIT_REQUISITION_MARKET_PRICING,
  SET_REQUISITION_LINE_OWNER,
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
import { RESOLVE_LINE_FLAG, PO_LINE_COMMENTS_QUERY } from '../../../graphql/procurement'
import { LineCommentsModal, type LineComment } from './LineCommentsModal'
import { LineNoteButton } from './LineNoteButton'
import { PRODUCTS_QUERY } from '../../../graphql/inventory'
import { MATERIAL_ISSUES_QUERY } from '../../../graphql/projects'
import { useAuthStore } from '../../../store/authStore'
import { useTheme } from '../../../theme/ThemeContext'
import { enumLabel, useIsRtl } from '../../../i18n'
import { denseFormStyles } from '../../../components/ui/fieldStyles'
import { usePermission } from '../../../hooks/usePermission'
import { usePagePadding } from '../../../hooks/usePagePadding'
import { useBreakpoint } from '../../../hooks/useBreakpoint'
import { useEntityChanged } from '../../../hooks/useEntityChanged'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { EditRequestCard } from '../../../components/procurement/EditRequestCard'
import { InventoryCost } from '../../../components/procurement/InventoryCost'
import { ColumnsMenu } from '../../../components/ui/ColumnsMenu'
import { useTableView } from '../../../hooks/useTableView'
import { Button } from '../../../components/ui/Button'
import { PhaseBar } from '../../../components/procurement/PhaseBar'
import { StageActionBar } from '../../../components/procurement/StageActionBar'
import { OrganizerReviewPanel } from '../../../components/procurement/OrganizerReviewPanel'
import { LinePriceInput } from '../../../components/procurement/LinePriceInput'
import { InlineSelect } from '../../../components/procurement/InlineSelect'
import { StaleCostNotice } from '../../../components/procurement/StaleCostNotice'
import { ActivityTimeline } from '../../../components/procurement/ActivityTimeline'
import { OverflowMenu } from '../../../components/procurement/OverflowMenu'
import {
  SendBackDialog,
  type SendBackDestination,
} from '../../../components/procurement/SendBackDialog'
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
  DIRECT_SUPPLY_PURPOSE,
  requisitionPhasesFor,
  getRequisitionPhaseLabel,
  getRequisitionPriorityLabel,
  getRequisitionStatusVariant,
  getRequisitionStatusLabel,
} from '../../../lib/requisition-constants'
import { getPOStatusVariant, getPOStatusLabel } from '../../../lib/po-constants'
import { poTotalEntries } from '../../../lib/poTotals'
import { lineHandlerName } from '../../../lib/lineHandler'
import { isEditAdminRole, requisitionNeedsAdminToChange } from '../../../lib/approvedEdit'
import { isStaleStockLine, staleCostItems } from '../../../lib/staleStockCost'
import { useToastStore } from '../../../store/toastStore'
import type {
  ApproveRequisitionEditRequestMutation,
  ApproveRequisitionEditRequestMutationVariables,
  ApproveRequisitionMutation,
  ApproveRequisitionMutationVariables,
  CancelRequisitionMutation,
  CancelRequisitionMutationVariables,
  ConfirmRequisitionInventoryCheckMutation,
  ConfirmRequisitionInventoryCheckMutationVariables,
  MaterialIssuesQuery,
  MaterialIssuesQueryVariables,
  ProductsQuery,
  ProductsQueryVariables,
  RejectRequisitionApprovalMutation,
  RejectRequisitionApprovalMutationVariables,
  RejectRequisitionEditRequestMutation,
  RejectRequisitionEditRequestMutationVariables,
  RejectRequisitionToInventoryCheckMutation,
  RejectRequisitionToInventoryCheckMutationVariables,
  RejectRequisitionToMarketPricingMutation,
  RejectRequisitionToMarketPricingMutationVariables,
  RejectRequisitionVerificationToInventoryCheckMutation,
  RejectRequisitionVerificationToInventoryCheckMutationVariables,
  RejectRequisitionVerificationToMarketPricingMutation,
  RejectRequisitionVerificationToMarketPricingMutationVariables,
  RejectRequisitionVerificationToStorePricingMutation,
  RejectRequisitionVerificationToStorePricingMutationVariables,
  RequisitionChildPurchaseOrdersQuery,
  RequisitionChildPurchaseOrdersQueryVariables,
  RequisitionLineProductAvailabilityQuery,
  RequisitionLineProductAvailabilityQueryVariables,
  RequisitionQuery,
  RequisitionQueryVariables,
  RequisitionStockAvailabilityQuery,
  RequisitionStockAvailabilityQueryVariables,
  ResetRequisitionToDraftMutation,
  ResetRequisitionToDraftMutationVariables,
  ResolveLineFlagMutation,
  ResolveLineFlagMutationVariables,
  PoLineCommentsQuery,
  SetRequisitionLineOwnerMutation,
  SetRequisitionLineOwnerMutationVariables,
  SubmitRequisitionDirectSupplyMutation,
  SubmitRequisitionDirectSupplyMutationVariables,
  SubmitRequisitionEditRequestMutation,
  SubmitRequisitionEditRequestMutationVariables,
  SubmitRequisitionMarketPricingMutation,
  SubmitRequisitionMarketPricingMutationVariables,
  SubmitRequisitionStorePricingMutation,
  SubmitRequisitionStorePricingMutationVariables,
  SubmitRequisitionToInventoryCheckMutation,
  SubmitRequisitionToInventoryCheckMutationVariables,
  VerifyRequisitionPricesMutation,
  VerifyRequisitionPricesMutationVariables,
} from '../../../graphql/generated'

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
  bought_by_name?: string | null
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
  currency_code: string | null
  unit_price: string
  initial_unit_price?: string | null
  qty_from_stock?: string | null
  source_location_id?: string | null
  source_location_name?: string | null
  source_average_cost?: number | null
  store_price?: string | null
  store_price_currency?: string | null
  /** The catalog product's own Cost right now, for reference (not what the store keeper typed). */
  inventory_cost?: string | null
  inventory_cost_currency?: string | null
  /** Stale stock cost (playbook #111): days since the item's Cost was last changed or confirmed, and whether that is over the limit. */
  cost_age_days?: number | null
  cost_stale?: boolean | null
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
  /** The owner took this line to price and buy himself (migration 315); false = procurement's. */
  owner_handles?: boolean | null
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
  requested_by?: string | null
  requested_by_email?: string | null
  requested_by_name?: string | null
  reviewed_by?: string | null
  reviewed_by_email?: string | null
  reviewed_by_name?: string | null
  review_notes?: string | null
  reviewed_at?: string | null
  created_at: string
  auto_applied?: boolean | null
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
  linesAdded: {
    product_id: string
    description: string
    qty: number
    unit_price: number
    uom: string
    /** Empty until chosen, on a requisition whose lines are in more than one currency. */
    currency_code: string
  }[]
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
  /** The procurement officer who submitted procurement's part of Market pricing; null until then. */
  procurementOfficerName?: string | null
  assigned_receiver_id?: string | null
  assigned_receiver_name?: string | null
  notes?: string | null
  expected_delivery_date?: string | null
  created_at: string
  updated_at: string
  callerHasStoreKeeperPosition?: boolean | null
  callerHasStorePricingPosition?: boolean | null
  callerHasMarketPricingPosition?: boolean | null
  callerHasPriceVerificationPosition?: boolean | null
  callerCanApprove?: boolean | null
  /** When each side last submitted its part of Market pricing; cleared whenever the stage is entered. */
  owner_pricing_submitted_at?: string | null
  procurement_pricing_submitted_at?: string | null
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
  // NULL once the child PO spans more than one currency (migration 308);
  // currencyTotals is what to show.
  total_amount: string | null
  currency_code: string
  currencyTotals?: { currency_code: string; subtotal: string; line_count: number }[] | null
  created_at: string
}

const MATERIAL_ISSUE_STATUS_VARIANT: Record<string, 'neutral' | 'warning' | 'success' | 'danger'> = {
  draft: 'warning',
  issued: 'success',
  cancelled: 'danger',
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
  productId?: string | null
  productName?: string | null
  productNameAr?: string | null
  qtyRequired: number
  qtyOnHand: number
  qtyAvailable: number
  isAvailable: boolean
  byLocation: LineLocationAvailability[]
}

const fmtN = (n: string | number | null | undefined) =>
  parseFloat(String(n ?? 0)).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })

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

// One label and value in the Summary. The label is the darker secondary grey and the value the
// main text colour; neither is the pale "muted" grey, which is too faint to read figures in.
function SummaryField({
  label,
  children,
  style,
}: {
  label: string
  children: ReactNode
  /** Placement only (the phone summary sets `order` and `gridColumn` here). */
  style?: React.CSSProperties
}) {
  const { theme } = useTheme()
  return (
    <div style={{ minWidth: 0, ...style }}>
      <dt
        style={{
          fontSize: '12px',
          fontWeight: 500,
          color: theme.textSecondary,
          marginBottom: '2px',
        }}
      >
        {label}
      </dt>
      <dd
        style={{
          margin: 0,
          fontSize: '15px',
          fontWeight: 600,
          color: theme.textPrimary,
          overflowWrap: 'anywhere',
        }}
      >
        {children}
      </dd>
    </div>
  )
}

export default function RequisitionDetail() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { theme, themeKey } = useTheme()
  const rtl = useIsRtl()
  // The edit-request form shares the PO page's dense field look (36px, the readable edge, the shared chevron).
  const { inputStyle, selectStyle } = denseFormStyles(theme, { rtl, dark: themeKey === 'black' })
  const { isSystemLevel } = usePermission()
  const currentUserId = useAuthStore((s) => s.user?.id)
  const currentUserRole = useAuthStore((s) => s.user?.role)
  const addToast = useToastStore((s) => s.addToast)
  const padding = usePagePadding()
  const { isPhone } = useBreakpoint()

  const { data, loading, refetch } = useQuery<RequisitionQuery, RequisitionQueryVariables>(
    REQUISITION_QUERY,
    {
      variables: { id: id ?? '' },
      skip: !id,
      fetchPolicy: 'cache-and-network',
    },
  )
  useEntityChanged('requisition', () => void refetch())
  const req: Requisition | undefined = data?.requisition
    ? {
        ...data.requisition,
        lines: data.requisition.lines ?? [],
        approval_log: data.requisition.approval_log ?? [],
      }
    : undefined

  const onErr = (e: Error) => {
    addToast({ type: 'error', message: e.message })
  }
  const mutOpts = {
    onCompleted: () => void refetch(),
    onError: onErr,
  }

  const [submitToInventory, { loading: lSubmit }] = useMutation<
    SubmitRequisitionToInventoryCheckMutation,
    SubmitRequisitionToInventoryCheckMutationVariables
  >(SUBMIT_REQUISITION_TO_INVENTORY_CHECK, mutOpts)
  // A direct supply skips inventory check and every pricing step: its draft goes straight to the approver.
  const [submitDirectSupply, { loading: lSubmitDirect }] = useMutation<
    SubmitRequisitionDirectSupplyMutation,
    SubmitRequisitionDirectSupplyMutationVariables
  >(SUBMIT_REQUISITION_DIRECT_SUPPLY, mutOpts)
  const [confirmInventory, { loading: lConfirm }] = useMutation<
    ConfirmRequisitionInventoryCheckMutation,
    ConfirmRequisitionInventoryCheckMutationVariables
  >(CONFIRM_REQUISITION_INVENTORY_CHECK, mutOpts)
  // Stale stock cost (playbook #111): "Price confirmed" restarts one item's 30-day clock. The page refetches, so the flag clears.
  const [confirmingCostProductId, setConfirmingCostProductId] = useState<string | null>(null)
  const [confirmStockCost] = useMutation(CONFIRM_REQUISITION_STOCK_COST, {
    onCompleted: () => {
      setConfirmingCostProductId(null)
      void refetch()
    },
    onError: (e: Error) => {
      setConfirmingCostProductId(null)
      onErr(e)
    },
  })
  const [submitStorePricing, { loading: lStore }] = useMutation<
    SubmitRequisitionStorePricingMutation,
    SubmitRequisitionStorePricingMutationVariables
  >(SUBMIT_REQUISITION_STORE_PRICING, mutOpts)
  const [submitMarketPricing, { loading: lMarket }] = useMutation<
    SubmitRequisitionMarketPricingMutation,
    SubmitRequisitionMarketPricingMutationVariables
  >(SUBMIT_REQUISITION_MARKET_PRICING, mutOpts)
  const [setLineOwner] = useMutation<
    SetRequisitionLineOwnerMutation,
    SetRequisitionLineOwnerMutationVariables
  >(SET_REQUISITION_LINE_OWNER, mutOpts)
  // Which line's "take / hand back" is in flight, so only that button shows a spinner.
  const [togglingLineId, setTogglingLineId] = useState<string | null>(null)
  const toggleLineOwner = async (lineId: string, byOwner: boolean) => {
    setTogglingLineId(lineId)
    try {
      await setLineOwner({ variables: { lineId, byOwner } })
    } finally {
      setTogglingLineId(null)
    }
  }
  const [verifyPrices, { loading: lVerify }] = useMutation<
    VerifyRequisitionPricesMutation,
    VerifyRequisitionPricesMutationVariables
  >(VERIFY_REQUISITION_PRICES, mutOpts)
  // price_verification-only reject destinations — mirror PurchaseOrderDetail's
  // rejectVerificationToMarket/rejectVerificationToStore, plus the two with no
  // PO equivalent (resetToDraft, rejectVerificationToInventory). All share
  // rejectReason with the pending_approval reject box below, same as PO does.
  const rejectOpts = {
    onCompleted: () => {
      setRejectReason('')
      setFlaggedLines({})
      setSendBackOpen(false)
      void refetch()
    },
    onError: onErr,
  }
  const [rejectVerificationToMarket, { loading: lRejectVerifyMarket }] = useMutation<
    RejectRequisitionVerificationToMarketPricingMutation,
    RejectRequisitionVerificationToMarketPricingMutationVariables
  >(REJECT_REQUISITION_VERIFICATION_TO_MARKET_PRICING, rejectOpts)
  const [rejectVerificationToStore, { loading: lRejectVerifyStore }] = useMutation<
    RejectRequisitionVerificationToStorePricingMutation,
    RejectRequisitionVerificationToStorePricingMutationVariables
  >(REJECT_REQUISITION_VERIFICATION_TO_STORE_PRICING, rejectOpts)
  const [resetToDraft, { loading: lResetDraft }] = useMutation<
    ResetRequisitionToDraftMutation,
    ResetRequisitionToDraftMutationVariables
  >(RESET_REQUISITION_TO_DRAFT, rejectOpts)
  const [rejectVerificationToInventory, { loading: lRejectVerifyInventory }] = useMutation<
    RejectRequisitionVerificationToInventoryCheckMutation,
    RejectRequisitionVerificationToInventoryCheckMutationVariables
  >(REJECT_REQUISITION_VERIFICATION_TO_INVENTORY_CHECK, rejectOpts)
  const [approve, { loading: lApprove }] = useMutation<
    ApproveRequisitionMutation,
    ApproveRequisitionMutationVariables
  >(APPROVE_REQUISITION, mutOpts)
  const [reject, { loading: lReject }] = useMutation<
    RejectRequisitionApprovalMutation,
    RejectRequisitionApprovalMutationVariables
  >(REJECT_REQUISITION_APPROVAL, rejectOpts)
  // pending_approval-only reject destinations — mirror REJECT_PO_TO_MARKET;
  // rejectToInventoryCheck has no PO equivalent.
  const [rejectToMarketPricing, { loading: lRejectToMarket }] = useMutation<
    RejectRequisitionToMarketPricingMutation,
    RejectRequisitionToMarketPricingMutationVariables
  >(REJECT_REQUISITION_TO_MARKET_PRICING, rejectOpts)
  const [rejectToInventoryCheck, { loading: lRejectToInventory }] = useMutation<
    RejectRequisitionToInventoryCheckMutation,
    RejectRequisitionToInventoryCheckMutationVariables
  >(REJECT_REQUISITION_TO_INVENTORY_CHECK, rejectOpts)
  const [resolveLineFlag, { loading: lResolveFlag }] = useMutation<
    ResolveLineFlagMutation,
    ResolveLineFlagMutationVariables
  >(RESOLVE_LINE_FLAG, mutOpts)
  const [commentModal, setCommentModal] = useState<{ lineId: string; description: string } | null>(
    null,
  )
  const { data: lineCommentsData, refetch: refetchLineComments } = useQuery<PoLineCommentsQuery>(
    PO_LINE_COMMENTS_QUERY,
    { variables: { poId: id }, skip: !id, fetchPolicy: 'cache-and-network' },
  )
  const fetchLineComments = useCallback(() => {
    void refetchLineComments()
  }, [refetchLineComments])
  // Derived, not synced via useState+useEffect — syncing external query data
  // into state with an effect re-triggers itself whenever the query result
  // object isn't referentially stable across renders (real Apollo caching
  // keeps it stable when the data hasn't changed, but a naive test mock that
  // rebuilds its return value every render doesn't, turning the effect into
  // an infinite render loop in that case — OOM'd RequisitionDetail.test.tsx
  // this way). useMemo recomputing never schedules a render on its own, so
  // there's no feedback loop regardless of how stable the input reference is.
  const lineComments = useMemo(() => {
    const grouped: Record<string, LineComment[]> = {}
    for (const c of lineCommentsData?.poLineComments ?? []) {
      ;(grouped[c.po_line_id] ??= []).push({
        id: c.id,
        comment: c.comment,
        created_by_name: c.created_by_name,
        created_at: c.created_at,
        flag: (c.flag as LineComment['flag']) ?? null,
        resolved: c.resolved,
        resolved_at: c.resolved_at,
      })
    }
    return grouped
  }, [lineCommentsData])
  // Mirrors PurchaseOrderDetail's own anyLoading — every button within a
  // reject box (plus that panel's own primary action) shares one combined
  // flag so a click on one disables its siblings too. Without this, the
  // per-mutation FOR UPDATE row lock in reqTransition still prevents any
  // actual double-transition (the loser just gets a clean "Expected X, got
  // Y" error toast), but nothing stops the race from being triggerable in
  // the first place — this closes that off at the UI layer instead.
  const anyVerifyLoading =
    lVerify || lResetDraft || lRejectVerifyInventory || lRejectVerifyStore || lRejectVerifyMarket
  const anyApprovalLoading = lApprove || lReject || lRejectToMarket || lRejectToInventory
  const [cancel, { loading: lCancel }] = useMutation<
    CancelRequisitionMutation,
    CancelRequisitionMutationVariables
  >(CANCEL_REQUISITION, {
    onCompleted: () => {
      setCancelReason('')
      void refetch()
    },
    onError: onErr,
  })
  const [submitEditRequest, { loading: leSubmit }] = useMutation<
    SubmitRequisitionEditRequestMutation,
    SubmitRequisitionEditRequestMutationVariables
  >(SUBMIT_REQUISITION_EDIT_REQUEST, {
    onCompleted: () => {
      setEditDraft(null)
      void refetch()
    },
    onError: onErr,
  })
  const [approveEditRequest, { loading: leApprove }] = useMutation<
    ApproveRequisitionEditRequestMutation,
    ApproveRequisitionEditRequestMutationVariables
  >(APPROVE_REQUISITION_EDIT_REQUEST, mutOpts)
  const [rejectEditRequest, { loading: leReject }] = useMutation<
    RejectRequisitionEditRequestMutation,
    RejectRequisitionEditRequestMutationVariables
  >(REJECT_REQUISITION_EDIT_REQUEST, mutOpts)

  const showChildren = !!req && CHILD_PO_VISIBLE_STATUSES.includes(req.status)
  const { data: childData } = useQuery<
    RequisitionChildPurchaseOrdersQuery,
    RequisitionChildPurchaseOrdersQueryVariables
  >(REQUISITION_CHILD_POS_QUERY, {
    variables: { requisitionId: id ?? '' },
    skip: !id || !showChildren,
    fetchPolicy: 'cache-and-network',
  })
  const children: ChildPO[] = childData?.requisitionChildPurchaseOrders ?? []

  // Store Outs covering this requisition's stock-covered lines — created
  // (when working correctly) at approveRequisition time, same window as the
  // child POs above, so this reuses the same visibility gate.
  const { data: materialIssuesData } = useQuery<
    MaterialIssuesQuery,
    MaterialIssuesQueryVariables
  >(MATERIAL_ISSUES_QUERY, {
    variables: { requisitionId: id ?? '' },
    skip: !id || !showChildren,
    fetchPolicy: 'cache-and-network',
  })
  const materialIssues = materialIssuesData?.materialIssues ?? []

  const { data: availData } = useQuery<
    RequisitionStockAvailabilityQuery,
    RequisitionStockAvailabilityQueryVariables
  >(REQUISITION_STOCK_AVAILABILITY_QUERY, {
    variables: { requisitionId: id ?? '' },
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

  // Inventory Check draft — nothing here is saved to the server until
  // "Confirm inventory check" is actually clicked, so a store keeper who
  // works through several lines (reselecting items, picking source
  // locations, entering qty from stock) and then refreshes — or the tab
  // reloads for any other reason — used to silently lose all of it back to
  // whatever the requisition looked like before they started. Mirrors
  // useFilterPresets' own localStorage pattern; scoped per requisition ID
  // so it can't bleed into a different one.
  const invCheckDraftKey = req?.id ? `fnc_inv_check_draft_${req.id}` : null
  const hydratedDraftRef = useRef<string | null>(null)
  useEffect(() => {
    if (!invCheckDraftKey || hydratedDraftRef.current === invCheckDraftKey) return
    hydratedDraftRef.current = invCheckDraftKey
    try {
      const raw = localStorage.getItem(invCheckDraftKey)
      if (!raw) return
      const draft = JSON.parse(raw) as {
        invQty?: Record<string, string>
        invLoc?: Record<string, string>
        productOverride?: Record<string, string>
      }
      if (draft.invQty) setInvQty(draft.invQty)
      if (draft.invLoc) setInvLoc(draft.invLoc)
      if (draft.productOverride) setProductOverride(draft.productOverride)
    } catch {
      // Corrupt or unavailable localStorage — just start from a blank draft.
    }
  }, [invCheckDraftKey])
  useEffect(() => {
    if (!invCheckDraftKey) return
    const hasAny =
      Object.keys(invQty).length > 0 ||
      Object.keys(invLoc).length > 0 ||
      Object.keys(productOverride).length > 0
    try {
      if (hasAny)
        localStorage.setItem(invCheckDraftKey, JSON.stringify({ invQty, invLoc, productOverride }))
      else localStorage.removeItem(invCheckDraftKey)
    } catch {
      // Quota exceeded or unavailable — the draft just won't survive a
      // refresh this time, same as before this existed.
    }
  }, [invCheckDraftKey, invQty, invLoc, productOverride])

  const { data: productsData } = useQuery<ProductsQuery, ProductsQueryVariables>(PRODUCTS_QUERY, {
    // Same reasoning as RequisitionForm's own line-item picker — the item
    // being corrected here can legitimately live at the central warehouse
    // company, not just this one.
    variables: { includeCentralWarehouse: true },
    skip: !req || req.status !== 'inventory_check',
  })
  const products: {
    id: string
    sku: string
    name: string
    name_ar?: string | null
    uom: string
  }[] = (productsData?.products ?? []).filter((x): x is NonNullable<typeof x> => x !== null)
  const productOptions = products.map((p) => ({
    value: p.id,
    label: p.name,
    sublabel: p.sku,
    keywords: p.name_ar ?? undefined,
  }))
  const overrideEntries = Object.entries(productOverride)
  const { data: previewData } = useQuery<
    RequisitionLineProductAvailabilityQuery,
    RequisitionLineProductAvailabilityQueryVariables
  >(REQUISITION_LINE_PRODUCT_AVAILABILITY_QUERY, {
    variables: {
      requisitionId: id ?? '',
      overrides: overrideEntries.map(([lineId, productId]) => ({ lineId, productId })),
    },
    skip: !id || overrideEntries.length === 0,
    fetchPolicy: 'cache-and-network',
  })
  const previewByLine = new Map<string, LineAvailability>(
    (previewData?.requisitionLineProductAvailability ?? []).map((a) => [a.lineId, a]),
  )
  const [storePrices, setStorePrices] = useState<Record<string, string>>({})
  const [marketPrices, setMarketPrices] = useState<Record<string, string>>({})
  const [marketCurrency, setMarketCurrency] = useState<Record<string, string>>({})
  const [verifiedPrices, setVerifiedPrices] = useState<Record<string, string>>({})
  const [rejectReason, setRejectReason] = useState('')
  // The dialog behind the Send back button (price verification and pending approval).
  const [sendBackOpen, setSendBackOpen] = useState(false)
  // The organizer review draws its action bar into this element at the very end of the page, so it sticks to the bottom.
  const [reviewBarSlot, setReviewBarSlot] = useState<HTMLElement | null>(null)
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
        Reflect.deleteProperty(next, lineId)
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
  const lineFlagsPayload = flaggedLineIds.map((lid) => ({
    lineId: lid,
    reason: flaggedLines[lid].trim(),
  }))
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

  // Separate from the inventory_check-only products query elsewhere on this
  // page — a line can be added to an edit request from any status, not just
  // inventory_check, so this one is skipped on whether an edit is actually
  // in progress instead.
  const { data: editProductsData } = useQuery<ProductsQuery, ProductsQueryVariables>(PRODUCTS_QUERY, {
    variables: { includeCentralWarehouse: true },
    skip: !editDraft,
  })
  const editProducts: { id: string; sku: string; name: string; name_ar?: string | null; uom: string }[] =
    (editProductsData?.products ?? []).filter((x): x is NonNullable<typeof x> => x !== null)
  const editProductOptions = [
    { value: '', label: t('req.detail.customItemNoCatalogLink') },
    ...editProducts.map((p) => ({
      value: p.id,
      label: p.name,
      sublabel: p.sku,
      keywords: p.name_ar ?? undefined,
    })),
  ]

  // Which optional line columns this person has switched on or off; kept before the early
  // returns below because a hook can't come after them.
  const linesView = useTableView('req-lines')
  // The Summary shows the few details people look for first; the rest open with "All details".
  const [showAllDetails, setShowAllDetails] = useState(false)

  if (!id) return null

  if (loading && !req) {
    return (
      <div style={{ ...padding, maxWidth: '1800px', margin: '0 auto' }}>
        <div style={{ color: theme.textMuted, fontSize: '13px' }}>{t('req.detail.loadingRequisition')}</div>
      </div>
    )
  }

  if (!req) {
    return (
      <div style={{ ...padding, maxWidth: '1800px', margin: '0 auto' }}>
        <div style={{ color: theme.textMuted, fontSize: '13px' }}>{t('req.detail.requisitionNotFound')}</div>
      </div>
    )
  }

  const isOrganizer = req.organizer_id === currentUserId
  // Direct supply (always tied to a project): no inventory check and no pricing step. Draft goes straight to the
  // approver, who sees the Est. Unit Price typed at creation; the pricing columns below would only ever be empty.
  const isDirectSupply = req.purpose === DIRECT_SUPPLY_PURPOSE
  const canSubmitDraft = isSystemLevel || isOrganizer
  // Deliberately NOT isOrganizer — only a Store Keeper (or admin) can
  // confirm inventory check, even for your own requisition.
  const canConfirmInventory = isSystemLevel || !!req.callerHasStoreKeeperPosition
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
  // After approval only an administrator may change a requisition, or even ask (playbook #112): the organizer no longer can. Before approval
  // nothing changes. Module administrators count, as on the server.
  const adminOnlyNow = requisitionNeedsAdminToChange(req.status)
  const canRequestEdit = adminOnlyNow
    ? isEditAdminRole(currentUserRole)
    : isSystemLevel || isOrganizer

  // ── The three pricing steps are filled in on the Lines table itself ──────
  // Lines that still need buying (what stock does not cover) take a market and a verified price;
  // lines with stock in them take a store price. A line fully covered from stock needs no market
  // price: it was priced for reference at inventory check. These are the same filters the old side
  // panels used, so the same lines are asked for the same things.
  const linesToBuy = req.lines.filter(
    (l) => (parseFloat(l.qty) || 0) - (parseFloat(String(l.qty_from_stock ?? '0')) || 0) > 0.0001,
  )
  const linesFromStock = req.lines.filter(
    (l) => (parseFloat(String(l.qty_from_stock ?? '0')) || 0) > 0,
  )
  const needsBuying = (l: ReqLine) => linesToBuy.includes(l)
  // An empty description falls back to the product name, so test truthiness rather than null-ness.
  const lineName = (l: ReqLine) => (l.description ? l.description : (l.product_name ?? ''))
  const priceIsValid = (raw: string) =>
    raw !== '' && !isNaN(parseFloat(raw)) && parseFloat(raw) >= 0
  // A price typed in the box, else the one already saved on the line: a requisition sent back to
  // a pricing step keeps what was typed before instead of showing a blank box.
  const marketRawOf = (l: ReqLine) =>
    marketPrices[l.id] ?? (l.market_price != null ? String(l.market_price) : '')
  const verifiedRawOf = (l: ReqLine) =>
    verifiedPrices[l.id] ?? (l.market_price != null ? String(l.market_price) : '')
  // Market pricing is done in two parts (migration 315): the lines the owner took to price and buy
  // himself, and procurement's. The requisition moves on once each part that has lines has been
  // submitted. Procurement (and admins) can price any line, the owner only the ones he took.
  const ownerLines = linesToBuy.filter((l) => !!l.owner_handles)
  const procLines = linesToBuy.filter((l) => !l.owner_handles)
  const splitPricing = ownerLines.length > 0
  const ownerAllPriced = ownerLines.every((l) => priceIsValid(marketRawOf(l)))
  const procAllPriced = procLines.every((l) => priceIsValid(marketRawOf(l)))
  const marketLinePrices = (ls: ReqLine[]) =>
    ls.map((l) => ({
      lineId: l.id,
      marketPrice: parseFloat(marketRawOf(l)),
      currencyCode: marketCurrency[l.id] ?? l.currency_code,
    }))
  // Who may type in which column at this step (the gates are the old panels' gates, unchanged).
  const storeEntry = req.status === 'store_pricing' && canStorePrice
  const marketEntry = req.status === 'market_pricing' && (canMarketPrice || isOrganizer)
  const verifyEntry = req.status === 'price_verification' && canVerifyPrice
  // Under the lines, full width: the cards about what the requisition made (its purchase orders, its Store Outs).
  // The step's own action is always the bar at the bottom of the page, never a panel beside the lines.
  const hasFollowUpCards = showChildren && (children.length > 0 || materialIssues.length > 0)
  const barNote = (text: string) => (
    <span style={{ fontSize: '13px', color: theme.textSecondary }}>{text}</span>
  )
  const barWarning = (text: string) => (
    <div style={{ fontSize: '12px', color: theme.danger }}>{text}</div>
  )

  // ── Send back: one dialog for the two steps that can send a requisition back ──
  // Only the places the step is allowed to send it to are offered (the old reject boxes' own lists):
  // price verification can go to four, pending approval to three (no store pricing).
  const sendBackVariables = {
    id: req.id,
    reason: effectiveRejectReason,
    lineFlags: lineFlagsPayload,
  }
  const sendBackToDraft: SendBackDestination & { run: () => unknown } = {
    key: 'draft',
    label: getRequisitionStatusLabel('draft'),
    description: t('req.detail.sendBackDescDraft'),
    run: () => reject({ variables: sendBackVariables }),
  }
  const sendBackOptions: (SendBackDestination & { run: () => unknown })[] = isDirectSupply
    ? // A direct supply never visited inventory check or market pricing, so draft is the only place to send it back to
      // (the server refuses the other two for it).
      [sendBackToDraft]
    : req.status === 'price_verification'
      ? [
          {
            key: 'market',
            label: getRequisitionStatusLabel('market_pricing'),
            description: t('req.detail.sendBackDescMarket'),
            run: () => rejectVerificationToMarket({ variables: sendBackVariables }),
          },
          {
            key: 'store',
            label: getRequisitionStatusLabel('store_pricing'),
            description: t('req.detail.sendBackDescStore'),
            run: () => rejectVerificationToStore({ variables: sendBackVariables }),
          },
          {
            key: 'inventory',
            label: getRequisitionStatusLabel('inventory_check'),
            description: t('req.detail.sendBackDescInventory'),
            run: () => rejectVerificationToInventory({ variables: sendBackVariables }),
          },
          {
            key: 'draft',
            label: getRequisitionStatusLabel('draft'),
            description: t('req.detail.sendBackDescDraft'),
            run: () => resetToDraft({ variables: sendBackVariables }),
          },
        ]
      : [
          {
            key: 'market',
            label: getRequisitionStatusLabel('market_pricing'),
            description: t('req.detail.sendBackDescMarket'),
            run: () => rejectToMarketPricing({ variables: sendBackVariables }),
          },
          {
            key: 'inventory',
            label: getRequisitionStatusLabel('inventory_check'),
            description: t('req.detail.sendBackDescInventory'),
            run: () => rejectToInventoryCheck({ variables: sendBackVariables }),
          },
          {
            key: 'draft',
            label: getRequisitionStatusLabel('draft'),
            description: t('req.detail.sendBackDescDraft'),
            run: () => reject({ variables: sendBackVariables }),
          },
        ]
  // ── Inventory check, on the lines ──────────────────────────────────────────
  // A store keeper (or an admin) sees stock levels, picks the location and types the quantity to take from
  // stock in the Lines table; "to buy" is what is left. The draft is still kept in localStorage.
  const invEntry = req.status === 'inventory_check' && canConfirmInventory
  const availOf = (l: ReqLine) =>
    productOverride[l.id] ? previewByLine.get(l.id) : availabilityByLine.get(l.id)
  // The most that can be taken: what the line needs, or what the chosen location has if that is less.
  const invMaxFor = (l: ReqLine) => {
    const qtyNeeded = parseFloat(l.qty) || 0
    const selectedLoc = availOf(l)?.byLocation.find((loc) => loc.locationId === invLoc[l.id])
    return selectedLoc ? Math.min(qtyNeeded, selectedLoc.qtyAvailable) : qtyNeeded
  }
  // Stale stock cost (playbook #111): a line drawn from stock whose item's Cost is old. At the inventory check the quantity is the one being
  // typed (a replaced item is not judged: the server's age belongs to the original); everywhere else it is the saved quantity.
  const isStaleLine = (l: ReqLine) =>
    isStaleStockLine(l, {
      liveQty: invEntry ? parseFloat(invQty[l.id] ?? '0') || 0 : undefined,
      overridden: !!productOverride[l.id],
    })
  const staleItems = staleCostItems(req.lines, (l) => isStaleLine(l as ReqLine))
  const invCovered = req.lines.filter((l) => {
    const needed = parseFloat(l.qty) || 0
    return needed > 0 && (parseFloat(invQty[l.id] ?? '0') || 0) >= needed - 0.0001
  }).length
  // "Wrong item? Reselect": the store keeper is the first to notice a line was made against the wrong product.
  const reselectControl = (l: ReqLine) => {
    const isOverridden = !!productOverride[l.id]
    const avail = availOf(l)
    return (
      <div style={{ marginTop: '4px' }}>
        {isOverridden && avail?.productName && (
          <div style={{ fontSize: '12px', fontWeight: 600, color: theme.textPrimary }}>
            → {avail.productName}
          </div>
        )}
        {isOverridden && avail?.productNameAr && (
          <div
            dir="rtl"
            style={{ fontSize: '12px', color: theme.textSecondary, textAlign: 'start' }}
          >
            {avail.productNameAr}
          </div>
        )}
        <button
          type="button"
          onClick={() => {
            setReselectOpenFor((cur) => (cur === l.id ? null : l.id))
          }}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            fontSize: '12px',
            fontWeight: 600,
            color: theme.accent,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {isOverridden ? t('req.detail.changeSelection') : t('req.detail.wrongItemReselect')}
        </button>
        {reselectOpenFor === l.id && (
          <div style={{ marginTop: '8px' }}>
            <SearchableSelect field
              label={t('req.detail.correctItem')}
              value={productOverride[l.id] ?? ''}
              onChange={(productId) => {
                setProductOverride((prev) => ({ ...prev, [l.id]: productId }))
                setInvQty((prev) => ({ ...prev, [l.id]: '' }))
                setInvLoc((prev) => {
                  const next = { ...prev }
                  Reflect.deleteProperty(next, l.id)
                  return next
                })
                setReselectOpenFor(null)
              }}
              options={productOptions}
              placeholder={t('req.detail.searchByNameOrSku')}
              minDropdownWidth={360}
            />
          </div>
        )}
      </div>
    )
  }
  const sendBackFlagged = flaggedLineIds.map((lid) => {
    const line = req.lines.find((l) => l.id === lid)
    return { id: lid, name: line ? lineName(line) : '', reason: (flaggedLines[lid] ?? '').trim() }
  })
  // What the bar says about the flags: how to start, what is missing, or how many lines are ready.
  const sendBackHint =
    flaggedLineIds.length === 0
      ? t('req.detail.sendBackTickHint')
      : !hasValidFlags
        ? t('req.detail.sendBackAddReasons')
        : t('req.detail.sendBackFlaggedHint', { count: flaggedLineIds.length })

  // Delivery Destination stops doing anything once Finish Buying has run
  // for every line (status 'sourcing'/'completed') — by then each child
  // PO already has its own frozen copy from fork time (finishBuyingRequisition),
  // and the Approval-time Store Out decision it also drives has already
  // happened too. Editing it after that point is a silent no-op, not a
  // correction — surfaced as disabled-with-explanation rather than left
  // to quietly do nothing.
  const deliveryDestinationEditable = !['sourcing', 'completed'].includes(req.status)

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

  // Opens the line's note thread (the same modal the PO page's "+ Note"
  // opens) — used by the Lines table's Notes column.
  const openLineNote = (l: ReqLine) => {
    // An empty description falls back to the product name, so test truthiness
    // rather than null-ness (what `??` would do).
    const name = l.description ? l.description : (l.product_name ?? '')
    setCommentModal({ lineId: l.id, description: name })
  }

  // ── Lines table (columns adapt to current stage) ────────────────────────
  const baseLineColumns: Column<ReqLine>[] = [
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
            header: t('req.detail.flag'),
            width: '36px',
            // On a phone the box sits in the top corner of the line's card
            mobileAction: true,
            render: (l: ReqLine) => (
              <input
                type="checkbox"
                checked={l.id in flaggedLines}
                onChange={() => {
                  toggleLineFlag(l.id)
                }}
                title={t('req.detail.flagThisLineForRejection')}
              />
            ),
          },
        ]
      : []),
    {
      key: 'index',
      header: '#',
      width: '32px',
      // On a phone the card's title is the item's name, not its number
      mobileHide: true,
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
      header: t('req.detail.item'),
      // Item names run to 100+ characters (supplier catalogue descriptions); on one line
      // they pushed Qty and every price column off the card on all but the widest screens.
      wrap: true,
      minWidth: '220px',
      mobilePrimary: true,
      render: (l) => (
        <div>
          <div style={{ fontSize: '13px', color: theme.textPrimary }}>
            {l.description || l.product_name || '—'}
          </div>
          {l.product_name_ar && (
            // The block keeps the page's own direction so the name starts under the English one in both
            // languages; only the text is right-to-left (playbook #80). Secondary grey, not the pale muted one (#75).
            <div style={{ textAlign: 'start' }}>
              <span dir="rtl" style={{ fontSize: '13px', color: theme.textSecondary }}>
                {l.product_name_ar}
              </span>
            </div>
          )}
          {l.sku && <div style={{ fontSize: '12px', color: theme.textSecondary }}>{l.sku}</div>}
          {isStaleLine(l) && (
            <div data-testid="stale-cost-tag" style={{ marginTop: '4px' }}>
              <Badge variant="warning">
                {t('req.detail.staleCostTag', { days: l.cost_age_days ?? '' })}
              </Badge>
            </div>
          )}
          {invEntry && reselectControl(l)}
        </div>
      ),
    },
    // Who prices and buys this line (migration 315). It is decided at Market pricing, so the stages before have
    // nothing to show. Right after Item on purpose: only the leading columns are sure to be visible on a narrow card.
    ...([
      'market_pricing',
      'price_verification',
      'pending_approval',
      'approved',
      'items_bought',
      'organizer_review',
      'review_approval',
      'sourcing',
      'completed',
    ].includes(req.status)
      ? [
          {
            key: 'handled_by',
            header: t('req.detail.handledBy'),
            // The name can be long ("Mohammed Abdulrahman"), so let it wrap instead of widening the table.
            wrap: true,
            minWidth: '130px',
            render: (l: ReqLine) => {
              // A line fully covered from stock is bought by nobody: its Store Out is the whole story.
              if (!needsBuying(l))
                return <span style={{ fontSize: '13px', color: theme.textSecondary }}>—</span>
              const name = lineHandlerName(l, req)
              const ownerLine = !!l.owner_handles
              // The owner may take a line only before it has a price; procurement may always hand it back.
              const canTake = isOrganizer && !ownerLine && l.market_price == null
              const canGiveBack =
                ownerLine && (canMarketPrice || (isOrganizer && l.market_price == null))
              return (
                <div>
                  {ownerLine ? (
                    <Badge variant="accent">{t('req.detail.handledByOwner')}</Badge>
                  ) : (
                    <Badge variant="neutral">{t('req.detail.handledByProcurement')}</Badge>
                  )}
                  {name && (
                    <div style={{ fontSize: '12px', color: theme.textSecondary, marginTop: '2px' }}>
                      {name}
                    </div>
                  )}
                  {marketEntry && (canTake || canGiveBack) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      loading={togglingLineId === l.id}
                      onClick={() => void toggleLineOwner(l.id, !ownerLine)}
                    >
                      {canTake
                        ? t('req.detail.takeThisLine')
                        : isOrganizer
                          ? t('req.detail.handBackThisLine')
                          : t('req.detail.takeOverThisLine')}
                    </Button>
                  )}
                </div>
              )
            },
          },
        ]
      : []),
    {
      key: 'qty',
      header: t('req.detail.qty'),
      render: (l) => (
        <span style={{ fontSize: '13px' }}>
          {fmtN(l.qty)} {l.uom ?? ''}
        </span>
      ),
    },
    // A direct supply has no store, market or verified price: the price typed when it was created is the one the
    // approver judges, so it gets a column of its own (in the line's own currency, never converted).
    ...(isDirectSupply
      ? [
          {
            key: 'est_unit_price',
            header: t('req.detail.estUnitPrice'),
            render: (l: ReqLine) => (
              <span style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary }}>
                {fmtN(l.unit_price)} {l.currency_code}
              </span>
            ),
          },
        ]
      : []),
    ...(invEntry
      ? [
          {
            key: 'stock_levels',
            header: t('req.detail.inStock'),
            minWidth: '210px',
            mobileFullWidth: true,
            render: (l: ReqLine) => {
              const avail = availOf(l)
              if (!avail) {
                return (
                  <span style={{ fontSize: '12px', color: theme.textSecondary }}>
                    {productOverride[l.id]
                      ? t('req.detail.checkingStockForTheNewlySelected')
                      : t('req.detail.loadingStockLevels')}
                  </span>
                )
              }
              const qtyReserved = avail.qtyOnHand - avail.qtyAvailable
              return (
                <div
                  style={{
                    display: 'flex',
                    gap: '4px 14px',
                    flexWrap: 'wrap',
                    fontSize: '12px',
                    color: theme.textSecondary,
                  }}
                >
                  <span>
                    {t('req.detail.onHand')}{' '}
                    <strong style={{ color: theme.textPrimary }}>{fmtN(avail.qtyOnHand)}</strong>
                  </span>
                  <span>
                    {t('req.detail.reserved')}{' '}
                    <strong style={{ color: theme.textPrimary }}>{fmtN(qtyReserved)}</strong>
                  </span>
                  <span>
                    {t('req.detail.availableLabel')}{' '}
                    <strong style={{ color: avail.isAvailable ? theme.success : theme.warning }}>
                      {fmtN(avail.qtyAvailable)}
                    </strong>
                  </span>
                </div>
              )
            },
          },
          {
            key: 'source_location',
            header: t('req.detail.sourceLocation'),
            minWidth: '230px',
            mobileFullWidth: true,
            render: (l: ReqLine) => {
              const avail = availOf(l)
              if (!avail)
                return <span style={{ fontSize: '13px', color: theme.textSecondary }}>—</span>
              // Only locations that actually have stock of this item.
              if (avail.byLocation.length === 0) {
                return (
                  <span style={{ fontSize: '12px', color: theme.textSecondary }}>
                    {t('req.detail.noStockAvailableAtAnyLocation')}
                  </span>
                )
              }
              return (
                <InlineSelect
                  value={invLoc[l.id] ?? ''}
                  placeholder={t('req.detail.sourceLocation')}
                  ariaLabel={`${t('req.detail.sourceLocation')}: ${lineName(l)}`}
                  options={avail.byLocation.map((loc) => ({
                    value: loc.locationId,
                    label: `${loc.locationName} · ${loc.companyName} — ${t('req.detail.availShort', { qty: fmtN(loc.qtyAvailable) })}`,
                  }))}
                  onChange={(locationId) => {
                    setInvLoc((prev) => ({ ...prev, [l.id]: locationId }))
                    const loc = avail.byLocation.find((b) => b.locationId === locationId)
                    const currentQty = parseFloat(invQty[l.id] ?? '0') || 0
                    if (loc && currentQty > loc.qtyAvailable) {
                      setInvQty((prev) => ({
                        ...prev,
                        [l.id]: String(Math.max(0, loc.qtyAvailable)),
                      }))
                    }
                  }}
                />
              )
            },
          },
        ]
      : []),
    ...([
      'inventory_check',
      'store_pricing',
      'market_pricing',
      'price_verification',
      'pending_approval',
      'approved',
      'items_bought',
      'organizer_review',
      'review_approval',
      'sourcing',
      'completed',
    ].includes(req.status)
      ? [
          {
            key: 'qty_from_stock',
            header: t('req.detail.fromStock'),
            minWidth: invEntry ? '150px' : undefined,
            mobileFullWidth: invEntry,
            render: (l: ReqLine) => {
              // Inventory check: the quantity to take from stock is typed right on the line.
              if (invEntry) {
                const needed = parseFloat(l.qty) || 0
                const taking = parseFloat(invQty[l.id] ?? '0') || 0
                return (
                  <div>
                    <LinePriceInput
                      width="90px"
                      placeholder="0"
                      max={String(invMaxFor(l))}
                      value={invQty[l.id] ?? ''}
                      ariaLabel={`${t('req.detail.qtyFromStock')}: ${lineName(l)}`}
                      onChange={(raw) => {
                        const v = Math.max(0, Math.min(invMaxFor(l), parseFloat(raw) || 0))
                        setInvQty((prev) => ({ ...prev, [l.id]: raw === '' ? '' : String(v) }))
                      }}
                    />
                    <div style={{ fontSize: '12px', color: theme.textSecondary, marginTop: '4px' }}>
                      {t('req.detail.qtyToBuy')}: {fmtN(Math.max(0, needed - taking))} {l.uom ?? ''}
                    </div>
                  </div>
                )
              }
              return (
                <span style={{ fontSize: '13px', color: theme.textPrimary }}>
                  {fmtN(l.qty_from_stock ?? 0)}
                </span>
              )
            },
          },
        ]
      : []),
    // Reference only: the product's own Cost right now. Not the store price typed on this line
    // (next column), and never part of a total.
    {
      key: 'inventory_cost',
      header: t('po.detail.inventoryCost'),
      render: (l: ReqLine) => (
        <InventoryCost cost={l.inventory_cost} currency={l.inventory_cost_currency} />
      ),
    },
    ...([
      'store_pricing',
      'market_pricing',
      'price_verification',
      'pending_approval',
      'approved',
      'items_bought',
      'organizer_review',
      'review_approval',
      'sourcing',
      'completed',
    ].includes(req.status)
      ? [
          {
            key: 'store_price',
            header: t('req.detail.storePrice'),
            minWidth: storeEntry ? '160px' : undefined,
            mobileFullWidth: storeEntry,
            render: (l: ReqLine) => {
              // Store pricing: the price is typed right on the line (only lines with stock in them).
              if (storeEntry && linesFromStock.includes(l)) {
                const defaultPrice = l.store_price ?? l.source_average_cost ?? ''
                return (
                  <div>
                    <LinePriceInput
                      value={storePrices[l.id] ?? String(defaultPrice)}
                      onChange={(v) => {
                        setStorePrices((prev) => ({ ...prev, [l.id]: v }))
                      }}
                      ariaLabel={`${t('req.detail.storePrice')}: ${lineName(l)}`}
                    />
                    {l.source_location_name && (
                      <div
                        style={{ fontSize: '12px', color: theme.textSecondary, marginTop: '4px' }}
                      >
                        {t('req.detail.fromLocation', { location: l.source_location_name })}
                        {l.source_average_cost != null &&
                          ` ${t('req.detail.lastCost', { cost: l.source_average_cost })}`}
                      </div>
                    )}
                  </div>
                )
              }
              return (
                <span style={{ fontSize: '13px', color: theme.textPrimary }}>
                  {l.store_price ? `${fmtN(l.store_price)} ${l.store_price_currency ?? ''}` : '—'}
                </span>
              )
            },
          },
        ]
      : []),
    ...([
      'market_pricing',
      'price_verification',
      'pending_approval',
      'approved',
      'items_bought',
      'organizer_review',
      'review_approval',
      'sourcing',
      'completed',
    ].includes(req.status)
      ? [
          {
            key: 'market_price',
            header: t('req.detail.marketPrice'),
            minWidth: marketEntry ? '250px' : undefined,
            mobileFullWidth: marketEntry,
            render: (l: ReqLine) => {
              // Market pricing: the vendor quote and its currency are typed right on the line.
              if (marketEntry && needsBuying(l)) {
                const requestedQty = parseFloat(l.qty) || 0
                const stockQty = parseFloat(String(l.qty_from_stock ?? '0')) || 0
                const mayPrice = canMarketPrice || (isOrganizer && !!l.owner_handles)
                const raw = marketRawOf(l)
                return (
                  <div>
                    {mayPrice ? (
                      <div
                        style={{
                          display: 'flex',
                          gap: '8px',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                        }}
                      >
                        {/* On a phone the price takes the room the currency leaves, so both share one row. */}
                        <div style={isPhone ? { flex: '1 1 120px', minWidth: 0 } : undefined}>
                          <LinePriceInput
                            value={raw}
                            invalid={!priceIsValid(raw)}
                            onChange={(v) => {
                              setMarketPrices((prev) => ({ ...prev, [l.id]: v }))
                            }}
                            ariaLabel={`${t('req.detail.marketPrice')}: ${lineName(l)}`}
                          />
                        </div>
                        <div style={{ width: '96px' }}>
                          <Select
                            value={marketCurrency[l.id] ?? l.currency_code}
                            onChange={(e) => {
                              setMarketCurrency((prev) => ({ ...prev, [l.id]: e.target.value }))
                            }}
                            options={CURRENCIES.map((c) => ({ value: c, label: c }))}
                          />
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: '12px', color: theme.textSecondary }}>
                        {t('req.detail.procurementPricesThisLine')}
                      </div>
                    )}
                    {/* What the quote is for: the requested quantity less whatever stock covers. */}
                    <div style={{ fontSize: '12px', color: theme.textSecondary, marginTop: '4px' }}>
                      {t('req.detail.qtyToBuy')}: {fmtN(requestedQty - stockQty)} {l.uom ?? ''}
                    </div>
                    {stockQty > 0.0001 && (
                      <div style={{ fontSize: '12px', color: theme.textSecondary }}>
                        {t('req.detail.qtyRequestedStockNote', {
                          requested: fmtN(requestedQty),
                          stock: fmtN(stockQty),
                        })}
                      </div>
                    )}
                  </div>
                )
              }
              return (
                <span style={{ fontSize: '13px', color: theme.textPrimary }}>
                  {l.market_price
                    ? `${fmtN(l.market_price)} ${l.market_price_currency ?? ''}`
                    : '—'}
                </span>
              )
            },
          },
        ]
      : []),
    ...([
      'price_verification',
      'pending_approval',
      'approved',
      'items_bought',
      'organizer_review',
      'review_approval',
      'sourcing',
      'completed',
    ].includes(req.status)
      ? [
          {
            key: 'verified_price',
            header: t('req.detail.verifiedPrice'),
            minWidth: verifyEntry ? '140px' : undefined,
            mobileFullWidth: verifyEntry,
            render: (l: ReqLine) => {
              // Price verification: cross-check the market price and adjust it right on the line.
              if (verifyEntry && needsBuying(l)) {
                const raw = verifiedRawOf(l)
                return (
                  <LinePriceInput
                    value={raw}
                    invalid={!priceIsValid(raw)}
                    onChange={(v) => {
                      setVerifiedPrices((prev) => ({ ...prev, [l.id]: v }))
                    }}
                    ariaLabel={`${t('req.detail.verifiedPrice')}: ${lineName(l)}`}
                  />
                )
              }
              return (
                <span style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary }}>
                  {l.verified_price
                    ? `${fmtN(l.verified_price)} ${l.verified_price_currency ?? ''}`
                    : '—'}
                </span>
              )
            },
          },
        ]
      : []),
    ...(['items_bought', 'organizer_review', 'review_approval', 'sourcing', 'completed'].includes(
      req.status,
    )
      ? [
          {
            key: 'purchases',
            header: t('req.detail.bought'),
            render: (l: ReqLine) => {
              const purchases = l.purchases ?? []
              if (purchases.length === 0) {
                if (l.closed_at)
                  return (
                    <span style={{ fontSize: '12px', color: theme.textMuted }}>
                      {`Closed — ${l.closed_reason ?? ''}`}
                    </span>
                  )
                // Fully covered from stock — qty_from_stock meets or exceeds
                // what was ordered, so there's nothing left to purchase on
                // this line at all (see the Store Outs card for its actual
                // issuance status, not this column).
                const fullyFromStock =
                  parseFloat(l.qty_from_stock ?? '0') >= parseFloat(l.qty) - 0.0001
                if (fullyFromStock)
                  return (
                    <span style={{ fontSize: '12px', color: theme.textMuted }}>
                      {t('req.detail.coveredFromInventory')}
                    </span>
                  )
                return (
                  <span style={{ fontSize: '12px', color: theme.warning }}>
                    {t('req.detail.notYetBought')}
                  </span>
                )
              }
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  {purchases.map((p) => (
                    <span key={p.id} style={{ fontSize: '12px', color: theme.textSecondary }}>
                      {fmtN(p.qty)} @ {fmtN(p.actual_unit_price)} {p.currency_code} —{' '}
                      {p.vendor_name ?? 'vendor'}
                      {p.over_tolerance && (
                        <span style={{ color: theme.warning, marginInlineStart: '4px' }}>⚠</span>
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
      header: t('req.detail.total'),
      render: (l) => {
        const fromStock = (parseFloat(String(l.total)) || 0) === 0 ? fromStockDisplayValue(l) : null
        if (fromStock) {
          return (
            <span style={{ fontSize: '13px', color: theme.textMuted }}>
              {fmtN(fromStock.amount)} {fromStock.currency}
              <span style={{ fontSize: '11px' }}> {t('req.detail.fromStock2')}</span>
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
    {
      key: 'notes',
      header: t('req.detail.notes'),
      render: (l) => (
        <LineNoteButton
          comments={lineComments[l.id] ?? []}
          onClick={() => {
            openLineNote(l)
          }}
        />
      ),
    },
  ]

  // A direct supply never has stock taken from inventory or a store, market or verified price, so those columns
  // would only ever show dashes: leave them out (and so out of the Columns menu too).
  const DIRECT_SUPPLY_HIDDEN_COLUMNS = [
    'qty_from_stock',
    'store_price',
    'market_price',
    'verified_price',
  ]
  const lineColumns = isDirectSupply
    ? baseLineColumns.filter((c) => !DIRECT_SUPPLY_HIDDEN_COLUMNS.includes(c.key))
    : baseLineColumns

  // Which of those columns are shown: the person's own choice where they made one, otherwise the
  // default here (everything the stage has, except Inventory cost, which waits until the order
  // leaves draft). A column the stage doesn't have isn't in lineColumns, so the menu lists only
  // what this requisition can show. The flag box, # and Item are not in the menu; Qty and Total
  // are listed but locked.
  // The column the person types in at this step can't be switched off, or the step would have no input.
  const lockedLineColumns = [
    'qty',
    'total',
    ...(storeEntry ? ['store_price'] : []),
    ...(marketEntry ? ['market_price', 'handled_by'] : []),
    ...(verifyEntry ? ['verified_price'] : []),
    ...(invEntry ? ['qty_from_stock'] : []),
  ]
  const optionalLineColumns = [
    'handled_by',
    'qty_from_stock',
    'inventory_cost',
    'store_price',
    'market_price',
    'verified_price',
    'purchases',
  ]
  const lineViewOptions = lineColumns
    .filter((c) => lockedLineColumns.includes(c.key) || optionalLineColumns.includes(c.key))
    .map((c) => ({
      key: c.key,
      label: c.header,
      locked: lockedLineColumns.includes(c.key),
      defaultOn: c.key === 'inventory_cost' ? req.status !== 'draft' : true,
    }))
  const lineViewOn = (o: (typeof lineViewOptions)[number]) =>
    o.locked || linesView.isOn(o.key, o.defaultOn)
  const shownLineColumns = lineColumns.filter((c) => {
    const o = lineViewOptions.find((v) => v.key === c.key)
    return !o || lineViewOn(o)
  })

  // A line added by an edit needs a currency of its own. When every line already on the requisition shares one, a
  // new line starts on it; on a mixed requisition the person has to choose. The server refuses a line with none
  // rather than guessing IQD, which is what used to put a USD requisition's new line in IQD (NF-PO-2026-0163).
  const sharedLineCurrency = (() => {
    const codes = [
      ...new Set(req.lines.map((l) => l.currency_code?.trim()).filter((c): c is string => !!c)),
    ]
    return codes.length === 1 ? codes[0] : ''
  })()
  const addedLineCurrencyOptions = [
    ...new Set([...CURRENCIES, ...req.lines.map((l) => l.currency_code?.trim() ?? '')]),
  ].filter((c) => c !== '')

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
    if (
      req.purpose === 'project' &&
      draft.delivery_destination !== (req.delivery_destination ?? '')
    )
      header.delivery_destination = {
        from: req.delivery_destination ?? '',
        to: draft.delivery_destination,
      }

    // description is carried on every edited entry (not just description
    // edits) purely as an identifying label — History/Log need to say
    // *which* line a field changed on, not just the field name. removed
    // lines are snapshotted in full: by the time anyone reads this back,
    // the line itself is gone from po_lines (approval deletes it), so its
    // description/qty/price only survive if captured here, at request time.
    const edited: {
      id: string
      field: string
      from: unknown
      to: unknown
      description: string
    }[] = []
    const removed: {
      id: string
      description: string
      qty: number
      unit_price: number
      uom: string
    }[] = []
    for (const dl of draft.lines) {
      const orig = req.lines.find((l) => l.id === dl.id)
      if (!orig) continue
      if (dl._removed) {
        removed.push({
          id: dl.id,
          description: orig.description ?? '',
          qty: parseFloat(String(orig.qty)) || 0,
          unit_price: parseFloat(String(orig.unit_price)) || 0,
          uom: orig.uom ?? '',
        })
        continue
      }
      const description = orig.description ?? ''
      if (dl.description !== (orig.description ?? ''))
        edited.push({
          id: dl.id,
          field: 'description',
          from: orig.description,
          to: dl.description,
          description,
        })
      if (dl.qty !== (parseFloat(String(orig.qty)) || 0))
        edited.push({ id: dl.id, field: 'qty_ordered', from: orig.qty, to: dl.qty, description })
      if (dl.unit_price !== (parseFloat(String(orig.unit_price)) || 0))
        edited.push({
          id: dl.id,
          field: 'unit_price',
          from: orig.unit_price,
          to: dl.unit_price,
          description,
        })
      if (dl.uom !== (orig.uom ?? ''))
        edited.push({ id: dl.id, field: 'uom', from: orig.uom, to: dl.uom, description })
    }
    return { header, lines: { edited, added: draft.linesAdded, removed } }
  }

  return (
    <div
      style={{
        ...padding,
        // Phone: clears the 64px bottom navigation; the action bar adds its own measured spacer.
        paddingBottom: isPhone
          ? 'calc(env(safe-area-inset-bottom, 0px) + 72px)'
          : padding.paddingBottom,
        maxWidth: '1800px',
        margin: '0 auto',
      }}
    >
      <PageHeader
        title={req.requisition_number}
        subtitle={
          req.purpose
            ? t('req.detail.subtitlePurpose', { purpose: enumLabel(req.purpose) })
            : undefined
        }
        backPath="/procurement/requisitions"
        backLabel={t('req.detail.requisitionsBack')}
        compact
        status={
          <Badge variant={getRequisitionStatusVariant(req.status)}>
            {getRequisitionStatusLabel(req.status)}
          </Badge>
        }
        actions={
          isPhone ? (
            // On a phone the title would be crowded by two buttons: they sit behind one "⋯" menu.
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <OverflowMenu
                label={t('req.detail.moreActions')}
                items={[
                  {
                    key: 'print',
                    label: t('req.detail.print'),
                    onSelect: () => {
                      setShowPrintModal(true)
                    },
                  },
                  ...(canCancel
                    ? [
                        {
                          key: 'cancel',
                          label: t('req.detail.cancelRequisition'),
                          danger: true,
                          onSelect: () => {
                            setShowCancelBox((v) => !v)
                          },
                        },
                      ]
                    : []),
                ]}
              />
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '8px' }}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setShowPrintModal(true)
                }}
              >
                {t('req.detail.print')}
              </Button>
              {canCancel && (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => {
                    setShowCancelBox((v) => !v)
                  }}
                >
                  {t('req.detail.cancel')}
                </Button>
              )}
            </div>
          )
        }
      />

      {showCancelBox && (
        <Card
          style={{
            padding: '14px 20px',
            marginTop: '12px',
            borderInlineStart: `3px solid ${theme.danger}`,
          }}
        >
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: 1, minWidth: '200px' }}>
              <Input field
                label={t('req.detail.reasonOptional')}
                value={cancelReason}
                onChange={(e) => {
                  setCancelReason(e.target.value)
                }}
                placeholder={t('req.detail.whyIsThisRequisitionBeingCancelled')}
              />
            </div>
            <Button
              variant="danger"
              size="sm"
              loading={lCancel}
              onClick={() =>
                void cancel({ variables: { id: req.id, reason: cancelReason || undefined } })
              }
            >
              {t('req.detail.confirmCancel')}
            </Button>
          </div>
        </Card>
      )}

      <div style={{ marginTop: '16px', marginBottom: '16px' }}>
        <PhaseBar
          phases={requisitionPhasesFor(req.purpose).map((p) => ({
            key: p.key,
            label: getRequisitionPhaseLabel(p.key),
            statuses: p.statuses,
          }))}
          current={req.status}
          currentLabel={getRequisitionStatusLabel(req.status)}
          stoppedStatuses={['rejected', 'cancelled', 'deleted']}
        />
      </div>

      {/* Summary — the total, then what people look for first; the rest sits behind "All details".
          Labels use the darker secondary grey and values the main text colour, never the pale
          "muted" grey (about 2.6:1 on white), which is too faint to read figures in. */}
      <Card style={{ padding: isPhone ? '14px 16px' : '20px 24px', marginBottom: '16px' }}>
        <div
          style={
            isPhone
              ? // Phone: Total beside Priority, Project across the card, Organizer beside the delivery date.
                {
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                  gap: '12px 16px',
                  alignItems: 'start',
                }
              : { display: 'flex', flexWrap: 'wrap', gap: '16px 40px', alignItems: 'flex-start' }
          }
        >
          <div style={isPhone ? { minWidth: 0, order: 1 } : { flex: '1 1 220px', minWidth: 0 }}>
            <div style={{ fontSize: '13px', color: theme.textSecondary }}>
              {t('req.detail.total')}
            </div>
            <div
              style={{
                fontSize: isPhone ? '24px' : '28px',
                fontWeight: 700,
                color: theme.textPrimary,
                lineHeight: 1.15,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {(() => {
                // Purchased amount (per currency) plus, folded in separately
                // since it's display-only, each from-stock line's reference
                // value — see fromStockDisplayValue's own comment for why
                // this stays out of req.currencyTotals itself (that number
                // feeds the approval snapshot/tolerance checks and must keep
                // meaning "amount to purchase").
                const fromStockTotals = new Map<string, number>()
                for (const l of req.lines) {
                  const fromStock =
                    (parseFloat(String(l.total)) || 0) === 0 ? fromStockDisplayValue(l) : null
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
                      <span
                        key={`stock-${currency}`}
                        style={{ color: theme.textSecondary, fontSize: '13px', fontWeight: 500 }}
                      >
                        {t('req.detail.fromStockAmount', { amount: fmtN(amount), currency })}
                      </span>
                    ))}
                  </div>
                )
              })()}
            </div>
          </div>
          <dl
            style={
              isPhone
                ? // The fields join the summary grid above (Priority, Project, Organizer, Delivery).
                  { display: 'contents' }
                : {
                    flex: '3 1 420px',
                    minWidth: 0,
                    margin: 0,
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                    gap: '16px 24px',
                  }
            }
          >
            <SummaryField
              label={t('req.detail.priority')}
              style={isPhone ? { order: 2 } : undefined}
            >
              {getRequisitionPriorityLabel(req.priority ?? 'low')}
            </SummaryField>
            <SummaryField
              label={t('req.detail.expectedDelivery')}
              style={isPhone ? { order: 5 } : undefined}
            >
              {req.expected_delivery_date?.slice(0, 10) ?? '—'}
            </SummaryField>
            <SummaryField
              label={t('req.detail.project')}
              style={isPhone ? { order: 3, gridColumn: '1 / -1' } : undefined}
            >
              {req.projectCode
                ? `${req.projectCode} — ${req.projectName ?? ''}`
                : (req.projectName ?? '—')}
            </SummaryField>
            <SummaryField
              label={t('req.detail.organizer')}
              style={isPhone ? { order: 4 } : undefined}
            >
              {req.organizerName ?? '—'}
            </SummaryField>
          </dl>
        </div>
        <button
          type="button"
          aria-expanded={showAllDetails}
          onClick={() => {
            setShowAllDetails((v) => !v)
          }}
          style={
            isPhone
              ? // A quiet text link on a phone: the details are secondary, so they do not get a button's weight.
                {
                  marginTop: '4px',
                  minHeight: '44px',
                  padding: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'transparent',
                  border: 'none',
                  color: theme.accent,
                  fontSize: '14px',
                  fontWeight: 600,
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                  WebkitTapHighlightColor: 'transparent',
                }
              : {
                  marginTop: '14px',
                  minHeight: '32px',
                  padding: '0 12px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  background: 'transparent',
                  border: `1px solid ${theme.borderStrong}`,
                  borderRadius: '8px',
                  color: theme.textPrimary,
                  fontSize: '13px',
                  fontWeight: 600,
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                }
          }
        >
          {showAllDetails ? t('req.detail.hideDetails') : t('req.detail.allDetails')}
          <span aria-hidden="true">{showAllDetails ? '▴' : '▾'}</span>
        </button>
        {showAllDetails && (
          <dl
            data-phone-grid=""
            style={{
              margin: isPhone ? '4px 0 0' : '16px 0 0',
              paddingTop: isPhone ? '12px' : '16px',
              borderTop: `1px solid ${theme.border}`,
              display: 'grid',
              gridTemplateColumns: isPhone
                ? 'repeat(2, minmax(0, 1fr))'
                : 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: isPhone ? '12px 16px' : '16px 24px',
            }}
          >
            {req.linkedMoNumber && (
              <SummaryField label={t('req.detail.manufacturingOrder')}>
                {req.linkedMoNumber}
              </SummaryField>
            )}
            <SummaryField label={t('req.detail.branch')}>{req.branch_name ?? '—'}</SummaryField>
            <SummaryField label={t('req.detail.receivedBy')}>
              {req.assigned_receiver_name ?? '—'}
            </SummaryField>
            <SummaryField label={t('req.detail.created')}>
              {req.created_at.slice(0, 10)}
            </SummaryField>
          </dl>
        )}
      </Card>

      {req.status === 'completed' && (
        <Card
          style={{
            padding: '14px 20px',
            marginBottom: '16px',
            borderInlineStart: `3px solid ${theme.success}`,
          }}
        >
          <div style={{ fontSize: '14px', fontWeight: 600, color: theme.textPrimary }}>
            {t('req.detail.completed')}
          </div>
          <div style={{ fontSize: '13px', color: theme.textSecondary, marginTop: '2px' }}>
            {t('req.detail.everyLineOnThisRequisitionHas')}
          </div>
        </Card>
      )}
      {['rejected', 'cancelled', 'deleted'].includes(req.status) && (
        <Card
          style={{
            padding: '14px 20px',
            marginBottom: '16px',
            borderInlineStart: `3px solid ${theme.danger}`,
          }}
        >
          <div style={{ fontSize: '14px', fontWeight: 600, color: theme.textPrimary }}>
            {getRequisitionStatusLabel(req.status)}
          </div>
          <div style={{ fontSize: '13px', color: theme.textSecondary, marginTop: '2px' }}>
            {t('req.detail.thisRequisitionIsNoLongerActive')}
          </div>
        </Card>
      )}

      {/* The organizer review (migration 329): between Items Bought and Sourcing the organizer double-checks what was bought. */}
      {(req.status === 'organizer_review' || req.status === 'review_approval') && (
        <OrganizerReviewPanel
          requisition={req}
          barSlot={reviewBarSlot}
          onChanged={() => void refetch()}
        />
      )}

      {/* The lines (and the other tabs) take the full width. Under them, also full width, come the cards about
          what the requisition made (its purchase orders and Store Outs). The step's action is the bar at the
          bottom of the page. */}
      <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flex: '3 1 560px', minWidth: 0, order: 2 }}>
          {/* Tabs — Lines / Log / Edit requests (Receipts/Returns/Finance-Audit
          tabs from PurchaseOrderDetail don't apply: those are post-fork,
          PO-side concerns this page never reaches) */}
          <div style={{ marginBottom: '16px' }}>
            <TabBar
              readable
              tabs={[
                { key: 'lines', label: t('req.detail.lines') },
                { key: 'log', label: t('req.detail.log') },
                {
                  key: 'changes',
                  label: t('req.detail.editRequests'),
                  badge:
                    (req.edit_requests ?? []).filter((r) => r.status === 'pending').length ||
                    undefined,
                },
              ]}
              active={activeTab}
              onChange={(key) => {
                setActiveTab(key as Tab)
              }}
            />
          </div>

          {activeTab === 'lines' && (
            <Card
              style={
                isPhone
                  ? // On a phone each line is already a card: a second box around them only costs width.
                    {
                      ...sectionCard,
                      padding: 0,
                      background: 'transparent',
                      border: 'none',
                      backdropFilter: 'none',
                      WebkitBackdropFilter: 'none',
                      overflow: 'visible',
                    }
                  : sectionCard
              }
            >
              <StaleCostNotice
                items={staleItems}
                canConfirm={canConfirmInventory}
                confirmingProductId={confirmingCostProductId}
                onConfirm={(productId) => {
                  setConfirmingCostProductId(productId)
                  void confirmStockCost({ variables: { requisitionId: req.id, productId } })
                }}
              />
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  marginBottom: isPhone ? '8px' : '12px',
                }}
              >
                <ColumnsMenu
                  items={lineViewOptions.map((o) => ({
                    key: o.key,
                    label: o.label,
                    on: lineViewOn(o),
                    locked: o.locked,
                  }))}
                  onToggle={(key, on) => {
                    const o = lineViewOptions.find((v) => v.key === key)
                    if (o) linesView.setColumn(key, on, o.defaultOn)
                  }}
                  onReset={linesView.resetColumns}
                  canReset={linesView.customized}
                  note={t('req.detail.linesAlwaysVisible')}
                />
              </div>
              <Table
                columns={shownLineColumns}
                mobileLayout="fields"
                data={req.lines}
                rowKey="id"
                getRowStyle={(l) => {
                  // Currently checked for the reject box in progress — takes
                  // priority over an older, already-resolved-away flag.
                  if (l.id in flaggedLines) {
                    return {
                      borderInlineStart: `4px solid ${theme.accent}`,
                      background: `${theme.accent}0c`,
                    }
                  }
                  if (!l.flag_reason || l.flag_resolved_at)
                    return isStaleLine(l)
                      ? {
                          borderInlineStart: `4px solid ${theme.warning}`,
                          background: `${theme.warning}12`,
                        }
                      : {}
                  const open = !l.flag_addressed_at
                  const color = open ? theme.danger : theme.warning
                  return { borderInlineStart: `4px solid ${color}`, background: `${color}0c` }
                }}
                renderExpanded={(l) => {
                  const hasOpenFlag = !!l.flag_reason && !l.flag_resolved_at
                  const isComposing = l.id in flaggedLines
                  if (!hasOpenFlag && !isComposing) return null
                  const open = hasOpenFlag && !l.flag_addressed_at
                  const color = open ? theme.danger : theme.warning
                  // Whoever could have created a flag from that same stage may
                  // resolve it — mirrors resolveLineFlag's own backend gate
                  // exactly (procurement_2nd position holder for
                  // price_verification-origin, dept-head/approver/admin for
                  // pending_approval-origin).
                  const canResolve =
                    (l.flagged_from_status === 'price_verification' &&
                      (isSystemLevel || canVerifyPrice)) ||
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
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              marginBottom: '4px',
                            }}
                          >
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
                              {open ? t('req.detail.flagged') : t('req.detail.addressedAwaitingConfirmation')}
                            </span>
                            <span style={{ fontSize: '11px', color: theme.textMuted }}>
                              {t('req.detail.flaggedByDuring', {
                                name: l.flagged_by_name ?? t('req.detail.someone'),
                                stage: getRequisitionStatusLabel(
                                  l.flagged_from_status === 'price_verification'
                                    ? 'price_verification'
                                    : 'pending_approval',
                                ),
                              })}
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
                          <div style={{ display: 'flex', gap: '8px' }}>
                            {canResolve && !open && (
                              <Button
                                variant="secondary"
                                size="sm"
                                loading={lResolveFlag}
                                onClick={() => void resolveLineFlag({ variables: { lineId: l.id } })}
                              >
                                {t('req.detail.resolve')}
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setCommentModal({
                                  lineId: l.id,
                                  description: l.description || l.product_name || '',
                                })
                              }}
                            >
                              {(lineComments[l.id] ?? []).length > 0
                                ? t('req.detail.replyCount', { count: (lineComments[l.id] ?? []).length })
                                : t('req.detail.reply')}
                            </Button>
                          </div>
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
                            {t('req.detail.flaggingThisLineRequiredToReject')}
                          </div>
                          <Textarea
                            value={flaggedLines[l.id] ?? ''}
                            onChange={(e) => {
                              setFlaggedLines((prev) => ({ ...prev, [l.id]: e.target.value }))
                            }}
                            placeholder={t('req.detail.whatSWrongWithThisLine')}
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
                {t('req.detail.approvalLog')}
              </div>
              {req.notes && (
                <div
                  style={{
                    padding: '14px 16px',
                    borderBottom: `1px solid ${theme.border}`,
                    background: theme.bgSurface,
                  }}
                >
                  <div
                    style={{
                      fontSize: '12px',
                      fontWeight: 600,
                      color: theme.textSecondary,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      marginBottom: '6px',
                    }}
                  >
                    {t('req.detail.requisitionNotes')}
                  </div>
                  <div
                    style={{ fontSize: '13px', color: theme.textPrimary, whiteSpace: 'pre-wrap' }}
                  >
                    {req.notes}
                  </div>
                </div>
              )}
              {req.approval_log.length === 0 && (
                <div
                  style={{
                    padding: '32px',
                    textAlign: 'center',
                    color: theme.textSecondary,
                    fontSize: '13px',
                  }}
                >
                  {t('req.detail.noActivityYet')}
                </div>
              )}
              {req.approval_log.length > 0 && (
                <ActivityTimeline
                  entries={req.approval_log}
                  systemActor={t('req.detail.systemActor')}
                  label={t('req.detail.approvalLog')}
                />
              )}
            </Card>
          )}

          {activeTab === 'changes' &&
            (() => {
              const hasPendingEdit = (req.edit_requests ?? []).some((r) => r.status === 'pending')

              const lineFields: LineItemField<EditLineDraft>[] = [
                {
                  key: 'description',
                  label: t('req.detail.description'),
                  render: (line, i) => (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      <input
                        value={line.description}
                        style={inputStyle}
                        disabled={line._removed}
                        onChange={(e) => {
                          if (!editDraft) return
                          const lines = [...editDraft.lines]
                          lines[i] = { ...lines[i], description: e.target.value }
                          setEditDraft({ ...editDraft, lines })
                        }}
                      />
                      {line._removed && (
                        <span style={{ fontSize: '11px', fontWeight: 600, color: theme.danger }}>
                          {t('req.detail.markedForRemovalClickAgainTo')}
                        </span>
                      )}
                    </div>
                  ),
                },
                {
                  key: 'qty',
                  label: t('req.detail.qty'),
                  width: '90px',
                  render: (line, i) => (
                    <input
                      type="number"
                      value={line.qty}
                      style={inputStyle}
                      disabled={line._removed}
                      onChange={(e) => {
                        if (!editDraft) return
                        const lines = [...editDraft.lines]
                        lines[i] = { ...lines[i], qty: parseFloat(e.target.value) || 0 }
                        setEditDraft({ ...editDraft, lines })
                      }}
                    />
                  ),
                },
                {
                  key: 'unit_price',
                  label: t('req.detail.unitPrice'),
                  width: '110px',
                  render: (line, i) => (
                    <input
                      type="number"
                      value={line.unit_price}
                      style={inputStyle}
                      disabled={line._removed}
                      onChange={(e) => {
                        if (!editDraft) return
                        const lines = [...editDraft.lines]
                        lines[i] = { ...lines[i], unit_price: parseFloat(e.target.value) || 0 }
                        setEditDraft({ ...editDraft, lines })
                      }}
                    />
                  ),
                },
                {
                  key: 'uom',
                  label: t('req.detail.uom'),
                  width: '90px',
                  render: (line, i) => (
                    <input
                      value={line.uom}
                      style={inputStyle}
                      disabled={line._removed}
                      onChange={(e) => {
                        if (!editDraft) return
                        const lines = [...editDraft.lines]
                        lines[i] = { ...lines[i], uom: e.target.value }
                        setEditDraft({ ...editDraft, lines })
                      }}
                    />
                  ),
                },
              ]

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <Card style={{ padding: '20px' }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '16px',
                      }}
                    >
                      <div style={{ fontWeight: 600, fontSize: '15px', color: theme.textPrimary }}>
                        {t('req.detail.requestAnEdit')}
                      </div>
                      {hasPendingEdit && (
                        <Badge variant="warning">{t('req.detail.pendingReviewSubmitLocked')}</Badge>
                      )}
                      {!editDraft && !hasPendingEdit && canRequestEdit && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setEditDraft(initEditDraft())
                          }}
                        >
                          {t('req.detail.startEditing')}
                        </Button>
                      )}
                      {editDraft && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setEditDraft(null)
                          }}
                        >
                          {t('req.detail.cancel')}
                        </Button>
                      )}
                    </div>

                    {!editDraft && (
                      <div style={{ fontSize: '13px', color: theme.textMuted }}>
                        {!canRequestEdit
                          ? adminOnlyNow
                            ? t('req.detail.onlyAnAdminAfterApproval')
                            : t('req.detail.onlyTheOrganizerOrAnAdmin')
                          : hasPendingEdit
                            ? t('req.detail.thereIsAlreadyAPendingEdit')
                            : t('req.detail.clickStartEditingToProposeChanges')}
                      </div>
                    )}

                    {editDraft && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
                          <div style={{ flex: '1 1 240px' }}>
                            <Input field
                              label={t('req.detail.notes')}
                              value={editDraft.notes}
                              onChange={(e) => {
                                setEditDraft({ ...editDraft, notes: e.target.value })
                              }}
                            />
                          </div>
                          <div style={{ flex: '1 1 160px' }}>
                            <Select field
                              label={t('req.detail.priority')}
                              value={editDraft.priority}
                              onChange={(e) => {
                                setEditDraft({ ...editDraft, priority: e.target.value })
                              }}
                            >
                              <option value="low">{t('req.detail.low')}</option>
                              <option value="high">{t('req.detail.high')}</option>
                              <option value="emergency">{t('req.detail.emergency')}</option>
                            </Select>
                          </div>
                          {req.purpose === 'project' && (
                            <div style={{ flex: '1 1 220px' }}>
                              <Select field
                                label={t('req.detail.deliveryDestination')}
                                value={editDraft.delivery_destination}
                                disabled={!deliveryDestinationEditable}
                                onChange={(e) => {
                                  setEditDraft({
                                    ...editDraft,
                                    delivery_destination: e.target.value,
                                  })
                                }}
                              >
                                <option value="">{t('req.detail.notSet')}</option>
                                <option value="inventory">{t('req.detail.deliveredToInventory')}</option>
                                <option value="jobsite">{t('req.detail.deliveredDirectlyToTheJobsite')}</option>
                              </Select>
                              {!deliveryDestinationEditable && (
                                <div
                                  style={{
                                    fontSize: '11px',
                                    color: theme.textMuted,
                                    marginTop: '4px',
                                  }}
                                >
                                  {t('req.detail.noLongerEditableBuyingAlreadyForked')}
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        <LineItemEditor
                          fields={lineFields}
                          rows={editDraft.lines}
                          // Toggling a row to _removed only disables its inputs
                          // (see lineFields above) — with no row-level style and
                          // the inputs already looking static, that alone reads
                          // as "the X button didn't do anything". The tinted
                          // background + "Removed" tag below is the actual
                          // feedback that the click registered.
                          getRowStyle={(row) =>
                            row._removed ? { background: theme.dangerBg, opacity: 0.6 } : {}
                          }
                          onRemoveRow={(i) => {
                            const lines = [...editDraft.lines]
                            lines[i] = { ...lines[i], _removed: !lines[i]._removed }
                            setEditDraft({ ...editDraft, lines })
                          }}
                          onAddRow={() => {
                            setEditDraft({
                              ...editDraft,
                              linesAdded: [
                                ...editDraft.linesAdded,
                                {
                                  product_id: '',
                                  description: '',
                                  qty: 1,
                                  unit_price: 0,
                                  uom: 'unit',
                                  currency_code: sharedLineCurrency,
                                },
                              ],
                            })
                          }}
                        />

                        {(() => {
                          const addedLineFields: LineItemField<EditDraft['linesAdded'][number]>[] = [
                            {
                              key: 'product',
                              label: t('req.detail.productDescription'),
                              render: (al, i) => (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                  <SearchableSelect
                                    value={al.product_id}
                                    onChange={(v) => {
                                      const linesAdded = [...editDraft.linesAdded]
                                      const p = editProducts.find((pp) => pp.id === v)
                                      linesAdded[i] = {
                                        ...linesAdded[i],
                                        product_id: v,
                                        ...(p ? { description: p.name, uom: p.uom } : {}),
                                      }
                                      setEditDraft({ ...editDraft, linesAdded })
                                    }}
                                    options={editProductOptions}
                                    placeholder={t('req.detail.searchByNameOrSku')}
                                    minDropdownWidth={360}
                                  />
                                  <input
                                    value={al.description}
                                    placeholder={t('req.detail.description')}
                                    style={inputStyle}
                                    onChange={(e) => {
                                      const linesAdded = [...editDraft.linesAdded]
                                      linesAdded[i] = { ...linesAdded[i], description: e.target.value }
                                      setEditDraft({ ...editDraft, linesAdded })
                                    }}
                                  />
                                </div>
                              ),
                            },
                            {
                              key: 'qty',
                              label: t('req.detail.qty'),
                              width: '90px',
                              render: (al, i) => (
                                <input
                                  type="number"
                                  value={al.qty}
                                  style={inputStyle}
                                  onChange={(e) => {
                                    const linesAdded = [...editDraft.linesAdded]
                                    linesAdded[i] = { ...linesAdded[i], qty: parseFloat(e.target.value) || 0 }
                                    setEditDraft({ ...editDraft, linesAdded })
                                  }}
                                />
                              ),
                            },
                            {
                              key: 'uom',
                              label: t('req.detail.uom'),
                              width: '80px',
                              render: (al, i) => (
                                <input
                                  value={al.uom}
                                  style={inputStyle}
                                  onChange={(e) => {
                                    const linesAdded = [...editDraft.linesAdded]
                                    linesAdded[i] = { ...linesAdded[i], uom: e.target.value }
                                    setEditDraft({ ...editDraft, linesAdded })
                                  }}
                                />
                              ),
                            },
                            {
                              key: 'unit_price',
                              label: t('req.detail.unitPrice'),
                              width: '110px',
                              render: (al, i) => (
                                <input
                                  type="number"
                                  value={al.unit_price}
                                  style={inputStyle}
                                  onChange={(e) => {
                                    const linesAdded = [...editDraft.linesAdded]
                                    linesAdded[i] = {
                                      ...linesAdded[i],
                                      unit_price: parseFloat(e.target.value) || 0,
                                    }
                                    setEditDraft({ ...editDraft, linesAdded })
                                  }}
                                />
                              ),
                            },
                            {
                              key: 'currency_code',
                              label: t('req.detail.currency'),
                              width: '100px',
                              render: (al, i) => (
                                <select
                                  value={al.currency_code}
                                  aria-label={t('req.detail.currency')}
                                  style={selectStyle}
                                  onChange={(e) => {
                                    const linesAdded = [...editDraft.linesAdded]
                                    linesAdded[i] = {
                                      ...linesAdded[i],
                                      currency_code: e.target.value,
                                    }
                                    setEditDraft({ ...editDraft, linesAdded })
                                  }}
                                >
                                  <option value="" disabled>
                                    {t('req.detail.currency')}
                                  </option>
                                  {addedLineCurrencyOptions.map((c) => (
                                    <option key={c} value={c}>
                                      {c}
                                    </option>
                                  ))}
                                </select>
                              ),
                            },
                          ]
                          return (
                            <div style={{ marginTop: '4px' }}>
                              <div
                                style={{ fontSize: '12px', fontWeight: 600, color: theme.textMuted, marginBottom: '8px' }}
                              >
                                {t('req.detail.newLines')}
                              </div>
                              <LineItemEditor
                                fields={addedLineFields}
                                rows={editDraft.linesAdded}
                                rowKey={(_, i) => `new-${i}`}
                                getRowStyle={() => ({ background: theme.accentBg + '44' })}
                                onRemoveRow={(i) => {
                                  setEditDraft({
                                    ...editDraft,
                                    linesAdded: editDraft.linesAdded.filter((_, idx) => idx !== i),
                                  })
                                }}
                                addLabel={t('req.detail.addLine')}
                                emptyMessage={t('req.detail.noNewLinesAdded')}
                              />
                            </div>
                          )
                        })()}

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
                              addToast({ type: 'error', message: t('req.detail.noChangesToSubmit') })
                              return
                            }
                            if (editDraft.linesAdded.some((al) => !al.currency_code)) {
                              addToast({
                                type: 'error',
                                message: t('req.detail.chooseNewLineCurrency'),
                              })
                              return
                            }
                            void submitEditRequest({
                              variables: {
                                requisitionId: req.id,
                                changes: JSON.stringify(changes),
                              },
                            })
                          }}
                        >
                          {t('req.detail.submitEditRequest')}
                        </Button>
                      </div>
                    )}
                  </Card>

                  {(req.edit_requests ?? []).length > 0 && (
                    <Card style={{ padding: '20px' }}>
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: '15px',
                          color: theme.textPrimary,
                          marginBottom: '14px',
                        }}
                      >
                        {t('req.detail.history')}
                      </div>
                      {(req.edit_requests ?? []).map((er) => (
                        <EditRequestCard
                          key={er.id}
                          kind="requisition"
                          flush
                          request={er}
                          currentLines={req.lines}
                          canReview={isSystemLevel}
                          approving={leApprove}
                          rejecting={leReject}
                          onApprove={(requestId, notes) => {
                            void approveEditRequest({
                              variables: { requisitionId: req.id, requestId, reviewNotes: notes },
                            })
                          }}
                          onReject={(requestId, notes) => {
                            void rejectEditRequest({
                              variables: { requisitionId: req.id, requestId, reviewNotes: notes },
                            })
                          }}
                        />
                      ))}
                    </Card>
                  )}
                </div>
              )
            })()}
        </div>

        <div
          style={{
            // A row of its own under the lines, full width; hidden when there is nothing to put in it.
            flex: '1 1 100%',
            minWidth: 0,
            order: 3,
            display: hasFollowUpCards ? undefined : 'none',
          }}
        >
          {/* Draft, store pricing, market pricing and price verification: their action is the bar at the bottom of the page. */}

          {/* ── Children POs (once any exist) ───────────────────────────────── */}
          {showChildren && children.length > 0 && (
            <Card style={sectionCard}>
              <div style={sectionTitle}>{t('req.detail.purchaseOrders')}</div>
              <div style={sectionHint}>{t('req.detail.onePerVendorForkedAtFinish')}</div>
              <Table
                columns={[
                  {
                    key: 'po_number',
                    header: t('req.detail.poNumber'),
                    render: (c: ChildPO) => (
                      <span
                        style={{ fontFamily: 'monospace', color: theme.accent, fontSize: '13px' }}
                      >
                        {c.po_number}
                      </span>
                    ),
                  },
                  {
                    key: 'vendor_name',
                    header: t('req.detail.vendor'),
                    render: (c: ChildPO) => (
                      <span style={{ fontSize: '13px' }}>{c.vendor_name ?? '—'}</span>
                    ),
                  },
                  {
                    key: 'status',
                    header: t('req.detail.status'),
                    render: (c: ChildPO) => (
                      <Badge variant={getPOStatusVariant(c.status)}>
                        {getPOStatusLabel(c.status)}
                      </Badge>
                    ),
                  },
                  {
                    key: 'total_amount',
                    header: t('req.detail.total'),
                    render: (c: ChildPO) => {
                      const entries = poTotalEntries(c)
                      if (entries.length === 0) return <span style={{ fontSize: '13px' }}>—</span>
                      return (
                        <span
                          style={{
                            fontSize: '13px',
                            display: 'inline-flex',
                            flexDirection: 'column',
                            gap: '2px',
                          }}
                        >
                          {entries.map((e) => (
                            <span key={e.currencyCode}>
                              {fmtN(e.amount)} {e.currencyCode}
                            </span>
                          ))}
                        </span>
                      )
                    },
                  },
                ]}
                data={children}
                rowKey="id"
                onRowClick={(c: ChildPO) => {
                  navigate(`/procurement/purchase-orders/${c.id}`)
                }}
              />
            </Card>
          )}

          {/* ── Store Outs (once any exist) ──────────────────────────────────── */}
          {showChildren && materialIssues.length > 0 && (
            <Card style={sectionCard}>
              <div style={sectionTitle}>{t('req.detail.storeOuts')}</div>
              <div style={sectionHint}>{t('req.detail.storeOutsHint')}</div>
              <Table
                columns={[
                  {
                    key: 'issueNumber',
                    header: t('req.detail.issueNumber'),
                    render: (mi: (typeof materialIssues)[number]) => (
                      <span
                        style={{ fontFamily: 'monospace', color: theme.accent, fontSize: '13px' }}
                      >
                        {mi.issueNumber}
                      </span>
                    ),
                  },
                  {
                    // set when the Store Out was made against one of this requisition's
                    // purchase orders (the bought items) rather than the requisition itself
                    key: 'poNumber',
                    header: t('req.detail.poNumber'),
                    render: (mi: (typeof materialIssues)[number]) => (
                      <span
                        style={{
                          fontFamily: 'monospace',
                          color: theme.textSecondary,
                          fontSize: '13px',
                        }}
                      >
                        {mi.poNumber ?? '—'}
                      </span>
                    ),
                  },
                  {
                    key: 'status',
                    header: t('req.detail.status'),
                    render: (mi: (typeof materialIssues)[number]) => (
                      <Badge variant={MATERIAL_ISSUE_STATUS_VARIANT[mi.status] ?? 'neutral'}>
                        {enumLabel(mi.status)}
                      </Badge>
                    ),
                  },
                ]}
                data={materialIssues}
                rowKey="id"
                onRowClick={(mi: (typeof materialIssues)[number]) => {
                  navigate(`/inventory/store-out/${mi.id}`)
                }}
              />
            </Card>
          )}

        </div>
      </div>

      {/* ── The step's action: one bar at the bottom of the page ────────────────
          Draft, store pricing, market pricing and price verification are filled in on the Lines table
          itself (price boxes in the cells); what is left of each step is its button, here. ─────── */}
      {req.status === 'draft' && !isDirectSupply && (
        <StageActionBar
          title={t('req.detail.nextStepSubmitForInventoryCheck')}
          hint={t('req.detail.onceSubmittedTheOrganizerOrA')}
          status={canSubmitDraft ? undefined : barNote(t('req.detail.onlyTheOrganizerOrAnAdmin2'))}
        >
          {canSubmitDraft && (
            <Button
              variant="primary"
              loading={lSubmit}
              onClick={() => void submitToInventory({ variables: { id: req.id } })}
            >
              {t('req.detail.submitForInventoryCheck')}
            </Button>
          )}
        </StageActionBar>
      )}

      {/* Direct supply: no inventory check and no pricing step, so the draft goes straight to the approver, who sees
          the Est. Unit Price typed when it was created. */}
      {req.status === 'draft' && isDirectSupply && (
        <StageActionBar
          title={t('req.detail.nextStepSubmitForApproval')}
          hint={t('req.detail.directSupplyApprovalHint')}
          status={canSubmitDraft ? undefined : barNote(t('req.detail.onlyTheOrganizerOrAnAdmin2'))}
        >
          {canSubmitDraft && (
            <Button
              variant="primary"
              loading={lSubmitDirect}
              onClick={() => void submitDirectSupply({ variables: { id: req.id } })}
            >
              {t('req.detail.submitForApproval')}
            </Button>
          )}
        </StageActionBar>
      )}

      {req.status === 'inventory_check' && (
        <StageActionBar
          title={t('req.detail.nextStepConfirmStockAvailability')}
          hint={t('req.detail.enterTheQuantityToTakeFrom')}
          status={
            canConfirmInventory
              ? barNote(
                  t('req.detail.invCoveredSummary', {
                    covered: invCovered,
                    total: req.lines.length,
                  }),
                )
              : barNote(t('req.detail.onlyTheOrganizerAStoreKeeper'))
          }
        >
          {canConfirmInventory && (
            <Button
              variant="primary"
              loading={lConfirm}
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
                }).then(() => {
                  // Now saved for real: the draft would otherwise linger in localStorage forever for a
                  // stage this requisition has already moved past.
                  if (invCheckDraftKey) {
                    try {
                      localStorage.removeItem(invCheckDraftKey)
                    } catch {
                      // Unavailable localStorage: nothing to clean up.
                    }
                  }
                })
              }
            >
              {t('req.detail.confirmInventoryCheck')}
            </Button>
          )}
        </StageActionBar>
      )}

      {req.status === 'store_pricing' && (
        <StageActionBar
          title={t('req.detail.nextStepStorePricing')}
          hint={t('req.detail.recordWhatThisWouldCostFrom')}
          status={
            !canStorePrice
              ? barNote(t('req.detail.onlySomeoneHoldingTheStorePricing'))
              : linesFromStock.length === 0
                ? barNote(t('req.detail.noLinesOnThisRequisitionAre'))
                : undefined
          }
        >
          {canStorePrice && (
            <Button
              variant="primary"
              loading={lStore}
              onClick={() =>
                void submitStorePricing({
                  variables: {
                    id: req.id,
                    linePrices: linesFromStock.map((l) => ({
                      lineId: l.id,
                      storePrice:
                        parseFloat(
                          storePrices[l.id] ??
                            String(l.store_price ?? l.source_average_cost ?? '0'),
                        ) || 0,
                      currencyCode: l.currency_code ?? 'IQD',
                    })),
                  },
                })
              }
            >
              {t('req.detail.submitToMarketPricing')}
            </Button>
          )}
        </StageActionBar>
      )}

      {req.status === 'market_pricing' && (
        <StageActionBar
          title={t('req.detail.nextStepMarketPricing')}
          hint={t('req.detail.enterTheCheckedVendorQuotePer')}
          // The long explanation and who has submitted which part go in `more`: on a phone they sit behind the
          // bar's info button, so what is left in `status` is only what blocks the step.
          more={
            marketEntry && linesToBuy.length > 0 && (isOrganizer || splitPricing) ? (
              <>
                {isOrganizer && (
                  <div style={{ fontSize: '12px', color: theme.textSecondary }}>
                    {t('req.detail.splitHintOwner')}
                  </div>
                )}
                {splitPricing && (
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '8px 16px',
                      fontSize: '12px',
                      color: theme.textSecondary,
                    }}
                  >
                    <span>
                      {t('req.detail.ownerItemsCount', { n: ownerLines.length })}{' '}
                      <Badge variant={req.owner_pricing_submitted_at ? 'success' : 'warning'}>
                        {req.owner_pricing_submitted_at
                          ? t('req.detail.partSubmitted')
                          : t('req.detail.partWaiting')}
                      </Badge>
                    </span>
                    <span>
                      {t('req.detail.procurementItemsCount', { n: procLines.length })}{' '}
                      {procLines.length === 0 ? (
                        <Badge variant="neutral">{t('req.detail.partNone')}</Badge>
                      ) : (
                        <Badge
                          variant={req.procurement_pricing_submitted_at ? 'success' : 'warning'}
                        >
                          {req.procurement_pricing_submitted_at
                            ? t('req.detail.partSubmitted')
                            : t('req.detail.partWaiting')}
                        </Badge>
                      )}
                    </span>
                  </div>
                )}
              </>
            ) : undefined
          }
          status={
            !marketEntry ? (
              barNote(t('req.detail.onlyAProcurementOfficerOrAn'))
            ) : linesToBuy.length === 0 ? (
              barNote(t('req.detail.nothingOnThisRequisitionNeedsA'))
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {splitPricing &&
                  !ownerAllPriced &&
                  barWarning(t('req.detail.priceEveryItemYouTook'))}
                {canMarketPrice &&
                  procLines.length > 0 &&
                  !procAllPriced &&
                  barWarning(t('req.detail.enterAPriceForEveryLine'))}
                {canMarketPrice &&
                  procLines.length === 0 &&
                  barNote(t('req.detail.nothingLeftForProcurement'))}
              </div>
            )
          }
        >
          {/* Nothing to buy at all: one Continue, for procurement. */}
          {marketEntry && linesToBuy.length === 0 && canMarketPrice && (
            <Button
              variant="primary"
              loading={lMarket}
              onClick={() =>
                void submitMarketPricing({ variables: { id: req.id, linePrices: [] } })
              }
            >
              {t('req.detail.continueToPriceVerification')}
            </Button>
          )}
          {/* The owner's part: his own lines, or procurement stepping in for him. */}
          {marketEntry && splitPricing && (
            <Button
              variant={procLines.length === 0 && canMarketPrice ? 'primary' : 'secondary'}
              loading={lMarket}
              disabled={!ownerAllPriced}
              onClick={() =>
                void submitMarketPricing({
                  variables: {
                    id: req.id,
                    side: 'OWNER',
                    linePrices: marketLinePrices(ownerLines),
                  },
                })
              }
            >
              {isOrganizer
                ? req.owner_pricing_submitted_at
                  ? t('req.detail.updateMyItems')
                  : t('req.detail.submitMyItems')
                : req.owner_pricing_submitted_at
                  ? t('req.detail.updateOwnerItems')
                  : t('req.detail.submitOwnerItems')}
            </Button>
          )}
          {/* Procurement's part. With nothing split this is the one submit it always was. */}
          {marketEntry && canMarketPrice && procLines.length > 0 && (
            <Button
              variant="primary"
              loading={lMarket}
              disabled={!procAllPriced}
              onClick={() =>
                void submitMarketPricing({
                  variables: { id: req.id, linePrices: marketLinePrices(procLines) },
                })
              }
            >
              {splitPricing
                ? req.procurement_pricing_submitted_at
                  ? t('req.detail.updateProcurementItems')
                  : t('req.detail.submitProcurementItems')
                : t('req.detail.submitToPriceVerification')}
            </Button>
          )}
        </StageActionBar>
      )}

      {req.status === 'price_verification' && (
        <StageActionBar
          title={t('req.detail.nextStepVerifyPrices')}
          hint={t('req.detail.crossCheckEachMarketPriceAnd')}
          status={
            !canVerifyPrice ? (
              barNote(t('req.detail.onlyAProcurement2ndPositionHolder'))
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {linesToBuy.length === 0
                  ? barNote(t('req.detail.nothingOnThisRequisitionNeedsPrice'))
                  : !linesToBuy.every((l) => priceIsValid(verifiedRawOf(l))) &&
                    barWarning(t('req.detail.enterAVerifiedPriceForEvery'))}
                {barNote(sendBackHint)}
              </div>
            )
          }
        >
          {canVerifyPrice && (
            <Button
              variant="secondary"
              disabled={!hasValidFlags}
              onClick={() => {
                setSendBackOpen(true)
              }}
            >
              {t('req.detail.sendBackButton')}
            </Button>
          )}
          {canVerifyPrice && linesToBuy.length === 0 && (
            <Button
              variant="primary"
              loading={anyVerifyLoading}
              onClick={() => void verifyPrices({ variables: { id: req.id, lineAdjustments: [] } })}
            >
              {t('req.detail.continueToApproval')}
            </Button>
          )}
          {canVerifyPrice && linesToBuy.length > 0 && (
            <Button
              variant="primary"
              loading={anyVerifyLoading}
              disabled={!linesToBuy.every((l) => priceIsValid(verifiedRawOf(l)))}
              onClick={() =>
                void verifyPrices({
                  variables: {
                    id: req.id,
                    lineAdjustments: linesToBuy.map((l) => ({
                      lineId: l.id,
                      verifiedPrice: parseFloat(verifiedRawOf(l)),
                    })),
                  },
                })
              }
            >
              {t('req.detail.submitForApproval')}
            </Button>
          )}
        </StageActionBar>
      )}

      {req.status === 'pending_approval' && (
        <StageActionBar
          title={t('req.detail.nextStepApproveOrReject')}
          hint={t('req.detail.rejectingSendsThisRequisitionBackTo')}
          status={
            canApprove
              ? barNote(sendBackHint)
              : barNote(t('req.detail.onlyTheDepartmentHeadTheAssigned'))
          }
        >
          {canApprove && (
            <Button
              variant="secondary"
              disabled={!hasValidFlags}
              onClick={() => {
                setSendBackOpen(true)
              }}
            >
              {t('req.detail.sendBackButton')}
            </Button>
          )}
          {canApprove && (
            <Button
              variant="primary"
              loading={anyApprovalLoading}
              onClick={() => void approve({ variables: { id: req.id } })}
            >
              {t('req.detail.approve')}
            </Button>
          )}
        </StageActionBar>
      )}

      {(req.status === 'approved' || req.status === 'items_bought') && (
        <StageActionBar
          title={
            req.status === 'approved'
              ? t('req.detail.approvedBuyingStartsNext')
              : t('req.detail.itemsBoughtInProgress')
          }
          hint={t('req.detail.recordingPurchasesPerVendorHappensOn')}
        >
          {req.status === 'items_bought' && (
            <Button
              variant="primary"
              onClick={() => {
                navigate(`/procurement/requisitions/${req.id}/items-bought`)
              }}
            >
              {t('req.detail.goToItemsBought')}
            </Button>
          )}
        </StageActionBar>
      )}

      {req.status === 'sourcing' && (
        <StageActionBar
          title={t('req.detail.sourcing')}
          status={barNote(t('req.detail.waitingOnEveryLineToResolve'))}
        />
      )}

      <div ref={setReviewBarSlot} />

      <SendBackDialog
        open={sendBackOpen}
        onClose={() => {
          setSendBackOpen(false)
        }}
        title={t('req.detail.sendBackTitle', { number: req.requisition_number })}
        destinations={sendBackOptions}
        flagged={sendBackFlagged}
        note={rejectReason}
        notePlaceholder={flagAutoReason}
        onNoteChange={setRejectReason}
        loading={anyVerifyLoading || anyApprovalLoading}
        onConfirm={(key) => {
          void sendBackOptions.find((o) => o.key === key)?.run()
        }}
      />

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
            const fromStock =
              (parseFloat(String(l.total)) || 0) === 0 ? fromStockDisplayValue(l) : null
            if (fromStock) {
              fromStockTotals.set(
                fromStock.currency,
                (fromStockTotals.get(fromStock.currency) ?? 0) + fromStock.amount,
              )
            }
          }
          const approvalTrail = [
            { action: 'confirm_inventory_check', label: t('req.detail.inventoryCheckedBy') },
            { action: 'submit_to_market_pricing', label: t('req.detail.storePricedBy') },
            { action: 'submit_to_price_verification', label: t('req.detail.marketPricedBy') },
            { action: 'submit_for_approval', label: t('req.detail.priceVerifiedBy') },
            { action: 'approve', label: t('req.detail.approvedBy') },
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
              onClick={() => {
                setShowPrintModal(false)
              }}
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
                onClick={(e) => {
                  e.stopPropagation()
                }}
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
                    {t('req.detail.printRequisitionTitle', { number: req.requisition_number })}
                  </span>
                  <button
                    onClick={() => {
                      setShowPrintModal(false)
                    }}
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
                      lines: req.lines.map((l) => {
                        const qtyFromStock = parseFloat(String(l.qty_from_stock ?? '0')) || 0
                        return {
                          description: l.description ?? l.product_name ?? '',
                          product_name: l.product_name,
                          product_name_ar: l.product_name_ar,
                          qty: parseFloat(l.qty) || 0,
                          qty_from_stock: qtyFromStock,
                          uom: l.uom ?? '',
                          currency_code: l.currency_code ?? 'IQD',
                          unit_price: parseFloat(l.unit_price) || 0,
                          total: parseFloat(l.total) || 0,
                          store_price:
                            l.store_price != null ? parseFloat(l.store_price) || 0 : null,
                          store_price_currency: l.store_price_currency ?? null,
                          // Gated on qty_from_stock (not total === 0) so a
                          // partially-covered line — some purchased, some
                          // from stock — still shows its from-stock portion
                          // instead of it silently vanishing from print.
                          fromStock: qtyFromStock > 0 ? fromStockDisplayValue(l) : null,
                        }
                      }),
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
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setShowPrintModal(false)
                      }}
                    >
                      {t('req.detail.cancel')}
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => printIframeRef.current?.contentWindow?.print()}
                    >
                      {t('req.detail.printSaveAsPdf')}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )
        })()}

      {commentModal && (
        <LineCommentsModal
          poId={id}
          lineId={commentModal.lineId}
          description={commentModal.description}
          comments={lineComments[commentModal.lineId] ?? []}
          onClose={() => {
            setCommentModal(null)
          }}
          onChanged={fetchLineComments}
        />
      )}
    </div>
  )
}
