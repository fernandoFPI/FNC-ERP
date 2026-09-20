import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@apollo/client'
import { PRODUCT_QUERY } from '../../../graphql/inventory'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import type { Column } from '../../../components/ui/Table'
import { Table } from '../../../components/ui/Table'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'

// Every product is valued at last-recorded-cost (see migration
// 203_stock_balance_last_cost.sql); migration 257 makes 'last_cost' the
// only value the DB will accept, so this is always the same string.
const VALUATION_METHOD_LABEL = 'Last Recorded Cost'

interface ProductBalance {
  location_id: string
  location_name?: string
  location_type?: string
  qty_on_hand: string
  qty_reserved: string
  available: string
  average_cost: string
  last_cost_currency: string
  total_value: string
}

interface ProductCostHistoryEntry {
  id: string
  old_cost: string | null
  new_cost: string
  currency_code: string
  source_type: string
  source_label?: string | null
  changed_by_name?: string | null
  changed_at: string
}

const COST_SOURCE_LABEL: Record<string, string> = {
  po_receipt: 'PO Receipt',
  po_market_pricing: 'PO Market Pricing',
  requisition_market_pricing: 'Requisition Market Pricing',
  catalog_link: 'Catalog Match',
  stock_adjustment: 'Stock Adjustment',
  cost_correction: 'Cost Correction',
  manual_edit: 'Manual Edit',
}

