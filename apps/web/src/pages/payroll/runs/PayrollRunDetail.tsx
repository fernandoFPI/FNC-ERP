import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation } from '@apollo/client'
import {
  PAYROLL_RUN_QUERY,
  PAYSLIPS_QUERY,
  PROCESS_PAYROLL_RUN,
  APPROVE_PAYROLL_RUN,
  POST_PAYROLL_RUN,
  CANCEL_PAYROLL_RUN,
} from '../../../graphql/payroll'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { StatusBar } from '../../../components/ui/StatusBar'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import type { Column } from '../../../components/ui/Table'
import { Table } from '../../../components/ui/Table'
import { PayslipViewer } from '../../../components/ui/PayslipViewer'
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog'
import { Drawer } from '../../../components/ui/Drawer'
import type { TimelineEvent } from '../../../components/ui/Timeline'
import { Timeline } from '../../../components/ui/Timeline'
import { PermissionGate } from '../../../components/ui/PermissionGate'
import { usePayrollStatus } from '../../../hooks/usePayrollStatus'
import { useToastStore } from '../../../store/toastStore'

const RUN_STEPS = [
  { key: 'draft', label: 'Draft' },
  { key: 'processing', label: 'Processing' },
  { key: 'review', label: 'Review' },
  { key: 'approved', label: 'Approved' },
  { key: 'posted', label: 'Posted' },
]

interface PayrollLine {
  id: string
  employee_name?: string
  employee_number?: string
  working_days?: number
  overtime_hours?: string
  gross_salary?: string
  net_salary?: string
  income_tax?: string
  social_security?: string
  currency_code?: string
}

