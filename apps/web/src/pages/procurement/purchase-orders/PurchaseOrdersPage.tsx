import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation } from '@apollo/client'
import { PURCHASE_ORDERS_QUERY, APPROVE_PO, REJECT_PO } from '../../../graphql/procurement'
import { useTheme } from '../../../theme/ThemeContext'
import { Card } from '../../../components/ui/Card'
import { Button } from '../../../components/ui/Button'
import { Modal } from '../../../components/ui/Modal'
import type { Column } from '../../../components/ui/Table'
import { Table } from '../../../components/ui/Table'
import { Badge } from '../../../components/ui/Badge'
import {
  ALL_PO_STATUSES,
  CHILD_PO_TERMINAL_STATUSES,
  PO_TERMINAL_STATUSES,
  getPOStatusVariant,
  getPOStatusLabel,
} from '../../../lib/po-constants'
import { miniReached, poStage, PO_STAGES, stageLabel } from '../../../lib/procurementStages'
import { useToastStore } from '../../../store/toastStore'
import { FilterPresets } from '../../../components/ui/FilterPresets'
import { useFilterPresets } from '../../../hooks/useFilterPresets'
import { useEntityChanged } from '../../../hooks/useEntityChanged'
import { useMyQueueCount } from '../../../hooks/useMyQueueCount'
import {
  BarButton,
  DockLayout,
  FilterField,
  Icon,
  IconButton,
  KpiRow,
  KpiTile,
  MoreFilters,
  PageTitle,
  Pagination,
  PersonCell,
  PillSelect,
  RowMenu,
  SearchBox,
  SelectionBar,
  StageMini,
  dateInputStyle,
  formatAge,
  formatMoney,
  isPastDate,
} from '../../../components/procurement/ListKit'
import { POPreviewPanel } from '../../../components/procurement/PreviewPanels'
import type {
  ApprovePoMutation,
  ApprovePoMutationVariables,
  PurchaseOrdersQuery,
  PurchaseOrdersQueryVariables,
  RejectPoMutation,
  RejectPoMutationVariables,
} from '../../../graphql/generated'

// myPOsOnly stored as 'true'/'false' — FilterPreset.filters is a flat
// Record<string, string>, same as every other tracked field here.
const FILTER_DEFAULTS = {
  search: '',
  status: '',
  buyer: '',
  vendor: '',
  project: '',
  priority: '',
  quick: '',
  fromDate: '',
  toDate: '',
  myPOsOnly: 'false',
}

const PAGE_SIZE = 12

const PRIORITY_LABELS: Record<string, string> = { low: 'Low', high: 'High', emergency: 'Emergency' }
const PRIORITY_STYLES: Partial<Record<string, { color: string; bg: string; border: string }>> = {
  high: { color: '#d97706', bg: 'rgba(217,119,6,0.08)', border: 'rgba(217,119,6,0.3)' },
  emergency: { color: '#dc2626', bg: 'rgba(220,38,38,0.08)', border: 'rgba(220,38,38,0.3)' },
}

const OPEN_EXCLUDED = new Set<string>([...PO_TERMINAL_STATUSES, ...CHILD_PO_TERMINAL_STATUSES])

interface PurchaseOrder {
  id: string
  po_number: string
  vendor_name?: string | null
  vendor_id: string | null
  status: string
  priority: string
  total_amount: string
  viewerCanSeeTotals?: boolean | null
  currency_code: string
  created_at: string
  expected_delivery_date?: string | null
  invoice_count: number
  project_id?: string | null
  projectCode?: string | null
  projectName?: string | null
  requisitionNumber?: string | null
  organizerName?: string | null
  itemSearchText?: string | null
}

const STATUS_OPTIONS = [
  ...ALL_PO_STATUSES.map((s) => ({ value: s.key, label: s.label })),
  { value: 'deleted', label: 'Deleted' },
]

const PRIORITY_OPTIONS = [
  { value: 'emergency', label: 'Emergency' },
  { value: 'high', label: 'High' },
  { value: 'low', label: 'Low' },
]

