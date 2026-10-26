import { useTranslation } from 'react-i18next'
import { enumLabel } from '../../../i18n'
import React, { useState, useCallback, useRef, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation } from '@apollo/client'
import {
  PO_LIFECYCLE_QUERY,
  PO_STOCK_AVAILABILITY_QUERY,
  SUBMIT_PO_TO_INVENTORY,
  CONFIRM_PO_INVENTORY,
  APPROVE_STOCK_ISSUANCE,
  SUBMIT_PO_STORE_PRICING,
  SUBMIT_PO_MARKET_PRICING,
  SUBMIT_PO_PRICE_VERIFICATION,
  APPROVE_PO,
  REJECT_PO,
  REJECT_PO_TO_MARKET,
  REJECT_PO_VERIFICATION_TO_MARKET_PRICING,
  REJECT_PO_VERIFICATION_TO_STORE_PRICING,
  REOPEN_PO,
  CANCEL_PO,
  SEND_PO_TO_AUDIT,
  PASS_PO_AUDIT,
  FAIL_PO_AUDIT,
  SET_PO_LINE_AUDIT_STATUS,
  COMPLETE_PO,
  DELETE_PO,
  SUBMIT_PO_EDIT_REQUEST,
  APPROVE_PO_EDIT_REQUEST,
  REJECT_PO_EDIT_REQUEST,
  ADMIN_SET_PO_STATUS,
  SET_PO_PRIORITY,
  SET_PO_RECEIVER,
  SET_PO_VENDOR,
  VENDORS_QUERY,
  SET_PO_LINE_ACTUAL_PRICE,
  SET_PO_LINE_ACCOUNTING,
  MARK_PO_LINE_BOUGHT,
  FINISH_BUYING_PO,
  SET_PO_FUNDING,
  PO_LINE_COMMENTS_QUERY,
  ADD_PO_LINE_COMMENT,
  RESOLVE_PO_LINE_COMMENT,
  PO_FX_RATES_QUERY,
  ADMIN_CORRECT_PO,
  RESOLVE_LINE_FLAG,
  ADD_PO_LOG_NOTE,
  PO_RETURNS_QUERY,
} from '../../../graphql/procurement'
import { useAuthStore } from '../../../store/authStore'
import { EMPLOYEES_QUERY, ENTITY_ATTACHMENTS_QUERY } from '../../../graphql/hr'
import { ACCOUNTS_QUERY, COST_CENTERS_QUERY, ANALYTIC_ACCOUNTS_QUERY } from '../../../graphql/finance'
import { PRODUCTS_QUERY, STOCK_LOCATIONS_QUERY } from '../../../graphql/inventory'
import { COMPANY_BRANCHES_QUERY } from '../../../graphql/admin'
import { useTheme } from '../../../theme/ThemeContext'
import { usePermission } from '../../../hooks/usePermission'
import { useBreakpoint } from '../../../hooks/useBreakpoint'
import { usePagePadding } from '../../../hooks/usePagePadding'
import { useEntityChanged } from '../../../hooks/useEntityChanged'
import { useRecordLock } from '../../../hooks/useRecordLock'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { EditRequestCard } from '../../../components/procurement/EditRequestCard'
import { EntityAttachments } from '../../../components/inventory/EntityAttachments'
import { Button, StickyActionBar } from '../../../components/ui/Button'
import { StatusBar } from '../../../components/ui/StatusBar'
import { TabBar } from '../../../components/ui/TabBar'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import type { Column } from '../../../components/ui/Table'
import { Table } from '../../../components/ui/Table'
import { LineItemEditor, type LineItemField } from '../../../components/ui/LineItemEditor'
import {
  getPOStatusVariant,
  getPOStatusLabel,
  getStatusesForPO,
  PO_RETURNABLE_STATUSES,
} from '../../../lib/po-constants'
import { useToastStore } from '../../../store/toastStore'
import { api } from '../../../lib/axios'
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog'
import { Input } from '../../../components/ui/Input'
import { SearchInput } from '../../../components/ui/SearchInput'
import { ColumnsMenu } from '../../../components/ui/ColumnsMenu'
import { DensityToggle } from '../../../components/ui/DensityToggle'
import { useTableView } from '../../../hooks/useTableView'
import { Textarea } from '../../../components/ui/Textarea'
import { SearchableSelect } from '../../../components/ui/SearchableSelect'
import { buildPurchaseOrderHTML } from '../../../lib/poHtml'
import { poTotalEntries } from '../../../lib/poTotals'
import {
  TOUR_DEMO_PO_ID,
  buildTourDemoPO,
  buildTourDemoStockAvailability,
} from '../../../components/help/tourDemoPO'
import type { AccountsQuery, AccountsQueryVariables, AddPoLineCommentMutation, AddPoLineCommentMutationVariables, AddPoLogNoteMutation, AddPoLogNoteMutationVariables, AdminCorrectPoMutation, AdminCorrectPoMutationVariables, AdminSetPoStatusMutation, AdminSetPoStatusMutationVariables, AnalyticAccountsQuery, AnalyticAccountsQueryVariables, ApprovePoEditRequestMutation, ApprovePoEditRequestMutationVariables, ApprovePoMutation, ApprovePoMutationVariables, ApproveStockIssuanceMutation, ApproveStockIssuanceMutationVariables, CancelPoMutation, CancelPoMutationVariables, CompanyBranchesQuery, CompanyBranchesQueryVariables, CompletePoMutation, CompletePoMutationVariables, ConfirmPoInventoryCheckMutation, ConfirmPoInventoryCheckMutationVariables, CostCentersQuery, CostCentersQueryVariables, DeletePoMutation, DeletePoMutationVariables, EmployeesQuery, EmployeesQueryVariables, EntityAttachmentsQuery, EntityAttachmentsQueryVariables, FailPoAuditMutation, FailPoAuditMutationVariables, FinishBuyingPoMutation, FinishBuyingPoMutationVariables, MarkPoLineBoughtMutation, MarkPoLineBoughtMutationVariables, PassPoAuditMutation, PassPoAuditMutationVariables, PoFxRatesQuery, PoFxRatesQueryVariables, PoReturnsQuery, PoReturnsQueryVariables, PoStockAvailabilityQuery, PoStockAvailabilityQueryVariables, ProductsQuery, ProductsQueryVariables, PurchaseOrderLifecycleQuery, PurchaseOrderLifecycleQueryVariables, RejectPoEditRequestMutation, RejectPoEditRequestMutationVariables, RejectPoMutation, RejectPoMutationVariables, RejectPoToMarketPricingMutation, RejectPoToMarketPricingMutationVariables, RejectPoVerificationToMarketPricingMutation, RejectPoVerificationToMarketPricingMutationVariables, RejectPoVerificationToStorePricingMutation, RejectPoVerificationToStorePricingMutationVariables, ReopenPoMutation, ReopenPoMutationVariables, ResolveLineFlagMutation, ResolveLineFlagMutationVariables, ResolvePoLineCommentMutation, ResolvePoLineCommentMutationVariables, SendPoToAuditMutation, SendPoToAuditMutationVariables, SetPoFundingMutation, SetPoFundingMutationVariables, SetPoLineAccountingMutation, SetPoLineAccountingMutationVariables, SetPoLineActualPriceMutation, SetPoLineActualPriceMutationVariables, SetPoLineAuditStatusMutation, SetPoLineAuditStatusMutationVariables, SetPoPriorityMutation, SetPoPriorityMutationVariables, SetPoReceiverMutation, SetPoReceiverMutationVariables, SetPoVendorMutation, SetPoVendorMutationVariables, StockLocationsQuery, StockLocationsQueryVariables, SubmitPoEditRequestMutation, SubmitPoEditRequestMutationVariables, SubmitPoMarketPricingMutation, SubmitPoMarketPricingMutationVariables, SubmitPoPriceVerificationMutation, SubmitPoPriceVerificationMutationVariables, SubmitPoStorePricingMutation, SubmitPoStorePricingMutationVariables, SubmitPoToInventoryCheckMutation, SubmitPoToInventoryCheckMutationVariables, VendorsQuery, VendorsQueryVariables } from '../../../graphql/generated'

export interface POLine {
  id: string
  product_id: string | null
  product_name: string | null
  product_name_ar?: string | null
  description: string | null
  qty: number
  uom: string
  qty_received: number
  actual_unit_price?: number | null
  store_price?: number
  store_price_currency?: string | null
  market_price?: number
  market_price_currency?: string | null
  fx_rate_to_base?: number | null
  requested_currency_code?: string | null
  verified_price?: number
  verified_price_currency?: string | null
  in_stock?: boolean | null
  qty_from_stock: number
  source_location_id?: string | null
  source_location_name?: string | null
  source_company_id?: string | null
  source_company_name?: string | null
  source_average_cost?: number | null
  unit_price: number
  initial_unit_price?: number | null
  total: number
  audit_status?: string | null
  audit_note?: string | null
  audit_flagged_by_email?: string | null
  audit_flagged_at?: string | null
  flag_reason?: string | null
  flagged_at?: string | null
  flagged_by_name?: string | null
  flagged_from_status?: string | null
  flag_addressed_at?: string | null
  flag_resolved_at?: string | null
  flag_resolved_by_name?: string | null
  account_id?: string | null
  account_code?: string | null
  account_name?: string | null
  cost_center_id?: string | null
  cost_center_name?: string | null
  advance_settlement_id?: string | null
  is_bought?: boolean | null
}

// Store price is a reference record only — it never feeds the total. A line
// fully covered from stock is never bought from a vendor, so it contributes
// $0 (mirrors the backend: confirmPOInventoryCheck zeroes total_price the
// moment a line is fully covered, regardless of which lifecycle path it
// then takes). Otherwise, prefer line.total (total_price in the line's own
// currency) — every write path (market pricing, edit requests, admin
// correction, actual-price entry) keeps it correct, whereas market_price is
// a separate column only market pricing itself is guaranteed to refresh, so
// it can drift stale after a later price correction even though the real
// total_price/total_amount are right. Falls back to qty * market_price only
// when total is genuinely absent (e.g. a line never priced at all).
//
// Deliberately NOT converted to the PO's base currency — this backs the
// per-line Total column, which sits right next to this line's own
// Market/Unit Price and should read in that same native currency (a line
// genuinely priced in USD showing "9,276 IQD" with no visible conversion
// looks like a bug, even when the number itself is correct). The PO
// Summary's own total_amount is a separate, backend-computed, already-
// base-currency figure — that's what still safely sums lines priced in
// different currencies; this function has no part in it.
function poLineTotalNative(line: {
  qty: number | string | null | undefined
  qty_from_stock?: number | string
  market_price?: number | string | null
  unit_price?: number | string | null
  total?: number | string | null
}): number {
  const qty = parseFloat(String(line.qty ?? 0))
  const fromStock = parseFloat(String(line.qty_from_stock ?? 0))
  if (qty > 0 && fromStock >= qty) return 0
  if (line.total != null) return parseFloat(String(line.total))
  const mp = parseFloat(String(line.market_price ?? line.unit_price ?? 0))
  return qty * mp
}

export interface PO {
  id: string
  po_number: string
  status: string
  priority: string
  // G1 — set when this PO is a per-vendor child forked from a requisition;
  // its status vocabulary diverges from a legacy PO's from 'bought' onward
  // (see CHILD_PO_STATUSES in po-constants.ts).
  requisition_id?: string | null
  requisitionNumber?: string | null
  // Server-computed: true when the caller isn't the organizer, an admin, the
  // finance team (once at finance_audit+), or the position holder for this
  // PO's current stage. When true, every other field is withheld by the
  // resolver — not just hidden here — so don't rely on any field below
  // rendering meaningfully in that case.
  viewerRestricted?: boolean | null
  currency_code: string
  base_currency_code: string | null
  // NULL for a mixed-currency or line-less PO (migration 308) -- read
  // currencyTotals (via poTotalEntries) for what to display.
  total_amount: string | null
  subtotal: string | null
  currencyTotals: { currency_code: string; subtotal: string; line_count: number }[]
  vendor_id?: string | null
  vendor_name?: string | null
  analytic_account_id?: string | null
  delivery_destination?: string | null
  project_id?: string | null
  organizer_id?: string | null
  assigned_approver_id?: string | null
  store_keeper_id?: string | null
  store_pricing_id?: string | null
  procurement_officer_id?: string | null
  procurement_2nd_id?: string | null
  assigned_receiver_id?: string | null
  assigned_receiver_name?: string | null
  purpose?: string | null
  linkedProjectId?: string | null
  linkedMoId?: string | null
  projectCode?: string | null
  projectName?: string | null
  branch_id?: string | null
  branch_name?: string | null
  company_name?: string | null
  funding_source?: string | null
  funding_decided?: boolean | null
  funding_advance_id?: string | null
  funding_advance_number?: string | null
  funding_employee_name?: string | null
  assigned_buyer_user_id?: string | null
  assigned_buyer_name?: string | null
  buyerNames?: string[] | null
  callerIsBuyer?: boolean | null
  callerHasStorePricingPosition?: boolean | null
  callerHasMarketPricingPosition?: boolean | null
  callerHasStoreKeeperPosition?: boolean | null
  callerIsFinanceTeam?: boolean | null
  expected_delivery_date?: string | null
  notes?: string | null
  created_by_email?: string | null
  created_at: string
  updated_at: string
  lines: POLine[]
  receipts: {
    id: string
    receipt_number?: string | null
    status: string
    receipt_date: string | null
    location_id?: string | null
    location_name?: string | null
    received_by_email?: string | null
    received_by_name?: string | null
    received_from_name?: string | null
    location_notes?: string | null
    notes?: string | null
    created_at: string | null
    lines: {
      id?: string | null
      po_line_id: string
      description: string | null
      qty_received: number
      actual_unit_price?: number | null
    }[]
    photos: {
      id: string
      fileId: string
      label?: string | null
      category: string
      originalFilename: string
      downloadUrl?: string | null
      createdAt: string
    }[]
  }[]
  approval_log: {
    id: string
    action: string
    user_email: string | null
    notes?: string | null
    created_at: string
  }[]
  edit_requests: POEditRequest[] | null
  // True when a Daily Report logged this PO under Machinery without the
  // required live photo — see MachineryPhotoAlertNotice below.
  machineryPhotoAlert?: boolean | null
}

interface LineComment {
  id: string
  comment: string
  created_by_name: string
  created_at: string
  flag?: 'info' | 'warning' | 'dispute' | null
  resolved: boolean
  resolved_at?: string | null
}

