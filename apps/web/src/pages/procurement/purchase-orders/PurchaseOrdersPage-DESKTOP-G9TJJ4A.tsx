import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@apollo/client'
import { PURCHASE_ORDERS_QUERY } from '../../../graphql/procurement'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { FilterBar } from '../../../components/ui/FilterBar'
import { Table, Column } from '../../../components/ui/Table'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import { PO_STATUSES, getPOStatusVariant, getPOStatusLabel } from '../../../lib/po-constants'

const PRIORITY_LABELS: Record<string, string> = { low: 'Low', high: 'High', emergency: 'Emergency' }
const PRIORITY_STYLES: Record<string, { color: string; bg: string; border: string }> = {
  low:       { color: '#6b7280', bg: 'transparent',          border: 'transparent' },
  high:      { color: '#d97706', bg: 'rgba(217,119,6,0.08)', border: 'rgba(217,119,6,0.3)' },
  emergency: { color: '#dc2626', bg: 'rgba(220,38,38,0.08)', border: 'rgba(220,38,38,0.3)' },
}

interface PurchaseOrder {
  id: string
  po_number: string
  vendor_name?: string
  vendor_id: string
  status: string
  priority: string
  total_amount: string
  currency_code: string
  created_at: string
  expected_delivery_date?: string
}

const STATUS_OPTIONS = [
  ...PO_STATUSES.map((s) => ({ value: s.key, label: s.label })),
  { value: 'deleted', label: 'Deleted' },
]

