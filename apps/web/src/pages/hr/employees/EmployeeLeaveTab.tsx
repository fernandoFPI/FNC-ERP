import { useState } from 'react'
import { useQuery, useMutation } from '@apollo/client'
import {
  LEAVE_BALANCES_QUERY,
  LEAVE_REQUESTS_QUERY,
  LEAVE_TYPES_QUERY,
  CREATE_LEAVE_REQUEST,
} from '../../../graphql/hr'
import { useTheme } from '../../../theme/ThemeContext'
import { Card } from '../../../components/ui/Card'
import type { Column } from '../../../components/ui/Table'
import { Table } from '../../../components/ui/Table'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Modal } from '../../../components/ui/Modal'
import { Select } from '../../../components/ui/Select'
import { Input } from '../../../components/ui/Input'
import { Textarea } from '../../../components/ui/Textarea'
import { useToastStore } from '../../../store/toastStore'

interface LeaveBalance {
  leave_type_id: string
  leave_type_name: string
  days_allocated: number
  days_used: number
  days_remaining: number
}

interface LeaveRequest {
  id: string
  leave_type_name?: string
  start_date: string
  end_date: string
  total_days: number
  status: string
  reason?: string
  reviewed_at?: string
}

const emptyForm = { leave_type_id: '', start_date: '', end_date: '', reason: '' }

function statusVariant(s: string): 'success' | 'danger' | 'neutral' | 'warning' {
  return s === 'approved'
    ? 'success'
    : s === 'rejected'
      ? 'danger'
      : s === 'cancelled'
        ? 'neutral'
        : 'warning'
}

export function EmployeeLeaveTab({ employeeId }: { employeeId: string }) {
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)

  const { data: balData, refetch: refetchBalances } = useQuery(LEAVE_BALANCES_QUERY, {
    variables: { employee_id: employeeId },
    fetchPolicy: 'cache-and-network',
  })
  const {
    data: reqData,
    loading,
    refetch: refetchRequests,
  } = useQuery(LEAVE_REQUESTS_QUERY, {
    variables: { employee_id: employeeId },
    fetchPolicy: 'cache-and-network',
  })
  const { data: typesData } = useQuery(LEAVE_TYPES_QUERY, { variables: { is_active: true } })
  const [createRequest, { loading: creating }] = useMutation(CREATE_LEAVE_REQUEST)

  const balances: LeaveBalance[] = balData?.leaveBalances ?? []
  const requests: LeaveRequest[] = reqData?.leaveRequests ?? []
  const leaveTypes = typesData?.leaveTypes ?? []

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
            employee_id: employeeId,
            leave_type_id: form.leave_type_id,
            start_date: form.start_date,
            end_date: form.end_date,
            reason: form.reason || undefined,
          },
        },
      })
      addToast({ type: 'success', message: 'Leave request created' })
      setModalOpen(false)
      setForm(emptyForm)
      refetchRequests()
      refetchBalances()
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    }
  }

  const columns: Column<LeaveRequest>[] = [
    {
      key: 'leave_type_name',
      header: 'Type',
      render: (r) => <span style={{ color: theme.textPrimary }}>{r.leave_type_name ?? '—'}</span>,
    },
    {
      key: 'start_date',
      header: 'From',
      render: (r) => (
        <span style={{ fontFamily: 'monospace', fontSize: '12px', color: theme.textSecondary }}>
          {r.start_date?.slice(0, 10)}
        </span>
      ),
    },
    {
      key: 'end_date',
      header: 'To',
      render: (r) => (
        <span style={{ fontFamily: 'monospace', fontSize: '12px', color: theme.textSecondary }}>
          {r.end_date?.slice(0, 10)}
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
      render: (r) => <Badge variant={statusVariant(r.status)}>{r.status}</Badge>,
    },
    {
      key: 'reviewed_at',
      header: 'Updated',
      render: (r) => (
        <span style={{ color: theme.textMuted, fontSize: '12px' }}>
          {r.reviewed_at?.slice(0, 10) ?? '—'}
        </span>
      ),
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Balance cards */}
      {balances.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: '10px',
          }}
        >
          {balances.map((b) => {
            const unlimited = b.days_allocated == null
            const pct =
              !unlimited && b.days_allocated > 0
                ? Math.min(100, (b.days_used / b.days_allocated) * 100)
                : 0
            const color = pct >= 90 ? theme.danger : pct >= 60 ? theme.warning : theme.success
            return (
              <div
                key={b.leave_type_id}
                style={{
                  background: theme.bgSurface,
                  border: `1px solid ${theme.border}`,
                  borderRadius: '10px',
                  padding: '14px',
                }}
              >
                <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '6px' }}>
                  {b.leave_type_name}
                </div>
                <div
                  style={{
                    fontSize: '22px',
                    fontWeight: 700,
                    color: theme.textPrimary,
                    lineHeight: 1,
                  }}
                >
                  {unlimited ? '∞' : (b.days_remaining ?? 0)}
                </div>
                <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '2px' }}>
                  {unlimited
                    ? `${b.days_used} days used (unlimited)`
                    : `of ${b.days_allocated} remaining`}
                </div>
                {!unlimited && (
                  <div
                    style={{
                      marginTop: '8px',
                      height: '4px',
                      borderRadius: '2px',
                      background: theme.border,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${pct}%`,
                        background: color,
                        borderRadius: '2px',
                        transition: 'width 0.3s',
                      }}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Request history */}
      <Card>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 16px',
            borderBottom: `1px solid ${theme.border}`,
          }}
        >
          <span style={{ fontWeight: 600, fontSize: '13px', color: theme.textPrimary }}>
            Leave requests
          </span>
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setModalOpen(true)
            }}
          >
            New request
          </Button>
        </div>
        <Table columns={columns} data={requests} loading={loading} rowKey="id" />
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false)
        }}
        title="New Leave Request"
        size="sm"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setModalOpen(false)
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSubmit}
              loading={creating}
              disabled={!form.leave_type_id || !form.start_date || !form.end_date}
            >
              Submit
            </Button>
          </>
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
            (() => {
              const bal = balances.find((b) => b.leave_type_id === form.leave_type_id)
              return bal?.days_remaining != null ? (
                <div style={{ fontSize: '12px', color: theme.textMuted }}>
                  Balance:{' '}
                  <span style={{ color: theme.accent, fontWeight: 600 }}>
                    {bal.days_remaining} days remaining
                  </span>
                </div>
              ) : null
            })()}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
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
