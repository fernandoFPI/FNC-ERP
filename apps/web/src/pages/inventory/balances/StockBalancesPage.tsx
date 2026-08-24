import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@apollo/client'
import { STOCK_SNAPSHOT_QUERY } from '../../../graphql/inventory'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { FilterBar } from '../../../components/ui/FilterBar'
import type { Column } from '../../../components/ui/Table'
import { Table } from '../../../components/ui/Table'
import { Badge } from '../../../components/ui/Badge'
import { KPICard } from '../../../components/ui/KPICard'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'

interface SnapshotRow {
  product_id: string
  sku: string
  product_name: string
  category?: string
  location_id: string
  location_name: string
  location_type: string
  qty_on_hand: string
  qty_reserved: string
  available: string
  average_cost: string
  total_value: string
  is_low_stock: boolean
}

export default function StockBalancesPage() {
  const { theme } = useTheme()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [showLowOnly, setShowLowOnly] = useState(false)

  const { data, loading, refetch } = useQuery(STOCK_SNAPSHOT_QUERY, {
    fetchPolicy: 'cache-and-network',
  })

  const snapshot = data?.stockBalanceSnapshot
  const rows: SnapshotRow[] = snapshot?.rows ?? []
  const totalValue = snapshot?.totalValue ? parseFloat(snapshot.totalValue) : 0

  const filtered = rows.filter((r) => {
    if (showLowOnly && !r.is_low_stock) return false
    if (search) {
      const q = search.toLowerCase()
      if (
        !r.sku.toLowerCase().includes(q) &&
        !r.product_name.toLowerCase().includes(q) &&
        !r.location_name.toLowerCase().includes(q)
      )
        return false
    }
    return true
  })

  const lowStockCount = rows.filter((r) => r.is_low_stock).length

  const columns: Column<SnapshotRow>[] = [
    {
      key: 'sku',
      header: 'SKU',
      render: (r) => (
        <button
          onClick={() => {
            navigate(`/inventory/products/${r.product_id}`)
          }}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: theme.accent,
            fontFamily: 'monospace',
            fontSize: '13px',
          }}
        >
          {r.sku}
        </button>
      ),
    },
    {
      key: 'product_name',
      header: 'Product',
      render: (r) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              color: r.is_low_stock ? '#dc2626' : theme.textPrimary,
              fontSize: '13px',
              fontWeight: r.is_low_stock ? 600 : 400,
            }}
          >
            {r.product_name}
          </div>
          {r.is_low_stock && <Badge variant="danger">Low Stock</Badge>}
        </div>
      ),
    },
    {
      key: 'location_name',
      header: 'Location',
      render: (r) => <span style={{ color: theme.textSecondary }}>{r.location_name}</span>,
    },
    {
      key: 'location_type',
      header: 'Type',
      render: (r) => <Badge variant="neutral">{r.location_type.replace('_', ' ')}</Badge>,
    },
    {
      key: 'qty_on_hand',
      header: 'On Hand',
      render: (r) => (
        <span
          style={{
            fontFamily: 'monospace',
            color: r.is_low_stock ? '#dc2626' : theme.textPrimary,
            fontWeight: r.is_low_stock ? 700 : 400,
          }}
        >
          {parseFloat(r.qty_on_hand).toLocaleString()}
        </span>
      ),
    },
    {
      key: 'qty_reserved',
      header: 'Reserved',
      render: (r) => (
        <span style={{ fontFamily: 'monospace', color: theme.warning }}>
          {parseFloat(r.qty_reserved).toLocaleString()}
        </span>
      ),
    },
    {
      key: 'available',
      header: 'Available',
      render: (r) => (
        <span
          style={{
            fontFamily: 'monospace',
            color: r.is_low_stock ? '#dc2626' : theme.success,
            fontWeight: r.is_low_stock ? 700 : 400,
          }}
        >
          {parseFloat(r.available).toLocaleString()}
        </span>
      ),
    },
    {
      key: 'average_cost',
      header: 'Last Cost',
      render: (r) => <AmountDisplay amount={parseFloat(r.average_cost)} currency="IQD" />,
    },
    {
      key: 'total_value',
      header: 'Total Value',
      render: (r) => <AmountDisplay amount={parseFloat(r.total_value)} currency="IQD" />,
    },
  ]

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1600px' }}>
      <PageHeader
        title="Stock Balances"
        subtitle="Current inventory snapshot"
        actions={
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              navigate('/inventory/adjust')
            }}
          >
            Adjust Stock
          </Button>
        }
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '12px',
          marginTop: '20px',
          marginBottom: '16px',
        }}
      >
        <KPICard
          title="Total Inventory Value"
          value={totalValue.toLocaleString()}
          subtitle="IQD"
          iconColor="success"
        />
        <KPICard
          title="Total SKUs"
          value={new Set(rows.map((r) => r.product_id)).size}
          subtitle="products"
          iconColor="info"
        />
        <KPICard
          title="Low Stock Alerts"
          value={lowStockCount}
          subtitle="products below reorder point"
          iconColor="danger"
        />
      </div>

      {lowStockCount > 0 && (
        <div
          style={{
            marginBottom: '16px',
            padding: '14px 18px',
            borderRadius: '8px',
            background: '#fef2f2',
            border: '1px solid #fca5a5',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#dc2626"
            strokeWidth="2"
            style={{ flexShrink: 0 }}
          >
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#991b1b' }}>
              {lowStockCount} product{lowStockCount !== 1 ? 's' : ''} below reorder point
            </div>
            <div style={{ fontSize: '12px', color: '#b91c1c', marginTop: '2px' }}>
              Inventory users have been notified. Review and reorder as needed.
            </div>
          </div>
          <button
            onClick={() => {
              setShowLowOnly(true)
            }}
            style={{
              marginLeft: 'auto',
              padding: '5px 12px',
              borderRadius: '6px',
              border: '1px solid #dc2626',
              background: 'transparent',
              color: '#dc2626',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Show only
          </button>
        </div>
      )}

      <Card>
        <FilterBar
          search={search}
          onSearchChange={setSearch}
          resultCount={filtered.length}
          onRefresh={() => refetch()}
        >
          <button
            onClick={() => {
              setShowLowOnly((s) => !s)
            }}
            style={{
              background: showLowOnly ? theme.accentBg : 'transparent',
              border: `1px solid ${showLowOnly ? theme.accent : theme.border}`,
              borderRadius: '6px',
              color: showLowOnly ? theme.accent : theme.textMuted,
              cursor: 'pointer',
              fontSize: '12px',
              padding: '4px 10px',
            }}
          >
            Low Stock Only
          </button>
        </FilterBar>
        <Table columns={columns} data={filtered} loading={loading} />
      </Card>
    </div>
  )
}
