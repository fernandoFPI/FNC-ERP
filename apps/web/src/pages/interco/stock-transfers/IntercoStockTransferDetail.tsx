import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@apollo/client'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import type { Column } from '../../../components/ui/Table'
import { Table } from '../../../components/ui/Table'
import { INTERCO_STOCK_TRANSFER_QUERY } from '../../../graphql/interco'

interface TransferLine {
  id: string
  productName: string
  sku: string
  qty: number
  avcoAtTransfer: number
  transferPrice: number
  markupPct: number
  totalValue: number
  currencyCode: string
}

interface StockTransferDetail {
  id: string
  transferNumber: string
  fromCompanyId: string
  fromCompanyName: string
  toCompanyId: string
  toCompanyName: string
  pricingMethod: string
  status: string
  transferDate: string
  fromStockMoveId: string | null
  toStockMoveId: string | null
  fromJournalId: string | null
  toJournalId: string | null
  intercoTransactionId: string | null
  intercoTransactionReference: string | null
  intercoTransactionStatus: string | null
  currencyCode: string
  lines: TransferLine[]
}

interface TransferDetailData {
  intercoStockTransfer: StockTransferDetail
}

function statusVariant(
  status: string,
): 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent' {
  const m: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent'> = {
    completed: 'success',
    draft: 'neutral',
    cancelled: 'danger',
    in_transit: 'info',
  }
  return m[status?.toLowerCase()] ?? 'neutral'
}

function billingStatusVariant(
  status: string,
): 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent' {
  const m: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent'> = {
    posted: 'success',
    pending: 'warning',
    cancelled: 'danger',
  }
  return m[status?.toLowerCase()] ?? 'neutral'
}

