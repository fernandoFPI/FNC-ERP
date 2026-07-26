import { useState } from 'react'
import { useQuery } from '@apollo/client'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import { EmptyState } from '../../../components/ui/EmptyState'
import { FilterBar } from '../../../components/ui/FilterBar'
import { INTERCO_STOCK_TRANSFERS_QUERY } from '../../../graphql/interco'

interface StockTransferItem {
  id: string
  transferNumber: string
  fromCompanyName: string
  toCompanyName: string
  totalValue: number
  pricingMethod: string
  status: string
  transferDate: string
}

interface StockTransfersData {
  intercoStockTransfers: {
    items: StockTransferItem[]
    total: number
    page: number
    limit: number
  }
}

function statusVariant(
  status: string,
): 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent' {
  const m: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent'> = {
    completed: 'success',
    draft: 'neutral',
    cancelled: 'danger',
    in_transit: 'info',
    pending: 'warning',
  }
  return m[status?.toLowerCase()] ?? 'neutral'
}

export default function IntercoStockTransfersPage() {
  const { theme } = useTheme()
  const navigate = useNavigate()

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const { data, loading, refetch } = useQuery<StockTransfersData>(INTERCO_STOCK_TRANSFERS_QUERY, {
    variables: {
      status: statusFilter || undefined,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
      page: 1,
      limit: 50,
    },
  })

  const items = (data?.intercoStockTransfers.items ?? []).filter(
    (r) =>
      !search ||
      r.transferNumber.toLowerCase().includes(search.toLowerCase()) ||
      r.fromCompanyName.toLowerCase().includes(search.toLowerCase()) ||
      r.toCompanyName.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div style={{ padding: '24px' }}>
      <PageHeader
        title="Interco Stock Transfers"
        subtitle="Inventory movements between group entities"
        actions={
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                refetch()
              }}
            >
              Refresh
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                navigate('/interco/stock-transfers/new')
              }}
            >
              New Transfer
            </Button>
          </div>
        }
      />

      <Card padding="sm" style={{ marginBottom: '16px' }}>
        <FilterBar
          search={{
            value: search,
            onChange: setSearch,
            placeholder: 'Search transfer number or company…',
          }}
          filters={[
            {
              key: 'status',
              label: 'Status',
              value: statusFilter,
              onChange: setStatusFilter,
              options: [
                { value: 'draft', label: 'Draft' },
                { value: 'in_transit', label: 'In Transit' },
                { value: 'completed', label: 'Completed' },
                { value: 'cancelled', label: 'Cancelled' },
              ],
            },
          ]}
          fromDate={fromDate}
          toDate={toDate}
          onFromDateChange={setFromDate}
          onToDateChange={setToDate}
          onRefresh={() => {
            refetch()
          }}
          resultCount={items.length}
        />
      </Card>

      <Card padding="none">
        {loading ? (
          <div style={{ padding: '24px' }}>
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="skeleton"
                style={{ height: '48px', borderRadius: '6px', marginBottom: '8px' }}
              />
            ))}
          </div>
        ) : items.length ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: theme.bgSurface }}>
                  {[
                    'Transfer #',
                    'From',
                    'To',
                    'Pricing Method',
                    'Total Value',
                    'Status',
                    'Date',
                  ].map((h, i) => (
                    <th
                      key={i}
                      style={{
                        padding: '10px 14px',
                        textAlign: i === 4 ? 'right' : 'left',
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
                {items.map((row) => (
                  <tr
                    key={row.id}
                    style={{ borderBottom: `1px solid ${theme.tableBorder}`, cursor: 'pointer' }}
                    onClick={() => {
                      navigate(`/interco/stock-transfers/${row.id}`)
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = theme.tableRowHover
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent'
                    }}
                  >
                    <td style={{ padding: '12px 14px', color: theme.accent, fontWeight: 500 }}>
                      {row.transferNumber}
                    </td>
                    <td style={{ padding: '12px 14px', color: theme.textSecondary }}>
                      {row.fromCompanyName}
                    </td>
                    <td style={{ padding: '12px 14px', color: theme.textSecondary }}>
                      {row.toCompanyName}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <Badge variant="neutral" size="sm">
                        {row.pricingMethod}
                      </Badge>
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                      <AmountDisplay amount={row.totalValue} currency="USD" size="sm" />
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <Badge variant={statusVariant(row.status)} size="sm">
                        {row.status}
                      </Badge>
                    </td>
                    <td style={{ padding: '12px 14px', color: theme.textMuted, fontSize: '12px' }}>
                      {new Date(row.transferDate).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No stock transfers" message="No intercompany stock transfers found." />
        )}
      </Card>
    </div>
  )
}
