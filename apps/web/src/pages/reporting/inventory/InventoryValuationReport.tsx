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
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: '12px',
            marginBottom: '20px',
          }}
        >
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
        </div>
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
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: theme.bgSurface }}>
                  {[
                    'SKU',
                    'Product',
                    'Location',
                    'Type',
                    'Qty On Hand',
                    'Avg Cost',
                    'Total Value',
                  ].map((h, i) => (
                    <th
                      key={i}
                      style={{
                        padding: '10px 14px',
                        textAlign: i >= 4 ? 'right' : 'left',
                        fontSize: '10px',
                        fontWeight: 600,
                        color: theme.textMuted,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        borderBottom: `1px solid ${theme.border}`,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr
                    key={i}
                    style={{ borderBottom: `1px solid ${theme.tableBorder}` }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = theme.tableRowHover
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent'
                    }}
                  >
                    <td style={{ padding: '12px 14px', color: theme.textMuted, fontSize: '12px' }}>
                      {row.sku}
                    </td>
                    <td style={{ padding: '12px 14px', color: theme.textPrimary, fontWeight: 500 }}>
                      {row.productName}
                    </td>
                    <td style={{ padding: '12px 14px', color: theme.textSecondary }}>
                      {row.locationName}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <Badge variant="neutral" size="sm">
                        {row.locationType}
                      </Badge>
                    </td>
                    <td
                      style={{
                        padding: '12px 14px',
                        textAlign: 'right',
                        color: row.qtyOnHand <= 0 ? theme.danger : theme.textSecondary,
                      }}
                    >
                      {row.qtyOnHand.toLocaleString()}
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                      <AmountDisplay amount={row.avgCost} currency={row.currency} size="sm" />
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 500 }}>
                      <AmountDisplay amount={row.totalValue} currency={row.currency} size="sm" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
