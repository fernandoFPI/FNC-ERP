import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@apollo/client'
import { MANUFACTURING_ORDERS_QUERY } from '../../../graphql/manufacturing'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { FilterBar } from '../../../components/ui/FilterBar'
import { FilterPresets } from '../../../components/ui/FilterPresets'
import { useFilterPresets } from '../../../hooks/useFilterPresets'

const FILTER_DEFAULTS = { search: '', status: '' }
import type { Column } from '../../../components/ui/Table'
import { Table } from '../../../components/ui/Table'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'

const MO_STATUSES = ['draft', 'confirmed', 'in_progress', 'done', 'cancelled']

const STATUS_VARIANT: Record<string, 'neutral' | 'info' | 'warning' | 'success' | 'danger'> = {
  draft: 'neutral',
  confirmed: 'info',
  in_progress: 'warning',
  done: 'success',
  cancelled: 'danger',
}

interface MO {
  id: string
  mo_number: string
  status: string
  qty_planned: string
  qty_produced: string
  planned_cost: string
  actual_cost: string
  product_name?: string
  work_center_name?: string
  project_name?: string
  scheduled_start?: string
  created_at: string
}

export default function ManufacturingOrdersPage() {
  const { theme } = useTheme()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined)
  const currentFilters = { search, status: statusFilter ?? '' }
  const { presets, savePreset, deletePreset, resolvePreset } = useFilterPresets(
    'manufacturing_orders',
    FILTER_DEFAULTS,
  )

  const { data, loading, refetch } = useQuery(MANUFACTURING_ORDERS_QUERY, {
    variables: { status: statusFilter },
    fetchPolicy: 'cache-and-network',
  })

  const orders: MO[] = data?.manufacturingOrders ?? []

  const statusCounts = MO_STATUSES.reduce<Record<string, number>>((acc, s) => {
    acc[s] = orders.filter((o) => o.status === s).length
    return acc
  }, {})

  const filtered = search
    ? orders.filter(
        (o) =>
          o.mo_number.toLowerCase().includes(search.toLowerCase()) ||
          (o.product_name ?? '').toLowerCase().includes(search.toLowerCase()),
      )
    : orders

  const columns: Column<MO>[] = [
    {
      key: 'mo_number',
      header: 'MO Number',
      render: (o) => (
        <button
          onClick={() => {
            navigate(`/manufacturing/orders/${o.id}`)
          }}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: theme.accent,
            fontFamily: 'monospace',
            fontSize: '13px',
            fontWeight: 600,
          }}
        >
          {o.mo_number}
        </button>
      ),
    },
    {
      key: 'product_name',
      header: 'Product',
      render: (o) => (
        <span style={{ color: theme.textPrimary, fontSize: '13px' }}>{o.product_name ?? '—'}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (o) => (
        <Badge variant={STATUS_VARIANT[o.status] ?? 'neutral'}>{o.status.replace('_', ' ')}</Badge>
      ),
    },
    {
      key: 'qty_planned',
      header: 'Qty Planned',
      render: (o) => (
        <span style={{ fontFamily: 'monospace', color: theme.textSecondary }}>
          {parseFloat(o.qty_planned).toLocaleString()}
        </span>
      ),
    },
    {
      key: 'qty_produced',
      header: 'Produced',
      render: (o) => (
        <span style={{ fontFamily: 'monospace', color: theme.success }}>
          {parseFloat(o.qty_produced).toLocaleString()}
        </span>
      ),
    },
    {
      key: 'planned_cost',
      header: 'Planned Cost',
      render: (o) => <AmountDisplay amount={parseFloat(o.planned_cost)} currency="IQD" />,
    },
    {
      key: 'actual_cost',
      header: 'Actual Cost',
      render: (o) => <AmountDisplay amount={parseFloat(o.actual_cost)} currency="IQD" />,
    },
    {
      key: 'work_center_name',
      header: 'Work Center',
      render: (o) => (
        <span style={{ color: theme.textMuted, fontSize: '12px' }}>
          {o.work_center_name ?? '—'}
        </span>
      ),
    },
    {
      key: 'scheduled_start',
      header: 'Scheduled',
      render: (o) => (
        <span style={{ color: theme.textMuted, fontSize: '12px' }}>
          {o.scheduled_start?.slice(0, 10) ?? '—'}
        </span>
      ),
    },
  ]

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1600px' }}>
      <PageHeader
        title="Manufacturing Orders"
        subtitle={`${filtered.length} orders`}
        actions={
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              navigate('/manufacturing/orders/new')
            }}
          >
            New MO
          </Button>
        }
      />

      <div
        style={{
          display: 'flex',
          gap: '8px',
          marginTop: '16px',
          marginBottom: '12px',
          flexWrap: 'wrap',
        }}
      >
        {MO_STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => {
              setStatusFilter(s === statusFilter ? undefined : s)
            }}
            style={{
              padding: '4px 12px',
              borderRadius: '16px',
              border: `1px solid ${s === statusFilter ? theme.accent : theme.border}`,
              background: s === statusFilter ? theme.accentBg : 'transparent',
              color: s === statusFilter ? theme.accent : theme.textSecondary,
              fontSize: '12px',
              cursor: 'pointer',
              fontWeight: s === statusFilter ? 600 : 400,
            }}
          >
            {s.replace('_', ' ')} ({statusCounts[s] ?? 0})
          </button>
        ))}
      </div>

      <Card>
        <FilterBar
          search={search}
          onSearchChange={setSearch}
          resultCount={filtered.length}
          onRefresh={() => refetch()}
        >
          <FilterPresets
            presets={presets}
            onApply={(preset) => {
              const r = resolvePreset(preset)
              setSearch(r.search)
              setStatusFilter(r.status || undefined)
            }}
            onSave={(name) => {
              savePreset(name, currentFilters)
            }}
            onDelete={deletePreset}
          />
        </FilterBar>
        <Table columns={columns} data={filtered} loading={loading} rowKey="id" />
      </Card>
    </div>
  )
}
