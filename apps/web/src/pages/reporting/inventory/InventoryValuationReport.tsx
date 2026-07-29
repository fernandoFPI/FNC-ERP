import { useState } from 'react'
import { useQuery } from '@apollo/client'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import { EmptyState } from '../../../components/ui/EmptyState'
import { FilterBar } from '../../../components/ui/FilterBar'
import { Grid } from '../../../components/ui/Grid'
import type { Column } from '../../../components/ui/Table'
import { Table } from '../../../components/ui/Table'
import { INVENTORY_VALUATION_QUERY } from '../../../graphql/reporting'

interface InvRow {
  productName: string
  sku: string
  locationName: string
  locationType: string
  qtyOnHand: number
  avgCost: number
  totalValue: number
  currency: string
}

interface ByLocation {
  locationName: string
  locationType: string
  totalValue: number
}

interface InvData {
  inventoryValuationReport: {
    rows: InvRow[]
    totalValue: number
    totalProducts: number
    totalLocations: number
    lowStockItems: number
    byLocation: ByLocation[]
  }
}

export default function InventoryValuationReport() {
  const { theme } = useTheme()
  const today = new Date().toISOString().slice(0, 10)
  const [asOfDate, setAsOfDate] = useState(today)
  const [applied, setApplied] = useState(today)
  const [search, setSearch] = useState('')

  const { data, loading, refetch } = useQuery<InvData>(INVENTORY_VALUATION_QUERY, {
    variables: { asOfDate: applied },
  })

  const d = data?.inventoryValuationReport
  const rows = (d?.rows ?? []).filter(
    (r) =>
      !search ||
      r.productName.toLowerCase().includes(search.toLowerCase()) ||
      r.sku.toLowerCase().includes(search.toLowerCase()) ||
      r.locationName.toLowerCase().includes(search.toLowerCase()),
  )

  const columns: Column<InvRow>[] = [
    {
      key: 'productName',
      header: 'Product',
      mobilePrimary: true,
      render: (row) => (
        <span style={{ color: theme.textPrimary, fontWeight: 500 }}>{row.productName}</span>
      ),
    },
    {
      key: 'sku',
      header: 'SKU',
      mobileSecondary: true,
      render: (row) => <span style={{ color: theme.textMuted, fontSize: '12px' }}>{row.sku}</span>,
    },
    {
      key: 'totalValue',
      header: 'Total Value',
      mobilePriority: 1,
      render: (row) => (
        <span style={{ fontWeight: 500 }}>
          <AmountDisplay amount={row.totalValue} currency={row.currency} size="sm" />
        </span>
      ),
    },
    {
      key: 'qtyOnHand',
      header: 'Qty On Hand',
      mobilePriority: 2,
      render: (row) => (
        <span style={{ color: row.qtyOnHand <= 0 ? theme.danger : theme.textSecondary }}>
          {row.qtyOnHand.toLocaleString()}
        </span>
      ),
    },
    {
      key: 'locationName',
      header: 'Location',
      mobilePriority: 3,
      render: (row) => row.locationName,
    },
    {
      key: 'avgCost',
      header: 'Avg Cost',
      mobilePriority: 4,
      render: (row) => <AmountDisplay amount={row.avgCost} currency={row.currency} size="sm" />,
    },
    {
      key: 'locationType',
      header: 'Type',
      mobilePriority: 5,
      render: (row) => (
        <Badge variant="neutral" size="sm">
          {row.locationType}
        </Badge>
      ),
    },
  ]

  return (
    <div style={{ padding: '24px' }}>
      <PageHeader
        title="Inventory Valuation"
        subtitle="Stock on hand valuation by product and location"
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              refetch()
            }}
          >
            Refresh
          </Button>
        }
      />

      <Card padding="sm" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <FilterBar
            search={{
              value: search,
              onChange: setSearch,
              placeholder: 'Search product, SKU or location…',
            }}
            resultCount={rows.length}
            onExport={() => undefined}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: theme.textMuted }}>As of</span>
            <input
              type="date"
              value={asOfDate}
              onChange={(e) => {
                setAsOfDate(e.target.value)
              }}
              style={{
                background: theme.bgSurface,
                border: `1px solid ${theme.borderInput}`,
                borderRadius: '8px',
                padding: '6px 10px',
                fontSize: '12px',
                color: theme.textSecondary,
                fontFamily: 'inherit',
              }}
            />
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setApplied(asOfDate)
              }}
            >
              Apply
            </Button>
          </div>
        </div>
      </Card>

      {/* Summary */}
      {d && (
        <Grid cols={4} tabletCols={2} phoneCols={2} gap={12} style={{ marginBottom: '20px' }}>
          <Card padding="sm">
            <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>
              Total Value
            </p>
            <AmountDisplay amount={d.totalValue} currency="USD" size="md" />
          </Card>
          <Card padding="sm">
            <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>
              Total Products
            </p>
            <p style={{ fontSize: '22px', fontWeight: 500, color: theme.textPrimary }}>
              {d.totalProducts}
            </p>
          </Card>
          <Card padding="sm">
            <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>
              Locations
            </p>
            <p style={{ fontSize: '22px', fontWeight: 500, color: theme.textPrimary }}>
              {d.totalLocations}
            </p>
          </Card>
          <Card padding="sm">
            <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>
              Low Stock Items
            </p>
            <p
              style={{
                fontSize: '22px',
                fontWeight: 500,
                color: d.lowStockItems > 0 ? theme.warning : theme.textPrimary,
              }}
            >
              {d.lowStockItems}
            </p>
          </Card>
        </Grid>
      )}

      <Card padding="none">
        {loading ? (
          <div style={{ padding: '24px' }}>
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="skeleton"
                style={{ height: '40px', borderRadius: '6px', marginBottom: '8px' }}
              />
            ))}
          </div>
        ) : rows.length ? (
          <Table columns={columns} data={rows} />
        ) : (
          <EmptyState
            title="No inventory data"
            message="Select a date and apply to load inventory valuation."
          />
        )}
      </Card>
    </div>
  )
}
