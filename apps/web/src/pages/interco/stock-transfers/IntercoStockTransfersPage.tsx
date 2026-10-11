import { useTranslation } from 'react-i18next'
import { enumLabel } from '../../../i18n'
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
  currencyCode: string
  pricingMethod: string
  status: string
  transferDate: string
  intercoTransactionId?: string | null
  intercoTransactionReference?: string | null
  intercoTransactionStatus?: string | null
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
  return m[status.toLowerCase()] ?? 'neutral'
}

function billingStatusVariant(
  status: string,
): 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent' {
  const m: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent'> = {
    posted: 'success',
    pending: 'warning',
    cancelled: 'danger',
  }
  return m[status.toLowerCase()] ?? 'neutral'
}

export default function IntercoStockTransfersPage() {
  const { t } = useTranslation()
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
      header: t('interco.transfers.transfer'),
      mobilePrimary: true,
      render: (row) => (
        <span style={{ color: theme.accent, fontWeight: 500 }}>{row.transferNumber}</span>
      ),
    },
    {
      key: 'fromCompanyName',
      header: t('interco.transfers.from'),
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
      header: t('interco.transfers.pricingMethod'),
      mobilePriority: 3,
      render: (row) => (
        <Badge variant="neutral" size="sm">
          {enumLabel(row.pricingMethod)}
        </Badge>
      ),
    },
    {
      key: 'totalValue',
      header: t('interco.transfers.totalValue'),
      mobilePriority: 2,
      render: (row) => <AmountDisplay amount={row.totalValue} currency={row.currencyCode} size="sm" />,
    },
    {
      key: 'status',
      header: t('interco.transfers.status'),
      mobilePriority: 1,
      render: (row) => (
        <Badge variant={statusVariant(row.status)} size="sm">
          {enumLabel(row.status)}
        </Badge>
      ),
    },
    {
      key: 'billing',
      header: t('interco.transfers.billing'),
      mobilePriority: 6,
      render: (row) =>
        row.intercoTransactionId ? (
          <Badge variant={billingStatusVariant(row.intercoTransactionStatus ?? '')} size="sm">
            {row.intercoTransactionReference ?? enumLabel(row.intercoTransactionStatus)}
          </Badge>
        ) : (
          <span style={{ color: theme.textMuted, fontSize: '12px' }}>—</span>
        ),
    },
    {
      key: 'transferDate',
      header: t('interco.transfers.date'),
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
        title={t('interco.transfers.intercoStockTransfers')}
        subtitle={t('interco.transfers.inventoryMovementsBetweenGroupEntities')}
        actions={
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                void refetch()
              }}
            >
              {t('interco.transfers.refresh')}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                navigate('/interco/stock-transfers/new')
              }}
            >
              {t('interco.transfers.newTransfer')}
            </Button>
          </div>
        }
      />

      <Card padding="sm" style={{ marginBottom: '16px' }}>
        <FilterBar
          search={{
            value: search,
            onChange: setSearch,
            placeholder: t('interco.transfers.searchTransferNumberOrCompany'),
          }}
          filters={[
            {
              key: 'status',
              label: t('interco.transfers.status'),
              value: statusFilter,
              onChange: setStatusFilter,
              options: [
                { value: 'draft', label: t('interco.transfers.draft') },
                { value: 'in_transit', label: t('interco.transfers.inTransit') },
                { value: 'completed', label: t('interco.transfers.completed') },
                { value: 'cancelled', label: t('interco.transfers.cancelled') },
              ],
            },
          ]}
          fromDate={fromDate}
          toDate={toDate}
          onFromDateChange={setFromDate}
          onToDateChange={setToDate}
          onRefresh={() => {
            void refetch()
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
          emptyMessage={t('interco.transfers.noIntercompanyStockTransfersFound')}
          onRowClick={(row) => {
            navigate(`/interco/stock-transfers/${row.id}`)
          }}
        />
      </Card>
    </div>
  )
}
