import { useEffect, useState, useCallback } from 'react'
import { useQuery } from '@apollo/client'
import { useNavigate } from 'react-router-dom'
import { MY_REQUISITION_QUEUE_QUERY } from '../../../graphql/requisitions'
import { useAuthStore } from '../../../store/authStore'
import { useTheme } from '../../../theme/ThemeContext'
import { useBreakpoint } from '../../../hooks/useBreakpoint'
import { usePagePadding } from '../../../hooks/usePagePadding'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import type { Column } from '../../../components/ui/Table'
import { Table } from '../../../components/ui/Table'
import {
  getRequisitionStatusVariant,
  getRequisitionStatusLabel,
  REQUISITION_STATUS_ACTIONS,
} from '../../../lib/requisition-constants'
import { useEntityChanged } from '../../../hooks/useEntityChanged'
import { api } from '../../../lib/axios'
import { usePermission } from '../../../hooks/usePermission'
import type { MyRequisitionApprovalQueueQuery, MyRequisitionApprovalQueueQueryVariables } from '../../../graphql/generated'

interface QueueItem {
  id: string
  requisition_number: string
  status: string
  priority?: string | null
  purpose?: string | null
  project_id?: string | null
  projectName?: string | null
  branch_id?: string | null
  branch_name?: string | null
  organizer_id?: string | null
  organizerName?: string | null
  created_at: string
  updated_at: string
  __kind?: 'expense' | 'settlement'
  settlementAdvanceId?: string
}

interface ExpenseClaimQueueApiRow {
  id: string
  claim_number: string
  employee_name: string
  status: string
  created_at: string
}

function expenseClaimToQueueItem(c: ExpenseClaimQueueApiRow): QueueItem {
  return {
    id: c.id,
    requisition_number: c.claim_number,
    status: c.status,
    purpose: 'expense',
    organizerName: c.employee_name,
    created_at: c.created_at,
    updated_at: c.created_at,
    __kind: 'expense',
  }
}

interface SettlementQueueApiRow {
  id: string
  settlement_number: string
  employee_name: string
  advance_id: string
  status: string
  created_at: string
}

function settlementToQueueItem(s: SettlementQueueApiRow): QueueItem {
  return {
    id: s.id,
    requisition_number: s.settlement_number,
    status: s.status,
    purpose: 'expense',
    organizerName: s.employee_name,
    created_at: s.created_at,
    updated_at: s.created_at,
    __kind: 'settlement',
    settlementAdvanceId: s.advance_id,
  }
}

function daysWaiting(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
}

