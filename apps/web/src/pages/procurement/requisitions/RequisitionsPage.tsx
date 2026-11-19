import { useTranslation } from 'react-i18next'
import { useEffect, useMemo, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@apollo/client'
import { REQUISITIONS_QUERY } from '../../../graphql/requisitions'
import { useMyQueueCount } from '../../../hooks/useMyQueueCount'
import { useTheme } from '../../../theme/ThemeContext'
import { useBreakpoint } from '../../../hooks/useBreakpoint'
import { Card } from '../../../components/ui/Card'
import type { Column } from '../../../components/ui/Table'
import { Table } from '../../../components/ui/Table'
import { Badge, type BadgeVariant } from '../../../components/ui/Badge'
import { Modal } from '../../../components/ui/Modal'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import { ActionButton } from '../../../components/ui/ActionButton'
import { Checkbox } from '../../../components/ui/Checkbox'
import { denseFormStyles } from '../../../components/ui/fieldStyles'
import {
  REQUISITION_STATUSES,
  getRequisitionPriorityLabel,
  REQUISITION_TERMINAL_STATUSES,
  getRequisitionStatusVariant,
  getRequisitionStatusLabel,
} from '../../../lib/requisition-constants'
import { FilterPresets } from '../../../components/ui/FilterPresets'
import { useFilterPresets } from '../../../hooks/useFilterPresets'
import { useEntityChanged } from '../../../hooks/useEntityChanged'
import { api } from '../../../lib/axios'
import i18n, { enumLabel, useIsRtl } from '../../../i18n'
import { usePermission } from '../../../hooks/usePermission'
import {
  miniReached,
  requisitionStage,
  REQUISITION_STAGES,
  stageLabel,
} from '../../../lib/procurementStages'
import {
  BarButton,
  DockLayout,
  EmptyState,
  FilterField,
  Icon,
  IconButton,
  KpiRow,
  KpiTile,
  MoreFilters,
  PageTitle,
  Pagination,
  PersonCell,
  PillSelect,
  PriorityTag,
  RowMenu,
  SearchBox,
  SelectionBar,
  StageMini,
  FilterChips,
  type FilterChip,
  formatAge,
  isPastDate,
} from '../../../components/procurement/ListKit'
import { RequisitionPreviewPanel } from '../../../components/procurement/PreviewPanels'
import { MyExpenseClaimModal } from '../../../components/finance/MyExpenseClaimModal'
import { MyAdvanceModal, type MyAdvance } from '../../../components/finance/MyAdvanceModal'
import { IssueAdvanceModal } from '../../../components/finance/IssueAdvanceModal'
import { advanceStatusLabel, ADVANCE_OPEN_STATUSES } from '../../../lib/advanceStatus'
import { useToastStore } from '../../../store/toastStore'
import type { RequisitionsQuery, RequisitionsQueryVariables } from '../../../graphql/generated'

// Expense claims (filed from this same page via Purpose: Expense — see
// RequisitionForm.tsx) live in their own expense_claims table, reached via
// the finance REST service rather than this page's GraphQL query. They're
// merged into the list client-side here purely for display — approving one
// still goes through ExpenseClaimDetail.tsx (POST /:id/approve), not
// anything on this page.
interface ExpenseClaimApiRow {
  id: string
  claim_number: string
  employee_name: string
  employee_id: string
  total_amount: number | string
  currency_code: string
  status: string
  project_code: string | null
  project_name: string | null
  project_id: string | null
  description: string | null
  notes?: string | null
  rejection_reason?: string | null
  can_revise?: boolean
  created_at: string
  updated_at: string | null
  lines?: {
    id: string
    line_number?: number
    expense_date: string
    category_id?: string | null
    category_name: string | null
    description: string | null
    amount: number
    currency_code: string
    flag_reason?: string | null
    flagged_by_name?: string | null
    flag_addressed_at?: string | null
    flag_resolved_at?: string | null
  }[]
}

const EXPENSE_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Pending Approval',
  approved: 'Awaiting Funding Decision',
  posted: 'Completed',
  paid: 'Completed',
  rejected: 'Rejected',
}
const EXPENSE_STATUS_VARIANTS: Record<string, BadgeVariant> = {
  draft: 'neutral',
  submitted: 'warning',
  approved: 'warning',
  posted: 'success',
  paid: 'success',
  rejected: 'danger',
}

function expenseClaimToRow(c: ExpenseClaimApiRow): Requisition {
  return {
    id: c.id,
    requisition_number: c.claim_number,
    status: c.status,
    priority: null,
    purpose: 'expense',
    project_id: c.project_id,
    projectName: c.project_name ? `${c.project_code ?? ''} ${c.project_name}`.trim() : null,
    branch_id: null,
    branch_name: null,
    organizer_id: c.employee_id,
    organizerName: c.employee_name,
    notes: c.description,
    created_at: c.created_at,
    updated_at: c.updated_at ?? c.created_at,
    itemSearchText: null,
    __kind: 'expense',
    amount: Number(c.total_amount),
    currencyCode: c.currency_code,
  }
}

// Advance settlements live in advance_settlements, a separate REST service
// from expense_claims — merged in the exact same way, with its own status
// vocabulary (draft/submitted/approved/rejected, not
// draft/submitted/approved/posted/paid/rejected). The employee no longer
// creates these directly (Expense purpose always submits to expense_claims
// — see RequisitionForm.tsx); Finance creates one, already 'approved', as a
// side effect of routing an expense_claims row to "settle against an
// advance" (expense-claims.ts's POST /:id/post-payment). Kept merged into
// this list for any pre-existing ones and no standalone detail page of
// its own: a settlement is reviewed from its parent advance's detail page
// (EmployeeAdvanceDetail.tsx), not a page keyed by the settlement's own id.
interface SettlementApiRow {
  id: string
  settlement_number: string
  advance_id: string
  advance_number: string
  employee_name: string
  employee_id: string
  total_amount: number | string
  currency_code: string
  status: string
  description: string | null
  created_at: string
  updated_at: string | null
  lines?: {
    id: string
    line_date: string
    category_name: string | null
    description: string | null
    amount: number
    currency_code: string
  }[]
}

const SETTLEMENT_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Pending Approval',
  approved: 'Completed',
  rejected: 'Rejected',
}
const SETTLEMENT_STATUS_VARIANTS: Record<string, BadgeVariant> = {
  draft: 'neutral',
  submitted: 'warning',
  approved: 'success',
  rejected: 'danger',
}

