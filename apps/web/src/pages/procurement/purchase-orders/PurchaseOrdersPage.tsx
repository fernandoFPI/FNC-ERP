import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation } from '@apollo/client'
import { PURCHASE_ORDERS_QUERY, APPROVE_PO } from '../../../graphql/procurement'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { FilterBar } from '../../../components/ui/FilterBar'
import type { Column } from '../../../components/ui/Table'
import { Table } from '../../../components/ui/Table'
import { Badge } from '../../../components/ui/Badge'
import { FilterChipStrip } from '../../../components/ui/FilterChipStrip'
import { Button } from '../../../components/ui/Button'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import { PO_STATUSES, getPOStatusVariant, getPOStatusLabel } from '../../../lib/po-constants'
import { useToastStore } from '../../../store/toastStore'
import { FilterPresets } from '../../../components/ui/FilterPresets'
import { useFilterPresets } from '../../../hooks/useFilterPresets'
import { useEntityChanged } from '../../../hooks/useEntityChanged'

const FILTER_DEFAULTS = { search: '', status: '', fromDate: '', toDate: '' }

const PRIORITY_LABELS: Record<string, string> = { low: 'Low', high: 'High', emergency: 'Emergency' }
const PRIORITY_STYLES: Record<string, { color: string; bg: string; border: string }> = {
  low: { color: '#6b7280', bg: 'transparent', border: 'transparent' },
  high: { color: '#d97706', bg: 'rgba(217,119,6,0.08)', border: 'rgba(217,119,6,0.3)' },
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
  invoice_count: number
  project_id?: string | null
  projectCode?: string | null
  projectName?: string | null
}

const STATUS_OPTIONS = [
  ...PO_STATUSES.map((s) => ({ value: s.key, label: s.label })),
  { value: 'deleted', label: 'Deleted' },
]

