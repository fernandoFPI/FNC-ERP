import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@apollo/client'
import {
  LEAVE_REQUESTS_QUERY,
  LEAVE_TYPES_QUERY,
  LEAVE_BALANCES_QUERY,
  CREATE_LEAVE_REQUEST,
} from '../../../graphql/hr'

import { useTheme } from '../../../theme/ThemeContext'
import { usePagePadding } from '../../../hooks/usePagePadding'
import { useBreakpoint } from '../../../hooks/useBreakpoint'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { FilterBar } from '../../../components/ui/FilterBar'
import { FilterPresets } from '../../../components/ui/FilterPresets'
import { useFilterPresets } from '../../../hooks/useFilterPresets'

const FILTER_DEFAULTS = { status: '', fromDate: '', toDate: '' }
import type { Column } from '../../../components/ui/Table'
import { Table } from '../../../components/ui/Table'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Modal } from '../../../components/ui/Modal'
import { Select } from '../../../components/ui/Select'
import { Input } from '../../../components/ui/Input'
import { Textarea } from '../../../components/ui/Textarea'
import { useToastStore } from '../../../store/toastStore'
import { useAuthStore } from '../../../store/authStore'

interface LeaveRequest {
  id: string
  employee_name?: string
  leave_type_name?: string
  start_date: string
  end_date: string
  total_days: number
  status: string
  reviewed_at?: string
}

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'cancelled', label: 'Cancelled' },
]

const emptyForm = { leave_type_id: '', start_date: '', end_date: '', reason: '' }