function downloadCSV(rows: string[][], filename: string) {
  const content = rows
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob(['﻿' + content, ''], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const isOpen = (o: PurchaseOrder) => !OPEN_EXCLUDED.has(o.status)
// AP "Needs Invoice": the PO reached invoiced/completed without a vendor invoice on file.
const needsInvoice = (o: PurchaseOrder) =>
  ['invoiced', 'completed', 'closed'].includes(o.status) && o.invoice_count === 0
// "Need Action": something a person should look at — an open emergency PO, or a missing AP invoice.
const needsAction = (o: PurchaseOrder) =>
  (isOpen(o) && o.priority === 'emergency') || needsInvoice(o)
// "Delayed": delivery date passed while the goods haven't been received yet.
const isDelayed = (o: PurchaseOrder) => {
  if (!isOpen(o)) return false
  const idx = poStage(o.status).index
  return idx !== null && idx < 3 && isPastDate(o.expected_delivery_date)
}

export default function PurchaseOrdersPage() {
  const { theme } = useTheme()
  const navigate = useNavigate()
  const addToast = useToastStore((s) => s.addToast)
  const [urlParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [buyerFilter, setBuyerFilter] = useState('')
  const [vendorFilter, setVendorFilter] = useState('')
  const [projectFilter, setProjectFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [quickFilter, setQuickFilter] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [page, setPage] = useState(1)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [bulkApproving, setBulkApproving] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [rejecting, setRejecting] = useState(false)
  // Defaults to the full company list — a hardcoded "my own POs" default
  // left anyone who isn't personally the organizer of anything looking at
  // an empty page with no obvious explanation. A "My Purchase Orders"
  // preset (seeded below) gives back that convenience as an explicit,
  // visible choice instead.
  const [myPOsOnly, setMyPOsOnly] = useState(false)

  const projectIdFilter = urlParams.get('project_id') ?? ''
  const projectNameFilter = urlParams.get('project_name') ?? ''

  const { data, loading, refetch } = useQuery<PurchaseOrdersQuery, PurchaseOrdersQueryVariables>(
    PURCHASE_ORDERS_QUERY,
    {
      variables: {
        projectId: projectIdFilter || undefined,
        myPOsOnly: myPOsOnly || undefined,
      },
      fetchPolicy: 'cache-and-network',
    },
  )
  useEntityChanged('purchase_order', () => void refetch())
  const queueCount = useMyQueueCount()

  const [approvePOMutation] = useMutation<ApprovePoMutation, ApprovePoMutationVariables>(APPROVE_PO)
  const [rejectPOMutation] = useMutation<RejectPoMutation, RejectPoMutationVariables>(REJECT_PO)

  const currentFilters = {
    search,
    status: statusFilter,
    buyer: buyerFilter,
    vendor: vendorFilter,
    project: projectFilter,
    priority: priorityFilter,
    quick: quickFilter,
    fromDate,
    toDate,
    myPOsOnly: String(myPOsOnly),
  }
  const { presets, savePreset, deletePreset, resolvePreset } = useFilterPresets(
    'purchase_orders',
    FILTER_DEFAULTS,
    { name: 'My Purchase Orders', filters: { ...FILTER_DEFAULTS, myPOsOnly: 'true' } },
  )

  const orders: PurchaseOrder[] = useMemo(
    () => (data?.purchaseOrders ?? []).filter((x): x is NonNullable<typeof x> => x !== null),
    [data],
  )
  // Server-computed (see purchaseOrders resolver) — admin/finance only.
  // Every row carries the same value for a given viewer, so any row will do.
  const canSeeTotals = orders[0]?.viewerCanSeeTotals ?? false

  const filtered = useMemo(
    () =>
      orders.filter((o) => {
        if (statusFilter && o.status !== statusFilter) return false
        if (buyerFilter && (o.organizerName ?? '') !== buyerFilter) return false
        if (vendorFilter && (o.vendor_id ?? '') !== vendorFilter) return false
        if (projectFilter && (o.project_id ?? '') !== projectFilter) return false
        if (priorityFilter && o.priority !== priorityFilter) return false
        if (quickFilter === 'needAction' && !needsAction(o)) return false
        if (quickFilter === 'delayed' && !isDelayed(o)) return false
        if (search) {
          const q = search.toLowerCase()
          if (
            !o.po_number.toLowerCase().includes(q) &&
            !(o.vendor_name ?? '').toLowerCase().includes(q) &&
            !(o.organizerName ?? '').toLowerCase().includes(q) &&
            !(o.requisitionNumber ?? '').toLowerCase().includes(q) &&
            !(o.projectCode ?? '').toLowerCase().includes(q) &&
            !(o.projectName ?? '').toLowerCase().includes(q) &&
            !(o.itemSearchText ?? '').toLowerCase().includes(q)
          )
            return false
        }
        if (fromDate && o.created_at < fromDate) return false
        if (toDate && o.created_at > toDate + 'T23:59:59') return false
        return true
      }),
    [
      orders,
      statusFilter,
      buyerFilter,
      vendorFilter,
      projectFilter,
      priorityFilter,
      quickFilter,
      search,
      fromDate,
      toDate,
    ],
  )

  // Back to page 1 whenever the filtered set changes shape.
  useEffect(() => {
    setPage(1)
  }, [
    statusFilter,
    buyerFilter,
    vendorFilter,
    projectFilter,
    priorityFilter,
    quickFilter,
    search,
    fromDate,
    toDate,
    myPOsOnly,
  ])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  // ── KPIs (always over the full list so they don't shift as filters change) ──
  const openOrders = orders.filter(isOpen)
  const pendingApprovalCount = orders.filter((o) => o.status === 'pending_approval').length
  const needActionCount = orders.filter(needsAction).length
  const delayedCount = orders.filter(isDelayed).length
  // Per currency — never summed across currencies (no-conversion policy).
  const openValueByCurrency = useMemo(() => {
    const m = new Map<string, number>()
    for (const o of openOrders) {
      const v = parseFloat(o.total_amount)
      if (!Number.isNaN(v) && v > 0) m.set(o.currency_code, (m.get(o.currency_code) ?? 0) + v)
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [openOrders])

  // ── Filter option lists ──
  const buyerOptions = useMemo(
    () =>
      [...new Set(orders.map((o) => o.organizerName).filter((n): n is string => !!n))]
        .sort()
        .map((n) => ({ value: n, label: n })),
    [orders],
  )
  const vendorOptions = useMemo(() => {
    const m = new Map<string, string>()
    for (const o of orders) if (o.vendor_id && o.vendor_name) m.set(o.vendor_id, o.vendor_name)
    return [...m.entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([v, l]) => ({ value: v, label: l }))
  }, [orders])
  const projectOptions = useMemo(() => {
    const m = new Map<string, string>()
    for (const o of orders)
      if (o.project_id)
        m.set(o.project_id, [o.projectCode, o.projectName].filter(Boolean).join(' — '))
    return [...m.entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([v, l]) => ({ value: v, label: l }))
  }, [orders])

  const moreFilterCount =
    (priorityFilter ? 1 : 0) +
    (fromDate ? 1 : 0) +
    (toDate ? 1 : 0) +
    (myPOsOnly ? 1 : 0) +
    (quickFilter ? 1 : 0)

  const clearAllFilters = () => {
    setSearch('')
    setStatusFilter('')
    setBuyerFilter('')
    setVendorFilter('')
    setProjectFilter('')
    setPriorityFilter('')
    setQuickFilter('')
    setFromDate('')
    setToDate('')
    setMyPOsOnly(false)
  }
  const anyFilter =
    !!(search || statusFilter || buyerFilter || vendorFilter || projectFilter) ||
    moreFilterCount > 0

  // ── Selection helpers ──
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
    setSelectedIds(allSelected ? new Set() : new Set(filteredIds))
  }
  const clearSelection = () => {
    setSelectedIds(new Set())
  }

  // ── Bulk actions ──
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

  const handleBulkReject = async () => {
    const reason = rejectReason.trim()
    if (!reason || approvableRows.length === 0) return
    setRejecting(true)
    const results = await Promise.allSettled(
      approvableRows.map((o) =>
        rejectPOMutation({ variables: { id: o.id, reason, lineFlags: [] } }),
      ),
    )
    const succeeded = results.filter((r) => r.status === 'fulfilled').length
    const failed = results.filter((r) => r.status === 'rejected').length
    setRejecting(false)
    setRejectOpen(false)
    setRejectReason('')
    clearSelection()
    void refetch()
    if (failed === 0) {
      addToast({
        type: 'success',
        message: `${succeeded} PO${succeeded !== 1 ? 's' : ''} rejected`,
      })
    } else {
      addToast({ type: 'warning', message: `${succeeded} rejected, ${failed} failed` })
    }
  }

  const csvFor = (rows: PurchaseOrder[], filename: string) => {
    const header = [
      'PO Number',
      'Vendor',
      'Project',
      'Status',
      'Priority',
      'Organizer',
      ...(canSeeTotals ? ['Total Amount', 'Currency'] : []),
      'Created',
      'Expected Delivery',
    ]
    const body = rows.map((o) => [
      o.po_number,
      o.vendor_name ?? '',
      o.project_id ? [o.projectCode, o.projectName].filter(Boolean).join(' — ') : '',
      getPOStatusLabel(o.status),
      PRIORITY_LABELS[o.priority] ?? o.priority,
      o.organizerName ?? '',
      ...(canSeeTotals ? [o.total_amount, o.currency_code] : []),
      o.created_at.slice(0, 10),
      o.expected_delivery_date ?? '',
    ])
    downloadCSV([header, ...body], filename)
  }
  const today = new Date().toISOString().slice(0, 10)

  const approveOne = async (o: PurchaseOrder) => {
    try {
      await approvePOMutation({ variables: { id: o.id } })
      addToast({ type: 'success', message: `${o.po_number} approved` })
      void refetch()
    } catch (e) {
      addToast({ type: 'error', message: e instanceof Error ? e.message : 'Could not approve' })
    }
  }

  // ── Columns ──
  const checkboxCol: Column<PurchaseOrder> = {
    key: '__select',
    header: '',
    width: '40px',
    mobileHide: true,
    renderHeader: () => (
      <input
        type="checkbox"
        aria-label="Select all"
        checked={allSelected}
        ref={(el) => {
          if (el) el.indeterminate = someSelected && !allSelected
        }}
        onChange={toggleSelectAll}
        style={{ cursor: 'pointer', width: '16px', height: '16px', accentColor: theme.accent }}
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
          aria-label={`Select ${o.po_number}`}
          checked={selectedIds.has(o.id)}
          onChange={() => {
            toggleSelect(o.id)
          }}
          style={{ cursor: 'pointer', width: '16px', height: '16px', accentColor: theme.accent }}
        />
      </div>
    ),
  }

  const dataColumns: Column<PurchaseOrder>[] = [
    {
      key: 'po_number',
      header: 'PO #',
      mobilePrimary: true,
      render: (o) => {
        const ps = PRIORITY_STYLES[o.priority]
        return (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontWeight: 600, color: theme.accent, fontSize: '13px' }}>
                {o.po_number}
              </span>
              {ps && (
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    color: ps.color,
                    background: ps.bg,
                    border: `1px solid ${ps.border}`,
                    borderRadius: '4px',
                    padding: '0 5px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  {PRIORITY_LABELS[o.priority]}
                </span>
              )}
            </div>
            {o.requisitionNumber && (
              <div style={{ fontSize: '11px', color: theme.textMuted }}>{o.requisitionNumber}</div>
            )}
          </div>
        )
      },
    },
    {
      key: 'vendor_name',
      header: 'Vendor',
      render: (o) => (
        <span style={{ color: theme.textPrimary, fontSize: '13px' }}>{o.vendor_name ?? '—'}</span>
      ),
    },
    ...(canSeeTotals
      ? [
          {
            key: 'total_amount',
            header: 'Total Amount',
            render: (o: PurchaseOrder) => (
              <span style={{ fontSize: '13px', color: theme.textPrimary, whiteSpace: 'nowrap' }}>
                {formatMoney(parseFloat(o.total_amount) || 0, o.currency_code)}
              </span>
            ),
          },
        ]
      : []),
    {
      key: 'organizerName',
      header: 'Organizer',
      render: (o) => <PersonCell name={o.organizerName} />,
    },
    {
      key: 'stage',
      header: 'Stage',
      render: (o) => {
        const st = poStage(o.status)
        return (
          <StageMini
            total={4}
            reached={miniReached(st, PO_STAGES.length)}
            label={stageLabel(st, PO_STAGES)}
          />
        )
      },
    },
    {
      key: 'age',
      header: 'Age',
      render: (o) => (
        <span style={{ fontSize: '13px', color: theme.textSecondary, whiteSpace: 'nowrap' }}>
          {formatAge(o.created_at)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (o) => (
        <div
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '3px' }}
        >
          <Badge variant={getPOStatusVariant(o.status)}>{getPOStatusLabel(o.status)}</Badge>
          {needsInvoice(o) && (
            <span style={{ fontSize: '11px', color: theme.warning, fontWeight: 600 }}>
              ⚠ Needs invoice
            </span>
          )}
        </div>
      ),
    },
    {
      key: '__actions',
      header: 'Actions',
      width: '70px',
      mobileHide: true,
      render: (o) => (
        <RowMenu
          items={[
            {
              label: 'View details',
              onClick: () => {
                setPreviewId(o.id)
              },
            },
            {
              label: 'Open full page',
              onClick: () => {
                navigate(`/procurement/purchase-orders/${o.id}`)
              },
            },
            {
              label: 'Copy PO number',
              onClick: () => {
                void navigator.clipboard
                  .writeText(o.po_number)
                  .then(() => {
                    addToast({ type: 'success', message: `${o.po_number} copied` })
                  })
                  .catch(() => {
                    addToast({ type: 'error', message: 'Could not copy' })
                  })
              },
            },
            ...(o.status === 'pending_approval'
              ? [
                  {
                    label: 'Approve',
                    onClick: () => {
                      void approveOne(o)
                    },
                  },
                ]
              : []),
          ]}
        />
      ),
    },
  ]

  const columns = [checkboxCol, ...dataColumns]
  const previewRow = previewId ? orders.find((o) => o.id === previewId) : undefined

  const toggleQuick = (k: string) => {
    setQuickFilter((q) => (q === k ? '' : k))
  }

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '2400px' }}>
      <PageTitle
        icon="cart"
        title="Purchase Orders"
        subtitle="Manage and track all purchase orders across the system."
        actions={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                csvFor(filtered, `purchase-orders-${today}.csv`)
              }}
            >
              Export CSV
            </Button>
            <Button
              data-tour="new-po-btn"
              variant="primary"
              size="sm"
              onClick={() => {
                navigate('/procurement/requisitions/new')
              }}
            >
              New Requisition
            </Button>
          </>
        }
      />

      {projectNameFilter && (
        <div
          style={{
            marginBottom: '16px',
            padding: '8px 12px',
            background: theme.accentBg,
            border: `1px solid ${theme.accentBorder}`,
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '13px',
            color: theme.textPrimary,
          }}
        >
          <span>
            Filtered by project: <strong>{projectNameFilter}</strong>
          </span>
          <button
            style={{
              marginLeft: 'auto',
              color: theme.textMuted,
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

      <KpiRow>
        <KpiTile
          tone="accent"
          icon="doc"
          label="My Queue"
          value={queueCount}
          sub="Actions required"
          trailing={<Icon name="arrowRight" size={16} />}
          onClick={() => {
            navigate('/procurement/queue')
          }}
        />
        <KpiTile
          tone="warning"
          icon="clock"
          label="Pending Approval"
          value={pendingApprovalCount}
          sub="Awaiting approval"
          active={statusFilter === 'pending_approval'}
          onClick={() => {
            setStatusFilter((s) => (s === 'pending_approval' ? '' : 'pending_approval'))
          }}
        />
        <KpiTile
          tone="danger"
          icon="alert"
          label="Need Action"
          value={needActionCount}
          sub="Requires attention"
          active={quickFilter === 'needAction'}
          onClick={() => {
            toggleQuick('needAction')
          }}
        />
        <KpiTile
          tone="info"
          icon="truck"
          label="Delayed"
          value={delayedCount}
          sub="Overdue / delayed"
          active={quickFilter === 'delayed'}
          onClick={() => {
            toggleQuick('delayed')
          }}
        />
        <KpiTile
          tone="success"
          icon="cash"
          label="Open Value"
          loading={loading && orders.length === 0}
          value={
            !canSeeTotals
              ? '—'
              : openValueByCurrency.length === 0
                ? '0'
                : formatMoney(openValueByCurrency[0][1], openValueByCurrency[0][0])
          }
          sub={
            !canSeeTotals
              ? 'Totals are restricted'
              : openValueByCurrency.length > 1
                ? `+ ${openValueByCurrency
                    .slice(1)
                    .map(([c, v]) => formatMoney(v, c))
                    .join(' + ')}`
                : 'Total open PO value'
          }
        />
      </KpiRow>

      <DockLayout
        panel={
          previewRow ? (
            <POPreviewPanel
              row={{
                id: previewRow.id,
                po_number: previewRow.po_number,
                status: previewRow.status,
                statusLabel: getPOStatusLabel(previewRow.status),
                statusVariant: getPOStatusVariant(previewRow.status),
                requisitionNumber: previewRow.requisitionNumber,
                organizerName: previewRow.organizerName,
                created_at: previewRow.created_at,
              }}
              canSeeTotals={canSeeTotals}
              onClose={() => {
                setPreviewId(null)
              }}
            />
          ) : null
        }
        onClosePanel={() => {
          setPreviewId(null)
        }}
      >
        <Card
          padding="md"
          style={{ borderRadius: '14px', flex: 1, display: 'flex', flexDirection: 'column' }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
            <SearchBox
              value={search}
              onChange={setSearch}
              placeholder="Search PO #, vendor, project, item, organizer…"
            />
            <PillSelect
              label="Status"
              value={statusFilter}
              options={STATUS_OPTIONS}
              onChange={setStatusFilter}
            />
            <PillSelect
              label="Organizer"
              value={buyerFilter}
              options={buyerOptions}
              onChange={setBuyerFilter}
            />
            <PillSelect
              label="Vendor"
              value={vendorFilter}
              options={vendorOptions}
              onChange={setVendorFilter}
            />
            <PillSelect
              label="Project"
              value={projectFilter}
              options={projectOptions}
              onChange={setProjectFilter}
            />
            <MoreFilters activeCount={moreFilterCount}>
              <FilterField label="Priority">
                <select
                  value={priorityFilter}
                  onChange={(e) => {
                    setPriorityFilter(e.target.value)
                  }}
                  style={dateInputStyle(theme)}
                >
                  <option value="">All</option>
                  {PRIORITY_OPTIONS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </FilterField>
              <FilterField label="Created from">
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => {
                    setFromDate(e.target.value)
                  }}
                  style={dateInputStyle(theme)}
                />
              </FilterField>
              <FilterField label="Created to">
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => {
                    setToDate(e.target.value)
                  }}
                  style={dateInputStyle(theme)}
                />
              </FilterField>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '13px',
                  color: theme.textPrimary,
                }}
              >
                <input
                  type="checkbox"
                  checked={myPOsOnly}
                  onChange={(e) => {
                    setMyPOsOnly(e.target.checked)
                  }}
                  style={{ accentColor: theme.accent }}
                />
                Only POs I organized
              </label>
              <FilterPresets
                presets={presets}
                onApply={(preset) => {
                  const r = resolvePreset(preset)
                  setSearch(r.search)
                  setStatusFilter(r.status)
                  setBuyerFilter(r.buyer)
                  setVendorFilter(r.vendor)
                  setProjectFilter(r.project)
                  setPriorityFilter(r.priority)
                  setQuickFilter(r.quick)
                  setFromDate(r.fromDate)
                  setToDate(r.toDate)
                  setMyPOsOnly(r.myPOsOnly === 'true')
                }}
                onSave={(name) => {
                  savePreset(name, currentFilters)
                }}
                onDelete={deletePreset}
              />
              {anyFilter && (
                <button
                  type="button"
                  onClick={clearAllFilters}
                  style={{
                    border: 'none',
                    background: 'none',
                    color: theme.accent,
                    fontSize: '13px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    padding: 0,
                    fontFamily: 'inherit',
                  }}
                >
                  Clear all filters
                </button>
              )}
            </MoreFilters>
            <IconButton
              title="Refresh"
              onClick={() => {
                void refetch()
              }}
            >
              <Icon name="refresh" size={16} />
            </IconButton>
          </div>

          {selectedIds.size > 0 && (
            <SelectionBar
              label={`${selectedIds.size} order${selectedIds.size !== 1 ? 's' : ''} selected`}
              onClear={clearSelection}
            >
              <BarButton
                icon="check"
                disabled={approvableRows.length === 0 || bulkApproving}
                onClick={() => void handleBulkApprove()}
              >
                {bulkApproving
                  ? 'Approving…'
                  : `Approve${approvableRows.length > 0 ? ` (${approvableRows.length})` : ''}`}
              </BarButton>
              <BarButton
                icon="x"
                tone="danger"
                disabled={approvableRows.length === 0}
                onClick={() => {
                  setRejectOpen(true)
                }}
              >
                Reject{approvableRows.length > 0 ? ` (${approvableRows.length})` : ''}
              </BarButton>
              <BarButton
                icon="download"
                onClick={() => {
                  csvFor(selectedRows, `purchase-orders-selected-${today}.csv`)
                }}
              >
                Export
              </BarButton>
            </SelectionBar>
          )}

          <div style={{ marginTop: '14px', flex: 1 }}>
            <Table
              columns={columns}
              data={pageRows}
              loading={loading}
              rowKey="id"
              emptyMessage={
                anyFilter ? 'No purchase orders match these filters.' : 'No purchase orders yet.'
              }
              onRowClick={(o) => {
                setPreviewId(o.id)
              }}
              getRowStyle={(o) => {
                const base = o.priority === 'emergency' ? { borderLeft: '3px solid #dc2626' } : {}
                if (o.id === previewId) return { ...base, background: theme.accentBg }
                return selectedIds.has(o.id) ? { ...base, background: theme.accentBg } : base
              }}
            />
          </div>
          <Pagination
            page={safePage}
            pageSize={PAGE_SIZE}
            total={filtered.length}
            onChange={setPage}
          />
        </Card>
      </DockLayout>

      <Modal
        open={rejectOpen}
        onClose={() => {
          if (!rejecting) setRejectOpen(false)
        }}
        title={`Reject ${approvableRows.length} purchase order${approvableRows.length !== 1 ? 's' : ''}`}
        description="Only POs awaiting approval can be rejected. The reason is recorded on each PO."
        footer={
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <Button
              variant="ghost"
              size="sm"
              disabled={rejecting}
              onClick={() => {
                setRejectOpen(false)
              }}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={rejecting}
              disabled={!rejectReason.trim()}
              onClick={() => void handleBulkReject()}
            >
              Reject
            </Button>
          </div>
        }
      >
        <textarea
          value={rejectReason}
          onChange={(e) => {
            setRejectReason(e.target.value)
          }}
          placeholder="Reason for rejection (required)"
          rows={4}
          style={{
            width: '100%',
            padding: '10px 12px',
            borderRadius: '8px',
            border: `1px solid ${theme.borderInput}`,
            background: theme.bgSurface,
            color: theme.textPrimary,
            fontSize: '13px',
            fontFamily: 'inherit',
            resize: 'vertical',
            boxSizing: 'border-box',
          }}
        />
      </Modal>
    </div>
  )
}
