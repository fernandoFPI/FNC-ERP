import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@apollo/client'
import { STOCK_MOVES_QUERY } from '../../../graphql/inventory'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { FilterBar } from '../../../components/ui/FilterBar'
import type { Column } from '../../../components/ui/Table'
import { Table } from '../../../components/ui/Table'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import { formatDate } from '../../../lib/format'

interface StockMove {
  id: string
  move_date: string
  product_name?: string
  sku?: string
  from_location_name?: string
  to_location_name?: string
  qty: string
  unit_cost?: string
  total_cost?: string
  source_type: string
  reference?: string
  lot_number?: string
  moved_by_email?: string
}

// Adjustments etc. carry a user-picked effective date with no time-of-day
// (stored as midnight) — showing "00:00" for those would read as a real
// timestamp when it's actually just a date. Only append the time when one
// was genuinely recorded.
function formatMoveDate(value: string): string {
  const d = new Date(value)
  if (isNaN(d.getTime())) return value
  const hasTime = d.getUTCHours() !== 0 || d.getUTCMinutes() !== 0 || d.getUTCSeconds() !== 0
  const datePart = formatDate(d)
  if (!hasTime) return datePart
  const timePart = d.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  })
  return `${datePart}, ${timePart}`
}

const SOURCE_OPTIONS = [
  { value: 'manual', label: 'Manual' },
  { value: 'po_receipt', label: 'PO Receipt' },
  { value: 'mo', label: 'Manufacturing' },
  { value: 'material_issue', label: 'Material Issue' },
  { value: 'interco', label: 'Interco Transfer' },
  { value: 'adjustment', label: 'Adjustment' },
]

export default function StockMovesPage() {
  const { theme } = useTheme()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [search, setSearch] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const productId = params.get('productId') ?? undefined

  const { data, loading, refetch } = useQuery(STOCK_MOVES_QUERY, {
    variables: {
      productId,
      sourceType: sourceFilter || undefined,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
    },
    fetchPolicy: 'cache-and-network',
  })

  const moves: StockMove[] = data?.stockMoves ?? []
  const filtered = moves.filter((m) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      (m.sku ?? '').toLowerCase().includes(q) ||
      (m.product_name ?? '').toLowerCase().includes(q) ||
      (m.reference ?? '').toLowerCase().includes(q)
    )
  })

  const columns: Column<StockMove>[] = [
    {
      key: 'move_date',
      header: 'Date',
      render: (m) => (
        <span style={{ color: theme.textSecondary, fontSize: '13px' }}>
          {formatMoveDate(m.move_date)}
        </span>
      ),
    },
    {
      key: 'sku',
      header: 'Product',
      render: (m) => (
        <div>
          <span style={{ fontFamily: 'monospace', color: theme.accent, fontSize: '12px' }}>
            {m.sku ?? '—'}
          </span>
          <div style={{ color: theme.textSecondary, fontSize: '12px' }}>
            {m.product_name ?? '—'}
          </div>
        </div>
      ),
    },
    {
      key: 'from_location_name',
      header: 'From',
      render: (m) => (
        <span style={{ color: theme.textMuted, fontSize: '13px' }}>
          {m.from_location_name ?? '—'}
        </span>
      ),
    },
    {
      key: 'to_location_name',
      header: 'To',
      render: (m) => (
        <span style={{ color: theme.textMuted, fontSize: '13px' }}>
          {m.to_location_name ?? '—'}
        </span>
      ),
    },
    {
      key: 'qty',
      header: 'Qty',
      render: (m) => (
        <span style={{ fontFamily: 'monospace', color: theme.textPrimary }}>
          {parseFloat(m.qty).toLocaleString()}
        </span>
      ),
    },
    {
      key: 'total_cost',
      header: 'Cost',
      render: (m) =>
        m.total_cost ? (
          <AmountDisplay amount={parseFloat(m.total_cost)} currency="IQD" />
        ) : (
          <span style={{ color: theme.textMuted }}>—</span>
        ),
    },
    {
      key: 'source_type',
      header: 'Source',
      render: (m) => <Badge variant="neutral">{m.source_type}</Badge>,
    },
    {
      key: 'moved_by_email',
      header: 'By',
      tabletHide: true,
      render: (m) => (
        <span style={{ color: theme.textSecondary, fontSize: '13px' }}>
          {m.moved_by_email ?? 'System'}
        </span>
      ),
    },
    {
      key: 'lot_number',
      header: 'Lot',
      tabletHide: true,
      render: (m) =>
        m.lot_number ? (
          <span style={{ fontFamily: 'monospace', color: theme.textSecondary, fontSize: '12px' }}>
            {m.lot_number}
          </span>
        ) : (
          <span style={{ color: theme.textMuted }}>—</span>
        ),
    },
    {
      key: 'reference',
      header: 'Reason / Notes',
      render: (m) =>
        m.reference ? (
          <span
            title={m.reference}
            style={{
              color: theme.textSecondary,
              fontSize: '13px',
              display: 'inline-block',
              maxWidth: '240px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              verticalAlign: 'bottom',
            }}
          >
            {m.reference}
          </span>
        ) : (
          <span style={{ color: theme.textMuted }}>—</span>
        ),
    },
  ]

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1500px' }}>
      <PageHeader
        title="Stock Moves"
        subtitle={`${filtered.length} movements`}
        actions={
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              navigate('/inventory/moves/transfer')
            }}
          >
            Manual Transfer
          </Button>
        }
      />

      <Card style={{ marginTop: '20px' }}>
        <FilterBar
          search={search}
          onSearchChange={setSearch}
          filters={[
            {
              key: 'source',
              label: 'Source',
              value: sourceFilter,
              options: SOURCE_OPTIONS,
              onChange: setSourceFilter,
            },
          ]}
          fromDate={fromDate}
          toDate={toDate}
          onFromDateChange={setFromDate}
          onToDateChange={setToDate}
          resultCount={filtered.length}
          onRefresh={() => refetch()}
        />
        <Table columns={columns} data={filtered} loading={loading} rowKey="id" />
      </Card>
    </div>
  )
}
