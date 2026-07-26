import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@apollo/client'
import { PAYROLL_RUNS_QUERY } from '../../../graphql/payroll'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { FilterBar } from '../../../components/ui/FilterBar'
import type { Column } from '../../../components/ui/Table'
import { Table } from '../../../components/ui/Table'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import { PermissionGate } from '../../../components/ui/PermissionGate'

interface PayrollRun {
  id: string
  period_name: string
  start_date?: string
  end_date?: string
  status: string
  total_gross?: string
  total_net?: string
  total_deductions?: string
  created_at?: string
}

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'processing', label: 'Processing' },
  { value: 'review', label: 'Review' },
  { value: 'approved', label: 'Approved' },
  { value: 'posted', label: 'Posted' },
  { value: 'cancelled', label: 'Cancelled' },
]

const statusVariant = (s: string) =>
  (({
    draft: 'neutral',
    processing: 'info',
    review: 'warning',
    approved: 'accent',
    posted: 'success',
    cancelled: 'danger',
  })[s] ?? 'neutral') as 'neutral' | 'info' | 'warning' | 'accent' | 'success' | 'danger'

export default function PayrollRunsPage() {
  const { theme } = useTheme()
  const navigate = useNavigate()
  const [statusFilter, setStatusFilter] = useState('')

  const { data, loading, refetch } = useQuery(PAYROLL_RUNS_QUERY, {
    variables: { status: statusFilter || undefined },
    fetchPolicy: 'cache-and-network',
  })

  const runs: PayrollRun[] = data?.payrollRuns ?? []

  const columns: Column<PayrollRun>[] = [
    {
      key: 'period_name',
      header: 'Period',
      render: (r) => (
        <span style={{ fontWeight: 500, color: theme.textPrimary }}>{r.period_name}</span>
      ),
    },
    {
      key: 'start_date',
      header: 'Dates',
      render: (r) => (
        <span style={{ fontFamily: 'monospace', fontSize: '12px', color: theme.textSecondary }}>
          {r.start_date?.slice(0, 10) ?? '—'} – {r.end_date?.slice(0, 10) ?? '—'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <Badge variant={statusVariant(r.status)}>{r.status}</Badge>,
    },
    {
      key: 'total_gross',
      header: 'Gross',
      render: (r) =>
        r.total_gross ? (
          <AmountDisplay amount={parseFloat(r.total_gross)} currency="IQD" />
        ) : (
          <span style={{ color: theme.textMuted }}>—</span>
        ),
    },
    {
      key: 'total_net',
      header: 'Net',
      render: (r) =>
        r.total_net ? (
          <AmountDisplay amount={parseFloat(r.total_net)} currency="IQD" />
        ) : (
          <span style={{ color: theme.textMuted }}>—</span>
        ),
    },
    {
      key: 'created_at',
      header: 'Created',
      render: (r) => (
        <span style={{ color: theme.textMuted, fontSize: '12px' }}>
          {r.created_at?.slice(0, 10) ?? '—'}
        </span>
      ),
    },
  ]

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1500px' }}>
      <PageHeader
        title="Payroll Runs"
        subtitle={`${runs.length} runs`}
        actions={
          <PermissionGate permission="hr.payroll.process" minLevel="edit">
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                navigate('/payroll/runs/new')
              }}
            >
              New Payroll Run
            </Button>
          </PermissionGate>
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
            resultCount={runs.length}
            onRefresh={() => refetch()}
          />
        </div>
        <Table
          columns={columns}
          data={runs}
          loading={loading}
          rowKey="id"
          onRowClick={(r) => {
            navigate(`/payroll/runs/${r.id}`)
          }}
        />
      </Card>
    </div>
  )
}