function downloadCSV(rows: string[][], filename: string) {
  const content = rows
    .map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob(['﻿' + content, ''], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function PurchaseOrdersPage() {
  const { theme } = useTheme()
  const navigate = useNavigate()
  const addToast = useToastStore((s) => s.addToast)
  const [urlParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkApproving, setBulkApproving] = useState(false)

  const projectIdFilter = urlParams.get('project_id') ?? ''
  const projectNameFilter = urlParams.get('project_name') ?? ''

  const { data, loading, refetch } = useQuery(PURCHASE_ORDERS_QUERY, {
    variables: { status: statusFilter || undefined, projectId: projectIdFilter || undefined },
    fetchPolicy: 'cache-and-network',
  })
  useEntityChanged('purchase_order', () => void refetch())

  const [approvePOMutation] = useMutation(APPROVE_PO)

  const currentFilters = { search, status: statusFilter, fromDate, toDate }
  const { presets, savePreset, deletePreset, resolvePreset } = useFilterPresets(
    'purchase_orders',
    FILTER_DEFAULTS,
  )

  const orders: PurchaseOrder[] = data?.purchaseOrders ?? []
  const filtered = orders.filter((o) => {
    if (search) {
      const q = search.toLowerCase()
      if (
        !o.po_number.toLowerCase().includes(q) &&
        !(o.vendor_name ?? '').toLowerCase().includes(q) &&
        !(o.projectCode ?? '').toLowerCase().includes(q) &&
        !(o.projectName ?? '').toLowerCase().includes(q)
      )
        return false
    }
    if (fromDate && o.created_at < fromDate) return false
    if (toDate && o.created_at > toDate + 'T23:59:59') return false
    return true
  })

  // ── Selection helpers ────────────────────────────────────────────────────────
  const filteredIds = filtered.map((o) => o.id)
  const allSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedIds.has(id))
  const someSelected = filteredIds.some((id) => selectedIds.has(id))

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredIds))
    }
  }

  const clearSelection = () => {
    setSelectedIds(new Set())
  }

  // ── Bulk actions ─────────────────────────────────────────────────────────────
  const selectedRows = filtered.filter((o) => selectedIds.has(o.id))
  const approvableRows = selectedRows.filter((o) => o.status === 'pending_approval')

  const handleBulkApprove = async () => {
    if (approvableRows.length === 0) return
    setBulkApproving(true)
    const results = await Promise.allSettled(
      approvableRows.map((o) => approvePOMutation({ variables: { id: o.id } })),
    )
    const succeeded = results.filter((r) => r.status === 'fulfilled').length
    const failed = results.filter((r) => r.status === 'rejected').length
    setBulkApproving(false)
    clearSelection()
    void refetch()
    if (failed === 0) {
      addToast({
        type: 'success',
        message: `${succeeded} PO${succeeded !== 1 ? 's' : ''} approved`,
      })
    } else {
      addToast({ type: 'warning', message: `${succeeded} approved, ${failed} failed` })
    }
  }

  const handleBulkExport = () => {
    const header = [
      'PO Number',
      'Vendor',
      'Project',
      'Status',
      'Priority',
      'Total Amount',
      'Currency',
      'Created',
      'Expected Delivery',
    ]
    const rows = selectedRows.map((o) => [
      o.po_number,
      o.vendor_name ?? '',
      o.project_id ? [o.projectCode, o.projectName].filter(Boolean).join(' — ') : '',
      getPOStatusLabel(o.status),
      PRIORITY_LABELS[o.priority] ?? o.priority,
      o.total_amount,
      o.currency_code,
      o.created_at.slice(0, 10),
      o.expected_delivery_date ?? '',
    ])
    downloadCSV(
      [header, ...rows],
      `purchase-orders-selected-${new Date().toISOString().slice(0, 10)}.csv`,
    )
  }

  // ── Columns ──────────────────────────────────────────────────────────────────
  const checkboxCol: Column<PurchaseOrder> = {
    key: '__select',
    header: '',
    width: '40px',
    mobileHide: true,
    renderHeader: () => (
      <input
        type="checkbox"
        checked={allSelected}
        ref={(el) => {
          if (el) el.indeterminate = someSelected && !allSelected
        }}
        onChange={toggleSelectAll}
        style={{ cursor: 'pointer', width: '15px', height: '15px', accentColor: theme.accent }}
      />
    ),
    render: (o) => (
      <div
        onClick={(e) => {
          e.stopPropagation()
        }}
        style={{ display: 'flex', alignItems: 'center' }}
      >
        <input
          type="checkbox"
          checked={selectedIds.has(o.id)}
          onChange={() => {
            toggleSelect(o.id)
          }}
          style={{ cursor: 'pointer', width: '15px', height: '15px', accentColor: theme.accent }}
        />
      </div>
    ),
  }

  const dataColumns: Column<PurchaseOrder>[] = [
    {
      key: 'priority',
      header: 'Priority',
      render: (o) => {
        const p = o.priority ?? 'low'
        const s = PRIORITY_STYLES[p] ?? PRIORITY_STYLES.low
        if (p === 'low') return <span style={{ fontSize: '12px', color: s.color }}>—</span>
        return (
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              color: s.color,
              background: s.bg,
              border: `1px solid ${s.border}`,
              borderRadius: '5px',
              padding: '2px 8px',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            {PRIORITY_LABELS[p]}
          </span>
        )
      },
    },
    {
      key: 'po_number',
      header: 'PO Number',
      render: (o) => (
        <span style={{ fontFamily: 'monospace', color: theme.accent, fontSize: '13px' }}>
          {o.po_number}
        </span>
      ),
    },
    {
      key: 'vendor_name',
      header: 'Vendor',
      render: (o) => (
        <span style={{ color: theme.textPrimary, fontSize: '13px' }}>{o.vendor_name ?? '—'}</span>
      ),
    },
    {
      key: 'project',
      header: 'Project',
      render: (o) =>
        o.project_id ? (
          <span style={{ color: theme.textSecondary, fontSize: '13px' }}>
            {[o.projectCode, o.projectName].filter(Boolean).join(' — ')}
          </span>
        ) : (
          <span style={{ color: theme.textMuted, fontSize: '13px' }}>—</span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (o) => (
        <Badge variant={getPOStatusVariant(o.status)}>{getPOStatusLabel(o.status)}</Badge>
      ),
    },
    {
      key: 'invoice_count',
      header: 'AP',
      render: (o) => {
        if (o.invoice_count > 0) {
          return (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '11px',
                fontWeight: 600,
                color: '#16a34a',
                background: 'rgba(22,163,74,0.08)',
                border: '1px solid rgba(22,163,74,0.25)',
                borderRadius: '5px',
                padding: '2px 8px',
                whiteSpace: 'nowrap',
              }}
            >
              ✓ AP Complete
            </span>
          )
        }
        if (['invoiced', 'completed'].includes(o.status)) {
          return (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '11px',
                fontWeight: 600,
                color: '#d97706',
                background: 'rgba(217,119,6,0.08)',
                border: '1px solid rgba(217,119,6,0.25)',
                borderRadius: '5px',
                padding: '2px 8px',
                whiteSpace: 'nowrap',
              }}
            >
              ⚠ Needs Invoice
            </span>
          )
        }
        return <span style={{ fontSize: '12px', color: theme.textMuted }}>—</span>
      },
    },
    {
      key: 'total_amount',
      header: 'Total',
      render: (o) => (
        <AmountDisplay amount={parseFloat(o.total_amount)} currency={o.currency_code} />
      ),
    },
    {
      key: 'expected_delivery_date',
      header: 'Expected Delivery',
      render: (o) => (
        <span style={{ color: theme.textMuted, fontSize: '13px' }}>
          {o.expected_delivery_date ?? '—'}
        </span>
      ),
    },
    {
      key: 'created_at',
      header: 'Created',
      render: (o) => (
        <span style={{ color: theme.textMuted, fontSize: '13px' }}>
          {o.created_at.slice(0, 10)}
        </span>
      ),
    },
  ]

  const columns = [checkboxCol, ...dataColumns]

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1400px' }}>
      <PageHeader
        title="Purchase Orders"
        subtitle={`${filtered.length} orders`}
        actions={
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const header = [
                  'PO Number',
                  'Vendor',
                  'Project',
                  'Status',
                  'Priority',
                  'Total Amount',
                  'Currency',
                  'Created',
                  'Expected Delivery',
                ]
                const rows = filtered.map((o) => [
                  o.po_number,
                  o.vendor_name ?? '',
                  o.project_id ? [o.projectCode, o.projectName].filter(Boolean).join(' — ') : '',
                  getPOStatusLabel(o.status),
                  PRIORITY_LABELS[o.priority] ?? o.priority,
                  o.total_amount,
                  o.currency_code,
                  o.created_at.slice(0, 10),
                  o.expected_delivery_date ?? '',
                ])
                downloadCSV(
                  [header, ...rows],
                  `purchase-orders-${new Date().toISOString().slice(0, 10)}.csv`,
                )
              }}
            >
              Export CSV
            </Button>
            <Button
              data-tour="new-po-btn"
              variant="primary"
              size="sm"
              onClick={() => {
                navigate('/procurement/purchase-orders/new')
              }}
            >
              New PO
            </Button>
          </div>
        }
      />

      {projectNameFilter && (
        <div
          style={{
            marginTop: '12px',
            padding: '8px 12px',
            background: '#eff6ff',
            border: '1px solid #bfdbfe',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '13px',
            color: '#1e40af',
          }}
        >
          <span>
            Filtered by project: <strong>{projectNameFilter}</strong>
          </span>
          <button
            style={{
              marginLeft: 'auto',
              color: '#6b7280',
              cursor: 'pointer',
              background: 'none',
              border: 'none',
              fontSize: '14px',
            }}
            onClick={() => {
              navigate('/procurement/purchase-orders')
            }}
          >
            Clear ×
          </button>
        </div>
      )}

      <div style={{ marginTop: '16px' }}>
        <FilterChipStrip
          allCount={orders.length}
          activeKey={statusFilter}
          onChange={setStatusFilter}
          chips={[...PO_STATUSES, { key: 'deleted', label: 'Deleted' } as const].map((s) => ({
            key: s.key,
            label: s.label,
            count: orders.filter((o) => o.status === s.key).length,
            variant: getPOStatusVariant(s.key),
          }))}
        />
      </div>

      <Card style={{ marginTop: '12px' }}>
        <FilterBar
          search={search}
          onSearchChange={setSearch}
          filters={[
            {
              key: 'status',
              label: 'Status',
              value: statusFilter,
              options: STATUS_OPTIONS,
              onChange: setStatusFilter,
            },
          ]}
          fromDate={fromDate}
          toDate={toDate}
          onFromDateChange={setFromDate}
          onToDateChange={setToDate}
          resultCount={filtered.length}
          onRefresh={() => refetch()}
        >
          <FilterPresets
            presets={presets}
            onApply={(preset) => {
              const r = resolvePreset(preset)
              setSearch(r.search)
              setStatusFilter(r.status)
              setFromDate(r.fromDate)
              setToDate(r.toDate)
            }}
            onSave={(name) => {
              savePreset(name, currentFilters)
            }}
            onDelete={deletePreset}
          />
        </FilterBar>

        {/* ── Bulk action toolbar ── */}
        {selectedIds.size > 0 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              flexWrap: 'wrap',
              padding: '10px 14px',
              background: theme.accentBg,
              borderBottom: `1px solid ${theme.accentBorder}`,
            }}
          >
            <span style={{ fontSize: '13px', fontWeight: 600, color: theme.accent }}>
              {selectedIds.size} selected
            </span>
            <div style={{ width: '1px', height: '18px', background: theme.accentBorder }} />
            {approvableRows.length > 0 && (
              <button
                onClick={() => void handleBulkApprove()}
                disabled={bulkApproving}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '5px 12px',
                  borderRadius: '7px',
                  fontSize: '12px',
                  fontWeight: 600,
                  background: theme.accent,
                  color: '#fff',
                  border: 'none',
                  cursor: bulkApproving ? 'not-allowed' : 'pointer',
                  opacity: bulkApproving ? 0.6 : 1,
                }}
              >
                {bulkApproving ? 'Approving…' : `Approve (${approvableRows.length})`}
              </button>
            )}
            <button
              onClick={handleBulkExport}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '5px 12px',
                borderRadius: '7px',
                fontSize: '12px',
                fontWeight: 500,
                background: theme.bgSurface,
                color: theme.textSecondary,
                border: `1px solid ${theme.border}`,
                cursor: 'pointer',
              }}
            >
              Export selected
            </button>
            <button
              onClick={clearSelection}
              style={{
                marginLeft: 'auto',
                padding: '5px 10px',
                borderRadius: '7px',
                fontSize: '12px',
                background: 'none',
                border: 'none',
                color: theme.textMuted,
                cursor: 'pointer',
              }}
            >
              Deselect all
            </button>
          </div>
        )}

        <Table
          columns={columns}
          data={filtered}
          loading={loading}
          rowKey="id"
          onRowClick={(o) => {
            navigate(`/procurement/purchase-orders/${o.id}`)
          }}
          getRowStyle={(o) => {
            const base =
              o.priority === 'emergency'
                ? { background: 'rgba(220,38,38,0.06)', borderLeft: '3px solid #dc2626' }
                : {}
            return selectedIds.has(o.id) ? { ...base, background: theme.accentBg } : base
          }}
        />
      </Card>
    </div>
  )
}
