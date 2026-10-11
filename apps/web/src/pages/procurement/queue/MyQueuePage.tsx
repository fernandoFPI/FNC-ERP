import { useTranslation } from 'react-i18next'
import i18n, { enumLabel } from '../../../i18n'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@apollo/client'
import { MY_PO_QUEUE_QUERY } from '../../../graphql/procurement'
import { MY_REQUISITION_QUEUE_QUERY } from '../../../graphql/requisitions'
import { useAuthStore } from '../../../store/authStore'
import { useTheme } from '../../../theme/ThemeContext'
import { Card } from '../../../components/ui/Card'
import { Badge, type BadgeVariant } from '../../../components/ui/Badge'
import type { Column } from '../../../components/ui/Table'
import { Table } from '../../../components/ui/Table'
import { getPOStatusVariant, getPOStatusLabel, PO_STATUS_ACTIONS } from '../../../lib/po-constants'
import {
  getRequisitionStatusVariant,
  getRequisitionStatusLabel,
  REQUISITION_STATUS_ACTIONS,
} from '../../../lib/requisition-constants'
import { useEntityChanged } from '../../../hooks/useEntityChanged'
import { usePermission } from '../../../hooks/usePermission'
import { api } from '../../../lib/axios'
import {
  Icon,
  IconButton,
  KpiRow,
  KpiTile,
  PageTitle,
  Pagination,
  PillSelect,
  SearchBox,
  daysSince,
} from '../../../components/procurement/ListKit'
import type {
  MyPoQueueQuery,
  MyPoQueueQueryVariables,
  MyRequisitionApprovalQueueQuery,
  MyRequisitionApprovalQueueQueryVariables,
} from '../../../graphql/generated'

// One worklist for everything waiting on the signed-in user: requisitions,
// purchase orders, and (for approvers) expense claims and advance settlements.
// Replaces the separate My PO Queue, My Requisition Queue and Approval Queue
// pages. Each source keeps its own server-side rule for "who can act" — this
// page only merges and presents them.

type Kind = 'requisition' | 'po' | 'expense' | 'settlement'

interface QueueItem {
  key: string
  kind: Kind
  id: string
  number: string
  headline: string
  sub: string
  status: string
  statusLabel: string
  statusVariant: BadgeVariant
  action: string
  role: string
  updatedAt: string
  href: string
  needsApproval: boolean
  priority: string | null
}

interface ExpenseClaimQueueApiRow {
  id: string
  claim_number: string
  employee_name: string
  status: string
  created_at: string
}

interface SettlementQueueApiRow {
  id: string
  settlement_number: string
  employee_name: string
  advance_id: string
  status: string
  created_at: string
}

const PAGE_SIZE = 200
const OVERDUE_DAYS = 3

const KIND_LABELS: Record<Kind, string> = {
  requisition: 'Requisition',
  po: 'Purchase order',
  expense: 'Expense claim',
  settlement: 'Advance settlement',
}
const KIND_TAGS: Record<Kind, string> = {
  requisition: 'REQ',
  po: 'PO',
  expense: 'EXP',
  settlement: 'SET',
}
const KIND_OPTIONS = (Object.keys(KIND_LABELS) as Kind[]).map((k) => ({
  value: k,
  label: KIND_LABELS[k],
}))

const tAct = (label: string) => i18n.t(`queue.act.${label}`, { defaultValue: label })

function titleCase(s: string): string {
  const t = s.replace(/_/g, ' ')
  return t.charAt(0).toUpperCase() + t.slice(1)
}

