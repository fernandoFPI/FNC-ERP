import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@apollo/client'
import {
  MATERIAL_ISSUES_QUERY,
  CREATE_MATERIAL_ISSUE,
  ADD_MATERIAL_ISSUE_LINE,
  DELETE_MATERIAL_ISSUE_LINE,
  ISSUE_MATERIAL_ISSUE,
  CANCEL_MATERIAL_ISSUE,
  PROJECTS_QUERY,
} from '../../../graphql/projects'
import { PURCHASE_ORDERS_QUERY } from '../../../graphql/procurement'
import { PRODUCTS_QUERY, STOCK_LOCATIONS_QUERY } from '../../../graphql/inventory'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Button } from '../../../components/ui/Button'
import { Badge } from '../../../components/ui/Badge'
import { Modal } from '../../../components/ui/Modal'
import { Card } from '../../../components/ui/Card'
import { KPICard } from '../../../components/ui/KPICard'
import { Input } from '../../../components/ui/Input'
import { Select } from '../../../components/ui/Select'
import { SearchableSelect } from '../../../components/ui/SearchableSelect'
import { Textarea } from '../../../components/ui/Textarea'
import { Table } from '../../../components/ui/Table'
import type { Column } from '../../../components/ui/Table'
import { EmptyState } from '../../../components/ui/EmptyState'
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog'
import { useToastStore } from '../../../store/toastStore'
import { useTheme } from '../../../theme/ThemeContext'

interface MILine {
  id: string
  productId: string
  productName: string | null
  poLineId: string | null
  qtyIssued: number
  unitCost: number
  totalCost: number
  isInvoiced: boolean
}
interface MI {
  id: string
  issueNumber: string
  issueDate: string
  status: string
  notes: string | null
  poId: string | null
  poNumber: string | null
  projectCode: string | null
  projectName: string | null
  issuedByName: string | null
  createdAt: string
  lines: MILine[]
}
interface Product {
  id: string
  name: string
  name_ar?: string | null
  sku: string
  average_cost: number | null
  uom: string | null
}
interface PendingLine {
  key: number
  productId: string
  productName: string
  sku: string
  qty: string
  unitCost: string
  fromLocationId: string
}

const STATUS_VARIANT: Record<string, 'neutral' | 'warning' | 'success' | 'danger'> = {
  draft: 'warning',
  issued: 'success',
  cancelled: 'danger',
}

