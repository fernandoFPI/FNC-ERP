import { useEffect, useMemo, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@apollo/client'
import { REQUISITIONS_QUERY } from '../../../graphql/requisitions'
import { useMyQueueCount } from '../../../hooks/useMyQueueCount'
import { useTheme } from '../../../theme/ThemeContext'
import { Card } from '../../../components/ui/Card'
import type { Column } from '../../../components/ui/Table'
import { Table } from '../../../components/ui/Table'
import { Badge, type BadgeVariant } from '../../../components/ui/Badge'
import { Modal } from '../../../components/ui/Modal'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import { Button } from '../../../components/ui/Button'
import {
  REQUISITION_STATUSES,
  REQUISITION_PRIORITY_LABELS,
  REQUISITION_TERMINAL_STATUSES,
  getRequisitionStatusVariant,
  getRequisitionStatusLabel,
} from '../../../lib/requisition-constants'
import { FilterPresets } from '../../../components/ui/FilterPresets'
import { useFilterPresets } from '../../../hooks/useFilterPresets'
import { useEntityChanged } from '../../../hooks/useEntityChanged'
import { api } from '../../../lib/axios'
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
  RowMenu,
  SearchBox,
  SelectionBar,
  StageMini,
  dateInputStyle,
  formatAge,
  isPastDate,
} from '../../../components/procurement/ListKit'
import { RequisitionPreviewPanel } from '../../../components/procurement/PreviewPanels'
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
  created_at: string
  updated_at: string | null
  lines?: {
    id: string
    expense_date: string
    category_name: string | null
    description: string | null
    amount: number
    currency_code: string
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

const PAGE_SIZE = 12

const PRIORITY_OPTIONS = [
  { value: 'emergency', label: 'Emergency' },
  { value: 'high', label: 'High' },
  { value: 'low', label: 'Low' },
]

const EXPENSE_OPEN = new Set(['draft', 'submitted', 'approved'])
const REQ_CLOSED = new Set<string>([...REQUISITION_TERMINAL_STATUSES])

const isRowOpen = (r: Requisition): boolean => {
  if (r.__kind === 'expense') return EXPENSE_OPEN.has(r.status)
  if (r.__kind) return false
  return !REQ_CLOSED.has(r.status)
}
// Awaiting someone's approval: a requisition at pending_approval, or an expense claim submitted.
const isPendingApproval = (r: Requisition): boolean =>
  r.__kind === 'expense' ? r.status === 'submitted' : !r.__kind && r.status === 'pending_approval'
// Needs a person to act: an open emergency requisition, or an approved expense claim waiting for Finance's funding decision.
const isNeedAction = (r: Requisition): boolean =>
  (!r.__kind && isRowOpen(r) && r.priority === 'emergency') ||
  (r.__kind === 'expense' && r.status === 'approved')
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

const PRIORITY_STYLES: Partial<Record<string, { color: string; bg: string; border: string }>> = {
  low: { color: '#6b7280', bg: 'transparent', border: 'transparent' },
  high: { color: '#d97706', bg: 'rgba(217,119,6,0.08)', border: 'rgba(217,119,6,0.3)' },
  emergency: { color: '#dc2626', bg: 'rgba(220,38,38,0.08)', border: 'rgba(220,38,38,0.3)' },
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
  __kind?: 'expense' | 'settlement'
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
  { value: 'manufacturing', label: 'Manufacturing / BOM' },
  { value: 'expense', label: 'Expense' },
]

function rowStatusLabel(r: Requisition): string {
  if (r.__kind === 'expense') return EXPENSE_STATUS_LABELS[r.status] ?? r.status
  if (r.__kind === 'settlement') return SETTLEMENT_STATUS_LABELS[r.status] ?? r.status
  return getRequisitionStatusLabel(r.status)
}
function rowStatusVariant(r: Requisition): BadgeVariant {
  if (r.__kind === 'expense') return EXPENSE_STATUS_VARIANTS[r.status] ?? 'neutral'
  if (r.__kind === 'settlement') return SETTLEMENT_STATUS_VARIANTS[r.status] ?? 'neutral'
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
  const { theme } = useTheme()
  const navigate = useNavigate()
  const { can } = usePermission()
  const canViewAllExpenses = can('finance.expenses.view', 'view')
  const canViewAllAdvances = can('finance.advances.view', 'view')
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

  useEffect(() => {
    loadExpenseClaims()
    loadSettlements()
  }, [loadExpenseClaims, loadSettlements])
  useEntityChanged('expense_claim', loadExpenseClaims)
  useEntityChanged('advance_settlement', loadSettlements)
  // Filters survive refresh and navigating into a requisition and back.
  const [saved] = useState(loadSavedFilters)
  const [search, setSearch] = useState(saved.search)
  const [statusFilter, setStatusFilter] = useState(saved.status)
  const [purposeFilter, setPurposeFilter] = useState(saved.purpose)
  const [fromDate, setFromDate] = useState(saved.fromDate)
  const [toDate, setToDate] = useState(saved.toDate)
  const [organizerFilter, setOrganizerFilter] = useState(saved.organizer)
  const [projectFilter, setProjectFilter] = useState(saved.project)
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
  // Expense/settlement rows come from separate REST fetches, not the
  // GraphQL query's own (already newest-first) ordering — merge and
  // re-sort by date so a fresh one lands at the top instead of trailing
  // after every real requisition regardless of how recent it is.
  const requisitions: Requisition[] = [
    ...(data?.requisitions ?? []),
    ...expenseRows,
    ...settlementRows,
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
      'Requisition #',
      'Purpose',
      'Project',
      'Branch',
      'Status',
      'Priority',
      'Organizer',
      'Created',
    ]
    const body = rows.map((r) => [
      r.requisition_number,
      r.purpose ?? '',
      r.projectName ?? '',
      r.branch_name ?? '',
      rowStatusLabel(r),
      r.__kind ? '' : REQUISITION_PRIORITY_LABELS[r.priority ?? 'low'],
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
    navigate(`/procurement/requisitions/${r.id}`)
  }

  const columns: Column<Requisition>[] = [
    {
      key: '__select',
      header: '',
      width: '40px',
      mobileHide: true,
      renderHeader: () => (
        <input
          type="checkbox"
          aria-label="Select all"
          checked={allSelected}
          ref={(el) => {
            if (el) el.indeterminate = someSelected && !allSelected
          }}
          onChange={() => {
            setSelectedIds(allSelected ? new Set() : new Set(filteredIds))
          }}
          style={{ cursor: 'pointer', width: '16px', height: '16px', accentColor: theme.accent }}
        />
      ),
      render: (r) => (
        <div
          onClick={(e) => {
            e.stopPropagation()
          }}
          style={{ display: 'flex', alignItems: 'center' }}
        >
          <input
            type="checkbox"
            aria-label={`Select ${r.requisition_number}`}
            checked={selectedIds.has(r.id)}
            onChange={() => {
              toggleSelect(r.id)
            }}
            style={{ cursor: 'pointer', width: '16px', height: '16px', accentColor: theme.accent }}
          />
        </div>
      ),
    },
    {
      key: 'requisition_number',
      header: 'Requisition #',
      mobilePrimary: true,
      render: (r) => {
        const p = r.priority ?? 'low'
        const s = PRIORITY_STYLES[p]
        return (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontWeight: 600, color: theme.accent, fontSize: '13px' }}>
                {r.requisition_number}
              </span>
              {p !== 'low' && s && (
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    color: s.color,
                    background: s.bg,
                    border: `1px solid ${s.border}`,
                    borderRadius: '4px',
                    padding: '0 5px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  {REQUISITION_PRIORITY_LABELS[p] ?? p}
                </span>
              )}
            </div>
            <div style={{ fontSize: '11px', color: theme.textMuted }}>{r.purpose ?? '—'}</div>
          </div>
        )
      },
    },
    {
      key: 'project',
      header: 'Project',
      render: (r) =>
        r.project_id ? (
          <span style={{ color: theme.textPrimary, fontSize: '13px' }}>{r.projectName ?? '—'}</span>
        ) : (
          <span style={{ color: theme.textMuted, fontSize: '13px' }}>—</span>
        ),
    },
    {
      key: 'branch_name',
      header: 'Branch',
      render: (r) => (
        <span style={{ color: theme.textSecondary, fontSize: '13px' }}>{r.branch_name ?? '—'}</span>
      ),
    },
    {
      key: 'organizerName',
      header: 'Organizer',
      render: (r) => <PersonCell name={r.organizerName} />,
    },
    {
      key: 'stage',
      header: 'Stage',
      render: (r) => {
        if (r.__kind) return <span style={{ color: theme.textMuted, fontSize: '13px' }}>—</span>
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
      header: 'Age',
      render: (r) => (
        <span style={{ fontSize: '13px', color: theme.textSecondary, whiteSpace: 'nowrap' }}>
          {formatAge(r.created_at)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <Badge variant={rowStatusVariant(r)}>{rowStatusLabel(r)}</Badge>,
    },
    {
      key: '__actions',
      header: 'Actions',
      width: '70px',
      mobileHide: true,
      render: (r) => (
        <RowMenu
          items={[
            ...(!r.__kind
              ? [
                  {
                    label: 'View details',
                    onClick: () => {
                      setPreviewId(r.id)
                    },
                  },
                ]
              : []),
            {
              label: 'Open full page',
              onClick: () => {
                openFull(r)
              },
            },
            {
              label: 'Copy number',
              onClick: () => {
                void navigator.clipboard
                  .writeText(r.requisition_number)
                  .then(() => {
                    addToast({ type: 'success', message: `${r.requisition_number} copied` })
                  })
                  .catch(() => {
                    addToast({ type: 'error', message: 'Could not copy' })
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
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '2400px' }}>
      <PageTitle
        icon="doc"
        title="Requisitions"
        subtitle="Create, track and manage purchase requisitions and expense claims."
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={handleExport}>
              Export CSV
            </Button>
            <Button
              data-tour="new-requisition-btn"
              variant="primary"
              size="sm"
              onClick={() => {
                navigate('/procurement/requisitions/new')
              }}
            >
              New Requisition
            </Button>
          </>
        }
      />

      <KpiRow>
        <KpiTile
          tone="accent"
          icon="doc"
          label="My Queue"
          value={queueCount}
          sub="Actions required"
          trailing={<Icon name="arrowRight" size={16} />}
          onClick={() => {
            navigate('/procurement/queue')
          }}
        />
        <KpiTile
          tone="warning"
          icon="clock"
          label="Pending Approval"
          value={pendingApprovalCount}
          sub="Awaiting approval"
          active={quickFilter === 'pendingApproval'}
          onClick={() => {
            toggleQuick('pendingApproval')
          }}
        />
        <KpiTile
          tone="danger"
          icon="alert"
          label="Need Action"
          value={needActionCount}
          sub="Requires attention"
          active={quickFilter === 'needAction'}
          onClick={() => {
            toggleQuick('needAction')
          }}
        />
        <KpiTile
          tone="info"
          icon="truck"
          label="Delayed"
          value={delayedCount}
          sub="Overdue / delayed"
          active={quickFilter === 'delayed'}
          onClick={() => {
            toggleQuick('delayed')
          }}
        />
        <KpiTile
          tone="success"
          icon="cart"
          label="Open Requisitions"
          loading={loading && requisitions.length === 0}
          value={openCount}
          sub="Not yet completed"
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
          style={{ borderRadius: '14px', flex: 1, display: 'flex', flexDirection: 'column' }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
            <SearchBox
              value={search}
              onChange={setSearch}
              placeholder="Search requisition #, purpose, project, item, organizer…"
            />
            <PillSelect
              label="Status"
              value={statusFilter}
              options={STATUS_OPTIONS}
              onChange={setStatusFilter}
            />
            <PillSelect
              label="Purpose"
              value={purposeFilter}
              options={PURPOSE_OPTIONS}
              onChange={setPurposeFilter}
            />
            <PillSelect
              label="Organizer"
              value={organizerFilter}
              options={organizerOptions}
              onChange={setOrganizerFilter}
            />
            <PillSelect
              label="Project"
              value={projectFilter}
              options={projectOptions}
              onChange={setProjectFilter}
            />
            <MoreFilters activeCount={moreFilterCount}>
              <FilterField label="Priority">
                <select
                  value={priorityFilter}
                  onChange={(e) => {
                    setPriorityFilter(e.target.value)
                  }}
                  style={dateInputStyle(theme)}
                >
                  <option value="">All</option>
                  {PRIORITY_OPTIONS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </FilterField>
              <FilterField label="Created from">
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => {
                    setFromDate(e.target.value)
                  }}
                  style={dateInputStyle(theme)}
                />
              </FilterField>
              <FilterField label="Created to">
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => {
                    setToDate(e.target.value)
                  }}
                  style={dateInputStyle(theme)}
                />
              </FilterField>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '13px',
                  color: theme.textPrimary,
                }}
              >
                <input
                  type="checkbox"
                  checked={myRequisitionsOnly}
                  onChange={(e) => {
                    setMyRequisitionsOnly(e.target.checked)
                  }}
                  style={{ accentColor: theme.accent }}
                />
                Only requisitions I organized
              </label>
              <FilterPresets
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
                <button
                  type="button"
                  onClick={clearAllFilters}
                  style={{
                    border: 'none',
                    background: 'none',
                    color: theme.accent,
                    fontSize: '13px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    padding: 0,
                    fontFamily: 'inherit',
                  }}
                >
                  Clear all filters
                </button>
              )}
            </MoreFilters>
            <IconButton
              title="Refresh"
              onClick={() => {
                void refetch()
                loadExpenseClaims()
                loadSettlements()
              }}
            >
              <Icon name="refresh" size={16} />
            </IconButton>
          </div>

          {selectedIds.size > 0 && (
            <SelectionBar label={`${selectedIds.size} selected`} onClear={clearSelection}>
              <BarButton
                icon="download"
                onClick={() => {
                  exportRows(selectedRows, `requisitions-selected-${today}.csv`)
                }}
              >
                Export
              </BarButton>
            </SelectionBar>
          )}

          <div style={{ marginTop: '14px', flex: 1 }}>
            <Table
              columns={columns}
              data={pageRows}
              loading={loading}
              rowKey="id"
              emptyMessage={
                anyFilter ? 'No requisitions match these filters.' : 'No requisitions yet.'
              }
              onRowClick={(r) => {
                if (r.__kind) {
                  openFull(r)
                  return
                }
                setPreviewId(r.id)
              }}
              getRowStyle={(r) => {
                const base = r.priority === 'emergency' ? { borderLeft: '3px solid #dc2626' } : {}
                return r.id === previewId || selectedIds.has(r.id)
                  ? { ...base, background: theme.accentBg }
                  : base
              }}
            />
          </div>
          <Pagination
            page={safePage}
            pageSize={PAGE_SIZE}
            total={filtered.length}
            onChange={setPage}
          />
        </Card>
      </DockLayout>

      <Modal
        open={!!viewClaim}
        onClose={() => {
          setViewClaim(null)
        }}
        title={viewClaim?.claim_number ?? ''}
        description={viewClaim?.description ?? undefined}
      >
        {viewClaim && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Badge variant={EXPENSE_STATUS_VARIANTS[viewClaim.status] ?? 'neutral'}>
                {EXPENSE_STATUS_LABELS[viewClaim.status] ?? viewClaim.status}
              </Badge>
              <AmountDisplay
                amount={Number(viewClaim.total_amount)}
                currency={viewClaim.currency_code}
                size="sm"
              />
              {viewClaim.project_code && (
                <span style={{ fontSize: '12px', color: theme.textMuted }}>
                  {viewClaim.project_code} — {viewClaim.project_name}
                </span>
              )}
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                  {['Date', 'Category', 'Description', 'Amount'].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: '6px 8px',
                        textAlign: h === 'Amount' ? 'right' : 'left',
                        color: theme.textMuted,
                        fontWeight: 500,
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(viewClaim.lines ?? []).map((l) => (
                  <tr key={l.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                    <td
                      style={{ padding: '6px 8px', color: theme.textSecondary, fontSize: '11px' }}
                    >
                      {new Date(l.expense_date).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '6px 8px', color: theme.textSecondary }}>
                      {l.category_name ?? '—'}
                    </td>
                    <td style={{ padding: '6px 8px', color: theme.textSecondary }}>
                      {l.description ?? '—'}
                    </td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>
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
                {SETTLEMENT_STATUS_LABELS[viewSettlement.status] ?? viewSettlement.status}
              </Badge>
              <AmountDisplay
                amount={Number(viewSettlement.total_amount)}
                currency={viewSettlement.currency_code}
                size="sm"
              />
              <span style={{ fontSize: '12px', color: theme.textMuted }}>
                From advance {viewSettlement.advance_number}
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
                        textAlign: h === 'Amount' ? 'right' : 'left',
                        color: theme.textMuted,
                        fontWeight: 500,
                      }}
                    >
                      {h}
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
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>
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
