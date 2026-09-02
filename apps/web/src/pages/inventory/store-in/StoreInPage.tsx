import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@apollo/client'
import {
  PO_RECEIPTS_QUERY,
  RECEIVABLE_PURCHASE_ORDERS_QUERY,
  CANCEL_RECEIPT,
} from '../../../graphql/procurement'
import { PROJECTS_QUERY } from '../../../graphql/projects'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Modal } from '../../../components/ui/Modal'
import { Select } from '../../../components/ui/Select'
import { SearchableSelect } from '../../../components/ui/SearchableSelect'
import { Table } from '../../../components/ui/Table'
import type { Column } from '../../../components/ui/Table'
import { KPICard } from '../../../components/ui/KPICard'
import { useTheme } from '../../../theme/ThemeContext'
import { usePagePadding } from '../../../hooks/usePagePadding'
import { useAuthStore } from '../../../store/authStore'
import { useToastStore } from '../../../store/toastStore'

interface ReceiptLine {
  qty_received: string
  unit_price: string | null
  fx_rate_to_base: string | null
}

interface Receipt {
  id: string
  po_number: string | null
  vendor_name: string | null
  received_from_name: string | null
  base_currency_code: string | null
  receipt_number: string | null
  receipt_date: string
  received_by_name: string | null
  received_by_email: string | null
  status: string
  lines: ReceiptLine[]
}

const STATUS_VARIANT: Record<string, 'neutral' | 'warning' | 'success' | 'danger'> = {
  draft: 'warning',
  confirmed: 'success',
  cancelled: 'danger',
}

const lineTotal = (l: ReceiptLine) =>
  parseFloat(l.qty_received) * parseFloat(l.unit_price ?? '0') * (parseFloat(l.fx_rate_to_base ?? '1') || 1)

const fmtAmt = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

