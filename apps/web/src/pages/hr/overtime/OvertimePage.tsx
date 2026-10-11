import i18n, { enumLabel } from '../../../i18n'
import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { useQuery, useMutation } from '@apollo/client'
import {
  OVERTIME_REQUESTS_QUERY,
  APPROVE_OVERTIME,
  REJECT_OVERTIME,
  BULK_APPROVE_OVERTIME,
} from '../../../graphql/hr'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import type { Column } from '../../../components/ui/Table'
import { Table } from '../../../components/ui/Table'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { FilterBar } from '../../../components/ui/FilterBar'
import { OvertimeRequestCard } from '../../../components/ui/OvertimeRequestCard'
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog'
import { EmptyState } from '../../../components/ui/EmptyState'
import { useToastStore } from '../../../store/toastStore'
import type { ApproveOvertimeRequestMutation, ApproveOvertimeRequestMutationVariables, BulkApproveOvertimeMutation, BulkApproveOvertimeMutationVariables, OvertimeRequestsQuery, OvertimeRequestsQueryVariables, RejectOvertimeRequestMutation, RejectOvertimeRequestMutationVariables } from '../../../graphql/generated'

interface OTRequest {
  id: string
  employee_id: string
  employee_name: string | null
  work_date: string
  regular_hours: string | null
  overtime_hours: string
  overtime_multiplier: number | null
  status: string
  review_notes?: string | null
  reviewed_by_email?: string | null
}

const STATUS_OPTIONS = [
  { value: 'pending', get label() { return i18n.t('hr.overtime.pending', { defaultValue: "Pending" }) } },
  { value: 'approved', get label() { return i18n.t('hr.overtime.approved', { defaultValue: "Approved" }) } },
  { value: 'rejected', get label() { return i18n.t('hr.overtime.rejected', { defaultValue: "Rejected" }) } },
]

