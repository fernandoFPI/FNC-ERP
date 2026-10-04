import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@apollo/client'
import { REQUISITIONS_QUERY } from '../../../graphql/requisitions'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { FilterBar } from '../../../components/ui/FilterBar'
import type { Column } from '../../../components/ui/Table'
import { Table } from '../../../components/ui/Table'
import { Badge, type BadgeVariant } from '../../../components/ui/Badge'
import { Modal } from '../../../components/ui/Modal'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import { FilterChipStrip } from '../../../components/ui/FilterChipStrip'
import { Button } from '../../../components/ui/Button'
import {
  REQUISITION_STATUSES,
  REQUISITION_PRIORITY_LABELS,
  getRequisitionStatusVariant,
  getRequisitionStatusLabel,
} from '../../../lib/requisition-constants'
import { FilterPresets } from '../../../components/ui/FilterPresets'
import { useFilterPresets } from '../../../hooks/useFilterPresets'
import { useEntityChanged } from '../../../hooks/useEntityChanged'
import { api } from '../../../lib/axios'
import { usePermission } from '../../../hooks/usePermission'
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
  posted: 'Completed',
  paid: 'Completed',
  rejected: 'Rejected',
}
const EXPENSE_STATUS_VARIANTS: Record<string, BadgeVariant> = {
  draft: 'neutral',
  submitted: 'warning',
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

// Advance settlements (the "paid from my advance" branch of the same
// Expense purpose) live in advance_settlements, a separate REST service
// from expense_claims — merged in the exact same way, with its own status
// vocabulary (draft/submitted/approved/rejected, not
// draft/submitted/posted/paid/rejected) and no standalone detail page of
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
  fromDate: '',
  toDate: '',
  myRequisitionsOnly: 'false',
}

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