function settlementToRow(s: SettlementApiRow): Requisition {
  return {
    id: s.id,
    requisition_number: s.settlement_number,
    status: s.status,
    priority: null,
    purpose: 'expense',
    branch_id: null,
    branch_name: null,
    organizer_id: s.employee_id,
    organizerName: s.employee_name,
    notes: s.description,
    created_at: s.created_at,
    updated_at: s.updated_at ?? s.created_at,
    itemSearchText: null,
    __kind: 'settlement',
    amount: Number(s.total_amount),
    currencyCode: s.currency_code,
    settlementAdvanceId: s.advance_id,
  }
}

// Advance requests (filed from this same page via Purpose: Advance — see RequisitionForm.tsx) live in
// employee_advances, reached through the finance REST service, and are merged into the list the same way expense
// claims are. They follow the same road as an expense claim: the employee asks, a manager approves, and a rejected
// request is corrected and sent again by whoever filed it. Unlike a claim they have one more step: after the
// approval the cashbox handler pays the cash out of a cashbox of their choice (status pending_issue).
interface AdvanceApiRow extends MyAdvance {
  employee_id: string
  employee_name: string
  created_at: string
  updated_at: string | null
}

const ADVANCE_STATUS_VARIANTS: Record<string, BadgeVariant> = {
  draft: 'neutral',
  pending_approval: 'warning',
  pending_issue: 'warning',
  approved: 'info',
  partially_settled: 'info',
  settled: 'success',
  rejected: 'danger',
  cancelled: 'neutral',
}

function advanceToRow(a: AdvanceApiRow): Requisition {
  return {
    id: a.id,
    requisition_number: a.advance_number,
    status: a.status,
    priority: null,
    purpose: 'advance',
    project_id: a.project_id,
    projectName: a.project_name ? `${a.project_code ?? ''} ${a.project_name}`.trim() : null,
    branch_id: null,
    branch_name: null,
    organizer_id: a.employee_id,
    organizerName: a.employee_name,
    notes: a.purpose,
    created_at: a.created_at,
    updated_at: a.updated_at ?? a.created_at,
    itemSearchText: null,
    __kind: 'advance',
    amount: Number(a.amount),
    currencyCode: a.currency_code,
  }
}

// myRequisitionsOnly stored as 'true'/'false' — FilterPreset.filters is a
// flat Record<string, string>, same as every other tracked field here.
const FILTER_DEFAULTS = {
  search: '',
  status: '',
  purpose: '',
  organizer: '',
  project: '',
  priority: '',
  quick: '',
  fromDate: '',
  toDate: '',
  myRequisitionsOnly: 'false',
}

const PAGE_SIZE = 200

const PRIORITY_OPTIONS = [
  { value: 'emergency', label: 'Emergency' },
  { value: 'high', label: 'High' },
  { value: 'low', label: 'Low' },
]

const EXPENSE_OPEN = new Set(['draft', 'submitted', 'approved'])
const REQ_CLOSED = new Set<string>([...REQUISITION_TERMINAL_STATUSES])

const isRowOpen = (r: Requisition): boolean => {
  if (r.__kind === 'expense') return EXPENSE_OPEN.has(r.status)
  if (r.__kind === 'advance') return ADVANCE_OPEN_STATUSES.has(r.status)
  if (r.__kind) return false
  return !REQ_CLOSED.has(r.status)
}
// Awaiting someone's approval: a requisition at pending_approval, an expense claim submitted, or an advance request
// waiting for its manager.
const isPendingApproval = (r: Requisition): boolean =>
  r.__kind === 'expense'
    ? r.status === 'submitted'
    : r.__kind === 'advance'
      ? r.status === 'pending_approval'
      : !r.__kind && r.status === 'pending_approval'
// Needs a person to act: an open emergency requisition, an approved expense claim waiting for Finance's funding
// decision, or an approved advance waiting for the cashbox handler to pay it out.
const isNeedAction = (r: Requisition): boolean =>
  (!r.__kind && isRowOpen(r) && r.priority === 'emergency') ||
  (r.__kind === 'expense' && r.status === 'approved') ||
  (r.__kind === 'advance' && r.status === 'pending_issue')
const isDelayedReq = (r: Requisition): boolean =>
  !r.__kind && isRowOpen(r) && isPastDate(r.expected_delivery_date)

const FILTERS_STORAGE_KEY = 'requisitions-page-filters'

function loadSavedFilters(): typeof FILTER_DEFAULTS {
  try {
    const raw = sessionStorage.getItem(FILTERS_STORAGE_KEY)
    if (raw) return { ...FILTER_DEFAULTS, ...(JSON.parse(raw) as Partial<typeof FILTER_DEFAULTS>) }
  } catch {
    // ignore corrupt/unavailable storage
  }
  return FILTER_DEFAULTS
}

// Which priorities get a tag, and in which tone (a normal priority is not tagged)
const PRIORITY_TONE: Partial<Record<string, 'warning' | 'danger'>> = {
  high: 'warning',
  emergency: 'danger',
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
  expected_delivery_date?: string | null
  created_at: string
  updated_at: string
  itemSearchText?: string | null
  __kind?: 'expense' | 'settlement' | 'advance'
  amount?: number
  currencyCode?: string
  settlementAdvanceId?: string
}

const STATUS_OPTIONS = [
  ...REQUISITION_STATUSES.map((s) => ({ value: s.key, label: s.label })),
  { value: 'rejected', label: 'Rejected' },
  { value: 'cancelled', label: 'Cancelled' },
]

const PURPOSE_OPTIONS = [
  { value: 'stock', label: 'General Stock' },
  { value: 'project', label: 'Project Supply' },
  { value: 'direct_supply', label: 'Direct Supply' },
  { value: 'manufacturing', label: 'Manufacturing / BOM' },
  { value: 'expense', label: 'Expense' },
  { value: 'advance', label: 'Advance' },
]

const expenseStatusLabel = (s: string) =>
  i18n.t(`req.expenseStatus.${s}`, { defaultValue: EXPENSE_STATUS_LABELS[s] ?? s })
const settlementStatusLabel = (s: string) =>
  i18n.t(`req.settlementStatus.${s}`, { defaultValue: SETTLEMENT_STATUS_LABELS[s] ?? s })