// Which hat the viewer is wearing for this row — mirrors the old queue pages.
function roleLabel(
  action: { isOrganizer?: boolean; requiredPosition?: string; requiredRole?: string } | undefined,
  organizerId: string | null | undefined,
  currentUserId: string | undefined,
): string {
  // inventory_check is the one status where both isOrganizer and
  // requiredPosition can apply — attribute the row to whichever one got it here.
  const role = (key: string, fallback: string) => i18n.t(`queue.role.${key}`, { defaultValue: fallback })
  if (action?.isOrganizer && organizerId === currentUserId) return role('organizer', 'Organizer')
  if (action?.requiredPosition) return role(action.requiredPosition, titleCase(action.requiredPosition))
  if (action?.isOrganizer) return role('organizer', 'Organizer')
  if (action?.requiredRole === 'finance') return role('finance', 'Finance')
  if (action?.requiredRole === 'dept_head_or_admin') return role('dept_head_or_admin', 'Dept head / Admin')
  return '—'
}

export default function MyQueuePage() {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const currentUserId = useAuthStore((s) => s.user?.id)
  const { can } = usePermission()
  const canApproveExpenses = can('finance.expenses.approve', 'approve')
  const canApproveAdvances = can('finance.advances.approve', 'approve')

  const [search, setSearch] = useState('')
  const [kindFilter, setKindFilter] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  // '', 'approval' (needs my approval) or 'overdue' — set by the KPI tiles and by
  // the old Approval Queue's redirect (?filter=approval).
  const [quick, setQuick] = useState(params.get('filter') === 'approval' ? 'approval' : '')
  const [page, setPage] = useState(1)

  const {
    data: poData,
    loading: poLoading,
    refetch: refetchPO,
  } = useQuery<MyPoQueueQuery, MyPoQueueQueryVariables>(MY_PO_QUEUE_QUERY, {
    fetchPolicy: 'cache-and-network',
    pollInterval: 60_000,
  })
  const {
    data: reqData,
    loading: reqLoading,
    refetch: refetchReq,
  } = useQuery<MyRequisitionApprovalQueueQuery, MyRequisitionApprovalQueueQueryVariables>(
    MY_REQUISITION_QUEUE_QUERY,
    { fetchPolicy: 'cache-and-network', pollInterval: 60_000 },
  )
  useEntityChanged('purchase_order', () => void refetchPO())
  useEntityChanged('requisition', () => void refetchReq())

  // Expense claims / settlements live in the finance REST service; only
  // approvers have anything to act on there.
  const [expenseRows, setExpenseRows] = useState<ExpenseClaimQueueApiRow[]>([])
  const [settlementRows, setSettlementRows] = useState<SettlementQueueApiRow[]>([])
  const loadFinanceItems = useCallback(() => {
    if (canApproveExpenses) {
      // Two waits on this approver: 'submitted' (legitimacy approval) and
      // 'approved' (Finance's funding-source decision) — the list endpoint
      // only takes one exact status, so fetch both and merge.
      Promise.all([
        api.get<ExpenseClaimQueueApiRow[]>('/finance/expense-claims', {
          params: { status: 'submitted' },
        }),
        api.get<ExpenseClaimQueueApiRow[]>('/finance/expense-claims', {
          params: { status: 'approved' },
        }),
      ])
        .then(([submitted, approved]) => {
          setExpenseRows([...submitted.data, ...approved.data])
        })
        .catch(() => {
          /* handled — the queue just won't include expense claims this refresh */
        })
    }
    if (canApproveAdvances) {
      api
        .get<SettlementQueueApiRow[]>('/finance/advances/settlements', {
          params: { status: 'submitted' },
        })
        .then((r) => {
          setSettlementRows(r.data)
        })
        .catch(() => {
          /* handled — the queue just won't include settlements this refresh */
        })
    }
  }, [canApproveExpenses, canApproveAdvances])
  useEffect(() => {
    loadFinanceItems()
    const timer = setInterval(loadFinanceItems, 60_000)
    return () => {
      clearInterval(timer)
    }
  }, [loadFinanceItems])

  const items: QueueItem[] = useMemo(() => {
    const out: QueueItem[] = []
    for (const r of reqData?.myRequisitionApprovalQueue ?? []) {
      const action = REQUISITION_STATUS_ACTIONS[r.status] as
        | (typeof REQUISITION_STATUS_ACTIONS)[string]
        | undefined
      out.push({
        key: `req-${r.id}`,
        kind: 'requisition',
        id: r.id,
        number: r.requisition_number,
        headline: r.projectName ?? r.purpose ?? '—',
        sub: [r.organizerName, r.branch_name].filter(Boolean).join(' · '),
        status: r.status,
        statusLabel: getRequisitionStatusLabel(r.status),
        statusVariant: getRequisitionStatusVariant(r.status),
        action: tAct(action?.label ?? 'Action needed'),
        role: roleLabel(action, r.organizer_id, currentUserId),
        updatedAt: r.updated_at,
        href:
          r.status === 'items_bought'
            ? `/procurement/requisitions/${r.id}/items-bought`
            : `/procurement/requisitions/${r.id}`,
        needsApproval: r.status === 'pending_approval',
        priority: r.priority ?? null,
      })
    }
    for (const p of poData?.myPOQueue ?? []) {
      const action = PO_STATUS_ACTIONS[p.status] as (typeof PO_STATUS_ACTIONS)[string] | undefined
      // A 'bought' PO marked delivery_destination='jobsite' goes straight to the
      // project as a direct delivery — a different action from the generic
      // "Record receipt" (into stock) every other 'bought' PO shares.
      const isJobsiteDelivery = p.status === 'bought' && p.delivery_destination === 'jobsite'
      out.push({
        key: `po-${p.id}`,
        kind: 'po',
        id: p.id,
        number: p.po_number,
        headline: p.vendor_name ?? p.projectName ?? '—',
        sub: [p.requisitionNumber, p.projectCode].filter(Boolean).join(' · '),
        status: p.status,
        statusLabel: getPOStatusLabel(p.status),
        statusVariant: getPOStatusVariant(p.status),
        action: isJobsiteDelivery
          ? tAct('Confirm jobsite delivery')
          : tAct(action?.label ?? 'Action needed'),
        role: roleLabel(action, p.organizer_id, currentUserId),
        updatedAt: p.updated_at,
        href: `/procurement/purchase-orders/${p.id}`,
        needsApproval: p.status === 'pending_approval',
        priority: p.priority,
      })
    }
    for (const c of expenseRows) {
      const funding = c.status === 'approved'
      out.push({
        key: `exp-${c.id}`,
        kind: 'expense',
        id: c.id,
        number: c.claim_number,
        headline: c.employee_name,
        sub: t('queue.expenseClaim'),
        status: c.status,
        statusLabel: funding ? tAct('Awaiting funding decision') : tAct('Pending approval'),
        statusVariant: 'warning',
        action: funding ? tAct('Decide expense funding source') : tAct('Approve expense claim'),
        role: i18n.t('queue.role.approver', { defaultValue: 'Approver' }),
        updatedAt: c.created_at,
        href: `/finance/expense-claims/${c.id}`,
        needsApproval: !funding,
        priority: null,
      })
    }
    for (const s of settlementRows) {
      out.push({
        key: `set-${s.id}`,
        kind: 'settlement',
        id: s.id,
        number: s.settlement_number,
        headline: s.employee_name,
        sub: t('queue.advanceSettlement'),
        status: s.status,
        statusLabel: tAct('Pending approval'),
        statusVariant: 'warning',
        action: tAct('Approve advance settlement'),
        role: i18n.t('queue.role.approver', { defaultValue: 'Approver' }),
        updatedAt: s.created_at,
        href: `/finance/advances/${s.advance_id}`,
        needsApproval: true,
        priority: null,
      })
    }
    // Longest-waiting first — the oldest item is the most overdue.
    return out.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
  }, [reqData, poData, expenseRows, settlementRows, currentUserId, t])

  const loading = (poLoading || reqLoading) && items.length === 0
  const count = (k: Kind) => items.filter((i) => i.kind === k).length
  const approvalCount = items.filter((i) => i.needsApproval).length
  const overdueCount = items.filter((i) => daysSince(i.updatedAt) >= OVERDUE_DAYS).length

  const actionOptions = useMemo(
    () => [...new Set(items.map((i) => i.action))].sort().map((a) => ({ value: a, label: a })),
    [items],
  )

  const filtered = items.filter((i) => {
    if (kindFilter && i.kind !== kindFilter) return false
    if (actionFilter && i.action !== actionFilter) return false
    if (quick === 'approval' && !i.needsApproval) return false
    if (quick === 'overdue' && daysSince(i.updatedAt) < OVERDUE_DAYS) return false
    if (search) {
      const q = search.toLowerCase()
      if (
        !i.number.toLowerCase().includes(q) &&
        !i.headline.toLowerCase().includes(q) &&
        !i.sub.toLowerCase().includes(q) &&
        !i.action.toLowerCase().includes(q)
      )
        return false
    }
    return true
  })

  useEffect(() => {
    setPage(1)
  }, [search, kindFilter, actionFilter, quick])
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
  const anyFilter = !!(search || kindFilter || actionFilter || quick)

  const columns: Column<QueueItem>[] = [
    {
      key: 'number',
      header: t('queue.item'),
      mobilePrimary: true,
      render: (i) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              fontSize: '10px',
              fontWeight: 700,
              letterSpacing: '0.04em',
              color: theme.textSecondary,
              background: theme.bgSurfaceHover,
              border: `1px solid ${theme.border}`,
              borderRadius: '4px',
              padding: '1px 6px',
            }}
          >
            {KIND_TAGS[i.kind]}
          </span>
          <span style={{ fontWeight: 600, color: theme.accent, fontSize: '13px' }}>{i.number}</span>
          {(i.priority === 'emergency' || i.priority === 'high') && (
            <span
              style={{
                fontSize: '10px',
                fontWeight: 700,
                textTransform: 'uppercase',
                color: i.priority === 'emergency' ? '#dc2626' : '#d97706',
              }}
            >
              {i.priority}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'headline',
      header: t('queue.details'),
      mobileSecondary: true,
      render: (i) => (
        <div>
          <div style={{ fontSize: '13px', color: theme.textPrimary }}>{i.headline}</div>
          {i.sub && <div style={{ fontSize: '11px', color: theme.textMuted }}>{i.sub}</div>}
        </div>
      ),
    },
    {
      key: 'action',
      header: t('queue.yourAction'),
      mobilePriority: 1,
      render: (i) => (
        <span style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary }}>
          {i.action}
        </span>
      ),
    },
    {
      key: 'role',
      header: t('queue.yourRole'),
      mobileLabel: t('queue.mobileRole'),
      mobilePriority: 3,
      render: (i) => <span style={{ fontSize: '13px', color: theme.textSecondary }}>{enumLabel(i.role)}</span>,
    },
    {
      key: 'status',
      header: t('queue.status'),
      mobilePriority: 2,
      render: (i) => <Badge variant={i.statusVariant}>{i.statusLabel}</Badge>,
    },
    {
      key: 'waiting',
      header: t('queue.waiting'),
      mobilePriority: 4,
      render: (i) => {
        const d = daysSince(i.updatedAt)
        const late = d >= OVERDUE_DAYS
        return (
          <span
            style={{
              fontSize: '13px',
              whiteSpace: 'nowrap',
              fontWeight: late ? 600 : 400,
              color: late ? theme.danger : theme.textSecondary,
            }}
          >
            {d === 1 ? '1 day' : `${d} days`}
          </span>
        )
      },
    },
  ]

  const toggleQuick = (k: string) => {
    setQuick((q) => (q === k ? '' : k))
  }

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '2400px' }}>
      <PageTitle
        icon="doc"
        title={t('queue.myQueue')}
        subtitle={t('queue.everythingWaitingOnYouRequisitionsPurchase')}
      />

      <KpiRow>
        <KpiTile
          tone="accent"
          icon="doc"
          label={t('queue.myQueue')}
          value={items.length}
          sub={t('queue.actionsRequired')}
          loading={loading}
          active={!anyFilter}
          onClick={() => {
            setSearch('')
            setKindFilter('')
            setActionFilter('')
            setQuick('')
          }}
        />
        <KpiTile
          tone="info"
          icon="doc"
          label={t('queue.requisitions')}
          value={count('requisition')}
          sub={t('queue.awaitingYourAction')}
          loading={loading}
          active={kindFilter === 'requisition'}
          onClick={() => {
            setKindFilter((k) => (k === 'requisition' ? '' : 'requisition'))
          }}
        />
        <KpiTile
          tone="success"
          icon="cart"
          label={t('queue.purchaseOrders')}
          value={count('po')}
          sub={t('queue.awaitingYourAction')}
          loading={loading}
          active={kindFilter === 'po'}
          onClick={() => {
            setKindFilter((k) => (k === 'po' ? '' : 'po'))
          }}
        />
        <KpiTile
          tone="warning"
          icon="clock"
          label={t('queue.needsMyApproval')}
          value={approvalCount}
          sub={t('queue.awaitingYourSignOff')}
          loading={loading}
          active={quick === 'approval'}
          onClick={() => {
            toggleQuick('approval')
          }}
        />
        <KpiTile
          tone="danger"
          icon="alert"
          label={t('queue.overdue')}
          value={overdueCount}
          sub={`Waiting ${OVERDUE_DAYS}+ days`}
          loading={loading}
          active={quick === 'overdue'}
          onClick={() => {
            toggleQuick('overdue')
          }}
        />
      </KpiRow>

      <Card padding="md" style={{ borderRadius: '14px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
          <SearchBox
            value={search}
            onChange={setSearch}
            placeholder={t('queue.searchNumberProjectVendorAction')}
          />
          <PillSelect
            label={t('queue.type')}
            value={kindFilter}
            options={KIND_OPTIONS.map((o) => ({
              ...o,
              label: t(`queue.kind.${o.value}`, { defaultValue: o.label }),
            }))}
            onChange={setKindFilter}
          />
          <PillSelect
            label={t('queue.action')}
            value={actionFilter}
            options={actionOptions}
            onChange={setActionFilter}
          />
          <IconButton
            title={t('queue.refresh')}
            onClick={() => {
              void refetchPO()
              void refetchReq()
              loadFinanceItems()
            }}
          >
            <Icon name="refresh" size={16} />
          </IconButton>
        </div>

        <div style={{ marginTop: '14px' }}>
          {!loading && filtered.length === 0 ? (
            <div style={{ padding: '56px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: '15px', fontWeight: 600, color: theme.textPrimary }}>
                {anyFilter ? t('queue.nothingMatchesTheseFilters') : t('queue.youReAllCaughtUp')}
              </div>
              <div style={{ fontSize: '13px', color: theme.textMuted, marginTop: '4px' }}>
                {anyFilter
                  ? t('queue.clearAFilterToSeeThe')
                  : t('queue.noRequisitionsPurchaseOrdersOrApprovals')}
              </div>
            </div>
          ) : (
            <Table
              columns={columns}
              data={pageRows}
              loading={loading}
              rowKey="key"
              onRowClick={(i) => {
                navigate(i.href)
              }}
              getRowStyle={(i) =>
                daysSince(i.updatedAt) >= OVERDUE_DAYS
                  ? { borderInlineStart: `3px solid ${theme.danger}` }
                  : {}
              }
            />
          )}
        </div>
        {filtered.length > 0 && (
          <Pagination
            page={safePage}
            pageSize={PAGE_SIZE}
            total={filtered.length}
            onChange={setPage}
          />
        )}
      </Card>
    </div>
  )
}
