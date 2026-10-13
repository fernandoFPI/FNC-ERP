import { useTranslation } from 'react-i18next'
import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
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
import { RESOLVE_LINE_FLAG, PO_LINE_COMMENTS_QUERY } from '../../../graphql/procurement'
import { LineCommentsModal, type LineComment } from './LineCommentsModal'
import { PRODUCTS_QUERY } from '../../../graphql/inventory'
import { MATERIAL_ISSUES_QUERY } from '../../../graphql/projects'
import { useAuthStore } from '../../../store/authStore'
import { useTheme } from '../../../theme/ThemeContext'
import { enumLabel } from '../../../i18n'
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
  linesAdded: { product_id: string; description: string; qty: number; unit_price: number; uom: string }[]
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
  callerHasStoreKeeperPosition?: boolean | null
  callerHasStorePricingPosition?: boolean | null
  callerHasMarketPricingPosition?: boolean | null
  callerHasPriceVerificationPosition?: boolean | null
  callerCanApprove?: boolean | null
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

export default function RequisitionDetail() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { theme } = useTheme()
  const { isSystemLevel } = usePermission()
  const currentUserId = useAuthStore((s) => s.user?.id)
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
  const [confirmInventory, { loading: lConfirm }] = useMutation<
    ConfirmRequisitionInventoryCheckMutation,
    ConfirmRequisitionInventoryCheckMutationVariables
  >(CONFIRM_REQUISITION_INVENTORY_CHECK, mutOpts)
  const [submitStorePricing, { loading: lStore }] = useMutation<
    SubmitRequisitionStorePricingMutation,
    SubmitRequisitionStorePricingMutationVariables
  >(SUBMIT_REQUISITION_STORE_PRICING, mutOpts)
  const [submitMarketPricing, { loading: lMarket }] = useMutation<
    SubmitRequisitionMarketPricingMutation,
    SubmitRequisitionMarketPricingMutationVariables
  >(SUBMIT_REQUISITION_MARKET_PRICING, mutOpts)
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
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({})

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
        ? t('req.detail.flaggedLinesBanner', { count: flaggedLineIds.length })
        : t('req.detail.checkTheLineSThatNeed')}
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
            header: t('req.detail.flag'),
            width: '36px',
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
    {
      key: 'qty',
      header: t('req.detail.qty'),
      render: (l) => (
        <span style={{ fontSize: '13px' }}>
          {fmtN(l.qty)} {l.uom ?? ''}
        </span>
      ),
    },
    ...([
      'inventory_check',
      'store_pricing',
      'market_pricing',
      'price_verification',
      'pending_approval',
      'approved',
      'items_bought',
      'sourcing',
      'completed',
    ].includes(req.status)
      ? [
          {
            key: 'qty_from_stock',
            header: t('req.detail.fromStock'),
            render: (l: ReqLine) => (
              <span style={{ fontSize: '13px' }}>{fmtN(l.qty_from_stock ?? 0)}</span>
            ),
          },
        ]
      : []),
    ...([
      'store_pricing',
      'market_pricing',
      'price_verification',
      'pending_approval',
      'approved',
      'items_bought',
      'sourcing',
      'completed',
    ].includes(req.status)
      ? [
          {
            key: 'store_price',
            header: t('req.detail.storePrice'),
            render: (l: ReqLine) => (
              <span style={{ fontSize: '13px', color: theme.textMuted }}>
                {l.store_price ? `${fmtN(l.store_price)} ${l.store_price_currency ?? ''}` : '—'}
              </span>
            ),
          },
        ]
      : []),
    ...([
      'market_pricing',
      'price_verification',
      'pending_approval',
      'approved',
      'items_bought',
      'sourcing',
      'completed',
    ].includes(req.status)
      ? [
          {
            key: 'market_price',
            header: t('req.detail.marketPrice'),
            render: (l: ReqLine) => (
              <span style={{ fontSize: '13px' }}>
                {l.market_price ? `${fmtN(l.market_price)} ${l.market_price_currency ?? ''}` : '—'}
              </span>
            ),
          },
        ]
      : []),
    ...([
      'price_verification',
      'pending_approval',
      'approved',
      'items_bought',
      'sourcing',
      'completed',
    ].includes(req.status)
      ? [
          {
            key: 'verified_price',
            header: t('req.detail.verifiedPrice'),
            render: (l: ReqLine) => (
              <span style={{ fontSize: '13px', fontWeight: 600 }}>
                {l.verified_price
                  ? `${fmtN(l.verified_price)} ${l.verified_price_currency ?? ''}`
                  : '—'}
              </span>
            ),
          },
        ]
      : []),
    ...(['items_bought', 'sourcing', 'completed'].includes(req.status)
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
        paddingBottom: isPhone
          ? 'calc(env(safe-area-inset-bottom, 0px) + 120px)'
          : padding.paddingBottom,
        maxWidth: '1800px',
        margin: '0 auto',
      }}
    >
      <PageHeader
        title={req.requisition_number}
        subtitle={req.purpose ? t('req.detail.subtitlePurpose', { purpose: req.purpose }) : undefined}
        backPath="/procurement/requisitions"
        backLabel={t('req.detail.requisitionsBack')}
        status={
          <Badge variant={getRequisitionStatusVariant(req.status)}>
            {getRequisitionStatusLabel(req.status)}
          </Badge>
        }
        actions={
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
              <Input
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
        <StatusBar
          steps={REQUISITION_STATUSES.map((s) => ({ key: s.key, label: s.label }))}
          currentStep={req.status}
          rejectedSteps={['rejected', 'cancelled', 'deleted']}
        />
      </div>

      {/* Summary — colored stat-card grid, matching PurchaseOrderDetail's own "PO Summary" */}
      <Card style={{ padding: '24px', marginBottom: '16px' }}>
        <div
          style={{
            fontWeight: 600,
            fontSize: '15px',
            color: theme.textPrimary,
            marginBottom: '16px',
          }}
        >
          {t('req.detail.summary')}
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
              label: t('req.detail.total'),
              value: (() => {
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
                        style={{ color: theme.textMuted, fontSize: '12px' }}
                      >
                        {t('req.detail.fromStockAmount', { amount: fmtN(amount), currency })}
                      </span>
                    ))}
                  </div>
                )
              })(),
            },
            {
              label: t('req.detail.priority'),
              value: REQUISITION_PRIORITY_LABELS[req.priority ?? 'low'] ?? req.priority ?? '—',
            },
            {
              label: t('req.detail.project'),
              value: req.projectCode
                ? `${req.projectCode} — ${req.projectName ?? ''}`
                : (req.projectName ?? '—'),
            },
            ...(req.linkedMoNumber
              ? [{ label: t('req.detail.manufacturingOrder'), value: req.linkedMoNumber }]
              : []),
            { label: t('req.detail.branch'), value: req.branch_name ?? '—' },
            { label: t('req.detail.organizer'), value: req.organizerName ?? '—' },
            { label: t('req.detail.receivedBy'), value: req.assigned_receiver_name ?? '—' },
            { label: t('req.detail.expectedDelivery'), value: req.expected_delivery_date?.slice(0, 10) ?? '—' },
            { label: t('req.detail.created'), value: req.created_at.slice(0, 10) },
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
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 500,
                  color: theme.textMuted,
                  marginBottom: '6px',
                }}
              >
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
            <Card style={sectionCard}>
              <Table
                columns={lineColumns}
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
                  if (!l.flag_reason || l.flag_resolved_at) return {}
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
                      fontSize: '11px',
                      color: theme.textMuted,
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
                    color: theme.textMuted,
                    fontSize: '13px',
                  }}
                >
                  {t('req.detail.noActivityYet')}
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
                      entry.action === 'approved'
                        ? 'success'
                        : entry.action.startsWith('reject')
                          ? 'danger'
                          : 'info'
                    }
                  >
                    {entry.action.replace(/_/g, ' ')}
                  </Badge>
                  <span style={{ fontSize: '13px', color: theme.textPrimary }}>
                    {entry.actor_name ?? t('req.detail.systemActor')}
                    {entry.actor_position ? ` (${entry.actor_position})` : ''}
                  </span>
                  {entry.notes && (
                    <span style={{ fontSize: '12px', color: theme.textMuted }}>{entry.notes}</span>
                  )}
                  <span style={{ fontSize: '12px', color: theme.textMuted, marginInlineStart: 'auto' }}>
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
                          ? t('req.detail.onlyTheOrganizerOrAnAdmin')
                          : hasPendingEdit
                            ? t('req.detail.thereIsAlreadyAPendingEdit')
                            : t('req.detail.clickStartEditingToProposeChanges')}
                      </div>
                    )}

                    {editDraft && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
                          <div style={{ flex: '1 1 240px' }}>
                            <Input
                              label={t('req.detail.notes')}
                              value={editDraft.notes}
                              onChange={(e) => {
                                setEditDraft({ ...editDraft, notes: e.target.value })
                              }}
                            />
                          </div>
                          <div style={{ flex: '1 1 160px' }}>
                            <Select
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
                              <Select
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
                                { product_id: '', description: '', qty: 1, unit_price: 0, uom: 'unit' },
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
                      {(req.edit_requests ?? []).map((er) => {
                        // removed/edited may still be the pre-snapshot shapes
                        // (a plain id string; an edited entry with no
                        // `description`) on any edit request submitted before
                        // this detail was added — rendered below with a
                        // fallback to the bare id/field rather than crashing.
                        const parsed = JSON.parse(er.changes) as {
                          header?: Record<string, { from: unknown; to: unknown }>
                          lines?: {
                            edited?: {
                              id: string
                              field: string
                              from: unknown
                              to: unknown
                              description?: string
                            }[]
                            added?: {
                              description?: string
                              qty?: number
                              unit_price?: number
                              uom?: string
                            }[]
                            removed?: (
                              | string
                              | {
                                  id: string
                                  description?: string
                                  qty?: number
                                  unit_price?: number
                                  uom?: string
                                }
                            )[]
                          }
                        }
                        const headerChanges = Object.entries(parsed.header ?? {})
                        const editedLines = parsed.lines?.edited ?? []
                        const addedLines = parsed.lines?.added ?? []
                        const removedLines = parsed.lines?.removed ?? []
                        const totalChanges =
                          headerChanges.length +
                          editedLines.length +
                          addedLines.length +
                          removedLines.length
                        return (
                          <div
                            key={er.id}
                            style={{ padding: '14px 0', borderTop: `1px solid ${theme.border}` }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                gap: '10px',
                                alignItems: 'center',
                                marginBottom: '8px',
                                flexWrap: 'wrap',
                              }}
                            >
                              <Badge
                                variant={
                                  er.status === 'approved'
                                    ? 'success'
                                    : er.status === 'rejected'
                                      ? 'danger'
                                      : 'warning'
                                }
                              >
                                {er.status}
                              </Badge>
                              <span style={{ fontSize: '13px', color: theme.textPrimary }}>
                                {er.requested_by_email}
                              </span>
                              <span style={{ fontSize: '12px', color: theme.textMuted }}>
                                {er.created_at.slice(0, 16).replace('T', ' ')}
                              </span>
                              <span
                                style={{
                                  fontSize: '12px',
                                  color: theme.textMuted,
                                  marginInlineStart: 'auto',
                                }}
                              >
                                {t('req.detail.changesCount', { count: totalChanges })}
                              </span>
                            </div>

                            <div
                              style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '4px',
                                fontSize: '12px',
                                marginBottom: '10px',
                              }}
                            >
                              {headerChanges.map(([field, diff]) => (
                                <div
                                  key={field}
                                  style={{ display: 'flex', gap: '8px', alignItems: 'center' }}
                                >
                                  <span style={{ color: theme.textMuted, minWidth: '110px' }}>
                                    {field.replace(/_/g, ' ')}
                                  </span>
                                  <span
                                    style={{ color: theme.danger, textDecoration: 'line-through' }}
                                  >
                                    {String(diff.from ?? '—') || '—'}
                                  </span>
                                  <span style={{ color: theme.textMuted }}>→</span>
                                  <span style={{ color: theme.accent }}>
                                    {String(diff.to ?? '—') || '—'}
                                  </span>
                                </div>
                              ))}
                              {editedLines.map((e, i) => (
                                <div
                                  key={i}
                                  style={{ display: 'flex', gap: '8px', alignItems: 'center' }}
                                >
                                  <span style={{ color: theme.textPrimary, minWidth: '160px' }}>
                                    {e.description ?? e.id} — {e.field.replace(/_/g, ' ')}
                                  </span>
                                  <span
                                    style={{ color: theme.danger, textDecoration: 'line-through' }}
                                  >
                                    {String(e.from ?? '—')}
                                  </span>
                                  <span style={{ color: theme.textMuted }}>→</span>
                                  <span style={{ color: theme.accent }}>{String(e.to ?? '—')}</span>
                                </div>
                              ))}
                              {addedLines.map((l, i) => (
                                <div key={i} style={{ color: theme.accent }}>
                                  + {l.description ?? t('req.detail.newLine')}
                                  {l.qty != null && ` — ${t('req.detail.qtyPrefix', { qty: l.qty })}`}
                                  {l.unit_price != null && ` @ ${l.unit_price}`}
                                  {l.uom && ` ${l.uom}`}
                                </div>
                              ))}
                              {removedLines.map((r, i) => {
                                const snapshot = typeof r === 'string' ? null : r
                                return (
                                  <div key={i} style={{ color: theme.danger }}>
                                    {snapshot ? (
                                      <>
                                        − {snapshot.description || t('req.detail.aLine')}
                                        {snapshot.qty != null && ` — ${t('req.detail.qtyPrefix', { qty: snapshot.qty })}`}
                                        {snapshot.unit_price != null && ` @ ${snapshot.unit_price}`}
                                        {snapshot.uom && ` ${snapshot.uom}`}
                                      </>
                                    ) : (
                                      t('req.detail.lineRemovedNoDetail')
                                    )}
                                  </div>
                                )
                              })}
                            </div>

                            {er.request_notes && (
                              <div
                                style={{
                                  fontSize: '12px',
                                  color: theme.textMuted,
                                  fontStyle: 'italic',
                                  marginBottom: '8px',
                                }}
                              >
                                "{er.request_notes}"
                              </div>
                            )}

                            {er.status !== 'pending' && (
                              <div style={{ fontSize: '12px', color: theme.textMuted }}>
                                {t('req.detail.reviewedBy', {
                                  status: getRequisitionStatusLabel(
                                    er.status === 'approved' ? 'approved' : 'rejected',
                                  ),
                                  email: er.reviewed_by_email,
                                  date: er.reviewed_at?.slice(0, 16).replace('T', ' '),
                                })}
                                {er.review_notes && ` — "${er.review_notes}"`}
                              </div>
                            )}

                            {er.status === 'pending' && isSystemLevel && (
                              <div
                                style={{
                                  display: 'flex',
                                  gap: '8px',
                                  alignItems: 'flex-start',
                                  flexWrap: 'wrap',
                                }}
                              >
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
                                  {t('req.detail.approve')}
                                </Button>
                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                  <input
                                    value={reviewNotes[er.id] ?? ''}
                                    onChange={(e) => {
                                      setReviewNotes((p) => ({ ...p, [er.id]: e.target.value }))
                                    }}
                                    placeholder={t('req.detail.rejectionReasonRequired')}
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
                                    {t('req.detail.reject')}
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
              <div style={sectionTitle}>{t('req.detail.nextStepSubmitForInventoryCheck')}</div>
              <div style={sectionHint}>
                {t('req.detail.onceSubmittedTheOrganizerOrA')}
              </div>
              {canSubmitDraft ? (
                <Button
                  variant="primary"
                  loading={lSubmit}
                  onClick={() => void submitToInventory({ variables: { id: req.id } })}
                >
                  {t('req.detail.submitForInventoryCheck')}
                </Button>
              ) : (
                <div style={{ fontSize: '13px', color: theme.textMuted }}>
                  {t('req.detail.onlyTheOrganizerOrAnAdmin2')}
                </div>
              )}
            </Card>
          )}

          {/* ── Panel 2: inventory_check ─────────────────────────────────────── */}
          {req.status === 'inventory_check' && (
            <Card style={sectionCard}>
              <div style={sectionTitle}>{t('req.detail.nextStepConfirmStockAvailability')}</div>
              <div style={sectionHint}>
                {t('req.detail.enterTheQuantityToTakeFrom')}
              </div>
              {!canConfirmInventory ? (
                <div style={{ fontSize: '13px', color: theme.textMuted }}>
                  {t('req.detail.onlyTheOrganizerAStoreKeeper')}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {req.lines.map((l) => {
                    const isOverridden = !!productOverride[l.id]
                    const avail = isOverridden
                      ? previewByLine.get(l.id)
                      : availabilityByLine.get(l.id)
                    const qtyReserved = avail ? avail.qtyOnHand - avail.qtyAvailable : null
                    return (
                      <div
                        key={l.id}
                        style={{
                          padding: '12px',
                          borderRadius: '8px',
                          border: `1px solid ${theme.border}`,
                        }}
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
                            <div
                              style={{
                                fontSize: '13px',
                                fontWeight: 600,
                                color: theme.textPrimary,
                              }}
                            >
                              {(isOverridden ? avail?.productName : null) ??
                                l.description ??
                                l.product_name}{' '}
                              {t('req.detail.needsQty', { qty: fmtN(l.qty), uom: l.uom })}
                            </div>
                            {(isOverridden ? avail?.productNameAr : l.product_name_ar) && (
                              <div
                                dir="rtl"
                                style={{
                                  fontSize: '12px',
                                  color: theme.textMuted,
                                  textAlign: 'start',
                                }}
                              >
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
                              {isOverridden ? t('req.detail.changeSelection') : t('req.detail.wrongItemReselect')}
                            </button>
                          )}
                        </div>
                        {reselectOpenFor === l.id && (
                          <div style={{ marginBottom: '10px' }}>
                            <SearchableSelect
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
                              {t('req.detail.onHand')}{' '}
                              <strong style={{ color: theme.textPrimary }}>
                                {fmtN(avail.qtyOnHand)}
                              </strong>
                            </span>
                            <span>
                              {t('req.detail.reserved')}{' '}
                              <strong style={{ color: theme.textPrimary }}>
                                {fmtN(qtyReserved)}
                              </strong>
                            </span>
                            <span>
                              {t('req.detail.availableLabel')}{' '}
                              <strong
                                style={{ color: avail.isAvailable ? theme.success : theme.warning }}
                              >
                                {fmtN(avail.qtyAvailable)}
                              </strong>
                            </span>
                          </div>
                        ) : (
                          <div
                            style={{
                              fontSize: '12px',
                              color: theme.textMuted,
                              marginBottom: '10px',
                            }}
                          >
                            {isOverridden
                              ? t('req.detail.checkingStockForTheNewlySelected')
                              : t('req.detail.loadingStockLevels')}
                          </div>
                        )}
                        {avail &&
                          // Only locations that actually have stock of this item —
                          // matches PurchaseOrderDetail's own inventory-check card
                          // list, fed by the same byLocation shape instead of a
                          // plain dropdown built from every active stock location.
                          (avail.byLocation.length > 0 ? (
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
                                {t('req.detail.sourceLocation')}
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
                                          setInvQty((prev) => ({
                                            ...prev,
                                            [l.id]: String(Math.max(0, loc.qtyAvailable)),
                                          }))
                                        }
                                      }}
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: '12px',
                                        padding: '10px 14px',
                                        borderRadius: '8px',
                                        textAlign: 'start',
                                        cursor: 'pointer',
                                        fontFamily: 'inherit',
                                        border: `1px solid ${selected ? theme.accent : theme.border}`,
                                        background: selected ? `${theme.accent}18` : theme.bgCanvas,
                                      }}
                                    >
                                      <span
                                        style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: '10px',
                                        }}
                                      >
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
                                        {t('req.detail.availShort', { qty: fmtN(loc.qtyAvailable) })}
                                      </span>
                                    </button>
                                  )
                                })}
                              </div>
                            </div>
                          ) : (
                            <div
                              style={{
                                marginBottom: '12px',
                                fontSize: '12px',
                                color: theme.textMuted,
                              }}
                            >
                              {t('req.detail.noStockAvailableAtAnyLocation')}
                            </div>
                          ))}
                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                          <div style={{ width: '140px' }}>
                            <Input
                              label={t('req.detail.qtyFromStock')}
                              type="number"
                              min="0"
                              max={String(
                                (() => {
                                  const qtyNeeded = parseFloat(l.qty) || 0
                                  const selectedLoc = avail?.byLocation.find(
                                    (loc) => loc.locationId === invLoc[l.id],
                                  )
                                  return selectedLoc
                                    ? Math.min(qtyNeeded, selectedLoc.qtyAvailable)
                                    : qtyNeeded
                                })(),
                              )}
                              value={invQty[l.id] ?? ''}
                              onChange={(e) => {
                                const qtyNeeded = parseFloat(l.qty) || 0
                                const selectedLoc = avail?.byLocation.find(
                                  (loc) => loc.locationId === invLoc[l.id],
                                )
                                const max = selectedLoc
                                  ? Math.min(qtyNeeded, selectedLoc.qtyAvailable)
                                  : qtyNeeded
                                const v = Math.max(
                                  0,
                                  Math.min(max, parseFloat(e.target.value) || 0),
                                )
                                setInvQty((prev) => ({
                                  ...prev,
                                  [l.id]: e.target.value === '' ? '' : String(v),
                                }))
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
                      }).then(() => {
                        // Now saved for real — the draft would otherwise linger
                        // in localStorage forever for a stage this requisition
                        // has already moved past.
                        if (invCheckDraftKey) {
                          try {
                            localStorage.removeItem(invCheckDraftKey)
                          } catch {
                            // Unavailable localStorage — nothing to clean up.
                          }
                        }
                      })
                    }
                  >
                    {t('req.detail.confirmInventoryCheck')}
                  </Button>
                </div>
              )}
            </Card>
          )}

          {/* ── Panel 3: store_pricing ───────────────────────────────────────── */}
          {req.status === 'store_pricing' && (
            <Card style={sectionCard}>
              <div style={sectionTitle}>{t('req.detail.nextStepStorePricing')}</div>
              <div style={sectionHint}>
                {t('req.detail.recordWhatThisWouldCostFrom')}
              </div>
              {!canStorePrice ? (
                <div style={{ fontSize: '13px', color: theme.textMuted }}>
                  {t('req.detail.onlySomeoneHoldingTheStorePricing')}
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
                          {t('req.detail.noLinesOnThisRequisitionAre')}
                        </div>
                      )}
                      {stockLines.map((l) => {
                        const defaultPrice = l.store_price ?? l.source_average_cost ?? ''
                        return (
                          <div
                            key={l.id}
                            style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}
                          >
                            <div
                              style={{
                                flex: 1,
                                fontSize: '13px',
                                color: theme.textPrimary,
                                paddingBottom: '10px',
                              }}
                            >
                              {l.description || l.product_name}
                              {l.source_location_name && (
                                <span style={{ color: theme.textMuted }}>
                                  {' '}
                                  {t('req.detail.fromLocation', { location: l.source_location_name })}
                                  {l.source_average_cost != null &&
                                    ` ${t('req.detail.lastCost', { cost: l.source_average_cost })}`}
                                </span>
                              )}
                            </div>
                            <div style={{ width: '140px' }}>
                              <Input
                                label={t('req.detail.storePrice')}
                                type="number"
                                min="0"
                                value={storePrices[l.id] ?? String(defaultPrice)}
                                onChange={(e) => {
                                  setStorePrices((prev) => ({ ...prev, [l.id]: e.target.value }))
                                }}
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
                    </div>
                  )
                })()
              )}
            </Card>
          )}

          {/* ── Panel 4: market_pricing ──────────────────────────────────────── */}
          {req.status === 'market_pricing' && (
            <Card style={sectionCard}>
              <div style={sectionTitle}>{t('req.detail.nextStepMarketPricing')}</div>
              <div style={sectionHint}>
                {t('req.detail.enterTheCheckedVendorQuotePer')}
              </div>
              {!canMarketPrice ? (
                <div style={{ fontSize: '13px', color: theme.textMuted }}>
                  {t('req.detail.onlyAProcurementOfficerOrAn')}
                </div>
              ) : (
                (() => {
                  // Only lines still needing purchase — a line fully covered
                  // from stock was already zeroed and priced (for reference) at
                  // inventory check, and never needs a market price. Mirrors
                  // PurchaseOrderDetail's own purchaseLines filter exactly. A
                  // free-text/service line has no qty_from_stock at all, so it
                  // always shows up here.
                  const purchaseLines = req.lines.filter(
                    (l) =>
                      (parseFloat(l.qty) || 0) -
                        (parseFloat(String(l.qty_from_stock ?? '0')) || 0) >
                      0.0001,
                  )
                  return purchaseLines.length === 0 ? (
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                        alignItems: 'flex-start',
                      }}
                    >
                      <div style={{ fontSize: '13px', color: theme.textMuted }}>
                        {t('req.detail.nothingOnThisRequisitionNeedsA')}
                      </div>
                      <Button
                        variant="primary"
                        loading={lMarket}
                        onClick={() =>
                          void submitMarketPricing({ variables: { id: req.id, linePrices: [] } })
                        }
                      >
                        {t('req.detail.continueToPriceVerification')}
                      </Button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {purchaseLines.map((l) => {
                        // Falls back to the line's own previously-saved market_price —
                        // sent back here from price_verification (or later), a figure
                        // Procurement already typed in should still be here, editable,
                        // not wiped back to blank (mirrors verifiedPrices' own fallback
                        // to market_price in the price_verification panel below).
                        const raw =
                          marketPrices[l.id] ?? (l.market_price != null ? String(l.market_price) : '')
                        const missing = raw === ''
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
                            <div
                              style={{
                                fontSize: '13px',
                                fontWeight: 600,
                                color: theme.textPrimary,
                                marginBottom: '8px',
                              }}
                            >
                              {l.description || l.product_name}
                            </div>
                            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                              <div style={{ width: '140px' }}>
                                <Input
                                  label={t('req.detail.marketPrice')}
                                  type="number"
                                  min="0"
                                  value={raw}
                                  onChange={(e) => {
                                    setMarketPrices((prev) => ({ ...prev, [l.id]: e.target.value }))
                                  }}
                                  placeholder="0.00"
                                  error={
                                    missing
                                      ? t('req.detail.required')
                                      : invalid
                                        ? t('req.detail.enterAValidPrice')
                                        : undefined
                                  }
                                />
                              </div>
                              <div style={{ width: '110px' }}>
                                <Select
                                  label={t('req.detail.currency')}
                                  value={marketCurrency[l.id] ?? l.currency_code}
                                  onChange={(e) => {
                                    setMarketCurrency((prev) => ({
                                      ...prev,
                                      [l.id]: e.target.value,
                                    }))
                                  }}
                                  options={CURRENCIES.map((c) => ({ value: c, label: c }))}
                                />
                              </div>
                              <div style={{ flex: 1, minWidth: '160px' }}>
                                <Input
                                  label={t('req.detail.vendorQuoteRefOptional')}
                                  value={quoteRefs[l.id] ?? ''}
                                  onChange={(e) => {
                                    setQuoteRefs((prev) => ({ ...prev, [l.id]: e.target.value }))
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        )
                      })}
                      {(() => {
                        const allPriced = purchaseLines.every((l) => {
                          const raw =
                            marketPrices[l.id] ?? (l.market_price != null ? String(l.market_price) : '')
                          return raw !== '' && !isNaN(parseFloat(raw)) && parseFloat(raw) >= 0
                        })
                        return (
                          <>
                            {!allPriced && (
                              <div style={{ fontSize: '12px', color: theme.danger }}>
                                {t('req.detail.enterAPriceForEveryLine')}
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
                                      marketPrice: parseFloat(
                                        marketPrices[l.id] ??
                                          (l.market_price != null ? String(l.market_price) : ''),
                                      ),
                                      currencyCode: marketCurrency[l.id] ?? l.currency_code,
                                      vendorQuoteRef: quoteRefs[l.id] || undefined,
                                    })),
                                  },
                                })
                              }
                            >
                              {t('req.detail.submitToPriceVerification')}
                            </Button>
                          </>
                        )
                      })()}
                    </div>
                  )
                })()
              )}
            </Card>
          )}

          {/* ── Panel 5: price_verification ──────────────────────────────────── */}
          {req.status === 'price_verification' && (
            <Card style={sectionCard}>
              <div style={sectionTitle}>{t('req.detail.nextStepVerifyPrices')}</div>
              <div style={sectionHint}>
                {t('req.detail.crossCheckEachMarketPriceAnd')}
              </div>
              {!canVerifyPrice ? (
                <div style={{ fontSize: '13px', color: theme.textMuted }}>
                  {t('req.detail.onlyAProcurement2ndPositionHolder')}
                </div>
              ) : (
                (() => {
                  // Same purchaseLines filter as the market-pricing panel above —
                  // a line fully covered from stock never got a market price
                  // either, so there's nothing here to verify for it.
                  const purchaseLines = req.lines.filter(
                    (l) =>
                      (parseFloat(l.qty) || 0) -
                        (parseFloat(String(l.qty_from_stock ?? '0')) || 0) >
                      0.0001,
                  )
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {purchaseLines.length === 0 ? (
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '12px',
                            alignItems: 'flex-start',
                          }}
                        >
                          <div style={{ fontSize: '13px', color: theme.textMuted }}>
                            {t('req.detail.nothingOnThisRequisitionNeedsPrice')}
                          </div>
                          <Button
                            variant="primary"
                            loading={anyVerifyLoading}
                            onClick={() =>
                              void verifyPrices({ variables: { id: req.id, lineAdjustments: [] } })
                            }
                          >
                            {t('req.detail.continueToApproval')}
                          </Button>
                        </div>
                      ) : (
                        <>
                          {purchaseLines.map((l) => {
                            const raw =
                              verifiedPrices[l.id] ??
                              (l.market_price != null ? String(l.market_price) : '')
                            const missing = raw === ''
                            const invalid =
                              !missing && (isNaN(parseFloat(raw)) || parseFloat(raw) < 0)
                            return (
                              <div
                                key={l.id}
                                style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}
                              >
                                <div
                                  style={{
                                    flex: 1,
                                    fontSize: '13px',
                                    color: theme.textPrimary,
                                    paddingBottom: '10px',
                                  }}
                                >
                                  {l.description || l.product_name}
                                  <div style={{ fontSize: '11px', color: theme.textMuted }}>
                                    {t('req.detail.marketLabel')}{' '}
                                    {l.market_price != null
                                      ? `${fmtN(l.market_price)} ${l.market_price_currency}`
                                      : t('req.detail.notSet2')}
                                  </div>
                                </div>
                                <div style={{ width: '140px' }}>
                                  <Input
                                    label={t('req.detail.verifiedPrice')}
                                    type="number"
                                    min="0"
                                    value={raw}
                                    onChange={(e) => {
                                      setVerifiedPrices((prev) => ({
                                        ...prev,
                                        [l.id]: e.target.value,
                                      }))
                                    }}
                                    placeholder="0.00"
                                    error={
                                      missing
                                        ? t('req.detail.required')
                                        : invalid
                                          ? t('req.detail.enterAValidPrice')
                                          : undefined
                                    }
                                  />
                                </div>
                              </div>
                            )
                          })}
                          {(() => {
                            const allVerified = purchaseLines.every((l) => {
                              const raw =
                                verifiedPrices[l.id] ??
                                (l.market_price != null ? String(l.market_price) : '')
                              return raw !== '' && !isNaN(parseFloat(raw)) && parseFloat(raw) >= 0
                            })
                            return (
                              <>
                                {!allVerified && (
                                  <div style={{ fontSize: '12px', color: theme.danger }}>
                                    {t('req.detail.enterAVerifiedPriceForEvery')}
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
                                            verifiedPrices[l.id] ??
                                              (l.market_price != null
                                                ? String(l.market_price)
                                                : ''),
                                          ),
                                        })),
                                      },
                                    })
                                  }
                                >
                                  {t('req.detail.submitForApproval')}
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
                        <div
                          style={{
                            fontSize: '13px',
                            fontWeight: 600,
                            color: theme.textPrimary,
                            marginBottom: '10px',
                          }}
                        >
                          {t('req.detail.notReadyToApprove')}
                        </div>
                        {renderLineFlagHint()}
                        <Textarea
                          label={t('req.detail.overallReasonAutoFilledFromFlagged')}
                          value={rejectReason}
                          onChange={(e) => {
                            setRejectReason(e.target.value)
                          }}
                          placeholder={flagAutoReason || t('req.detail.enterReason')}
                          rows={2}
                        />
                        <div
                          style={{
                            fontSize: '11px',
                            fontWeight: 500,
                            color: theme.textMuted,
                            margin: '12px 0 6px',
                          }}
                        >
                          {t('req.detail.sendBackTo')}
                        </div>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          <Button
                            variant="danger"
                            disabled={!hasValidFlags}
                            loading={anyVerifyLoading}
                            onClick={() =>
                              void resetToDraft({
                                variables: {
                                  id: req.id,
                                  reason: effectiveRejectReason,
                                  lineFlags: lineFlagsPayload,
                                },
                              })
                            }
                          >
                            {t('req.detail.resetToDraft')}
                          </Button>
                          <Button
                            variant="secondary"
                            disabled={!hasValidFlags}
                            loading={anyVerifyLoading}
                            onClick={() =>
                              void rejectVerificationToInventory({
                                variables: {
                                  id: req.id,
                                  reason: effectiveRejectReason,
                                  lineFlags: lineFlagsPayload,
                                },
                              })
                            }
                          >
                            {t('req.detail.inventoryCheck')}
                          </Button>
                          <Button
                            variant="secondary"
                            disabled={!hasValidFlags}
                            loading={anyVerifyLoading}
                            onClick={() =>
                              void rejectVerificationToStore({
                                variables: {
                                  id: req.id,
                                  reason: effectiveRejectReason,
                                  lineFlags: lineFlagsPayload,
                                },
                              })
                            }
                          >
                            {t('req.detail.storePricing')}
                          </Button>
                          <Button
                            variant="secondary"
                            disabled={!hasValidFlags}
                            loading={anyVerifyLoading}
                            onClick={() =>
                              void rejectVerificationToMarket({
                                variables: {
                                  id: req.id,
                                  reason: effectiveRejectReason,
                                  lineFlags: lineFlagsPayload,
                                },
                              })
                            }
                          >
                            {t('req.detail.marketPricing')}
                          </Button>
                        </div>
                      </div>
                    </div>
                  )
                })()
              )}
            </Card>
          )}

          {/* ── Panel 6: pending_approval ─────────────────────────────────────── */}
          {req.status === 'pending_approval' && (
            <Card style={sectionCard}>
              <div style={sectionTitle}>{t('req.detail.nextStepApproveOrReject')}</div>
              <div style={sectionHint}>
                {t('req.detail.rejectingSendsThisRequisitionBackTo')}
              </div>
              {!canApprove ? (
                <div style={{ fontSize: '13px', color: theme.textMuted }}>
                  {t('req.detail.onlyTheDepartmentHeadTheAssigned')}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <Button
                    variant="primary"
                    loading={anyApprovalLoading}
                    style={{ alignSelf: 'flex-start' }}
                    onClick={() => void approve({ variables: { id: req.id } })}
                  >
                    {t('req.detail.approve')}
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
                    <div
                      style={{
                        fontSize: '13px',
                        fontWeight: 600,
                        color: theme.textPrimary,
                        marginBottom: '10px',
                      }}
                    >
                      {t('req.detail.notReadyToApprove')}
                    </div>
                    {renderLineFlagHint()}
                    <Textarea
                      label={t('req.detail.overallReasonAutoFilledFromFlagged')}
                      value={rejectReason}
                      onChange={(e) => {
                        setRejectReason(e.target.value)
                      }}
                      placeholder={flagAutoReason || t('req.detail.enterReason')}
                      rows={2}
                    />
                    <div
                      style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}
                    >
                      <Button
                        variant="danger"
                        disabled={!hasValidFlags}
                        loading={anyApprovalLoading}
                        onClick={() =>
                          void reject({
                            variables: {
                              id: req.id,
                              reason: effectiveRejectReason,
                              lineFlags: lineFlagsPayload,
                            },
                          })
                        }
                      >
                        {t('req.detail.resetToDraft')}
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={!hasValidFlags}
                        loading={anyApprovalLoading}
                        onClick={() =>
                          void rejectToInventoryCheck({
                            variables: {
                              id: req.id,
                              reason: effectiveRejectReason,
                              lineFlags: lineFlagsPayload,
                            },
                          })
                        }
                      >
                        {t('req.detail.sendBackToInventoryCheck')}
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={!hasValidFlags}
                        loading={anyApprovalLoading}
                        onClick={() =>
                          void rejectToMarketPricing({
                            variables: {
                              id: req.id,
                              reason: effectiveRejectReason,
                              lineFlags: lineFlagsPayload,
                            },
                          })
                        }
                      >
                        {t('req.detail.sendBackToMarketPricing')}
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
                {req.status === 'approved'
                  ? t('req.detail.approvedBuyingStartsNext')
                  : t('req.detail.itemsBoughtInProgress')}
              </div>
              <div
                style={{
                  fontSize: '13px',
                  color: theme.textMuted,
                  marginBottom: req.status === 'items_bought' ? '10px' : 0,
                }}
              >
                {t('req.detail.recordingPurchasesPerVendorHappensOn')}
              </div>
              {req.status === 'items_bought' && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    navigate(`/procurement/requisitions/${req.id}/items-bought`)
                  }}
                >
                  {t('req.detail.goToItemsBought')}
                </Button>
              )}
            </Card>
          )}

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
                    render: (c: ChildPO) => (
                      <span style={{ fontSize: '13px' }}>
                        {fmtN(c.total_amount)} {c.currency_code}
                      </span>
                    ),
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

          {req.status === 'sourcing' && (
            <Card style={sectionCard}>
              <div style={sectionTitle}>{t('req.detail.sourcing')}</div>
              <div style={{ fontSize: '13px', color: theme.textMuted }}>
                {t('req.detail.waitingOnEveryLineToResolve')}
              </div>
            </Card>
          )}

          {req.status === 'completed' && (
            <Card style={sectionCard}>
              <div style={sectionTitle}>{t('req.detail.completed')}</div>
              <div style={{ fontSize: '13px', color: theme.success }}>
                {t('req.detail.everyLineOnThisRequisitionHas')}
              </div>
            </Card>
          )}

          {['rejected', 'cancelled', 'deleted'].includes(req.status) && (
            <Card style={sectionCard}>
              <div style={sectionTitle}>{getRequisitionStatusLabel(req.status)}</div>
              <div style={{ fontSize: '13px', color: theme.textMuted }}>
                {t('req.detail.thisRequisitionIsNoLongerActive')}
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