export default function PayrollRunDetail() {
  const { id } = useParams<{ id: string }>()
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null)
  const [postConfirmOpen, setPostConfirmOpen] = useState(false)
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false)

  const { data, loading, refetch } = useQuery(PAYROLL_RUN_QUERY, {
    variables: { id },
    skip: !id,
    fetchPolicy: 'cache-and-network',
  })
  const { data: linesData, loading: linesLoading } = useQuery(PAYSLIPS_QUERY, {
    variables: { payroll_run_id: id },
    skip: !id,
    fetchPolicy: 'cache-and-network',
  })

  const [processRun, { loading: processing }] = useMutation(PROCESS_PAYROLL_RUN)
  const [approveRun, { loading: approving }] = useMutation(APPROVE_PAYROLL_RUN)
  const [postRun, { loading: posting }] = useMutation(POST_PAYROLL_RUN)
  const [cancelRun, { loading: cancelling }] = useMutation(CANCEL_PAYROLL_RUN)

  const run = data?.payrollRun
  usePayrollStatus(run?.status === 'processing' ? id : undefined)

  const lines: PayrollLine[] = linesData?.payslips ?? []

  async function doAction(fn: () => Promise<unknown>, msg: string) {
    try {
      await fn()
      addToast({ type: 'success', message: msg })
      refetch()
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    }
  }

  if (loading && !run)
    return <div style={{ padding: '24px', color: theme.textMuted }}>Loading…</div>
  if (!run) return <div style={{ padding: '24px', color: theme.textMuted }}>Run not found</div>

  const statusVariant =
    ((
      {
        draft: 'neutral',
        processing: 'info',
        review: 'warning',
        approved: 'accent',
        posted: 'success',
        cancelled: 'danger',
      } as Record<string, string>
    )[run.status as string] as 'neutral' | 'info' | 'warning' | 'accent' | 'success' | 'danger') ??
    'neutral'

  const lineColumns: Column<PayrollLine>[] = [
    {
      key: 'employee_name',
      header: 'Employee',
      render: (l) => (
        <span style={{ fontWeight: 500, color: theme.textPrimary }}>{l.employee_name ?? '—'}</span>
      ),
    },
    {
      key: 'working_days',
      header: 'Days',
      render: (l) => (
        <span style={{ fontFamily: 'monospace', color: theme.textSecondary }}>
          {l.working_days ?? '—'}
        </span>
      ),
    },
    {
      key: 'overtime_hours',
      header: 'OT hrs',
      render: (l) => (
        <span style={{ fontFamily: 'monospace', color: theme.warning }}>
          {l.overtime_hours ?? 0}h
        </span>
      ),
    },
    {
      key: 'gross_salary',
      header: 'Gross',
      render: (l) =>
        l.gross_salary ? (
          <AmountDisplay amount={parseFloat(l.gross_salary)} currency={l.currency_code ?? 'IQD'} />
        ) : (
          <span style={{ color: theme.textMuted }}>—</span>
        ),
    },
    {
      key: 'net_salary',
      header: 'Net',
      render: (l) =>
        l.net_salary ? (
          <AmountDisplay amount={parseFloat(l.net_salary)} currency={l.currency_code ?? 'IQD'} />
        ) : (
          <span style={{ color: theme.textMuted }}>—</span>
        ),
    },
  ]

  const timeline: TimelineEvent[] = []

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1300px' }}>
      <PageHeader
        title={run.period_name}
        subtitle={`${run.start_date?.slice(0, 10) ?? ''} – ${run.end_date?.slice(0, 10) ?? ''}`}
        backPath="/payroll/runs"
        status={<Badge variant={statusVariant}>{run.status}</Badge>}
        actions={
          <div style={{ display: 'flex', gap: '8px' }}>
            {run.status === 'draft' && (
              <Button
                variant="primary"
                size="sm"
                onClick={() =>
                  doAction(
                    () => processRun({ variables: { id } }),
                    'Payroll processed — ready for review',
                  )
                }
                loading={processing}
              >
                Process
              </Button>
            )}
            {run.status === 'processing' && (
              <Button variant="secondary" size="sm" loading={true}>
                Processing…
              </Button>
            )}
            {run.status === 'review' && (
              <PermissionGate permission="hr.payroll.approve" minLevel="approve">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => doAction(() => approveRun({ variables: { id } }), 'Run approved')}
                  loading={approving}
                >
                  Approve
                </Button>
              </PermissionGate>
            )}
            {run.status === 'approved' && (
              <PermissionGate permission="hr.payroll.approve" minLevel="approve">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setPostConfirmOpen(true)
                  }}
                  loading={posting}
                >
                  Post
                </Button>
              </PermissionGate>
            )}
            {!['posted', 'cancelled'].includes(run.status) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCancelConfirmOpen(true)
                }}
              >
                Cancel
              </Button>
            )}
          </div>
        }
      />

      <div style={{ marginTop: '16px', marginBottom: '16px' }}>
        <StatusBar steps={RUN_STEPS} currentStep={run.status} rejectedSteps={['cancelled']} />
      </div>

      {/* KPI cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '8px',
          marginBottom: '20px',
        }}
      >
        {[
          {
            label: 'Total gross',
            value: run.total_gross ? parseFloat(run.total_gross).toLocaleString() : '—',
          },
          {
            label: 'Total deductions',
            value: run.total_deductions ? parseFloat(run.total_deductions).toLocaleString() : '—',
          },
          {
            label: 'Total net',
            value: run.total_net ? parseFloat(run.total_net).toLocaleString() : '—',
          },
          { label: 'Payslips', value: lines.length },
        ].map(({ label, value }) => (
          <div
            key={label}
            style={{
              background: theme.bgSurface,
              border: `1px solid ${theme.border}`,
              borderRadius: '8px',
              padding: '12px',
            }}
          >
            <div
              style={{
                fontSize: '10px',
                color: theme.textMuted,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              {label}
            </div>
            <div
              style={{
                fontSize: '17px',
                fontWeight: 600,
                fontFamily: 'monospace',
                color: theme.textPrimary,
                marginTop: '4px',
              }}
            >
              {value}
            </div>
          </div>
        ))}
      </div>

      {/* Lines table */}
      <Card style={{ marginBottom: '16px' }}>
        <div
          style={{
            padding: '12px 16px',
            borderBottom: `1px solid ${theme.border}`,
            fontWeight: 600,
            color: theme.textPrimary,
          }}
        >
          Payroll Lines
        </div>
        <Table
          columns={lineColumns}
          data={lines}
          loading={linesLoading}
          rowKey="id"
          onRowClick={(l) => {
            setSelectedLineId(l.id)
          }}
        />
      </Card>

      {/* Timeline */}
      {timeline.length > 0 && (
        <Card style={{ padding: '20px' }}>
          <div style={{ fontWeight: 600, color: theme.textPrimary, marginBottom: '12px' }}>
            Activity
          </div>
          <Timeline events={timeline} />
        </Card>
      )}

      {/* Payslip drawer */}
      <Drawer
        open={!!selectedLineId}
        onClose={() => {
          setSelectedLineId(null)
        }}
        title="Payslip"
        width="580px"
      >
        {selectedLineId && <PayslipViewer payrollLineId={selectedLineId} employeeId="" />}
      </Drawer>

      <ConfirmDialog
        open={postConfirmOpen}
        onClose={() => {
          setPostConfirmOpen(false)
        }}
        onConfirm={() => {
          setPostConfirmOpen(false)
          doAction(() => postRun({ variables: { id } }), 'Payroll run posted')
        }}
        title="Post Payroll Run"
        message="This will post the payroll run and lock all payslips. This cannot be undone."
        confirmLabel="Post"
        confirmVariant="danger"
        loading={posting}
      />
      <ConfirmDialog
        open={cancelConfirmOpen}
        onClose={() => {
          setCancelConfirmOpen(false)
        }}
        onConfirm={() => {
          setCancelConfirmOpen(false)
          doAction(() => cancelRun({ variables: { id } }), 'Run cancelled')
        }}
        title="Cancel Run"
        message="Are you sure you want to cancel this payroll run?"
        confirmLabel="Cancel run"
        confirmVariant="danger"
        loading={cancelling}
      />
    </div>
  )
}