const PRIORITY_STYLES: Record<string, { color: string; bg: string; border: string }> = {
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
      .then((r) => { setMyExpenseClaims(r.data); })
      .catch(() => { /* self-service fetch — silent, list just won't include them */ })
    if (canViewAllExpenses) {
      api
        .get<ExpenseClaimApiRow[]>('/finance/expense-claims', { params: { limit: 200 } })
        .then((r) => { setAllExpenseClaims(r.data); })
        .catch(() => { /* handled — merged list just falls back to "mine" */ })
    }
  }, [canViewAllExpenses])

  const loadSettlements = useCallback(() => {
    api
      .get<SettlementApiRow[]>('/finance/advances/settlements/mine')
      .then((r) => { setMySettlements(r.data); })
      .catch(() => { /* self-service fetch — silent, list just won't include them */ })
    if (canViewAllAdvances) {
      api
        .get<SettlementApiRow[]>('/finance/advances/settlements', { params: { limit: 200 } })
        .then((r) => { setAllSettlements(r.data); })
        .catch(() => { /* handled — merged list just falls back to "mine" */ })
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

  const currentFilters = {
    search,
    status: statusFilter,
    purpose: purposeFilter,
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
  }, [search, statusFilter, purposeFilter, fromDate, toDate, myRequisitionsOnly])
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
    if (statusFilter && r.status !== statusFilter) return false
    if (purposeFilter && r.purpose !== purposeFilter) return false
    if (search) {
      const q = search.toLowerCase()
      if (
        !r.requisition_number.toLowerCase().includes(q) &&
        !(r.purpose ?? '').toLowerCase().includes(q) &&
        !(r.projectName ?? '').toLowerCase().includes(q) &&
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
    const rows = filtered.map((r) => [
      r.requisition_number,
      r.purpose ?? '',
      r.projectName ?? '',
      r.branch_name ?? '',
      rowStatusLabel(r),
      r.__kind ? '' : REQUISITION_PRIORITY_LABELS[r.priority ?? 'low'] ?? r.priority ?? '',
      r.organizerName ?? '',
      r.created_at.slice(0, 10),
    ])
    downloadCSV([header, ...rows], `requisitions-${new Date().toISOString().slice(0, 10)}.csv`)
  }

  const columns: Column<Requisition>[] = [
    {
      key: 'priority',
      header: 'Priority',
      render: (r) => {
        const p = r.priority ?? 'low'
        const s = PRIORITY_STYLES[p] ?? PRIORITY_STYLES.low
        if (p === 'low') return <span style={{ fontSize: '12px', color: s.color }}>—</span>
        return (
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              color: s.color,
              background: s.bg,
              border: `1px solid ${s.border}`,
              borderRadius: '5px',
              padding: '2px 8px',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            {REQUISITION_PRIORITY_LABELS[p] ?? p}
          </span>
        )
      },
    },
    {
      key: 'requisition_number',
      header: 'Requisition #',
      render: (r) => (
        <span style={{ fontFamily: 'monospace', color: theme.accent, fontSize: '13px' }}>
          {r.requisition_number}
        </span>
      ),
    },
    {
      key: 'purpose',
      header: 'Purpose',
      render: (r) => (
        <span style={{ color: theme.textPrimary, fontSize: '13px' }}>{r.purpose ?? '—'}</span>
      ),
    },
    {
      key: 'project',
      header: 'Project',
      render: (r) =>
        r.project_id ? (
          <span style={{ color: theme.textSecondary, fontSize: '13px' }}>
            {r.projectName ?? '—'}
          </span>
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
      key: 'status',
      header: 'Status',
      render: (r) => <Badge variant={rowStatusVariant(r)}>{rowStatusLabel(r)}</Badge>,
    },
    {
      key: 'organizerName',
      header: 'Organizer',
      render: (r) => (
        <span style={{ color: theme.textMuted, fontSize: '13px' }}>{r.organizerName ?? '—'}</span>
      ),
    },
    {
      key: 'created_at',
      header: 'Created',
      render: (r) => (
        <span style={{ color: theme.textMuted, fontSize: '13px' }}>
          {r.created_at.slice(0, 10)}
        </span>
      ),
    },
  ]

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1400px' }}>
      <PageHeader
        title="Requisitions"
        subtitle={`${filtered.length} requisitions`}
        actions={
          <div style={{ display: 'flex', gap: '8px' }}>
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
          </div>
        }
      />

      <div style={{ marginTop: '16px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
        <button
          onClick={() => {
            setMyRequisitionsOnly((v) => !v)
          }}
          style={{
            flexShrink: 0,
            padding: '6px 12px',
            borderRadius: '7px',
            fontSize: '12px',
            fontWeight: 500,
            cursor: 'pointer',
            border: `1px solid ${myRequisitionsOnly ? theme.success : theme.border}`,
            background: myRequisitionsOnly ? theme.success : theme.bgSurface,
            color: myRequisitionsOnly ? '#fff' : theme.textMuted,
          }}
        >
          👤 My Requisitions
        </button>
      </div>

      <div style={{ marginTop: '10px' }}>
        <FilterChipStrip
          allCount={requisitions.length}
          activeKey={statusFilter}
          onChange={setStatusFilter}
          chips={REQUISITION_STATUSES.map((s) => ({
            key: s.key,
            label: s.label,
            count: requisitions.filter((r) => r.status === s.key).length,
            variant: getRequisitionStatusVariant(s.key),
          }))}
        />
      </div>

      <Card style={{ marginTop: '12px' }}>
        <FilterBar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search requisition #, purpose, project, or item…"
          filters={[
            {
              key: 'status',
              label: 'Status',
              value: statusFilter,
              options: STATUS_OPTIONS,
              onChange: setStatusFilter,
            },
            {
              key: 'purpose',
              label: 'Purpose',
              value: purposeFilter,
              options: PURPOSE_OPTIONS,
              onChange: setPurposeFilter,
            },
          ]}
          fromDate={fromDate}
          toDate={toDate}
          onFromDateChange={setFromDate}
          onToDateChange={setToDate}
          resultCount={filtered.length}
          onRefresh={() => {
            void refetch()
            loadExpenseClaims()
            loadSettlements()
          }}
        >
          <FilterPresets
            presets={presets}
            onApply={(preset) => {
              const r = resolvePreset(preset)
              setSearch(r.search)
              setStatusFilter(r.status)
              setPurposeFilter(r.purpose)
              setFromDate(r.fromDate)
              setToDate(r.toDate)
              setMyRequisitionsOnly(r.myRequisitionsOnly === 'true')
            }}
            onSave={(name) => {
              savePreset(name, currentFilters)
            }}
            onDelete={deletePreset}
          />
        </FilterBar>

        <Table
          columns={columns}
          data={filtered}
          loading={loading}
          rowKey="id"
          onRowClick={(r) => {
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
          }}
          getRowStyle={(r) =>
            r.priority === 'emergency'
              ? { background: 'rgba(220,38,38,0.06)', borderLeft: '3px solid #dc2626' }
              : {}
          }
        />
      </Card>

      <Modal
        open={!!viewClaim}
        onClose={() => { setViewClaim(null); }}
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
                    <td style={{ padding: '6px 8px', color: theme.textSecondary, fontSize: '11px' }}>
                      {new Date(l.expense_date).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '6px 8px', color: theme.textSecondary }}>
                      {l.category_name ?? '—'}
                    </td>
                    <td style={{ padding: '6px 8px', color: theme.textSecondary }}>
                      {l.description ?? '—'}
                    </td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                      <AmountDisplay amount={Number(l.amount)} currency={l.currency_code} size="sm" />
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
        onClose={() => { setViewSettlement(null); }}
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
                    <td style={{ padding: '6px 8px', color: theme.textSecondary, fontSize: '11px' }}>
                      {new Date(l.line_date).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '6px 8px', color: theme.textSecondary }}>
                      {l.category_name ?? '—'}
                    </td>
                    <td style={{ padding: '6px 8px', color: theme.textSecondary }}>
                      {l.description ?? '—'}
                    </td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                      <AmountDisplay amount={Number(l.amount)} currency={l.currency_code} size="sm" />
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