export default function StoreInPage() {
  const navigate = useNavigate()
  const { theme } = useTheme()
  const pagePadding = usePagePadding()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerProjectId, setPickerProjectId] = useState('')
  const [pickerPoId, setPickerPoId] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkCancelling, setBulkCancelling] = useState(false)
  const addToast = useToastStore((s) => s.addToast)
  const currentUserRole = useAuthStore((s) => s.user?.role)
  const isAdmin = currentUserRole === 'system_admin' || currentUserRole === 'company_admin'

  const { data, loading, error, refetch } = useQuery(PO_RECEIPTS_QUERY, {
    fetchPolicy: 'cache-and-network',
  })
  const [cancelReceiptMutation] = useMutation(CANCEL_RECEIPT)
  const receipts: Receipt[] = data?.poReceipts ?? []
  const draftCount = receipts.filter((r) => r.status === 'draft').length
  const confirmedCount = receipts.filter((r) => r.status === 'confirmed').length

  const { data: projectsData } = useQuery(PROJECTS_QUERY, {
    variables: { includeAll: true },
    skip: !pickerOpen,
  })
  const projects: { id: string; code: string; name: string }[] = projectsData?.projects?.data ?? []

  const { data: posData, loading: posLoading } = useQuery(RECEIVABLE_PURCHASE_ORDERS_QUERY, {
    variables: { projectId: pickerProjectId || undefined },
    skip: !pickerOpen,
    fetchPolicy: 'cache-and-network',
  })
  const receivablePOs: { id: string; po_number: string; vendor_name: string | null; status: string }[] =
    posData?.receivablePurchaseOrders ?? []

  const filtered = receipts
    .filter((r) => !statusFilter || r.status === statusFilter)
    .filter((r) => {
      if (!search.trim()) return true
      const q = search.toLowerCase()
      return (
        r.receipt_number?.toLowerCase().includes(q) ||
        r.po_number?.toLowerCase().includes(q) ||
        r.received_from_name?.toLowerCase().includes(q) ||
        r.received_by_name?.toLowerCase().includes(q)
      )
    })

  // Only draft receipts are selectable/cancellable — cancelReceipt itself
  // refuses anything else, so bulk-selecting a confirmed/cancelled row
  // would just produce a confusing per-row failure.
  const selectableIds = filtered.filter((r) => r.status === 'draft').map((r) => r.id)
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id))
  const someSelected = selectableIds.some((id) => selectedIds.has(id))

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(selectableIds))
  }
  const clearSelection = () => {
    setSelectedIds(new Set())
  }

  const handleBulkCancel = async () => {
    if (selectedIds.size === 0) return
    setBulkCancelling(true)
    const ids = Array.from(selectedIds)
    const results = await Promise.allSettled(
      ids.map((id) => cancelReceiptMutation({ variables: { id } })),
    )
    const succeeded = results.filter((r) => r.status === 'fulfilled').length
    const failed = results.filter((r) => r.status === 'rejected').length
    setBulkCancelling(false)
    clearSelection()
    void refetch()
    if (failed === 0) {
      addToast({
        type: 'success',
        message: `${succeeded} draft receipt${succeeded !== 1 ? 's' : ''} cancelled`,
      })
    } else {
      addToast({ type: 'warning', message: `${succeeded} cancelled, ${failed} failed` })
    }
  }

  const checkboxCol: Column<Receipt> = {
    key: '__select',
    header: '',
    width: '36px',
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
    render: (r) =>
      r.status === 'draft' ? (
        <div
          onClick={(e) => {
            e.stopPropagation()
          }}
          style={{ display: 'flex', alignItems: 'center' }}
        >
          <input
            type="checkbox"
            checked={selectedIds.has(r.id)}
            onChange={() => {
              toggleSelect(r.id)
            }}
            style={{ cursor: 'pointer', width: '15px', height: '15px', accentColor: theme.accent }}
          />
        </div>
      ) : null,
  }

  const columns: Column<Receipt>[] = [
    ...(isAdmin ? [checkboxCol] : []),
    {
      key: 'receipt_number',
      header: 'Receipt #',
      render: (r) => (
        <span style={{ fontWeight: 600, color: theme.textPrimary }}>
          {r.receipt_number ?? r.id.slice(0, 8)}
        </span>
      ),
    },
    {
      key: 'po_number',
      header: 'Purchase Order',
      render: (r) => <span>{r.po_number ?? '—'}</span>,
    },
    {
      key: 'received_from_name',
      header: 'Received From',
      render: (r) => <span>{r.received_from_name ?? '—'}</span>,
    },
    {
      key: 'items',
      header: 'Items',
      render: (r) => <span>{r.lines.length}</span>,
    },
    {
      key: 'total',
      header: 'Total',
      render: (r) => (
        <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
          {fmtAmt(r.lines.reduce((s, l) => s + lineTotal(l), 0))} {r.base_currency_code ?? 'IQD'}
        </span>
      ),
    },
    {
      key: 'received_by_name',
      header: 'Received By',
      render: (r) => <span>{r.received_by_name ?? r.received_by_email ?? '—'}</span>,
    },
    {
      key: 'receipt_date',
      header: 'Date',
      render: (r) => <span style={{ color: theme.textMuted }}>{r.receipt_date.slice(0, 10)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <Badge variant={STATUS_VARIANT[r.status] ?? 'neutral'}>{r.status}</Badge>,
    },
  ]

  return (
    <div style={{ ...pagePadding, margin: '0 auto', maxWidth: '1200px' }}>
      <PageHeader
        title="Store In"
        subtitle="Goods received against purchase orders — created automatically when a receipt is recorded"
        actions={
          <Button
            variant="primary"
            onClick={() => {
              setPickerProjectId('')
              setPickerPoId('')
              setPickerOpen(true)
            }}
          >
            Create Manually
          </Button>
        }
      />

      {error && (
        <div
          style={{
            marginTop: '20px',
            padding: '12px 16px',
            borderRadius: '8px',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            fontSize: '13px',
            color: '#991b1b',
          }}
        >
          Couldn't load Store In records: {error.message}
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '16px',
          marginTop: '20px',
        }}
      >
        <KPICard label="Draft" value={draftCount} subtitle="not yet confirmed" iconColor="warning" />
        <KPICard
          label="Confirmed"
          value={confirmedCount}
          subtitle="inventory updated"
          iconColor="success"
        />
      </div>

      <Card style={{ marginTop: '20px', padding: 0 }}>
        <div
          style={{
            padding: '14px 16px',
            borderBottom: `1px solid ${theme.border}`,
            display: 'flex',
            gap: '12px',
            flexWrap: 'wrap',
            alignItems: 'flex-end',
          }}
        >
          <input
            type="text"
            placeholder="Search by receipt #, PO #, received from, or received by…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
            }}
            style={{
              flex: 1,
              minWidth: '240px',
              maxWidth: '360px',
              padding: '8px 12px',
              borderRadius: '6px',
              border: `1px solid ${theme.border}`,
              background: theme.bgCanvas,
              color: theme.textPrimary,
              fontSize: '13px',
            }}
          />
          <div style={{ minWidth: '160px' }}>
            <Select
              label="Status"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value)
              }}
            >
              <option value="">All statuses</option>
              <option value="draft">Draft</option>
              <option value="confirmed">Confirmed</option>
              <option value="cancelled">Cancelled</option>
            </Select>
          </div>
        </div>

        {isAdmin && selectedIds.size > 0 && (
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
            <button
              onClick={() => void handleBulkCancel()}
              disabled={bulkCancelling}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '5px 12px',
                borderRadius: '7px',
                fontSize: '12px',
                fontWeight: 600,
                background: theme.danger,
                color: '#fff',
                border: 'none',
                cursor: bulkCancelling ? 'not-allowed' : 'pointer',
                opacity: bulkCancelling ? 0.6 : 1,
              }}
            >
              {bulkCancelling
                ? 'Cancelling…'
                : `Cancel ${selectedIds.size} draft${selectedIds.size !== 1 ? 's' : ''}`}
            </button>
            <button
              onClick={clearSelection}
              style={{
                marginLeft: 'auto',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '12px',
                color: theme.textMuted,
                textDecoration: 'underline',
              }}
            >
              Clear
            </button>
          </div>
        )}

        <Table<Receipt>
          columns={columns}
          data={filtered}
          loading={loading}
          rowKey="id"
          maxHeight="70vh"
          stickyHeader
          emptyMessage="No Store In records yet — these are created automatically when a receipt is recorded against a purchase order."
          onRowClick={(r) => {
            navigate(`/inventory/store-in/${r.id}`)
          }}
        />
      </Card>

      <Modal
        open={pickerOpen}
        onClose={() => {
          setPickerOpen(false)
        }}
        title="Create Store In"
        size="sm"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setPickerOpen(false)
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!pickerPoId}
              onClick={() => {
                navigate(`/procurement/purchase-orders/${pickerPoId}/receive`)
              }}
            >
              Continue
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ fontSize: '12px', color: theme.textMuted }}>
            Store In records are created by recording a receipt against a purchase order — pick
            the PO below to open its receiving form.
          </div>
          <Select
            label="Project (optional, narrows the PO list)"
            value={pickerProjectId}
            onChange={(e) => {
              setPickerProjectId(e.target.value)
              setPickerPoId('')
            }}
          >
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} — {p.name}
              </option>
            ))}
          </Select>
          <SearchableSelect
            label="Purchase Order"
            value={pickerPoId}
            onChange={(v) => {
              setPickerPoId(v)
            }}
            options={receivablePOs.map((po) => ({
              value: po.id,
              label: po.po_number,
              sublabel: po.vendor_name ?? undefined,
            }))}
            placeholder={posLoading ? 'Loading…' : 'Search PO number or vendor…'}
          />
          {!posLoading && receivablePOs.length === 0 && (
            <div style={{ fontSize: '12px', color: theme.textMuted }}>
              No purchase orders with anything left to receive{pickerProjectId ? ' for this project' : ''}.
              A PO must be approved (or further along) and still have outstanding quantity — one
              that's already fully received or fully covered from stock won't show up here.
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}