function rowStatusLabel(r: Requisition): string {
  if (r.__kind === 'expense') return expenseStatusLabel(r.status)
  if (r.__kind === 'settlement') return settlementStatusLabel(r.status)
  if (r.__kind === 'advance') return advanceStatusLabel(r.status)
  return getRequisitionStatusLabel(r.status)
}
function rowStatusVariant(r: Requisition): BadgeVariant {
  if (r.__kind === 'expense') return EXPENSE_STATUS_VARIANTS[r.status] ?? 'neutral'
  if (r.__kind === 'settlement') return SETTLEMENT_STATUS_VARIANTS[r.status] ?? 'neutral'
  if (r.__kind === 'advance') return ADVANCE_STATUS_VARIANTS[r.status] ?? 'neutral'
  return getRequisitionStatusVariant(r.status)
}

function downloadCSV(rows: string[][], filename: string) {
  const content = rows
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob(['﻿' + content, ''], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function RequisitionsPage() {
  const { t } = useTranslation()
  const { theme, themeKey } = useTheme()
  const rtl = useIsRtl()
  // the filter panel's boxes: the same field look as the forms
  const filterBoxes = denseFormStyles(theme, { rtl, dark: themeKey === 'black' })
  const { isPhone } = useBreakpoint()
  const navigate = useNavigate()
  const { can } = usePermission()
  const canViewAllExpenses = can('finance.expenses.view', 'view')
  const canViewAllAdvances = can('finance.advances.view', 'view')
  // The cashbox handler: pays an approved advance out of a cashbox. May hold no Advances permission at all.
  const canIssueAdvances = can('finance.petty_cash.edit', 'edit')
  // 'mine' has no permission gate and includes each line's detail — used
  // both to merge the current user's own expense claims into the list for
  // everyone, and as the data source for the read-only modal shown to
  // anyone who can't open the full (finance.expenses.view-gated) detail page.
  const [myExpenseClaims, setMyExpenseClaims] = useState<ExpenseClaimApiRow[]>([])
  const [allExpenseClaims, setAllExpenseClaims] = useState<ExpenseClaimApiRow[]>([])
  const [viewClaim, setViewClaim] = useState<ExpenseClaimApiRow | null>(null)
  const [mySettlements, setMySettlements] = useState<SettlementApiRow[]>([])
  const [allSettlements, setAllSettlements] = useState<SettlementApiRow[]>([])
  const [viewSettlement, setViewSettlement] = useState<SettlementApiRow | null>(null)
  const [myAdvances, setMyAdvances] = useState<AdvanceApiRow[]>([])
  const [allAdvances, setAllAdvances] = useState<AdvanceApiRow[]>([])
  const [awaitingAdvances, setAwaitingAdvances] = useState<AdvanceApiRow[]>([])
  const [viewAdvance, setViewAdvance] = useState<AdvanceApiRow | null>(null)
  const [issueAdvanceId, setIssueAdvanceId] = useState<string | null>(null)

  const loadExpenseClaims = useCallback(() => {
    api
      .get<ExpenseClaimApiRow[]>('/finance/expense-claims/mine')
      .then((r) => {
        setMyExpenseClaims(r.data)
      })
      .catch(() => {
        /* self-service fetch — silent, list just won't include them */
      })
    if (canViewAllExpenses) {
      api
        .get<ExpenseClaimApiRow[]>('/finance/expense-claims', { params: { limit: 200 } })
        .then((r) => {
          setAllExpenseClaims(r.data)
        })
        .catch(() => {
          /* handled — merged list just falls back to "mine" */
        })
    }
  }, [canViewAllExpenses])

  const loadSettlements = useCallback(() => {
    api
      .get<SettlementApiRow[]>('/finance/advances/settlements/mine')
      .then((r) => {
        setMySettlements(r.data)
      })
      .catch(() => {
        /* self-service fetch — silent, list just won't include them */
      })
    if (canViewAllAdvances) {
      api
        .get<SettlementApiRow[]>('/finance/advances/settlements', { params: { limit: 200 } })
        .then((r) => {
          setAllSettlements(r.data)
        })
        .catch(() => {
          /* handled — merged list just falls back to "mine" */
        })
    }
  }, [canViewAllAdvances])

  const loadAdvances = useCallback(() => {
    api
      .get<AdvanceApiRow[]>('/finance/advances/mine')
      .then((r) => {
        setMyAdvances(r.data)
      })
      .catch(() => {
        /* self-service fetch — silent, list just won't include them */
      })
    if (canViewAllAdvances) {
      api
        .get<AdvanceApiRow[]>('/finance/advances', { params: { limit: 200 } })
        .then((r) => {
          setAllAdvances(r.data)
        })
        .catch(() => {
          /* handled — merged list just falls back to "mine" */
        })
    }
    if (canIssueAdvances) {
      // The cashbox handler's worklist: approved advances waiting to be paid out.
      api
        .get<AdvanceApiRow[]>('/finance/advances/awaiting-issue')
        .then((r) => {
          setAwaitingAdvances(r.data)
        })
        .catch(() => {
          /* handled — the handler still sees their own requests */
        })
    }
  }, [canViewAllAdvances, canIssueAdvances])

  useEffect(() => {
    loadExpenseClaims()
    loadSettlements()
    loadAdvances()
  }, [loadExpenseClaims, loadSettlements, loadAdvances])
  useEntityChanged('expense_claim', loadExpenseClaims)
  useEntityChanged('advance_settlement', loadSettlements)
  useEntityChanged('employee_advance', loadAdvances)
  // Filters survive refresh and navigating into a requisition and back.
  const [saved] = useState(loadSavedFilters)
  const [search, setSearch] = useState(saved.search)
  const [statusFilter, setStatusFilter] = useState(saved.status)
  const [purposeFilter, setPurposeFilter] = useState(saved.purpose)
  const [fromDate, setFromDate] = useState(saved.fromDate)
  const [toDate, setToDate] = useState(saved.toDate)
  const [organizerFilter, setOrganizerFilter] = useState(saved.organizer)
  const [projectFilter, setProjectFilter] = useState(saved.project)
  const [phoneFiltersOpen, setPhoneFiltersOpen] = useState(false)
  const [priorityFilter, setPriorityFilter] = useState(saved.priority)
  const [quickFilter, setQuickFilter] = useState(saved.quick)
  const [page, setPage] = useState(1)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [previewId, setPreviewId] = useState<string | null>(null)
  const addToast = useToastStore((s) => s.addToast)
  // Defaults to the full company list — a hardcoded "my own requisitions"
  // default left anyone who isn't personally the organizer of anything
  // looking at an empty page with no obvious explanation. A "My
  // Requisitions" preset (seeded below) gives back that convenience as an
  // explicit, visible choice instead.
  const [myRequisitionsOnly, setMyRequisitionsOnly] = useState(saved.myRequisitionsOnly === 'true')

  const { data, loading, refetch } = useQuery<RequisitionsQuery, RequisitionsQueryVariables>(
    REQUISITIONS_QUERY,
    {
      variables: {
        // Status is filtered client-side (see `filtered`) so the chip counts
        // always reflect the full list, not just the selected status.
        myQueueOnly: myRequisitionsOnly || undefined,
      },
      fetchPolicy: 'cache-and-network',
    },
  )
  useEntityChanged('requisition', () => void refetch())
  const queueCount = useMyQueueCount()

  const currentFilters = {
    search,
    status: statusFilter,
    purpose: purposeFilter,
    organizer: organizerFilter,
    project: projectFilter,
    priority: priorityFilter,
    quick: quickFilter,
    fromDate,
    toDate,
    myRequisitionsOnly: String(myRequisitionsOnly),
  }
  useEffect(() => {
    try {
      sessionStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(currentFilters))
    } catch {
      // storage unavailable — filters just won't persist
    }
  }, [
    search,
    statusFilter,
    purposeFilter,
    organizerFilter,
    projectFilter,
    priorityFilter,
    quickFilter,
    fromDate,
    toDate,
    myRequisitionsOnly,
  ])
  const { presets, savePreset, deletePreset, resolvePreset } = useFilterPresets(
    'requisitions',
    FILTER_DEFAULTS,
    { name: 'My Requisitions', filters: { ...FILTER_DEFAULTS, myRequisitionsOnly: 'true' } },
  )

  // De-dupe: a privileged viewer's own claims/settlements appear in both fetches.
  const expenseRows: Requisition[] = myRequisitionsOnly
    ? myExpenseClaims.map(expenseClaimToRow)
    : (canViewAllExpenses ? allExpenseClaims : myExpenseClaims).map(expenseClaimToRow)
  const settlementRows: Requisition[] = myRequisitionsOnly
    ? mySettlements.map(settlementToRow)
    : (canViewAllAdvances ? allSettlements : mySettlements).map(settlementToRow)
  // Advances: everyone sees their own; Finance (finance.advances.view) sees all of them; a cashbox handler without that
  // permission also sees the ones waiting to be paid out (what they have to act on), without duplicating their own.
  const advanceSource: AdvanceApiRow[] = myRequisitionsOnly
    ? myAdvances
    : canViewAllAdvances
      ? allAdvances
      : [...myAdvances, ...awaitingAdvances.filter((a) => !myAdvances.some((m) => m.id === a.id))]
  const advanceRows: Requisition[] = advanceSource.map(advanceToRow)
  // Expense/settlement/advance rows come from separate REST fetches, not the
  // GraphQL query's own (already newest-first) ordering — merge and
  // re-sort by date so a fresh one lands at the top instead of trailing
  // after every real requisition regardless of how recent it is.
  const requisitions: Requisition[] = [
    ...(data?.requisitions ?? []),
    ...expenseRows,
    ...settlementRows,
    ...advanceRows,
  ].sort((a, b) => b.created_at.localeCompare(a.created_at))
  const filtered = requisitions.filter((r) => {
    // Status chips use the procurement vocabulary (REQUISITION_STATUSES) —
    // expense/settlement rows have their own, separate status vocabulary
    // (draft/submitted/approved/posted/paid vs. draft/inventory_check/.../
    // approved/...), which happens to share some key names (e.g. 'approved'
    // means something entirely different for each). Never string-match a
    // __kind row against a procurement status chip.
    if (statusFilter) {
      if (r.__kind) return false
      if (r.status !== statusFilter) return false
    }
    if (purposeFilter && r.purpose !== purposeFilter) return false
    if (organizerFilter && (r.organizerName ?? '') !== organizerFilter) return false
    if (projectFilter && (r.project_id ?? '') !== projectFilter) return false
    if (priorityFilter && (r.priority ?? 'low') !== priorityFilter) return false
    if (quickFilter === 'pendingApproval' && !isPendingApproval(r)) return false
    if (quickFilter === 'needAction' && !isNeedAction(r)) return false
    if (quickFilter === 'delayed' && !isDelayedReq(r)) return false
    if (search) {
      const q = search.toLowerCase()
      if (
        !r.requisition_number.toLowerCase().includes(q) &&
        !(r.purpose ?? '').toLowerCase().includes(q) &&
        !(r.projectName ?? '').toLowerCase().includes(q) &&
        !(r.organizerName ?? '').toLowerCase().includes(q) &&
        !(r.notes ?? '').toLowerCase().includes(q) &&
        !(r.itemSearchText ?? '').toLowerCase().includes(q)
      )
        return false
    }
    if (fromDate && r.created_at < fromDate) return false
    if (toDate && r.created_at > toDate + 'T23:59:59') return false
    return true
  })

  const handleExport = () => {
    exportRows(filtered, `requisitions-${new Date().toISOString().slice(0, 10)}.csv`)
  }

  // Back to page 1 whenever the filtered set changes shape.
  useEffect(() => {
    setPage(1)
  }, [
    statusFilter,
    purposeFilter,
    organizerFilter,
    projectFilter,
    priorityFilter,
    quickFilter,
    search,
    fromDate,
    toDate,
    myRequisitionsOnly,
  ])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  // KPIs always read the full (unfiltered) list so they don't shift with the filters.
  const pendingApprovalCount = requisitions.filter(isPendingApproval).length
  const needActionCount = requisitions.filter(isNeedAction).length
  const delayedCount = requisitions.filter(isDelayedReq).length
  const openCount = requisitions.filter(isRowOpen).length

  const organizerOptions = useMemo(
    () =>
      [...new Set(requisitions.map((r) => r.organizerName).filter((n): n is string => !!n))]
        .sort()
        .map((n) => ({ value: n, label: n })),
    [requisitions],
  )
  const projectOptions = useMemo(() => {
    const m = new Map<string, string>()
    for (const r of requisitions)
      if (r.project_id && r.projectName) m.set(r.project_id, r.projectName)
    return [...m.entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([value, label]) => ({ value, label }))
  }, [requisitions])

  // Phone: the four dropdown filters sit behind one button; it shows how many of them are set.
  const dropdownFilterCount = [statusFilter, purposeFilter, organizerFilter, projectFilter].filter(
    Boolean,
  ).length
  const moreFilterCount =
    (priorityFilter ? 1 : 0) +
    (fromDate ? 1 : 0) +
    (toDate ? 1 : 0) +
    (myRequisitionsOnly ? 1 : 0) +
    (quickFilter ? 1 : 0)
  const anyFilter =
    !!(search || statusFilter || purposeFilter || organizerFilter || projectFilter) ||
    moreFilterCount > 0
  const clearAllFilters = () => {
    setSearch('')
    setStatusFilter('')
    setPurposeFilter('')
    setOrganizerFilter('')
    setProjectFilter('')
    setPriorityFilter('')
    setQuickFilter('')
    setFromDate('')
    setToDate('')
    setMyRequisitionsOnly(false)
  }
  const toggleQuick = (k: string) => {
    setQuickFilter((q) => (q === k ? '' : k))
  }

  // The applied filters as chips (desktop): each can be taken off with one click, and a filter no visible box shows (a tile's
  // quick filter, "only mine") is named here too, so a short list is never a mystery.
  const optionLabel = (options: { value: string; label: string }[], value: string) =>
    options.find((o) => o.value === value)?.label ?? value
  const quickLabel: Record<string, string> = {
    pendingApproval: t('req.list.pendingApproval'),
    needAction: t('req.list.needAction'),
    delayed: t('req.list.delayed'),
  }
  const filterChips: FilterChip[] = [
    ...(statusFilter
      ? [
          {
            key: 'status',
            label: t('req.list.status'),
            value: t(`req.status.${statusFilter}`, {
              defaultValue: optionLabel(STATUS_OPTIONS, statusFilter),
            }),
            onRemove: () => {
              setStatusFilter('')
            },
          },
        ]
      : []),
    ...(purposeFilter
      ? [
          {
            key: 'purpose',
            label: t('req.list.purpose'),
            value: t(`req.purpose.${purposeFilter}`, {
              defaultValue: optionLabel(PURPOSE_OPTIONS, purposeFilter),
            }),
            onRemove: () => {
              setPurposeFilter('')
            },
          },
        ]
      : []),
    ...(organizerFilter
      ? [
          {
            key: 'organizer',
            label: t('req.list.organizer'),
            value: organizerFilter,
            onRemove: () => {
              setOrganizerFilter('')
            },
          },
        ]
      : []),
    ...(projectFilter
      ? [
          {
            key: 'project',
            label: t('req.list.project'),
            value: optionLabel(projectOptions, projectFilter),
            onRemove: () => {
              setProjectFilter('')
            },
          },
        ]
      : []),
    ...(priorityFilter
      ? [
          {
            key: 'priority',
            label: t('req.list.priority'),
            value: t(`req.priority.${priorityFilter}`, {
              defaultValue: optionLabel(PRIORITY_OPTIONS, priorityFilter),
            }),
            onRemove: () => {
              setPriorityFilter('')
            },
          },
        ]
      : []),
    ...(quickFilter
      ? [
          {
            key: 'quick',
            label: t('common.quickFilter'),
            value: quickLabel[quickFilter] ?? quickFilter,
            onRemove: () => {
              setQuickFilter('')
            },
          },
        ]
      : []),
    ...(fromDate
      ? [
          {
            key: 'from',
            label: t('req.list.createdFrom'),
            value: fromDate,
            onRemove: () => {
              setFromDate('')
            },
          },
        ]
      : []),
    ...(toDate
      ? [
          {
            key: 'to',
            label: t('req.list.createdTo'),
            value: toDate,
            onRemove: () => {
              setToDate('')
            },
          },
        ]
      : []),
    ...(myRequisitionsOnly
      ? [
          {
            key: 'mine',
            label: t('req.list.onlyRequisitionsIOrganized'),
            onRemove: () => {
              setMyRequisitionsOnly(false)
            },
          },
        ]
      : []),
  ]

  // ── Selection ──
  const filteredIds = filtered.map((r) => r.id)
  const allSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedIds.has(id))
  const someSelected = filteredIds.some((id) => selectedIds.has(id))
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const clearSelection = () => {
    setSelectedIds(new Set())
  }
  const selectedRows = filtered.filter((r) => selectedIds.has(r.id))
  const today = new Date().toISOString().slice(0, 10)

  const exportRows = (rows: Requisition[], filename: string) => {
    const header = [
      t('req.list.requisition'),
      t('req.list.purpose'),
      t('req.list.project'),
      t('req.list.branch'),
      t('req.list.status'),
      t('req.list.priority'),
      t('req.list.organizer'),
      t('req.list.created'),
    ]
    const body = rows.map((r) => [
      r.requisition_number,
      r.purpose ?? '',
      r.projectName ?? '',
      r.branch_name ?? '',
      rowStatusLabel(r),
      r.__kind ? '' : getRequisitionPriorityLabel(r.priority ?? 'low'),
      r.organizerName ?? '',
      r.created_at.slice(0, 10),
    ])
    downloadCSV([header, ...body], filename)
  }

  // Full-page behaviour for a row — what a row click did before the preview panel existed.
  const openFull = (r: Requisition) => {
    if (r.__kind === 'expense') {
      if (canViewAllExpenses) {
        navigate(`/finance/expense-claims/${r.id}`)
        return
      }
      const raw = myExpenseClaims.find((c) => c.id === r.id)
      if (raw) setViewClaim(raw)
      return
    }
    if (r.__kind === 'settlement') {
      // A settlement has no detail page of its own — it's reviewed
      // from its parent advance's detail page.
      if (canViewAllAdvances && r.settlementAdvanceId) {
        navigate(`/finance/advances/${r.settlementAdvanceId}`)
        return
      }
      const raw = mySettlements.find((s) => s.id === r.id)
      if (raw) setViewSettlement(raw)
      return
    }
    if (r.__kind === 'advance') {
      // Finance opens the full advance page (approve, issue cash, void, settlements).
      if (canViewAllAdvances) {
        navigate(`/finance/advances/${r.id}`)
        return
      }
      // A cashbox handler without the Advances permission pays it out from a dialog.
      if (canIssueAdvances && r.status === 'pending_issue') {
        setIssueAdvanceId(r.id)
        return
      }
      const raw = myAdvances.find((a) => a.id === r.id)
      if (raw) setViewAdvance(raw)
      return
    }
    navigate(`/procurement/requisitions/${r.id}`)
  }

  const columns: Column<Requisition>[] = [
    {
      key: '__select',
      header: '',
      width: '40px',
      mobileHide: true,
      renderHeader: () => (
        <Checkbox
          ariaLabel={t('req.list.selectAll')}
          checked={allSelected}
          indeterminate={someSelected && !allSelected}
          onChange={() => {
            setSelectedIds(allSelected ? new Set() : new Set(filteredIds))
          }}
        />
      ),
      render: (r) => (
        <div
          onClick={(e) => {
            e.stopPropagation()
          }}
          style={{ display: 'flex', alignItems: 'center' }}
        >
          <Checkbox
            ariaLabel={`Select ${r.requisition_number}`}
            checked={selectedIds.has(r.id)}
            onChange={() => {
              toggleSelect(r.id)
            }}
          />
        </div>
      ),
    },
    {
      key: 'requisition_number',
      header: t('req.list.requisition'),
      mobilePrimary: true,
      render: (r) => {
        const p = r.priority ?? 'low'
        const tone = PRIORITY_TONE[p]
        return (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontWeight: 600, color: theme.accentSolid, fontSize: '13px' }}>
                {r.requisition_number}
              </span>
              {tone && <PriorityTag tone={tone}>{getRequisitionPriorityLabel(p)}</PriorityTag>}
            </div>
            <div style={{ fontSize: '12px', color: theme.textSecondary }}>
              {enumLabel(r.purpose) || '—'}
            </div>
          </div>
        )
      },
    },
    {
      key: 'project',
      header: t('req.list.project'),
      // Phone card: project, stage and organizer come first; age and branch sit behind "More".
      mobilePriority: 1,
      render: (r) =>
        r.project_id ? (
          <span style={{ color: theme.textPrimary, fontSize: '13px' }}>{r.projectName ?? '—'}</span>
        ) : (
          <span style={{ color: theme.textSecondary, fontSize: '13px' }}>—</span>
        ),
    },
    {
      key: 'branch_name',
      header: t('req.list.branch'),
      mobilePriority: 5,
      render: (r) => (
        <span style={{ color: theme.textSecondary, fontSize: '13px' }}>{r.branch_name ?? '—'}</span>
      ),
    },
    {
      key: 'organizerName',
      header: t('req.list.organizer'),
      mobilePriority: 3,
      render: (r) => <PersonCell name={r.organizerName} />,
    },
    {
      key: 'stage',
      header: t('req.list.stage'),
      mobilePriority: 2,
      render: (r) => {
        if (r.__kind) return <span style={{ color: theme.textSecondary, fontSize: '13px' }}>—</span>
        const st = requisitionStage(r.status)
        return (
          <StageMini
            total={4}
            reached={miniReached(st, REQUISITION_STAGES.length)}
            label={stageLabel(st, REQUISITION_STAGES)}
          />
        )
      },
    },
    {
      key: 'age',
      header: t('req.list.age'),
      mobilePriority: 4,
      render: (r) => (
        <span style={{ fontSize: '13px', color: theme.textSecondary, whiteSpace: 'nowrap' }}>
          {formatAge(r.created_at)}
        </span>
      ),
    },
    {
      key: 'status',
      header: t('req.list.status'),
      // Phone card: the status is the first thing people look for, so it sits in the card's header, not behind "More".
      mobileAction: true,
      render: (r) => <Badge variant={rowStatusVariant(r)}>{rowStatusLabel(r)}</Badge>,
    },
    {
      key: '__actions',
      header: t('req.list.actions'),
      width: '70px',
      mobileHide: true,
      render: (r) => (
        <RowMenu
          items={[
            ...(!r.__kind
              ? [
                  {
                    label: t('req.list.viewDetails'),
                    onClick: () => {
                      setPreviewId(r.id)
                    },
                  },
                ]
              : []),
            {
              label: t('req.list.openFullPage'),
              onClick: () => {
                openFull(r)
              },
            },
            {
              label: t('req.list.copyNumber'),
              onClick: () => {
                void navigator.clipboard
                  .writeText(r.requisition_number)
                  .then(() => {
                    addToast({ type: 'success', message: `${r.requisition_number} copied` })
                  })
                  .catch(() => {
                    addToast({ type: 'error', message: t('req.list.couldNotCopy') })
                  })
              },
            },
          ]}
        />
      ),
    },
  ]

  const previewRow = previewId
    ? requisitions.find((r) => r.id === previewId && !r.__kind)
    : undefined

  return (
    <div
      style={{
        padding: isPhone ? '12px 16px 24px' : '24px',
        margin: '0 auto',
        maxWidth: '2400px',
      }}
    >
      <PageTitle
        icon="doc"
        title={t('req.list.requisitions')}
        subtitle={t('req.list.createTrackAndManagePurchaseRequisitions')}
        actions={
          <>
            {/* A CSV download is not a phone job: the one button beside the title is the one people need. */}
            {!isPhone && (
              <ActionButton variant="outline" onClick={handleExport}>
                {t('req.list.exportCsv')}
              </ActionButton>
            )}
            <ActionButton
              data-tour="new-requisition-btn"
              variant="solid"
              onClick={() => {
                navigate('/procurement/requisitions/new')
              }}
            >
              {t('req.list.newRequisition')}
            </ActionButton>
          </>
        }
      />

      <KpiRow>
        <KpiTile
          tone="accent"
          icon="doc"
          label={t('req.list.myQueue')}
          value={queueCount}
          sub={t('req.list.actionsRequired')}
          trailing={<Icon name="arrowRight" size={16} />}
          onClick={() => {
            navigate('/procurement/queue')
          }}
        />
        <KpiTile
          tone="warning"
          icon="clock"
          label={t('req.list.pendingApproval')}
          value={pendingApprovalCount}
          sub={t('req.list.awaitingApproval')}
          active={quickFilter === 'pendingApproval'}
          onClick={() => {
            toggleQuick('pendingApproval')
          }}
        />
        <KpiTile
          tone="danger"
          icon="alert"
          label={t('req.list.needAction')}
          value={needActionCount}
          sub={t('req.list.requiresAttention')}
          active={quickFilter === 'needAction'}
          onClick={() => {
            toggleQuick('needAction')
          }}
        />
        <KpiTile
          tone="info"
          icon="truck"
          label={t('req.list.delayed')}
          value={delayedCount}
          sub={t('req.list.overdueDelayed')}
          active={quickFilter === 'delayed'}
          onClick={() => {
            toggleQuick('delayed')
          }}
        />
        <KpiTile
          tone="success"
          icon="cart"
          label={t('req.list.openRequisitions')}
          loading={loading && requisitions.length === 0}
          value={openCount}
          sub={t('req.list.notYetCompleted')}
        />
      </KpiRow>

      <DockLayout
        panel={
          previewRow ? (
            <RequisitionPreviewPanel
              row={{
                id: previewRow.id,
                requisition_number: previewRow.requisition_number,
                status: previewRow.status,
                statusLabel: rowStatusLabel(previewRow),
                statusVariant: rowStatusVariant(previewRow),
                organizerName: previewRow.organizerName,
                created_at: previewRow.created_at,
              }}
              onClose={() => {
                setPreviewId(null)
              }}
            />
          ) : null
        }
        onClosePanel={() => {
          setPreviewId(null)
        }}
      >
        <Card
          padding="md"
          style={{
            borderRadius: '14px',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            // Phone: each requisition is already a card, so the list is not boxed a second time.
            ...(isPhone
              ? {
                  padding: 0,
                  background: 'transparent',
                  border: 'none',
                  backdropFilter: 'none',
                  WebkitBackdropFilter: 'none',
                  overflow: 'visible',
                }
              : {}),
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
            <SearchBox
              value={search}
              onChange={setSearch}
              placeholder={t('req.list.searchRequisitionPurposeProjectItemOrganizer')}
            />
            {isPhone && (
              <button
                type="button"
                aria-label={t('req.list.filters')}
                aria-expanded={phoneFiltersOpen}
                onClick={() => {
                  setPhoneFiltersOpen((open) => !open)
                }}
                style={{
                  height: '40px',
                  minWidth: '40px',
                  padding: '0 10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                  borderRadius: '10px',
                  border: `1px solid ${phoneFiltersOpen || dropdownFilterCount > 0 ? theme.accentSolid : theme.borderField}`,
                  background: phoneFiltersOpen ? theme.accentBg : theme.bgSurface,
                  color: dropdownFilterCount > 0 ? theme.accentSolid : theme.textSecondary,
                  fontFamily: 'inherit',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  flexShrink: 0,
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <Icon name="filter" size={16} />
                {dropdownFilterCount > 0 && <span>{dropdownFilterCount}</span>}
              </button>
            )}
            {/* Phone: the four dropdowns stay mounted (their values keep applying) but are hidden until the
                Filters button is pressed; anywhere else this wrapper does not change the layout. */}
            <div style={{ display: isPhone && !phoneFiltersOpen ? 'none' : 'contents' }}>
            <PillSelect
              label={t('req.list.status')}
              value={statusFilter}
              options={STATUS_OPTIONS.map((o) => ({
                ...o,
                label: t(`req.status.${o.value}`, { defaultValue: o.label }),
              }))}
              onChange={setStatusFilter}
            />
            <PillSelect
              label={t('req.list.purpose')}
              value={purposeFilter}
              options={PURPOSE_OPTIONS.map((o) => ({
                ...o,
                label: t(`req.purpose.${o.value}`, { defaultValue: o.label }),
              }))}
              onChange={setPurposeFilter}
            />
            <PillSelect
              label={t('req.list.organizer')}
              value={organizerFilter}
              options={organizerOptions}
              onChange={setOrganizerFilter}
            />
            <PillSelect
              label={t('req.list.project')}
              value={projectFilter}
              options={projectOptions}
              onChange={setProjectFilter}
            />
            <MoreFilters activeCount={moreFilterCount}>
              <FilterField label={t('req.list.priority')}>
                <select
                  value={priorityFilter}
                  onChange={(e) => {
                    setPriorityFilter(e.target.value)
                  }}
                    style={filterBoxes.selectStyle}
                >
                  <option value="">{t('req.list.all')}</option>
                  {PRIORITY_OPTIONS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {t(`req.priority.${p.value}`, { defaultValue: p.label })}
                    </option>
                  ))}
                </select>
              </FilterField>
              <FilterField label={t('req.list.createdFrom')}>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => {
                    setFromDate(e.target.value)
                  }}
                    style={filterBoxes.inputStyle}
                />
              </FilterField>
              <FilterField label={t('req.list.createdTo')}>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => {
                    setToDate(e.target.value)
                  }}
                    style={filterBoxes.inputStyle}
                />
              </FilterField>
                <Checkbox
                  label={t('req.list.onlyRequisitionsIOrganized')}
                  checked={myRequisitionsOnly}
                  onChange={setMyRequisitionsOnly}
                />
              <FilterPresets
                  inline
                presets={presets}
                onApply={(preset) => {
                  const r = resolvePreset(preset)
                  setSearch(r.search)
                  setStatusFilter(r.status)
                  setPurposeFilter(r.purpose)
                  setOrganizerFilter(r.organizer)
                  setProjectFilter(r.project)
                  setPriorityFilter(r.priority)
                  setQuickFilter(r.quick)
                  setFromDate(r.fromDate)
                  setToDate(r.toDate)
                  setMyRequisitionsOnly(r.myRequisitionsOnly === 'true')
                }}
                onSave={(name) => {
                  savePreset(name, currentFilters)
                }}
                onDelete={deletePreset}
              />
              {anyFilter && (
                  <ActionButton size="sm" variant="ghost" onClick={clearAllFilters}>
                  {t('req.list.clearAllFilters')}
                  </ActionButton>
              )}
            </MoreFilters>
            </div>
            <IconButton
              title={t('req.list.refresh')}
              onClick={() => {
                void refetch()
                loadExpenseClaims()
                loadSettlements()
                loadAdvances()
              }}
            >
              <Icon name="refresh" size={16} />
            </IconButton>
          </div>

          {!isPhone && (
            <FilterChips
              chips={filterChips}
              onClearAll={clearAllFilters}
              clearAllLabel={t('common.clearAll')}
            />
          )}

          {selectedIds.size > 0 && (
            <SelectionBar label={`${selectedIds.size} selected`} onClear={clearSelection}>
              <BarButton
                icon="download"
                onClick={() => {
                  exportRows(selectedRows, `requisitions-selected-${today}.csv`)
                }}
              >
                {t('req.list.export')}
              </BarButton>
            </SelectionBar>
          )}

          <div style={{ marginTop: '14px', flex: 1 }}>
            {!loading && anyFilter && filtered.length === 0 ? (
              // A quick-filter KPI tile or "only mine" toggle can be active
              // without appearing in any of the visible toolbar pills, so an
              // empty result here previously looked like a dead end — this
              // always gives a one-click way out regardless of which filter
              // (visible or not) is the actual cause.
              <EmptyState
                title={t('req.list.noRequisitionsMatchTheseFilters')}
                action={
                  <ActionButton variant="outline" size="sm" onClick={clearAllFilters}>
                    {t('req.list.clearAllFilters')}
                  </ActionButton>
                }
              />
            ) : isPhone && !loading && pageRows.length > 0 ? (
              // Phone: a requisition is three short lines, so a screen holds about six instead of three. Tapping goes
              // straight to the requisition (the docked preview panel is an extra step on a phone).
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {pageRows.map((r) => {
                  const p = r.priority ?? 'low'
                  const tone = PRIORITY_TONE[p]
                  const stage = r.__kind
                    ? null
                    : stageLabel(requisitionStage(r.status), REQUISITION_STAGES)
                  const subtitle = [enumLabel(r.purpose), r.project_id ? r.projectName : null]
                    .filter(Boolean)
                    .join(' · ')
                  const meta = [stage, r.organizerName, formatAge(r.created_at)]
                    .filter(Boolean)
                    .join(' · ')
                  return (
                    <div
                      key={r.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        openFull(r)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          openFull(r)
                        }
                      }}
                      style={{
                        background: theme.bgSurface,
                        border: `0.5px solid ${theme.border}`,
                        borderInlineStart:
                          p === 'emergency'
                            ? `3px solid ${theme.danger}`
                            : `0.5px solid ${theme.border}`,
                        borderRadius: '12px',
                        padding: '12px 14px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                        cursor: 'pointer',
                        WebkitTapHighlightColor: 'transparent',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '8px',
                        }}
                      >
                        <span
                          style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}
                        >
                          <span
                            style={{ fontWeight: 700, color: theme.accentSolid, fontSize: '14px' }}
                          >
                            {r.requisition_number}
                          </span>
                          {tone && (
                            <PriorityTag tone={tone}>{getRequisitionPriorityLabel(p)}</PriorityTag>
                          )}
                        </span>
                        <Badge variant={rowStatusVariant(r)}>{rowStatusLabel(r)}</Badge>
                      </div>
                      {subtitle && (
                        <div
                          style={{
                            fontSize: '13px',
                            color: theme.textPrimary,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {subtitle}
                        </div>
                      )}
                      <div style={{ fontSize: '12px', color: theme.textSecondary }}>{meta}</div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <Table
                readable
                columns={columns}
                data={pageRows}
                loading={loading}
                rowKey="id"
                emptyMessage={t('req.list.noRequisitionsYet')}
                onRowClick={(r) => {
                  if (r.__kind) {
                    openFull(r)
                    return
                  }
                  setPreviewId(r.id)
                }}
                getRowStyle={(r) => {
                  const base =
                    r.priority === 'emergency'
                      ? { borderInlineStart: `3px solid ${theme.danger}` }
                      : {}
                  return r.id === previewId || selectedIds.has(r.id)
                    ? { ...base, background: theme.accentBg }
                    : base
                }}
              />
            )}
          </div>
          <Pagination
            page={safePage}
            pageSize={PAGE_SIZE}
            total={filtered.length}
            onChange={setPage}
          />
        </Card>
      </DockLayout>

      <MyExpenseClaimModal
        claim={viewClaim}
        statusLabel={viewClaim ? expenseStatusLabel(viewClaim.status) : ''}
        statusVariant={
          viewClaim ? (EXPENSE_STATUS_VARIANTS[viewClaim.status] ?? 'neutral') : 'neutral'
        }
        onClose={() => {
          setViewClaim(null)
        }}
        onChanged={() => {
          setViewClaim(null)
          loadExpenseClaims()
        }}
      />

      <MyAdvanceModal
        advance={viewAdvance}
        statusLabel={viewAdvance ? advanceStatusLabel(viewAdvance.status) : ''}
        statusVariant={
          viewAdvance ? (ADVANCE_STATUS_VARIANTS[viewAdvance.status] ?? 'neutral') : 'neutral'
        }
        onClose={() => {
          setViewAdvance(null)
        }}
        onChanged={() => {
          setViewAdvance(null)
          loadAdvances()
        }}
      />

      <IssueAdvanceModal
        advanceId={issueAdvanceId}
        onClose={() => {
          setIssueAdvanceId(null)
        }}
        onIssued={() => {
          setIssueAdvanceId(null)
          loadAdvances()
        }}
      />

      <Modal
        open={!!viewSettlement}
        onClose={() => {
          setViewSettlement(null)
        }}
        title={viewSettlement?.settlement_number ?? ''}
        description={viewSettlement?.description ?? undefined}
      >
        {viewSettlement && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Badge variant={SETTLEMENT_STATUS_VARIANTS[viewSettlement.status] ?? 'neutral'}>
                {settlementStatusLabel(viewSettlement.status)}
              </Badge>
              <AmountDisplay
                amount={Number(viewSettlement.total_amount)}
                currency={viewSettlement.currency_code}
                size="sm"
              />
              <span style={{ fontSize: '12px', color: theme.textSecondary }}>
                {t('req.list.fromAdvance', { number: viewSettlement.advance_number })}
              </span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                  {['Date', 'Category', 'Description', 'Amount'].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: '6px 8px',
                        textAlign: h === 'Amount' ? 'end' : 'start',
                        color: theme.textSecondary,
                        fontWeight: 500,
                      }}
                    >
                      {t(`req.list.hdr${h}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(viewSettlement.lines ?? []).map((l) => (
                  <tr key={l.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                    <td
                      style={{ padding: '6px 8px', color: theme.textSecondary, fontSize: '11px' }}
                    >
                      {new Date(l.line_date).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '6px 8px', color: theme.textSecondary }}>
                      {l.category_name ?? '—'}
                    </td>
                    <td style={{ padding: '6px 8px', color: theme.textSecondary }}>
                      {l.description ?? '—'}
                    </td>
                    <td style={{ padding: '6px 8px', textAlign: 'end' }}>
                      <AmountDisplay
                        amount={Number(l.amount)}
                        currency={l.currency_code}
                        size="sm"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </div>
  )
}
