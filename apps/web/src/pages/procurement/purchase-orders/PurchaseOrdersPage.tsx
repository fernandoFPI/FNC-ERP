import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation } from '@apollo/client'
import { useTranslation } from 'react-i18next'
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

const PAGE_SIZE = 200

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

const PRIORITY_KEYS = ['emergency', 'high', 'low'] as const

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
  const { t } = useTranslation()
  const { theme } = useTheme()
  const priorityLabel = (p: string) => t(`po.priority.${p}`, { defaultValue: p })
  const STATUS_OPTIONS = [
    ...ALL_PO_STATUSES.map((s) => ({ value: s.key, label: getPOStatusLabel(s.key) })),
    { value: 'deleted', label: getPOStatusLabel('deleted') },
  ]
  const PRIORITY_OPTIONS = PRIORITY_KEYS.map((p) => ({ value: p, label: priorityLabel(p) }))
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
        message: t('po.list.toast.approvedCount', { count: succeeded }),
      })
    } else {
      addToast({
        type: 'warning',
        message: t('po.list.toast.approvedPartial', { succeeded, failed }),
      })
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
        message: t('po.list.toast.rejectedCount', { count: succeeded }),
      })
    } else {
      addToast({
        type: 'warning',
        message: t('po.list.toast.rejectedPartial', { succeeded, failed }),
      })
    }
  }

  const csvFor = (rows: PurchaseOrder[], filename: string) => {
    const header = [
      t('po.list.csv.poNumber'),
      t('po.list.csv.vendor'),
      t('po.list.csv.project'),
      t('po.list.csv.status'),
      t('po.list.csv.priority'),
      t('po.list.csv.organizer'),
      ...(canSeeTotals ? [t('po.list.csv.totalAmount'), t('po.list.csv.currency')] : []),
      t('po.list.csv.created'),
      t('po.list.csv.expectedDelivery'),
    ]
    const body = rows.map((o) => [
      o.po_number,
      o.vendor_name ?? '',
      o.project_id ? [o.projectCode, o.projectName].filter(Boolean).join(' — ') : '',
      getPOStatusLabel(o.status),
      priorityLabel(o.priority),
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
      addToast({ type: 'success', message: t('po.list.toast.approvedOne', { po: o.po_number }) })
      void refetch()
    } catch (e) {
      addToast({
        type: 'error',
        message: e instanceof Error ? e.message : t('po.list.toast.approveFailed'),
      })
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
        aria-label={t('po.list.selectAll')}
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
          aria-label={t('po.list.selectOne', { po: o.po_number })}
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
      header: t('po.list.col.poNumber'),
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
                  {priorityLabel(o.priority)}
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
      header: t('po.list.col.vendor'),
      render: (o) => (
        <span style={{ color: theme.textPrimary, fontSize: '13px' }}>{o.vendor_name ?? '—'}</span>
      ),
    },
    ...(canSeeTotals
      ? [
          {
            key: 'total_amount',
            header: t('po.list.col.totalAmount'),
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
      header: t('po.list.col.organizer'),
      render: (o) => <PersonCell name={o.organizerName} />,
    },
    {
      key: 'stage',
      header: t('po.list.col.stage'),
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
      header: t('po.list.col.age'),
      render: (o) => (
        <span style={{ fontSize: '13px', color: theme.textSecondary, whiteSpace: 'nowrap' }}>
          {formatAge(o.created_at)}
        </span>
      ),
    },
    {
      key: 'status',
      header: t('po.list.col.status'),
      render: (o) => (
        <div
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '3px' }}
        >
          <Badge variant={getPOStatusVariant(o.status)}>{getPOStatusLabel(o.status)}</Badge>
          {needsInvoice(o) && (
            <span style={{ fontSize: '11px', color: theme.warning, fontWeight: 600 }}>
              ⚠ {t('po.list.needsInvoice')}
            </span>
          )}
        </div>
      ),
    },
    {
      key: '__actions',
      header: t('po.list.col.actions'),
      width: '70px',
      mobileHide: true,
      render: (o) => (
        <RowMenu
          items={[
            {
              label: t('po.list.menu.viewDetails'),
              onClick: () => {
                setPreviewId(o.id)
              },
            },
            {
              label: t('po.list.menu.openFullPage'),
              onClick: () => {
                navigate(`/procurement/purchase-orders/${o.id}`)
              },
            },
            {
              label: t('po.list.menu.copyPoNumber'),
              onClick: () => {
                void navigator.clipboard
                  .writeText(o.po_number)
                  .then(() => {
                    addToast({ type: 'success', message: t('po.list.toast.copied', { po: o.po_number }) })
                  })
                  .catch(() => {
                    addToast({ type: 'error', message: t('po.list.toast.copyFailed') })
                  })
              },
            },
            ...(o.status === 'pending_approval'
              ? [
                  {
                    label: t('po.list.menu.approve'),
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
        title={t('po.list.title')}
        subtitle={t('po.list.subtitle')}
        actions={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                csvFor(filtered, `purchase-orders-${today}.csv`)
              }}
            >
              {t('po.list.exportCsv')}
            </Button>
            <Button
              data-tour="new-po-btn"
              variant="primary"
              size="sm"
              onClick={() => {
                navigate('/procurement/requisitions/new')
              }}
            >
              {t('po.list.newRequisition')}
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
            {t('po.list.filteredByProject')} <strong>{projectNameFilter}</strong>
          </span>
          <button
            style={{
              marginInlineStart: 'auto',
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
            {t('po.list.clearX')}
          </button>
        </div>
      )}

      <KpiRow>
        <KpiTile
          tone="accent"
          icon="doc"
          label={t('po.list.kpi.myQueue')}
          value={queueCount}
          sub={t('po.list.kpi.myQueueSub')}
          trailing={<Icon name="arrowRight" size={16} />}
          onClick={() => {
            navigate('/procurement/queue')
          }}
        />
        <KpiTile
          tone="warning"
          icon="clock"
          label={t('po.list.kpi.pendingApproval')}
          value={pendingApprovalCount}
          sub={t('po.list.kpi.pendingApprovalSub')}
          active={statusFilter === 'pending_approval'}
          onClick={() => {
            setStatusFilter((s) => (s === 'pending_approval' ? '' : 'pending_approval'))
          }}
        />
        <KpiTile
          tone="danger"
          icon="alert"
          label={t('po.list.kpi.needAction')}
          value={needActionCount}
          sub={t('po.list.kpi.needActionSub')}
          active={quickFilter === 'needAction'}
          onClick={() => {
            toggleQuick('needAction')
          }}
        />
        <KpiTile
          tone="info"
          icon="truck"
          label={t('po.list.kpi.delayed')}
          value={delayedCount}
          sub={t('po.list.kpi.delayedSub')}
          active={quickFilter === 'delayed'}
          onClick={() => {
            toggleQuick('delayed')
          }}
        />
        <KpiTile
          tone="success"
          icon="cash"
          label={t('po.list.kpi.openValue')}
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
              ? t('po.list.kpi.totalsRestricted')
              : openValueByCurrency.length > 1
                ? `+ ${openValueByCurrency
                    .slice(1)
                    .map(([c, v]) => formatMoney(v, c))
                    .join(' + ')}`
                : t('po.list.kpi.totalOpenValue')
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
              placeholder={t('po.list.searchPlaceholder')}
            />
            <PillSelect
              label={t('po.list.filter.status')}
              value={statusFilter}
              options={STATUS_OPTIONS}
              onChange={setStatusFilter}
            />
            <PillSelect
              label={t('po.list.filter.organizer')}
              value={buyerFilter}
              options={buyerOptions}
              onChange={setBuyerFilter}
            />
            <PillSelect
              label={t('po.list.filter.vendor')}
              value={vendorFilter}
              options={vendorOptions}
              onChange={setVendorFilter}
            />
            <PillSelect
              label={t('po.list.filter.project')}
              value={projectFilter}
              options={projectOptions}
              onChange={setProjectFilter}
            />
            <MoreFilters activeCount={moreFilterCount}>
              <FilterField label={t('po.list.filter.priority')}>
                <select
                  value={priorityFilter}
                  onChange={(e) => {
                    setPriorityFilter(e.target.value)
                  }}
                  style={dateInputStyle(theme)}
                >
                  <option value="">{t('common.all')}</option>
                  {PRIORITY_OPTIONS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </FilterField>
              <FilterField label={t('po.list.filter.createdFrom')}>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => {
                    setFromDate(e.target.value)
                  }}
                  style={dateInputStyle(theme)}
                />
              </FilterField>
              <FilterField label={t('po.list.filter.createdTo')}>
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
                {t('po.list.filter.onlyMine')}
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
                    textAlign: 'start',
                    padding: 0,
                    fontFamily: 'inherit',
                  }}
                >
                  {t('po.list.filter.clearAll')}
                </button>
              )}
            </MoreFilters>
            <IconButton
              title={t('common.refresh')}
              onClick={() => {
                void refetch()
              }}
            >
              <Icon name="refresh" size={16} />
            </IconButton>
          </div>

          {selectedIds.size > 0 && (
            <SelectionBar
              label={t('po.list.selected', { count: selectedIds.size })}
              onClear={clearSelection}
            >
              <BarButton
                icon="check"
                disabled={approvableRows.length === 0 || bulkApproving}
                onClick={() => void handleBulkApprove()}
              >
                {bulkApproving
                  ? t('po.list.approving')
                  : `${t('po.list.approve')}${approvableRows.length > 0 ? ` (${approvableRows.length})` : ''}`}
              </BarButton>
              <BarButton
                icon="x"
                tone="danger"
                disabled={approvableRows.length === 0}
                onClick={() => {
                  setRejectOpen(true)
                }}
              >
                {t('po.list.reject')}
                {approvableRows.length > 0 ? ` (${approvableRows.length})` : ''}
              </BarButton>
              <BarButton
                icon="download"
                onClick={() => {
                  csvFor(selectedRows, `purchase-orders-selected-${today}.csv`)
                }}
              >
                {t('po.list.export')}
              </BarButton>
            </SelectionBar>
          )}

          <div style={{ marginTop: '14px', flex: 1 }}>
            {!loading && anyFilter && filtered.length === 0 ? (
              // A quick-filter KPI tile or "only mine" toggle can be active
              // without appearing in any of the visible toolbar pills, so an
              // empty result here previously looked like a dead end — this
              // always gives a one-click way out regardless of which filter
              // (visible or not) is the actual cause.
              <div style={{ padding: '56px 16px', textAlign: 'center' }}>
                <div style={{ fontSize: '15px', fontWeight: 600, color: theme.textPrimary }}>
                  {t('po.list.emptyFiltered')}
                </div>
                <button
                  type="button"
                  onClick={clearAllFilters}
                  style={{
                    marginTop: '10px',
                    border: 'none',
                    background: 'none',
                    color: theme.accent,
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {t('po.list.filter.clearAll')}
                </button>
              </div>
            ) : (
              <Table
                columns={columns}
                data={pageRows}
                loading={loading}
                rowKey="id"
                emptyMessage={t('po.list.empty')}
                onRowClick={(o) => {
                  setPreviewId(o.id)
                }}
                getRowStyle={(o) => {
                  const base = o.priority === 'emergency' ? { borderInlineStart: '3px solid #dc2626' } : {}
                  if (o.id === previewId) return { ...base, background: theme.accentBg }
                  return selectedIds.has(o.id) ? { ...base, background: theme.accentBg } : base
                }}
              />
            )}
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
        title={t('po.list.rejectModal.title', { count: approvableRows.length })}
        description={t('po.list.rejectModal.description')}
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
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={rejecting}
              disabled={!rejectReason.trim()}
              onClick={() => void handleBulkReject()}
            >
              {t('po.list.reject')}
            </Button>
          </div>
        }
      >
        <textarea
          value={rejectReason}
          onChange={(e) => {
            setRejectReason(e.target.value)
          }}
          placeholder={t('po.list.rejectModal.placeholder')}
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
