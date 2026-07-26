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

interface OTRequest {
  id: string
  employee_id: string
  employee_name: string
  work_date: string
  regular_hours: number
  overtime_hours: number
  overtime_multiplier: number
  status: 'pending' | 'approved' | 'rejected'
  review_notes?: string
  reviewed_by_email?: string
}

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
]

export default function OvertimePage() {
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)
  const [historyStatusFilter, setHistoryStatusFilter] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false)

  const { data: pendingData, refetch: refetchPending } = useQuery(OVERTIME_REQUESTS_QUERY, {
    fetchPolicy: 'cache-and-network',
  })
  const {
    data: historyData,
    loading: historyLoading,
    refetch: refetchHistory,
  } = useQuery(OVERTIME_REQUESTS_QUERY, {
    variables: { from_date: fromDate || undefined, to_date: toDate || undefined },
    fetchPolicy: 'cache-and-network',
  })

  const [approveOT] = useMutation(APPROVE_OVERTIME)
  const [rejectOT] = useMutation(REJECT_OVERTIME)
  const [bulkApprove, { loading: bulkApproving }] = useMutation(BULK_APPROVE_OVERTIME)

  const allOvertimeLogs: OTRequest[] = pendingData?.overtimeRequests ?? []
  const pendingRequests: OTRequest[] = allOvertimeLogs
  const historyRequests: OTRequest[] = (historyData?.overtimeRequests ?? []).filter(
    (r: OTRequest) => r.status === 'approved' || r.status === 'rejected',
  )

  async function handleApprove(id: string) {
    try {
      await approveOT({ variables: { id } })
      addToast({ type: 'success', message: 'Approved' })
      refetchPending()
      refetchHistory()
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    }
  }

  async function handleReject(id: string, notes: string) {
    try {
      await rejectOT({ variables: { id, reviewNotes: notes } })
      addToast({ type: 'warning', message: 'Rejected' })
      refetchPending()
      refetchHistory()
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    }
  }

  async function handleBulkApprove() {
    const ids = pendingRequests.map((r) => r.id)
    try {
      await bulkApprove({ variables: { ids } })
      addToast({ type: 'success', message: `${ids.length} requests approved` })
      setBulkConfirmOpen(false)
      refetchPending()
      refetchHistory()
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    }
  }

  const historyColumns: Column<OTRequest>[] = [
    {
      key: 'employee_name',
      header: 'Employee',
      render: (r) => (
        <span style={{ color: theme.textPrimary, fontWeight: 500 }}>{r.employee_name}</span>
      ),
    },
    {
      key: 'work_date',
      header: 'Date',
      render: (r) => (
        <span style={{ fontFamily: 'monospace', fontSize: '12px', color: theme.textSecondary }}>
          {r.work_date}
        </span>
      ),
    },
    {
      key: 'overtime_hours',
      header: 'OT hours',
      render: (r) => (
        <span style={{ fontFamily: 'monospace', color: theme.warning }}>{r.overtime_hours}h</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (
        <Badge variant={r.status === 'approved' ? 'success' : 'danger'}>{r.status}</Badge>
      ),
    },
    {
      key: 'reviewed_by_email',
      header: 'Reviewed by',
      render: (r) => (
        <span style={{ color: theme.textMuted, fontSize: '12px' }}>
          {r.reviewed_by_email ?? '—'}
        </span>
      ),
    },
  ]

  return (
    <div style={{ padding: '24px' }}>
      <PageHeader title="Overtime" subtitle="Approve pending overtime requests" />

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
              Pending approvals{' '}
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
                Approve all
              </Button>
            )}
          </div>
          {pendingRequests.length === 0 ? (
            <EmptyState title="All caught up" message="No pending overtime requests." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {pendingRequests.map((r) => (
                <OvertimeRequestCard
                  key={r.id}
                  request={{
                    id: r.id,
                    employeeName: r.employee_name,
                    workDate: r.work_date,
                    regularHours: r.regular_hours,
                    overtimeHours: r.overtime_hours,
                    overtimeMultiplier: r.overtime_multiplier,
                    status: r.status,
                    reviewNotes: r.review_notes,
                  }}
                  isManager
                  onApprove={() => handleApprove(r.id)}
                  onReject={(notes) => handleReject(r.id, notes)}
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
            History
          </div>
          <Card>
            <div style={{ padding: '12px 16px', borderBottom: `1px solid ${theme.border}` }}>
              <FilterBar
                filters={[
                  {
                    key: 'status',
                    label: 'Status',
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
                  refetchPending()
                  refetchHistory()
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
        onConfirm={handleBulkApprove}
        title="Approve all pending requests"
        message={`This will approve all ${pendingRequests.length} pending overtime requests. Continue?`}
        confirmLabel="Approve all"
        loading={bulkApproving}
      />
    </div>
  )
}
