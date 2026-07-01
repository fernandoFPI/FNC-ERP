import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@apollo/client'
import { STOCK_LOTS_QUERY } from '../../../graphql/inventory'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { FilterBar } from '../../../components/ui/FilterBar'
import { Table, Column } from '../../../components/ui/Table'
import { Badge } from '../../../components/ui/Badge'
import { EmptyState } from '../../../components/ui/EmptyState'

interface StockLot {
  id: string
  lot_number: string
  product_id: string
  product_name?: string
  expiry_date?: string
  created_at: string
  current_qty?: string
  current_location_name?: string
}

function expiryStatus(expiryDate?: string): 'ok' | 'expiring' | 'expired' | 'none' {
  if (!expiryDate) return 'none'
  const diff = new Date(expiryDate).getTime() - Date.now()
  const days = diff / 86_400_000
  if (days < 0) return 'expired'
  if (days <= 30) return 'expiring'
  return 'ok'
}

const EXPIRY_OPTIONS = [
  { value: 'ok', label: 'OK' },
  { value: 'expiring', label: 'Expiring soon' },
  { value: 'expired', label: 'Expired' },
]

export default function LotsPage() {
  const { theme } = useTheme()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [search, setSearch] = useState('')
  const [expiryFilter, setExpiryFilter] = useState('')

  const productId = params.get('productId') ?? undefined

  const { data, loading, refetch } = useQuery(STOCK_LOTS_QUERY, {
    variables: { productId },
    fetchPolicy: 'cache-and-network',
  })

  const lots: StockLot[] = data?.stockLots ?? []

  const filtered = lots.filter((l) => {
    if (search) {
      const q = search.toLowerCase()
      const matches =
        l.lot_number.toLowerCase().includes(q) ||
        (l.product_name ?? '').toLowerCase().includes(q)
      if (!matches) return false
    }
    if (expiryFilter) {
      if (expiryStatus(l.expiry_date) !== expiryFilter) return false
    }
    return true
  })

  const columns: Column<StockLot>[] = [
    {
      key: 'lot_number',
      header: 'Lot number',
      render: (l) => (
        <span style={{ fontFamily: 'monospace', color: theme.accent, fontWeight: 600 }}>
          {l.lot_number}
        </span>
      ),
    },
    {
      key: 'product_name',
      header: 'Product',
      render: (l) => <span style={{ color: theme.textPrimary }}>{l.product_name ?? l.product_id}</span>,
    },
    {
      key: 'current_qty',
      header: 'Qty on hand',
      render: (l) => (
        <span style={{ fontFamily: 'monospace', color: theme.textSecondary }}>
          {l.current_qty ? parseFloat(l.current_qty).toLocaleString() : '—'}
        </span>
      ),
    },
    {
      key: 'current_location_name',
      header: 'Location',
      render: (l) => (
        <span style={{ color: theme.textMuted, fontSize: '13px' }}>
          {l.current_location_name ?? '—'}
        </span>
      ),
    },
    {
      key: 'expiry_date',
      header: 'Expiry date',
      render: (l) => {
        if (!l.expiry_date) return <span style={{ color: theme.textMuted }}>—</span>
        const status = expiryStatus(l.expiry_date)
        const variant = status === 'expired' ? 'danger' : status === 'expiring' ? 'warning' : 'success'
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: theme.textSecondary, fontSize: '13px' }}>{l.expiry_date}</span>
            <Badge variant={variant}>{status === 'expiring' ? 'Expiring soon' : status === 'expired' ? 'Expired' : 'OK'}</Badge>
          </div>
        )
      },
    },
    {
      key: 'created_at',
      header: 'Created',
      render: (l) => (
        <span style={{ color: theme.textMuted, fontSize: '12px' }}>
          {new Date(l.created_at).toLocaleDateString()}
        </span>
      ),
    },
  ]

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1400px' }}>
      <PageHeader
        title="Lots"
        subtitle={`${filtered.length} lots tracked`}
      />

      <Card style={{ marginTop: '20px' }}>
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${theme.border}` }}>
          <FilterBar
            search={{ value: search, onChange: setSearch, placeholder: 'Search lot number or product…' }}
            filters={[
              {
                key: 'expiry',
                label: 'Expiry',
                options: EXPIRY_OPTIONS,
                value: expiryFilter,
                onChange: setExpiryFilter,
              },
            ]}
            resultCount={filtered.length}
            onRefresh={() => refetch()}
          />
        </div>

        {!loading && filtered.length === 0 ? (
          <EmptyState
            title="No lots found"
            message={search || expiryFilter ? 'Try adjusting your filters.' : 'Lots are created automatically when stock is received with a lot number.'}
          />
        ) : (
          <Table
            columns={columns}
            data={filtered}
            loading={loading}
            rowKey="id"
            onRowClick={(l) => navigate(`/inventory/lots/${l.id}`)}
          />
        )}
      </Card>
    </div>
  )
}