export default function MyRequisitionQueue() {
  const { theme } = useTheme()
  const { isPhone } = useBreakpoint()
  const pagePadding = usePagePadding()
  const navigate = useNavigate()
  const currentUserId = useAuthStore((s) => s.user?.id)
  const { can } = usePermission()
  const canApproveExpenses = can('finance.expenses.approve', 'approve')
  const canApproveAdvances = can('finance.advances.approve', 'approve')

  const { data, loading, refetch } = useQuery<MyRequisitionApprovalQueueQuery, MyRequisitionApprovalQueueQueryVariables>(MY_REQUISITION_QUEUE_QUERY, {
    fetchPolicy: 'cache-and-network',
    pollInterval: 60_000,
  })
  useEntityChanged('requisition', () => void refetch())

  const [pendingExpenseClaims, setPendingExpenseClaims] = useState<QueueItem[]>([])
  const loadPendingExpenseClaims = useCallback(() => {
    if (!canApproveExpenses) return
    // Two separate waits on this approver now: 'submitted' (legitimacy
    // approval) and 'approved' (Finance's funding-source decision, POST
    // /:id/post-payment) — the list endpoint only takes one exact status,
    // so both are fetched and merged rather than one being silently missed.
    Promise.all([
      api.get<ExpenseClaimQueueApiRow[]>('/finance/expense-claims', { params: { status: 'submitted' } }),
      api.get<ExpenseClaimQueueApiRow[]>('/finance/expense-claims', { params: { status: 'approved' } }),
    ])
      .then(([submitted, approved]) => {
        setPendingExpenseClaims([...submitted.data, ...approved.data].map(expenseClaimToQueueItem))
      })
      .catch(() => { /* handled — queue just won't include expense claims this refresh */ })
  }, [canApproveExpenses])

  const [pendingSettlements, setPendingSettlements] = useState<QueueItem[]>([])
  const loadPendingSettlements = useCallback(() => {
    if (!canApproveAdvances) return
    api
      .get<SettlementQueueApiRow[]>('/finance/advances/settlements', { params: { status: 'submitted' } })
      .then((r) => { setPendingSettlements(r.data.map(settlementToQueueItem)); })
      .catch(() => { /* handled — queue just won't include settlements this refresh */ })
  }, [canApproveAdvances])

  useEffect(() => {
    loadPendingExpenseClaims()
    loadPendingSettlements()
    const interval = setInterval(() => {
      loadPendingExpenseClaims()
      loadPendingSettlements()
    }, 60_000)
    return () => { clearInterval(interval); }
  }, [loadPendingExpenseClaims, loadPendingSettlements])

  const items: QueueItem[] = [
    ...(data?.myRequisitionApprovalQueue ?? []),
    ...pendingExpenseClaims,
    ...pendingSettlements,
  ].sort((a, b) => b.updated_at.localeCompare(a.updated_at))

  const grouped = items.reduce<Record<string, QueueItem[]>>((acc, item) => {
    const key =
      item.__kind === 'expense'
        ? item.status === 'approved'
          ? 'Decide expense funding source'
          : 'Approve expense claim'
        : item.__kind === 'settlement'
          ? 'Approve advance settlement'
          : (REQUISITION_STATUS_ACTIONS[item.status]?.label ?? 'Action needed')
    if (!acc[key]) acc[key] = []
    acc[key].push(item)
    return acc
  }, {})

  const columns: Column<QueueItem>[] = [
    {
      key: 'requisition_number',
      header: 'Requisition #',
      mobilePrimary: true,
      render: (item) => (
        <span style={{ fontFamily: 'monospace', color: theme.accent, fontSize: '13px' }}>
          {item.requisition_number}
        </span>
      ),
    },
    {
      key: 'purpose',
      header: 'Purpose',
      mobileSecondary: true,
      render: (item) => <span style={{ color: theme.textPrimary }}>{item.purpose ?? '—'}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      mobilePriority: 1,
      render: (item) =>
        item.__kind ? (
          <Badge variant="warning">
            {item.__kind === 'expense' && item.status === 'approved'
              ? 'Awaiting Funding Decision'
              : 'Pending Approval'}
          </Badge>
        ) : (
          <Badge variant={getRequisitionStatusVariant(item.status)}>{getRequisitionStatusLabel(item.status)}</Badge>
        ),
    },
    {
      key: 'branch_name',
      header: 'Branch',
      mobilePriority: 2,
      render: (item) => <span style={{ color: theme.textMuted }}>{item.branch_name ?? '—'}</span>,
    },
    {
      key: 'updated_at',
      header: 'Updated',
      mobilePriority: 3,
      render: (item) => <span style={{ color: theme.textMuted }}>{item.updated_at.slice(0, 10)}</span>,
    },
    {
      key: 'role',
      header: 'Your role',
      mobileLabel: 'Role',
      mobilePriority: 4,
      render: (item) => {
        if (item.__kind) {
          return <span style={{ color: theme.textMuted }}>Approver</span>
        }
        const action = REQUISITION_STATUS_ACTIONS[item.status]
        let label = '—'
        if (action?.isOrganizer && item.organizer_id === currentUserId) {
          label = 'Organizer'
        } else if (action?.requiredPosition) {
          label = action.requiredPosition.replace(/_/g, ' ')
          label = label.charAt(0).toUpperCase() + label.slice(1)
        } else if (action?.isOrganizer) {
          label = 'Organizer'
        } else if (action?.requiredRole === 'dept_head_or_admin') {
          label = 'Dept head / Admin'
        }
        return <span style={{ color: theme.textMuted }}>{label}</span>
      },
    },
  ]

  return (
    <div
      style={{
        ...pagePadding,
        margin: '0 auto',
        maxWidth: '1300px',
        paddingBottom: isPhone ? 'calc(env(safe-area-inset-bottom, 0px) + 80px)' : undefined,
      }}
    >
      <PageHeader
        title="My Requisition Queue"
        subtitle={`${items.length} requisition${items.length !== 1 ? 's' : ''} awaiting your action`}
      />

      {loading && (
        <div style={{ padding: '48px', textAlign: 'center', color: theme.textMuted }}>Loading…</div>
      )}

      {!loading && items.length === 0 && (
        <Card style={{ marginTop: '24px', padding: '48px', textAlign: 'center' }}>
          <div style={{ color: theme.textMuted, fontSize: '14px' }}>
            No requisitions awaiting your action.
          </div>
        </Card>
      )}

      {Object.entries(grouped).map(([actionLabel, group]) => (
        <div key={actionLabel} style={{ marginTop: '24px' }}>
          <div
            style={{
              fontSize: '12px',
              fontWeight: 600,
              color: theme.textMuted,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginBottom: '8px',
            }}
          >
            {actionLabel} ({group.length})
          </div>

          <Card>
            <Table
              columns={columns}
              data={group}
              rowKey="id"
              onRowClick={(item) => {
                if (item.__kind === 'expense') {
                  navigate(`/finance/expense-claims/${item.id}`)
                  return
                }
                if (item.__kind === 'settlement') {
                  navigate(`/finance/advances/${item.settlementAdvanceId}`)
                  return
                }
                navigate(
                  item.status === 'items_bought'
                    ? `/procurement/requisitions/${item.id}/items-bought`
                    : `/procurement/requisitions/${item.id}`,
                )
              }}
              getRowStyle={(item) =>
                daysWaiting(item.updated_at) >= 3 ? { borderLeft: `3px solid ${theme.danger}` } : {}
              }
            />
          </Card>
        </div>
      ))}
    </div>
  )
}