export default function PurchaseOrdersPage() {
  const { theme } = useTheme()
  const navigate = useNavigate()
  const [urlParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const projectIdFilter   = urlParams.get('project_id')   ?? ''
  const projectNameFilter = urlParams.get('project_name') ?? ''

  const { data, loading, refetch } = useQuery(PURCHASE_ORDERS_QUERY, {
    variables: { status: statusFilter || undefined, projectId: projectIdFilter || undefined },
    fetchPolicy: 'cache-and-network',
  })

  const orders: PurchaseOrder[] = data?.purchaseOrders ?? []
  const filtered = orders.filter((o) => {
    if (search) {
      const q = search.toLowerCase()
      if (!o.po_number.toLowerCase().includes(q) && !(o.vendor_name ?? '').toLowerCase().includes(q)) return false
    }
    if (fromDate && o.created_at < fromDate) return false
    if (toDate && o.created_at > toDate + 'T23:59:59') return false
    return true
  })

  const columns: Column<PurchaseOrder>[] = [
    {
      key: 'priority',
      header: 'Priority',
      render: (o) => {
        const p = o.priority ?? 'low'
        const s = PRIORITY_STYLES[p] ?? PRIORITY_STYLES.low
        if (p === 'low') return <span style={{ fontSize: '12px', color: s.color }}>—</span>
        return (
          <span style={{ fontSize: '11px', fontWeight: 700, color: s.color, background: s.bg, border: `1px solid ${s.border}`, borderRadius: '5px', padding: '2px 8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {PRIORITY_LABELS[p]}
          </span>
        )
      },
    },
    {
      key: 'po_number',
      header: 'PO Number',
      render: (o) => <span style={{ fontFamily: 'monospace', color: theme.accent, fontSize: '13px' }}>{o.po_number}</span>,
    },
    {
      key: 'vendor_name',
      header: 'Vendor',
      render: (o) => <span style={{ color: theme.textPrimary, fontSize: '13px' }}>{o.vendor_name ?? '—'}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (o) => <Badge variant={getPOStatusVariant(o.status)}>{getPOStatusLabel(o.status)}</Badge>,
    },
    {
      key: 'total_amount',
      header: 'Total',
      render: (o) => <AmountDisplay amount={parseFloat(o.total_amount)} currency={o.currency_code} />,
    },
    {
      key: 'expected_delivery_date',
      header: 'Expected Delivery',
      render: (o) => <span style={{ color: theme.textMuted, fontSize: '13px' }}>{o.expected_delivery_date ?? '—'}</span>,
    },
    {
      key: 'created_at',
      header: 'Created',
      render: (o) => <span style={{ color: theme.textMuted, fontSize: '13px' }}>{o.created_at.slice(0, 10)}</span>,
    },
  ]

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1400px' }}>
      <PageHeader
        title="Purchase Orders"
        subtitle={`${filtered.length} orders`}
        actions={
          <Button variant="primary" size="sm" onClick={() => navigate('/procurement/purchase-orders/new')}>
            New PO
          </Button>
        }
      />

      {projectNameFilter && (
        <div style={{ marginTop: '12px', padding: '8px 12px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#1e40af' }}>
          <span>Filtered by project: <strong>{projectNameFilter}</strong></span>
          <button
            style={{ marginLeft: 'auto', color: '#6b7280', cursor: 'pointer', background: 'none', border: 'none', fontSize: '14px' }}
            onClick={() => navigate('/procurement/purchase-orders')}
          >
            Clear ×
          </button>
        </div>
      )}

      {(() => {
        const variantColors: Record<string, { bg: string; color: string; border: string }> = {
          success: { bg: theme.successBg,  color: theme.success,  border: theme.successBorder },
          warning: { bg: theme.warningBg,  color: theme.warning,  border: theme.warningBorder },
          danger:  { bg: theme.dangerBg,   color: theme.danger,   border: theme.dangerBorder  },
          info:    { bg: theme.infoBg,     color: theme.info,     border: theme.infoBorder    },
          neutral: { bg: theme.bgSurface,  color: theme.textSecondary, border: theme.border   },
          accent:  { bg: theme.accentBg,   color: theme.accent,   border: theme.accentBorder  },
        }
        const allStatuses = [...PO_STATUSES, { key: 'deleted', label: 'Deleted' } as const]
        const total = orders.length
        return (
          <div style={{ marginTop: '16px', display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '2px' }}>
            <button
              onClick={() => setStatusFilter('')}
              style={{
                flexShrink: 0, display: 'flex', alignItems: 'center', gap: '6px',
                padding: '6px 12px', borderRadius: '7px', cursor: 'pointer',
                border: `1px solid ${!statusFilter ? theme.accentBorder : theme.border}`,
                background: !statusFilter ? theme.accentBg : theme.bgSurface,
                color: !statusFilter ? theme.accent : theme.textMuted,
                fontSize: '12px', fontWeight: !statusFilter ? 600 : 400,
              }}
            >
              All
              <span style={{
                minWidth: '18px', height: '18px', borderRadius: '9px', display: 'inline-flex',
                alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700,
                background: !statusFilter ? theme.accent : theme.border,
                color: !statusFilter ? '#fff' : theme.textMuted, padding: '0 4px',
              }}>{total}</span>
            </button>

            <div style={{ width: '1px', background: theme.border, margin: '4px 2px', flexShrink: 0 }} />

            {allStatuses.map((s) => {
              const count = orders.filter((o) => o.status === s.key).length
              const active = statusFilter === s.key
              const variant = getPOStatusVariant(s.key)
              const vc = variantColors[variant]
              return (
                <button
                  key={s.key}
                  onClick={() => setStatusFilter(active ? '' : s.key)}
                  style={{
                    flexShrink: 0, display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '6px 12px', borderRadius: '7px', cursor: 'pointer',
                    border: `1px solid ${active ? vc.border : theme.border}`,
                    background: active ? vc.bg : theme.bgSurface,
                    color: active ? vc.color : theme.textMuted,
                    fontSize: '12px', fontWeight: active ? 600 : 400,
                    opacity: count === 0 ? 0.45 : 1,
                  }}
                >
                  {s.label}
                  <span style={{
                    minWidth: '18px', height: '18px', borderRadius: '9px', display: 'inline-flex',
                    alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700,
                    background: active ? vc.color : count > 0 ? vc.bg : theme.border,
                    color: active ? '#fff' : count > 0 ? vc.color : theme.textMuted,
                    padding: '0 4px',
                  }}>{count}</span>
                </button>
              )
            })}
          </div>
        )
      })()}

      <Card style={{ marginTop: '12px' }}>
        <FilterBar
          search={search}
          onSearchChange={setSearch}
          filters={[
            { key: 'status', label: 'Status', value: statusFilter, options: STATUS_OPTIONS, onChange: setStatusFilter },
          ]}
          fromDate={fromDate}
          toDate={toDate}
          onFromDateChange={setFromDate}
          onToDateChange={setToDate}
          resultCount={filtered.length}
          onRefresh={() => refetch()}
        />
        <Table
          columns={columns}
          data={filtered}
          loading={loading}
          rowKey="id"
          onRowClick={(o) => navigate(`/procurement/purchase-orders/${o.id}`)}
          getRowStyle={(o) => o.priority === 'emergency'
            ? { background: 'rgba(220,38,38,0.06)', borderLeft: '3px solid #dc2626' }
            : {}}
        />
      </Card>
    </div>
  )
}
