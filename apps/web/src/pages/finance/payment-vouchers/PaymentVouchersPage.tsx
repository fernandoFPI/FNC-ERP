import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@apollo/client'
import { PAYMENT_VOUCHERS_QUERY } from '../../../graphql/finance'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import type { Column } from '../../../components/ui/Table'
import { Table } from '../../../components/ui/Table'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import { FilterBar } from '../../../components/ui/FilterBar'
import { FilterPresets } from '../../../components/ui/FilterPresets'
import { useFilterPresets } from '../../../hooks/useFilterPresets'

const FILTER_DEFAULTS = { search: '', status: '', fromDate: '', toDate: '' }

interface PaymentVoucher {
  id: string
  voucher_number: string
  voucher_date: string
  received_from: string
  status: string
  total_amount_iqd: string
  total_amount_usd: string
  created_by_email?: string
  auditor_email?: string
  audited_at?: string
  journal_count?: string
  created_at: string
}

const STATUS_VARIANT: Record<string, 'neutral' | 'info' | 'success' | 'warning' | 'danger'> = {
  draft: 'neutral',
  approved: 'info',
  paid: 'success',
  cancelled: 'danger',
}

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'approved', label: 'Approved' },
  { value: 'paid', label: 'Paid' },
  { value: 'cancelled', label: 'Cancelled' },
]

export default function PaymentVouchersPage() {
  const { theme } = useTheme()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const currentFilters = { search, status: statusFilter, fromDate, toDate }
  const { presets, savePreset, deletePreset, resolvePreset } = useFilterPresets(
    'payment_vouchers',
    FILTER_DEFAULTS,
  )

  const { data, loading, refetch } = useQuery(PAYMENT_VOUCHERS_QUERY, {
    variables: {
      status: statusFilter || undefined,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
    },
    fetchPolicy: 'cache-and-network',
  })

  const vouchers: PaymentVoucher[] = data?.paymentVouchers ?? []
  const filtered = search
    ? vouchers.filter(
        (v) =>
          v.voucher_number.toLowerCase().includes(search.toLowerCase()) ||
          v.received_from.toLowerCase().includes(search.toLowerCase()),
      )
    : vouchers

  const columns: Column<PaymentVoucher>[] = [
    {
      key: 'voucher_number',
      header: 'Voucher No.',
      render: (v) => (
        <span style={{ fontFamily: 'monospace', color: theme.accent, fontWeight: 600 }}>
          {v.voucher_number}
        </span>
      ),
    },
    {
      key: 'voucher_date',
      header: 'Date',
      render: (v) => (
        <span style={{ color: theme.textSecondary, fontSize: '13px' }}>{v.voucher_date}</span>
      ),
    },
    {
      key: 'received_from',
      header: 'Received From',
      render: (v) => (
        <span style={{ color: theme.textPrimary, fontSize: '13px' }}>{v.received_from}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (v) => (
        <Badge variant={STATUS_VARIANT[v.status] ?? 'neutral'}>
          {v.status.charAt(0).toUpperCase() + v.status.slice(1)}
        </Badge>
      ),
    },
    {
      key: 'total_amount_iqd',
      header: 'Amount (IQD)',
      render: (v) => <AmountDisplay amount={parseFloat(v.total_amount_iqd)} currency="IQD" />,
    },
    {
      key: 'total_amount_usd',
      header: 'Amount (USD)',
      render: (v) =>
        parseFloat(v.total_amount_usd) > 0 ? (
          <AmountDisplay amount={parseFloat(v.total_amount_usd)} currency="USD" />
        ) : (
          <span style={{ color: theme.textMuted }}>—</span>
        ),
    },
    {
      key: 'journal_count',
      header: 'Journals',
      render: (v) => (
        <span style={{ color: theme.textMuted, fontSize: '13px' }}>{v.journal_count ?? '0'}</span>
      ),
    },
    {
      key: 'auditor_email',
      header: 'Auditor',
      render: (v) => (
        <span style={{ color: theme.textMuted, fontSize: '12px' }}>{v.auditor_email ?? '—'}</span>
      ),
    },
  ]

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <PageHeader
        title="Payment Vouchers"
        subtitle={`${filtered.length} vouchers`}
        actions={
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              navigate('/finance/payment-vouchers/new')
            }}
          >
            New Voucher
          </Button>
        }
      />

      <Card style={{ marginTop: '16px' }}>
        <FilterBar
          search={search}
          onSearchChange={setSearch}
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
          resultCount={filtered.length}
          onRefresh={() => refetch()}
        >
          <FilterPresets
            presets={presets}
            onApply={(preset) => {
              const r = resolvePreset(preset)
              setSearch(r.search)
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
        <Table
          columns={columns}
          data={filtered}
          loading={loading}
          rowKey="id"
          onRowClick={(v) => {
            navigate(`/finance/payment-vouchers/${v.id}`)
          }}
        />
      </Card>
    </div>
  )
}