export default function OvertimePage() {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)
  const [historyStatusFilter, setHistoryStatusFilter] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false)

  const { data: pendingData, refetch: refetchPending } = useQuery<OvertimeRequestsQuery, OvertimeRequestsQueryVariables>(OVERTIME_REQUESTS_QUERY, {
    fetchPolicy: 'cache-and-network',
  })
  const {
    data: historyData,
    loading: historyLoading,
    refetch: refetchHistory,
  } = useQuery<OvertimeRequestsQuery, OvertimeRequestsQueryVariables>(OVERTIME_REQUESTS_QUERY, {
    variables: { from_date: fromDate || undefined, to_date: toDate || undefined },
    fetchPolicy: 'cache-and-network',
  })

  const [approveOT] = useMutation<ApproveOvertimeRequestMutation, ApproveOvertimeRequestMutationVariables>(APPROVE_OVERTIME)
  const [rejectOT] = useMutation<RejectOvertimeRequestMutation, RejectOvertimeRequestMutationVariables>(REJECT_OVERTIME)
  const [bulkApprove, { loading: bulkApproving }] = useMutation<BulkApproveOvertimeMutation, BulkApproveOvertimeMutationVariables>(BULK_APPROVE_OVERTIME)

  const allOvertimeLogs: OTRequest[] = (pendingData?.overtimeRequests ?? []).filter((x): x is NonNullable<typeof x> => x !== null)
  const pendingRequests: OTRequest[] = allOvertimeLogs
  const historyRequests: OTRequest[] = (historyData?.overtimeRequests ?? [])
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .filter((r) => r.status === 'approved' || r.status === 'rejected')

  async function handleApprove(id: string) {
    try {
      await approveOT({ variables: { id } })
      addToast({ type: 'success', message: t('hr.overtime.approved') })
      void refetchPending()
      void refetchHistory()
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    }
  }

  async function handleReject(id: string, notes: string) {
    try {
      await rejectOT({ variables: { id, reviewNotes: notes } })
      addToast({ type: 'warning', message: t('hr.overtime.rejected') })
      void refetchPending()
      void refetchHistory()
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    }
  }

  async function handleBulkApprove() {
    const ids = pendingRequests.map((r) => r.id)
    try {
      await bulkApprove({ variables: { ids } })
      addToast({ type: 'success', message: t('hr.overtime.requestsApproved', { length: ids.length }) })
      setBulkConfirmOpen(false)
      void refetchPending()
      void refetchHistory()
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    }
  }

  const historyColumns: Column<OTRequest>[] = [
    {
      key: 'employee_name',
      header: t('hr.overtime.employee'),
      render: (r) => (
        <span style={{ color: theme.textPrimary, fontWeight: 500 }}>{r.employee_name}</span>
      ),
    },
    {
      key: 'work_date',
      header: t('hr.overtime.date'),
      render: (r) => (
        <span style={{ fontFamily: 'monospace', fontSize: '12px', color: theme.textSecondary }}>
          {r.work_date}
        </span>
      ),
    },
    {
      key: 'overtime_hours',
      header: t('hr.overtime.otHours'),
      render: (r) => (
        <span style={{ fontFamily: 'monospace', color: theme.warning }}>{r.overtime_hours}h</span>
      ),
    },
    {
      key: 'status',
      header: t('hr.overtime.status'),
      render: (r) => (
        <Badge variant={r.status === 'approved' ? 'success' : 'danger'}>{enumLabel(r.status)}</Badge>
      ),
    },
    {
      key: 'reviewed_by_email',
      header: t('hr.overtime.reviewedBy'),
      render: (r) => (
        <span style={{ color: theme.textMuted, fontSize: '12px' }}>
          {r.reviewed_by_email ?? '—'}
        </span>
      ),
    },
  ]

  return (
    <div style={{ padding: '24px' }}>
      <PageHeader title={t('hr.overtime.overtime')} subtitle={t('hr.overtime.approvePendingOvertimeRequests')} />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '20px',
          marginTop: '20px',
        }}
      >
        {/* Left: Pending */}
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '12px',
            }}
          >
            <div style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary }}>
              {t('hr.overtime.pendingApprovals')}{' '}
              <span style={{ color: theme.textMuted, fontWeight: 400 }}>
                ({pendingRequests.length})
              </span>
            </div>
            {pendingRequests.length > 1 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setBulkConfirmOpen(true)
                }}
              >
                {t('hr.overtime.approveAll')}
              </Button>
            )}
          </div>
          {pendingRequests.length === 0 ? (
            <EmptyState title={t('hr.overtime.allCaughtUp')} message={t('hr.overtime.noPendingOvertimeRequests')} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {pendingRequests.map((r) => (
                <OvertimeRequestCard
                  key={r.id}
                  request={{
                    id: r.id,
                    employeeName: r.employee_name ?? '—',
                    workDate: r.work_date,
                    regularHours: Number(r.regular_hours ?? 0),
                    overtimeHours: Number(r.overtime_hours),
                    overtimeMultiplier: r.overtime_multiplier ?? 1,
                    status: r.status as 'pending' | 'approved' | 'rejected',
                    reviewNotes: r.review_notes ?? undefined,
                  }}
                  isManager
                  onApprove={() => void handleApprove(r.id)}
                  onReject={(notes) => void handleReject(r.id, notes)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Right: History */}
        <div>
          <div
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: theme.textPrimary,
              marginBottom: '12px',
            }}
          >
            {t('hr.overtime.history')}
          </div>
          <Card>
            <div style={{ padding: '12px 16px', borderBottom: `1px solid ${theme.border}` }}>
              <FilterBar
                filters={[
                  {
                    key: 'status',
                    label: t('hr.overtime.status'),
                    value: historyStatusFilter,
                    options: STATUS_OPTIONS,
                    onChange: setHistoryStatusFilter,
                  },
                ]}
                fromDate={fromDate}
                toDate={toDate}
                onFromDateChange={setFromDate}
                onToDateChange={setToDate}
                resultCount={historyRequests.length}
                onRefresh={() => {
                  void refetchPending()
                  void refetchHistory()
                }}
              />
            </div>
            <Table
              columns={historyColumns}
              data={historyRequests}
              loading={historyLoading}
              rowKey="id"
            />
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={bulkConfirmOpen}
        onClose={() => {
          setBulkConfirmOpen(false)
        }}
        onConfirm={(...args: Parameters<typeof handleBulkApprove>) => void handleBulkApprove(...args)}
        title={t('hr.overtime.approveAllPendingRequests')}
        message={t('hr.overtime.thisWillApproveAllPendingOvertime', { length: pendingRequests.length })}
        confirmLabel={t('hr.overtime.approveAll')}
        loading={bulkApproving}
      />
    </div>
  )
}