export default function LeaveRequestsPage() {
  const { theme } = useTheme()
  const pagePadding = usePagePadding()
  const { isPhone } = useBreakpoint()
  const navigate = useNavigate()
  const addToast = useToastStore((s) => s.addToast)
  const user = useAuthStore((s) => s.user)

  const [statusFilter, setStatusFilter] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const currentFilters = { status: statusFilter, fromDate, toDate }
  const { presets, savePreset, deletePreset, resolvePreset } = useFilterPresets(
    'leave_requests',
    FILTER_DEFAULTS,
  )
  const [form, setForm] = useState(emptyForm)

  const { data, loading, refetch } = useQuery(LEAVE_REQUESTS_QUERY, {
    variables: {
      status: statusFilter || undefined,
      from_date: fromDate || undefined,
      to_date: toDate || undefined,
    },
    fetchPolicy: 'cache-and-network',
  })
  const { data: leaveTypesData } = useQuery(LEAVE_TYPES_QUERY, { variables: { is_active: true } })
  const { data: balancesData } = useQuery(LEAVE_BALANCES_QUERY, {
    variables: { employee_id: user?.id ?? '' },
    skip: !user?.id,
  })
  const [createRequest, { loading: creating }] = useMutation(CREATE_LEAVE_REQUEST)

  const requests: LeaveRequest[] = data?.leaveRequests ?? []
  const leaveTypes = leaveTypesData?.leaveTypes ?? []
  const balances = balancesData?.leaveBalances ?? []

  const days =
    form.start_date && form.end_date
      ? Math.max(
          0,
          Math.ceil(
            (new Date(form.end_date).getTime() - new Date(form.start_date).getTime()) / 86400000,
          ) + 1,
        )
      : 0

  async function handleSubmit() {
    if (!form.leave_type_id || !form.start_date || !form.end_date) return
    try {
      await createRequest({
        variables: {
          input: {
            leave_type_id: form.leave_type_id,
            start_date: form.start_date,
            end_date: form.end_date,
            reason: form.reason || undefined,
          },
        },
      })
      addToast({ type: 'success', message: 'Leave request submitted' })
      setModalOpen(false)
      setForm(emptyForm)
      refetch()
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    }
  }

  const statusVariant = (s: string) =>
    s === 'approved'
      ? 'success'
      : s === 'rejected'
        ? 'danger'
        : s === 'cancelled'
          ? 'neutral'
          : 'warning'

  const columns: Column<LeaveRequest>[] = [
    {
      key: 'employee_name',
      header: 'Employee',
      mobilePrimary: true,
      render: (r) => (
        <span style={{ color: theme.textPrimary, fontWeight: 500 }}>{r.employee_name ?? '—'}</span>
      ),
    },
    {
      key: 'leave_type_name',
      header: 'Type',
      mobileSecondary: true,
      render: (r) => <span style={{ color: theme.textSecondary }}>{r.leave_type_name ?? '—'}</span>,
    },
    {
      key: 'start_date',
      header: 'From',
      render: (r) => (
        <span style={{ fontFamily: 'monospace', fontSize: '12px', color: theme.textSecondary }}>
          {r.start_date}
        </span>
      ),
    },
    {
      key: 'end_date',
      header: 'To',
      mobileHide: true,
      render: (r) => (
        <span style={{ fontFamily: 'monospace', fontSize: '12px', color: theme.textSecondary }}>
          {r.end_date}
        </span>
      ),
    },
    {
      key: 'total_days',
      header: 'Days',
      render: (r) => (
        <span style={{ fontFamily: 'monospace', color: theme.textPrimary }}>{r.total_days}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      mobileAction: true,
      render: (r) => <Badge variant={statusVariant(r.status)}>{r.status}</Badge>,
    },
    {
      key: 'reviewed_at',
      header: 'Updated',
      mobileHide: true,
      render: (r) => (
        <span style={{ color: theme.textMuted, fontSize: '12px' }}>
          {r.reviewed_at?.slice(0, 10) ?? '—'}
        </span>
      ),
    },
  ]

  return (
    <div
      style={{
        ...pagePadding,
        margin: '0 auto',
        maxWidth: '1400px',
        paddingBottom: isPhone ? 'calc(env(safe-area-inset-bottom, 0px) + 80px)' : undefined,
      }}
    >
      <PageHeader
        title="Leave Requests"
        subtitle={`${requests.length} requests`}
        actions={
          <Button
            variant="primary"
            size="sm"
            fullWidthOnMobile
            onClick={() => {
              setModalOpen(true)
            }}
          >
            Request Leave
          </Button>
        }
      />

      <Card style={{ marginTop: '20px' }}>
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${theme.border}` }}>
          <FilterBar
            filters={[
              {
                key: 'status',
                label: 'Status',
                value: statusFilter,
                options: STATUS_OPTIONS,
                onChange: setStatusFilter,
              },
            ]}
            fromDate={fromDate}
            toDate={toDate}
            onFromDateChange={setFromDate}
            onToDateChange={setToDate}
            resultCount={requests.length}
            onRefresh={() => refetch()}
          >
            <FilterPresets
              presets={presets}
              onApply={(preset) => {
                const r = resolvePreset(preset)
                setStatusFilter(r.status)
                setFromDate(r.fromDate)
                setToDate(r.toDate)
              }}
              onSave={(name) => {
                savePreset(name, currentFilters)
              }}
              onDelete={deletePreset}
            />
          </FilterBar>
        </div>
        <Table
          columns={columns}
          data={requests}
          loading={loading}
          rowKey="id"
          onRowClick={(r) => {
            navigate(`/hr/leave/${r.id}`)
          }}
        />
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false)
        }}
        title="Request Leave"
        size="sm"
        bottomSheet={isPhone}
        footer={
          <div
            style={{
              display: 'flex',
              flexDirection: isPhone ? 'column' : 'row',
              gap: '8px',
              width: '100%',
            }}
          >
            {!isPhone && (
              <Button
                variant="secondary"
                onClick={() => {
                  setModalOpen(false)
                }}
              >
                Cancel
              </Button>
            )}
            <Button
              variant="primary"
              fullWidthOnMobile
              onClick={handleSubmit}
              loading={creating}
              disabled={!form.leave_type_id || !form.start_date || !form.end_date}
            >
              Submit Request
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <Select
            label="Leave type"
            value={form.leave_type_id}
            onChange={(e) => {
              setForm((f) => ({ ...f, leave_type_id: e.target.value }))
            }}
            required
            options={leaveTypes.map((lt: { id: string; name: string }) => ({
              value: lt.id,
              label: lt.name,
            }))}
            placeholder="Select type…"
          />
          {form.leave_type_id &&
            balances.length > 0 &&
            (() => {
              const bal = balances.find(
                (b: { leave_type_id: string; days_remaining?: number }) =>
                  b.leave_type_id === form.leave_type_id,
              )
              return bal?.days_remaining != null ? (
                <div style={{ fontSize: '12px', color: theme.textMuted }}>
                  Balance:{' '}
                  <span style={{ color: theme.accent }}>{bal.days_remaining} days remaining</span>
                </div>
              ) : null
            })()}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '12px',
            }}
          >
            <Input
              label="Start date"
              type="date"
              value={form.start_date}
              onChange={(e) => {
                setForm((f) => ({ ...f, start_date: e.target.value }))
              }}
              required
            />
            <Input
              label="End date"
              type="date"
              value={form.end_date}
              onChange={(e) => {
                setForm((f) => ({ ...f, end_date: e.target.value }))
              }}
              required
            />
          </div>
          {days > 0 && (
            <div style={{ fontSize: '12px', color: theme.textMuted }}>
              Duration:{' '}
              <span style={{ color: theme.textPrimary, fontWeight: 600 }}>
                {days} day{days !== 1 ? 's' : ''}
              </span>
            </div>
          )}
          <Textarea
            label="Reason (optional)"
            value={form.reason}
            onChange={(e) => {
              setForm((f) => ({ ...f, reason: e.target.value }))
            }}
            rows={2}
          />
        </div>
      </Modal>
    </div>
  )
}