export default function IntercoStockTransferDetail() {
  const { theme } = useTheme()
  const { id } = useParams<{ id: string }>()

  const { data, loading } = useQuery<TransferDetailData>(INTERCO_STOCK_TRANSFER_QUERY, {
    variables: { id },
    skip: !id,
  })

  const tx = data?.intercoStockTransfer

  if (loading) {
    return (
      <div style={{ padding: '24px' }}>
        <div
          className="skeleton"
          style={{ height: '60px', borderRadius: '8px', marginBottom: '16px' }}
        />
        <div className="skeleton" style={{ height: '300px', borderRadius: '8px' }} />
      </div>
    )
  }

  if (!tx) {
    return (
      <div style={{ padding: '24px' }}>
        <p style={{ color: theme.textMuted }}>Transfer not found.</p>
      </div>
    )
  }

  const totalValue = tx.lines.reduce((s, l) => s + l.totalValue, 0)

  const columns: Column<TransferLine>[] = [
    {
      key: 'sku',
      header: 'SKU',
      mobileSecondary: true,
      render: (line) => (
        <span style={{ color: theme.textMuted, fontSize: '12px' }}>{line.sku}</span>
      ),
    },
    {
      key: 'productName',
      header: 'Product',
      mobilePrimary: true,
      render: (line) => (
        <span style={{ color: theme.textPrimary, fontWeight: 500 }}>{line.productName}</span>
      ),
    },
    {
      key: 'qty',
      header: 'Qty',
      mobilePriority: 1,
      render: (line) => (
        <span style={{ color: theme.textSecondary }}>{line.qty.toLocaleString()}</span>
      ),
    },
    {
      key: 'avcoAtTransfer',
      header: 'AVCO at Transfer',
      mobilePriority: 2,
      render: (line) => <AmountDisplay amount={line.avcoAtTransfer} currency={line.currencyCode} size="sm" />,
    },
    {
      key: 'transferPrice',
      header: 'Transfer Price',
      mobilePriority: 3,
      render: (line) => <AmountDisplay amount={line.transferPrice} currency={line.currencyCode} size="sm" />,
    },
    {
      key: 'markupPct',
      header: 'Markup %',
      mobilePriority: 4,
      render: (line) => (
        <span style={{ color: theme.textSecondary }}>{line.markupPct.toFixed(1)}%</span>
      ),
    },
    {
      key: 'totalValue',
      header: 'Total Value',
      mobilePriority: 5,
      render: (line) => (
        <span style={{ fontWeight: 500 }}>
          <AmountDisplay amount={line.totalValue} currency={line.currencyCode} size="sm" />
        </span>
      ),
    },
  ]

  return (
    <div style={{ padding: '24px' }}>
      <PageHeader
        title={tx.transferNumber}
        subtitle={`${tx.fromCompanyName} → ${tx.toCompanyName} · ${new Date(tx.transferDate).toLocaleDateString()}`}
        backPath="/interco/stock-transfers"
        backLabel="Stock Transfers"
        status={<Badge variant={statusVariant(tx.status)}>{tx.status}</Badge>}
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
          marginBottom: '16px',
        }}
      >
        <Card padding="md">
          <p
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: theme.textMuted,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '12px',
            }}
          >
            Transfer Info
          </p>
          <dl
            style={{
              display: 'grid',
              gridTemplateColumns: '140px 1fr',
              gap: '8px 12px',
              fontSize: '13px',
            }}
          >
            <dt style={{ color: theme.textMuted }}>From</dt>
            <dd style={{ color: theme.textPrimary, fontWeight: 500, margin: 0 }}>
              {tx.fromCompanyName}
            </dd>
            <dt style={{ color: theme.textMuted }}>To</dt>
            <dd style={{ color: theme.textPrimary, fontWeight: 500, margin: 0 }}>
              {tx.toCompanyName}
            </dd>
            <dt style={{ color: theme.textMuted }}>Pricing Method</dt>
            <dd style={{ margin: 0 }}>
              <Badge variant="neutral" size="sm">
                {tx.pricingMethod}
              </Badge>
            </dd>
            <dt style={{ color: theme.textMuted }}>Transfer Date</dt>
            <dd style={{ color: theme.textSecondary, margin: 0 }}>
              {new Date(tx.transferDate).toLocaleDateString()}
            </dd>
            <dt style={{ color: theme.textMuted }}>Total Value</dt>
            <dd style={{ margin: 0 }}>
              <AmountDisplay amount={totalValue} currency={tx.currencyCode} size="md" />
            </dd>
          </dl>
        </Card>

        <Card padding="md">
          <p
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: theme.textMuted,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '12px',
            }}
          >
            Billing
          </p>
          {tx.intercoTransactionId ? (
            <dl
              style={{
                display: 'grid',
                gridTemplateColumns: '140px 1fr',
                gap: '8px 12px',
                fontSize: '13px',
              }}
            >
              <dt style={{ color: theme.textMuted }}>Transaction</dt>
              <dd style={{ margin: 0 }}>
                <Link
                  to={`/interco/transactions/${tx.intercoTransactionId}`}
                  style={{ color: theme.accent, fontWeight: 500, textDecoration: 'none' }}
                >
                  {tx.intercoTransactionReference}
                </Link>
              </dd>
              <dt style={{ color: theme.textMuted }}>Status</dt>
              <dd style={{ margin: 0 }}>
                <Badge variant={billingStatusVariant(tx.intercoTransactionStatus ?? '')} size="sm">
                  {tx.intercoTransactionStatus}
                </Badge>
              </dd>
            </dl>
          ) : (
            <p style={{ color: theme.textMuted, fontSize: '13px', margin: 0 }}>
              No linked interco transaction — this transfer was not auto-billed.
            </p>
          )}
        </Card>

        <Card padding="md">
          <p
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: theme.textMuted,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '12px',
            }}
          >
            Journal References
          </p>
          <dl
            style={{
              display: 'grid',
              gridTemplateColumns: '140px 1fr',
              gap: '8px 12px',
              fontSize: '13px',
            }}
          >
            <dt style={{ color: theme.textMuted }}>From Stock Move</dt>
            <dd style={{ color: tx.fromStockMoveId ? theme.accent : theme.textMuted, margin: 0 }}>
              {tx.fromStockMoveId ?? '—'}
            </dd>
            <dt style={{ color: theme.textMuted }}>To Stock Move</dt>
            <dd style={{ color: tx.toStockMoveId ? theme.accent : theme.textMuted, margin: 0 }}>
              {tx.toStockMoveId ?? '—'}
            </dd>
            <dt style={{ color: theme.textMuted }}>From Journal</dt>
            <dd style={{ color: tx.fromJournalId ? theme.accent : theme.textMuted, margin: 0 }}>
              {tx.fromJournalId ?? '—'}
            </dd>
            <dt style={{ color: theme.textMuted }}>To Journal</dt>
            <dd style={{ color: tx.toJournalId ? theme.accent : theme.textMuted, margin: 0 }}>
              {tx.toJournalId ?? '—'}
            </dd>
          </dl>
        </Card>
      </div>

      {/* Transfer Lines */}
      <Card padding="none">
        <div style={{ padding: '16px 20px 12px', borderBottom: `1px solid ${theme.border}` }}>
          <h3 style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary }}>
            Transfer Lines ({tx.lines.length})
          </h3>
        </div>
        <Table
          columns={columns}
          data={tx.lines}
          rowKey="id"
          footerRow={{
            markupPct: <span style={{ color: theme.textPrimary, fontWeight: 600 }}>Total</span>,
            totalValue: (
              <span style={{ fontWeight: 600 }}>
                <AmountDisplay amount={totalValue} currency={tx.currencyCode} size="sm" />
              </span>
            ),
          }}
        />
      </Card>
    </div>
  )
}