const fmtAmt = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function StoreOutPage() {
  const { theme } = useTheme()
  const navigate = useNavigate()
  const addToast = useToastStore((s) => s.addToast)

  // Filters
  const [statusFilter, setStatusFilter] = useState('')
  const [projectFilter, setProjectFilter] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Confirm dialogs
  const [confirmIssue, setConfirmIssue] = useState<string | null>(null)
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null)

  // New store-out modal — header fields
  const [showModal, setShowModal] = useState(false)
  const [formDate, setFormDate] = useState(new Date().toISOString().slice(0, 10))
  const [formNotes, setFormNotes] = useState('')
  const [formProjectId, setFormProjectId] = useState('')
  const [formPoId, setFormPoId] = useState('')

  // Pending lines in creation modal
  const [pendingLines, setPendingLines] = useState<PendingLine[]>([])
  const pendingKey = useRef(0)
  const [newProductId, setNewProductId] = useState('')
  const [newQty, setNewQty] = useState('')
  const [newUnit, setNewUnit] = useState('')
  const [newFromLocationId, setNewFromLocationId] = useState('')

  // Add-line state for existing drafts
  const [draftProductId, setDraftProductId] = useState('')
  const [draftQty, setDraftQty] = useState('')
  const [draftUnit, setDraftUnit] = useState('')
  const [draftFromLocationId, setDraftFromLocationId] = useState('')

  // Queries
  const { data, loading, refetch } = useQuery(MATERIAL_ISSUES_QUERY, {
    variables: {
      ...(projectFilter ? { projectId: projectFilter } : {}),
      ...(statusFilter ? { status: statusFilter } : {}),
    },
    fetchPolicy: 'cache-and-network',
  })
  const { data: projectsData } = useQuery(PROJECTS_QUERY, {
    variables: { limit: 200 },
    fetchPolicy: 'cache-and-network',
  })
  const { data: poData } = useQuery(PURCHASE_ORDERS_QUERY, {
    variables: { projectId: formProjectId },
    skip: !formProjectId,
    fetchPolicy: 'cache-and-network',
  })
  const { data: productsData } = useQuery(PRODUCTS_QUERY, {
    fetchPolicy: 'cache-and-network',
  })
  const { data: locationsData } = useQuery(STOCK_LOCATIONS_QUERY, { variables: { isActive: true } })

  const issues = (data?.materialIssues ?? []) as MI[]
  const projects = (projectsData?.projects?.data ?? []) as {
    id: string
    code: string
    name: string
  }[]
  const products = (productsData?.products ?? []) as Product[]
  const locations = (locationsData?.stockLocations ?? []) as {
    id: string
    name: string
    code?: string
  }[]
  interface POOption {
    id: string
    po_number: string
    vendor_name: string
    status: string
  }
  const projectPOs = (poData?.purchaseOrders ?? []) as POOption[]

  // Options for SearchableSelect / Select
  const projectOptions = projects.map((p) => ({ value: p.id, label: p.name, sublabel: p.code }))
  const productOptions = products.map((p) => ({
    value: p.id,
    label: p.name,
    sublabel: p.name_ar ? `${p.sku} · ${p.name_ar}` : p.sku,
  }))
  const locationOptions = [
    { value: '', label: 'Default warehouse' },
    ...locations.map((l) => ({ value: l.id, label: l.code ? `${l.name} (${l.code})` : l.name })),
  ]
  const poOptions = [
    { value: '', label: 'No PO link' },
    ...projectPOs.map((po) => ({
      value: po.id,
      label: po.vendor_name || po.po_number,
      sublabel: po.po_number,
    })),
  ]
  const statusFilterOptions = [
    { value: 'draft', label: 'Draft' },
    { value: 'issued', label: 'Issued' },
    { value: 'cancelled', label: 'Cancelled' },
  ]

  // Mutations
  const [createIssue, { loading: creating }] = useMutation(CREATE_MATERIAL_ISSUE)
  const [addLine, { loading: addingLine }] = useMutation(ADD_MATERIAL_ISSUE_LINE, {
    onCompleted: () => {
      addToast({ type: 'success', message: 'Item added' })
      setDraftProductId('')
      setDraftQty('')
      setDraftUnit('')
      setDraftFromLocationId('')
      void refetch()
    },
    onError: (e) => {
      addToast({ type: 'error', message: e.message })
    },
  })
  const [deleteLine] = useMutation(DELETE_MATERIAL_ISSUE_LINE, {
    onCompleted: () => void refetch(),
    onError: (e) => {
      addToast({ type: 'error', message: e.message })
    },
  })
  const [issueMI, { loading: issuing }] = useMutation(ISSUE_MATERIAL_ISSUE, {
    onCompleted: () => {
      addToast({ type: 'success', message: 'Store-out issued — cost committed to project' })
      setConfirmIssue(null)
      void refetch()
    },
    onError: (e) => {
      addToast({ type: 'error', message: e.message })
      setConfirmIssue(null)
    },
  })
  const [cancelMI, { loading: cancelling }] = useMutation(CANCEL_MATERIAL_ISSUE, {
    onCompleted: () => {
      addToast({ type: 'success', message: 'Store-out cancelled' })
      setConfirmCancel(null)
      void refetch()
    },
    onError: (e) => {
      addToast({ type: 'error', message: e.message })
      setConfirmCancel(null)
    },
  })

  function resetModal() {
    setShowModal(false)
    setFormDate(new Date().toISOString().slice(0, 10))
    setFormNotes('')
    setFormProjectId('')
    setFormPoId('')
    setPendingLines([])
    setNewProductId('')
    setNewQty('')
    setNewUnit('')
    setNewFromLocationId('')
  }

  function addPendingLine() {
    const prod = products.find((p) => p.id === newProductId)
    if (!prod || !newQty || !newUnit) return
    setPendingLines((prev) => [
      ...prev,
      {
        key: ++pendingKey.current,
        productId: prod.id,
        productName: prod.name,
        sku: prod.sku,
        qty: newQty,
        unitCost: newUnit,
        fromLocationId: newFromLocationId,
      },
    ])
    setNewProductId('')
    setNewQty('')
    setNewUnit('')
    setNewFromLocationId('')
  }

  async function handleCreate() {
    if (!formProjectId || !formDate || pendingLines.length === 0) return
    try {
      const res = await createIssue({
        variables: {
          projectId: formProjectId,
          poId: formPoId || null,
          issueDate: formDate,
          notes: formNotes || null,
        },
      })
      const issueId: string = res.data?.createMaterialIssue?.id
      if (!issueId) throw new Error('No issue ID returned')
      for (const line of pendingLines) {
        await addLine({
          variables: {
            issueId,
            productId: line.productId,
            qtyIssued: parseFloat(line.qty),
            unitCost: parseFloat(line.unitCost),
            fromLocationId: line.fromLocationId || undefined,
          },
        }).catch((e: Error) => {
          addToast({ type: 'error', message: `"${line.productName}": ${e.message}` })
        })
      }
      addToast({
        type: 'success',
        message: `Store-out created with ${pendingLines.length} item(s)`,
      })
      resetModal()
      void refetch()
    } catch (e: unknown) {
      addToast({
        type: 'error',
        message: e instanceof Error ? e.message : 'Failed to create store-out',
      })
    }
  }

  // KPI values
  const draftCount = issues.filter((i) => i.status === 'draft').length
  const issuedCount = issues.filter((i) => i.status === 'issued').length
  const totalValue = issues
    .filter((i) => i.status === 'issued')
    .reduce((sum, i) => sum + i.lines.reduce((s, l) => s + l.totalCost, 0), 0)

  // Pending lines total
  const pendingTotal = pendingLines.reduce(
    (s, l) => s + (parseFloat(l.qty) || 0) * (parseFloat(l.unitCost) || 0),
    0,
  )

  // Table columns for existing issue lines (read + delete)
  function linesColumns(isDraft: boolean, issueId: string): Column<MILine>[] {
    return [
      {
        key: 'productName',
        header: 'Item',
        render: (row) => (
          <span style={{ color: theme.textPrimary, fontWeight: 500 }}>
            {row.productName ?? row.productId}
          </span>
        ),
      },
      {
        key: 'qtyIssued',
        header: 'Qty',
        width: '80px',
        render: (row) => (
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{row.qtyIssued}</span>
        ),
      },
      {
        key: 'unitCost',
        header: 'Unit Cost (IQD)',
        width: '130px',
        render: (row) => (
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtAmt(row.unitCost)}</span>
        ),
      },
      {
        key: 'totalCost',
        header: 'Total',
        width: '130px',
        render: (row) => (
          <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
            {fmtAmt(row.totalCost)}
          </span>
        ),
      },
      ...(isDraft
        ? [
            {
              key: '_del',
              header: '',
              width: '36px',
              render: (row: MILine) => (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    void deleteLine({ variables: { id: row.id, issueId } })
                  }}
                  title="Remove"
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: theme.textMuted,
                    display: 'flex',
                    alignItems: 'center',
                    padding: '4px',
                  }}
                >
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              ),
            },
          ]
        : []),
    ]
  }

  // Pending lines columns (in modal)
  const pendingColumns: Column<PendingLine>[] = [
    {
      key: 'productName',
      header: 'Item',
      render: (row) => (
        <div>
          <div style={{ color: theme.textPrimary, fontWeight: 500 }}>{row.productName}</div>
          <div style={{ fontSize: '11px', color: theme.textMuted }}>{row.sku}</div>
        </div>
      ),
    },
    {
      key: 'qty',
      header: 'Qty',
      width: '70px',
      render: (row) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{row.qty}</span>,
    },
    {
      key: 'unitCost',
      header: 'Unit Cost',
      width: '110px',
      render: (row) => (
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
          {fmtAmt(parseFloat(row.unitCost) || 0)}
        </span>
      ),
    },
    {
      key: '_total',
      header: 'Total',
      width: '110px',
      render: (row) => (
        <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
          {fmtAmt((parseFloat(row.qty) || 0) * (parseFloat(row.unitCost) || 0))}
        </span>
      ),
    },
    {
      key: '_del',
      header: '',
      width: '36px',
      render: (row) => (
        <button
          onClick={() => {
            setPendingLines((prev) => prev.filter((l) => l.key !== row.key))
          }}
          title="Remove"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: theme.textMuted,
            display: 'flex',
            alignItems: 'center',
            padding: '4px',
          }}
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      ),
    },
  ]

  const IconBox = (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    </svg>
  )
  const IconCheck = (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
  const IconCurrency = (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  )

  return (
    <div style={{ padding: '24px', maxWidth: '1200px' }}>
      <PageHeader
        title="Store Out"
        subtitle="Record inventory items issued to projects"
        actions={
          <Button
            variant="primary"
            onClick={() => {
              setShowModal(true)
            }}
          >
            + New Store Out
          </Button>
        }
      />

      {/* KPI row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '16px',
          marginBottom: '24px',
        }}
      >
        <KPICard
          label="Draft"
          value={draftCount}
          subtitle="pending issue"
          icon={IconBox}
          iconColor="warning"
        />
        <KPICard
          label="Issued"
          value={issuedCount}
          subtitle="cost committed"
          icon={IconCheck}
          iconColor="success"
        />
        <KPICard
          label="Total Issued Value"
          value={`${fmtAmt(totalValue)} IQD`}
          subtitle="all time"
          icon={IconCurrency}
          iconColor="accent"
        />
      </div>

      {/* Filters */}
      <div
        style={{
          display: 'flex',
          gap: '12px',
          marginBottom: '20px',
          alignItems: 'flex-end',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ minWidth: '160px' }}>
          <Select
            label="Status"
            value={statusFilter}
            options={statusFilterOptions}
            placeholder="All Statuses"
            onChange={(e) => {
              setStatusFilter(e.target.value)
            }}
          />
        </div>
        <div style={{ minWidth: '260px', flex: 1, maxWidth: '400px' }}>
          <Select
            label="Project"
            value={projectFilter}
            options={projectOptions}
            placeholder="All Projects"
            onChange={(e) => {
              setProjectFilter(e.target.value)
            }}
          />
        </div>
        {(statusFilter || projectFilter) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setStatusFilter('')
              setProjectFilter('')
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                height: '56px',
                borderRadius: '14px',
                background: theme.bgSurface,
                border: `1px solid ${theme.border}`,
                animation: 'fnc-shimmer 1.5s ease-in-out infinite',
              }}
            />
          ))}
        </div>
      ) : issues.length === 0 ? (
        <EmptyState
          title="No store-outs yet"
          message="Create a store-out to record inventory items issued to a project."
          action={
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setShowModal(true)
              }}
            >
              + New Store Out
            </Button>
          }
          icon={
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke={theme.textMuted}
              strokeWidth="1.5"
            >
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            </svg>
          }
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {issues.map((si) => {
            const totalCost = si.lines.reduce((sum, l) => sum + l.totalCost, 0)
            const isExpanded = expandedId === si.id
            const isDraft = si.status === 'draft'

            return (
              <Card key={si.id} padding="none">
                {/* Row header */}
                <div
                  onClick={() => {
                    setExpandedId(isExpanded ? null : si.id)
                  }}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '160px 1fr 180px 110px 140px auto',
                    alignItems: 'center',
                    padding: '12px 16px',
                    cursor: 'pointer',
                    gap: '12px',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = theme.tableRowHover)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <div
                    style={{
                      fontFamily: 'monospace',
                      fontSize: '13px',
                      fontWeight: 700,
                      color: theme.accent,
                    }}
                  >
                    {si.issueNumber}
                  </div>
                  <div>
                    {si.projectCode ? (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            navigate(`/projects/${si.id}`)
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: theme.accent,
                            fontSize: '13px',
                            padding: 0,
                            fontWeight: 500,
                          }}
                        >
                          {si.projectCode}
                        </button>
                        {si.projectName && (
                          <div
                            style={{ fontSize: '11px', color: theme.textMuted, marginTop: '1px' }}
                          >
                            {si.projectName}
                          </div>
                        )}
                      </>
                    ) : (
                      <span style={{ fontSize: '13px', color: theme.textMuted }}>—</span>
                    )}
                  </div>
                  <div style={{ fontSize: '12px', color: theme.textMuted }}>
                    {si.poNumber ? (
                      <span style={{ fontFamily: 'monospace', fontSize: '11px' }}>
                        PO: {si.poNumber}
                      </span>
                    ) : (
                      (si.notes?.slice(0, 35) ?? '—')
                    )}
                  </div>
                  <div style={{ fontSize: '12px', color: theme.textMuted }}>
                    {si.issueDate.slice(0, 10)}
                  </div>
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: '13px',
                      fontVariantNumeric: 'tabular-nums',
                      color: theme.textPrimary,
                    }}
                  >
                    {si.lines.length > 0 ? `${fmtAmt(totalCost)} IQD` : `${si.lines.length} items`}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Badge variant={STATUS_VARIANT[si.status] ?? 'neutral'}>{si.status}</Badge>
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke={theme.textMuted}
                      strokeWidth="2"
                      style={{
                        transform: isExpanded ? 'rotate(90deg)' : 'none',
                        transition: 'transform 0.15s',
                        flexShrink: 0,
                      }}
                    >
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div style={{ borderTop: `1px solid ${theme.border}`, padding: '16px' }}>
                    {/* Lines table */}
                    <Table<MILine>
                      columns={linesColumns(isDraft, si.id)}
                      data={si.lines}
                      rowKey="id"
                      emptyMessage="No items yet — add one below."
                    />

                    {/* Total row */}
                    {si.lines.length > 0 && (
                      <div
                        style={{
                          textAlign: 'right',
                          padding: '8px 14px',
                          borderTop: `1px solid ${theme.border}`,
                          fontSize: '13px',
                          fontWeight: 700,
                          color: theme.textPrimary,
                          fontVariantNumeric: 'tabular-nums',
                          marginBottom: '16px',
                        }}
                      >
                        Total: {fmtAmt(totalCost)} IQD
                      </div>
                    )}

                    {/* Add item row — draft only */}
                    {isDraft && (
                      <div
                        style={{
                          border: `1px dashed ${theme.border}`,
                          borderRadius: '10px',
                          padding: '14px',
                          marginBottom: '16px',
                          background: theme.bgCanvas,
                        }}
                      >
                        <p
                          style={{
                            fontSize: '11px',
                            fontWeight: 600,
                            color: theme.textMuted,
                            textTransform: 'uppercase',
                            letterSpacing: '0.06em',
                            marginBottom: '12px',
                          }}
                        >
                          Add Item
                        </p>
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 160px 90px 140px auto',
                            gap: '10px',
                            alignItems: 'flex-end',
                          }}
                        >
                          <SearchableSelect
                            label="Item"
                            value={draftProductId}
                            onChange={(val) => {
                              setDraftProductId(val)
                              const prod = products.find((p) => p.id === val)
                              if (prod?.average_cost != null)
                                setDraftUnit(String(prod.average_cost))
                            }}
                            options={productOptions}
                            placeholder="Search name or SKU…"
                          />
                          <Select
                            label="From Location"
                            value={draftFromLocationId}
                            onChange={(e) => {
                              setDraftFromLocationId(e.target.value)
                            }}
                            options={locationOptions}
                          />
                          <Input
                            label="Qty"
                            type="number"
                            value={draftQty}
                            onChange={(e) => {
                              setDraftQty(e.target.value)
                            }}
                            min={0}
                            step="any"
                            placeholder="0"
                          />
                          <Input
                            label="Unit Cost (IQD)"
                            type="number"
                            value={draftUnit}
                            onChange={(e) => {
                              setDraftUnit(e.target.value)
                            }}
                            min={0}
                            step="any"
                            placeholder="0.00"
                          />
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={!draftProductId || !draftQty || !draftUnit || addingLine}
                            onClick={() =>
                              void addLine({
                                variables: {
                                  issueId: si.id,
                                  productId: draftProductId,
                                  qtyIssued: parseFloat(draftQty),
                                  unitCost: parseFloat(draftUnit),
                                  fromLocationId: draftFromLocationId || undefined,
                                },
                              })
                            }
                          >
                            Add
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <span style={{ fontSize: '12px', color: theme.textMuted }}>
                        {si.issuedByName ? `Issued by ${si.issuedByName}` : ''}
                      </span>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            navigate(`/inventory/store-out/${si.id}`)
                          }}
                        >
                          View / Print
                        </Button>
                        {si.projectCode && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              navigate(`/projects/${si.id}?tab=procurement`)
                            }}
                          >
                            View Project
                          </Button>
                        )}
                        {isDraft && si.lines.length > 0 && (
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => {
                              setConfirmIssue(si.id)
                            }}
                          >
                            Issue Store Out
                          </Button>
                        )}
                        {(isDraft || si.status === 'issued') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setConfirmCancel(si.id)
                            }}
                          >
                            Cancel
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {/* ── New Store Out modal ───────────────────────────────────────────────── */}
      <Modal
        open={showModal}
        onClose={resetModal}
        title="New Store Out"
        description="Record inventory items being issued to a project."
        size="lg"
        footer={
          <>
            <Button variant="ghost" size="md" onClick={resetModal}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              disabled={!formProjectId || !formDate || pendingLines.length === 0 || creating}
              loading={creating}
              onClick={() => void handleCreate()}
            >
              Create
              {pendingLines.length > 0
                ? ` (${pendingLines.length} item${pendingLines.length > 1 ? 's' : ''})`
                : ''}
            </Button>
          </>
        }
      >
        {/* Header fields */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: '14px',
            marginBottom: '14px',
          }}
        >
          <Input
            label="Issue Date"
            required
            type="date"
            value={formDate}
            onChange={(e) => {
              setFormDate(e.target.value)
            }}
          />
          <SearchableSelect
            label="Project"
            required
            value={formProjectId}
            onChange={(val) => {
              setFormProjectId(val)
              setFormPoId('')
            }}
            options={projectOptions}
            placeholder="Select project…"
          />
          <SearchableSelect
            label="Link to PO (optional)"
            value={formPoId}
            onChange={setFormPoId}
            options={poOptions}
            placeholder={formProjectId ? 'Search PO…' : 'Select a project first'}
            disabled={!formProjectId || projectPOs.length === 0}
          />
        </div>

        <Textarea
          label="Notes"
          value={formNotes}
          onChange={(e) => {
            setFormNotes(e.target.value)
          }}
          rows={2}
          placeholder="Optional notes…"
        />

        {/* Items section */}
        <div style={{ marginTop: '20px' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '10px',
            }}
          >
            <p
              style={{
                fontSize: '12px',
                fontWeight: 600,
                color: theme.textSecondary,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              Items to Issue
            </p>
            {pendingLines.length > 0 && (
              <span
                style={{
                  fontSize: '12px',
                  color: theme.textMuted,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                Subtotal: <strong>{fmtAmt(pendingTotal)} IQD</strong>
              </span>
            )}
          </div>

          {/* Pending lines table */}
          {pendingLines.length > 0 && (
            <div
              style={{
                marginBottom: '14px',
                border: `1px solid ${theme.border}`,
                borderRadius: '10px',
                overflow: 'hidden',
              }}
            >
              <Table<PendingLine> columns={pendingColumns} data={pendingLines} rowKey="key" />
            </div>
          )}

          {/* Add item row */}
          <div
            style={{
              border: `1px dashed ${theme.border}`,
              borderRadius: '10px',
              padding: '14px',
              background: theme.bgCanvas,
            }}
          >
            {pendingLines.length === 0 && (
              <p style={{ fontSize: '13px', color: theme.textMuted, marginBottom: '12px' }}>
                Add the items being issued from inventory.
              </p>
            )}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 150px 80px 130px auto',
                gap: '10px',
                alignItems: 'flex-end',
              }}
            >
              <SearchableSelect
                label="Item"
                value={newProductId}
                onChange={(val) => {
                  setNewProductId(val)
                  const prod = products.find((p) => p.id === val)
                  if (prod?.average_cost != null) setNewUnit(String(prod.average_cost))
                }}
                options={productOptions}
                placeholder="Search name or SKU…"
              />
              <Select
                label="From Location"
                value={newFromLocationId}
                onChange={(e) => {
                  setNewFromLocationId(e.target.value)
                }}
                options={locationOptions}
              />
              <Input
                label="Qty"
                type="number"
                value={newQty}
                onChange={(e) => {
                  setNewQty(e.target.value)
                }}
                min={0}
                step="any"
                placeholder="0"
              />
              <Input
                label="Unit Cost (IQD)"
                type="number"
                value={newUnit}
                onChange={(e) => {
                  setNewUnit(e.target.value)
                }}
                min={0}
                step="any"
                placeholder="0.00"
              />
              <Button
                variant="secondary"
                size="sm"
                disabled={!newProductId || !newQty || !newUnit}
                onClick={addPendingLine}
              >
                + Add
              </Button>
            </div>
          </div>

          {pendingLines.length === 0 && (
            <p
              style={{
                fontSize: '11px',
                color: theme.textMuted,
                marginTop: '8px',
                textAlign: 'right',
              }}
            >
              Add at least one item before creating
            </p>
          )}
        </div>
      </Modal>

      {/* Confirm: issue */}
      <ConfirmDialog
        open={confirmIssue !== null}
        onClose={() => {
          setConfirmIssue(null)
        }}
        onConfirm={() => {
          if (confirmIssue) void issueMI({ variables: { id: confirmIssue } })
        }}
        title="Issue Store Out"
        message="Issuing this store-out will commit the cost to the project. This cannot be undone."
        confirmLabel="Issue"
        confirmVariant="primary"
        loading={issuing}
      />

      {/* Confirm: cancel */}
      <ConfirmDialog
        open={confirmCancel !== null}
        onClose={() => {
          setConfirmCancel(null)
        }}
        onConfirm={() => {
          if (confirmCancel) void cancelMI({ variables: { id: confirmCancel } })
        }}
        title="Cancel Store Out"
        message="Are you sure you want to cancel this store-out? This will remove any committed cost from the project."
        confirmLabel="Cancel Store Out"
        confirmVariant="danger"
        loading={cancelling}
      />
    </div>
  )
}