export default function ProductDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { theme } = useTheme()

  const { data, loading } = useQuery(PRODUCT_QUERY, {
    variables: { id },
    skip: !id,
    fetchPolicy: 'cache-and-network',
  })

  const product = data?.product
  const balances: ProductBalance[] = product?.balances ?? []
  const costHistory: ProductCostHistoryEntry[] = product?.costHistory ?? []

  const totalOnHand = balances.reduce((s, b) => s + parseFloat(b.qty_on_hand), 0)
  const totalValue = balances.reduce((s, b) => s + parseFloat(b.total_value), 0)
  // Locations normally share one currency (a product has a single
  // cost_currency, and corrections now tag moves with it) — but nothing
  // stops two locations from genuinely differing (e.g. one corrected
  // before a currency change, one after), so this label is only trustworthy
  // when they actually agree; otherwise fall back to the product's own
  // currency as a best-effort label rather than silently mislabeling a sum
  // of mixed-currency values.
  const balanceCurrencies = new Set(balances.map((b) => b.last_cost_currency))
  const totalValueCurrency =
    balanceCurrencies.size === 1 ? [...balanceCurrencies][0] : (product?.cost_currency ?? 'IQD')

  const balanceColumns: Column<ProductBalance>[] = [
    {
      key: 'location_name',
      header: 'Location',
      render: (b) => (
        <span style={{ color: theme.textPrimary }}>{b.location_name ?? b.location_id}</span>
      ),
    },
    {
      key: 'location_type',
      header: 'Type',
      render: (b) => (b.location_type ? <Badge variant="neutral">{b.location_type}</Badge> : null),
    },
    {
      key: 'qty_on_hand',
      header: 'On Hand',
      render: (b) => (
        <span style={{ fontFamily: 'monospace', color: theme.textPrimary }}>
          {parseFloat(b.qty_on_hand).toLocaleString()}
        </span>
      ),
    },
    {
      key: 'qty_reserved',
      header: 'Reserved',
      render: (b) => (
        <span style={{ fontFamily: 'monospace', color: theme.warning }}>
          {parseFloat(b.qty_reserved).toLocaleString()}
        </span>
      ),
    },
    {
      key: 'available',
      header: 'Available',
      render: (b) => (
        <span style={{ fontFamily: 'monospace', color: theme.success }}>
          {parseFloat(b.available).toLocaleString()}
        </span>
      ),
    },
    {
      key: 'average_cost',
      header: 'Last Cost',
      render: (b) => <AmountDisplay amount={parseFloat(b.average_cost)} currency={b.last_cost_currency} />,
    },
    {
      key: 'total_value',
      header: 'Total Value',
      render: (b) => <AmountDisplay amount={parseFloat(b.total_value)} currency={b.last_cost_currency} />,
    },
  ]

  const costHistoryColumns: Column<ProductCostHistoryEntry>[] = [
    {
      key: 'changed_at',
      header: 'Date/Time',
      render: (h) => (
        <span style={{ fontSize: '13px', color: theme.textSecondary }}>
          {new Date(h.changed_at).toLocaleString()}
        </span>
      ),
    },
    {
      key: 'change',
      header: 'Change',
      render: (h) => (
        <span style={{ fontFamily: 'monospace', fontSize: '13px' }}>
          {h.old_cost != null ? (
            <>
              <span style={{ color: theme.textMuted }}>
                {parseFloat(h.old_cost).toLocaleString()}
              </span>
              {' → '}
            </>
          ) : null}
          <span style={{ color: theme.textPrimary, fontWeight: 600 }}>
            {parseFloat(h.new_cost).toLocaleString()} {h.currency_code}
          </span>
        </span>
      ),
    },
    {
      key: 'source',
      header: 'Changed By',
      render: (h) => (
        <span style={{ fontSize: '13px', color: theme.textPrimary }}>
          {h.source_label || COST_SOURCE_LABEL[h.source_type] || h.source_type}
        </span>
      ),
    },
    {
      key: 'changed_by_name',
      header: 'User',
      render: (h) => (
        <span style={{ fontSize: '13px', color: theme.textMuted }}>
          {h.changed_by_name ?? '—'}
        </span>
      ),
    },
  ]

  if (loading && !product)
    return <div style={{ padding: '24px', color: theme.textMuted }}>Loading…</div>
  if (!product)
    return <div style={{ padding: '24px', color: theme.textMuted }}>Product not found</div>

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1300px' }}>
      <PageHeader
        title={product.name}
        subtitle={product.name_ar ? `${product.sku} · ${product.name_ar}` : product.sku}
        backPath="/inventory/products"
        status={
          <Badge variant={product.is_active ? 'success' : 'neutral'}>
            {product.is_active ? 'Active' : 'Inactive'}
          </Badge>
        }
        actions={
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                navigate(`/inventory/products/${id}/edit`)
              }}
            >
              Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                navigate(`/inventory/moves?productId=${id}`)
              }}
            >
              View Moves
            </Button>
          </div>
        }
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '8px',
          marginTop: '20px',
          marginBottom: '16px',
        }}
      >
        {[
          ['Category', product.category ?? '—'],
          ...(product.sub_category ? [['Store', product.sub_category] as [string, string]] : []),
          ['UOM', product.uom],
          ['Valuation', VALUATION_METHOD_LABEL],
          [
            'Cost',
            `${parseFloat(product.standard_cost ?? '0').toLocaleString()} ${product.cost_currency ?? ''}`.trim(),
          ],
          ['Total On Hand', totalOnHand.toLocaleString()],
          ['Total Value', `${totalValue.toLocaleString()} ${totalValueCurrency}`.trim()],
          [
            'Reorder Point',
            product.reorder_point ? parseFloat(product.reorder_point).toLocaleString() : '—',
          ],
          [
            'Reorder Qty',
            product.reorder_qty ? parseFloat(product.reorder_qty).toLocaleString() : '—',
          ],
        ].map(([label, value]) => (
          <div
            key={label}
            style={{
              background: theme.bgSurface,
              border: `1px solid ${theme.border}`,
              borderRadius: '8px',
              padding: '12px',
            }}
          >
            <div
              style={{
                fontSize: '11px',
                color: theme.textMuted,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              {label}
            </div>
            <div
              style={{
                fontSize: '15px',
                fontWeight: 600,
                color: theme.textPrimary,
                marginTop: '4px',
                fontFamily: /\d/.test(String(value)) ? 'monospace' : 'inherit',
              }}
            >
              {value}
            </div>
          </div>
        ))}
      </div>

      {product.description && (
        <div
          style={{
            background: theme.bgSurface,
            border: `1px solid ${theme.border}`,
            borderRadius: '8px',
            padding: '12px 16px',
            marginBottom: '16px',
            fontSize: '13px',
            color: theme.textSecondary,
          }}
        >
          {product.description}
        </div>
      )}

      <Card>
        <div
          style={{
            padding: '12px 16px',
            borderBottom: `1px solid ${theme.border}`,
            fontWeight: 600,
            color: theme.textPrimary,
          }}
        >
          Stock by Location
        </div>
        <Table columns={balanceColumns} data={balances} rowKey="location_id" />
      </Card>

      <Card style={{ marginTop: '16px' }}>
        <div
          style={{
            padding: '12px 16px',
            borderBottom: `1px solid ${theme.border}`,
            fontWeight: 600,
            color: theme.textPrimary,
          }}
        >
          Cost History
        </div>
        <Table
          columns={costHistoryColumns}
          data={costHistory}
          rowKey="id"
          emptyMessage="No cost changes recorded yet."
        />
      </Card>
    </div>
  )
}
