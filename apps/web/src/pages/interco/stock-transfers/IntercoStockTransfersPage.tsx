import { useState } from 'react'
import { useQuery } from '@apollo/client'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import { FilterBar } from '../../../components/ui/FilterBar'
import type { Column } from '../../../components/ui/Table'
import { Table } from '../../../components/ui/Table'
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

  const columns: Column<StockTransferItem>[] = [
    {
      key: 'transferNumber',
      header: 'Transfer #',
      mobilePrimary: true,
      render: (row) => (
        <span style={{ color: theme.accent, fontWeight: 500 }}>{row.transferNumber}</span>
      ),
    },
    {
      key: 'fromCompanyName',
      header: 'From',
      mobileSecondary: true,
      render: (row) => <span style={{ color: theme.textSecondary }}>{row.fromCompanyName}</span>,
    },
    {
      key: 'toCompanyName',
      header: 'To',
      mobilePriority: 4,
      render: (row) => <span style={{ color: theme.textSecondary }}>{row.toCompanyName}</span>,
    },
    {
      key: 'pricingMethod',
      header: 'Pricing Method',
      mobilePriority: 3,
      render: (row) => (
        <Badge variant="neutral" size="sm">
          {row.pricingMethod}
        </Badge>
      ),
    },
    {
      key: 'totalValue',
      header: 'Total Value',
      mobilePriority: 2,
      render: (row) => <AmountDisplay amount={row.totalValue} currency="USD" size="sm" />,
    },
    {
      key: 'status',
      header: 'Status',
      mobilePriority: 1,
      render: (row) => (
        <Badge variant={statusVariant(row.status)} size="sm">
          {row.status}
        </Badge>
      ),
    },
    {
      key: 'transferDate',
      header: 'Date',
      mobilePriority: 5,
      render: (row) => (
        <span style={{ color: theme.textMuted, fontSize: '12px' }}>
          {new Date(row.transferDate).toLocaleDateString()}
        </span>
      ),
    },
  ]

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
        <Table
          columns={columns}
          data={items}
          rowKey="id"
          loading={loading}
          emptyMessage="No intercompany stock transfers found."
          onRowClick={(row) => {
            navigate(`/interco/stock-transfers/${row.id}`)
          }}
        />
      </Card>
    </div>
  )
}
