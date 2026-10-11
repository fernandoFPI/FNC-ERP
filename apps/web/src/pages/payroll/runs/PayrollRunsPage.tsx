import i18n, { enumLabel } from '../../../i18n'
import { useTranslation } from 'react-i18next'
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
import type { PayrollRunsQuery, PayrollRunsQueryVariables } from '../../../graphql/generated'

interface PayrollRun {
  id: string
  period_name: string
  start_date?: string | null
  end_date?: string | null
  status: string
  total_gross?: string
  total_net?: string
  total_deductions?: string | null
  created_at?: string
}

const STATUS_OPTIONS = [
  { value: 'draft', get label() { return i18n.t('payroll.runs.draft', { defaultValue: "Draft" }) } },
  { value: 'processing', get label() { return i18n.t('payroll.runs.processing', { defaultValue: "Processing" }) } },
  { value: 'review', get label() { return i18n.t('payroll.runs.review', { defaultValue: "Review" }) } },
  { value: 'approved', get label() { return i18n.t('payroll.runs.approved', { defaultValue: "Approved" }) } },
  { value: 'posted', get label() { return i18n.t('payroll.runs.posted', { defaultValue: "Posted" }) } },
  { value: 'cancelled', get label() { return i18n.t('payroll.runs.cancelled', { defaultValue: "Cancelled" }) } },
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
  const { t } = useTranslation()
  const { theme } = useTheme()
  const navigate = useNavigate()
  const [statusFilter, setStatusFilter] = useState('')

  const { data, loading, refetch } = useQuery<PayrollRunsQuery, PayrollRunsQueryVariables>(PAYROLL_RUNS_QUERY, {
    variables: { status: statusFilter || undefined },
    fetchPolicy: 'cache-and-network',
  })

  const runs: PayrollRun[] = (data?.payrollRuns ?? []).filter((x): x is NonNullable<typeof x> => x !== null)

  const columns: Column<PayrollRun>[] = [
    {
      key: 'period_name',
      header: t('payroll.runs.period'),
      render: (r) => (
        <span style={{ fontWeight: 500, color: theme.textPrimary }}>{r.period_name}</span>
      ),
    },
    {
      key: 'start_date',
      header: t('payroll.runs.dates'),
      render: (r) => (
        <span style={{ fontFamily: 'monospace', fontSize: '12px', color: theme.textSecondary }}>
          {r.start_date?.slice(0, 10) ?? '—'} – {r.end_date?.slice(0, 10) ?? '—'}
        </span>
      ),
    },
    {
      key: 'status',
      header: t('payroll.runs.status'),
      render: (r) => <Badge variant={statusVariant(r.status)}>{enumLabel(r.status)}</Badge>,
    },
    {
      key: 'total_gross',
      header: t('payroll.runs.gross'),
      render: (r) =>
        r.total_gross ? (
          <AmountDisplay amount={parseFloat(r.total_gross)} currency="IQD" />
        ) : (
          <span style={{ color: theme.textMuted }}>—</span>
        ),
    },
    {
      key: 'total_net',
      header: t('payroll.runs.net'),
      render: (r) =>
        r.total_net ? (
          <AmountDisplay amount={parseFloat(r.total_net)} currency="IQD" />
        ) : (
          <span style={{ color: theme.textMuted }}>—</span>
        ),
    },
    {
      key: 'created_at',
      header: t('payroll.runs.created'),
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
        title={t('payroll.runs.payrollRuns')}
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
              {t('payroll.runs.newPayrollRun')}
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
                label: t('payroll.runs.status'),
                value: statusFilter,
                options: STATUS_OPTIONS,
                onChange: setStatusFilter,
              },
            ]}
            resultCount={runs.length}
            onRefresh={() => void refetch()}
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
