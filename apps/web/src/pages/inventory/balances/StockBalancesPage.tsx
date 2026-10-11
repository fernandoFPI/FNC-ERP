import { useTranslation } from 'react-i18next'
import { enumLabel } from '../../../i18n'
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
import type { StockSnapshotQuery, StockSnapshotQueryVariables } from '../../../graphql/generated'

interface SnapshotRow {
  product_id: string
  sku: string
  product_name: string
  category?: string | null
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
  const { t } = useTranslation()
  const { theme } = useTheme()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [showLowOnly, setShowLowOnly] = useState(false)

  const { data, loading, refetch } = useQuery<StockSnapshotQuery, StockSnapshotQueryVariables>(STOCK_SNAPSHOT_QUERY, {
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
      header: t('inv.balances.sku'),
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
      header: t('inv.balances.product'),
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
          {r.is_low_stock && <Badge variant="danger">{t('inv.balances.lowStock')}</Badge>}
        </div>
      ),
    },
    {
      key: 'location_name',
      header: t('inv.balances.location'),
      render: (r) => <span style={{ color: theme.textSecondary }}>{r.location_name}</span>,
    },
    {
      key: 'location_type',
      header: t('inv.balances.type'),
      render: (r) => <Badge variant="neutral">{enumLabel(r.location_type).replace('_', ' ')}</Badge>,
    },
    {
      key: 'qty_on_hand',
      header: t('inv.balances.onHand'),
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
      header: t('inv.balances.reserved'),
      render: (r) => (
        <span style={{ fontFamily: 'monospace', color: theme.warning }}>
          {parseFloat(r.qty_reserved).toLocaleString()}
        </span>
      ),
    },
    {
      key: 'available',
      header: t('inv.balances.available'),
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
      header: t('inv.balances.lastCost'),
      render: (r) => <AmountDisplay amount={parseFloat(r.average_cost)} currency="IQD" />,
    },
    {
      key: 'total_value',
      header: t('inv.balances.totalValue'),
      render: (r) => <AmountDisplay amount={parseFloat(r.total_value)} currency="IQD" />,
    },
  ]

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1600px' }}>
      <PageHeader
        title={t('inv.balances.stockBalances')}
        subtitle={t('inv.balances.currentInventorySnapshot')}
        actions={
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              navigate('/inventory/adjust')
            }}
          >
            {t('inv.balances.adjustStock')}
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
          title={t('inv.balances.totalInventoryValue')}
          value={totalValue.toLocaleString()}
          subtitle={t('inv.balances.iqd')}
          iconColor="success"
        />
        <KPICard
          title={t('inv.balances.totalSkus')}
          value={new Set(rows.map((r) => r.product_id)).size}
          subtitle={t('inv.balances.products')}
          iconColor="info"
        />
        <KPICard
          title={t('inv.balances.lowStockAlerts')}
          value={lowStockCount}
          subtitle={t('inv.balances.productsBelowReorderPoint')}
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
              {t('inv.balances.lowStock', { count: lowStockCount })}
            </div>
            <div style={{ fontSize: '12px', color: '#b91c1c', marginTop: '2px' }}>
              {t('inv.balances.inventoryUsersHaveBeenNotifiedReview')}
            </div>
          </div>
          <button
            onClick={() => {
              setShowLowOnly(true)
            }}
            style={{
              marginInlineStart: 'auto',
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
            {t('inv.balances.showOnly')}
          </button>
        </div>
      )}

      <Card>
        <FilterBar
          search={search}
          onSearchChange={setSearch}
          resultCount={filtered.length}
          onRefresh={() => void refetch()}
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
            {t('inv.balances.lowStockOnly')}
          </button>
        </FilterBar>
        <Table
          columns={columns}
          data={filtered}
          loading={loading}
          maxHeight="70vh"
          stickyHeader
        />
      </Card>
    </div>
  )
}