interface POEditRequest {
  id: string
  po_id: string | null
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

// Draft shape for the system_admin-only "Admin correction" tab — mirrors
// the fields applyAdminPOCorrection (services/gateway/src/graphql/resolvers.ts)
// actually allows. No add/remove lines/receipts — that stays on the
// two-step po_edit_requests flow (EditDraft below).
interface AdminCorrectionDraft {
  vendor_id: string
  currency_code: string
  analytic_account_id: string
  notes: string
  expected_delivery_date: string
  priority: string
  assigned_receiver_id: string
  branch_id: string
  delivery_destination: string
  lines: {
    id: string
    product_id: string
    description: string
    qty: number
    unit_price: number
    uom: string
    source_location_id: string
  }[]
  receipts: {
    id: string
    warehouse_location_id: string
    location_notes: string
    received_by_name: string
    received_from_name: string
    notes: string
  }[]
  receiptLines: {
    id: string
    qty_received: number
    actual_unit_price: number
  }[]
}

interface EditDraft {
  notes: string
  expected_delivery_date: string
  lines: {
    id: string
    description: string
    qty: number
    unit_price: number
    currency_code: string
    store_price: number
    actual_unit_price: number
    uom: string
    _removed?: boolean
  }[]
  linesAdded: { product_id: string; description: string; qty: number; unit_price: number; uom: string }[]
}

type Tab = 'lines' | 'receipts' | 'returns' | 'approval_log' | 'changes' | 'admin_correction'

// Statuses where adminCorrectPO is available — mirrors
// ADMIN_CORRECTION_PO_STATUSES in services/gateway/src/graphql/resolvers.ts.
const ADMIN_CORRECTION_PO_STATUSES = [
  'approved',
  'ready_to_issue',
  'items_bought',
  'goods_received',
  'finance_audit',
]

// Same fixed enterprise accent palette used on the redesigned Record Receipt
// and New Purchase Order pages — kept as literal values (not theme tokens)
// so all three read as one visual system regardless of active theme.
const BRAND_BLUE = '#2563EB'
const BRAND_GREEN = '#16A34A'
// Bold-fill treatment for a stage's primary CTA in the Next Step panel —
// matches the header/footer submit buttons on the Record Receipt and New
// Purchase Order pages, instead of Button's default soft-tint primary look.
const PRIMARY_CTA_STYLE: React.CSSProperties = {
  background: BRAND_BLUE,
  border: `1px solid ${BRAND_BLUE}`,
  color: '#ffffff',
  fontWeight: 600,
}

function IconBarChart({ size = 17 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  )
}

function IconArrowRight({ size = 17 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  )
}

function IconCheckCircle({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  )
}

function IconDocument({ size = 17 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="16" y2="17" />
      <line x1="8" y1="9" x2="10" y2="9" />
    </svg>
  )
}

function IconBox({ size = 17 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  )
}

// Recording a draft receipt doesn't change the PO's status — only
// confirming one does — so nothing else on this page signals a draft
// already exists, and a user unsure whether their first "Record Receipt"
// click worked just does it again. Surfaced right above the button so
// they see the existing draft(s) before re-submitting.
function DraftReceiptsNotice({
  po,
  navigate,
  theme,
}: {
  po: PO
  navigate: ReturnType<typeof useNavigate>
  theme: ReturnType<typeof useTheme>['theme']
}) {
  const { t } = useTranslation()
  const draftReceipts = po.receipts.filter((r) => r.status === 'draft')
  if (draftReceipts.length === 0) return null
  return (
    <div
      style={{
        padding: '10px 14px',
        borderRadius: '8px',
        background: '#fffbeb',
        border: '1px solid #fde68a',
        fontSize: '13px',
        color: '#92400e',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
      }}
    >
      <div>
        {t('po.detail.draftReceiptsExist', { count: draftReceipts.length })}
      </div>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        {draftReceipts.map((r) => (
          <button
            key={r.id}
            onClick={() => {
              navigate(`/inventory/store-in/${r.id}`)
            }}
            style={{
              background: 'none',
              border: `1px solid ${theme.warning}`,
              borderRadius: '6px',
              padding: '3px 8px',
              fontSize: '12px',
              fontWeight: 600,
              color: '#92400e',
              cursor: 'pointer',
            }}
          >
            {t('po.detail.openReceipt', { ref: r.receipt_number ?? r.id.slice(0, 8) })}
          </button>
        ))}
      </div>
    </div>
  )
}

// A Daily Report logged this PO under Machinery without the required live
// photo (see project_daily_report_machinery). Advisory only — it doesn't
// block the PO's workflow, just flags it here so management notices; the
// same gap already triggered a notification to dept heads/admins when it
// was logged. Clears itself once every gap is backfilled with a photo.
function MachineryPhotoAlertNotice({ po }: { po: PO }) {
  const { t } = useTranslation()
  if (!po.machineryPhotoAlert) return null
  return (
    <div
      style={{
        padding: '10px 14px',
        borderRadius: '8px',
        background: '#fef2f2',
        border: '1px solid #fecaca',
        fontSize: '13px',
        color: '#991b1b',
        fontWeight: 600,
        marginBottom: '12px',
      }}
    >
      {t('po.detail.aDailyReportLoggedMachineryAgainst')}
    </div>
  )
}

export default function PurchaseOrderDetail() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  // Interactive PO tour: a reserved id renders a synthetic, client-only demo
  // PO instead of querying the real backend — see tourDemoPO.ts.
  const [searchParams] = useSearchParams()
  const isTourDemo = id === TOUR_DEMO_PO_ID
  const tourStatus = searchParams.get('tourStatus') ?? 'inventory_check'
  const { theme } = useTheme()
  const lock = useRecordLock('purchase_order', id)
  const { isPhone } = useBreakpoint()
  const pagePadding = usePagePadding()
  const [activeTab, setActiveTab] = useState<Tab>('lines')
  const [rejectReason, setRejectReason] = useState('')
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [lbScale, setLbScale] = useState(1)
  const [lbOffset, setLbOffset] = useState({ x: 0, y: 0 })
  const lbDrag = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null)
  const lbOverlayRef = useRef<HTMLDivElement>(null)

  const openLightbox = useCallback((url: string) => {
    setLightboxUrl(url)
    setLbScale(1)
    setLbOffset({ x: 0, y: 0 })
  }, [])

  const closeLightbox = useCallback(() => {
    setLightboxUrl(null)
    setLbScale(1)
    setLbOffset({ x: 0, y: 0 })
  }, [])

  function renderPhotoThumb(ph: {
    id: string
    label?: string | null
    originalFilename: string
    downloadUrl?: string | null
  }) {
    return (
      <div key={ph.id}>
        {ph.downloadUrl ? (
          <div
            onClick={() => {
              if (ph.downloadUrl) openLightbox(ph.downloadUrl)
            }}
            style={{
              cursor: 'zoom-in',
              borderRadius: '8px',
              overflow: 'hidden',
              border: `1px solid ${theme.border}`,
              boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
              width: '180px',
            }}
          >
            <img
              src={ph.downloadUrl}
              alt={ph.label ?? ph.originalFilename}
              style={{
                width: '180px',
                height: '130px',
                objectFit: 'cover',
                display: 'block',
              }}
            />
            {ph.label && (
              <div
                style={{
                  padding: '6px 8px',
                  fontSize: '11px',
                  color: theme.textSecondary,
                  background: theme.bgSurface,
                  borderTop: `1px solid ${theme.border}`,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {ph.label}
              </div>
            )}
          </div>
        ) : (
          <div
            style={{
              width: '180px',
              height: '130px',
              borderRadius: '8px',
              border: `1px solid ${theme.border}`,
              background: theme.bgSurface,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '11px',
              color: theme.textMuted,
              padding: '8px',
              textAlign: 'center',
            }}
          >
            {ph.originalFilename}
          </div>
        )}
      </div>
    )
  }

  // Non-passive wheel listener so preventDefault() actually works
  useEffect(() => {
    const el = lbOverlayRef.current
    if (!el || !lightboxUrl) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      setLbScale((s) => Math.min(8, Math.max(0.5, s - e.deltaY * 0.001)))
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => {
      el.removeEventListener('wheel', handler)
    }
  }, [lightboxUrl])

  const onLbMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      lbDrag.current = { startX: e.clientX, startY: e.clientY, ox: lbOffset.x, oy: lbOffset.y }
    },
    [lbOffset],
  )

  const onLbMouseMove = useCallback((e: React.MouseEvent) => {
    if (!lbDrag.current) return
    setLbOffset({
      x: lbDrag.current.ox + e.clientX - lbDrag.current.startX,
      y: lbDrag.current.oy + e.clientY - lbDrag.current.startY,
    })
  }, [])

  const onLbMouseUp = useCallback(() => {
    lbDrag.current = null
  }, [])
  const [lineStockQtys, setLineStockQtys] = useState<Record<string, number>>({})
  const [storePrices, setStorePrices] = useState<
    Record<string, { price: string; currency: string }>
  >({})
  const [marketPrices, setMarketPrices] = useState<
    Record<string, { price: string; currency: string; quoteRef: string }>
  >({})
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null)
  const [adminCorrectionDraft, setAdminCorrectionDraft] = useState<AdminCorrectionDraft | null>(
    null,
  )
  const [adminCorrectionReason, setAdminCorrectionReason] = useState('')
  const [adminCorrectionConfirming, setAdminCorrectionConfirming] = useState(false)
  const [editRequestNotes, setEditRequestNotes] = useState('')

  // Separate from the admin-correction-only products query elsewhere on this
  // page — a line can be added to an edit request from any status, not just
  // while the admin correction tab is open, so this one is skipped on
  // whether an edit is actually in progress instead.
  const { data: editProductsData } = useQuery<ProductsQuery, ProductsQueryVariables>(PRODUCTS_QUERY, {
    variables: { includeCentralWarehouse: true },
    skip: !editDraft,
  })
  const editProducts: { id: string; sku: string; name: string; name_ar?: string | null; uom: string }[] =
    (editProductsData?.products ?? []).filter((x): x is NonNullable<typeof x> => x !== null)
  const editProductOptions = [
    { value: '', label: t('po.detail.customItemNoCatalogLink') },
    ...editProducts.map((p) => ({
      value: p.id,
      label: p.name,
      sublabel: p.sku,
      keywords: p.name_ar ?? undefined,
    })),
  ]
  const [adminPoStatus, setAdminPoStatus] = useState('')
  // The Lines table's view: the columns this person chose to show and their row spacing are
  // remembered in this browser (per user, across purchase orders); the text filter is not, and
  // starts empty on every purchase order.
  const linesView = useTableView('po-lines')
  const [lineFilter, setLineFilter] = useState('')
  useEffect(() => {
    setLineFilter('')
  }, [id])
  const [showActionsPanel, setShowActionsPanel] = useState(false)
  const [confirmDeletePO, setConfirmDeletePO] = useState(false)
  const [lineComments, setLineComments] = useState<Record<string, LineComment[]>>({})
  const [commentModal, setCommentModal] = useState<{ lineId: string; description: string } | null>(
    null,
  )
  // Per-line flags for approval review — key=lineId, value=note text
  const [lineFlagNotes, setLineFlagNotes] = useState<Record<string, string>>({})

  const flaggedLineIds = Object.keys(lineFlagNotes)
  const hasFlaggedLines = flaggedLineIds.length > 0

  function flagLine(lineId: string) {
    setLineFlagNotes((prev) => ({ ...prev, [lineId]: prev[lineId] ?? '' }))
  }
  function clearFlag(lineId: string) {
    setLineFlagNotes((prev) => {
      const n = { ...prev }
      Reflect.deleteProperty(n, lineId)
      return n
    })
  }
  function setFlagNote(lineId: string, note: string) {
    setLineFlagNotes((prev) => ({ ...prev, [lineId]: note }))
  }
  const [newComment, setNewComment] = useState('')
  const [newFlag, setNewFlag] = useState<'' | 'info' | 'warning' | 'dispute'>('')
  const [addingComment, setAddingComment] = useState(false)
  const [resolvingId, setResolvingId] = useState<string | null>(null)
  const [showPrintModal, setShowPrintModal] = useState(false)
  const [printWithNotes, setPrintWithNotes] = useState(false)
  const printIframeRef = useRef<HTMLIFrameElement>(null)
  const [flaggingLines, setFlaggingLines] = useState<Record<string, string>>({})
  const [actualPrices, setActualPrices] = useState<Record<string, string>>({})
  const [actualPriceStatus, setActualPriceStatus] = useState<
    Record<string, 'saving' | 'saved' | undefined>
  >({})
  // Once every line is checked off in the "items_bought" checklist, it
  // collapses to just the Record Receipt button — this lets it expand back
  // for a correction (e.g. unchecking a line, fixing a price) without
  // leaving the page.
  const [boughtChecklistExpanded, setBoughtChecklistExpanded] = useState(false)

  // Funding decision picker — shown once a PO reaches 'invoiced' with
  // funding_decided still false (see setPOFunding). Mirrors what used to be
  // on the PO creation form, just moved here so Finance decides once the
  // real cost is known instead of the requester guessing up front.
  const [fundingChoice, setFundingChoice] = useState<'vendor_ap' | 'employee_advance' | ''>('')
  const [fundingEmployeeId, setFundingEmployeeId] = useState('')
  const [fundingAdvanceId, setFundingAdvanceId] = useState('')
  const [fundingAdvances, setFundingAdvances] = useState<
    {
      id: string
      advance_number: string
      outstanding_amount: number
      currency_code: string
      status: string
    }[]
  >([])
  useEffect(() => {
    // Reset on every employee change, not just when cleared — otherwise a
    // previously-picked advance for a different employee survives the
    // switch (invisible in the dropdown, but still submitted).
    setFundingAdvanceId('')
    if (!fundingEmployeeId) {
      setFundingAdvances([])
      return
    }
    let cancelled = false
    void api
      .get<
        {
          id: string
          advance_number: string
          outstanding_amount: number
          currency_code: string
          status: string
        }[]
      >('/finance/advances', { params: { employee_id: fundingEmployeeId } })
      .then((res) => {
        if (cancelled) return
        const settleable = res.data.filter((a) =>
          ['approved', 'partially_settled'].includes(a.status),
        )
        setFundingAdvances(settleable)
        if (settleable.length === 1) {
          setFundingAdvanceId((prev) => prev || settleable[0].id)
        }
      })
      .catch(() => {
        /* handled */
      })
    return () => {
      cancelled = true
    }
  }, [fundingEmployeeId])

  const addToast = useToastStore((s) => s.addToast)
  const { isSystemLevel, can } = usePermission()
  const currentUserId = useAuthStore((s) => s.user?.id)
  const currentUserRole = useAuthStore((s) => s.user?.role)
  const currentCompanyId = useAuthStore((s) => s.user?.companyId ?? '')
  const [apInvoice, setApInvoice] = useState<
    { id: string; invoice_number: string; status: string } | null | undefined
  >(undefined)
  // Vendor returns on this PO (Returns tab). The REST route this used to call
  // went away with services/procurement; poReturns is its GraphQL replacement.
  const { data: poReturnsData } = useQuery<PoReturnsQuery, PoReturnsQueryVariables>(PO_RETURNS_QUERY, {
    variables: { poId: id ?? '' },
    skip: !id,
    fetchPolicy: 'cache-and-network',
  })
  const poReturns = poReturnsData?.poReturns ?? []

  interface RawComment {
    id: string
    po_line_id: string
    comment: string
    created_by_name: string
    created_at: string
    flag?: string | null
    resolved: boolean
    resolved_at?: string | null
  }
  const { data: lineCommentsData, refetch: refetchLineComments } = useQuery<{
    poLineComments: RawComment[]
  }>(PO_LINE_COMMENTS_QUERY, {
    variables: { poId: id },
    skip: !id || isTourDemo,
    fetchPolicy: 'cache-and-network',
  })
  const fetchLineComments = React.useCallback(() => {
    void refetchLineComments()
  }, [refetchLineComments])

  useEffect(() => {
    const grouped: Record<string, LineComment[]> = {}
    for (const c of lineCommentsData?.poLineComments ?? []) {
      if (!grouped[c.po_line_id]) grouped[c.po_line_id] = []
      grouped[c.po_line_id].push({
        id: c.id,
        comment: c.comment,
        created_by_name: c.created_by_name,
        created_at: c.created_at,
        flag: (c.flag as LineComment['flag']) ?? null,
        resolved: c.resolved,
        resolved_at: c.resolved_at,
      })
    }
    setLineComments(grouped)
  }, [lineCommentsData])

  const { data, loading, refetch } = useQuery<PurchaseOrderLifecycleQuery, PurchaseOrderLifecycleQueryVariables>(PO_LIFECYCLE_QUERY, {
    variables: { id: id ?? '' },
    skip: isTourDemo,
    fetchPolicy: 'cache-and-network',
  })
  useEntityChanged('purchase_order', () => void refetch())
  // The real query returns several line fields (qty, prices, totals) as
  // decimal strings — this file's arithmetic throughout assumes real
  // numbers (POLine's own long-standing type), so normalize once here
  // rather than pushing string-handling into every one of its ~30+ usage
  // sites across this file.
  const po: PO | undefined = isTourDemo
    ? buildTourDemoPO(tourStatus)
    : data?.purchaseOrder
      ? {
          ...data.purchaseOrder,
          lines: (data.purchaseOrder.lines ?? []).map((l) => ({
            ...l,
            qty: parseFloat(l.qty) || 0,
            qty_received: parseFloat(l.qty_received ?? '0') || 0,
            actual_unit_price: l.actual_unit_price != null ? parseFloat(l.actual_unit_price) : null,
            store_price: l.store_price != null ? parseFloat(l.store_price) : undefined,
            market_price: l.market_price != null ? parseFloat(l.market_price) : undefined,
            verified_price: l.verified_price != null ? parseFloat(l.verified_price) : undefined,
            qty_from_stock: parseFloat(l.qty_from_stock ?? '0') || 0,
            unit_price: parseFloat(l.unit_price) || 0,
            initial_unit_price: l.initial_unit_price != null ? parseFloat(l.initial_unit_price) : null,
            total: parseFloat(l.total) || 0,
            uom: l.uom ?? '',
          })),
          approval_log: data.purchaseOrder.approval_log ?? [],
          receipts: (data.purchaseOrder.receipts ?? []).map((r) => ({
            ...r,
            lines: r.lines.map((rl) => ({
              ...rl,
              qty_received: parseFloat(rl.qty_received) || 0,
              actual_unit_price: rl.actual_unit_price != null ? parseFloat(rl.actual_unit_price) : null,
            })),
          })),
        }
      : undefined
  const showAdminCorrectionTab =
    currentUserRole === 'system_admin' && !!po && ADMIN_CORRECTION_PO_STATUSES.includes(po.status)

  // Derived rejection reason — built from per-line flag notes when approving
  const flagAutoReason = po
    ? flaggedLineIds
        .map((id) => {
          const line = po.lines.find((l) => l.id === id)
          const name = line?.description || line?.product_name || 'Unknown item'
          const note = lineFlagNotes[id]
          return note.trim() ? `• ${name}: ${note.trim()}` : `• ${name}: flagged for review`
        })
        .join('\n')
    : ''
  const effectiveRejectReason = rejectReason || flagAutoReason
  // Migration 279 — rejecting/sending back now requires at least one flagged
  // line with its own non-empty reason (mirrors RequisitionDetail); typing
  // only the overall reason box is no longer sufficient.
  const hasValidFlags =
    flaggedLineIds.length > 0 && flaggedLineIds.every((lid) => (lineFlagNotes[lid] ?? '').trim())
  const lineFlagsPayload = flaggedLineIds.map((lid) => ({
    lineId: lid,
    reason: (lineFlagNotes[lid] ?? '').trim(),
  }))

  useEffect(() => {
    if (!id || isTourDemo || po?.viewerRestricted) return
    interface APInv {
      id: string
      invoice_number: string
      status: string
    }
    api
      .get<{ items: APInv[] }>('/finance/vendor-invoices', { params: { po_id: id, limit: 1 } })
      .then(async (r) => {
        const byPoId = r.data.items[0] ?? null
        if (byPoId) {
          setApInvoice(byPoId)
          return
        }
        // Fallback: workflow-imported POs have duplicate UUIDs per company.
        if (po?.po_number) {
          const autoNum = 'INV-' + po.po_number.replace(/^PO-/i, '')
          const r2 = await api.get<{ items: APInv[] }>('/finance/vendor-invoices', {
            params: { invoice_number: autoNum, cross_company: 'true', limit: 1 },
          })
          setApInvoice(r2.data.items[0] ?? null)
        } else {
          setApInvoice(null)
        }
      })
      .catch(() => {
        setApInvoice(null)
      })
  }, [id, po?.po_number])

  const { data: stockData } = useQuery<PoStockAvailabilityQuery, PoStockAvailabilityQueryVariables>(PO_STOCK_AVAILABILITY_QUERY, {
    variables: { poId: id ?? '' },
    skip: po?.status !== 'inventory_check' || isTourDemo || (po.viewerRestricted ?? false),
    fetchPolicy: 'cache-and-network',
  })
  const stockAvailability: {
    lineId: string
    productId?: string | null
    productName?: string | null
    description?: string | null
    qtyRequired: number
    qtyOnHand: number
    qtyAvailable: number
    isAvailable: boolean
    byLocation: {
      companyId: string
      companyName: string
      locationId: string
      locationName: string
      qtyOnHand: number
      qtyAvailable: number
      averageCost: number | null
    }[]
  }[] = isTourDemo && po ? buildTourDemoStockAvailability(po) : (stockData?.poStockAvailability ?? [])
  const [lineSourceLocation, setLineSourceLocation] = useState<Record<string, string>>({})

  const onErr = (e: { message: string }) => {
    addToast({ type: 'error', message: e.message })
  }
  const mutOpts = {
    onCompleted: () => {
      setLineStockQtys({})
      setLineSourceLocation({})
      void refetch()
    },
    onError: onErr,
  }
  const [submitToInventory, { loading: l1 }] = useMutation<SubmitPoToInventoryCheckMutation, SubmitPoToInventoryCheckMutationVariables>(SUBMIT_PO_TO_INVENTORY, mutOpts)
  const [confirmInventory, { loading: l2 }] = useMutation<ConfirmPoInventoryCheckMutation, ConfirmPoInventoryCheckMutationVariables>(CONFIRM_PO_INVENTORY, mutOpts)
  const [approveIssuance, { loading: lIssue }] = useMutation<ApproveStockIssuanceMutation, ApproveStockIssuanceMutationVariables>(APPROVE_STOCK_ISSUANCE, mutOpts)
  const [submitStorePricing, { loading: l3 }] = useMutation<SubmitPoStorePricingMutation, SubmitPoStorePricingMutationVariables>(SUBMIT_PO_STORE_PRICING, mutOpts)
  const [submitMarketPricing, { loading: l4 }] = useMutation<SubmitPoMarketPricingMutation, SubmitPoMarketPricingMutationVariables>(SUBMIT_PO_MARKET_PRICING, mutOpts)
  const [submitPriceVerification, { loading: l5 }] = useMutation<SubmitPoPriceVerificationMutation, SubmitPoPriceVerificationMutationVariables>(
    SUBMIT_PO_PRICE_VERIFICATION,
    mutOpts,
  )
  const [approvePO, { loading: l8 }] = useMutation<ApprovePoMutation, ApprovePoMutationVariables>(APPROVE_PO, mutOpts)
  const [logNoteText, setLogNoteText] = useState('')
  const [addLogNote, { loading: addingLogNote }] = useMutation<AddPoLogNoteMutation, AddPoLogNoteMutationVariables>(ADD_PO_LOG_NOTE, {
    onCompleted: () => {
      setLogNoteText('')
      void refetch()
    },
    onError: onErr,
  })
  const [rejectPO, { loading: l6 }] = useMutation<RejectPoMutation, RejectPoMutationVariables>(REJECT_PO, {
    onCompleted: () => {
      setRejectReason('')
      setLineFlagNotes({})
      void refetch()
    },
    onError: onErr,
  })
  const [rejectToMarket, { loading: l7 }] = useMutation<RejectPoToMarketPricingMutation, RejectPoToMarketPricingMutationVariables>(REJECT_PO_TO_MARKET, {
    onCompleted: () => {
      setRejectReason('')
      setLineFlagNotes({})
      void refetch()
    },
    onError: onErr,
  })
  const [rejectVerificationToMarket, { loading: l10 }] = useMutation<RejectPoVerificationToMarketPricingMutation, RejectPoVerificationToMarketPricingMutationVariables>(
    REJECT_PO_VERIFICATION_TO_MARKET_PRICING,
    {
      onCompleted: () => {
        setRejectReason('')
        setLineFlagNotes({})
        void refetch()
      },
      onError: onErr,
    },
  )
  const [rejectVerificationToStore, { loading: l11 }] = useMutation<RejectPoVerificationToStorePricingMutation, RejectPoVerificationToStorePricingMutationVariables>(
    REJECT_PO_VERIFICATION_TO_STORE_PRICING,
    {
      onCompleted: () => {
        setRejectReason('')
        setLineFlagNotes({})
        void refetch()
      },
      onError: onErr,
    },
  )
  const [resolveLineFlag, { loading: lResolveFlag }] = useMutation<ResolveLineFlagMutation, ResolveLineFlagMutationVariables>(RESOLVE_LINE_FLAG, mutOpts)
  const [reopenPO] = useMutation<ReopenPoMutation, ReopenPoMutationVariables>(REOPEN_PO, mutOpts)
  const [cancelPO] = useMutation<CancelPoMutation, CancelPoMutationVariables>(CANCEL_PO, {
    onCompleted: () => {
      setRejectReason('')
      void refetch()
    },
    onError: onErr,
  })
  const [sendToAudit, { loading: lAudit }] = useMutation<SendPoToAuditMutation, SendPoToAuditMutationVariables>(SEND_PO_TO_AUDIT, mutOpts)
  const [passAudit, { loading: lPass }] = useMutation<PassPoAuditMutation, PassPoAuditMutationVariables>(PASS_PO_AUDIT, mutOpts)
  const [failAudit] = useMutation<FailPoAuditMutation, FailPoAuditMutationVariables>(FAIL_PO_AUDIT, {
    onCompleted: () => {
      void refetch()
    },
    onError: onErr,
  })
  const [setLineAuditStatus] = useMutation<SetPoLineAuditStatusMutation, SetPoLineAuditStatusMutationVariables>(SET_PO_LINE_AUDIT_STATUS, {
    onCompleted: () => {
      void refetch()
    },
    onError: onErr,
  })
  const [setLineAccounting] = useMutation<SetPoLineAccountingMutation, SetPoLineAccountingMutationVariables>(SET_PO_LINE_ACCOUNTING, {
    onCompleted: () => {
      void refetch()
    },
    onError: onErr,
  })
  const [markLineBought] = useMutation<MarkPoLineBoughtMutation, MarkPoLineBoughtMutationVariables>(MARK_PO_LINE_BOUGHT, {
    onCompleted: () => {
      void refetch()
    },
    onError: onErr,
  })
  const [finishBuyingPO, { loading: finishingBuying }] = useMutation<FinishBuyingPoMutation, FinishBuyingPoMutationVariables>(FINISH_BUYING_PO, {
    onCompleted: () => {
      addToast({ type: 'success', message: t('po.detail.buyingFinishedMovedToGoodsReceived') })
      void refetch()
    },
    onError: onErr,
  })
  // Whether at least one buyer receipt (vendor receipt photo/PDF) has been
  // uploaded — gates the "Finish Buying" button alongside the checklist.
  const { data: buyerReceiptData } = useQuery<EntityAttachmentsQuery, EntityAttachmentsQueryVariables>(ENTITY_ATTACHMENTS_QUERY, {
    variables: { entityType: 'purchase_order', entityId: id ?? '' },
    skip: !id || (po?.status !== 'items_bought' && po?.status !== 'bought'),
    fetchPolicy: 'cache-and-network',
  })
  const hasBuyerReceipt = (
    (buyerReceiptData?.entityAttachments as { file: { category: string } }[] | undefined) ?? []
  ).some((a) => a.file.category === 'po_receipt_document')
  const [setPOFunding, { loading: settingFunding }] = useMutation<SetPoFundingMutation, SetPoFundingMutationVariables>(SET_PO_FUNDING, {
    onCompleted: () => {
      setFundingChoice('')
      setFundingEmployeeId('')
      setFundingAdvanceId('')
      void refetch()
    },
    onError: onErr,
  })
  const [completePO, { loading: l9 }] = useMutation<CompletePoMutation, CompletePoMutationVariables>(COMPLETE_PO, {
    ...mutOpts,
    onError: (err) => {
      addToast({ type: 'error', message: err.message })
    },
  })
  const [deletePO] = useMutation<DeletePoMutation, DeletePoMutationVariables>(DELETE_PO, {
    onCompleted: () => {
      navigate('/procurement/purchase-orders')
    },
  })
  const [submitEditRequest, { loading: leR }] = useMutation<SubmitPoEditRequestMutation, SubmitPoEditRequestMutationVariables>(SUBMIT_PO_EDIT_REQUEST, {
    onCompleted: () => {
      setEditDraft(null)
      setEditRequestNotes('')
      void refetch()
    },
    onError: (e) => {
      addToast({ type: 'error', message: e.message })
    },
  })
  const [approveEditRequest, { loading: leA }] = useMutation<ApprovePoEditRequestMutation, ApprovePoEditRequestMutationVariables>(APPROVE_PO_EDIT_REQUEST, {
    onCompleted: () => {
      void refetch()
    },
    onError: (e) => {
      addToast({ type: 'error', message: e.message })
    },
  })
  const [rejectEditRequest, { loading: leJ }] = useMutation<RejectPoEditRequestMutation, RejectPoEditRequestMutationVariables>(REJECT_PO_EDIT_REQUEST, {
    onCompleted: () => {
      void refetch()
    },
    onError: (e) => {
      addToast({ type: 'error', message: e.message })
    },
  })
  const [adminSetPOStatus, { loading: adminSetting }] = useMutation<AdminSetPoStatusMutation, AdminSetPoStatusMutationVariables>(ADMIN_SET_PO_STATUS, {
    onCompleted: () => {
      setAdminPoStatus('')
      addToast({ type: 'success', message: t('po.detail.statusUpdated') })
      void refetch()
    },
    onError: (e) => {
      addToast({ type: 'error', message: e.message })
    },
  })
  const [setPriority, { loading: settingPriority }] = useMutation<SetPoPriorityMutation, SetPoPriorityMutationVariables>(SET_PO_PRIORITY, {
    onCompleted: () => {
      void refetch()
    },
    onError: (e) => {
      addToast({ type: 'error', message: e.message })
    },
  })
  const [setReceiver] = useMutation<SetPoReceiverMutation, SetPoReceiverMutationVariables>(SET_PO_RECEIVER, {
    onCompleted: () => {
      void refetch()
    },
    onError: (e) => {
      addToast({ type: 'error', message: e.message })
    },
  })
  const [setVendor] = useMutation<SetPoVendorMutation, SetPoVendorMutationVariables>(SET_PO_VENDOR, {
    onCompleted: () => {
      void refetch()
    },
    onError: (e) => {
      addToast({ type: 'error', message: e.message })
    },
  })
  const [setLineActualPrice] = useMutation<SetPoLineActualPriceMutation, SetPoLineActualPriceMutationVariables>(SET_PO_LINE_ACTUAL_PRICE, {
    onCompleted: () => {
      void refetch()
    },
    onError: (e) => {
      addToast({ type: 'error', message: e.message })
    },
  })
  const [addLineComment] = useMutation<AddPoLineCommentMutation, AddPoLineCommentMutationVariables>(ADD_PO_LINE_COMMENT)
  const [resolveLineComment] = useMutation<ResolvePoLineCommentMutation, ResolvePoLineCommentMutationVariables>(RESOLVE_PO_LINE_COMMENT)
  const [adminCorrectPO, { loading: adminCorrecting }] = useMutation<AdminCorrectPoMutation, AdminCorrectPoMutationVariables>(ADMIN_CORRECT_PO, {
    onCompleted: () => {
      addToast({ type: 'success', message: t('po.detail.correctionApplied') })
      setAdminCorrectionDraft(null)
      void refetch()
    },
    onError: (e) => {
      addToast({ type: 'error', message: e.message })
    },
  })

  const { data: employeesData } = useQuery<EmployeesQuery, EmployeesQueryVariables>(EMPLOYEES_QUERY, {
    variables: { is_active: true },
    fetchPolicy: 'cache-first',
  })
  const employees: { id: string; first_name: string; last_name: string; job_title?: string | null }[] =
    (employeesData?.employees ?? []).filter((x): x is NonNullable<typeof x> => x !== null)

  const { data: vendorsData } = useQuery<VendorsQuery, VendorsQueryVariables>(VENDORS_QUERY, {
    variables: {},
    fetchPolicy: 'cache-first',
  })
  const vendors: { id: string; name: string }[] = (vendorsData?.vendors ?? []).filter((x): x is NonNullable<typeof x> => x !== null)

  // Admin-correction-only data sources — skipped unless the tab can
  // actually be shown, since most viewers will never need them.
  const { data: analyticAccountsData } = useQuery<AnalyticAccountsQuery, AnalyticAccountsQueryVariables>(ANALYTIC_ACCOUNTS_QUERY, {
    fetchPolicy: 'cache-first',
    skip: !showAdminCorrectionTab,
  })
  const analyticAccounts: { id: string; name: string; code: string }[] =
    analyticAccountsData?.analyticAccounts ?? []
  const { data: productsData } = useQuery<ProductsQuery, ProductsQueryVariables>(PRODUCTS_QUERY, {
    // Same reasoning as RequisitionForm/PurchaseOrderForm's own line-item
    // picker — the item being corrected here can legitimately live at the
    // central warehouse company, not just this one.
    variables: { includeCentralWarehouse: true },
    fetchPolicy: 'cache-first',
    skip: !showAdminCorrectionTab,
  })
  const adminCorrectionProducts: { id: string; sku: string; name: string }[] =
    (productsData?.products ?? []).filter((x): x is NonNullable<typeof x> => x !== null)
  const { data: branchesData } = useQuery<CompanyBranchesQuery, CompanyBranchesQueryVariables>(COMPANY_BRANCHES_QUERY, {
    variables: { companyId: currentCompanyId },
    fetchPolicy: 'cache-first',
    skip: !showAdminCorrectionTab || !currentCompanyId,
  })
  const branches: { id: string; name: string }[] = branchesData?.companyBranches ?? []
  const { data: stockLocationsData } = useQuery<StockLocationsQuery, StockLocationsQueryVariables>(STOCK_LOCATIONS_QUERY, {
    variables: { isActive: true },
    fetchPolicy: 'cache-first',
    skip: !showAdminCorrectionTab,
  })
  const stockLocations: { id: string; name: string; type: string }[] =
    stockLocationsData?.stockLocations ?? []

  const { data: fxRatesData } = useQuery<PoFxRatesQuery, PoFxRatesQueryVariables>(PO_FX_RATES_QUERY, { fetchPolicy: 'cache-first' })
  const marketPricingCurrencyOptions = (() => {
    const base = fxRatesData?.poFxRates?.base_currency ?? 'IQD'
    const configured: string[] = (
      fxRatesData?.poFxRates?.rates ?? []
    ).map((r: { currency_code: string }) => r.currency_code)
    const codes = [base, ...configured.filter((c) => c !== base)]
    return codes.map((c) => ({ value: c, label: c }))
  })()

  // Needed once Finance has confirmed a funding source (see the invoiced-
  // status panel below) — before that, per-line classification never
  // renders. Applies to both employee_advance and vendor_ap: Finance
  // reviews/sets GL account and cost center per line either way, it just
  // additionally gates completion for employee_advance (no separate AP
  // invoice exists there to hang that gate off of instead).
  const needsLineAccountingOptions =
    (po?.status === 'invoiced' || po?.status === 'payment_pending') &&
    !!po.funding_decided &&
    (po.funding_source === 'employee_advance' || po.funding_source === 'vendor_ap')
  const { data: accountsData } = useQuery<AccountsQuery, AccountsQueryVariables>(ACCOUNTS_QUERY, {
    variables: { isActive: true },
    fetchPolicy: 'cache-first',
    skip: !needsLineAccountingOptions,
  })
  const { data: costCentersData } = useQuery<CostCentersQuery, CostCentersQueryVariables>(COST_CENTERS_QUERY, {
    fetchPolicy: 'cache-first',
    skip: !needsLineAccountingOptions,
  })
  const glAccountOptions: { value: string; label: string }[] = (accountsData?.accounts ?? []).filter((v): v is NonNullable<typeof v> => v !== null).map(
    (a) => ({
      value: a.id,
      label: `${a.code} — ${a.name}`,
    }),
  )
  const costCenterOptions: { value: string; label: string }[] = (
    costCentersData?.costCenters ?? []
  ).map((c: { id: string; code: string; name: string }) => ({
    value: c.id,
    label: `${c.code} — ${c.name}`,
  }))

  // Shared between the employee_advance and vendor_ap payment-pending
  // panels below — same per-line GL Account/Cost Center review either
  // way, just with a funding-source-specific intro line and a different
  // completion mechanism sitting alongside it (a direct "Mark as
  // Completed" for employee_advance; the existing AP invoice flow for
  // vendor_ap).
  function renderGlClassificationPanel(introText: string) {
    if (!po) return null
    return (
      <>
        <div
          style={{
            padding: '10px 14px',
            borderRadius: '8px',
            background: theme.accentBg,
            border: `1px solid ${theme.accent}`,
            fontSize: '12px',
            color: theme.accent,
          }}
        >
          {introText}
        </div>
        <div
          style={{
            border: `1px solid ${theme.border}`,
            borderRadius: '10px',
            overflow: 'hidden',
          }}
        >
          {po.lines.map((line, idx) => (
            <div
              key={line.id}
              style={{
                padding: '10px 12px',
                borderBottom: idx < po.lines.length - 1 ? `1px solid ${theme.border}` : 'none',
              }}
            >
              <div style={{ fontSize: '13px', color: theme.textPrimary, marginBottom: '6px' }}>
                {line.description || line.product_name || '—'}
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: '8px',
                }}
              >
                <SearchableSelect
                  label={t('po.detail.glAccount')}
                  required
                  value={line.account_id ?? ''}
                  onChange={(v) =>
                    void setLineAccounting({
                      variables: {
                        poId: po.id,
                        lineId: line.id,
                        glAccountId: v || null,
                        costCenterId: line.cost_center_id ?? null,
                      },
                    })
                  }
                  options={glAccountOptions}
                  placeholder={t('po.detail.searchGlAccounts')}
                />
                <SearchableSelect
                  label={t('po.detail.costCenter')}
                  required
                  value={line.cost_center_id ?? ''}
                  onChange={(v) =>
                    void setLineAccounting({
                      variables: {
                        poId: po.id,
                        lineId: line.id,
                        glAccountId: line.account_id ?? null,
                        costCenterId: v || null,
                      },
                    })
                  }
                  options={costCenterOptions}
                  placeholder={t('po.detail.searchCostCenters')}
                />
              </div>
            </div>
          ))}
        </div>
      </>
    )
  }

  const anyLoading =
    l1 || l2 || l3 || l4 || l5 || l6 || l7 || l8 || l9 || l10 || l11 || lIssue || lAudit || lPass

  if (loading) return <div style={{ padding: '48px', color: theme.textMuted }}>{t('po.detail.loading')}</div>
  if (!po) return <div style={{ padding: '48px', color: theme.textMuted }}>{t('po.detail.poNotFound')}</div>

  // Server-side gate — the resolver already withheld every other field, so
  // nothing past this point (lines, pricing, tabs) is safe to render.
  if (po.viewerRestricted) {
    return (
      <div style={{ ...pagePadding, maxWidth: '600px', margin: '0 auto' }}>
        <PageHeader
          title={po.po_number}
          subtitle={t('po.detail.accessRestricted')}
          backPath="/procurement/purchase-orders"
        />
        <Card style={{ padding: '32px', textAlign: 'center' }}>
          <div
            style={{ fontSize: '15px', fontWeight: 600, color: theme.textPrimary, marginBottom: '8px' }}
          >
            {t('po.detail.youDonTHaveAccessTo')}
          </div>
          <div style={{ fontSize: '13px', color: theme.textMuted }}>
            {t('po.detail.accessRestrictedBody', { status: getPOStatusLabel(po.status) })}
          </div>
        </Card>
      </div>
    )
  }

  // Both reject boxes (price_verification/pending_approval) — the actual
  // flag checkbox + reason live on each row in the Lines tab (right side),
  // not duplicated here as a second list of line names. This is just a
  // pointer + live count so the action panel still shows where things
  // stand without repeating the line names.
  const renderLineFlagHint = () => (
    <div
      style={{
        fontSize: '12px',
        color: hasFlaggedLines ? theme.accent : theme.textMuted,
        marginBottom: '12px',
      }}
    >
      {hasFlaggedLines
        ? t('po.detail.flaggedLinesBanner', { count: flaggedLineIds.length })
        : t('po.detail.checkTheLineSThatNeed')}
    </div>
  )

  const pendingEdits = (po.edit_requests ?? []).filter((r) => r.status === 'pending').length

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: 'lines', label: t('po.detail.lines') },
    { key: 'receipts', label: t('po.detail.receipts') },
    { key: 'returns', label: t('po.detail.returns'), badge: poReturns.length || undefined },
    { key: 'approval_log', label: t('po.detail.log') },
    { key: 'changes', label: t('po.detail.editRequests'), badge: pendingEdits },
    ...(showAdminCorrectionTab
      ? [{ key: 'admin_correction' as Tab, label: t('po.detail.adminCorrection') }]
      : []),
  ]

  const phoneTabLabels: Partial<Record<Tab, string>> = {
    lines: t('po.detail.lines'),
    receipts: t('po.detail.tabReceiptsShort'),
    returns: t('po.detail.tabReturnsShort'),
    approval_log: t('po.detail.log'),
    changes: t('po.detail.tabEditsShort'),
    admin_correction: t('nav.Admin'),
  }

  return (
    <div
      style={{
        ...pagePadding,
        paddingBottom: isPhone
          ? 'calc(env(safe-area-inset-bottom, 0px) + 120px)'
          : pagePadding.paddingBottom,
        margin: '0 auto',
        maxWidth: '1800px',
      }}
    >
      <MachineryPhotoAlertNotice po={po} />
      <PageHeader
        title={po.po_number}
        subtitle={`${po.vendor_name ?? t('po.detail.noVendor')} • ${t('po.detail.createdOnDate', { date: po.created_at.slice(0, 10) })}${
          po.project_id
            ? ` • ${t('po.detail.projectColon', { name: [po.projectCode, po.projectName].filter(Boolean).join(' — ') })}`
            : ''
        }${po.branch_name ? ` • ${t('po.detail.branchColon', { name: po.branch_name })}` : ''}`}
        backPath="/procurement/purchase-orders"
        actions={
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <Badge variant={getPOStatusVariant(po.status)}>{getPOStatusLabel(po.status)}</Badge>
            {po.requisitionNumber && (
              <span
                onClick={() => { navigate(`/procurement/requisitions/${po.requisition_id}`); }}
                title={t('po.detail.openTheRequisitionThisPoWas')}
                style={{
                  padding: '4px 10px',
                  borderRadius: '7px',
                  fontSize: '11px',
                  fontWeight: 700,
                  background: `${theme.accent}18`,
                  color: theme.accent,
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
              >
                {t('po.detail.forkedFrom', { ref: po.requisitionNumber })}
              </span>
            )}
            {/* Priority selector */}
            {(() => {
              const PRIORITIES = [
                {
                  key: 'low',
                  label: t('po.detail.low'),
                  color: '#6b7280',
                  activeBg: 'rgba(107,114,128,0.12)',
                  border: '#9ca3af',
                },
                {
                  key: 'high',
                  label: t('po.detail.high'),
                  color: '#d97706',
                  activeBg: 'rgba(217,119,6,0.12)',
                  border: '#f59e0b',
                },
                {
                  key: 'emergency',
                  label: t('po.detail.emergency'),
                  color: '#dc2626',
                  activeBg: 'rgba(220,38,38,0.12)',
                  border: '#ef4444',
                },
              ]
              const current = po.priority
              // Priority is only editable while still in draft — it shouldn't
              // change once inventory/pricing/approval decisions have started
              // being made around it.
              if (po.status !== 'draft') {
                const currentP = PRIORITIES.find((p) => p.key === current) ?? PRIORITIES[0]
                return (
                  <span
                    style={{
                      padding: '4px 12px',
                      borderRadius: '7px',
                      fontSize: '11px',
                      fontWeight: 700,
                      background: currentP.activeBg,
                      color: currentP.color,
                      border: `1px solid ${currentP.border}`,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {currentP.label}
                  </span>
                )
              }
              return (
                <div
                  style={{
                    display: 'flex',
                    gap: '2px',
                    background: theme.bgSurface,
                    border: `1px solid ${theme.border}`,
                    borderRadius: '7px',
                    padding: '2px',
                  }}
                >
                  {PRIORITIES.map((p) => {
                    const active = current === p.key
                    return (
                      <button
                        key={p.key}
                        disabled={settingPriority || lock.lockedByOther}
                        onClick={() => {
                          if (!active)
                            void setPriority({ variables: { id: po.id, priority: p.key } })
                        }}
                        style={{
                          padding: '3px 10px',
                          borderRadius: '5px',
                          border: 'none',
                          cursor: active ? 'default' : 'pointer',
                          fontSize: '11px',
                          fontWeight: active ? 700 : 400,
                          background: active ? p.activeBg : 'transparent',
                          color: active ? p.color : theme.textMuted,
                          outline: active ? `1px solid ${p.border}` : 'none',
                          transition: 'all 0.12s',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {p.label}
                      </button>
                    )
                  })}
                </div>
              )
            })()}
            {/* Primary contextual actions — pinned to a bottom sticky bar on
                phone instead of crowding the header row (StickyActionBar is a
                no-op passthrough on tablet+desktop). */}
            <StickyActionBar>
              {apInvoice !== undefined &&
                po.funding_source !== 'employee_advance' &&
                can('finance.ap.view') &&
                (apInvoice ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    fullWidthOnMobile
                    onClick={() => {
                      navigate(`/finance/ap/${apInvoice.id}`)
                    }}
                  >
                    {t('po.detail.viewInvoice')}
                  </Button>
                ) : can('finance.ap.edit') && (po.status === 'completed' || po.status === 'closed') ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    fullWidthOnMobile
                    onClick={() => {
                      navigate(`/finance/ap/new?po_id=${id}`)
                    }}
                  >
                    {t('po.detail.createInvoice')}
                  </Button>
                ) : null)}
              {PO_RETURNABLE_STATUSES.includes(po.status) &&
                can('procurement.po.edit', 'edit') && (
                  <Button
                    variant="secondary"
                    size="sm"
                    fullWidthOnMobile
                    onClick={() => {
                      navigate(`/procurement/purchase-orders/${id}/returns/new`)
                    }}
                  >
                    {t('po.detail.createReturn')}
                  </Button>
                )}
              <Button
                variant="secondary"
                size="sm"
                fullWidthOnMobile
                onClick={() => {
                  setPrintWithNotes(false)
                  setShowPrintModal(true)
                }}
              >
                {t('po.detail.printPo')}
              </Button>
            </StickyActionBar>
            {(po.status === 'draft' || po.status === 'inventory_check') && (
              <Button
                variant="danger"
                size="sm"
                disabled={lock.lockedByOther}
                onClick={() => {
                  setConfirmDeletePO(true)
                }}
              >
                {t('po.detail.delete')}
              </Button>
            )}
            {/* Actions dropdown — Cancel + Admin Override */}
            {(!['cancelled', 'deleted'].includes(po.status) || isSystemLevel) && (
              <div style={{ position: 'relative' }}>
                <button
                  disabled={lock.lockedByOther}
                  onClick={() => {
                    setShowActionsPanel((v) => !v)
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '5px 12px',
                    borderRadius: '7px',
                    border: `1px solid ${theme.border}`,
                    background: showActionsPanel ? theme.accent : theme.bgCanvas,
                    color: showActionsPanel ? '#fff' : theme.textPrimary,
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  {t('po.detail.actions')}
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    style={{
                      transition: 'transform 0.15s',
                      transform: showActionsPanel ? 'rotate(180deg)' : 'rotate(0deg)',
                    }}
                  >
                    <polyline
                      points="6 9 12 15 18 9"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>

                {showActionsPanel && (
                  <>
                    <div
                      onClick={() => {
                        setShowActionsPanel(false)
                      }}
                      style={{ position: 'fixed', inset: 0, zIndex: 99 }}
                    />
                    <div
                      style={{
                        position: 'absolute',
                        top: 'calc(100% + 10px)',
                        right: 0,
                        zIndex: 200,
                        width: 'min(380px, calc(100vw - 32px))',
                        background: theme.bgCanvas,
                        border: `1px solid ${theme.border}`,
                        borderRadius: '12px',
                        boxShadow: '0 12px 32px rgba(0,0,0,0.14)',
                        overflow: 'hidden',
                      }}
                    >
                      {/* header */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 16px',
                          borderBottom: `1px solid ${theme.border}`,
                          background: theme.bgSurface,
                        }}
                      >
                        <span
                          style={{
                            fontSize: '12px',
                            fontWeight: 700,
                            color: theme.textPrimary,
                            textTransform: 'uppercase',
                            letterSpacing: '0.06em',
                          }}
                        >
                          {t('po.detail.actions')}
                        </span>
                        <button
                          onClick={() => {
                            setShowActionsPanel(false)
                          }}
                          style={{
                            border: 'none',
                            background: 'none',
                            cursor: 'pointer',
                            color: theme.textMuted,
                            fontSize: '18px',
                            lineHeight: 1,
                            padding: '0 2px',
                          }}
                        >
                          ×
                        </button>
                      </div>
                      {/* Cancel */}
                      {!['cancelled', 'deleted'].includes(po.status) && (
                        <div
                          style={{
                            padding: '14px 16px',
                            borderBottom: isSystemLevel ? `1px solid ${theme.border}` : 'none',
                          }}
                        >
                          <div
                            style={{
                              fontSize: '13px',
                              fontWeight: 600,
                              color: theme.textPrimary,
                              marginBottom: '4px',
                            }}
                          >
                            {t('po.detail.cancelThisPo')}
                          </div>
                          <div
                            style={{
                              fontSize: '12px',
                              color: theme.textMuted,
                              marginBottom: '10px',
                            }}
                          >
                            {t('po.detail.thisActionCannotBeUndoneWithout')}
                          </div>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => {
                              const reason = window.prompt(t('po.detail.cancelReasonOptional')) ?? ''
                              void cancelPO({
                                variables: { id: po.id, reason: reason || undefined },
                              })
                              setShowActionsPanel(false)
                            }}
                          >
                            {t('po.detail.cancelPo')}
                          </Button>
                        </div>
                      )}
                      {/* Admin override */}
                      {isSystemLevel && (
                        <div style={{ padding: '14px 16px' }}>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              marginBottom: '10px',
                            }}
                          >
                            <svg
                              width="11"
                              height="11"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke={theme.danger}
                              strokeWidth="2.2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                            </svg>
                            <span
                              style={{
                                fontSize: '11px',
                                fontWeight: 700,
                                color: theme.danger,
                                textTransform: 'uppercase',
                                letterSpacing: '0.07em',
                              }}
                            >
                              {t('po.detail.adminOverride')}
                            </span>
                            <span
                              style={{
                                fontSize: '11px',
                                color: theme.danger,
                                opacity: 0.6,
                                marginLeft: 'auto',
                              }}
                            >
                              {t('po.detail.bypassesWorkflow')}
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <select
                              value={adminPoStatus || po.status}
                              disabled={adminSetting}
                              onChange={(e) => {
                                setAdminPoStatus(e.target.value)
                              }}
                              style={{
                                flex: 1,
                                fontSize: '13px',
                                padding: '6px 10px',
                                borderRadius: '6px',
                                border: `1px solid ${theme.dangerBorder}`,
                                background: theme.bgSurface,
                                color: theme.textPrimary,
                                cursor: 'pointer',
                                outline: 'none',
                              }}
                            >
                              {[
                                { value: 'draft', label: getPOStatusLabel('draft') },
                                { value: 'inventory_check', label: getPOStatusLabel('inventory_check') },
                                { value: 'store_pricing', label: getPOStatusLabel('store_pricing') },
                                { value: 'market_pricing', label: getPOStatusLabel('market_pricing') },
                                { value: 'price_verification', label: getPOStatusLabel('price_verification') },
                                { value: 'pending_approval', label: getPOStatusLabel('pending_approval') },
                                { value: 'approved', label: getPOStatusLabel('approved') },
                                { value: 'ready_to_issue', label: getPOStatusLabel('ready_to_issue') },
                                { value: 'items_bought', label: getPOStatusLabel('items_bought') },
                                { value: 'bought', label: getPOStatusLabel('bought') + ' (G1 child)' },
                                { value: 'goods_received', label: getPOStatusLabel('goods_received') },
                                { value: 'finance_audit', label: getPOStatusLabel('finance_audit') },
                                { value: 'finance_review', label: getPOStatusLabel('finance_review') + ' (G1 child)' },
                                { value: 'invoiced', label: getPOStatusLabel('invoiced') },
                                { value: 'payment_pending', label: getPOStatusLabel('payment_pending') + ' (G1 child)' },
                                { value: 'completed', label: getPOStatusLabel('completed') },
                                { value: 'closed', label: getPOStatusLabel('closed') + ' (G1 child)' },
                                { value: 'rejected', label: getPOStatusLabel('rejected') },
                                { value: 'cancelled', label: getPOStatusLabel('cancelled') },
                                { value: 'deleted', label: getPOStatusLabel('deleted') },
                              ].map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                            <Button
                              variant="danger"
                              size="sm"
                              disabled={!adminPoStatus || adminPoStatus === po.status}
                              loading={adminSetting}
                              onClick={() =>
                                void adminSetPOStatus({
                                  variables: { id: po.id, status: adminPoStatus },
                                }).then(() => {
                                  setShowActionsPanel(false)
                                })
                              }
                            >
                              {t('po.detail.apply')}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        }
      />

      {lock.lockedByOther && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 16px',
            marginTop: '16px',
            background: `${theme.warning}1a`,
            border: `1px solid ${theme.warning}`,
            borderRadius: '8px',
            fontSize: '13px',
            color: theme.textPrimary,
          }}
        >
          <span
            style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              background: theme.warning,
              flexShrink: 0,
            }}
          />
          <strong>{lock.lockedByName}</strong> {t('po.detail.lockedSuffix')}
        </div>
      )}

      {/* Status bar */}
      <div style={{ marginTop: '16px', marginBottom: '16px' }}>
        <StatusBar
          steps={(po.priority === 'emergency'
            ? getStatusesForPO(po).filter((s) =>
                [
                  'draft',
                  'pending_approval',
                  'approved',
                  'goods_received',
                  'finance_audit',
                  'invoiced',
                  'completed',
                  // G1 child-vocabulary counterparts.
                  'finance_review',
                  'payment_pending',
                  'closed',
                ].includes(s.key),
              )
            : getStatusesForPO(po)
          ).map((s) => ({ key: s.key, label: s.label }))}
          currentStep={po.status}
          rejectedSteps={['deleted']}
        />
      </div>

      {/* PO Summary */}
      <Card style={{ padding: '24px', marginBottom: '16px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontWeight: 600,
            fontSize: '15px',
            color: theme.textPrimary,
            marginBottom: '16px',
          }}
        >
          <span style={{ color: theme.textMuted, display: 'flex' }}>
            <IconBarChart />
          </span>
          {t('po.detail.poSummary')}
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
              label: t('po.detail.total'),
              // No-conversion breakdown — mirrors Requisition's own
              // currencyTotals (see getRequisitionCurrencyTotals /
              // fetchFullPurchaseOrderGW): one entry per currency actually
              // used by this PO's lines, computed on the backend from the
              // same total/currency_code the Lines table itself renders, so
              // it can never drift from what's on screen. Deliberately no
              // single converted figure anymore — total_amount stays on the
              // type for other consumers, but a PO with lines in more than
              // one currency has no one true "total" to blend them into.
              value:
                po.currencyTotals.length === 0 ? (
                  '—'
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    {po.currencyTotals.map((ct) => (
                      <span key={ct.currency_code} style={{ color: BRAND_GREEN }}>
                        <AmountDisplay amount={parseFloat(ct.subtotal)} currency={ct.currency_code} size="lg" />
                      </span>
                    ))}
                  </div>
                ),
            },
            { label: t('po.detail.expectedDelivery'), value: po.expected_delivery_date ?? '—' },
            { label: t('po.detail.createdBy'), value: po.created_by_email ?? '—' },
          ].map(({ label, value }) => (
            <div
              key={label}
              style={{
                padding: '14px',
                borderRadius: '10px',
                background: theme.bgCanvas,
                border: `1px solid ${theme.border}`,
                minWidth: 0,
              }}
            >
              <div style={{ fontSize: '11px', fontWeight: 500, color: theme.textMuted, marginBottom: '6px' }}>
                {label}
              </div>
              <div
                style={{
                  fontSize: '16px',
                  fontWeight: 700,
                  color: theme.textPrimary,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {value}
              </div>
            </div>
          ))}
          {/* Vendor tile — editable up through market_pricing (vendor is normally chosen
              there, per 030_po_lifecycle_redesign.sql), read-only after */}
          <div
            style={{
              padding: '14px',
              borderRadius: '10px',
              background: theme.bgCanvas,
              border: `1px solid ${theme.border}`,
              minWidth: 0,
            }}
          >
            <div style={{ fontSize: '11px', fontWeight: 500, color: theme.textMuted, marginBottom: '6px' }}>
              {t('po.detail.vendor')}
            </div>
            {['draft', 'inventory_check', 'store_pricing', 'market_pricing'].includes(po.status) ? (
              <select
                value={po.vendor_id ?? ''}
                onChange={(e) =>
                  void setVendor({ variables: { id: po.id, vendorId: e.target.value || null } })
                }
                style={{
                  width: '100%',
                  fontSize: '16px',
                  fontWeight: 700,
                  color: po.vendor_id ? theme.textPrimary : theme.textMuted,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                <option value="">{t('po.detail.notYetSelected')}</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            ) : (
              <div
                style={{
                  fontSize: '16px',
                  fontWeight: 700,
                  color: theme.textPrimary,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {po.vendor_name ?? '—'}
              </div>
            )}
          </div>
          {po.funding_source === 'employee_advance' && (
            <div
              style={{
                padding: '14px',
                borderRadius: '10px',
                background: theme.bgCanvas,
                border: `1px solid ${theme.border}`,
                minWidth: 0,
              }}
            >
              <div style={{ fontSize: '11px', fontWeight: 500, color: theme.textMuted, marginBottom: '6px' }}>
                {t('po.detail.fundedByAdvance')}
              </div>
              <div
                style={{
                  fontSize: '16px',
                  fontWeight: 700,
                  color: theme.textPrimary,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {po.funding_advance_id ? (
                  <a
                    href={`/finance/advances/${po.funding_advance_id}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: BRAND_BLUE }}
                  >
                    {po.funding_advance_number ?? t('po.detail.viewAdvance')}
                  </a>
                ) : (
                  '—'
                )}
                {po.funding_employee_name ? ` · ${po.funding_employee_name}` : ''}
              </div>
            </div>
          )}
          {/* Receiver tile — editable only in draft; who receives goods shouldn't
              change once the PO is underway */}
          <div
            style={{
              padding: '14px',
              borderRadius: '10px',
              background: theme.bgCanvas,
              border: `1px solid ${theme.border}`,
              minWidth: 0,
            }}
          >
            <div style={{ fontSize: '11px', fontWeight: 500, color: theme.textMuted, marginBottom: '6px' }}>
              {t('po.detail.assignedReceiver')}
            </div>
            {po.status === 'draft' ? (
              <select
                value={po.assigned_receiver_id ?? ''}
                onChange={(e) =>
                  void setReceiver({ variables: { id: po.id, employeeId: e.target.value || null } })
                }
                style={{
                  width: '100%',
                  fontSize: '16px',
                  fontWeight: 700,
                  color: po.assigned_receiver_id ? theme.textPrimary : theme.textMuted,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                <option value="">{t('po.detail.unassigned')}</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.first_name} {e.last_name}
                    {e.job_title ? ` (${e.job_title})` : ''}
                  </option>
                ))}
              </select>
            ) : (
              <div
                style={{
                  fontSize: '16px',
                  fontWeight: 700,
                  color: theme.textPrimary,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {po.assigned_receiver_name ?? t('po.detail.unassigned')}
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Next Step (left) and Tabs/Lines (right) side by side instead of
          stacked — both are tall on their own, and the page has plenty of
          unused horizontal room on wide screens. Each column's content is
          otherwise completely untouched. */}
      <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 460px', minWidth: 0 }}>
          {/* Inline action panel — replaces the former Action tab */}
          {!['completed', 'closed', 'deleted', 'cancelled'].includes(po.status) && (
        <Card
          style={{
            marginBottom: '16px',
            padding: '24px',
            borderLeft: `4px solid ${BRAND_BLUE}`,
          }}
        >
          {/* This panel covers every PO lifecycle stage's actions in one place —
              wrapping it all in a fieldset is a single, guaranteed-complete way
              to hard-block every mutating action while someone else holds the
              edit lock, instead of hand-tagging dozens of scattered buttons. */}
          <fieldset disabled={lock.lockedByOther} style={{ border: 'none', padding: 0, margin: 0 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
                marginBottom: '16px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontWeight: 600,
                  fontSize: '15px',
                  color: theme.textPrimary,
                }}
              >
                <span style={{ color: BRAND_BLUE, display: 'flex' }}>
                  <IconArrowRight />
                </span>
                {t('po.detail.nextStep')}
              </div>
              <Badge variant={getPOStatusVariant(po.status)}>{getPOStatusLabel(po.status)}</Badge>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {po.status === 'draft' &&
                (po.priority === 'emergency' ? (
                  <>
                    <div
                      style={{
                        padding: '10px 14px',
                        borderRadius: '8px',
                        background: '#fff7ed',
                        border: '1px solid #fdba74',
                        fontSize: '13px',
                        color: '#9a3412',
                      }}
                    >
                      {t('po.detail.emergencyPoSkipsInventoryCheckStore')}
                    </div>
                    <Button
                      variant="primary"
                      loading={anyLoading}
                      icon={<IconCheckCircle size={16} />}
                      style={{
                        background: BRAND_BLUE,
                        border: `1px solid ${BRAND_BLUE}`,
                        color: '#ffffff',
                        fontWeight: 600,
                        alignSelf: 'flex-start',
                      }}
                      onClick={() =>
                        void submitToInventory({
                          variables: { id: po.id },
                        })
                      }
                    >
                      {t('po.detail.submitForApproval')}
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="primary"
                    loading={anyLoading}
                    icon={<IconCheckCircle size={16} />}
                    style={{
                      background: BRAND_BLUE,
                      border: `1px solid ${BRAND_BLUE}`,
                      color: '#ffffff',
                      fontWeight: 600,
                      alignSelf: 'flex-start',
                    }}
                    onClick={() =>
                      void submitToInventory({
                        variables: { id: po.id },
                      })
                    }
                  >
                    {t('po.detail.submitForInventoryCheck')}
                  </Button>
                ))}

              {po.status === 'inventory_check' &&
                (() => {
                  // Deliberately NOT po.organizer_id === currentUserId —
                  // only a Store Keeper (or admin) can confirm inventory
                  // check, even for your own PO.
                  const canConfirmInventory =
                    isSystemLevel || !!po.callerHasStoreKeeperPosition
                  if (!canConfirmInventory)
                    return (
                      <div
                        style={{
                          padding: '12px 14px',
                          borderRadius: '8px',
                          background: theme.bgSurface,
                          border: `1px solid ${theme.border}`,
                          fontSize: '13px',
                          color: theme.textMuted,
                        }}
                      >
                        {t('po.detail.thisPoIsWaitingOnInventory')}
                      </div>
                    )
                  return (
                    <div
                      data-tour="po-inventory-check"
                      style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
                    >
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary }}>
                          {t('po.detail.stockAvailability')}
                        </div>
                    <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '2px' }}>
                      {t('po.detail.enterTheQuantityToTakeFrom')}
                    </div>
                  </div>
                  {stockAvailability.length === 0 && (
                    <div style={{ fontSize: '13px', color: theme.textMuted }}>
                      {t('po.detail.loadingStockLevels')}
                    </div>
                  )}
                  {stockAvailability.map((avail) => {
                    const fromStock = lineStockQtys[avail.lineId] ?? 0
                    const toPurchase = Math.max(avail.qtyRequired - fromStock, 0)
                    const selectedLoc = avail.byLocation.find(
                      (l) => l.locationId === lineSourceLocation[avail.lineId],
                    )
                    const maxFromStock = selectedLoc
                      ? Math.min(avail.qtyRequired, selectedLoc.qtyAvailable)
                      : avail.qtyRequired
                    const statusColor = avail.isAvailable
                      ? '#16a34a'
                      : avail.qtyOnHand > 0
                        ? '#d97706'
                        : '#dc2626'
                    const statusLabel = avail.isAvailable
                      ? t('po.detail.inStock')
                      : avail.qtyOnHand > 0
                        ? t('po.detail.partial')
                        : t('po.detail.outOfStock')
                    return (
                      <div
                        key={avail.lineId}
                        style={{
                          padding: '16px',
                          borderRadius: '10px',
                          border: `1px solid ${theme.border}`,
                          background: theme.bgSurface,
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '10px',
                            marginBottom: '8px',
                          }}
                        >
                          <div style={{ fontSize: '14px', fontWeight: 600, color: theme.textPrimary }}>
                            {avail.description || avail.productName || '—'}
                          </div>
                          <span
                            style={{
                              padding: '2px 10px',
                              borderRadius: '999px',
                              fontSize: '11px',
                              fontWeight: 600,
                              flexShrink: 0,
                              background: `${statusColor}18`,
                              color: statusColor,
                            }}
                          >
                            {statusLabel}
                          </span>
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            gap: '16px',
                            fontSize: '12px',
                            color: theme.textMuted,
                            flexWrap: 'wrap',
                            marginBottom: '12px',
                          }}
                        >
                          <span>
                            {t('po.detail.required')}{' '}
                            <strong style={{ color: theme.textPrimary }}>
                              {avail.qtyRequired}
                            </strong>
                          </span>
                          <span>
                            {t('po.detail.onHand')}{' '}
                            <strong style={{ color: theme.textPrimary }}>
                              {avail.qtyOnHand.toFixed(2)}
                            </strong>
                          </span>
                          <span>
                            {t('po.detail.availableLabel')}{' '}
                            <strong style={{ color: theme.textPrimary }}>
                              {avail.qtyAvailable.toFixed(2)}
                            </strong>
                          </span>
                        </div>
                        {avail.byLocation.length > 0 ? (
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
                              {t('po.detail.sourceLocation')}
                            </label>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              {avail.byLocation.map((loc) => {
                                const selected = lineSourceLocation[avail.lineId] === loc.locationId
                                return (
                                  <button
                                    key={loc.locationId}
                                    type="button"
                                    onClick={() => {
                                      setLineSourceLocation((p) => ({
                                        ...p,
                                        [avail.lineId]: loc.locationId,
                                      }))
                                      if (fromStock > loc.qtyAvailable) {
                                        setLineStockQtys((p) => ({
                                          ...p,
                                          [avail.lineId]: Math.max(0, loc.qtyAvailable),
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
                                      textAlign: 'left',
                                      cursor: 'pointer',
                                      fontFamily: 'inherit',
                                      border: `1px solid ${selected ? BRAND_BLUE : theme.border}`,
                                      background: selected
                                        ? 'rgba(37,99,235,0.10)'
                                        : theme.bgCanvas,
                                    }}
                                  >
                                    <span
                                      style={{ display: 'flex', alignItems: 'center', gap: '10px' }}
                                    >
                                      <span
                                        style={{
                                          width: '14px',
                                          height: '14px',
                                          borderRadius: '50%',
                                          border: `2px solid ${selected ? BRAND_BLUE : theme.border}`,
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
                                              background: BRAND_BLUE,
                                            }}
                                          />
                                        )}
                                      </span>
                                      <span>
                                        <div
                                          style={{
                                            fontSize: '13px',
                                            fontWeight: selected ? 600 : 500,
                                            color: selected ? BRAND_BLUE : theme.textPrimary,
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
                                        color: selected ? BRAND_BLUE : theme.textSecondary,
                                        whiteSpace: 'nowrap',
                                        flexShrink: 0,
                                      }}
                                    >
                                      {t('po.detail.availShort', { qty: loc.qtyAvailable.toFixed(2) })}
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
                            {t('po.detail.noStockAvailableAtAnyLocation')}
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                          <div style={{ width: '140px' }}>
                            <Input
                              label={t('po.detail.fromStock')}
                              type="number"
                              min="0"
                              max={String(maxFromStock)}
                              value={String(fromStock)}
                              onChange={(e) => {
                                const v = Math.max(
                                  0,
                                  Math.min(maxFromStock, parseFloat(e.target.value) || 0),
                                )
                                setLineStockQtys((p) => ({ ...p, [avail.lineId]: v }))
                              }}
                            />
                          </div>
                          <div style={{ width: '140px' }}>
                            <Input label={t('po.detail.toPurchase')} value={String(toPurchase)} disabled readOnly />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  <Button
                    variant="primary"
                    style={PRIMARY_CTA_STYLE}
                    loading={anyLoading}
                    onClick={() =>
                      void confirmInventory({
                        variables: {
                          id: po.id,
                          lineStockQtys: stockAvailability.map((avail) => ({
                            lineId: avail.lineId,
                            qtyFromStock: lineStockQtys[avail.lineId] ?? 0,
                            sourceLocationId: lineSourceLocation[avail.lineId] || undefined,
                          })),
                        },
                      })
                    }
                  >
                    {t('po.detail.confirmInventoryCheck')}
                  </Button>
                    </div>
                  )
                })()}

              {po.status === 'ready_to_issue' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div
                    style={{
                      padding: '12px 14px',
                      borderRadius: '7px',
                      background: '#f0fdf4',
                      border: '1px solid #16a34a',
                      fontSize: '13px',
                      color: '#166534',
                    }}
                  >
                    {t('po.detail.allItemsConfirmedInStockApprove')}
                  </div>
                  {po.lines
                    .filter((l) => l.qty_from_stock > 0)
                    .map((line) => (
                      <div
                        key={line.id}
                        style={{
                          padding: '10px 14px',
                          borderRadius: '7px',
                          border: `1px solid ${theme.border}`,
                          background: theme.bgSurface,
                          fontSize: '13px',
                          display: 'flex',
                          justifyContent: 'space-between',
                        }}
                      >
                        <span style={{ color: theme.textPrimary }}>
                          {line.description || line.product_name || '—'}
                        </span>
                        <span style={{ color: theme.textMuted }}>
                          {t('po.detail.issueFromStock', { qty: line.qty_from_stock, uom: line.uom })}
                        </span>
                      </div>
                    ))}
                  <Button
                    variant="primary"
                    style={PRIMARY_CTA_STYLE}
                    loading={anyLoading}
                    onClick={() =>
                      void approveIssuance({
                        variables: { id: po.id },
                      })
                    }
                  >
                    {t('po.detail.approveIssueFromStock')}
                  </Button>
                </div>
              )}

              {po.status === 'store_pricing' &&
                (() => {
                  const canPriceStore = isSystemLevel || !!po.callerHasStorePricingPosition
                  if (!canPriceStore)
                    return (
                      <div
                        style={{
                          padding: '12px 14px',
                          borderRadius: '8px',
                          background: theme.bgSurface,
                          border: `1px solid ${theme.border}`,
                          fontSize: '13px',
                          color: theme.textMuted,
                        }}
                      >
                        {t('po.detail.thisPoIsWaitingOnStore')}
                      </div>
                    )
                  // Store price now values whatever quantity is being pulled from stock —
                  // including lines that are 100% stock-covered, which never reach market
                  // pricing at all, so this is the only place their total gets set.
                  const stockLines = po.lines.filter((l) => (l.qty_from_stock || 0) > 0)
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div
                        style={{
                          fontSize: '12px',
                          fontWeight: 600,
                          color: theme.textMuted,
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                        }}
                      >
                        {t('po.detail.enterStorePricesForFromStock')}
                      </div>
                      {stockLines.length > 0 && (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '10px',
                            flexWrap: 'wrap',
                            padding: '10px 14px',
                            borderRadius: '7px',
                            border: `1px solid ${theme.border}`,
                            background: theme.bgSurface,
                          }}
                        >
                          <span style={{ fontSize: '12px', color: theme.textMuted }}>
                            {t('po.detail.skipEnteringPricesStorePricesWill')}
                          </span>
                          <Button
                            variant="secondary"
                            loading={anyLoading}
                            onClick={() =>
                              void submitStorePricing({
                                variables: {
                                  id: po.id,
                                  linePrices: stockLines.map((line) => ({
                                    lineId: line.id,
                                    storePrice: line.store_price ?? line.source_average_cost ?? 0,
                                    currencyCode: line.store_price_currency ?? po.currency_code,
                                  })),
                                },
                              })
                            }
                          >
                            {t('po.detail.skipContinueToMarketPricing')}
                          </Button>
                        </div>
                      )}
                      {stockLines.length === 0 && (
                        <div
                          style={{
                            fontSize: '13px',
                            color: theme.textMuted,
                            padding: '12px 14px',
                            borderRadius: '7px',
                            border: `1px solid ${theme.border}`,
                            background: theme.bgSurface,
                          }}
                        >
                          {t('po.detail.noLinesOnThisPoAre')}
                        </div>
                      )}
                      {stockLines.map((line) => {
                        const stockQty = line.qty_from_stock || 0
                        const defaultSp = {
                          price: String(line.store_price ?? line.source_average_cost ?? ''),
                          currency: line.store_price_currency ?? po.currency_code,
                        }
                        const sp = storePrices[line.id] ?? defaultSp
                        return (
                          <div
                            key={line.id}
                            style={{
                              padding: '10px 14px',
                              borderRadius: '7px',
                              border: `1px solid ${theme.border}`,
                              background: theme.bgSurface,
                            }}
                          >
                            <div
                              style={{
                                fontSize: '13px',
                                color: theme.textPrimary,
                                marginBottom: '8px',
                              }}
                            >
                              {line.description || line.product_name || '—'}{' '}
                              <span style={{ color: theme.textMuted }}>
                                × {stockQty} {line.uom}
                              </span>
                              {line.source_location_name && (
                                <span style={{ color: theme.textMuted }}>
                                  {' '}
                                  {t('po.detail.fromSource', { company: line.source_company_name, location: line.source_location_name })}
                                  {line.source_average_cost != null &&
                                    ` ${t('po.detail.lastCost', { cost: line.source_average_cost.toFixed(2) })}`}
                                </span>
                              )}
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <input
                                type="number"
                                step="any"
                                min="0"
                                placeholder={t('po.detail.storePrice')}
                                value={sp.price}
                                onChange={(e) => {
                                  const val = e.target.value
                                  setStorePrices((p) => {
                                    const cur = p[line.id] ?? defaultSp
                                    return { ...p, [line.id]: { ...cur, price: val } }
                                  })
                                }}
                                style={{
                                  flex: 1,
                                  padding: '6px 10px',
                                  borderRadius: '6px',
                                  border: `1px solid ${theme.border}`,
                                  background: theme.bgCanvas,
                                  color: theme.textPrimary,
                                  fontSize: '13px',
                                }}
                              />
                              <SearchableSelect
                                value={sp.currency}
                                onChange={(v) => {
                                  setStorePrices((p) => {
                                    const cur = p[line.id] ?? defaultSp
                                    return { ...p, [line.id]: { ...cur, currency: v } }
                                  })
                                }}
                                options={marketPricingCurrencyOptions}
                              />
                            </div>
                          </div>
                        )
                      })}
                      <Button
                        variant="primary"
                        style={PRIMARY_CTA_STYLE}
                        loading={anyLoading}
                        onClick={() =>
                          void submitStorePricing({
                            variables: {
                              id: po.id,
                              linePrices: stockLines.map((line) => {
                                const sp = storePrices[line.id] ?? {
                                  price: String(line.store_price ?? line.source_average_cost ?? '0'),
                                  currency: line.store_price_currency ?? po.currency_code,
                                }
                                return {
                                  lineId: line.id,
                                  storePrice: parseFloat(sp.price) || 0,
                                  currencyCode: sp.currency,
                                }
                              }),
                            },
                          })
                        }
                      >
                        {stockLines.length === 0 ? t('po.detail.continueToMarketPricing') : t('po.detail.submitStorePricing')}
                      </Button>
                    </div>
                  )
                })()}

              {po.status === 'market_pricing' &&
                (() => {
                  const canPriceMarket = isSystemLevel || !!po.callerHasMarketPricingPosition
                  if (!canPriceMarket)
                    return (
                      <div
                        style={{
                          padding: '12px 14px',
                          borderRadius: '8px',
                          background: theme.bgSurface,
                          border: `1px solid ${theme.border}`,
                          fontSize: '13px',
                          color: theme.textMuted,
                        }}
                      >
                        {t('po.detail.thisPoIsWaitingOnMarket')}
                      </div>
                    )
                  const purchaseLines = po.lines.filter((l) => l.qty - (l.qty_from_stock || 0) > 0)
                  const stockCovered = po.lines.length - purchaseLines.length
                  const allPricesEntered = purchaseLines.every((l) => {
                    const mp = marketPrices[l.id] ?? { price: String(l.market_price ?? '') }
                    return parseFloat(mp.price) > 0
                  })
                  return (
                    <div
                      data-tour="po-market-pricing"
                      style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}
                    >
                      <div
                        style={{
                          fontSize: '12px',
                          fontWeight: 600,
                          color: theme.textMuted,
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                        }}
                      >
                        {t('po.detail.enterMarketPrices')}
                      </div>
                      {stockCovered > 0 && (
                        <div
                          style={{
                            fontSize: '12px',
                            color: theme.textMuted,
                            padding: '8px 12px',
                            borderRadius: '6px',
                            background: theme.bgSurface,
                            border: `1px solid ${theme.border}`,
                          }}
                        >
                          {t('po.detail.stockCovered', { count: stockCovered })}
                        </div>
                      )}
                      {purchaseLines.map((line) => {
                        const defaultMp = {
                          price: String(line.market_price ?? ''),
                          currency:
                            line.market_price_currency ??
                            line.requested_currency_code ??
                            po.currency_code,
                          quoteRef: '',
                        }
                        const mp = marketPrices[line.id] ?? defaultMp
                        const priceEmpty = !parseFloat(mp.price)
                        return (
                          <div
                            key={line.id}
                            style={{
                              padding: '10px 14px',
                              borderRadius: '7px',
                              border: `1px solid ${priceEmpty ? '#ef4444' : theme.border}`,
                              background: theme.bgSurface,
                            }}
                          >
                            <div
                              style={{
                                fontSize: '13px',
                                color: theme.textPrimary,
                                marginBottom: '8px',
                              }}
                            >
                              {line.description || line.product_name || '—'}{' '}
                              <span style={{ color: theme.textMuted }}>
                                × {line.qty} {line.uom}
                              </span>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                              <input
                                type="number"
                                step="any"
                                min="0"
                                placeholder={t('po.detail.marketPrice')}
                                value={mp.price}
                                onChange={(e) => {
                                  const val = e.target.value
                                  setMarketPrices((p) => {
                                    const cur = p[line.id] ?? defaultMp
                                    return { ...p, [line.id]: { ...cur, price: val } }
                                  })
                                }}
                                style={{
                                  flex: 1,
                                  minWidth: '120px',
                                  padding: '6px 10px',
                                  borderRadius: '6px',
                                  border: `1px solid ${priceEmpty ? '#ef4444' : theme.border}`,
                                  background: theme.bgCanvas,
                                  color: theme.textPrimary,
                                  fontSize: '13px',
                                }}
                              />
                              <SearchableSelect
                                value={mp.currency}
                                onChange={(v) => {
                                  setMarketPrices((p) => {
                                    const cur = p[line.id] ?? defaultMp
                                    return { ...p, [line.id]: { ...cur, currency: v } }
                                  })
                                }}
                                options={marketPricingCurrencyOptions}
                              />
                            </div>
                          </div>
                        )
                      })}
                      {!allPricesEntered && (
                        <div style={{ fontSize: '12px', color: '#ef4444' }}>
                          {t('po.detail.allLinesRequireAPriceGreater')}
                        </div>
                      )}
                      <Button
                        variant="primary"
                        style={PRIMARY_CTA_STYLE}
                        loading={anyLoading}
                        disabled={!allPricesEntered}
                        onClick={() =>
                          void submitMarketPricing({
                            variables: {
                              id: po.id,
                              vendorId: po.vendor_id ?? undefined,
                              linePrices: purchaseLines.map((line) => {
                                const mp = marketPrices[line.id] ?? {
                                  price: String(line.market_price ?? ''),
                                  currency:
                            line.market_price_currency ??
                            line.requested_currency_code ??
                            po.currency_code,
                                  quoteRef: '',
                                }
                                return {
                                  lineId: line.id,
                                  marketPrice: parseFloat(mp.price) || 0,
                                  currencyCode: mp.currency,
                                }
                              }),
                            },
                          })
                        }
                      >
                        {t('po.detail.submitMarketPricing')}
                      </Button>
                    </div>
                  )
                })()}

              {po.status === 'price_verification' &&
                (() => {
                  const purchaseLines = po.lines.filter((l) => l.qty - (l.qty_from_stock || 0) > 0)
                  const totalEntries = poTotalEntries(po)
                  return (
                    <div
                      data-tour="po-price-verification"
                      style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}
                    >
                      <div
                        style={{
                          fontSize: '12px',
                          fontWeight: 600,
                          color: theme.textMuted,
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                        }}
                      >
                        {t('po.detail.verifyPricesThenSubmitForApproval')}
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '10px 14px',
                          borderRadius: '7px',
                          background: theme.bgCanvas,
                          border: `1px solid ${theme.border}`,
                        }}
                      >
                        <span style={{ fontSize: '12px', color: theme.textMuted }}>{t('po.detail.total')}</span>
                        {/* One line per currency: total_amount is NULL for a mixed-currency
                            PO, and never was in the base currency once nothing is converted. */}
                        <span
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'flex-end',
                            gap: '2px',
                            fontSize: '15px',
                            fontWeight: 700,
                            color: theme.textPrimary,
                          }}
                        >
                          {totalEntries.length === 0
                            ? '—'
                            : totalEntries.map((e) => (
                                <span key={e.currencyCode}>
                                  {e.amount.toLocaleString('en-US', {
                                    minimumFractionDigits: 0,
                                    maximumFractionDigits: 2,
                                  })}{' '}
                                  {e.currencyCode}
                                </span>
                              ))}
                        </span>
                      </div>
                      {purchaseLines.map((line) => {
                        const unitPrice = parseFloat(String(line.unit_price))
                        const lineTotal = unitPrice * parseFloat(String(line.qty))
                        return (
                          <div
                            key={line.id}
                            style={{
                              padding: '10px 14px',
                              borderRadius: '7px',
                              border: `1px solid ${theme.border}`,
                              background: theme.bgSurface,
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              fontSize: '13px',
                            }}
                          >
                            <span style={{ color: theme.textPrimary }}>
                              {line.description || line.product_name || '—'}{' '}
                              <span style={{ color: theme.textMuted }}>
                                × {line.qty} {line.uom}
                              </span>
                            </span>
                            {unitPrice > 0 ? (
                              <span style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                                <span style={{ color: theme.textMuted, fontSize: '12px' }}>
                                  {unitPrice.toLocaleString('en-US', {
                                    minimumFractionDigits: 0,
                                    maximumFractionDigits: 2,
                                  })}{' '}
                                  {line.market_price_currency ?? po.currency_code} / {t('po.detail.perUnit')}
                                </span>
                                <span style={{ color: theme.textPrimary, fontWeight: 600 }}>
                                  {lineTotal.toLocaleString('en-US', {
                                    minimumFractionDigits: 0,
                                    maximumFractionDigits: 2,
                                  })}{' '}
                                  {line.market_price_currency ?? po.currency_code}
                                </span>
                              </span>
                            ) : (
                              <span style={{ color: '#ef4444', fontWeight: 600 }}>{t('po.detail.noPriceSet')}</span>
                            )}
                          </div>
                        )
                      })}
                      {purchaseLines.some((l) => !(parseFloat(String(l.unit_price)) > 0)) && (
                        <div
                          style={{
                            fontSize: '12px',
                            color: '#ef4444',
                            padding: '8px 12px',
                            borderRadius: '6px',
                            background: '#fef2f2',
                            border: '1px solid #fecaca',
                          }}
                        >
                          {t('po.detail.warningOneOrMoreLinesHave')}
                        </div>
                      )}
                      <Button
                        variant="primary"
                        style={PRIMARY_CTA_STYLE}
                        loading={anyLoading}
                        onClick={() =>
                          void submitPriceVerification({
                            variables: {
                              id: po.id,
                              lineAdjustments: [],
                            },
                          })
                        }
                      >
                        {t('po.detail.submitForApproval2')}
                      </Button>

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
                          {t('po.detail.notReadyToApprove')}
                        </div>
                        {renderLineFlagHint()}
                        <Textarea
                          label={t('po.detail.overallReasonAutoFilledFromFlagged')}
                          value={effectiveRejectReason}
                          onChange={(e) => {
                            setRejectReason(e.target.value)
                          }}
                          placeholder={t('po.detail.flagAtLeastOneLineAbove')}
                          rows={2}
                        />
                        <div style={{ fontSize: '11px', fontWeight: 500, color: theme.textMuted, margin: '12px 0 6px' }}>
                          {t('po.detail.sendBackTo')}
                        </div>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          <Button
                            variant="secondary"
                            disabled={!hasValidFlags}
                            loading={anyLoading}
                            onClick={() =>
                              void rejectVerificationToMarket({
                                variables: {
                                  id: po.id,
                                  reason: effectiveRejectReason,
                                  lineFlags: lineFlagsPayload,
                                },
                              })
                            }
                          >
                            {t('po.detail.marketPricing')}
                          </Button>
                          <Button
                            variant="secondary"
                            disabled={!hasValidFlags}
                            loading={anyLoading}
                            onClick={() =>
                              void rejectVerificationToStore({
                                variables: {
                                  id: po.id,
                                  reason: effectiveRejectReason,
                                  lineFlags: lineFlagsPayload,
                                },
                              })
                            }
                          >
                            {t('po.detail.storePricing')}
                          </Button>
                        </div>
                      </div>
                    </div>
                  )
                })()}

              {po.status === 'pending_approval' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {/* ── Approve ───────────────────────────────────────────────── */}
                  <Button
                    data-tour="po-approve-btn"
                    variant="primary"
                    style={PRIMARY_CTA_STYLE}
                    loading={anyLoading}
                    disabled={hasFlaggedLines}
                    onClick={() => void approvePO({ variables: { id: po.id } })}
                  >
                    {t('po.detail.approvePo')}
                  </Button>

                  {/* ── Reject ────────────────────────────────────────────────── */}
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
                      {t('po.detail.notReadyToApprove')}
                    </div>
                    {renderLineFlagHint()}
                    <Textarea
                      label={t('po.detail.overallReasonAutoFilledFromFlagged')}
                      value={effectiveRejectReason}
                      onChange={(e) => {
                        setRejectReason(e.target.value)
                      }}
                      placeholder={t('po.detail.flagAtLeastOneLineAbove')}
                      rows={hasFlaggedLines ? 3 : 2}
                    />
                    <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
                      <Button
                        variant="danger"
                        disabled={!hasValidFlags}
                        loading={anyLoading}
                        onClick={() =>
                          void rejectPO({
                            variables: {
                              id: po.id,
                              reason: effectiveRejectReason,
                              lineFlags: lineFlagsPayload,
                            },
                          })
                        }
                      >
                        {t('po.detail.rejectPo')}
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={!hasValidFlags}
                        loading={anyLoading}
                        onClick={() =>
                          void rejectToMarket({
                            variables: {
                              id: po.id,
                              reason: effectiveRejectReason,
                              lineFlags: lineFlagsPayload,
                            },
                          })
                        }
                      >
                        {t('po.detail.sendBackToMarketPricing')}
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {(po.status === 'approved' || po.status === 'bought') && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div
                    style={{
                      padding: '10px 14px',
                      borderRadius: '8px',
                      background: '#f0fdf4',
                      border: '1px solid #16a34a',
                      fontSize: '13px',
                      color: '#166534',
                    }}
                  >
                    {po.status === 'bought'
                      ? // G1 child PO: buying already happened at the requisition's
                        // Items Bought stage (recordLinePurchase, per vendor) — this
                        // PO's own lines were never ticked one-by-one, so there's
                        // nothing to check off here. Record the goods receipt to
                        // advance it to Goods Received.
                        t('po.detail.itemsForThisPurchaseOrderWere')
                      : t('po.detail.poIsApprovedRecordAGoods')}
                  </div>
                  <DraftReceiptsNotice po={po} navigate={navigate} theme={theme} />
                  <Button
                    data-tour="po-record-receipt-btn"
                    variant="primary"
                    style={PRIMARY_CTA_STYLE}
                    size="sm"
                    onClick={() => {
                      navigate(`/procurement/purchase-orders/${po.id}/receive`)
                    }}
                  >
                    {t('po.detail.recordReceipt')}
                  </Button>
                </div>
              )}

              {po.status === 'items_bought' &&
                (() => {
                  const isBuyer = !!po.callerIsBuyer
                  const canMarkBought = isSystemLevel || isBuyer
                  const buyerDisplayName =
                    po.buyerNames && po.buyerNames.length > 0
                      ? po.buyerNames.join(', ')
                      : (po.assigned_buyer_name ?? t('po.detail.theAssignedBuyer'))
                  const fmtN = (n: number | string) =>
                    parseFloat(String(n)).toLocaleString('en-US', {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 2,
                    })
                  const boughtCount = po.lines.filter((l) => l.is_bought).length
                  const allBought = po.lines.length > 0 && boughtCount === po.lines.length
                  const showChecklist = !allBought || boughtChecklistExpanded
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {showChecklist && (
                      <div
                        style={{
                          padding: '10px 14px',
                          borderRadius: '8px',
                          background: theme.accentBg,
                          border: `1px solid ${theme.accent}`,
                          fontSize: '12px',
                          color: theme.accent,
                        }}
                      >
                        {t('po.detail.buyerChecklistHint', { name: buyerDisplayName })}
                        {!canMarkBought && (
                          <div style={{ marginTop: '4px', opacity: 0.85 }}>
                            {t('po.detail.buyerReadOnly', { name: buyerDisplayName })}
                          </div>
                        )}
                      </div>
                      )}
                      {showChecklist && (
                      <div
                        style={{
                          border: `1px solid ${theme.border}`,
                          borderRadius: '10px',
                          overflow: 'hidden',
                        }}
                      >
                        {po.lines.map((line, idx) => {
                          const fromStock = parseFloat(String(line.qty_from_stock))
                          const totalQty = parseFloat(String(line.qty))
                          const toBuy = Math.max(0, totalQty - fromStock)
                          const poPrice = parseFloat(String(line.unit_price))
                          const actualPrice =
                            line.actual_unit_price != null
                              ? parseFloat(String(line.actual_unit_price))
                              : null
                          const variance =
                            actualPrice != null && poPrice > 0 ? actualPrice - poPrice : null
                          const variancePct =
                            variance != null && poPrice > 0 ? (variance / poPrice) * 100 : null
                          const varColor =
                            variance == null || variance === 0
                              ? theme.textMuted
                              : variance > 0
                                ? '#dc2626'
                                : '#16a34a'
                          return (
                            <div
                              key={line.id}
                              style={{
                                padding: '10px 12px',
                                borderBottom:
                                  idx < po.lines.length - 1 ? `1px solid ${theme.border}` : 'none',
                                background: line.is_bought ? '#f0fdf4' : 'transparent',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <button
                                  data-tour="po-mark-bought-btn"
                                  disabled={!canMarkBought}
                                  onClick={() =>
                                    void markLineBought({
                                      variables: {
                                        poId: po.id,
                                        lineId: line.id,
                                        bought: !line.is_bought,
                                      },
                                    })
                                  }
                                  style={{
                                    width: '20px',
                                    height: '20px',
                                    flexShrink: 0,
                                    borderRadius: '5px',
                                    border: `1px solid ${line.is_bought ? '#16a34a' : theme.border}`,
                                    background: line.is_bought ? '#16a34a' : 'transparent',
                                    color: '#fff',
                                    cursor: canMarkBought ? 'pointer' : 'not-allowed',
                                    fontSize: '13px',
                                    lineHeight: 1,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                  }}
                                >
                                  {line.is_bought ? '✓' : ''}
                                </button>
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontSize: '13px', color: theme.textPrimary }}>
                                    {line.description || line.product_name || '—'}
                                  </div>
                                  <div style={{ fontSize: '11px', color: theme.textMuted }}>
                                    {fmtN(line.qty)} {line.uom}
                                  </div>
                                </div>
                                {toBuy > 0 && (
                                  <div
                                    style={{
                                      display: 'flex',
                                      flexDirection: 'column',
                                      alignItems: 'center',
                                      gap: '3px',
                                    }}
                                  >
                                    <span style={{ fontSize: '10px', color: theme.textMuted }}>
                                      {t('po.detail.actualPricePaid', { qty: fmtN(toBuy), uom: line.uom })}
                                    </span>
                                    <input
                                      data-tour="po-actual-price-input"
                                      type="number"
                                      min={0}
                                      disabled={!canMarkBought}
                                      placeholder={t('po.detail.enterActualPrice')}
                                      value={
                                        actualPrices[line.id] ??
                                        (actualPrice != null
                                          ? String(actualPrice)
                                          : poPrice > 0
                                            ? String(poPrice)
                                            : '')
                                      }
                                      onChange={(e) => {
                                        setActualPrices((p) => ({
                                          ...p,
                                          [line.id]: e.target.value,
                                        }))
                                      }}
                                      onBlur={(e) => {
                                        const val = parseFloat(e.target.value)
                                        const newVal = isNaN(val) ? null : val
                                        // Nothing saved yet defaults to the market price
                                        // (poPrice) — skip the write if the buyer just
                                        // tabbed through without actually changing it.
                                        const effectiveCurrent =
                                          actualPrice ?? (poPrice > 0 ? poPrice : null)
                                        if (newVal === effectiveCurrent) return
                                        // 0 is ambiguous with "not recorded yet" (null) —
                                        // reject it rather than silently accepting a price
                                        // that's almost certainly not real. Clearing the
                                        // field entirely (newVal === null) still works.
                                        if (newVal === 0) {
                                          addToast({
                                            type: 'error',
                                            message: t('po.detail.actualPriceMustBeGreaterThan'),
                                          })
                                          e.target.value =
                                            effectiveCurrent != null ? String(effectiveCurrent) : ''
                                          return
                                        }
                                        setActualPriceStatus((s) => ({ ...s, [line.id]: 'saving' }))
                                        setLineActualPrice({
                                          variables: { poId: po.id, lineId: line.id, actualUnitPrice: newVal },
                                        })
                                          .then(() => {
                                            setActualPriceStatus((s) => ({ ...s, [line.id]: 'saved' }))
                                            setTimeout(() => {
                                              setActualPriceStatus((s) => ({ ...s, [line.id]: undefined }))
                                            }, 2000)
                                          })
                                          .catch((err: Error) => {
                                            setActualPriceStatus((s) => ({ ...s, [line.id]: undefined }))
                                            addToast({
                                              type: 'error',
                                              message: err.message || t('po.detail.failedSaveActualPrice'),
                                            })
                                          })
                                      }}
                                      style={{
                                        width: '190px',
                                        padding: '5px 8px',
                                        borderRadius: '5px',
                                        border: `1px solid ${
                                          actualPriceStatus[line.id] === 'saved'
                                            ? '#16a34a'
                                            : theme.border
                                        }`,
                                        background: theme.bgSurface,
                                        color: varColor,
                                        fontSize: '13px',
                                        textAlign: 'center',
                                        fontFamily: 'monospace',
                                        fontWeight: 600,
                                        boxSizing: 'border-box' as const,
                                        outline: 'none',
                                        transition: 'border-color 0.2s',
                                      }}
                                    />
                                    {actualPriceStatus[line.id] === 'saving' && (
                                      <span style={{ fontSize: '10px', color: theme.textMuted }}>
                                        {t('po.detail.saving')}
                                      </span>
                                    )}
                                    {actualPriceStatus[line.id] === 'saved' && (
                                      <span
                                        style={{ fontSize: '10px', fontWeight: 600, color: '#16a34a' }}
                                      >
                                        {t('po.detail.saved')}
                                      </span>
                                    )}
                                    {variance != null &&
                                      variancePct != null &&
                                      Math.abs(variancePct) > 0.01 && (
                                        <span
                                          style={{
                                            fontSize: '10px',
                                            fontWeight: 600,
                                            color: varColor,
                                          }}
                                        >
                                          {variance > 0 ? '▲' : '▼'} {variance > 0 ? '+' : ''}
                                          {t('po.detail.pctVsPo', { pct: variancePct.toFixed(1) })}
                                        </span>
                                      )}
                                  </div>
                                )}
                                <AmountDisplay
                                  amount={line.total}
                                  currency={
                                    line.market_price_currency ??
                                    line.requested_currency_code ??
                                    po.currency_code
                                  }
                                  size="sm"
                                />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                      )}
                      {showChecklist && (
                      <div style={{ fontSize: '11px', color: theme.textMuted }}>
                        {t('po.detail.itemsBoughtProgress', { bought: boughtCount, total: po.lines.length })}
                      </div>
                      )}
                      {allBought && (
                        <button
                          onClick={() => {
                            setBoughtChecklistExpanded((v) => !v)
                          }}
                          style={{
                            alignSelf: 'flex-start',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '12px',
                            color: theme.textMuted,
                            textDecoration: 'underline',
                          }}
                        >
                          {boughtChecklistExpanded ? t('po.detail.hideItems') : t('po.detail.reviewItems')}
                        </button>
                      )}
                      {/* Buyer receipts are required for every PO here, jobsite-delivery
                          projects included — this used to be hidden for
                          purpose:'project' + delivery_destination:'jobsite', which made
                          Finish Buying's own hasBuyerReceipt requirement (below)
                          unsatisfiable for that combination: nowhere to upload one, so
                          the button stayed disabled forever. */}
                      <EntityAttachments
                        entityType="purchase_order"
                        entityId={po.id}
                        category="po_receipt_document"
                        readOnly={!canMarkBought}
                        title={t('po.detail.buyerReceipts')}
                        description={t('po.detail.uploadTheVendorSReceiptOr')}
                        uploadButtonLabel={t('po.detail.uploadReceipt')}
                        recordLabel="this purchase"
                      />
                      {allBought && canMarkBought && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <Button
                            variant="primary"
                            style={PRIMARY_CTA_STYLE}
                            size="sm"
                            disabled={!hasBuyerReceipt}
                            loading={finishingBuying}
                            onClick={() => void finishBuyingPO({ variables: { poId: po.id } })}
                          >
                            {t('po.detail.finishBuying')}
                          </Button>
                          {!hasBuyerReceipt && (
                            <div style={{ fontSize: '11px', color: theme.textMuted }}>
                              {t('po.detail.uploadAtLeastOneBuyerReceipt')}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })()}

              {po.status === 'goods_received' &&
                (() => {
                  const fullyCovered = po.lines.every((line) => {
                    const ord = parseFloat(String(line.qty))
                    const rcv = parseFloat(String(line.qty_received))
                    const fromStk = parseFloat(String(line.qty_from_stock))
                    return rcv + fromStk >= ord
                  })
                  // sendPOToAudit only requires one confirmed receipt to exist
                  // (restoring the guarantee that held before the Items Bought
                  // split, not a new "everything must be fully received" rule
                  // — recordReceipt has always allowed confirming just some
                  // lines, and that alone was always enough to send to audit).
                  // So Send to Audit stays available here once any receipt is
                  // confirmed, even mid-way through receiving the rest.
                  // A direct-to-jobsite delivery (recordDirectDelivery) never
                  // creates a po_receipts row at all — it updates po_lines.
                  // qty_received straight away — so po.receipts alone would
                  // stay empty forever for that PO type, permanently stuck
                  // showing "Record Receipt" even after delivery was recorded.
                  const hasAnyReceipt =
                    po.receipts.some((r) => r.status === 'confirmed') ||
                    po.lines.some((line) => parseFloat(String(line.qty_received)) > 0)
                  if (!hasAnyReceipt) {
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div
                          style={{
                            padding: '10px 14px',
                            borderRadius: '8px',
                            background: '#f0fdf4',
                            border: '1px solid #16a34a',
                            fontSize: '13px',
                            color: '#166534',
                          }}
                        >
                          {t('po.detail.buyingIsDoneRecordWhatS')}
                        </div>
                        <DraftReceiptsNotice po={po} navigate={navigate} theme={theme} />
                        <Button
                          data-tour="po-record-receipt-btn"
                          variant="primary"
                          style={PRIMARY_CTA_STYLE}
                          size="sm"
                          onClick={() => {
                            navigate(`/procurement/purchase-orders/${po.id}/receive`)
                          }}
                        >
                          {t('po.detail.recordReceipt')}
                        </Button>
                      </div>
                    )
                  }
                  return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {!fullyCovered && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '12px', color: theme.textMuted }}>
                        {t('po.detail.notEveryLineIsFullyReceived')}
                      </span>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          navigate(`/procurement/purchase-orders/${po.id}/receive`)
                        }}
                      >
                        {t('po.detail.recordReceipt')}
                      </Button>
                    </div>
                  )}
                  <div
                    style={{
                      padding: '10px 14px',
                      borderRadius: '8px',
                      background: '#f0fdf4',
                      border: '1px solid #16a34a',
                      fontSize: '13px',
                      color: '#166534',
                    }}
                  >
                    {t('po.detail.goodsReceivedReviewReceiptsBelowThen')}
                  </div>
                  {/* Qty summary per line */}
                  <div
                    style={{
                      border: `1px solid ${theme.border}`,
                      borderRadius: '7px',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 90px 90px 80px',
                        padding: '6px 12px',
                        background: theme.bgSurface,
                        borderBottom: `1px solid ${theme.border}`,
                      }}
                    >
                      {[
                        t('po.detail.item'),
                        t('po.detail.ordered'),
                        t('po.detail.received'),
                        t('po.detail.coverage'),
                      ].map((h) => (
                        <span
                          key={h}
                          style={{
                            fontSize: '11px',
                            fontWeight: 600,
                            color: theme.textMuted,
                            textTransform: 'uppercase',
                          }}
                        >
                          {h}
                        </span>
                      ))}
                    </div>
                    {po.lines.map((line) => {
                      const fmtQ = (n: number | string) =>
                        parseFloat(String(n)).toLocaleString('en-US', {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 2,
                        })
                      const rcv = parseFloat(String(line.qty_received))
                      const fromStk = parseFloat(String(line.qty_from_stock))
                      const ord = parseFloat(String(line.qty))
                      const fulfilled = Math.min(ord, rcv + fromStk)
                      const pct = ord > 0 ? Math.min(100, Math.round((fulfilled / ord) * 100)) : 0
                      const color =
                        fulfilled >= ord ? '#16a34a' : fulfilled > 0 ? '#d97706' : '#dc2626'
                      return (
                        <div
                          key={line.id}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 90px 90px 80px',
                            padding: '8px 12px',
                            borderBottom: `1px solid ${theme.border}`,
                            alignItems: 'center',
                          }}
                        >
                          <span style={{ fontSize: '13px', color: theme.textPrimary }}>
                            {line.description || line.product_name || '—'}
                          </span>
                          <span
                            style={{
                              fontSize: '13px',
                              color: theme.textMuted,
                              fontFamily: 'monospace',
                            }}
                          >
                            {fmtQ(ord)} {line.uom}
                          </span>
                          <div>
                            <span
                              style={{
                                fontSize: '13px',
                                fontWeight: 600,
                                color,
                                fontFamily: 'monospace',
                              }}
                            >
                              {fmtQ(fulfilled)} {line.uom}
                            </span>
                            {fromStk > 0 && (
                              <div style={{ fontSize: '11px', color: '#16a34a', marginTop: '1px' }}>
                                {t('po.detail.receivedPlusStock', { received: fmtQ(rcv), stock: fmtQ(fromStk) })}
                              </div>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <div
                              style={{
                                flex: 1,
                                height: '6px',
                                borderRadius: '3px',
                                background: theme.border,
                                overflow: 'hidden',
                              }}
                            >
                              <div
                                style={{
                                  height: '100%',
                                  width: `${pct}%`,
                                  background: color,
                                  borderRadius: '3px',
                                }}
                              />
                            </div>
                            <span
                              style={{
                                fontSize: '11px',
                                color,
                                fontWeight: 600,
                                minWidth: '32px',
                                textAlign: 'right',
                              }}
                            >
                              {pct}%
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <Button
                    variant="primary"
                    style={PRIMARY_CTA_STYLE}
                    loading={lAudit}
                    onClick={() => void sendToAudit({ variables: { id: po.id } })}
                  >
                    {t('po.detail.sendToFinanceAudit')}
                  </Button>
                </div>
                  )
                })()}

              {(po.status === 'finance_audit' || po.status === 'finance_review') &&
                (isSystemLevel || po.callerIsFinanceTeam) &&
                (() => {
                  const flaggedCount = po.lines.filter((l) => l.audit_status === 'flagged').length
                  const pendingCount = po.lines.filter(
                    (l) => !l.audit_status || l.audit_status === 'pending',
                  ).length
                  const canPass = flaggedCount === 0 && pendingCount === 0
                  return (
                    <div
                      data-tour="po-finance-audit"
                      style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}
                    >
                      <div
                        style={{
                          fontSize: '12px',
                          fontWeight: 600,
                          color: theme.textMuted,
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                        }}
                      >
                        {t('po.detail.financeAuditMarkEachLineOk')}
                      </div>
                      {po.lines.map((line) => {
                        const auditStatus = line.audit_status ?? 'pending'
                        const bgOk = auditStatus === 'ok' ? '#f0fdf4' : 'transparent'
                        const bgFlag = auditStatus === 'flagged' ? '#fef2f2' : 'transparent'
                        const borderColor =
                          auditStatus === 'ok'
                            ? '#16a34a'
                            : auditStatus === 'flagged'
                              ? '#ef4444'
                              : theme.border
                        return (
                          <div
                            key={line.id}
                            style={{
                              padding: '10px 14px',
                              borderRadius: '7px',
                              border: `1px solid ${borderColor}`,
                              background:
                                auditStatus === 'ok'
                                  ? bgOk
                                  : auditStatus === 'flagged'
                                    ? bgFlag
                                    : theme.bgSurface,
                            }}
                          >
                            {/* Top row: name + OK/Flag buttons */}
                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'flex-start',
                                gap: '8px',
                                flexWrap: 'wrap',
                              }}
                            >
                              <div
                                style={{
                                  fontSize: '13px',
                                  color: theme.textPrimary,
                                  fontWeight: 500,
                                }}
                              >
                                {line.description || line.product_name || '—'}
                              </div>
                              <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                                <button
                                  onClick={() =>
                                    void setLineAuditStatus({
                                      variables: {
                                        poId: po.id,
                                        lineId: line.id,
                                        auditStatus: 'ok',
                                      },
                                    })
                                  }
                                  style={{
                                    padding: '5px 12px',
                                    borderRadius: '5px',
                                    border: `1px solid ${auditStatus === 'ok' ? '#16a34a' : theme.border}`,
                                    background: auditStatus === 'ok' ? '#16a34a' : 'transparent',
                                    color: auditStatus === 'ok' ? '#fff' : theme.textMuted,
                                    cursor: 'pointer',
                                    fontSize: '12px',
                                    fontWeight: 600,
                                    transition: 'all 0.1s',
                                  }}
                                >
                                  {t('po.detail.ok')}
                                </button>
                                <button
                                  onClick={() => {
                                    setFlaggingLines((p) => ({
                                      ...p,
                                      [line.id]: line.audit_note ?? '',
                                    }))
                                  }}
                                  style={{
                                    padding: '5px 12px',
                                    borderRadius: '5px',
                                    border: `1px solid ${auditStatus === 'flagged' ? '#ef4444' : theme.border}`,
                                    background:
                                      auditStatus === 'flagged' ? '#ef4444' : 'transparent',
                                    color: auditStatus === 'flagged' ? '#fff' : theme.textMuted,
                                    cursor: 'pointer',
                                    fontSize: '12px',
                                    fontWeight: 600,
                                    transition: 'all 0.1s',
                                  }}
                                >
                                  {t('po.detail.flag')}
                                </button>
                              </div>
                            </div>

                            {/* Qty fulfilled vs ordered (received + from stock) */}
                            {(() => {
                              const fmtQ = (n: number | string) =>
                                parseFloat(String(n)).toLocaleString('en-US', {
                                  minimumFractionDigits: 0,
                                  maximumFractionDigits: 2,
                                })
                              const rcv = parseFloat(String(line.qty_received))
                              const fromStk = parseFloat(String(line.qty_from_stock))
                              const ord = parseFloat(String(line.qty))
                              const fulfilled = Math.min(ord, rcv + fromStk)
                              const pct =
                                ord > 0 ? Math.min(100, Math.round((fulfilled / ord) * 100)) : 0
                              const short = fulfilled < ord
                              const over = rcv > ord
                              const qtyColor = over ? '#d97706' : short ? '#dc2626' : '#16a34a'
                              return (
                                <div style={{ marginTop: '8px' }}>
                                  <div
                                    style={{
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      alignItems: 'center',
                                      marginBottom: '4px',
                                    }}
                                  >
                                    <span style={{ fontSize: '12px', color: theme.textMuted }}>
                                      {t('po.detail.fulfilledOrdered')}
                                    </span>
                                    <div style={{ textAlign: 'right' }}>
                                      <span
                                        style={{
                                          fontSize: '13px',
                                          fontWeight: 700,
                                          color: qtyColor,
                                          fontFamily: 'monospace',
                                        }}
                                      >
                                        {fmtQ(fulfilled)} / {fmtQ(ord)} {line.uom}
                                        {short && (
                                          <span
                                            style={{
                                              fontSize: '11px',
                                              fontWeight: 400,
                                              marginLeft: '6px',
                                              color: '#dc2626',
                                            }}
                                          >
                                            {t('po.detail.shortBy', { qty: fmtQ(ord - fulfilled) })}
                                          </span>
                                        )}
                                        {over && (
                                          <span
                                            style={{
                                              fontSize: '11px',
                                              fontWeight: 400,
                                              marginLeft: '6px',
                                              color: '#d97706',
                                            }}
                                          >
                                            {t('po.detail.overBy', { qty: fmtQ(rcv - ord) })}
                                          </span>
                                        )}
                                      </span>
                                      {fromStk > 0 && (
                                        <div
                                          style={{
                                            fontSize: '11px',
                                            color: '#16a34a',
                                            marginTop: '1px',
                                          }}
                                        >
                                          {t('po.detail.receivedPlusStock', { received: fmtQ(rcv), stock: fmtQ(fromStk) })}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                  <div
                                    style={{
                                      height: '6px',
                                      borderRadius: '3px',
                                      background: theme.border,
                                      overflow: 'hidden',
                                    }}
                                  >
                                    <div
                                      style={{
                                        height: '100%',
                                        width: `${pct}%`,
                                        borderRadius: '3px',
                                        background: qtyColor,
                                        transition: 'width 0.3s',
                                      }}
                                    />
                                  </div>
                                </div>
                              )
                            })()}

                            {/* Price comparison */}
                            {(() => {
                              const fmtN = (n: number | string) =>
                                parseFloat(String(n)).toLocaleString('en-US', {
                                  minimumFractionDigits: 0,
                                  maximumFractionDigits: 2,
                                })
                              const poPrice = parseFloat(String(line.unit_price))
                              const actualPrice =
                                line.actual_unit_price != null
                                  ? parseFloat(String(line.actual_unit_price))
                                  : null
                              const fromStock = parseFloat(String(line.qty_from_stock))
                              const totalQty = parseFloat(String(line.qty))
                              const toBuy = Math.max(0, totalQty - fromStock)
                              const variance =
                                actualPrice != null && poPrice > 0 ? actualPrice - poPrice : null
                              const variancePct =
                                variance != null && poPrice > 0 ? (variance / poPrice) * 100 : null
                              const varColor =
                                variance == null || variance === 0
                                  ? theme.textMuted
                                  : variance > 0
                                    ? '#dc2626'
                                    : '#16a34a'
                              const purchaseTotal = toBuy * (actualPrice ?? poPrice)
                              return (
                                <div
                                  style={{
                                    marginTop: '10px',
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                                    gap: '8px',
                                  }}
                                >
                                  {/* PO Price (market price per unit) */}
                                  <div
                                    style={{
                                      padding: '8px 10px',
                                      borderRadius: '6px',
                                      background: theme.bgSurface,
                                      border: `1px solid ${theme.border}`,
                                    }}
                                  >
                                    <div
                                      style={{
                                        fontSize: '10px',
                                        fontWeight: 700,
                                        color: theme.textMuted,
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.05em',
                                        marginBottom: '3px',
                                      }}
                                    >
                                      {t('po.detail.poPrice')}
                                    </div>
                                    <div
                                      style={{
                                        fontSize: '14px',
                                        fontWeight: 700,
                                        color: theme.textPrimary,
                                        fontFamily: 'monospace',
                                      }}
                                    >
                                      {poPrice > 0 ? fmtN(poPrice) : '—'}
                                    </div>
                                    {toBuy > 0 && (
                                      <div
                                        style={{
                                          fontSize: '11px',
                                          color: theme.textMuted,
                                          marginTop: '2px',
                                        }}
                                      >
                                        {t('po.detail.forToBuy', { qty: fmtN(toBuy), uom: line.uom })}
                                      </div>
                                    )}
                                  </div>
                                  {/* Actual Price — for purchased qty only */}
                                  {toBuy > 0 && (
                                    <div
                                      style={{
                                        padding: '8px 10px',
                                        borderRadius: '6px',
                                        background:
                                          actualPrice == null
                                            ? '#fff7ed'
                                            : variance === 0
                                              ? '#f0fdf4'
                                              : (variance ?? 0) > 0
                                                ? '#fef2f2'
                                                : '#f0fdf4',
                                        border: `1px solid ${actualPrice == null ? '#fdba74' : variance === 0 ? '#86efac' : (variance ?? 0) > 0 ? '#fca5a5' : '#86efac'}`,
                                      }}
                                    >
                                      <div
                                        style={{
                                          fontSize: '10px',
                                          fontWeight: 700,
                                          color: theme.textMuted,
                                          textTransform: 'uppercase',
                                          letterSpacing: '0.05em',
                                          marginBottom: '4px',
                                        }}
                                      >
                                        Actual Price{' '}
                                        <span
                                          style={{
                                            fontWeight: 400,
                                            textTransform: 'none',
                                            fontSize: '10px',
                                          }}
                                        >
                                          {t('po.detail.purchasedEntered', { qty: fmtN(toBuy), uom: line.uom })}
                                        </span>
                                      </div>
                                      <div
                                        style={{
                                          padding: '4px 6px',
                                          fontSize: '14px',
                                          fontFamily: 'monospace',
                                          fontWeight: 700,
                                          color: actualPrice == null ? theme.textMuted : varColor,
                                        }}
                                      >
                                        {actualPrice != null
                                          ? fmtN(actualPrice)
                                          : t('po.detail.notEnteredYetBuyerHasnT')}
                                      </div>
                                      {variance != null &&
                                        variancePct != null &&
                                        Math.abs(variancePct) > 0.01 && (
                                          <div
                                            style={{
                                              fontSize: '11px',
                                              fontWeight: 600,
                                              color: varColor,
                                              marginTop: '3px',
                                            }}
                                          >
                                            {variance > 0 ? '▲' : '▼'} {variance > 0 ? '+' : ''}
                                            {t('po.detail.pctVsPo', { pct: variancePct.toFixed(1) })}
                                          </div>
                                        )}
                                    </div>
                                  )}
                                  {/* Purchase Total (only purchased qty) */}
                                  {toBuy > 0 && (
                                    <div
                                      style={{
                                        padding: '8px 10px',
                                        borderRadius: '6px',
                                        background: theme.bgSurface,
                                        border: `1px solid ${theme.border}`,
                                      }}
                                    >
                                      <div
                                        style={{
                                          fontSize: '10px',
                                          fontWeight: 700,
                                          color: theme.textMuted,
                                          textTransform: 'uppercase',
                                          letterSpacing: '0.05em',
                                          marginBottom: '3px',
                                        }}
                                      >
                                        {t('po.detail.purchaseTotal')}
                                      </div>
                                      <div
                                        style={{
                                          fontSize: '14px',
                                          fontWeight: 700,
                                          color: theme.textPrimary,
                                          fontFamily: 'monospace',
                                        }}
                                      >
                                        {fmtN(purchaseTotal)}
                                      </div>
                                      <div
                                        style={{
                                          fontSize: '11px',
                                          color: theme.textMuted,
                                          marginTop: '2px',
                                        }}
                                      >
                                        {fmtN(toBuy)} {line.uom} × {fmtN(actualPrice ?? poPrice)}
                                      </div>
                                    </div>
                                  )}
                                  {/* From Stock */}
                                  {fromStock > 0 && (
                                    <div
                                      style={{
                                        padding: '8px 10px',
                                        borderRadius: '6px',
                                        background: '#f0fdf4',
                                        border: '1px solid #86efac',
                                      }}
                                    >
                                      <div
                                        style={{
                                          fontSize: '10px',
                                          fontWeight: 700,
                                          color: '#166534',
                                          textTransform: 'uppercase',
                                          letterSpacing: '0.05em',
                                          marginBottom: '3px',
                                        }}
                                      >
                                        {t('po.detail.fromInventory')}
                                      </div>
                                      <div
                                        style={{
                                          fontSize: '14px',
                                          fontWeight: 700,
                                          color: '#166534',
                                          fontFamily: 'monospace',
                                        }}
                                      >
                                        {fmtN(fromStock)} {line.uom}
                                      </div>
                                      <div
                                        style={{
                                          fontSize: '11px',
                                          color: '#16a34a',
                                          marginTop: '2px',
                                        }}
                                      >
                                        {t('po.detail.noCostIssuedFromStock')}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )
                            })()}

                            {flaggingLines[line.id] !== undefined ? (
                              <div
                                style={{
                                  marginTop: '10px',
                                  padding: '10px',
                                  borderRadius: '6px',
                                  background: '#fef2f2',
                                  border: '1px solid #fca5a5',
                                }}
                              >
                                <div
                                  style={{
                                    fontSize: '12px',
                                    color: '#991b1b',
                                    fontWeight: 600,
                                    marginBottom: '6px',
                                  }}
                                >
                                  {t('po.detail.flagReasonRequired')}
                                </div>
                                <textarea
                                  autoFocus
                                  value={flaggingLines[line.id]}
                                  onChange={(e) => {
                                    setFlaggingLines((p) => ({ ...p, [line.id]: e.target.value }))
                                  }}
                                  placeholder={t('po.detail.describeTheIssueWithThisLine')}
                                  rows={2}
                                  style={{
                                    width: '100%',
                                    padding: '6px 8px',
                                    borderRadius: '5px',
                                    border: '1px solid #fca5a5',
                                    background: '#fff',
                                    color: '#991b1b',
                                    fontSize: '12px',
                                    resize: 'vertical',
                                    boxSizing: 'border-box',
                                  }}
                                />
                                <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                                  <button
                                    disabled={!flaggingLines[line.id].trim()}
                                    onClick={() => {
                                      if (!flaggingLines[line.id].trim()) return
                                      void setLineAuditStatus({
                                        variables: {
                                          poId: po.id,
                                          lineId: line.id,
                                          auditStatus: 'flagged',
                                          auditNote: flaggingLines[line.id].trim(),
                                        },
                                      })
                                      setFlaggingLines((p) => {
                                        const n = { ...p }
                                        Reflect.deleteProperty(n, line.id)
                                        return n
                                      })
                                    }}
                                    style={{
                                      padding: '5px 14px',
                                      borderRadius: '5px',
                                      border: 'none',
                                      background: flaggingLines[line.id].trim()
                                        ? '#ef4444'
                                        : '#fca5a5',
                                      color: '#fff',
                                      cursor: flaggingLines[line.id].trim()
                                        ? 'pointer'
                                        : 'not-allowed',
                                      fontSize: '12px',
                                      fontWeight: 600,
                                    }}
                                  >
                                    {t('po.detail.saveFlag')}
                                  </button>
                                  <button
                                    onClick={() => {
                                      setFlaggingLines((p) => {
                                        const n = { ...p }
                                        Reflect.deleteProperty(n, line.id)
                                        return n
                                      })
                                    }}
                                    style={{
                                      padding: '5px 12px',
                                      borderRadius: '5px',
                                      border: `1px solid ${theme.border}`,
                                      background: 'transparent',
                                      color: theme.textMuted,
                                      cursor: 'pointer',
                                      fontSize: '12px',
                                    }}
                                  >
                                    {t('po.detail.cancel')}
                                  </button>
                                </div>
                              </div>
                            ) : auditStatus === 'flagged' && line.audit_note ? (
                              <div
                                style={{
                                  marginTop: '8px',
                                  padding: '6px 10px',
                                  borderRadius: '5px',
                                  background: '#fef2f2',
                                  border: '1px solid #fca5a5',
                                  color: '#991b1b',
                                  fontSize: '12px',
                                }}
                              >
                                ⚑ {line.audit_note}
                              </div>
                            ) : null}
                          </div>
                        )
                      })}
                      <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                        <Button
                          variant="primary"
                          style={PRIMARY_CTA_STYLE}
                          loading={lPass}
                          disabled={!canPass}
                          onClick={() => void passAudit({ variables: { id: po.id } })}
                        >
                          {canPass
                            ? t('po.detail.passAuditInvoiced')
                            : pendingCount > 0
                              ? t('po.detail.passAuditPending', { count: pendingCount })
                              : t('po.detail.passAuditFlagged', { count: flaggedCount })}
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() =>
                            void failAudit({
                              variables: { id: po.id },
                            })
                          }
                        >
                          {t('po.detail.returnForCorrection')}
                        </Button>
                      </div>
                    </div>
                  )
                })()}

              {(po.status === 'invoiced' || po.status === 'payment_pending') &&
                (isSystemLevel || po.callerIsFinanceTeam) &&
                (!po.funding_decided ? (
                  can('finance.ap.approve', 'approve') ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div
                        style={{
                          padding: '10px 14px',
                          borderRadius: '8px',
                          background: theme.bgSurface,
                          border: `1px solid ${theme.border}`,
                          fontSize: '12px',
                          color: theme.textSecondary,
                        }}
                      >
                        {t('po.detail.howWasThisPoPaidPick')}
                      </div>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                          gap: '8px',
                        }}
                      >
                        <Button
                          variant={fundingChoice === 'vendor_ap' ? 'primary' : 'secondary'}
                          onClick={() => {
                            setFundingChoice('vendor_ap')
                          }}
                        >
                          {t('po.detail.vendorAccountsPayable')}
                        </Button>
                        <Button
                          variant={fundingChoice === 'employee_advance' ? 'primary' : 'secondary'}
                          onClick={() => {
                            setFundingChoice('employee_advance')
                          }}
                        >
                          {t('po.detail.employeeAdvance')}
                        </Button>
                      </div>
                      {fundingChoice === 'employee_advance' && (
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                            gap: '8px',
                          }}
                        >
                          <SearchableSelect
                            label={t('po.detail.employee')}
                            value={fundingEmployeeId}
                            onChange={setFundingEmployeeId}
                            options={[
                              { value: '', label: t('po.detail.selectEmployee') },
                              ...employees.map((e) => ({
                                value: e.id,
                                label: `${e.first_name} ${e.last_name}`,
                              })),
                            ]}
                            placeholder={t('po.detail.searchEmployee')}
                            minDropdownWidth={320}
                          />
                          <div>
                            <label
                              style={{
                                fontSize: '12px',
                                fontWeight: 600,
                                color: theme.textMuted,
                                display: 'block',
                                marginBottom: '4px',
                              }}
                            >
                              {t('po.detail.advance')}
                            </label>
                            <select
                              value={fundingAdvanceId}
                              onChange={(e) => {
                                setFundingAdvanceId(e.target.value)
                              }}
                              style={{
                                width: '100%',
                                padding: '7px 10px',
                                borderRadius: '6px',
                                border: `1px solid ${theme.border}`,
                                background: theme.bgCanvas,
                                color: theme.textPrimary,
                                fontSize: '13px',
                                boxSizing: 'border-box' as const,
                              }}
                            >
                              <option value="">
                                {fundingEmployeeId ? t('po.detail.selectAdvance') : t('po.detail.selectEmployeeFirst')}
                              </option>
                              {fundingAdvances.map((a) => (
                                <option key={a.id} value={a.id}>
                                  {t('po.detail.advanceOption', { number: a.advance_number, amount: Number(a.outstanding_amount).toLocaleString(), currency: a.currency_code })}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      )}
                      <Button
                        variant="primary"
                        style={PRIMARY_CTA_STYLE}
                        loading={settingFunding}
                        disabled={
                          !fundingChoice ||
                          (fundingChoice === 'employee_advance' && !fundingAdvanceId)
                        }
                        onClick={() =>
                          void setPOFunding({
                            variables: {
                              id: po.id,
                              fundingSource: fundingChoice,
                              fundingAdvanceId:
                                fundingChoice === 'employee_advance'
                                  ? fundingAdvanceId
                                  : undefined,
                            },
                          })
                        }
                      >
                        {t('po.detail.confirmFundingSource')}
                      </Button>
                    </div>
                  ) : (
                    <div
                      style={{
                        padding: '10px 14px',
                        borderRadius: '8px',
                        background: theme.bgSurface,
                        border: `1px solid ${theme.border}`,
                      }}
                    >
                      <div style={{ fontSize: '12px', fontWeight: 600, color: theme.textPrimary }}>
                        {t('po.detail.awaitingFinance')}
                      </div>
                      <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '3px' }}>
                        {t('po.detail.thisPoHasBeenInvoicedAnd')}
                      </div>
                    </div>
                  )
                ) : po.funding_source === 'employee_advance' ? (
                  can('finance.ap.approve', 'approve') ? (
                    (() => {
                      const unclassifiedCount = po.lines.filter(
                        (l) => !l.account_id || !l.cost_center_id,
                      ).length
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          {renderGlClassificationPanel(
                            t('po.detail.fundedByAdvanceClassifyHint'),
                          )}
                          <Button
                            variant="primary"
                            style={PRIMARY_CTA_STYLE}
                            loading={anyLoading}
                            disabled={unclassifiedCount > 0}
                            onClick={() => void completePO({ variables: { id: po.id } })}
                          >
                            {unclassifiedCount > 0
                              ? t('po.detail.markCompletedUnclassified', { count: unclassifiedCount })
                              : t('po.detail.markAsCompleted')}
                          </Button>
                        </div>
                      )
                    })()
                  ) : (
                    <div
                      style={{
                        padding: '10px 14px',
                        borderRadius: '8px',
                        background: theme.bgSurface,
                        border: `1px solid ${theme.border}`,
                      }}
                    >
                      <div style={{ fontSize: '12px', fontWeight: 600, color: theme.textPrimary }}>
                        {t('po.detail.awaitingFinance')}
                      </div>
                      <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '3px' }}>
                        {t('po.detail.thisPoWasFundedByAn')}
                      </div>
                    </div>
                  )
                ) : can('finance.ap.view') ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {can('finance.ap.approve', 'approve') &&
                      renderGlClassificationPanel(
                        t('po.detail.classifyHint'),
                      )}
                    {apInvoice ? (
                      <div
                        style={{
                          padding: '10px 14px',
                          borderRadius: '8px',
                          background: theme.accentBg,
                          border: `1px solid ${theme.accent}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '12px',
                        }}
                      >
                        <div>
                          <div style={{ fontSize: '12px', fontWeight: 600, color: theme.accent }}>
                            {t('po.detail.vendorInvoiceCreated')}
                          </div>
                          <div
                            style={{
                              fontSize: '11px',
                              color: theme.textSecondary,
                              marginTop: '2px',
                            }}
                          >
                            {apInvoice.invoice_number} —{' '}
                            <span style={{ textTransform: 'capitalize' }}>{enumLabel(apInvoice.status)}</span>
                          </div>
                        </div>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            navigate(`/finance/ap/${apInvoice.id}`)
                          }}
                        >
                          {t('po.detail.viewInAp')}
                        </Button>
                      </div>
                    ) : can('finance.ap.edit') ? (
                      <div
                        style={{
                          padding: '10px 14px',
                          borderRadius: '8px',
                          background: theme.dangerBg,
                          border: `1px solid ${theme.dangerBorder}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '12px',
                        }}
                      >
                        <div>
                          <div style={{ fontSize: '12px', fontWeight: 600, color: theme.danger }}>
                            {t('po.detail.noVendorInvoiceInApYet')}
                          </div>
                          <div
                            style={{
                              fontSize: '11px',
                              color: theme.danger,
                              opacity: 0.8,
                              marginTop: '2px',
                            }}
                          >
                            {t('po.detail.createAVendorInvoiceInAp')}
                          </div>
                        </div>
                        <Button
                          variant="primary"
                          style={PRIMARY_CTA_STYLE}
                          size="sm"
                          onClick={() => {
                            navigate(`/finance/ap/new?po_id=${po.id}`)
                          }}
                        >
                          {t('po.detail.createInAp')}
                        </Button>
                      </div>
                    ) : (
                      <div
                        style={{
                          padding: '10px 14px',
                          borderRadius: '8px',
                          background: theme.bgSurface,
                          border: `1px solid ${theme.border}`,
                          fontSize: '12px',
                          color: theme.textSecondary,
                        }}
                      >
                        {t('po.detail.noVendorInvoiceCreatedYet')}
                      </div>
                    )}
                    {can('finance.ap.approve', 'approve') && (
                      <>
                        <Button
                          variant={apInvoice?.status === 'paid' ? 'primary' : 'secondary'}
                          loading={anyLoading}
                          disabled={apInvoice?.status !== 'paid' && apInvoice !== null}
                          onClick={() => void completePO({ variables: { id: po.id } })}
                        >
                          {t('po.detail.markAsCompleted')}
                        </Button>
                        {apInvoice && apInvoice.status !== 'paid' && (
                          <div style={{ fontSize: '11px', color: theme.textMuted }}>
                            {t('po.detail.markAsCompletedWillBeEnabled')}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ) : (
                  <div
                    style={{
                      padding: '10px 14px',
                      borderRadius: '8px',
                      background: theme.bgSurface,
                      border: `1px solid ${theme.border}`,
                    }}
                  >
                    <div style={{ fontSize: '12px', fontWeight: 600, color: theme.textPrimary }}>
                      {t('po.detail.awaitingFinance')}
                    </div>
                    <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '3px' }}>
                      {t('po.detail.thisPoHasBeenInvoicedAnd2')}
                    </div>
                  </div>
                ))}

              {po.status === 'rejected' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div
                    style={{
                      padding: '10px 14px',
                      borderRadius: '8px',
                      background: '#fef2f2',
                      border: '1px solid #ef4444',
                      fontSize: '13px',
                      color: '#991b1b',
                    }}
                  >
                    {t('po.detail.thisPoWasRejectedReviseAnd')}
                  </div>
                  <Button
                    variant="secondary"
                    loading={anyLoading}
                    onClick={() => void reopenPO({ variables: { id: po.id } })}
                  >
                    {t('po.detail.reopenAsDraft')}
                  </Button>
                </div>
              )}

            </div>
          </fieldset>
        </Card>
      )}
        </div>

        <div style={{ flex: '1 1 460px', minWidth: 0 }}>
      {/* Tabs */}
      <div style={{ marginBottom: '16px' }}>
        <TabBar
          tabs={tabs}
          active={activeTab}
          onChange={(key) => {
            setActiveTab(key as Tab)
          }}
          phoneLabels={phoneTabLabels}
        />
      </div>

      {/* Tab content */}
      {activeTab === 'lines' &&
        (() => {
          const FLAG_COLORS: Record<
            string,
            { bg: string; border: string; dot: string; label: string }
          > = {
            dispute: {
              bg: 'rgba(239,68,68,0.08)',
              border: 'rgba(239,68,68,0.25)',
              dot: '#ef4444',
              label: t('po.detail.dispute'),
            },
            warning: {
              bg: 'rgba(245,158,11,0.08)',
              border: 'rgba(245,158,11,0.25)',
              dot: '#f59e0b',
              label: t('po.detail.warning'),
            },
            info: {
              bg: 'rgba(59,130,246,0.08)',
              border: 'rgba(59,130,246,0.25)',
              dot: '#3b82f6',
              label: t('po.detail.info'),
            },
          }
          const FLAG_PRIORITY = ['dispute', 'warning', 'info']

          const fmtN = (n: number | string) =>
            parseFloat(String(n)).toLocaleString('en-US', {
              minimumFractionDigits: 0,
              maximumFractionDigits: 2,
            })

          const getLineFlag = (lineId: string): string | null => {
            const comments = lineComments[lineId] ?? []
            const unresolved = comments
              .filter((c) => c.flag && !c.resolved)
              .map((c) => c.flag as string)
            for (const f of FLAG_PRIORITY) {
              if (unresolved.includes(f)) return f
            }
            return null
          }

          const lineColumns: Column<POLine>[] = [
            // Flag-to-reject checkbox — only at the two statuses a reject
            // box can appear for. Leftmost deliberately: this table can grow
            // wider than the visible card (many price/received/notes
            // columns), and only leading columns are guaranteed visible
            // without horizontal scroll. Lives here, next to the actual
            // line, instead of a second list of line names in the action
            // panel — see flagLine/clearFlag.
            ...(po.status === 'price_verification' || po.status === 'pending_approval'
              ? [
                  {
                    key: 'flag_toggle',
                    header: t('po.detail.flag3'),
                    width: '36px',
                    render: (line: POLine) => (
                      <input
                        type="checkbox"
                        checked={line.id in lineFlagNotes}
                        onChange={() => { line.id in lineFlagNotes ? clearFlag(line.id) : flagLine(line.id); }}
                        title={t('po.detail.flagThisLineForRejection')}
                      />
                    ),
                  },
                ]
              : []),
            {
              key: 'index',
              header: '#',
              width: '32px',
              render: (line) => (
                <span
                  style={{
                    fontSize: '12px',
                    color: theme.textMuted,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {po.lines.findIndex((l) => l.id === line.id) + 1}
                </span>
              ),
            },
            {
              key: 'item',
              header: t('po.detail.item'),
              mobilePrimary: true,
              wrap: true,
              minWidth: '220px',
              render: (line) => {
                // An edit request can override this line's own description
                // independently of the catalog product it's linked to (the
                // product_id itself is never editable post-creation). That
                // override must win here like it does everywhere else this
                // file renders a line's item text — otherwise an approved
                // description edit never shows up on a catalog-linked line.
                const primary = line.description || line.product_name
                const secondary = line.description ? line.product_name : line.product_name_ar
                const secondaryIsArabic = !line.description && !!line.product_name_ar
                return (
                  <>
                    {primary && (
                      <div
                        style={{
                          fontSize: '13px',
                          color: theme.textPrimary,
                          fontWeight: 500,
                        }}
                      >
                        {primary}
                      </div>
                    )}
                    {secondary && (
                      <div
                        dir={secondaryIsArabic ? 'rtl' : undefined}
                        style={{
                          fontSize: '12px',
                          color: theme.textMuted,
                          textAlign: secondaryIsArabic ? 'left' : undefined,
                          marginTop: primary ? '2px' : 0,
                        }}
                      >
                        {secondary}
                      </div>
                    )}
                    {!primary && !secondary && (
                      <span style={{ fontSize: '13px', color: theme.textMuted }}>—</span>
                    )}
                  </>
                )
              },
            },
            {
              key: 'qty',
              header: t('po.detail.qty'),
              mobilePriority: 4,
              render: (line) => {
                const fromStock = parseFloat(String(line.qty_from_stock)) || 0
                const toPurchase = Math.max(0, line.qty - fromStock)
                return (
                  <div>
                    <span
                      style={{
                        color: theme.textPrimary,
                        fontFamily: 'monospace',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {fmtN(line.qty)} {line.uom}
                    </span>
                    {fromStock > 0 && (
                      <div
                        style={{
                          fontSize: '11px',
                          color: BRAND_BLUE,
                          fontFamily: 'monospace',
                          marginTop: '2px',
                        }}
                      >
                        {t('po.detail.fromInventoryQty', { qty: fmtN(fromStock) })}
                      </div>
                    )}
                    {fromStock > 0 && toPurchase > 0 && (
                      <div
                        style={{
                          fontSize: '11px',
                          color: theme.textMuted,
                          fontFamily: 'monospace',
                          marginTop: '2px',
                        }}
                      >
                        {t('po.detail.toPurchaseQty', { qty: fmtN(toPurchase) })}
                      </div>
                    )}
                  </div>
                )
              },
            },
            {
              key: 'initial_unit_price',
              header: t('po.detail.initialPrice'),
              mobilePriority: 5,
              render: (line) =>
                line.initial_unit_price != null ? (
                  <span
                    style={{
                      color: theme.textMuted,
                      fontFamily: 'monospace',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {fmtN(line.initial_unit_price)}{' '}
                    {line.requested_currency_code ?? po.currency_code}
                  </span>
                ) : (
                  <span style={{ color: theme.textMuted, fontSize: '12px' }} title={t('po.detail.notRecordedBeforeThisWasTracked')}>
                    —
                  </span>
                ),
            },
            {
              key: 'market_price',
              header: t('po.detail.marketPrice2'),
              mobilePriority: 6,
              render: (line) => (
                <span
                  style={{
                    color: theme.textSecondary,
                    fontFamily: 'monospace',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {fmtN(line.unit_price)}{' '}
                  {line.market_price_currency ?? line.requested_currency_code ?? po.currency_code}
                </span>
              ),
            },
            {
              key: 'store_price',
              header: t('po.detail.storePrice2'),
              mobilePriority: 6,
              render: (line) => {
                const sp = parseFloat(String(line.store_price ?? 0))
                return sp > 0 ? (
                  <span
                    style={{
                      color: BRAND_GREEN,
                      fontWeight: 600,
                      fontFamily: 'monospace',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {fmtN(sp)} {line.store_price_currency ?? po.currency_code}
                  </span>
                ) : (
                  <span style={{ color: theme.textMuted, fontFamily: 'monospace' }}>—</span>
                )
              },
            },
            {
              key: 'verified_price',
              header: t('po.detail.verifiedPriceCol'),
              mobilePriority: 7,
              render: (line) => {
                const vp = parseFloat(String(line.verified_price ?? 0))
                return vp > 0 ? (
                  <span
                    style={{
                      color: theme.textSecondary,
                      fontFamily: 'monospace',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {fmtN(vp)} {line.verified_price_currency ?? po.currency_code}
                  </span>
                ) : (
                  <span style={{ color: theme.textMuted, fontFamily: 'monospace' }}>—</span>
                )
              },
            },
            {
              key: 'actual_price',
              header: t('po.detail.actualPrice'),
              mobilePriority: 7,
              render: (line) => {
                const ap = parseFloat(String(line.actual_unit_price ?? 0))
                const ccy =
                  line.market_price_currency ?? line.requested_currency_code ?? po.currency_code
                return ap > 0 ? (
                  <span
                    style={{
                      color: theme.textSecondary,
                      fontFamily: 'monospace',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {fmtN(ap)} {ccy}
                  </span>
                ) : (
                  <span style={{ color: theme.textMuted, fontFamily: 'monospace' }}>—</span>
                )
              },
            },
            {
              key: 'total',
              header: t('po.detail.total'),
              mobilePriority: 2,
              render: (line) => {
                const total = poLineTotalNative(line)
                const ccy = line.market_price_currency ?? line.requested_currency_code ?? po.currency_code
                return (
                  <span
                    style={{
                      fontWeight: 700,
                      color: BRAND_GREEN,
                      fontFamily: 'monospace',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {fmtN(total || line.total)} {ccy}
                  </span>
                )
              },
            },
            {
              key: 'received',
              header: t('po.detail.received'),
              mobilePriority: 3,
              render: (line) => {
                const received = line.qty_received >= line.qty
                const partial = line.qty_received > 0 && !received
                const color = received ? BRAND_GREEN : partial ? '#D97706' : theme.textMuted
                return (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '2px 8px',
                      borderRadius: '999px',
                      fontSize: '11px',
                      fontWeight: 600,
                      fontFamily: 'monospace',
                      background: `${color}18`,
                      color,
                    }}
                  >
                    {received && '✓ '}
                    {fmtN(line.qty_received)}/{fmtN(line.qty)}
                  </span>
                )
              },
            },
            {
              key: 'notes',
              header: t('po.detail.notes2'),
              mobilePriority: 1,
              render: (line) => {
                const comments = lineComments[line.id] ?? []
                const activeFlag = getLineFlag(line.id)
                const flagStyle = activeFlag ? FLAG_COLORS[activeFlag] : null
                const openCount = comments.filter((c) => c.flag && !c.resolved).length
                const totalCount = comments.length
                const isAuditFlagged = line.audit_status === 'flagged'
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {isAuditFlagged && (
                      <div
                        style={{
                          fontSize: '12px',
                          color: '#dc2626',
                          fontWeight: 600,
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '4px',
                        }}
                      >
                        <span style={{ flexShrink: 0 }}>⚑</span>
                        <span style={{ color: '#dc2626', fontWeight: 400 }}>
                          {line.audit_note || t('po.detail.flaggedLabel')}
                        </span>
                      </div>
                    )}
                    <button
                      onClick={() => {
                        setCommentModal({
                          lineId: line.id,
                          description:
                            line.description || line.product_name || `Line ${line.id.slice(0, 6)}`,
                        })
                        setNewComment('')
                        setNewFlag('')
                      }}
                      style={{
                        cursor: 'pointer',
                        background: flagStyle
                          ? `${flagStyle.dot}18`
                          : totalCount > 0
                            ? `${theme.accent}12`
                            : theme.bgSurface,
                        border: `1px solid ${flagStyle ? flagStyle.dot : totalCount > 0 ? theme.accent : theme.border}`,
                        borderRadius: '6px',
                        padding: '4px 10px',
                        fontSize: '12px',
                        color: flagStyle
                          ? flagStyle.dot
                          : totalCount > 0
                            ? theme.accent
                            : theme.textMuted,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {flagStyle && (
                        <span
                          style={{
                            width: '7px',
                            height: '7px',
                            borderRadius: '50%',
                            background: flagStyle.dot,
                            display: 'inline-block',
                            flexShrink: 0,
                          }}
                        />
                      )}
                      {flagStyle
                        ? `${flagStyle.label} · ${openCount} open`
                        : totalCount > 0
                          ? `💬 ${totalCount}`
                          : t('po.detail.note')}
                    </button>
                  </div>
                )
              },
            },
          ]

          // Which optional columns are shown: the person's own choice where they made one,
          // otherwise the default here. The flag box and the # always show; the item and the
          // total can't be hidden. Store price is on by default while prices are being worked
          // out, when it is what the reviewer compares against, and off once the order is bought.
          const pricingStage = [
            'store_pricing',
            'market_pricing',
            'price_verification',
            'pending_approval',
          ].includes(po.status)
          const viewOptions = [
            { key: 'qty', label: t('po.detail.qty'), defaultOn: true, locked: false },
            { key: 'received', label: t('po.detail.received'), defaultOn: true, locked: false },
            {
              key: 'initial_unit_price',
              label: t('po.detail.initialPrice'),
              defaultOn: false,
              locked: false,
            },
            {
              key: 'market_price',
              label: t('po.detail.marketPrice2'),
              defaultOn: true,
              locked: false,
            },
            {
              key: 'store_price',
              label: t('po.detail.storePrice2'),
              defaultOn: pricingStage,
              locked: false,
            },
            {
              key: 'verified_price',
              label: t('po.detail.verifiedPriceCol'),
              defaultOn: false,
              locked: false,
            },
            {
              key: 'actual_price',
              label: t('po.detail.actualPrice'),
              defaultOn: false,
              locked: false,
            },
            { key: 'total', label: t('po.detail.total'), defaultOn: true, locked: true },
            { key: 'notes', label: t('po.detail.notes2'), defaultOn: true, locked: false },
          ]
          const viewColumnOn = (o: (typeof viewOptions)[number]) =>
            o.locked || linesView.isOn(o.key, o.defaultOn)
          const shownColumns = lineColumns.filter((c) => {
            const o = viewOptions.find((v) => v.key === c.key)
            return !o || viewColumnOn(o)
          })
          const filterText = lineFilter.trim().toLowerCase()
          const shownLines = filterText
            ? po.lines.filter((l) =>
                [l.description, l.product_name, l.product_name_ar].some((v) =>
                  v?.toLowerCase().includes(filterText),
                ),
              )
            : po.lines
          const orderTotals = poTotalEntries(po)

          return (
            <Card>
              <div
                style={{
                  padding: '16px 20px',
                  borderBottom: `1px solid ${theme.border}`,
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '10px 16px',
                }}
              >
                <div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontWeight: 600,
                      fontSize: '15px',
                      color: theme.textPrimary,
                    }}
                  >
                    <span style={{ color: theme.textMuted, display: 'flex' }}>
                      <IconBox />
                    </span>
                    {t('po.detail.purchaseOrderLines')}
                  </div>
                  <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '2px' }}>
                    {filterText
                      ? t('ui.tableView.showing', {
                          shown: shownLines.length,
                          total: po.lines.length,
                        })
                      : t('po.detail.itemsOnOrder', { count: po.lines.length })}
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
                  <SearchInput
                    value={lineFilter}
                    onChange={setLineFilter}
                    placeholder={t('ui.tableView.filterLines')}
                    style={{ width: '190px' }}
                  />
                  <ColumnsMenu
                    items={viewOptions.map((o) => ({
                      key: o.key,
                      label: o.label,
                      on: viewColumnOn(o),
                      locked: o.locked,
                    }))}
                    onToggle={(key, on) => {
                      const o = viewOptions.find((v) => v.key === key)
                      if (o) linesView.setColumn(key, on, o.defaultOn)
                    }}
                    onReset={linesView.resetColumns}
                    canReset={linesView.customized}
                    note={t('po.detail.linesAlwaysVisible')}
                  />
                  {!isPhone && (
                    <DensityToggle value={linesView.density} onChange={linesView.setDensity} />
                  )}
                </div>
              </div>
              <Table
                columns={shownColumns}
                data={shownLines}
                density={linesView.density}
                emptyMessage={filterText ? t('ui.tableView.noMatches') : undefined}
                footerRow={
                  orderTotals.length > 0
                    ? {
                        item: t('po.detail.orderTotal'),
                        total: (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            {orderTotals.map((e) => (
                              <span
                                key={e.currencyCode}
                                style={{ color: BRAND_GREEN, fontFamily: 'monospace' }}
                              >
                                {fmtN(e.amount)} {e.currencyCode}
                              </span>
                            ))}
                          </div>
                        ),
                      }
                    : undefined
                }
                rowKey="id"
                getRowStyle={(line) => {
                  // Currently checked for the reject box in progress — takes
                  // priority over everything else below.
                  if (line.id in lineFlagNotes) {
                    return {
                      borderBottom: `1px solid ${theme.border}22`,
                      background: `${theme.accent}0c`,
                      borderLeft: `4px solid ${theme.accent}`,
                    }
                  }
                  // Migration 279's review flag (a formal, persisted
                  // rejection reason) takes visual priority over the
                  // ephemeral comment-thread flag and the audit flag below.
                  if (line.flag_reason && !line.flag_resolved_at) {
                    const open = !line.flag_addressed_at
                    const color = open ? theme.danger : theme.warning
                    return {
                      borderBottom: `1px solid ${theme.border}22`,
                      background: `${color}0c`,
                      borderLeft: `4px solid ${color}`,
                    }
                  }
                  const activeFlag = getLineFlag(line.id)
                  const flagStyle = activeFlag ? FLAG_COLORS[activeFlag] : null
                  const isAuditFlagged = line.audit_status === 'flagged'
                  return {
                    borderBottom: isAuditFlagged
                      ? '1px solid rgba(239,68,68,0.3)'
                      : flagStyle
                        ? `1px solid ${flagStyle.border}`
                        : `1px solid ${theme.border}22`,
                    background: isAuditFlagged
                      ? 'rgba(239,68,68,0.06)'
                      : flagStyle
                        ? flagStyle.bg
                        : 'transparent',
                    borderLeft: isAuditFlagged
                      ? '3px solid #ef4444'
                      : flagStyle
                        ? `3px solid ${flagStyle.dot}`
                        : '3px solid transparent',
                  }
                }}
                renderExpanded={(line) => {
                  const hasOpenFlag = !!line.flag_reason && !line.flag_resolved_at
                  const isComposing = line.id in lineFlagNotes
                  if (!hasOpenFlag && !isComposing) return null
                  const open = hasOpenFlag && !line.flag_addressed_at
                  const color = open ? theme.danger : theme.warning
                  return (
                    // Stacked (not side-by-side) deliberately — this cell is
                    // colSpan'd across every column, so its rendered width
                    // matches the table's full (often wider-than-viewport,
                    // horizontally-scrolled) width, not the visible card. A
                    // flex row with justifyContent:'space-between' would push
                    // the Resolve button out past the visible area, reachable
                    // only by scrolling right with no hint to do so.
                    <div style={{ padding: '10px 14px', background: `${isComposing ? theme.accent : color}0c` }}>
                      {hasOpenFlag && (
                        <div style={{ marginBottom: isComposing ? '10px' : 0 }}>
                          <div style={{ fontSize: '11px', fontWeight: 600, color, marginBottom: '4px' }}>
                            {open ? t('po.detail.flaggedLabel') : t('po.detail.addressedLabel')}
                            <span style={{ fontWeight: 400, color: theme.textMuted, marginLeft: '6px' }}>
                              {t('po.detail.flaggedByDuring', {
                                name: line.flagged_by_name ?? t('po.detail.someone'),
                                stage: getPOStatusLabel(
                                  line.flagged_from_status === 'price_verification'
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
                              marginBottom: open ? 0 : '8px',
                            }}
                          >
                            {line.flag_reason}
                          </div>
                          {!open && (
                            <Button
                              variant="secondary"
                              size="sm"
                              loading={lResolveFlag}
                              onClick={() => void resolveLineFlag({ variables: { lineId: line.id } })}
                            >
                              {t('po.detail.resolve')}
                            </Button>
                          )}
                        </div>
                      )}
                      {isComposing && (
                        <div>
                          <div style={{ fontSize: '11px', fontWeight: 600, color: theme.accent, marginBottom: '4px' }}>
                            {t('po.detail.flaggingThisLineRequiredToReject')}
                          </div>
                          <Textarea
                            value={lineFlagNotes[line.id] ?? ''}
                            onChange={(e) => { setFlagNote(line.id, e.target.value); }}
                            placeholder={t('po.detail.whatSWrongWithThisLine')}
                            rows={2}
                          />
                        </div>
                      )}
                    </div>
                  )
                }}
              />
            </Card>
          )
        })()}

      {activeTab === 'receipts' && (
        <div>
          {(po.status === 'approved' || po.status === 'bought' || po.status === 'goods_received') && (
            <div style={{ marginBottom: '12px' }}>
              <DraftReceiptsNotice po={po} navigate={navigate} theme={theme} />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                <Button
                  variant="primary"
                  style={PRIMARY_CTA_STYLE}
                  size="sm"
                  onClick={() => {
                    navigate(`/procurement/purchase-orders/${po.id}/receive`)
                  }}
                >
                  {t('po.detail.recordReceipt')}
                </Button>
              </div>
            </div>
          )}
          {po.receipts.length === 0 && (
            <Card style={{ padding: '32px', textAlign: 'center' }}>
              <span style={{ color: theme.textMuted, fontSize: '13px' }}>{t('po.detail.noReceiptsYet')}</span>
            </Card>
          )}
          {po.receipts.map((r) => {
            const receiptLineColumns: Column<{
              po_line_id: string
              description: string | null
              qty_received: number
            }>[] = [
              {
                key: 'description',
                header: t('po.detail.description'),
                mobilePrimary: true,
                render: (rl) => (
                  <span style={{ color: theme.textPrimary, fontWeight: 500 }}>{rl.description}</span>
                ),
              },
              {
                key: 'qty_received',
                header: t('po.detail.qtyReceived'),
                mobilePriority: 1,
                render: (rl) => (
                  <span style={{ color: BRAND_GREEN, fontWeight: 700, fontFamily: 'monospace' }}>
                    {rl.qty_received}
                  </span>
                ),
              },
            ]
            return (
              <Card key={r.id} style={{ marginBottom: '12px' }}>
                <div
                  style={{
                    padding: '16px 20px',
                    borderBottom: `1px solid ${theme.border}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    flexWrap: 'wrap',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontWeight: 600,
                      fontSize: '15px',
                      color: theme.textPrimary,
                    }}
                  >
                    <span style={{ color: theme.textMuted, display: 'flex' }}>
                      <IconBox />
                    </span>
                    {t('po.detail.receiptDate', { date: r.receipt_date })}
                  </div>
                  {r.status === 'draft' && (
                    <Badge variant="warning">{t('po.detail.draftNotYetAddedToInventory')}</Badge>
                  )}
                  {r.status === 'cancelled' && <Badge variant="danger">{t('po.detail.cancelled')}</Badge>}
                </div>
                <div style={{ padding: '16px 20px' }}>
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '12px',
                      marginBottom: '16px',
                    }}
                  >
                    <div
                      style={{
                        padding: '10px 14px',
                        borderRadius: '8px',
                        background: theme.bgCanvas,
                        border: `1px solid ${theme.border}`,
                        minWidth: '160px',
                      }}
                    >
                      <div style={{ fontSize: '11px', fontWeight: 500, color: theme.textMuted, marginBottom: '3px' }}>
                        {t('po.detail.location')}
                      </div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary }}>
                        {r.location_name ?? '—'}
                      </div>
                    </div>
                    <div
                      style={{
                        padding: '10px 14px',
                        borderRadius: '8px',
                        background: theme.bgCanvas,
                        border: `1px solid ${theme.border}`,
                        minWidth: '160px',
                      }}
                    >
                      <div style={{ fontSize: '11px', fontWeight: 500, color: theme.textMuted, marginBottom: '3px' }}>
                        {t('po.detail.receivedBy')}
                      </div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary }}>
                        {r.received_by_name ?? r.received_by_email ?? '—'}
                      </div>
                    </div>
                  </div>
                  {r.location_notes && (
                    <div
                      style={{ marginBottom: '10px', fontSize: '13px', color: theme.textSecondary }}
                    >
                      <span style={{ fontSize: '11px', color: theme.textMuted }}>
                        {t('po.detail.jobsiteLocationNotes')}{' '}
                      </span>
                      {r.location_notes}
                    </div>
                  )}
                  {r.notes && (
                    <div
                      style={{ marginBottom: '10px', fontSize: '13px', color: theme.textSecondary }}
                    >
                      <span style={{ fontSize: '11px', color: theme.textMuted }}>{t('po.detail.notes')} </span>
                      {r.notes}
                    </div>
                  )}
                  {r.photos.length > 0 && (
                    <div style={{ marginBottom: '16px' }}>
                      {(() => {
                        const vendorDocs = r.photos.filter(
                          (ph) => ph.category === 'po_receipt_document',
                        )
                        // Legacy receipts predate the vendor-doc/materials split — everything they
                        // have was captured under the old single 'po_receipt_photo' category, so it
                        // falls in here rather than vanishing from the group entirely.
                        const materialPhotos = r.photos.filter(
                          (ph) => ph.category !== 'po_receipt_document',
                        )
                        const groups: { title: string; description: string; photos: typeof r.photos }[] = [
                          ...(vendorDocs.length
                            ? [
                                {
                                  title: t('po.detail.vendorReceipt'),
                                  description: t('po.detail.theVendorSOwnReceiptOr'),
                                  photos: vendorDocs,
                                },
                              ]
                            : []),
                          ...(materialPhotos.length
                            ? [
                                {
                                  title: t('po.detail.materialsReceived'),
                                  description: t('po.detail.photosOfThePhysicalGoodsAs'),
                                  photos: materialPhotos,
                                },
                              ]
                            : []),
                        ]
                        return groups.map((g) => (
                          <div key={g.title} style={{ marginBottom: '16px' }}>
                            <div style={{ marginBottom: '8px' }}>
                              <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                                <span
                                  style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary }}
                                >
                                  {g.title}
                                </span>
                                <span style={{ fontSize: '12px', color: theme.textMuted }}>
                                  ({g.photos.length})
                                </span>
                              </div>
                              <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '1px' }}>
                                {g.description}
                              </div>
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                              {g.photos.map((ph) => renderPhotoThumb(ph))}
                            </div>
                          </div>
                        ))
                      })()}
                    </div>
                  )}
                  <div style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary, marginBottom: '8px' }}>
                    {t('po.detail.itemsReceived')}
                  </div>
                  <Table columns={receiptLineColumns} data={r.lines} />
                </div>
              </Card>
            )
          })}
          <div style={{ marginTop: '16px' }}>
            {/* This list is two different things merged for convenience,
                hence the split: genuine photos uploaded here against the PO
                itself, plus — for a G1 PO — every buyer's proof-of-purchase
                receipt captured per vendor purchase back at Items Bought
                (entityAttachments('purchase_order', ...) unions those in so
                they're visible without re-uploading). Unsplit, both looked
                like one undifferentiated "Delivery Photos" pile. */}
            <EntityAttachments
              entityType="purchase_order"
              entityId={po.id}
              recordLabel="this PO"
              title={t('po.detail.photos')}
              description={t('po.detail.buyerReceiptsFromItemsBoughtPlus')}
              uploadButtonLabel={t('po.detail.uploadPhoto')}
              emptyMessage={t('po.detail.noPhotosYet')}
              groupBy={[
                {
                  match: 'po_line_purchase',
                  title: t('po.detail.buyerReceipts'),
                  description:
                    t('po.detail.proofOfPurchaseTheBuyerAttached'),
                },
                {
                  match: 'purchase_order',
                  title: t('po.detail.deliveryPhotos'),
                  description:
                    t('po.detail.uploadedDirectlyAgainstThisPoE'),
                },
              ]}
            />
          </div>
        </div>
      )}

      {activeTab === 'returns' && (
        <div>
          {PO_RETURNABLE_STATUSES.includes(po.status) &&
            can('procurement.po.edit', 'edit') && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
                <Button
                  variant="primary"
                  style={PRIMARY_CTA_STYLE}
                  size="sm"
                  onClick={() => {
                    navigate(`/procurement/purchase-orders/${po.id}/returns/new`)
                  }}
                >
                  {t('po.detail.createReturn')}
                </Button>
              </div>
            )}
          {poReturns.length === 0 && (
            <Card style={{ padding: '32px', textAlign: 'center' }}>
              <span style={{ color: theme.textMuted, fontSize: '13px' }}>
                {t('po.detail.noReturnsOnThisPo')}
              </span>
            </Card>
          )}
          {poReturns.map((ret) => {
            const sc: Record<string, { bg: string; text: string }> = {
              draft: { bg: '#f9fafb', text: '#6b7280' },
              submitted: { bg: '#fffbeb', text: '#d97706' },
              approved: { bg: '#f0fdf4', text: '#16a34a' },
              credited: { bg: '#eff6ff', text: '#2563eb' },
            }
            const c = sc[ret.status] ?? sc.draft
            return (
              <Card
                key={ret.id}
                style={{ marginBottom: '10px', padding: '14px 18px', cursor: 'pointer' }}
                onClick={() => {
                  navigate(`/procurement/purchase-orders/${po.id}/returns/${ret.id}`)
                }}
              >
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}
                >
                  <span style={{ fontWeight: 600, fontSize: '13px', color: theme.textPrimary }}>
                    {ret.return_number}
                  </span>
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: '10px',
                      fontSize: '11px',
                      fontWeight: 600,
                      background: c.bg,
                      color: c.text,
                    }}
                  >
                    {ret.status.charAt(0).toUpperCase() + ret.status.slice(1)}
                  </span>
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      background: ret.return_type === 'damage' ? '#fff7ed' : '#f0fdf4',
                      color: ret.return_type === 'damage' ? '#c2410c' : '#15803d',
                    }}
                  >
                    {ret.return_type === 'damage' ? t('po.detail.damage') : t('po.detail.fullRefund')}
                  </span>
                  <div style={{ flex: 1 }} />
                  <span style={{ fontSize: '13px', fontWeight: 600, color: theme.accent }}>
                    {ret.currency_code}{' '}
                    {Number(ret.total_returned_value).toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {activeTab === 'approval_log' && (
        <Card>
          <div
            style={{
              padding: '16px 20px',
              borderBottom: `1px solid ${theme.border}`,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontWeight: 600,
              fontSize: '15px',
              color: theme.textPrimary,
            }}
          >
            <span style={{ color: theme.textMuted, display: 'flex' }}>
              <IconDocument />
            </span>
            {t('po.detail.approvalLog')}
          </div>
          <div
            style={{
              padding: '14px 16px',
              borderBottom: `1px solid ${theme.border}`,
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <Textarea
              value={logNoteText}
              onChange={(e) => setLogNoteText(e.target.value)}
              placeholder={t('po.detail.addNotePlaceholder')}
              rows={2}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                size="sm"
                disabled={!logNoteText.trim() || addingLogNote}
                onClick={() =>
                  void addLogNote({ variables: { poId: po.id, note: logNoteText.trim() } })
                }
              >
                {t('po.detail.addNote')}
              </Button>
            </div>
          </div>
          {po.notes && (
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
                {t('po.detail.poNotes')}
              </div>
              <div style={{ fontSize: '13px', color: theme.textPrimary, whiteSpace: 'pre-wrap' }}>
                {po.notes}
              </div>
            </div>
          )}
          {po.approval_log.length === 0 && !po.notes && (
            <div
              style={{
                padding: '32px',
                textAlign: 'center',
                color: theme.textMuted,
                fontSize: '13px',
              }}
            >
              {t('po.detail.noActivityYet')}
            </div>
          )}
          {po.approval_log.length === 0 && po.notes && (
            <div
              style={{
                padding: '16px',
                textAlign: 'center',
                color: theme.textMuted,
                fontSize: '13px',
              }}
            >
              {t('po.detail.noApprovalActivityYet')}
            </div>
          )}
          {po.approval_log.map((entry) => (
            <div
              key={entry.id}
              style={{
                display: 'flex',
                gap: '16px',
                padding: '12px 16px',
                borderBottom: `1px solid ${theme.border}22`,
                alignItems: 'center',
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
              <span style={{ fontSize: '13px', color: theme.textPrimary }}>{entry.user_email}</span>
              {entry.notes && (
                <span style={{ fontSize: '12px', color: theme.textMuted }}>{entry.notes}</span>
              )}
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
          const labelStyle: React.CSSProperties = {
            fontSize: '11px',
            fontWeight: 600,
            color: theme.textMuted,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            display: 'block',
            marginBottom: '4px',
          }

          const initDraft = (): EditDraft => ({
            notes: po.notes ?? '',
            expected_delivery_date: po.expected_delivery_date ?? '',
            lines: po.lines.map((l) => ({
              id: l.id,
              description: l.description ?? '',
              // qty/unit_price come off the wire as numeric strings (e.g.
              // "1.0000") despite the POLine type claiming number — parse
              // them so the edit-request inputs don't show trailing zeros.
              qty: parseFloat(String(l.qty)) || 0,
              unit_price: parseFloat(String(l.unit_price)) || 0,
              currency_code: l.market_price_currency ?? l.requested_currency_code ?? po.currency_code,
              store_price: parseFloat(String(l.store_price ?? 0)) || 0,
              actual_unit_price: parseFloat(String(l.actual_unit_price ?? 0)) || 0,
              uom: l.uom,
            })),
            linesAdded: [],
          })

          const buildChanges = (draft: EditDraft) => {
            const header: Record<string, { from: unknown; to: unknown }> = {}
            if (draft.notes !== (po.notes ?? ''))
              header.notes = { from: po.notes ?? '', to: draft.notes }
            if (draft.expected_delivery_date !== (po.expected_delivery_date ?? ''))
              header.expected_delivery_date = {
                from: po.expected_delivery_date ?? '',
                to: draft.expected_delivery_date,
              }
            const edited: { id: string; field: string; from: unknown; to: unknown }[] = []
            const removed: string[] = []
            for (const dl of draft.lines) {
              if (dl._removed) {
                removed.push(dl.id)
                continue
              }
              const orig = po.lines.find((l) => l.id === dl.id)
              if (!orig) continue
              if (dl.description !== orig.description)
                edited.push({
                  id: dl.id,
                  field: 'description',
                  from: orig.description,
                  to: dl.description,
                })
              // orig.qty/orig.unit_price are numeric strings off the wire
              // (POLine.qty/unit_price are String! in the schema); dl.qty/
              // dl.unit_price are genuine numbers — compare numerically or
              // every untouched decimal-formatted line falsely shows as
              // "changed" (1 !== "1.0000").
              if (dl.qty !== (parseFloat(String(orig.qty)) || 0))
                edited.push({ id: dl.id, field: 'qty_ordered', from: orig.qty, to: dl.qty })
              if (dl.unit_price !== (parseFloat(String(orig.unit_price)) || 0))
                edited.push({
                  id: dl.id,
                  field: 'unit_price',
                  from: orig.unit_price,
                  to: dl.unit_price,
                })
              const origCurrency =
                orig.market_price_currency ?? orig.requested_currency_code ?? po.currency_code
              if (dl.currency_code !== origCurrency)
                edited.push({
                  id: dl.id,
                  field: 'currency_code',
                  from: origCurrency,
                  to: dl.currency_code,
                })
              if (dl.store_price !== (parseFloat(String(orig.store_price ?? 0)) || 0))
                edited.push({
                  id: dl.id,
                  field: 'store_price',
                  from: orig.store_price ?? 0,
                  to: dl.store_price,
                })
              if (dl.actual_unit_price !== (parseFloat(String(orig.actual_unit_price ?? 0)) || 0))
                edited.push({
                  id: dl.id,
                  field: 'actual_unit_price',
                  from: orig.actual_unit_price ?? 0,
                  to: dl.actual_unit_price,
                })
              if (dl.uom !== orig.uom)
                edited.push({ id: dl.id, field: 'uom', from: orig.uom, to: dl.uom })
            }
            return { header, lines: { edited, added: draft.linesAdded, removed } }
          }

          const hasPending = (po.edit_requests ?? []).some((r) => r.status === 'pending')

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <fieldset
                disabled={lock.lockedByOther}
                style={{ border: 'none', padding: 0, margin: 0 }}
              >
                {/* ── Request edit form ── */}
                <Card style={{ padding: '20px' }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '16px',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontWeight: 600,
                        fontSize: '15px',
                        color: theme.textPrimary,
                      }}
                    >
                      <span style={{ color: theme.textMuted, display: 'flex' }}>
                        <IconDocument />
                      </span>
                      {t('po.detail.requestAnEdit')}
                    </div>
                    {hasPending && <Badge variant="warning">{t('po.detail.pendingReviewSubmitLocked')}</Badge>}
                    {!editDraft && !hasPending && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setEditDraft(initDraft())
                        }}
                      >
                        {t('po.detail.startEditing')}
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
                        {t('po.detail.cancel')}
                      </Button>
                    )}
                  </div>

                  {!editDraft && (
                    <div style={{ fontSize: '13px', color: theme.textMuted }}>
                      {hasPending
                        ? t('po.detail.thereIsAlreadyAPendingEdit')
                        : t('po.detail.clickStartEditingToProposeChanges')}
                    </div>
                  )}

                  {editDraft &&
                    (() => {
                      const existingLineFields: LineItemField<EditDraft['lines'][number]>[] = [
                        {
                          key: 'description',
                          label: t('po.detail.description'),
                          render: (line, i) => (
                            <input
                              value={line.description}
                              style={inputStyle}
                              disabled={line._removed}
                              onChange={(e) => {
                                const lines = [...editDraft.lines]
                                lines[i] = { ...lines[i], description: e.target.value }
                                setEditDraft({ ...editDraft, lines })
                              }}
                            />
                          ),
                        },
                        {
                          key: 'qty',
                          label: t('po.detail.qty'),
                          width: '80px',
                          render: (line, i) => (
                            <input
                              type="number"
                              value={line.qty}
                              style={inputStyle}
                              disabled={line._removed}
                              onChange={(e) => {
                                const lines = [...editDraft.lines]
                                lines[i] = { ...lines[i], qty: Number(e.target.value) }
                                setEditDraft({ ...editDraft, lines })
                              }}
                            />
                          ),
                        },
                        {
                          key: 'unit_price',
                          label: t('po.detail.unitPrice'),
                          width: '110px',
                          render: (line, i) => (
                            <input
                              type="number"
                              value={line.unit_price}
                              style={inputStyle}
                              disabled={line._removed}
                              onChange={(e) => {
                                const lines = [...editDraft.lines]
                                lines[i] = { ...lines[i], unit_price: Number(e.target.value) }
                                setEditDraft({ ...editDraft, lines })
                              }}
                            />
                          ),
                        },
                        {
                          key: 'currency_code',
                          label: t('po.detail.currency'),
                          width: '90px',
                          render: (line, i) => (
                            <select
                              value={line.currency_code}
                              style={inputStyle}
                              disabled={line._removed}
                              onChange={(e) => {
                                const lines = [...editDraft.lines]
                                lines[i] = { ...lines[i], currency_code: e.target.value }
                                setEditDraft({ ...editDraft, lines })
                              }}
                            >
                              {marketPricingCurrencyOptions.map((c) => (
                                <option key={c.value} value={c.value}>
                                  {c.label}
                                </option>
                              ))}
                            </select>
                          ),
                        },
                        {
                          key: 'store_price',
                          label: t('po.detail.storePrice'),
                          width: '100px',
                          render: (line, i) => (
                            <input
                              type="number"
                              value={line.store_price}
                              style={inputStyle}
                              disabled={line._removed}
                              onChange={(e) => {
                                const lines = [...editDraft.lines]
                                lines[i] = { ...lines[i], store_price: Number(e.target.value) }
                                setEditDraft({ ...editDraft, lines })
                              }}
                            />
                          ),
                        },
                        {
                          key: 'actual_unit_price',
                          label: t('po.detail.actualPrice'),
                          width: '100px',
                          render: (line, i) => (
                            <input
                              type="number"
                              value={line.actual_unit_price}
                              style={inputStyle}
                              disabled={line._removed}
                              onChange={(e) => {
                                const lines = [...editDraft.lines]
                                lines[i] = { ...lines[i], actual_unit_price: Number(e.target.value) }
                                setEditDraft({ ...editDraft, lines })
                              }}
                            />
                          ),
                        },
                        {
                          key: 'uom',
                          label: t('po.detail.uom'),
                          width: '70px',
                          render: (line, i) => (
                            <input
                              value={line.uom}
                              style={inputStyle}
                              disabled={line._removed}
                              onChange={(e) => {
                                const lines = [...editDraft.lines]
                                lines[i] = { ...lines[i], uom: e.target.value }
                                setEditDraft({ ...editDraft, lines })
                              }}
                            />
                          ),
                        },
                        {
                          key: 'actions',
                          label: '',
                          width: '70px',
                          render: (line, i) => (
                            <button
                              onClick={() => {
                                const lines = [...editDraft.lines]
                                lines[i] = { ...lines[i], _removed: !lines[i]._removed }
                                setEditDraft({ ...editDraft, lines })
                              }}
                              style={{
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                color: line._removed ? theme.accent : theme.danger,
                                fontSize: '12px',
                              }}
                            >
                              {line._removed ? t('po.detail.restore') : t('po.detail.remove')}
                            </button>
                          ),
                        },
                      ]

                      const addedLineFields: LineItemField<EditDraft['linesAdded'][number]>[] = [
                        {
                          key: 'description',
                          label: t('po.detail.productDescription'),
                          render: (line, i) => (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <SearchableSelect
                                value={line.product_id}
                                onChange={(v) => {
                                  const a = [...editDraft.linesAdded]
                                  const p = editProducts.find((pp) => pp.id === v)
                                  a[i] = {
                                    ...a[i],
                                    product_id: v,
                                    ...(p ? { description: p.name, uom: p.uom } : {}),
                                  }
                                  setEditDraft({ ...editDraft, linesAdded: a })
                                }}
                                options={editProductOptions}
                                placeholder={t('po.detail.searchByNameOrSku')}
                                minDropdownWidth={360}
                              />
                              <input
                                placeholder={t('po.detail.description')}
                                value={line.description}
                                style={inputStyle}
                                onChange={(e) => {
                                  const a = [...editDraft.linesAdded]
                                  a[i] = { ...a[i], description: e.target.value }
                                  setEditDraft({ ...editDraft, linesAdded: a })
                                }}
                              />
                            </div>
                          ),
                        },
                        {
                          key: 'qty',
                          label: t('po.detail.qty'),
                          width: '80px',
                          render: (line, i) => (
                            <input
                              type="number"
                              value={line.qty}
                              style={inputStyle}
                              onChange={(e) => {
                                const a = [...editDraft.linesAdded]
                                a[i] = { ...a[i], qty: Number(e.target.value) }
                                setEditDraft({ ...editDraft, linesAdded: a })
                              }}
                            />
                          ),
                        },
                        {
                          key: 'unit_price',
                          label: t('po.detail.unitPrice'),
                          width: '110px',
                          render: (line, i) => (
                            <input
                              type="number"
                              value={line.unit_price}
                              style={inputStyle}
                              onChange={(e) => {
                                const a = [...editDraft.linesAdded]
                                a[i] = { ...a[i], unit_price: Number(e.target.value) }
                                setEditDraft({ ...editDraft, linesAdded: a })
                              }}
                            />
                          ),
                        },
                        {
                          key: 'uom',
                          label: t('po.detail.uom'),
                          width: '70px',
                          render: (line, i) => (
                            <input
                              value={line.uom}
                              style={inputStyle}
                              onChange={(e) => {
                                const a = [...editDraft.linesAdded]
                                a[i] = { ...a[i], uom: e.target.value }
                                setEditDraft({ ...editDraft, linesAdded: a })
                              }}
                            />
                          ),
                        },
                      ]

                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                          {/* Header fields */}
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                              gap: '12px',
                            }}
                          >
                            <div>
                              <label style={labelStyle}>{t('po.detail.notes2')}</label>
                              <textarea
                                value={editDraft.notes}
                                rows={2}
                                style={{ ...inputStyle, resize: 'vertical' }}
                                onChange={(e) => {
                                  setEditDraft({ ...editDraft, notes: e.target.value })
                                }}
                              />
                            </div>
                            <div>
                              <label style={labelStyle}>{t('po.detail.expectedDelivery')}</label>
                              <input
                                type="date"
                                value={editDraft.expected_delivery_date}
                                style={inputStyle}
                                onChange={(e) => {
                                  setEditDraft({
                                    ...editDraft,
                                    expected_delivery_date: e.target.value,
                                  })
                                }}
                              />
                            </div>
                          </div>

                          {/* Lines */}
                          <div>
                            <div
                              style={{
                                fontSize: '11px',
                                fontWeight: 600,
                                color: theme.textMuted,
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                                marginBottom: '8px',
                              }}
                            >
                              {t('po.detail.lineItems')}
                            </div>
                            <LineItemEditor
                              fields={existingLineFields}
                              rows={editDraft.lines}
                              rowKey={(line) => line.id}
                              getRowStyle={(line) => ({ opacity: line._removed ? 0.4 : 1 })}
                            />
                            <div style={{ marginTop: '10px' }}>
                              <LineItemEditor
                                fields={addedLineFields}
                                rows={editDraft.linesAdded}
                                rowKey={(_, i) => `new-${i}`}
                                getRowStyle={() => ({ background: theme.accentBg + '44' })}
                                onRemoveRow={(idx) => {
                                  const a = editDraft.linesAdded.filter((_, j) => j !== idx)
                                  setEditDraft({ ...editDraft, linesAdded: a })
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
                                addLabel={t('po.detail.addLine')}
                                emptyMessage={t('po.detail.noNewLinesAdded')}
                              />
                            </div>
                          </div>

                          {/* Submit */}
                          <div>
                            <label style={labelStyle}>{t('po.detail.reasonForChangesOptional')}</label>
                            <input
                              value={editRequestNotes}
                              style={inputStyle}
                              placeholder={t('po.detail.explainWhyTheseChangesAreNeeded')}
                              onChange={(e) => {
                                setEditRequestNotes(e.target.value)
                              }}
                            />
                          </div>
                          <div>
                            <Button
                              variant="primary"
                              style={PRIMARY_CTA_STYLE}
                              loading={leR}
                              onClick={() => {
                                const changes = buildChanges(editDraft)
                                // 0 is ambiguous with "not recorded" — reject it the same
                                // way the items_bought checklist input does, rather than
                                // silently submitting a price that's almost certainly not
                                // real.
                                const zeroActualPrice = changes.lines.edited.some(
                                  (e) => e.field === 'actual_unit_price' && e.to === 0,
                                )
                                if (zeroActualPrice) {
                                  addToast({
                                    type: 'error',
                                    message: t('po.detail.actualPriceMustBeGreaterThan2'),
                                  })
                                  return
                                }
                                void submitEditRequest({
                                  variables: {
                                    id: po.id,
                                    changes: JSON.stringify(changes),
                                    notes: editRequestNotes || undefined,
                                  },
                                })
                              }}
                            >
                              {t('po.detail.submitEditRequest')}
                            </Button>
                          </div>
                        </div>
                      )
                    })()}
                </Card>

                {/* ── Edit request history ── */}
                <Card>
                  <div
                    style={{
                      padding: '16px 20px',
                      borderBottom: `1px solid ${theme.border}`,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontWeight: 600,
                      fontSize: '15px',
                      color: theme.textPrimary,
                    }}
                  >
                    <span style={{ color: theme.textMuted, display: 'flex' }}>
                      <IconBox />
                    </span>
                    {t('po.detail.editRequestHistory')}
                  </div>
                  {(po.edit_requests ?? []).length === 0 && (
                    <div
                      style={{
                        padding: '32px',
                        textAlign: 'center',
                        fontSize: '13px',
                        color: theme.textMuted,
                      }}
                    >
                      {t('po.detail.noEditRequestsYet')}
                    </div>
                  )}
                  {(po.edit_requests ?? []).map((er) => (
                    <EditRequestCard
                      key={er.id}
                      request={er}
                      currentLines={po.lines}
                      primaryStyle={PRIMARY_CTA_STYLE}
                      approving={leA}
                      rejecting={leJ}
                      onApprove={(requestId, notes) => {
                        void approveEditRequest({
                          variables: { id: po.id, requestId, reviewNotes: notes },
                        })
                      }}
                      onReject={(requestId, notes) => {
                        void rejectEditRequest({
                          variables: { id: po.id, requestId, reviewNotes: notes },
                        })
                      }}
                    />
                  ))}
                </Card>
              </fieldset>
            </div>
          )
        })()}

      {activeTab === 'admin_correction' &&
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
          const labelStyle: React.CSSProperties = {
            fontSize: '11px',
            fontWeight: 600,
            color: theme.textMuted,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            display: 'block',
            marginBottom: '4px',
          }

          const initAdminDraft = (): AdminCorrectionDraft => ({
            vendor_id: po.vendor_id ?? '',
            currency_code: po.currency_code,
            analytic_account_id: po.analytic_account_id ?? '',
            notes: po.notes ?? '',
            expected_delivery_date: po.expected_delivery_date ?? '',
            priority: po.priority,
            assigned_receiver_id: po.assigned_receiver_id ?? '',
            branch_id: po.branch_id ?? '',
            delivery_destination: po.delivery_destination ?? '',
            lines: po.lines.map((l) => ({
              id: l.id,
              product_id: l.product_id ?? '',
              description: l.description ?? '',
              qty: parseFloat(String(l.qty)) || 0,
              unit_price: parseFloat(String(l.unit_price)) || 0,
              uom: l.uom,
              source_location_id: l.source_location_id ?? '',
            })),
            receipts: po.receipts.map((r) => ({
              id: r.id,
              warehouse_location_id: r.location_id ?? '',
              location_notes: r.location_notes ?? '',
              received_by_name: r.received_by_name ?? '',
              received_from_name: r.received_from_name ?? '',
              notes: r.notes ?? '',
            })),
            receiptLines: po.receipts.flatMap((r) =>
              r.lines
                .filter((l): l is typeof l & { id: string } => !!l.id)
                .map((l) => ({
                  id: l.id,
                  qty_received: parseFloat(String(l.qty_received)) || 0,
                  actual_unit_price: parseFloat(String(l.actual_unit_price ?? 0)) || 0,
                })),
            ),
          })

          const buildAdminChanges = (draft: AdminCorrectionDraft) => {
            const header: Record<string, { from: unknown; to: unknown }> = {}
            const headerFields: [keyof AdminCorrectionDraft, string][] = [
              ['vendor_id', po.vendor_id ?? ''],
              ['currency_code', po.currency_code],
              ['analytic_account_id', po.analytic_account_id ?? ''],
              ['notes', po.notes ?? ''],
              ['expected_delivery_date', po.expected_delivery_date ?? ''],
              ['priority', po.priority],
              ['assigned_receiver_id', po.assigned_receiver_id ?? ''],
              ['branch_id', po.branch_id ?? ''],
              ['delivery_destination', po.delivery_destination ?? ''],
            ]
            for (const [field, orig] of headerFields) {
              const val = draft[field] as string
              if (val !== orig) header[field] = { from: orig || null, to: val || null }
            }

            const linesEdited: { id: string; field: string; from: unknown; to: unknown }[] = []
            for (const dl of draft.lines) {
              const orig = po.lines.find((l) => l.id === dl.id)
              if (!orig) continue
              if (dl.product_id !== (orig.product_id ?? ''))
                linesEdited.push({
                  id: dl.id,
                  field: 'product_id',
                  from: orig.product_id ?? null,
                  to: dl.product_id || null,
                })
              if (dl.description !== orig.description)
                linesEdited.push({
                  id: dl.id,
                  field: 'description',
                  from: orig.description,
                  to: dl.description,
                })
              // orig.qty/orig.unit_price come off the wire as numeric strings
              // (POLine.qty/unit_price are String! in the schema — e.g.
              // "1.0000") despite the frontend POLine type claiming number;
              // dl.qty/dl.unit_price are genuine numbers (parseFloat'd at
              // draft-init time). Comparing them directly with !== always
              // mismatched (1 !== "1.0000"), so every untouched line with a
              // decimal-formatted qty/price falsely counted as "changed".
              if (dl.qty !== (parseFloat(String(orig.qty)) || 0))
                linesEdited.push({ id: dl.id, field: 'qty_ordered', from: orig.qty, to: dl.qty })
              if (dl.unit_price !== (parseFloat(String(orig.unit_price)) || 0))
                linesEdited.push({
                  id: dl.id,
                  field: 'unit_price',
                  from: orig.unit_price,
                  to: dl.unit_price,
                })
              if (dl.uom !== orig.uom)
                linesEdited.push({ id: dl.id, field: 'uom', from: orig.uom, to: dl.uom })
              if (dl.source_location_id !== (orig.source_location_id ?? ''))
                linesEdited.push({
                  id: dl.id,
                  field: 'source_location_id',
                  from: orig.source_location_id ?? null,
                  to: dl.source_location_id || null,
                })
            }

            const receiptsEdited: { id: string; field: string; from: unknown; to: unknown }[] = []
            for (const dr of draft.receipts) {
              const orig = po.receipts.find((r) => r.id === dr.id)
              if (!orig) continue
              const recFields: [keyof (typeof draft.receipts)[number], string][] = [
                ['warehouse_location_id', orig.location_id ?? ''],
                ['location_notes', orig.location_notes ?? ''],
                ['received_by_name', orig.received_by_name ?? ''],
                ['received_from_name', orig.received_from_name ?? ''],
                ['notes', orig.notes ?? ''],
              ]
              for (const [field, origVal] of recFields) {
                const val = dr[field]
                if (val !== origVal)
                  receiptsEdited.push({ id: dr.id, field, from: origVal || null, to: val || null })
              }
            }

            const receiptLinesEdited: { id: string; field: string; from: unknown; to: unknown }[] =
              []
            for (const drl of draft.receiptLines) {
              const origLine = po.receipts
                .flatMap((r) => r.lines)
                .find((l) => l.id === drl.id)
              if (!origLine) continue
              // Same numeric-string-vs-number mismatch as the po_lines diff
              // above — POReceiptLine.qty_received is String! on the wire.
              if (drl.qty_received !== (parseFloat(String(origLine.qty_received)) || 0))
                receiptLinesEdited.push({
                  id: drl.id,
                  field: 'qty_received',
                  from: origLine.qty_received,
                  to: drl.qty_received,
                })
              const origActual = parseFloat(String(origLine.actual_unit_price ?? 0)) || 0
              if (drl.actual_unit_price !== origActual)
                receiptLinesEdited.push({
                  id: drl.id,
                  field: 'actual_unit_price',
                  from: origActual,
                  to: drl.actual_unit_price,
                })
            }

            return {
              header,
              lines: { edited: linesEdited },
              receipts: { edited: receiptsEdited },
              receiptLines: { edited: receiptLinesEdited },
            }
          }

          const changesPreview = adminCorrectionDraft ? buildAdminChanges(adminCorrectionDraft) : null
          const totalChanges = changesPreview
            ? Object.keys(changesPreview.header).length +
              changesPreview.lines.edited.length +
              changesPreview.receipts.edited.length +
              changesPreview.receiptLines.edited.length
            : 0

          const lineFields: LineItemField<AdminCorrectionDraft['lines'][number]>[] = [
            {
              key: 'product_id',
              label: t('po.detail.product'),
              render: (line, i) => (
                <select
                  value={line.product_id}
                  style={inputStyle}
                  onChange={(e) => {
                    if (!adminCorrectionDraft) return
                    const lines = [...adminCorrectionDraft.lines]
                    lines[i] = { ...lines[i], product_id: e.target.value }
                    setAdminCorrectionDraft({ ...adminCorrectionDraft, lines })
                  }}
                >
                  <option value="">{t('po.detail.noCatalogProduct')}</option>
                  {adminCorrectionProducts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.sku} — {p.name}
                    </option>
                  ))}
                </select>
              ),
            },
            {
              key: 'description',
              label: t('po.detail.description'),
              render: (line, i) => (
                <input
                  value={line.description}
                  style={inputStyle}
                  onChange={(e) => {
                    if (!adminCorrectionDraft) return
                    const lines = [...adminCorrectionDraft.lines]
                    lines[i] = { ...lines[i], description: e.target.value }
                    setAdminCorrectionDraft({ ...adminCorrectionDraft, lines })
                  }}
                />
              ),
            },
            {
              key: 'qty',
              label: t('po.detail.qty'),
              width: '90px',
              render: (line, i) => (
                <input
                  type="number"
                  value={line.qty}
                  style={inputStyle}
                  onChange={(e) => {
                    if (!adminCorrectionDraft) return
                    const lines = [...adminCorrectionDraft.lines]
                    lines[i] = { ...lines[i], qty: Number(e.target.value) }
                    setAdminCorrectionDraft({ ...adminCorrectionDraft, lines })
                  }}
                />
              ),
            },
            {
              key: 'unit_price',
              label: t('po.detail.unitPrice'),
              width: '110px',
              render: (line, i) => (
                <input
                  type="number"
                  value={line.unit_price}
                  style={inputStyle}
                  onChange={(e) => {
                    if (!adminCorrectionDraft) return
                    const lines = [...adminCorrectionDraft.lines]
                    lines[i] = { ...lines[i], unit_price: Number(e.target.value) }
                    setAdminCorrectionDraft({ ...adminCorrectionDraft, lines })
                  }}
                />
              ),
            },
            {
              key: 'uom',
              label: t('po.detail.uom'),
              width: '80px',
              render: (line, i) => (
                <input
                  value={line.uom}
                  style={inputStyle}
                  onChange={(e) => {
                    if (!adminCorrectionDraft) return
                    const lines = [...adminCorrectionDraft.lines]
                    lines[i] = { ...lines[i], uom: e.target.value }
                    setAdminCorrectionDraft({ ...adminCorrectionDraft, lines })
                  }}
                />
              ),
            },
            {
              key: 'source_location_id',
              label: t('po.detail.stockSource'),
              render: (line, i) => (
                <select
                  value={line.source_location_id}
                  style={inputStyle}
                  onChange={(e) => {
                    if (!adminCorrectionDraft) return
                    const lines = [...adminCorrectionDraft.lines]
                    lines[i] = { ...lines[i], source_location_id: e.target.value }
                    setAdminCorrectionDraft({ ...adminCorrectionDraft, lines })
                  }}
                >
                  <option value="">{t('po.detail.defaultWarehouse')}</option>
                  {stockLocations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              ),
            },
          ]

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div
                style={{
                  padding: '12px 16px',
                  background: '#fffbeb',
                  border: '1px solid #fde68a',
                  borderRadius: '8px',
                  fontSize: '13px',
                  color: '#92400e',
                }}
              >
                {t('po.detail.adminCorrectionAppliesImmediatelyThereIs')}
              </div>

              {!adminCorrectionDraft && (
                <div>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setAdminCorrectionDraft(initAdminDraft())
                      setAdminCorrectionConfirming(false)
                    }}
                  >
                    {t('po.detail.startCorrection')}
                  </Button>
                </div>
              )}

              {adminCorrectionDraft && (
                <>
                  <Card style={{ padding: '20px' }}>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: '14px',
                        color: theme.textPrimary,
                        marginBottom: '12px',
                      }}
                    >
                      {t('po.detail.header')}
                    </div>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                        gap: '12px',
                      }}
                    >
                      <div>
                        <label style={labelStyle}>{t('po.detail.vendor')}</label>
                        <select
                          value={adminCorrectionDraft.vendor_id}
                          style={inputStyle}
                          onChange={(e) => {
                            setAdminCorrectionDraft({
                              ...adminCorrectionDraft,
                              vendor_id: e.target.value,
                            })
                          }}
                        >
                          <option value="">{t('po.detail.none')}</option>
                          {vendors.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label style={labelStyle}>{t('po.detail.currency')}</label>
                        <select
                          value={adminCorrectionDraft.currency_code}
                          style={inputStyle}
                          onChange={(e) => {
                            setAdminCorrectionDraft({
                              ...adminCorrectionDraft,
                              currency_code: e.target.value,
                            })
                          }}
                        >
                          {marketPricingCurrencyOptions.map((c) => (
                            <option key={c.value} value={c.value}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label style={labelStyle}>{t('po.detail.analyticAccount')}</label>
                        <select
                          value={adminCorrectionDraft.analytic_account_id}
                          style={inputStyle}
                          onChange={(e) => {
                            setAdminCorrectionDraft({
                              ...adminCorrectionDraft,
                              analytic_account_id: e.target.value,
                            })
                          }}
                        >
                          <option value="">{t('po.detail.none')}</option>
                          {analyticAccounts.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.code} — {a.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label style={labelStyle}>{t('po.detail.priority')}</label>
                        <select
                          value={adminCorrectionDraft.priority}
                          style={inputStyle}
                          onChange={(e) => {
                            setAdminCorrectionDraft({
                              ...adminCorrectionDraft,
                              priority: e.target.value,
                            })
                          }}
                        >
                          <option value="low">{t('po.detail.low')}</option>
                          <option value="high">{t('po.detail.high')}</option>
                          <option value="emergency">{t('po.detail.emergency')}</option>
                        </select>
                      </div>
                      <div>
                        <label style={labelStyle}>{t('po.detail.receivedBy2')}</label>
                        <select
                          value={adminCorrectionDraft.assigned_receiver_id}
                          style={inputStyle}
                          onChange={(e) => {
                            setAdminCorrectionDraft({
                              ...adminCorrectionDraft,
                              assigned_receiver_id: e.target.value,
                            })
                          }}
                        >
                          <option value="">{t('po.detail.unassigned')}</option>
                          {employees.map((e) => (
                            <option key={e.id} value={e.id}>
                              {e.first_name} {e.last_name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label style={labelStyle}>{t('po.detail.branch')}</label>
                        <select
                          value={adminCorrectionDraft.branch_id}
                          style={inputStyle}
                          onChange={(e) => {
                            setAdminCorrectionDraft({
                              ...adminCorrectionDraft,
                              branch_id: e.target.value,
                            })
                          }}
                        >
                          <option value="">{t('po.detail.none')}</option>
                          {branches.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      {po.purpose === 'project' && (
                        <div>
                          <label style={labelStyle}>{t('po.detail.deliveryDestination')}</label>
                          <select
                            value={adminCorrectionDraft.delivery_destination}
                            style={inputStyle}
                            onChange={(e) => {
                              setAdminCorrectionDraft({
                                ...adminCorrectionDraft,
                                delivery_destination: e.target.value,
                              })
                            }}
                          >
                            <option value="inventory">{t('po.detail.warehouseInventory')}</option>
                            <option value="jobsite">{t('po.detail.directToJobsite')}</option>
                          </select>
                        </div>
                      )}
                      <div>
                        <label style={labelStyle}>{t('po.detail.expectedDelivery')}</label>
                        <input
                          type="date"
                          value={adminCorrectionDraft.expected_delivery_date}
                          style={inputStyle}
                          onChange={(e) => {
                            setAdminCorrectionDraft({
                              ...adminCorrectionDraft,
                              expected_delivery_date: e.target.value,
                            })
                          }}
                        />
                      </div>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <label style={labelStyle}>{t('po.detail.notes2')}</label>
                        <textarea
                          value={adminCorrectionDraft.notes}
                          rows={2}
                          style={{ ...inputStyle, resize: 'vertical' }}
                          onChange={(e) => {
                            setAdminCorrectionDraft({
                              ...adminCorrectionDraft,
                              notes: e.target.value,
                            })
                          }}
                        />
                      </div>
                    </div>
                  </Card>

                  <Card style={{ padding: '20px' }}>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: '14px',
                        color: theme.textPrimary,
                        marginBottom: '12px',
                      }}
                    >
                      {t('po.detail.lines')}
                    </div>
                    <LineItemEditor
                      fields={lineFields}
                      rows={adminCorrectionDraft.lines}
                      rowKey={(line) => line.id}
                    />
                  </Card>

                  {adminCorrectionDraft.receipts.map((dr, ri) => {
                    const orig = po.receipts.find((r) => r.id === dr.id)
                    const receiptLineRows = adminCorrectionDraft.receiptLines.filter((rl) =>
                      orig?.lines.some((l) => l.id === rl.id),
                    )
                    return (
                      <Card key={dr.id} style={{ padding: '20px' }}>
                        <div
                          style={{
                            fontWeight: 600,
                            fontSize: '14px',
                            color: theme.textPrimary,
                            marginBottom: '12px',
                          }}
                        >
                          {t('po.detail.receiptWithDate', { date: orig?.receipt_date?.slice(0, 10) ?? '' })}{' '}
                          <Badge variant={orig?.status === 'confirmed' ? 'success' : 'neutral'}>
                            {orig?.status}
                          </Badge>
                        </div>
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                            gap: '12px',
                            marginBottom: '14px',
                          }}
                        >
                          <div>
                            <label style={labelStyle}>{t('po.detail.warehouseLocation')}</label>
                            <select
                              value={dr.warehouse_location_id}
                              style={inputStyle}
                              onChange={(e) => {
                                const receipts = [...adminCorrectionDraft.receipts]
                                receipts[ri] = {
                                  ...receipts[ri],
                                  warehouse_location_id: e.target.value,
                                }
                                setAdminCorrectionDraft({ ...adminCorrectionDraft, receipts })
                              }}
                            >
                              <option value="">{t('po.detail.defaultWarehouse')}</option>
                              {stockLocations.map((l) => (
                                <option key={l.id} value={l.id}>
                                  {l.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label style={labelStyle}>{t('po.detail.locationNotes')}</label>
                            <input
                              value={dr.location_notes}
                              style={inputStyle}
                              onChange={(e) => {
                                const receipts = [...adminCorrectionDraft.receipts]
                                receipts[ri] = { ...receipts[ri], location_notes: e.target.value }
                                setAdminCorrectionDraft({ ...adminCorrectionDraft, receipts })
                              }}
                            />
                          </div>
                          <div>
                            <label style={labelStyle}>{t('po.detail.receivedBy2')}</label>
                            <input
                              value={dr.received_by_name}
                              style={inputStyle}
                              onChange={(e) => {
                                const receipts = [...adminCorrectionDraft.receipts]
                                receipts[ri] = {
                                  ...receipts[ri],
                                  received_by_name: e.target.value,
                                }
                                setAdminCorrectionDraft({ ...adminCorrectionDraft, receipts })
                              }}
                            />
                          </div>
                          <div>
                            <label style={labelStyle}>{t('po.detail.receivedFrom')}</label>
                            <input
                              value={dr.received_from_name}
                              style={inputStyle}
                              onChange={(e) => {
                                const receipts = [...adminCorrectionDraft.receipts]
                                receipts[ri] = {
                                  ...receipts[ri],
                                  received_from_name: e.target.value,
                                }
                                setAdminCorrectionDraft({ ...adminCorrectionDraft, receipts })
                              }}
                            />
                          </div>
                          <div style={{ gridColumn: '1 / -1' }}>
                            <label style={labelStyle}>{t('po.detail.receiptNotes')}</label>
                            <input
                              value={dr.notes}
                              style={inputStyle}
                              onChange={(e) => {
                                const receipts = [...adminCorrectionDraft.receipts]
                                receipts[ri] = { ...receipts[ri], notes: e.target.value }
                                setAdminCorrectionDraft({ ...adminCorrectionDraft, receipts })
                              }}
                            />
                          </div>
                        </div>
                        {receiptLineRows.length > 0 && (
                          <LineItemEditor
                            fields={[
                              {
                                key: 'description',
                                label: t('po.detail.line'),
                                render: (rl) => {
                                  const l = orig?.lines.find((x) => x.id === rl.id)
                                  return (
                                    <span style={{ fontSize: '13px', color: theme.textPrimary }}>
                                      {l?.description}
                                    </span>
                                  )
                                },
                              },
                              {
                                key: 'qty_received',
                                label: t('po.detail.qtyReceived'),
                                width: '110px',
                                render: (rl) => (
                                  <input
                                    type="number"
                                    value={rl.qty_received}
                                    style={inputStyle}
                                    onChange={(e) => {
                                      const receiptLines = adminCorrectionDraft.receiptLines.map(
                                        (x) =>
                                          x.id === rl.id
                                            ? { ...x, qty_received: Number(e.target.value) }
                                            : x,
                                      )
                                      setAdminCorrectionDraft({
                                        ...adminCorrectionDraft,
                                        receiptLines,
                                      })
                                    }}
                                  />
                                ),
                              },
                              {
                                key: 'actual_unit_price',
                                label: t('po.detail.actualUnitPrice'),
                                width: '130px',
                                render: (rl) => (
                                  <input
                                    type="number"
                                    value={rl.actual_unit_price}
                                    style={inputStyle}
                                    onChange={(e) => {
                                      const receiptLines = adminCorrectionDraft.receiptLines.map(
                                        (x) =>
                                          x.id === rl.id
                                            ? { ...x, actual_unit_price: Number(e.target.value) }
                                            : x,
                                      )
                                      setAdminCorrectionDraft({
                                        ...adminCorrectionDraft,
                                        receiptLines,
                                      })
                                    }}
                                  />
                                ),
                              },
                            ]}
                            rows={receiptLineRows}
                            rowKey={(rl) => rl.id}
                          />
                        )}
                      </Card>
                    )
                  })}

                  <Card style={{ padding: '20px' }}>
                    <label style={labelStyle}>{t('po.detail.reasonForThisCorrectionRequired')}</label>
                    <input
                      value={adminCorrectionReason}
                      style={inputStyle}
                      placeholder={t('po.detail.explainWhyThisCorrectionIsNeeded')}
                      onChange={(e) => {
                        setAdminCorrectionReason(e.target.value)
                      }}
                    />
                    <div
                      style={{
                        marginTop: '14px',
                        display: 'flex',
                        gap: '10px',
                        alignItems: 'center',
                      }}
                    >
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setAdminCorrectionDraft(null)
                          setAdminCorrectionConfirming(false)
                          setAdminCorrectionReason('')
                        }}
                      >
                        {t('po.detail.cancel')}
                      </Button>
                      {!adminCorrectionConfirming && (
                        <Button
                          variant="primary"
                          style={PRIMARY_CTA_STYLE}
                          disabled={totalChanges === 0 || !adminCorrectionReason.trim()}
                          onClick={() => {
                            setAdminCorrectionConfirming(true)
                          }}
                        >
                          {totalChanges === 0
                            ? t('po.detail.noChangesYet')
                            : t('po.detail.reviewChanges', { count: totalChanges })}
                        </Button>
                      )}
                      {adminCorrectionConfirming && (
                        <>
                          <span style={{ fontSize: '13px', color: theme.danger }}>
                            {t('po.detail.applyConfirm', { count: totalChanges })}
                          </span>
                          <Button
                            variant="danger"
                            loading={adminCorrecting}
                            onClick={() => {
                              if (!changesPreview) return
                              void adminCorrectPO({
                                variables: {
                                  id: po.id,
                                  changes: JSON.stringify(changesPreview),
                                  reason: adminCorrectionReason,
                                },
                              })
                            }}
                          >
                            {t('po.detail.yesApplyCorrection')}
                          </Button>
                          <Button
                            variant="secondary"
                            onClick={() => {
                              setAdminCorrectionConfirming(false)
                            }}
                          >
                            {t('po.detail.back')}
                          </Button>
                        </>
                      )}
                    </div>
                  </Card>
                </>
              )}
            </div>
          )
        })()}
        </div>
      </div>

      {/* assignDeptHead reserved for future use */}

      {/* Photo lightbox — scroll to zoom, drag to pan */}
      {lightboxUrl && (
        <div
          ref={lbOverlayRef}
          onMouseMove={onLbMouseMove}
          onMouseUp={onLbMouseUp}
          onMouseLeave={onLbMouseUp}
          onClick={closeLightbox}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.88)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            userSelect: 'none',
          }}
        >
          <img
            src={lightboxUrl}
            alt={t('po.detail.receiptPhoto')}
            onMouseDown={onLbMouseDown}
            onClick={(e) => {
              e.stopPropagation()
            }}
            draggable={false}
            style={{
              maxWidth: '90vw',
              maxHeight: '90vh',
              borderRadius: '8px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
              objectFit: 'contain',
              transform: `translate(${lbOffset.x}px, ${lbOffset.y}px) scale(${lbScale})`,
              transformOrigin: 'center center',
              transition: lbDrag.current ? 'none' : 'transform 0.1s ease',
              cursor: lbScale > 1 ? (lbDrag.current ? 'grabbing' : 'grab') : 'zoom-in',
            }}
          />
          {/* Zoom controls */}
          <div
            style={{
              position: 'fixed',
              bottom: '24px',
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              gap: '8px',
              alignItems: 'center',
            }}
          >
            <button
              onClick={(e) => {
                e.stopPropagation()
                setLbScale((s) => Math.max(0.5, s - 0.25))
              }}
              style={{
                background: 'rgba(255,255,255,0.15)',
                border: 'none',
                borderRadius: '6px',
                color: '#fff',
                width: '32px',
                height: '32px',
                fontSize: '18px',
                cursor: 'pointer',
              }}
            >
              −
            </button>
            <span
              style={{ color: '#fff', fontSize: '13px', minWidth: '44px', textAlign: 'center' }}
            >
              {Math.round(lbScale * 100)}%
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setLbScale((s) => Math.min(8, s + 0.25))
              }}
              style={{
                background: 'rgba(255,255,255,0.15)',
                border: 'none',
                borderRadius: '6px',
                color: '#fff',
                width: '32px',
                height: '32px',
                fontSize: '18px',
                cursor: 'pointer',
              }}
            >
              +
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setLbScale(1)
                setLbOffset({ x: 0, y: 0 })
              }}
              style={{
                background: 'rgba(255,255,255,0.15)',
                border: 'none',
                borderRadius: '6px',
                color: '#fff',
                padding: '0 10px',
                height: '32px',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              {t('po.detail.reset')}
            </button>
          </div>
          <button
            onClick={closeLightbox}
            style={{
              position: 'fixed',
              top: '16px',
              right: '20px',
              background: 'rgba(255,255,255,0.15)',
              border: 'none',
              borderRadius: '50%',
              color: '#fff',
              width: '36px',
              height: '36px',
              fontSize: '20px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Line Comments Modal */}
      {commentModal &&
        (() => {
          const FLAG_META: Record<string, { color: string; bg: string; label: string }> = {
            info: { color: '#3b82f6', bg: 'rgba(59,130,246,0.1)', label: t('po.detail.info') },
            warning: { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', label: t('po.detail.warning') },
            dispute: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)', label: t('po.detail.dispute') },
          }
          const comments = lineComments[commentModal.lineId] ?? []
          const auditLine = po.lines.find((l) => l.id === commentModal.lineId)
          const auditFlag = auditLine?.audit_status === 'flagged' ? auditLine : null
          const fmt = (iso: string) => {
            const d = new Date(iso)
            return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()} | ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
          }
          const handleAddComment = async () => {
            if (!newComment.trim() || !id) return
            setAddingComment(true)
            try {
              await addLineComment({
                variables: {
                  poId: id,
                  lineId: commentModal.lineId,
                  comment: newComment.trim(),
                  flag: newFlag || undefined,
                },
              })
              fetchLineComments()
              setNewComment('')
              setNewFlag('')
              addToast({ type: 'success', message: t('po.detail.commentAdded') })
            } catch {
              addToast({ type: 'error', message: t('po.detail.failedToAddComment') })
            } finally {
              setAddingComment(false)
            }
          }
          const handleResolve = async (commentId: string) => {
            if (!id) return
            setResolvingId(commentId)
            try {
              await resolveLineComment({ variables: { poId: id, commentId } })
              fetchLineComments()
              addToast({ type: 'success', message: t('po.detail.flagResolved') })
            } catch {
              addToast({ type: 'error', message: t('po.detail.failedToResolveFlag') })
            } finally {
              setResolvingId(null)
            }
          }
          return (
            <div
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.45)',
                zIndex: 1000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '16px',
              }}
              onClick={(e) => {
                if (e.target === e.currentTarget) setCommentModal(null)
              }}
            >
              <div
                style={{
                  background: theme.bgSurface,
                  borderRadius: '12px',
                  width: '100%',
                  maxWidth: '500px',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
                  display: 'flex',
                  flexDirection: 'column',
                  maxHeight: '90vh',
                  overflow: 'hidden',
                }}
              >
                {/* Header */}
                <div style={{ padding: '18px 20px', borderBottom: `1px solid ${theme.border}` }}>
                  <div style={{ fontSize: '16px', fontWeight: 700, color: theme.textPrimary }}>
                    {t('po.detail.comments')}
                  </div>
                  <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '4px' }}>
                    {t('po.detail.itemDescriptionLabel', { text: commentModal.description })}
                  </div>
                </div>

                {/* Comment list */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
                  {/* Pinned finance audit flag */}
                  {auditFlag && (
                    <div
                      style={{
                        padding: '12px 20px',
                        borderBottom: `1px solid rgba(239,68,68,0.2)`,
                        background: 'rgba(239,68,68,0.06)',
                        borderLeft: '3px solid #ef4444',
                      }}
                    >
                      <div style={{ marginBottom: '4px' }}>
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: '0.06em',
                            padding: '2px 7px',
                            borderRadius: '4px',
                            background: 'rgba(239,68,68,0.12)',
                            color: '#dc2626',
                            border: '1px solid #ef4444',
                          }}
                        >
                          {t('po.detail.financeAuditFlag')}
                        </span>
                      </div>
                      <div
                        style={{ fontSize: '14px', color: theme.textPrimary, marginBottom: '4px' }}
                      >
                        {auditFlag.audit_note || t('po.detail.noReasonGiven')}
                      </div>
                      <div style={{ fontSize: '11px', color: theme.textMuted }}>
                        {auditFlag.audit_flagged_by_email ?? t('po.detail.financeTeam')}
                        {auditFlag.audit_flagged_at && (
                          <span>&nbsp;&nbsp;{fmt(auditFlag.audit_flagged_at)}</span>
                        )}
                      </div>
                    </div>
                  )}
                  {!auditFlag && comments.length === 0 && (
                    <div
                      style={{
                        padding: '24px 20px',
                        textAlign: 'center',
                        fontSize: '13px',
                        color: theme.textMuted,
                      }}
                    >
                      {t('po.detail.noCommentsYet')}
                    </div>
                  )}
                  {comments.map((c, idx) => {
                    const fm = c.flag ? FLAG_META[c.flag] : null
                    return (
                      <div
                        key={c.id}
                        style={{
                          padding: '12px 20px',
                          borderBottom:
                            idx < comments.length - 1 ? `1px solid ${theme.border}22` : 'none',
                          background: fm && !c.resolved ? fm.bg : 'transparent',
                          borderLeft: fm
                            ? `3px solid ${c.resolved ? theme.border : fm.color}`
                            : '3px solid transparent',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            justifyContent: 'space-between',
                            gap: '8px',
                          }}
                        >
                          <div style={{ flex: 1 }}>
                            {fm && (
                              <div style={{ marginBottom: '4px' }}>
                                <span
                                  style={{
                                    fontSize: '10px',
                                    fontWeight: 700,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.06em',
                                    padding: '2px 7px',
                                    borderRadius: '4px',
                                    background: c.resolved ? theme.bgCanvas : fm.bg,
                                    color: c.resolved ? theme.textMuted : fm.color,
                                    border: `1px solid ${c.resolved ? theme.border : fm.color}`,
                                    textDecoration: c.resolved ? 'line-through' : 'none',
                                  }}
                                >
                                  {fm.label}
                                  {c.resolved ? t('po.detail.resolved') : ''}
                                </span>
                              </div>
                            )}
                            <div
                              style={{
                                fontSize: '14px',
                                color: theme.textPrimary,
                                marginBottom: '4px',
                                fontStyle: c.comment === 'item added' ? 'italic' : 'normal',
                                opacity: c.resolved ? 0.6 : 1,
                              }}
                            >
                              {c.comment}
                            </div>
                            <div style={{ fontSize: '11px', color: theme.textMuted }}>
                              {c.created_by_name}&nbsp;&nbsp;{fmt(c.created_at)}
                              {c.resolved && c.resolved_at && (
                                <span style={{ marginLeft: '8px', color: '#10b981' }}>
                                  {t('po.detail.resolvedOn', { date: fmt(c.resolved_at) })}
                                </span>
                              )}
                            </div>
                          </div>
                          {fm && !c.resolved && (
                            <button
                              onClick={() => void handleResolve(c.id)}
                              disabled={resolvingId === c.id}
                              style={{
                                flexShrink: 0,
                                padding: '4px 10px',
                                borderRadius: '5px',
                                border: `1px solid ${fm.color}`,
                                background: 'transparent',
                                color: fm.color,
                                fontSize: '11px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {resolvingId === c.id ? '…' : t('po.detail.resolve')}
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Add comment footer */}
                <div style={{ padding: '14px 20px', borderTop: `1px solid ${theme.border}` }}>
                  <div
                    style={{
                      fontSize: '12px',
                      fontWeight: 600,
                      color: theme.textSecondary,
                      marginBottom: '8px',
                    }}
                  >
                    {t('po.detail.addCommentN', { n: comments.length + (auditFlag ? 2 : 1) })}
                  </div>
                  <textarea
                    value={newComment}
                    onChange={(e) => {
                      setNewComment(e.target.value)
                    }}
                    rows={2}
                    placeholder={t('po.detail.typeYourComment')}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      border: `1px solid ${theme.border}`,
                      background: theme.bgCanvas,
                      color: theme.textPrimary,
                      fontSize: '13px',
                      resize: 'vertical',
                      boxSizing: 'border-box',
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void handleAddComment()
                    }}
                  />
                  {/* Flag picker */}
                  <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
                    <span
                      style={{
                        fontSize: '11px',
                        color: theme.textMuted,
                        alignSelf: 'center',
                        marginRight: '2px',
                      }}
                    >
                      {t('po.detail.flag2')}
                    </span>
                    {(
                      [
                        ['', t('po.detail.noneOption'), theme.textMuted, theme.border],
                        ['info', t('po.detail.info'), '#3b82f6', '#3b82f6'],
                        ['warning', t('po.detail.warning'), '#f59e0b', '#f59e0b'],
                        ['dispute', t('po.detail.dispute'), '#ef4444', '#ef4444'],
                      ] as [string, string, string, string][]
                    ).map(([val, label, color, border]) => (
                      <button
                        key={val}
                        onClick={() => {
                          setNewFlag(val as typeof newFlag)
                        }}
                        style={{
                          padding: '3px 10px',
                          borderRadius: '5px',
                          border: `1px solid ${newFlag === val ? border : theme.border}`,
                          background: newFlag === val ? `${color}18` : 'transparent',
                          color: newFlag === val ? color : theme.textMuted,
                          fontSize: '11px',
                          fontWeight: newFlag === val ? 700 : 400,
                          cursor: 'pointer',
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      gap: '8px',
                      justifyContent: 'flex-end',
                      marginTop: '10px',
                    }}
                  >
                    <button
                      onClick={() => {
                        setCommentModal(null)
                      }}
                      style={{
                        padding: '8px 16px',
                        borderRadius: '6px',
                        border: `1px solid ${theme.border}`,
                        background: 'transparent',
                        color: theme.textPrimary,
                        fontSize: '13px',
                        cursor: 'pointer',
                      }}
                    >
                      {t('po.detail.close')}
                    </button>
                    <button
                      onClick={() => void handleAddComment()}
                      disabled={!newComment.trim() || addingComment}
                      style={{
                        padding: '8px 18px',
                        borderRadius: '6px',
                        border: 'none',
                        background: newComment.trim() ? theme.accent : theme.border,
                        color: '#fff',
                        fontSize: '13px',
                        cursor: newComment.trim() ? 'pointer' : 'not-allowed',
                        fontWeight: 600,
                      }}
                    >
                      {addingComment ? t('po.detail.adding') : t('po.detail.add')}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )
        })()}

      <ConfirmDialog
        open={confirmDeletePO}
        onClose={() => {
          setConfirmDeletePO(false)
        }}
        onConfirm={() => {
          setConfirmDeletePO(false)
          void deletePO({ variables: { id: po.id } })
        }}
        title={t('po.detail.deletePurchaseOrder')}
        message={t('po.detail.deleteConfirm', { number: po.po_number })}
        confirmLabel={t('po.detail.delete')}
        confirmVariant="danger"
      />

      {/* Print dialog */}
      {showPrintModal && (
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
                {t('po.detail.printPurchaseOrderTitle', { number: po.po_number })}
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
                srcDoc={buildPurchaseOrderHTML({
                  po_number: po.po_number,
                  status: getPOStatusLabel(po.status),
                  priority: po.priority,
                  created_at: po.created_at,
                  expected_delivery_date: po.expected_delivery_date,
                  currency_code: po.currency_code,
                  // The print layout reads currencyTotals below; these two are
                  // only the legacy single-figure fields, 0 when there is none.
                  total_amount: po.total_amount != null ? parseFloat(po.total_amount) : 0,
                  subtotal:
                    po.subtotal != null
                      ? parseFloat(po.subtotal)
                      : po.total_amount != null
                        ? parseFloat(po.total_amount)
                        : 0,
                  vendor_name: po.vendor_name,
                  created_by_email: po.created_by_email,
                  companyName: po.company_name,
                  currencyTotals: po.currencyTotals.map((ct) => ({
                    currency: ct.currency_code,
                    amount: parseFloat(ct.subtotal) || 0,
                  })),
                  lines: po.lines.map((l) => ({
                    description: l.description ?? '',
                    product_name: l.product_name,
                    product_name_ar: l.product_name_ar,
                    qty: l.qty,
                    uom: l.uom,
                    currency_code: l.market_price_currency ?? l.requested_currency_code ?? po.currency_code,
                    unit_price: l.unit_price,
                    total: l.total,
                    notes: printWithNotes
                      ? (lineComments[l.id] ?? []).map((c) => ({
                          text: c.comment,
                          author: c.created_by_name,
                          date: c.created_at,
                        }))
                      : undefined,
                  })),
                  // Who did each stage and when — never on a vendor copy.
                  // markPOLineBought has no logged actor/timestamp at all, so
                  // "Buyer" is passed separately as a name-only line below.
                  approvalTrail: printWithNotes
                    ? ([
                        { action: 'submit_to_market_pricing', label: t('po.detail.storePricedBy') },
                        { action: 'submit_to_price_verification', label: t('po.detail.marketPricedBy') },
                        { action: 'submit_for_approval', label: t('po.detail.priceVerifiedBy') },
                        { action: 'approve', label: t('po.detail.approvedBy') },
                      ]
                        .map(({ action, label }) => {
                          const entry = [...po.approval_log]
                            .reverse()
                            .find((e) => e.action === action)
                          return entry ? { label, name: entry.user_email, date: entry.created_at } : null
                        })
                        .filter((s): s is { label: string; name: string; date: string } => s !== null))
                    : undefined,
                  buyerNames: printWithNotes
                    ? po.buyerNames && po.buyerNames.length > 0
                      ? po.buyerNames
                      : po.assigned_buyer_name
                        ? [po.assigned_buyer_name]
                        : []
                    : undefined,
                })}
                style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
                title={t('po.detail.purchaseOrderNumber', { number: po.po_number })}
              />
            </div>

            {/* Dialog footer */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                padding: '14px 20px',
                borderTop: `1px solid ${theme.border}`,
                flexShrink: 0,
              }}
            >
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '7px',
                  fontSize: '12px',
                  color: theme.textSecondary,
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
              >
                <input
                  type="checkbox"
                  checked={printWithNotes}
                  onChange={(e) => {
                    setPrintWithNotes(e.target.checked)
                  }}
                />
                {t('po.detail.includeInternalLineNotesNotFor')}
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowPrintModal(false)
                  }}
                >
                  {t('po.detail.cancel')}
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => printIframeRef.current?.contentWindow?.print()}
                >
                  {t('po.detail.printSaveAsPdf')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
