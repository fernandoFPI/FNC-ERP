import React, { useState, useCallback, useRef, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@apollo/client'
import {
  PO_LIFECYCLE_QUERY,
  PO_STOCK_AVAILABILITY_QUERY,
  SUBMIT_PO_TO_INVENTORY,
  CONFIRM_PO_INVENTORY,
  APPROVE_STOCK_ISSUANCE,
  SUBMIT_PO_STORE_PRICING,
  SUBMIT_PO_MARKET_PRICING,
  SUBMIT_PO_PRICE_VERIFICATION,
  APPROVE_PO,
  REJECT_PO,
  REJECT_PO_TO_MARKET,
  REOPEN_PO,
  CANCEL_PO,
  SEND_PO_TO_AUDIT,
  PASS_PO_AUDIT,
  FAIL_PO_AUDIT,
  SET_PO_LINE_AUDIT_STATUS,
  COMPLETE_PO,
  DELETE_PO,
  SUBMIT_PO_EDIT_REQUEST,
  APPROVE_PO_EDIT_REQUEST,
  REJECT_PO_EDIT_REQUEST,
  ADMIN_SET_PO_STATUS,
  SET_PO_PRIORITY,
  SET_PO_RECEIVER,
  SET_PO_LINE_ACTUAL_PRICE,
} from '../../../graphql/procurement'
import { EMPLOYEES_QUERY } from '../../../graphql/hr'
import { useTheme } from '../../../theme/ThemeContext'
import { usePermission } from '../../../hooks/usePermission'
import { useBreakpoint } from '../../../hooks/useBreakpoint'
import { usePagePadding } from '../../../hooks/usePagePadding'
import { useEntityChanged } from '../../../hooks/useEntityChanged'
import { useRecordLock } from '../../../hooks/useRecordLock'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { Button, StickyActionBar } from '../../../components/ui/Button'
import { StatusBar } from '../../../components/ui/StatusBar'
import { TabBar } from '../../../components/ui/TabBar'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import type { Column } from '../../../components/ui/Table'
import { Table } from '../../../components/ui/Table'
import { LineItemEditor, type LineItemField } from '../../../components/ui/LineItemEditor'
import { PO_STATUSES, getPOStatusVariant, getPOStatusLabel } from '../../../lib/po-constants'
import { useToastStore } from '../../../store/toastStore'
import { api } from '../../../lib/axios'
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog'
import { SearchableSelect } from '../../../components/ui/SearchableSelect'
import { buildPurchaseOrderHTML } from '../../../lib/poHtml'

interface POLine {
  id: string
  product_id: string
  product_name: string
  description: string
  qty: number
  uom: string
  qty_received: number
  actual_unit_price?: number | null
  store_price?: number
  store_price_currency?: string
  market_price?: number
  market_price_currency?: string
  verified_price?: number
  verified_price_currency?: string
  in_stock?: boolean
  qty_from_stock: number
  unit_price: number
  total: number
  audit_status?: 'pending' | 'ok' | 'flagged' | null
  audit_note?: string | null
  audit_flagged_by_email?: string | null
  audit_flagged_at?: string | null
}

interface PO {
  id: string
  po_number: string
  status: string
  priority: string
  currency_code: string
  total_amount: number
  subtotal: number
  vendor_id: string
  vendor_name?: string
  project_id?: string
  organizer_id?: string
  assigned_approver_id?: string
  store_keeper_id?: string
  store_pricing_id?: string
  procurement_officer_id?: string
  procurement_2nd_id?: string
  assigned_receiver_id?: string | null
  assigned_receiver_name?: string | null
  purpose?: string
  linkedProjectId?: string
  linkedMoId?: string
  projectCode?: string | null
  projectName?: string | null
  expected_delivery_date?: string
  notes?: string
  created_by_email?: string
  created_at: string
  updated_at: string
  lines: POLine[]
  receipts: {
    id: string
    receipt_date: string
    location_name?: string
    received_by_email?: string
    received_by_name?: string
    location_notes?: string
    notes?: string
    created_at: string
    lines: { po_line_id: string; description: string; qty_received: number }[]
    photos: {
      id: string
      fileId: string
      label?: string
      originalFilename: string
      downloadUrl?: string
      createdAt: string
    }[]
  }[]
  approval_log: {
    id: string
    action: string
    user_email: string
    notes?: string
    created_at: string
  }[]
  edit_requests: POEditRequest[]
}

interface LineComment {
  id: string
  comment: string
  created_by_name: string
  created_at: string
  flag?: 'info' | 'warning' | 'dispute' | null
  resolved: boolean
  resolved_at?: string | null
}

interface POEditRequest {
  id: string
  po_id: string
  status: 'pending' | 'approved' | 'rejected'
  changes: string
  request_notes?: string
  requested_by_email?: string
  reviewed_by_email?: string
  review_notes?: string
  reviewed_at?: string
  created_at: string
}

interface EditDraft {
  notes: string
  expected_delivery_date: string
  lines: {
    id: string
    description: string
    qty: number
    unit_price: number
    uom: string
    _removed?: boolean
  }[]
  linesAdded: { description: string; qty: number; unit_price: number; uom: string }[]
}

type Tab = 'lines' | 'receipts' | 'returns' | 'approval_log' | 'changes'

export default function PurchaseOrderDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { theme } = useTheme()
  const lock = useRecordLock('purchase_order', id)
  const { isPhone } = useBreakpoint()
  const pagePadding = usePagePadding()
  const [activeTab, setActiveTab] = useState<Tab>('lines')
  const [rejectReason, setRejectReason] = useState('')
  const [actionNotes, setActionNotes] = useState('')
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [lbScale, setLbScale] = useState(1)
  const [lbOffset, setLbOffset] = useState({ x: 0, y: 0 })
  const lbDrag = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null)
  const lbOverlayRef = useRef<HTMLDivElement>(null)

  const openLightbox = useCallback((url: string) => {
    setLightboxUrl(url)
    setLbScale(1)
    setLbOffset({ x: 0, y: 0 })
  }, [])

  const closeLightbox = useCallback(() => {
    setLightboxUrl(null)
    setLbScale(1)
    setLbOffset({ x: 0, y: 0 })
  }, [])

  // Non-passive wheel listener so preventDefault() actually works
  useEffect(() => {
    const el = lbOverlayRef.current
    if (!el || !lightboxUrl) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      setLbScale((s) => Math.min(8, Math.max(0.5, s - e.deltaY * 0.001)))
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => {
      el.removeEventListener('wheel', handler)
    }
  }, [lightboxUrl])

  const onLbMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      lbDrag.current = { startX: e.clientX, startY: e.clientY, ox: lbOffset.x, oy: lbOffset.y }
    },
    [lbOffset],
  )

  const onLbMouseMove = useCallback((e: React.MouseEvent) => {
    if (!lbDrag.current) return
    setLbOffset({
      x: lbDrag.current.ox + e.clientX - lbDrag.current.startX,
      y: lbDrag.current.oy + e.clientY - lbDrag.current.startY,
    })
  }, [])

  const onLbMouseUp = useCallback(() => {
    lbDrag.current = null
  }, [])
  const [lineStockQtys, setLineStockQtys] = useState<Record<string, number>>({})
  const [storePrices, setStorePrices] = useState<
    Record<string, { price: string; currency: string }>
  >({})
  const [marketPrices, setMarketPrices] = useState<
    Record<string, { price: string; currency: string; quoteRef: string }>
  >({})
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null)
  const [editRequestNotes, setEditRequestNotes] = useState('')
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({})
  const [adminPoStatus, setAdminPoStatus] = useState('')
  const [showActionsPanel, setShowActionsPanel] = useState(false)
  const [confirmDeletePO, setConfirmDeletePO] = useState(false)
  const [lineComments, setLineComments] = useState<Record<string, LineComment[]>>({})
  const [commentModal, setCommentModal] = useState<{ lineId: string; description: string } | null>(
    null,
  )
  // Per-line flags for approval review — key=lineId, value=note text
  const [lineFlagNotes, setLineFlagNotes] = useState<Record<string, string>>({})

  const flaggedLineIds = Object.keys(lineFlagNotes)
  const hasFlaggedLines = flaggedLineIds.length > 0

  function flagLine(lineId: string) {
    setLineFlagNotes((prev) => ({ ...prev, [lineId]: prev[lineId] ?? '' }))
  }
  function clearFlag(lineId: string) {
    setLineFlagNotes((prev) => {
      const n = { ...prev }
      delete n[lineId]
      return n
    })
  }
  function setFlagNote(lineId: string, note: string) {
    setLineFlagNotes((prev) => ({ ...prev, [lineId]: note }))
  }
  const [newComment, setNewComment] = useState('')
  const [newFlag, setNewFlag] = useState<'' | 'info' | 'warning' | 'dispute'>('')
  const [addingComment, setAddingComment] = useState(false)
  const [resolvingId, setResolvingId] = useState<string | null>(null)
  const [showPrintModal, setShowPrintModal] = useState(false)
  const printIframeRef = useRef<HTMLIFrameElement>(null)
  const [flaggingLines, setFlaggingLines] = useState<Record<string, string>>({})
  const [actualPrices, setActualPrices] = useState<Record<string, string>>({})

  const addToast = useToastStore((s) => s.addToast)
  const { isSystemLevel, can } = usePermission()
  const [apInvoice, setApInvoice] = useState<
    { id: string; invoice_number: string; status: string } | null | undefined
  >(undefined)
  const [poReturns, setPoReturns] = useState<
    {
      id: string
      return_number: string
      return_type: string
      status: string
      total_returned_value: string
      currency_code: string
    }[]
  >([])

  useEffect(() => {
    if (!id) return
    api
      .get<
        {
          id: string
          return_number: string
          return_type: string
          status: string
          total_returned_value: string
          currency_code: string
        }[]
      >(`/procurement/purchase-orders/${id}/returns`)
      .then((r) => {
        setPoReturns(Array.isArray(r.data) ? r.data : [])
      })
      .catch(() => {})
  }, [id])

  const fetchLineComments = React.useCallback(() => {
    if (!id) return
    interface RawComment {
      id: string
      po_line_id: string
      comment: string
      created_by_name: string
      created_at: string
      flag?: string | null
      resolved: boolean
      resolved_at?: string | null
    }
    api
      .get<RawComment[]>(`/procurement/purchase-orders/${id}/line-comments`)
      .then((r) => {
        const grouped: Record<string, LineComment[]> = {}
        for (const c of Array.isArray(r.data) ? r.data : []) {
          if (!grouped[c.po_line_id]) grouped[c.po_line_id] = []
          grouped[c.po_line_id].push({
            id: c.id,
            comment: c.comment,
            created_by_name: c.created_by_name,
            created_at: c.created_at,
            flag: (c.flag as LineComment['flag']) ?? null,
            resolved: c.resolved,
            resolved_at: c.resolved_at,
          })
        }
        setLineComments(grouped)
      })
      .catch(() => {})
  }, [id])

  useEffect(() => {
    fetchLineComments()
  }, [fetchLineComments])

  const { data, loading, refetch } = useQuery(PO_LIFECYCLE_QUERY, {
    variables: { id },
    fetchPolicy: 'cache-and-network',
  })
  useEntityChanged('purchase_order', () => void refetch())
  const po: PO | undefined = data?.purchaseOrder

  // Derived rejection reason — built from per-line flag notes when approving
  const flagAutoReason = po
    ? flaggedLineIds
        .map((id) => {
          const line = po.lines.find((l) => l.id === id)
          const name = line?.description || line?.product_name || 'Unknown item'
          const note = lineFlagNotes[id]
          return note.trim() ? `• ${name}: ${note.trim()}` : `• ${name}: flagged for review`
        })
        .join('\n')
    : ''
  const effectiveRejectReason = rejectReason || flagAutoReason

  useEffect(() => {
    if (!id) return
    interface APInv {
      id: string
      invoice_number: string
      status: string
    }
    api
      .get<{ items: APInv[] }>('/finance/vendor-invoices', { params: { po_id: id, limit: 1 } })
      .then(async (r) => {
        const byPoId = r.data?.items?.[0] ?? null
        if (byPoId) {
          setApInvoice(byPoId)
          return
        }
        // Fallback: workflow-imported POs have duplicate UUIDs per company.
        if (po?.po_number) {
          const autoNum = 'INV-' + po.po_number.replace(/^PO-/i, '')
          const r2 = await api.get<{ items: APInv[] }>('/finance/vendor-invoices', {
            params: { invoice_number: autoNum, cross_company: 'true', limit: 1 },
          })
          setApInvoice(r2.data?.items?.[0] ?? null)
        } else {
          setApInvoice(null)
        }
      })
      .catch(() => {
        setApInvoice(null)
      })
  }, [id, po?.po_number])

  const { data: stockData } = useQuery(PO_STOCK_AVAILABILITY_QUERY, {
    variables: { poId: id },
    skip: po?.status !== 'inventory_check',
    fetchPolicy: 'cache-and-network',
  })
  const stockAvailability: {
    lineId: string
    productId?: string
    productName?: string
    description?: string
    qtyRequired: number
    qtyOnHand: number
    qtyAvailable: number
    isAvailable: boolean
  }[] = stockData?.poStockAvailability ?? []

  const onErr = (e: { message: string }) => {
    addToast({ type: 'error', message: e.message })
  }
  const mutOpts = {
    onCompleted: () => {
      setActionNotes('')
      setLineStockQtys({})
      void refetch()
    },
    onError: onErr,
  }
  const [submitToInventory, { loading: l1 }] = useMutation(SUBMIT_PO_TO_INVENTORY, mutOpts)
  const [confirmInventory, { loading: l2 }] = useMutation(CONFIRM_PO_INVENTORY, mutOpts)
  const [approveIssuance, { loading: lIssue }] = useMutation(APPROVE_STOCK_ISSUANCE, mutOpts)
  const [submitStorePricing, { loading: l3 }] = useMutation(SUBMIT_PO_STORE_PRICING, mutOpts)
  const [submitMarketPricing, { loading: l4 }] = useMutation(SUBMIT_PO_MARKET_PRICING, mutOpts)
  const [submitPriceVerification, { loading: l5 }] = useMutation(
    SUBMIT_PO_PRICE_VERIFICATION,
    mutOpts,
  )
  const [approvePO, { loading: l8 }] = useMutation(APPROVE_PO, mutOpts)
  const [rejectPO] = useMutation(REJECT_PO, {
    onCompleted: () => {
      setRejectReason('')
      void refetch()
    },
    onError: onErr,
  })
  const [rejectToMarket] = useMutation(REJECT_PO_TO_MARKET, {
    onCompleted: () => {
      setRejectReason('')
      void refetch()
    },
    onError: onErr,
  })
  const [reopenPO] = useMutation(REOPEN_PO, mutOpts)
  const [cancelPO] = useMutation(CANCEL_PO, {
    onCompleted: () => {
      setRejectReason('')
      void refetch()
    },
    onError: onErr,
  })
  const [sendToAudit, { loading: lAudit }] = useMutation(SEND_PO_TO_AUDIT, mutOpts)
  const [passAudit, { loading: lPass }] = useMutation(PASS_PO_AUDIT, mutOpts)
  const [failAudit] = useMutation(FAIL_PO_AUDIT, {
    onCompleted: () => {
      setActionNotes('')
      void refetch()
    },
    onError: onErr,
  })
  const [setLineAuditStatus] = useMutation(SET_PO_LINE_AUDIT_STATUS, {
    onCompleted: () => {
      void refetch()
    },
    onError: onErr,
  })
  const [completePO, { loading: l9 }] = useMutation(COMPLETE_PO, {
    ...mutOpts,
    onError: (err) => {
      addToast({ type: 'error', message: err.message })
    },
  })
  const [deletePO] = useMutation(DELETE_PO, {
    onCompleted: () => {
      navigate('/procurement/purchase-orders')
    },
  })
  const [submitEditRequest, { loading: leR }] = useMutation(SUBMIT_PO_EDIT_REQUEST, {
    onCompleted: () => {
      setEditDraft(null)
      setEditRequestNotes('')
      void refetch()
    },
  })
  const [approveEditRequest, { loading: leA }] = useMutation(APPROVE_PO_EDIT_REQUEST, {
    onCompleted: () => {
      setReviewNotes({})
      void refetch()
    },
  })
  const [rejectEditRequest, { loading: leJ }] = useMutation(REJECT_PO_EDIT_REQUEST, {
    onCompleted: () => {
      setReviewNotes({})
      void refetch()
    },
  })
  const [adminSetPOStatus, { loading: adminSetting }] = useMutation(ADMIN_SET_PO_STATUS, {
    onCompleted: () => {
      setAdminPoStatus('')
      addToast({ type: 'success', message: 'Status updated' })
      void refetch()
    },
    onError: (e) => {
      addToast({ type: 'error', message: e.message })
    },
  })
  const [setPriority, { loading: settingPriority }] = useMutation(SET_PO_PRIORITY, {
    onCompleted: () => {
      void refetch()
    },
    onError: (e) => {
      addToast({ type: 'error', message: e.message })
    },
  })
  const [setReceiver] = useMutation(SET_PO_RECEIVER, {
    onCompleted: () => {
      void refetch()
    },
    onError: (e) => {
      addToast({ type: 'error', message: e.message })
    },
  })
  const [setLineActualPrice] = useMutation(SET_PO_LINE_ACTUAL_PRICE, {
    onCompleted: () => {
      void refetch()
    },
    onError: (e) => {
      addToast({ type: 'error', message: e.message })
    },
  })

  const { data: employeesData } = useQuery(EMPLOYEES_QUERY, {
    variables: { is_active: true },
    fetchPolicy: 'cache-first',
  })
  const employees: { id: string; first_name: string; last_name: string; job_title?: string }[] =
    employeesData?.employees ?? []

  const anyLoading = l1 || l2 || l3 || l4 || l5 || l8 || l9 || lIssue || lAudit || lPass

  if (loading) return <div style={{ padding: '48px', color: theme.textMuted }}>Loading…</div>
  if (!po) return <div style={{ padding: '48px', color: theme.textMuted }}>PO not found.</div>

  const pendingEdits = (po.edit_requests ?? []).filter((r) => r.status === 'pending').length

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: 'lines', label: 'Lines' },
    { key: 'receipts', label: 'Receipts' },
    { key: 'returns', label: 'Returns', badge: poReturns.length || undefined },
    { key: 'approval_log', label: 'Log' },
    { key: 'changes', label: 'Edit requests', badge: pendingEdits },
  ]

  const phoneTabLabels: Partial<Record<Tab, string>> = {
    lines: 'Lines',
    receipts: 'Rec.',
    returns: 'Rtn.',
    approval_log: 'Log',
    changes: 'Edits',
  }

  return (
    <div
      style={{
        ...pagePadding,
        paddingBottom: isPhone
          ? 'calc(env(safe-area-inset-bottom, 0px) + 120px)'
          : pagePadding.paddingBottom,
        margin: '0 auto',
        maxWidth: '1300px',
      }}
    >
      <PageHeader
        title={po.po_number}
        subtitle={`${po.vendor_name ?? 'No vendor'} • Created ${po.created_at?.slice(0, 10) ?? ''}${
          po.project_id
            ? ` • Project: ${[po.projectCode, po.projectName].filter(Boolean).join(' — ')}`
            : ''
        }`}
        backPath="/procurement/purchase-orders"
        actions={
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <Badge variant={getPOStatusVariant(po.status)}>{getPOStatusLabel(po.status)}</Badge>
            {/* Priority selector */}
            {(() => {
              const PRIORITIES = [
                {
                  key: 'low',
                  label: 'Low',
                  color: '#6b7280',
                  activeBg: 'rgba(107,114,128,0.12)',
                  border: '#9ca3af',
                },
                {
                  key: 'high',
                  label: 'High',
                  color: '#d97706',
                  activeBg: 'rgba(217,119,6,0.12)',
                  border: '#f59e0b',
                },
                {
                  key: 'emergency',
                  label: 'Emergency',
                  color: '#dc2626',
                  activeBg: 'rgba(220,38,38,0.12)',
                  border: '#ef4444',
                },
              ]
              const current = po.priority ?? 'low'
              return (
                <div
                  style={{
                    display: 'flex',
                    gap: '2px',
                    background: theme.bgSurface,
                    border: `1px solid ${theme.border}`,
                    borderRadius: '7px',
                    padding: '2px',
                  }}
                >
                  {PRIORITIES.map((p) => {
                    const active = current === p.key
                    return (
                      <button
                        key={p.key}
                        disabled={settingPriority || lock.lockedByOther}
                        onClick={() => {
                          if (!active)
                            void setPriority({ variables: { id: po.id, priority: p.key } })
                        }}
                        style={{
                          padding: '3px 10px',
                          borderRadius: '5px',
                          border: 'none',
                          cursor: active ? 'default' : 'pointer',
                          fontSize: '11px',
                          fontWeight: active ? 700 : 400,
                          background: active ? p.activeBg : 'transparent',
                          color: active ? p.color : theme.textMuted,
                          outline: active ? `1px solid ${p.border}` : 'none',
                          transition: 'all 0.12s',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {p.label}
                      </button>
                    )
                  })}
                </div>
              )
            })()}
            {/* Primary contextual actions — pinned to a bottom sticky bar on
                phone instead of crowding the header row (StickyActionBar is a
                no-op passthrough on tablet+desktop). */}
            <StickyActionBar>
              {apInvoice !== undefined &&
                can('finance.ap.view') &&
                (apInvoice ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    fullWidthOnMobile
                    onClick={() => {
                      navigate(`/finance/ap/${apInvoice.id}`)
                    }}
                  >
                    View Invoice
                  </Button>
                ) : can('finance.ap.edit') && po.status === 'completed' ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    fullWidthOnMobile
                    onClick={() => {
                      navigate(`/finance/ap/new?po_id=${id}`)
                    }}
                  >
                    Create Invoice
                  </Button>
                ) : null)}
              {['received', 'invoiced', 'completed'].includes(po.status) &&
                can('procurement.po.edit', 'edit') && (
                  <Button
                    variant="secondary"
                    size="sm"
                    fullWidthOnMobile
                    onClick={() => {
                      navigate(`/procurement/purchase-orders/${id}/returns/new`)
                    }}
                  >
                    ↩ Create Return
                  </Button>
                )}
              <Button
                variant="secondary"
                size="sm"
                fullWidthOnMobile
                onClick={() => {
                  setShowPrintModal(true)
                }}
              >
                Print PO
              </Button>
            </StickyActionBar>
            {(po.status === 'draft' || po.status === 'inventory_check') && (
              <Button
                variant="danger"
                size="sm"
                disabled={lock.lockedByOther}
                onClick={() => {
                  setConfirmDeletePO(true)
                }}
              >
                Delete
              </Button>
            )}
            {/* Actions dropdown — Cancel + Admin Override */}
            {(!['cancelled', 'deleted'].includes(po.status) || isSystemLevel) && (
              <div style={{ position: 'relative' }}>
                <button
                  disabled={lock.lockedByOther}
                  onClick={() => {
                    setShowActionsPanel((v) => !v)
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '5px 12px',
                    borderRadius: '7px',
                    border: `1px solid ${theme.border}`,
                    background: showActionsPanel ? theme.accent : theme.bgCanvas,
                    color: showActionsPanel ? '#fff' : theme.textPrimary,
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  Actions
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    style={{
                      transition: 'transform 0.15s',
                      transform: showActionsPanel ? 'rotate(180deg)' : 'rotate(0deg)',
                    }}
                  >
                    <polyline
                      points="6 9 12 15 18 9"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>

                {showActionsPanel && (
                  <>
                    <div
                      onClick={() => {
                        setShowActionsPanel(false)
                      }}
                      style={{ position: 'fixed', inset: 0, zIndex: 99 }}
                    />
                    <div
                      style={{
                        position: 'absolute',
                        top: 'calc(100% + 10px)',
                        right: 0,
                        zIndex: 200,
                        width: 'min(380px, calc(100vw - 32px))',
                        background: theme.bgCanvas,
                        border: `1px solid ${theme.border}`,
                        borderRadius: '12px',
                        boxShadow: '0 12px 32px rgba(0,0,0,0.14)',
                        overflow: 'hidden',
                      }}
                    >
                      {/* header */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 16px',
                          borderBottom: `1px solid ${theme.border}`,
                          background: theme.bgSurface,
                        }}
                      >
                        <span
                          style={{
                            fontSize: '12px',
                            fontWeight: 700,
                            color: theme.textPrimary,
                            textTransform: 'uppercase',
                            letterSpacing: '0.06em',
                          }}
                        >
                          Actions
                        </span>
                        <button
                          onClick={() => {
                            setShowActionsPanel(false)
                          }}
                          style={{
                            border: 'none',
                            background: 'none',
                            cursor: 'pointer',
                            color: theme.textMuted,
                            fontSize: '18px',
                            lineHeight: 1,
                            padding: '0 2px',
                          }}
                        >
                          ×
                        </button>
                      </div>
                      {/* Cancel */}
                      {!['cancelled', 'deleted'].includes(po.status) && (
                        <div
                          style={{
                            padding: '14px 16px',
                            borderBottom: isSystemLevel ? `1px solid ${theme.border}` : 'none',
                          }}
                        >
                          <div
                            style={{
                              fontSize: '13px',
                              fontWeight: 600,
                              color: theme.textPrimary,
                              marginBottom: '4px',
                            }}
                          >
                            Cancel this PO
                          </div>
                          <div
                            style={{
                              fontSize: '12px',
                              color: theme.textMuted,
                              marginBottom: '10px',
                            }}
                          >
                            This action cannot be undone without admin override.
                          </div>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => {
                              const reason = window.prompt('Cancel reason (optional):') ?? ''
                              void cancelPO({
                                variables: { id: po.id, reason: reason || undefined },
                              })
                              setShowActionsPanel(false)
                            }}
                          >
                            Cancel PO
                          </Button>
                        </div>
                      )}
                      {/* Admin override */}
                      {isSystemLevel && (
                        <div style={{ padding: '14px 16px' }}>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              marginBottom: '10px',
                            }}
                          >
                            <svg
                              width="11"
                              height="11"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke={theme.danger}
                              strokeWidth="2.2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                            </svg>
                            <span
                              style={{
                                fontSize: '11px',
                                fontWeight: 700,
                                color: theme.danger,
                                textTransform: 'uppercase',
                                letterSpacing: '0.07em',
                              }}
                            >
                              Admin Override
                            </span>
                            <span
                              style={{
                                fontSize: '11px',
                                color: theme.danger,
                                opacity: 0.6,
                                marginLeft: 'auto',
                              }}
                            >
                              Bypasses workflow
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <select
                              value={adminPoStatus || po.status}
                              disabled={adminSetting}
                              onChange={(e) => {
                                setAdminPoStatus(e.target.value)
                              }}
                              style={{
                                flex: 1,
                                fontSize: '13px',
                                padding: '6px 10px',
                                borderRadius: '6px',
                                border: `1px solid ${theme.dangerBorder}`,
                                background: theme.bgSurface,
                                color: theme.textPrimary,
                                cursor: 'pointer',
                                outline: 'none',
                              }}
                            >
                              {[
                                { value: 'draft', label: 'Draft' },
                                { value: 'inventory_check', label: 'Inventory Check' },
                                { value: 'store_pricing', label: 'Store Pricing' },
                                { value: 'market_pricing', label: 'Market Pricing' },
                                { value: 'price_verification', label: 'Price Verification' },
                                { value: 'pending_approval', label: 'Pending Approval' },
                                { value: 'approved', label: 'Approved' },
                                { value: 'ready_to_issue', label: 'Ready to Issue' },
                                { value: 'goods_received', label: 'Goods Received' },
                                { value: 'finance_audit', label: 'Finance Audit' },
                                { value: 'invoiced', label: 'Invoiced' },
                                { value: 'completed', label: 'Completed' },
                                { value: 'rejected', label: 'Rejected' },
                                { value: 'cancelled', label: 'Cancelled' },
                                { value: 'deleted', label: 'Deleted' },
                              ].map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                            <Button
                              variant="danger"
                              size="sm"
                              disabled={!adminPoStatus || adminPoStatus === po.status}
                              loading={adminSetting}
                              onClick={() =>
                                void adminSetPOStatus({
                                  variables: { id: po.id, status: adminPoStatus },
                                }).then(() => {
                                  setShowActionsPanel(false)
                                })
                              }
                            >
                              Apply
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        }
      />

      {lock.lockedByOther && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 16px',
            marginTop: '16px',
            background: `${theme.warning}1a`,
            border: `1px solid ${theme.warning}`,
            borderRadius: '8px',
            fontSize: '13px',
            color: theme.textPrimary,
          }}
        >
          <span
            style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              background: theme.warning,
              flexShrink: 0,
            }}
          />
          <strong>{lock.lockedByName}</strong>&nbsp;is currently working on this purchase order —
          actions are disabled until they finish.
        </div>
      )}

      {/* Status bar */}
      <div style={{ marginTop: '16px', marginBottom: '16px' }}>
        <StatusBar
          steps={(po.priority === 'emergency'
            ? PO_STATUSES.filter((s) =>
                [
                  'draft',
                  'pending_approval',
                  'approved',
                  'goods_received',
                  'finance_audit',
                  'invoiced',
                  'completed',
                ].includes(s.key),
              )
            : PO_STATUSES
          ).map((s) => ({ key: s.key, label: s.label }))}
          currentStep={po.status}
          rejectedSteps={['deleted']}
        />
      </div>

      {/* Summary row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '12px',
          marginBottom: '16px',
        }}
      >
        {[
          {
            label: 'Total',
            value: <AmountDisplay amount={po.total_amount} currency={po.currency_code} />,
          },
          { label: 'Vendor', value: po.vendor_name ?? '—' },
          { label: 'Expected delivery', value: po.expected_delivery_date ?? '—' },
          { label: 'Created by', value: po.created_by_email ?? '—' },
        ].map(({ label, value }) => (
          <Card key={label} style={{ padding: '12px' }}>
            <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '4px' }}>
              {label}
            </div>
            <div style={{ fontSize: '13px', color: theme.textPrimary }}>{value}</div>
          </Card>
        ))}
        {/* Receiver card — always editable */}
        <Card style={{ padding: '12px' }}>
          <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '4px' }}>
            Assigned receiver
          </div>
          <select
            value={po.assigned_receiver_id ?? ''}
            onChange={(e) =>
              void setReceiver({ variables: { id: po.id, employeeId: e.target.value || null } })
            }
            style={{
              width: '100%',
              fontSize: '13px',
              color: po.assigned_receiver_id ? theme.textPrimary : theme.textMuted,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            <option value="">— Unassigned —</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.first_name} {e.last_name}
                {e.job_title ? ` (${e.job_title})` : ''}
              </option>
            ))}
          </select>
        </Card>
      </div>

      {/* Inline action panel — replaces the former Action tab */}
      {!['completed', 'deleted', 'cancelled'].includes(po.status) && (
        <Card
          style={{
            marginBottom: '16px',
            padding: '16px 20px',
            borderLeft: `3px solid ${theme.accent}`,
          }}
        >
          {/* This panel covers every PO lifecycle stage's actions in one place —
              wrapping it all in a fieldset is a single, guaranteed-complete way
              to hard-block every mutating action while someone else holds the
              edit lock, instead of hand-tagging dozens of scattered buttons. */}
          <fieldset disabled={lock.lockedByOther} style={{ border: 'none', padding: 0, margin: 0 }}>
            <div
              style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke={theme.accent}
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  color: theme.accent,
                  textTransform: 'uppercase',
                  letterSpacing: '0.07em',
                }}
              >
                Next step
              </span>
              <Badge variant={getPOStatusVariant(po.status)}>{getPOStatusLabel(po.status)}</Badge>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {po.status === 'draft' &&
                (po.priority === 'emergency' ? (
                  <>
                    <div
                      style={{
                        padding: '10px 14px',
                        borderRadius: '8px',
                        background: '#fff7ed',
                        border: '1px solid #fdba74',
                        fontSize: '13px',
                        color: '#9a3412',
                      }}
                    >
                      Emergency PO — skips inventory check, store pricing, and market pricing.
                      Submitting will send directly for approval.
                    </div>
                    <Button
                      variant="primary"
                      loading={anyLoading}
                      onClick={() =>
                        void submitToInventory({
                          variables: { id: po.id, notes: actionNotes || undefined },
                        })
                      }
                    >
                      Submit for Approval
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="primary"
                    loading={anyLoading}
                    onClick={() =>
                      void submitToInventory({
                        variables: { id: po.id, notes: actionNotes || undefined },
                      })
                    }
                  >
                    Submit for inventory check
                  </Button>
                ))}

              {po.status === 'inventory_check' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div
                    style={{
                      fontSize: '12px',
                      fontWeight: 600,
                      color: theme.textMuted,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    Stock availability — enter quantity to take from stock
                  </div>
                  {stockAvailability.length === 0 && (
                    <div style={{ fontSize: '13px', color: theme.textMuted }}>
                      Loading stock levels…
                    </div>
                  )}
                  {stockAvailability.map((avail) => {
                    const fromStock = lineStockQtys[avail.lineId] ?? 0
                    const toPurchase = Math.max(avail.qtyRequired - fromStock, 0)
                    const statusColor = avail.isAvailable
                      ? '#16a34a'
                      : avail.qtyOnHand > 0
                        ? '#d97706'
                        : '#dc2626'
                    const statusLabel = avail.isAvailable
                      ? 'In stock'
                      : avail.qtyOnHand > 0
                        ? 'Partial'
                        : 'Out of stock'
                    return (
                      <div
                        key={avail.lineId}
                        style={{
                          padding: '12px 14px',
                          borderRadius: '7px',
                          border: `1px solid ${theme.border}`,
                          background: theme.bgSurface,
                        }}
                      >
                        <div
                          style={{
                            fontSize: '13px',
                            color: theme.textPrimary,
                            marginBottom: '6px',
                          }}
                        >
                          {avail.description || avail.productName || '—'}
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            gap: '16px',
                            fontSize: '12px',
                            color: theme.textMuted,
                            flexWrap: 'wrap',
                            marginBottom: '8px',
                          }}
                        >
                          <span>
                            Required:{' '}
                            <strong style={{ color: theme.textPrimary }}>
                              {avail.qtyRequired}
                            </strong>
                          </span>
                          <span>
                            On hand:{' '}
                            <strong style={{ color: theme.textPrimary }}>
                              {avail.qtyOnHand.toFixed(2)}
                            </strong>
                          </span>
                          <span>
                            Available:{' '}
                            <strong style={{ color: theme.textPrimary }}>
                              {avail.qtyAvailable.toFixed(2)}
                            </strong>
                          </span>
                          <span style={{ color: statusColor, fontWeight: 600 }}>{statusLabel}</span>
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            gap: '12px',
                            alignItems: 'flex-end',
                            flexWrap: 'wrap',
                          }}
                        >
                          <div>
                            <label
                              style={{
                                fontSize: '11px',
                                color: theme.textMuted,
                                display: 'block',
                                marginBottom: '4px',
                              }}
                            >
                              From stock
                            </label>
                            <input
                              type="number"
                              min={0}
                              max={avail.qtyRequired}
                              value={fromStock}
                              onChange={(e) => {
                                const v = Math.max(
                                  0,
                                  Math.min(avail.qtyRequired, parseFloat(e.target.value) || 0),
                                )
                                setLineStockQtys((p) => ({ ...p, [avail.lineId]: v }))
                              }}
                              style={{
                                width: '120px',
                                padding: '6px 10px',
                                borderRadius: '6px',
                                border: `1px solid ${theme.border}`,
                                background: theme.bgCanvas,
                                color: theme.textPrimary,
                                fontSize: '13px',
                              }}
                            />
                          </div>
                          <div>
                            <label
                              style={{
                                fontSize: '11px',
                                color: theme.textMuted,
                                display: 'block',
                                marginBottom: '4px',
                              }}
                            >
                              To purchase
                            </label>
                            <div
                              style={{
                                width: '120px',
                                padding: '6px 10px',
                                borderRadius: '6px',
                                border: `1px solid ${theme.border}`,
                                background: theme.bgCanvas,
                                color: theme.textMuted,
                                fontSize: '13px',
                              }}
                            >
                              {toPurchase}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  <Button
                    variant="primary"
                    loading={anyLoading}
                    onClick={() =>
                      void confirmInventory({
                        variables: {
                          id: po.id,
                          lineStockQtys: stockAvailability.map((avail) => ({
                            lineId: avail.lineId,
                            qtyFromStock: lineStockQtys[avail.lineId] ?? 0,
                          })),
                          notes: actionNotes || undefined,
                        },
                      })
                    }
                  >
                    Confirm inventory check
                  </Button>
                </div>
              )}

              {po.status === 'ready_to_issue' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div
                    style={{
                      padding: '12px 14px',
                      borderRadius: '7px',
                      background: '#f0fdf4',
                      border: '1px solid #16a34a',
                      fontSize: '13px',
                      color: '#166534',
                    }}
                  >
                    All items confirmed in stock. Approve to issue directly from inventory.
                  </div>
                  {po.lines
                    .filter((l) => l.qty_from_stock > 0)
                    .map((line) => (
                      <div
                        key={line.id}
                        style={{
                          padding: '10px 14px',
                          borderRadius: '7px',
                          border: `1px solid ${theme.border}`,
                          background: theme.bgSurface,
                          fontSize: '13px',
                          display: 'flex',
                          justifyContent: 'space-between',
                        }}
                      >
                        <span style={{ color: theme.textPrimary }}>
                          {line.description || line.product_name || '—'}
                        </span>
                        <span style={{ color: theme.textMuted }}>
                          Issue {line.qty_from_stock} {line.uom} from stock
                        </span>
                      </div>
                    ))}
                  <Button
                    variant="primary"
                    loading={anyLoading}
                    onClick={() =>
                      void approveIssuance({
                        variables: { id: po.id, notes: actionNotes || undefined },
                      })
                    }
                  >
                    Approve &amp; Issue from Stock
                  </Button>
                </div>
              )}

              {po.status === 'store_pricing' &&
                (() => {
                  const purchaseLines = po.lines.filter((l) => l.qty - (l.qty_from_stock || 0) > 0)
                  const stockCovered = po.lines.length - purchaseLines.length
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div
                        style={{
                          fontSize: '12px',
                          fontWeight: 600,
                          color: theme.textMuted,
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                        }}
                      >
                        Enter store prices
                      </div>
                      {stockCovered > 0 && (
                        <div
                          style={{
                            fontSize: '12px',
                            color: theme.textMuted,
                            padding: '8px 12px',
                            borderRadius: '6px',
                            background: theme.bgSurface,
                            border: `1px solid ${theme.border}`,
                          }}
                        >
                          {stockCovered} line(s) covered from stock — showing only lines to be
                          purchased
                        </div>
                      )}
                      {purchaseLines.map((line) => {
                        const purchaseQty = line.qty - (line.qty_from_stock || 0)
                        const defaultSp = {
                          price: String(line.store_price ?? ''),
                          currency: line.store_price_currency ?? po.currency_code,
                        }
                        const sp = storePrices[line.id] ?? defaultSp
                        return (
                          <div
                            key={line.id}
                            style={{
                              padding: '10px 14px',
                              borderRadius: '7px',
                              border: `1px solid ${theme.border}`,
                              background: theme.bgSurface,
                            }}
                          >
                            <div
                              style={{
                                fontSize: '13px',
                                color: theme.textPrimary,
                                marginBottom: '8px',
                              }}
                            >
                              {line.description || line.product_name || '—'}{' '}
                              <span style={{ color: theme.textMuted }}>
                                × {purchaseQty} {line.uom}
                              </span>
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <input
                                type="number"
                                step="any"
                                min="0"
                                placeholder="Store price"
                                value={sp.price}
                                onChange={(e) => {
                                  const val = e.target.value
                                  setStorePrices((p) => {
                                    const cur = p[line.id] ?? defaultSp
                                    return { ...p, [line.id]: { ...cur, price: val } }
                                  })
                                }}
                                style={{
                                  flex: 1,
                                  padding: '6px 10px',
                                  borderRadius: '6px',
                                  border: `1px solid ${theme.border}`,
                                  background: theme.bgCanvas,
                                  color: theme.textPrimary,
                                  fontSize: '13px',
                                }}
                              />
                              <SearchableSelect
                                value={sp.currency}
                                onChange={(v) => {
                                  setStorePrices((p) => {
                                    const cur = p[line.id] ?? defaultSp
                                    return { ...p, [line.id]: { ...cur, currency: v } }
                                  })
                                }}
                                options={[
                                  { value: 'IQD', label: 'IQD' },
                                  { value: 'USD', label: 'USD' },
                                  { value: 'EUR', label: 'EUR' },
                                ]}
                              />
                            </div>
                          </div>
                        )
                      })}
                      <Button
                        variant="primary"
                        loading={anyLoading}
                        onClick={() =>
                          void submitStorePricing({
                            variables: {
                              id: po.id,
                              linePrices: purchaseLines.map((line) => {
                                const sp = storePrices[line.id] ?? {
                                  price: String(line.store_price ?? '0'),
                                  currency: line.store_price_currency ?? po.currency_code,
                                }
                                return {
                                  lineId: line.id,
                                  storePrice: parseFloat(sp.price) || 0,
                                  currencyCode: sp.currency,
                                }
                              }),
                            },
                          })
                        }
                      >
                        Submit store pricing
                      </Button>
                    </div>
                  )
                })()}

              {po.status === 'market_pricing' &&
                (() => {
                  const purchaseLines = po.lines.filter((l) => l.qty - (l.qty_from_stock || 0) > 0)
                  const stockCovered = po.lines.length - purchaseLines.length
                  const allPricesEntered = purchaseLines.every((l) => {
                    const mp = marketPrices[l.id] ?? { price: String(l.market_price ?? '') }
                    return parseFloat(mp.price) > 0
                  })
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div
                        style={{
                          fontSize: '12px',
                          fontWeight: 600,
                          color: theme.textMuted,
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                        }}
                      >
                        Enter market prices
                      </div>
                      {stockCovered > 0 && (
                        <div
                          style={{
                            fontSize: '12px',
                            color: theme.textMuted,
                            padding: '8px 12px',
                            borderRadius: '6px',
                            background: theme.bgSurface,
                            border: `1px solid ${theme.border}`,
                          }}
                        >
                          {stockCovered} line(s) covered from stock — showing only lines to be
                          purchased
                        </div>
                      )}
                      {purchaseLines.map((line) => {
                        const defaultMp = {
                          price: String(line.market_price ?? ''),
                          currency: line.market_price_currency ?? po.currency_code,
                          quoteRef: '',
                        }
                        const mp = marketPrices[line.id] ?? defaultMp
                        const priceEmpty = !parseFloat(mp.price)
                        return (
                          <div
                            key={line.id}
                            style={{
                              padding: '10px 14px',
                              borderRadius: '7px',
                              border: `1px solid ${priceEmpty ? '#ef4444' : theme.border}`,
                              background: theme.bgSurface,
                            }}
                          >
                            <div
                              style={{
                                fontSize: '13px',
                                color: theme.textPrimary,
                                marginBottom: '8px',
                              }}
                            >
                              {line.description || line.product_name || '—'}{' '}
                              <span style={{ color: theme.textMuted }}>
                                × {line.qty} {line.uom}
                              </span>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                              <input
                                type="number"
                                step="any"
                                min="0"
                                placeholder="Market price *"
                                value={mp.price}
                                onChange={(e) => {
                                  const val = e.target.value
                                  setMarketPrices((p) => {
                                    const cur = p[line.id] ?? defaultMp
                                    return { ...p, [line.id]: { ...cur, price: val } }
                                  })
                                }}
                                style={{
                                  flex: 1,
                                  minWidth: '120px',
                                  padding: '6px 10px',
                                  borderRadius: '6px',
                                  border: `1px solid ${priceEmpty ? '#ef4444' : theme.border}`,
                                  background: theme.bgCanvas,
                                  color: theme.textPrimary,
                                  fontSize: '13px',
                                }}
                              />
                              <SearchableSelect
                                value={mp.currency}
                                onChange={(v) => {
                                  setMarketPrices((p) => {
                                    const cur = p[line.id] ?? defaultMp
                                    return { ...p, [line.id]: { ...cur, currency: v } }
                                  })
                                }}
                                options={[
                                  { value: 'IQD', label: 'IQD' },
                                  { value: 'USD', label: 'USD' },
                                  { value: 'EUR', label: 'EUR' },
                                ]}
                              />
                            </div>
                          </div>
                        )
                      })}
                      {!allPricesEntered && (
                        <div style={{ fontSize: '12px', color: '#ef4444' }}>
                          All lines require a price greater than 0 before submitting.
                        </div>
                      )}
                      <Button
                        variant="primary"
                        loading={anyLoading}
                        disabled={!allPricesEntered}
                        onClick={() =>
                          void submitMarketPricing({
                            variables: {
                              id: po.id,
                              vendorId: po.vendor_id || undefined,
                              linePrices: purchaseLines.map((line) => {
                                const mp = marketPrices[line.id] ?? {
                                  price: String(line.market_price ?? ''),
                                  currency: line.market_price_currency ?? po.currency_code,
                                  quoteRef: '',
                                }
                                return {
                                  lineId: line.id,
                                  marketPrice: parseFloat(mp.price) || 0,
                                  currencyCode: mp.currency,
                                }
                              }),
                            },
                          })
                        }
                      >
                        Submit market pricing
                      </Button>
                    </div>
                  )
                })()}

              {po.status === 'price_verification' &&
                (() => {
                  const purchaseLines = po.lines.filter((l) => l.qty - (l.qty_from_stock || 0) > 0)
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div
                        style={{
                          fontSize: '12px',
                          fontWeight: 600,
                          color: theme.textMuted,
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                        }}
                      >
                        Verify prices then submit for approval
                      </div>
                      {purchaseLines.map((line) => (
                        <div
                          key={line.id}
                          style={{
                            padding: '10px 14px',
                            borderRadius: '7px',
                            border: `1px solid ${theme.border}`,
                            background: theme.bgSurface,
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            fontSize: '13px',
                          }}
                        >
                          <span style={{ color: theme.textPrimary }}>
                            {line.description || line.product_name || '—'}{' '}
                            <span style={{ color: theme.textMuted }}>
                              × {line.qty} {line.uom}
                            </span>
                          </span>
                          <span
                            style={{
                              color: line.unit_price > 0 ? theme.textPrimary : '#ef4444',
                              fontWeight: 600,
                            }}
                          >
                            {line.unit_price > 0
                              ? `${line.unit_price.toLocaleString()} ${line.market_price_currency ?? po.currency_code}`
                              : 'No price set'}
                          </span>
                        </div>
                      ))}
                      {purchaseLines.some((l) => !(l.unit_price > 0)) && (
                        <div
                          style={{
                            fontSize: '12px',
                            color: '#ef4444',
                            padding: '8px 12px',
                            borderRadius: '6px',
                            background: '#fef2f2',
                            border: '1px solid #fecaca',
                          }}
                        >
                          Warning: one or more lines have no price. Go back to market pricing to set
                          them.
                        </div>
                      )}
                      <Button
                        variant="primary"
                        loading={anyLoading}
                        onClick={() =>
                          void submitPriceVerification({
                            variables: {
                              id: po.id,
                              verificationNotes: actionNotes || undefined,
                              lineAdjustments: [],
                            },
                          })
                        }
                      >
                        Submit for approval
                      </Button>
                    </div>
                  )
                })()}

              {po.status === 'pending_approval' &&
                (() => {
                  const fmtN = (n: number | string) =>
                    parseFloat(String(n)).toLocaleString('en-US', {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 2,
                    })
                  return (
                    <>
                      {/* ── Line review panel ─────────────────────────────────────── */}
                      <div
                        style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          color: theme.textMuted,
                          textTransform: 'uppercase',
                          letterSpacing: '0.06em',
                          marginBottom: '8px',
                        }}
                      >
                        Review Lines
                        {hasFlaggedLines && (
                          <span
                            style={{
                              marginLeft: '8px',
                              padding: '2px 8px',
                              borderRadius: '10px',
                              background: theme.warningBg,
                              border: `1px solid ${theme.warningBorder}`,
                              color: theme.warning,
                              fontWeight: 600,
                              fontSize: '10px',
                              textTransform: 'none',
                              letterSpacing: 0,
                            }}
                          >
                            {flaggedLineIds.length} flagged
                          </span>
                        )}
                      </div>

                      <div
                        style={{
                          border: `1px solid ${theme.border}`,
                          borderRadius: '10px',
                          overflow: 'hidden',
                          marginBottom: '14px',
                        }}
                      >
                        {/* Table header */}
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 90px 110px 110px 110px 80px',
                            padding: '7px 12px',
                            background: theme.bgCanvas,
                            borderBottom: `1px solid ${theme.border}`,
                          }}
                        >
                          {['Item', 'Qty', 'Market Price', 'Store Price', 'Total', ''].map(
                            (h, i) => (
                              <div
                                key={i}
                                style={{
                                  fontSize: '10px',
                                  fontWeight: 600,
                                  color: theme.textMuted,
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.06em',
                                }}
                              >
                                {h}
                              </div>
                            ),
                          )}
                        </div>

                        {/* Lines */}
                        {po.lines.map((line) => {
                          const isFlagged = lineFlagNotes[line.id] !== undefined
                          const rowBg = isFlagged ? theme.warningBg : 'transparent'
                          const rowBorder = isFlagged ? theme.warningBorder : theme.border
                          const _fromStock = parseFloat(String(line.qty_from_stock ?? 0))
                          const _totalQty = parseFloat(String(line.qty ?? 0))
                          const _toBuy = Math.max(0, _totalQty - _fromStock)
                          const _sp = parseFloat(String(line.store_price ?? 0))
                          const _mp = parseFloat(String(line.market_price ?? line.unit_price ?? 0))
                          const _stockCost = _fromStock > 0 && _sp > 0 ? _fromStock * _sp : 0
                          const _buyCost =
                            _toBuy * (_mp || parseFloat(String(line.unit_price ?? 0)))
                          const lineEffectiveTotal =
                            _stockCost + _buyCost || parseFloat(String(line.total ?? 0))
                          return (
                            <div
                              key={line.id}
                              style={{
                                borderBottom: `1px solid ${rowBorder}`,
                                background: rowBg,
                                transition: 'background 0.15s',
                              }}
                            >
                              {/* Main row */}
                              <div
                                style={{
                                  display: 'grid',
                                  gridTemplateColumns: '1fr 90px 110px 110px 110px 80px',
                                  padding: '10px 12px',
                                  alignItems: 'center',
                                }}
                              >
                                <div>
                                  <div
                                    style={{
                                      fontSize: '13px',
                                      color: theme.textPrimary,
                                      fontWeight: isFlagged ? 600 : 400,
                                    }}
                                  >
                                    {line.description || line.product_name || '—'}
                                  </div>
                                  {isFlagged && (
                                    <div
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        marginTop: '2px',
                                      }}
                                    >
                                      <svg
                                        width="10"
                                        height="10"
                                        viewBox="0 0 24 24"
                                        fill={theme.warning}
                                        stroke="none"
                                      >
                                        <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7" />
                                      </svg>
                                      <span
                                        style={{
                                          fontSize: '10px',
                                          color: theme.warning,
                                          fontWeight: 600,
                                        }}
                                      >
                                        Flagged
                                      </span>
                                    </div>
                                  )}
                                </div>
                                <div
                                  style={{
                                    fontSize: '13px',
                                    color: theme.textSecondary,
                                    fontVariantNumeric: 'tabular-nums',
                                  }}
                                >
                                  {fmtN(line.qty)} {line.uom}
                                </div>
                                <div
                                  style={{
                                    fontSize: '13px',
                                    color: theme.textSecondary,
                                    fontVariantNumeric: 'tabular-nums',
                                  }}
                                >
                                  {fmtN(line.unit_price)} {po.currency_code}
                                </div>
                                <div
                                  style={{
                                    fontSize: '13px',
                                    color: _sp > 0 ? theme.success : theme.textMuted,
                                    fontVariantNumeric: 'tabular-nums',
                                  }}
                                >
                                  {_sp > 0
                                    ? `${fmtN(_sp)} ${line.store_price_currency ?? po.currency_code}`
                                    : '—'}
                                </div>
                                <div
                                  style={{
                                    fontSize: '13px',
                                    fontWeight: 600,
                                    color: theme.textPrimary,
                                    fontVariantNumeric: 'tabular-nums',
                                  }}
                                >
                                  {fmtN(lineEffectiveTotal)} {po.currency_code}
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                  {isFlagged ? (
                                    <button
                                      onClick={() => {
                                        clearFlag(line.id)
                                      }}
                                      title="Clear flag"
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        padding: '4px 8px',
                                        borderRadius: '5px',
                                        border: `1px solid ${theme.warningBorder}`,
                                        background: 'transparent',
                                        color: theme.warning,
                                        cursor: 'pointer',
                                        fontSize: '11px',
                                        fontWeight: 600,
                                      }}
                                    >
                                      <svg
                                        width="10"
                                        height="10"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2.5"
                                      >
                                        <path d="M18 6L6 18M6 6l12 12" />
                                      </svg>
                                      Clear
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => {
                                        flagLine(line.id)
                                      }}
                                      title="Flag this line"
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        padding: '4px 8px',
                                        borderRadius: '5px',
                                        border: `1px solid ${theme.border}`,
                                        background: 'transparent',
                                        color: theme.textMuted,
                                        cursor: 'pointer',
                                        fontSize: '11px',
                                        fontWeight: 500,
                                      }}
                                      onMouseEnter={(e) => {
                                        e.currentTarget.style.borderColor = theme.warning
                                        e.currentTarget.style.color = theme.warning
                                      }}
                                      onMouseLeave={(e) => {
                                        e.currentTarget.style.borderColor = theme.border
                                        e.currentTarget.style.color = theme.textMuted
                                      }}
                                    >
                                      <svg
                                        width="10"
                                        height="10"
                                        viewBox="0 0 24 24"
                                        fill="currentColor"
                                        stroke="none"
                                      >
                                        <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7" />
                                      </svg>
                                      Flag
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* Pricing & stock breakdown strip */}
                              {(() => {
                                const fromStock = parseFloat(String(line.qty_from_stock ?? 0))
                                const totalQty = parseFloat(String(line.qty ?? 0))
                                const toBuy = Math.max(0, totalQty - fromStock)
                                const hasStock = fromStock > 0
                                const hasBuy = toBuy > 0
                                const sp = parseFloat(String(line.store_price ?? 0))
                                const mp = parseFloat(String(line.market_price ?? 0))
                                if (!hasStock && !hasBuy && sp === 0 && mp === 0) return null
                                const chipBase: React.CSSProperties = {
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  padding: '2px 8px',
                                  borderRadius: '10px',
                                  fontSize: '11px',
                                  fontWeight: 500,
                                  fontVariantNumeric: 'tabular-nums',
                                  whiteSpace: 'nowrap',
                                }
                                return (
                                  <div
                                    style={{
                                      padding: '0 12px 10px',
                                      display: 'flex',
                                      gap: '6px',
                                      flexWrap: 'wrap',
                                    }}
                                  >
                                    {hasStock && (
                                      <span
                                        style={{
                                          ...chipBase,
                                          background: theme.successBg,
                                          border: `1px solid ${theme.successBorder}`,
                                          color: theme.success,
                                        }}
                                      >
                                        <svg
                                          width="9"
                                          height="9"
                                          viewBox="0 0 24 24"
                                          fill="none"
                                          stroke="currentColor"
                                          strokeWidth="2.5"
                                        >
                                          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                                        </svg>
                                        {fmtN(fromStock)} {line.uom} from inventory
                                      </span>
                                    )}
                                    {hasBuy && (
                                      <span
                                        style={{
                                          ...chipBase,
                                          background: theme.infoBg,
                                          border: `1px solid ${theme.infoBorder}`,
                                          color: theme.info,
                                        }}
                                      >
                                        <svg
                                          width="9"
                                          height="9"
                                          viewBox="0 0 24 24"
                                          fill="none"
                                          stroke="currentColor"
                                          strokeWidth="2.5"
                                        >
                                          <circle cx="9" cy="21" r="1" />
                                          <circle cx="20" cy="21" r="1" />
                                          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                                        </svg>
                                        {fmtN(toBuy)} {line.uom} to purchase
                                      </span>
                                    )}
                                    {mp > 0 && (
                                      <span
                                        style={{
                                          ...chipBase,
                                          background: theme.bgCanvas,
                                          border: `1px solid ${theme.border}`,
                                          color: theme.textSecondary,
                                        }}
                                      >
                                        Market price: {fmtN(mp)}{' '}
                                        {line.market_price_currency ?? po.currency_code}
                                      </span>
                                    )}
                                  </div>
                                )
                              })()}

                              {/* Flag note input — only shown when flagged */}
                              {isFlagged && (
                                <div style={{ padding: '0 12px 10px' }}>
                                  <div
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '6px',
                                      marginBottom: '4px',
                                    }}
                                  >
                                    <svg
                                      width="11"
                                      height="11"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke={theme.warning}
                                      strokeWidth="2"
                                    >
                                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                                    </svg>
                                    <span
                                      style={{
                                        fontSize: '11px',
                                        color: theme.warning,
                                        fontWeight: 600,
                                      }}
                                    >
                                      Reason for flagging (will appear in rejection note)
                                    </span>
                                  </div>
                                  <textarea
                                    value={lineFlagNotes[line.id]}
                                    onChange={(e) => {
                                      setFlagNote(line.id, e.target.value)
                                    }}
                                    placeholder={`e.g. Price is higher than market rate, quantity exceeds project requirement…`}
                                    rows={2}
                                    autoFocus
                                    style={{
                                      width: '100%',
                                      padding: '8px 10px',
                                      fontSize: '12px',
                                      resize: 'vertical',
                                      border: `1px solid ${theme.warningBorder}`,
                                      borderRadius: '6px',
                                      background: 'transparent',
                                      color: theme.textPrimary,
                                      fontFamily: 'inherit',
                                      outline: 'none',
                                      boxSizing: 'border-box',
                                    }}
                                    onFocus={(e) => {
                                      e.currentTarget.style.borderColor = theme.warning
                                    }}
                                    onBlur={(e) => {
                                      e.currentTarget.style.borderColor = theme.warningBorder
                                    }}
                                  />
                                </div>
                              )}
                            </div>
                          )
                        })}

                        {/* Totals footer */}
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 90px 110px 110px 110px 80px',
                            padding: '8px 12px',
                            background: theme.bgCanvas,
                          }}
                        >
                          <div
                            style={{
                              gridColumn: '1 / 5',
                              fontSize: '11px',
                              color: theme.textMuted,
                            }}
                          >
                            {po.lines.length} line{po.lines.length !== 1 ? 's' : ''}
                          </div>
                          <div
                            style={{
                              fontSize: '13px',
                              fontWeight: 700,
                              color: theme.textPrimary,
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            {fmtN(
                              po.lines.reduce((sum, l) => {
                                const fs = parseFloat(String(l.qty_from_stock ?? 0))
                                const tb = Math.max(0, parseFloat(String(l.qty ?? 0)) - fs)
                                const sp = parseFloat(String(l.store_price ?? 0))
                                const mp = parseFloat(String(l.market_price ?? l.unit_price ?? 0))
                                return (
                                  sum +
                                  (fs > 0 && sp > 0 ? fs * sp : 0) +
                                  tb * (mp || parseFloat(String(l.unit_price ?? 0)))
                                )
                              }, 0) || po.total_amount,
                            )}{' '}
                            {po.currency_code}
                          </div>
                          <div />
                        </div>
                      </div>

                      {/* Flagged banner */}
                      {hasFlaggedLines && (
                        <div
                          style={{
                            padding: '10px 14px',
                            borderRadius: '8px',
                            background: theme.warningBg,
                            border: `1px solid ${theme.warningBorder}`,
                            marginBottom: '14px',
                            fontSize: '12px',
                            color: theme.warning,
                            fontWeight: 500,
                          }}
                        >
                          {flaggedLineIds.length} line{flaggedLineIds.length !== 1 ? 's' : ''}{' '}
                          flagged — clear all flags to approve, or reject with the reason below.
                        </div>
                      )}

                      {/* ── Approve ───────────────────────────────────────────────── */}
                      <Button
                        variant="primary"
                        loading={anyLoading}
                        disabled={hasFlaggedLines}
                        onClick={() => void approvePO({ variables: { id: po.id } })}
                      >
                        Approve PO
                      </Button>

                      {/* ── Reject ────────────────────────────────────────────────── */}
                      <div style={{ paddingTop: '12px', borderTop: `1px dashed ${theme.border}` }}>
                        <label
                          style={{
                            fontSize: '12px',
                            color: theme.textMuted,
                            display: 'block',
                            marginBottom: '4px',
                          }}
                        >
                          Rejection reason{' '}
                          {hasFlaggedLines
                            ? '(pre-filled from flags — edit as needed)'
                            : '(required to reject)'}
                        </label>
                        <textarea
                          value={effectiveRejectReason}
                          onChange={(e) => {
                            setRejectReason(e.target.value)
                          }}
                          placeholder="Enter reason…"
                          rows={hasFlaggedLines ? 3 : 2}
                          style={{
                            width: '100%',
                            padding: '8px',
                            borderRadius: '6px',
                            resize: 'vertical',
                            border: `1px solid ${effectiveRejectReason ? theme.warningBorder : theme.border}`,
                            background: theme.bgSurface,
                            color: theme.textPrimary,
                            fontSize: '13px',
                            fontFamily: 'inherit',
                            outline: 'none',
                            boxSizing: 'border-box',
                          }}
                          onFocus={(e) => {
                            e.currentTarget.style.borderColor = theme.accent
                          }}
                          onBlur={(e) => {
                            e.currentTarget.style.borderColor = effectiveRejectReason
                              ? theme.warningBorder
                              : theme.border
                          }}
                        />
                        <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                          <Button
                            variant="danger"
                            disabled={!effectiveRejectReason}
                            onClick={() =>
                              void rejectPO({
                                variables: { id: po.id, reason: effectiveRejectReason },
                              })
                            }
                          >
                            Reject PO
                          </Button>
                          <Button
                            variant="ghost"
                            disabled={!effectiveRejectReason}
                            onClick={() =>
                              void rejectToMarket({
                                variables: { id: po.id, reason: effectiveRejectReason },
                              })
                            }
                          >
                            Reject to market pricing
                          </Button>
                        </div>
                      </div>
                    </>
                  )
                })()}

              {po.status === 'approved' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div
                    style={{
                      padding: '10px 14px',
                      borderRadius: '8px',
                      background: '#f0fdf4',
                      border: '1px solid #16a34a',
                      fontSize: '13px',
                      color: '#166534',
                    }}
                  >
                    PO is approved. Record a goods receipt to advance to the P2P fulfillment phase.
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      navigate(`/procurement/purchase-orders/${po.id}/receive`)
                    }}
                  >
                    Record Receipt
                  </Button>
                </div>
              )}

              {po.status === 'goods_received' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div
                    style={{
                      padding: '10px 14px',
                      borderRadius: '8px',
                      background: '#f0fdf4',
                      border: '1px solid #16a34a',
                      fontSize: '13px',
                      color: '#166534',
                    }}
                  >
                    Goods received. Review receipts below, then send to finance for three-way match
                    audit.
                  </div>
                  {/* Qty summary per line */}
                  <div
                    style={{
                      border: `1px solid ${theme.border}`,
                      borderRadius: '7px',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 90px 90px 80px',
                        padding: '6px 12px',
                        background: theme.bgSurface,
                        borderBottom: `1px solid ${theme.border}`,
                      }}
                    >
                      {['Item', 'Ordered', 'Received', 'Coverage'].map((h) => (
                        <span
                          key={h}
                          style={{
                            fontSize: '11px',
                            fontWeight: 600,
                            color: theme.textMuted,
                            textTransform: 'uppercase',
                          }}
                        >
                          {h}
                        </span>
                      ))}
                    </div>
                    {po.lines.map((line) => {
                      const fmtQ = (n: number | string) =>
                        parseFloat(String(n)).toLocaleString('en-US', {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 2,
                        })
                      const rcv = parseFloat(String(line.qty_received ?? 0))
                      const fromStk = parseFloat(String(line.qty_from_stock ?? 0))
                      const ord = parseFloat(String(line.qty ?? 0))
                      const fulfilled = Math.min(ord, rcv + fromStk)
                      const pct = ord > 0 ? Math.min(100, Math.round((fulfilled / ord) * 100)) : 0
                      const color =
                        fulfilled >= ord ? '#16a34a' : fulfilled > 0 ? '#d97706' : '#dc2626'
                      return (
                        <div
                          key={line.id}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 90px 90px 80px',
                            padding: '8px 12px',
                            borderBottom: `1px solid ${theme.border}`,
                            alignItems: 'center',
                          }}
                        >
                          <span style={{ fontSize: '13px', color: theme.textPrimary }}>
                            {line.description || line.product_name || '—'}
                          </span>
                          <span
                            style={{
                              fontSize: '13px',
                              color: theme.textMuted,
                              fontFamily: 'monospace',
                            }}
                          >
                            {fmtQ(ord)} {line.uom}
                          </span>
                          <div>
                            <span
                              style={{
                                fontSize: '13px',
                                fontWeight: 600,
                                color,
                                fontFamily: 'monospace',
                              }}
                            >
                              {fmtQ(fulfilled)} {line.uom}
                            </span>
                            {fromStk > 0 && (
                              <div style={{ fontSize: '11px', color: '#16a34a', marginTop: '1px' }}>
                                {fmtQ(rcv)} received + {fmtQ(fromStk)} from stock
                              </div>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <div
                              style={{
                                flex: 1,
                                height: '6px',
                                borderRadius: '3px',
                                background: theme.border,
                                overflow: 'hidden',
                              }}
                            >
                              <div
                                style={{
                                  height: '100%',
                                  width: `${pct}%`,
                                  background: color,
                                  borderRadius: '3px',
                                }}
                              />
                            </div>
                            <span
                              style={{
                                fontSize: '11px',
                                color,
                                fontWeight: 600,
                                minWidth: '32px',
                                textAlign: 'right',
                              }}
                            >
                              {pct}%
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <Button
                    variant="primary"
                    loading={lAudit}
                    onClick={() => void sendToAudit({ variables: { id: po.id } })}
                  >
                    Send to Finance Audit
                  </Button>
                </div>
              )}

              {po.status === 'finance_audit' &&
                (() => {
                  const flaggedCount = po.lines.filter((l) => l.audit_status === 'flagged').length
                  const pendingCount = po.lines.filter(
                    (l) => !l.audit_status || l.audit_status === 'pending',
                  ).length
                  const canPass = flaggedCount === 0 && pendingCount === 0
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div
                        style={{
                          fontSize: '12px',
                          fontWeight: 600,
                          color: theme.textMuted,
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                        }}
                      >
                        Finance Audit — mark each line OK or Flagged
                      </div>
                      {po.lines.map((line) => {
                        const auditStatus = line.audit_status ?? 'pending'
                        const bgOk = auditStatus === 'ok' ? '#f0fdf4' : 'transparent'
                        const bgFlag = auditStatus === 'flagged' ? '#fef2f2' : 'transparent'
                        const borderColor =
                          auditStatus === 'ok'
                            ? '#16a34a'
                            : auditStatus === 'flagged'
                              ? '#ef4444'
                              : theme.border
                        return (
                          <div
                            key={line.id}
                            style={{
                              padding: '10px 14px',
                              borderRadius: '7px',
                              border: `1px solid ${borderColor}`,
                              background:
                                auditStatus === 'ok'
                                  ? bgOk
                                  : auditStatus === 'flagged'
                                    ? bgFlag
                                    : theme.bgSurface,
                            }}
                          >
                            {/* Top row: name + OK/Flag buttons */}
                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'flex-start',
                                gap: '8px',
                                flexWrap: 'wrap',
                              }}
                            >
                              <div
                                style={{
                                  fontSize: '13px',
                                  color: theme.textPrimary,
                                  fontWeight: 500,
                                }}
                              >
                                {line.description || line.product_name || '—'}
                              </div>
                              <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                                <button
                                  onClick={() =>
                                    void setLineAuditStatus({
                                      variables: {
                                        poId: po.id,
                                        lineId: line.id,
                                        auditStatus: 'ok',
                                      },
                                    })
                                  }
                                  style={{
                                    padding: '5px 12px',
                                    borderRadius: '5px',
                                    border: `1px solid ${auditStatus === 'ok' ? '#16a34a' : theme.border}`,
                                    background: auditStatus === 'ok' ? '#16a34a' : 'transparent',
                                    color: auditStatus === 'ok' ? '#fff' : theme.textMuted,
                                    cursor: 'pointer',
                                    fontSize: '12px',
                                    fontWeight: 600,
                                    transition: 'all 0.1s',
                                  }}
                                >
                                  ✓ OK
                                </button>
                                <button
                                  onClick={() => {
                                    setFlaggingLines((p) => ({
                                      ...p,
                                      [line.id]: line.audit_note ?? '',
                                    }))
                                  }}
                                  style={{
                                    padding: '5px 12px',
                                    borderRadius: '5px',
                                    border: `1px solid ${auditStatus === 'flagged' ? '#ef4444' : theme.border}`,
                                    background:
                                      auditStatus === 'flagged' ? '#ef4444' : 'transparent',
                                    color: auditStatus === 'flagged' ? '#fff' : theme.textMuted,
                                    cursor: 'pointer',
                                    fontSize: '12px',
                                    fontWeight: 600,
                                    transition: 'all 0.1s',
                                  }}
                                >
                                  ⚑ Flag
                                </button>
                              </div>
                            </div>

                            {/* Qty fulfilled vs ordered (received + from stock) */}
                            {(() => {
                              const fmtQ = (n: number | string) =>
                                parseFloat(String(n)).toLocaleString('en-US', {
                                  minimumFractionDigits: 0,
                                  maximumFractionDigits: 2,
                                })
                              const rcv = parseFloat(String(line.qty_received ?? 0))
                              const fromStk = parseFloat(String(line.qty_from_stock ?? 0))
                              const ord = parseFloat(String(line.qty ?? 0))
                              const fulfilled = Math.min(ord, rcv + fromStk)
                              const pct =
                                ord > 0 ? Math.min(100, Math.round((fulfilled / ord) * 100)) : 0
                              const short = fulfilled < ord
                              const over = rcv > ord
                              const qtyColor = over ? '#d97706' : short ? '#dc2626' : '#16a34a'
                              return (
                                <div style={{ marginTop: '8px' }}>
                                  <div
                                    style={{
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      alignItems: 'center',
                                      marginBottom: '4px',
                                    }}
                                  >
                                    <span style={{ fontSize: '12px', color: theme.textMuted }}>
                                      Fulfilled / ordered
                                    </span>
                                    <div style={{ textAlign: 'right' }}>
                                      <span
                                        style={{
                                          fontSize: '13px',
                                          fontWeight: 700,
                                          color: qtyColor,
                                          fontFamily: 'monospace',
                                        }}
                                      >
                                        {fmtQ(fulfilled)} / {fmtQ(ord)} {line.uom}
                                        {short && (
                                          <span
                                            style={{
                                              fontSize: '11px',
                                              fontWeight: 400,
                                              marginLeft: '6px',
                                              color: '#dc2626',
                                            }}
                                          >
                                            ({fmtQ(ord - fulfilled)} short)
                                          </span>
                                        )}
                                        {over && (
                                          <span
                                            style={{
                                              fontSize: '11px',
                                              fontWeight: 400,
                                              marginLeft: '6px',
                                              color: '#d97706',
                                            }}
                                          >
                                            (over by {fmtQ(rcv - ord)})
                                          </span>
                                        )}
                                      </span>
                                      {fromStk > 0 && (
                                        <div
                                          style={{
                                            fontSize: '11px',
                                            color: '#16a34a',
                                            marginTop: '1px',
                                          }}
                                        >
                                          {fmtQ(rcv)} received + {fmtQ(fromStk)} from stock
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                  <div
                                    style={{
                                      height: '6px',
                                      borderRadius: '3px',
                                      background: theme.border,
                                      overflow: 'hidden',
                                    }}
                                  >
                                    <div
                                      style={{
                                        height: '100%',
                                        width: `${pct}%`,
                                        borderRadius: '3px',
                                        background: qtyColor,
                                        transition: 'width 0.3s',
                                      }}
                                    />
                                  </div>
                                </div>
                              )
                            })()}

                            {/* Price comparison */}
                            {(() => {
                              const fmtN = (n: number | string) =>
                                parseFloat(String(n)).toLocaleString('en-US', {
                                  minimumFractionDigits: 0,
                                  maximumFractionDigits: 2,
                                })
                              const poPrice = parseFloat(String(line.unit_price ?? 0))
                              const actualPrice =
                                line.actual_unit_price != null
                                  ? parseFloat(String(line.actual_unit_price))
                                  : null
                              const fromStock = parseFloat(String(line.qty_from_stock ?? 0))
                              const totalQty = parseFloat(String(line.qty ?? 0))
                              const toBuy = Math.max(0, totalQty - fromStock)
                              const variance =
                                actualPrice != null && poPrice > 0 ? actualPrice - poPrice : null
                              const variancePct =
                                variance != null && poPrice > 0 ? (variance / poPrice) * 100 : null
                              const varColor =
                                variance == null || variance === 0
                                  ? theme.textMuted
                                  : variance > 0
                                    ? '#dc2626'
                                    : '#16a34a'
                              const purchaseTotal = toBuy * (actualPrice ?? poPrice)
                              return (
                                <div
                                  style={{
                                    marginTop: '10px',
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                                    gap: '8px',
                                  }}
                                >
                                  {/* PO Price (market price per unit) */}
                                  <div
                                    style={{
                                      padding: '8px 10px',
                                      borderRadius: '6px',
                                      background: theme.bgSurface,
                                      border: `1px solid ${theme.border}`,
                                    }}
                                  >
                                    <div
                                      style={{
                                        fontSize: '10px',
                                        fontWeight: 700,
                                        color: theme.textMuted,
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.05em',
                                        marginBottom: '3px',
                                      }}
                                    >
                                      PO Price
                                    </div>
                                    <div
                                      style={{
                                        fontSize: '14px',
                                        fontWeight: 700,
                                        color: theme.textPrimary,
                                        fontFamily: 'monospace',
                                      }}
                                    >
                                      {poPrice > 0 ? fmtN(poPrice) : '—'}
                                    </div>
                                    {toBuy > 0 && (
                                      <div
                                        style={{
                                          fontSize: '11px',
                                          color: theme.textMuted,
                                          marginTop: '2px',
                                        }}
                                      >
                                        for {fmtN(toBuy)} {line.uom} to buy
                                      </div>
                                    )}
                                  </div>
                                  {/* Actual Price — for purchased qty only */}
                                  {toBuy > 0 && (
                                    <div
                                      style={{
                                        padding: '8px 10px',
                                        borderRadius: '6px',
                                        background:
                                          actualPrice == null
                                            ? '#fff7ed'
                                            : variance === 0
                                              ? '#f0fdf4'
                                              : variance! > 0
                                                ? '#fef2f2'
                                                : '#f0fdf4',
                                        border: `1px solid ${actualPrice == null ? '#fdba74' : variance === 0 ? '#86efac' : variance! > 0 ? '#fca5a5' : '#86efac'}`,
                                      }}
                                    >
                                      <div
                                        style={{
                                          fontSize: '10px',
                                          fontWeight: 700,
                                          color: theme.textMuted,
                                          textTransform: 'uppercase',
                                          letterSpacing: '0.05em',
                                          marginBottom: '4px',
                                        }}
                                      >
                                        Actual Price{' '}
                                        <span
                                          style={{
                                            fontWeight: 400,
                                            textTransform: 'none',
                                            fontSize: '10px',
                                          }}
                                        >
                                          ({fmtN(toBuy)} {line.uom} purchased)
                                        </span>
                                      </div>
                                      <input
                                        type="number"
                                        min={0}
                                        placeholder="Enter actual price…"
                                        value={
                                          actualPrices[line.id] ??
                                          (actualPrice != null ? String(actualPrice) : '')
                                        }
                                        onChange={(e) => {
                                          setActualPrices((p) => ({
                                            ...p,
                                            [line.id]: e.target.value,
                                          }))
                                        }}
                                        onBlur={(e) => {
                                          const val = parseFloat(e.target.value)
                                          void setLineActualPrice({
                                            variables: {
                                              poId: po.id,
                                              lineId: line.id,
                                              actualUnitPrice: isNaN(val) ? null : val,
                                            },
                                          })
                                        }}
                                        style={{
                                          width: '100%',
                                          padding: '4px 6px',
                                          borderRadius: '4px',
                                          border: `1px solid ${actualPrice == null ? '#fdba74' : variance === 0 ? '#86efac' : variance! > 0 ? '#fca5a5' : '#86efac'}`,
                                          background: 'transparent',
                                          color: varColor,
                                          fontSize: '14px',
                                          fontFamily: 'monospace',
                                          fontWeight: 700,
                                          boxSizing: 'border-box' as const,
                                          outline: 'none',
                                        }}
                                      />
                                      {variancePct != null && Math.abs(variancePct) > 0.01 && (
                                        <div
                                          style={{
                                            fontSize: '11px',
                                            fontWeight: 600,
                                            color: varColor,
                                            marginTop: '3px',
                                          }}
                                        >
                                          {variance! > 0 ? '▲' : '▼'} {variance! > 0 ? '+' : ''}
                                          {variancePct.toFixed(1)}% vs PO
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  {/* Purchase Total (only purchased qty) */}
                                  {toBuy > 0 && (
                                    <div
                                      style={{
                                        padding: '8px 10px',
                                        borderRadius: '6px',
                                        background: theme.bgSurface,
                                        border: `1px solid ${theme.border}`,
                                      }}
                                    >
                                      <div
                                        style={{
                                          fontSize: '10px',
                                          fontWeight: 700,
                                          color: theme.textMuted,
                                          textTransform: 'uppercase',
                                          letterSpacing: '0.05em',
                                          marginBottom: '3px',
                                        }}
                                      >
                                        Purchase Total
                                      </div>
                                      <div
                                        style={{
                                          fontSize: '14px',
                                          fontWeight: 700,
                                          color: theme.textPrimary,
                                          fontFamily: 'monospace',
                                        }}
                                      >
                                        {fmtN(purchaseTotal)}
                                      </div>
                                      <div
                                        style={{
                                          fontSize: '11px',
                                          color: theme.textMuted,
                                          marginTop: '2px',
                                        }}
                                      >
                                        {fmtN(toBuy)} {line.uom} × {fmtN(actualPrice ?? poPrice)}
                                      </div>
                                    </div>
                                  )}
                                  {/* From Stock */}
                                  {fromStock > 0 && (
                                    <div
                                      style={{
                                        padding: '8px 10px',
                                        borderRadius: '6px',
                                        background: '#f0fdf4',
                                        border: '1px solid #86efac',
                                      }}
                                    >
                                      <div
                                        style={{
                                          fontSize: '10px',
                                          fontWeight: 700,
                                          color: '#166534',
                                          textTransform: 'uppercase',
                                          letterSpacing: '0.05em',
                                          marginBottom: '3px',
                                        }}
                                      >
                                        From Inventory
                                      </div>
                                      <div
                                        style={{
                                          fontSize: '14px',
                                          fontWeight: 700,
                                          color: '#166534',
                                          fontFamily: 'monospace',
                                        }}
                                      >
                                        {fmtN(fromStock)} {line.uom}
                                      </div>
                                      <div
                                        style={{
                                          fontSize: '11px',
                                          color: '#16a34a',
                                          marginTop: '2px',
                                        }}
                                      >
                                        No cost — issued from stock
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )
                            })()}

                            {flaggingLines[line.id] !== undefined ? (
                              <div
                                style={{
                                  marginTop: '10px',
                                  padding: '10px',
                                  borderRadius: '6px',
                                  background: '#fef2f2',
                                  border: '1px solid #fca5a5',
                                }}
                              >
                                <div
                                  style={{
                                    fontSize: '12px',
                                    color: '#991b1b',
                                    fontWeight: 600,
                                    marginBottom: '6px',
                                  }}
                                >
                                  ⚑ Flag reason (required)
                                </div>
                                <textarea
                                  autoFocus
                                  value={flaggingLines[line.id]}
                                  onChange={(e) => {
                                    setFlaggingLines((p) => ({ ...p, [line.id]: e.target.value }))
                                  }}
                                  placeholder="Describe the issue with this line…"
                                  rows={2}
                                  style={{
                                    width: '100%',
                                    padding: '6px 8px',
                                    borderRadius: '5px',
                                    border: '1px solid #fca5a5',
                                    background: '#fff',
                                    color: '#991b1b',
                                    fontSize: '12px',
                                    resize: 'vertical',
                                    boxSizing: 'border-box',
                                  }}
                                />
                                <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                                  <button
                                    disabled={!flaggingLines[line.id].trim()}
                                    onClick={() => {
                                      if (!flaggingLines[line.id].trim()) return
                                      void setLineAuditStatus({
                                        variables: {
                                          poId: po.id,
                                          lineId: line.id,
                                          auditStatus: 'flagged',
                                          auditNote: flaggingLines[line.id].trim(),
                                        },
                                      })
                                      setFlaggingLines((p) => {
                                        const n = { ...p }
                                        delete n[line.id]
                                        return n
                                      })
                                    }}
                                    style={{
                                      padding: '5px 14px',
                                      borderRadius: '5px',
                                      border: 'none',
                                      background: flaggingLines[line.id].trim()
                                        ? '#ef4444'
                                        : '#fca5a5',
                                      color: '#fff',
                                      cursor: flaggingLines[line.id].trim()
                                        ? 'pointer'
                                        : 'not-allowed',
                                      fontSize: '12px',
                                      fontWeight: 600,
                                    }}
                                  >
                                    Save Flag
                                  </button>
                                  <button
                                    onClick={() => {
                                      setFlaggingLines((p) => {
                                        const n = { ...p }
                                        delete n[line.id]
                                        return n
                                      })
                                    }}
                                    style={{
                                      padding: '5px 12px',
                                      borderRadius: '5px',
                                      border: `1px solid ${theme.border}`,
                                      background: 'transparent',
                                      color: theme.textMuted,
                                      cursor: 'pointer',
                                      fontSize: '12px',
                                    }}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : auditStatus === 'flagged' && line.audit_note ? (
                              <div
                                style={{
                                  marginTop: '8px',
                                  padding: '6px 10px',
                                  borderRadius: '5px',
                                  background: '#fef2f2',
                                  border: '1px solid #fca5a5',
                                  color: '#991b1b',
                                  fontSize: '12px',
                                }}
                              >
                                ⚑ {line.audit_note}
                              </div>
                            ) : null}
                          </div>
                        )
                      })}
                      <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                        <Button
                          variant="primary"
                          loading={lPass}
                          disabled={!canPass}
                          onClick={() => void passAudit({ variables: { id: po.id } })}
                        >
                          {canPass
                            ? 'Pass Audit → Invoiced'
                            : `Pass Audit (${pendingCount > 0 ? `${pendingCount} pending` : `${flaggedCount} flagged`})`}
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() =>
                            void failAudit({
                              variables: { id: po.id, notes: actionNotes || undefined },
                            })
                          }
                        >
                          Return for Correction
                        </Button>
                      </div>
                    </div>
                  )
                })()}

              {po.status === 'invoiced' &&
                (can('finance.ap.view') ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {apInvoice ? (
                      <div
                        style={{
                          padding: '10px 14px',
                          borderRadius: '8px',
                          background: theme.accentBg,
                          border: `1px solid ${theme.accent}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '12px',
                        }}
                      >
                        <div>
                          <div style={{ fontSize: '12px', fontWeight: 600, color: theme.accent }}>
                            Vendor Invoice Created
                          </div>
                          <div
                            style={{
                              fontSize: '11px',
                              color: theme.textSecondary,
                              marginTop: '2px',
                            }}
                          >
                            {apInvoice.invoice_number} —{' '}
                            <span style={{ textTransform: 'capitalize' }}>{apInvoice.status}</span>
                          </div>
                        </div>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            navigate(`/finance/ap/${apInvoice.id}`)
                          }}
                        >
                          View in AP
                        </Button>
                      </div>
                    ) : can('finance.ap.edit') ? (
                      <div
                        style={{
                          padding: '10px 14px',
                          borderRadius: '8px',
                          background: theme.dangerBg,
                          border: `1px solid ${theme.dangerBorder}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '12px',
                        }}
                      >
                        <div>
                          <div style={{ fontSize: '12px', fontWeight: 600, color: theme.danger }}>
                            No vendor invoice in AP yet
                          </div>
                          <div
                            style={{
                              fontSize: '11px',
                              color: theme.danger,
                              opacity: 0.8,
                              marginTop: '2px',
                            }}
                          >
                            Create a vendor invoice in AP to trigger the journal entry and payment
                            flow.
                          </div>
                        </div>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => {
                            navigate(`/finance/ap/new?po_id=${po.id}`)
                          }}
                        >
                          Create in AP
                        </Button>
                      </div>
                    ) : (
                      <div
                        style={{
                          padding: '10px 14px',
                          borderRadius: '8px',
                          background: theme.bgSurface,
                          border: `1px solid ${theme.border}`,
                          fontSize: '12px',
                          color: theme.textSecondary,
                        }}
                      >
                        No vendor invoice created yet.
                      </div>
                    )}
                    {can('finance.ap.approve', 'approve') && (
                      <>
                        <Button
                          variant={apInvoice?.status === 'paid' ? 'primary' : 'secondary'}
                          loading={anyLoading}
                          disabled={apInvoice?.status !== 'paid' && apInvoice !== null}
                          onClick={() => void completePO({ variables: { id: po.id } })}
                        >
                          Mark as Completed
                        </Button>
                        {apInvoice && apInvoice.status !== 'paid' && (
                          <div style={{ fontSize: '11px', color: theme.textMuted }}>
                            "Mark as Completed" will be enabled once the vendor invoice is fully
                            paid.
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ) : (
                  <div
                    style={{
                      padding: '10px 14px',
                      borderRadius: '8px',
                      background: theme.bgSurface,
                      border: `1px solid ${theme.border}`,
                    }}
                  >
                    <div style={{ fontSize: '12px', fontWeight: 600, color: theme.textPrimary }}>
                      Awaiting Finance
                    </div>
                    <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '3px' }}>
                      This PO has been invoiced and is now with the Finance team for vendor invoice
                      processing and payment. No action required from you.
                    </div>
                  </div>
                ))}

              {po.status === 'rejected' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div
                    style={{
                      padding: '10px 14px',
                      borderRadius: '8px',
                      background: '#fef2f2',
                      border: '1px solid #ef4444',
                      fontSize: '13px',
                      color: '#991b1b',
                    }}
                  >
                    This PO was rejected. Revise and reopen it as a draft to restart the workflow.
                  </div>
                  <Button
                    variant="secondary"
                    loading={anyLoading}
                    onClick={() => void reopenPO({ variables: { id: po.id } })}
                  >
                    Reopen as Draft
                  </Button>
                </div>
              )}

              {!['rejected', 'goods_received', 'finance_audit', 'pending_approval'].includes(
                po.status,
              ) && (
                <div style={{ paddingTop: '8px', borderTop: `1px dashed ${theme.border}` }}>
                  <label
                    style={{
                      fontSize: '12px',
                      color: theme.textMuted,
                      display: 'block',
                      marginBottom: '4px',
                    }}
                  >
                    Action notes (optional)
                  </label>
                  <textarea
                    value={actionNotes}
                    onChange={(e) => {
                      setActionNotes(e.target.value)
                    }}
                    rows={2}
                    style={{
                      width: '100%',
                      padding: '8px',
                      borderRadius: '6px',
                      border: `1px solid ${theme.border}`,
                      background: theme.bgSurface,
                      color: theme.textPrimary,
                      fontSize: '13px',
                      resize: 'vertical',
                    }}
                  />
                </div>
              )}
            </div>
          </fieldset>
        </Card>
      )}

      {/* Tabs */}
      <div style={{ marginBottom: '16px' }}>
        <TabBar
          tabs={tabs}
          active={activeTab}
          onChange={(key) => {
            setActiveTab(key as Tab)
          }}
          phoneLabels={phoneTabLabels}
        />
      </div>

      {/* Tab content */}
      {activeTab === 'lines' &&
        (() => {
          const FLAG_COLORS: Record<
            string,
            { bg: string; border: string; dot: string; label: string }
          > = {
            dispute: {
              bg: 'rgba(239,68,68,0.08)',
              border: 'rgba(239,68,68,0.25)',
              dot: '#ef4444',
              label: 'Dispute',
            },
            warning: {
              bg: 'rgba(245,158,11,0.08)',
              border: 'rgba(245,158,11,0.25)',
              dot: '#f59e0b',
              label: 'Warning',
            },
            info: {
              bg: 'rgba(59,130,246,0.08)',
              border: 'rgba(59,130,246,0.25)',
              dot: '#3b82f6',
              label: 'Info',
            },
          }
          const FLAG_PRIORITY = ['dispute', 'warning', 'info']

          const fmtN = (n: number | string) =>
            parseFloat(String(n)).toLocaleString('en-US', {
              minimumFractionDigits: 0,
              maximumFractionDigits: 2,
            })

          const getLineFlag = (lineId: string): string | null => {
            const comments = lineComments[lineId] ?? []
            const unresolved = comments
              .filter((c) => c.flag && !c.resolved)
              .map((c) => c.flag as string)
            for (const f of FLAG_PRIORITY) {
              if (unresolved.includes(f)) return f
            }
            return null
          }

          const lineColumns: Column<POLine>[] = [
            {
              key: 'item',
              header: 'Item',
              mobilePrimary: true,
              render: (line) => (
                <>
                  {line.product_name && (
                    <div
                      style={{
                        fontSize: '13px',
                        color: theme.textPrimary,
                        fontWeight: 500,
                      }}
                    >
                      {line.product_name}
                    </div>
                  )}
                  {line.description && (
                    <div
                      style={{
                        fontSize: '12px',
                        color: theme.textMuted,
                        marginTop: line.product_name ? '2px' : 0,
                      }}
                    >
                      {line.description}
                    </div>
                  )}
                  {!line.product_name && !line.description && (
                    <span style={{ fontSize: '13px', color: theme.textMuted }}>—</span>
                  )}
                </>
              ),
            },
            {
              key: 'qty',
              header: 'Qty',
              mobilePriority: 4,
              render: (line) => (
                <span style={{ color: theme.textPrimary, fontVariantNumeric: 'tabular-nums' }}>
                  {fmtN(line.qty)} {line.uom}
                </span>
              ),
            },
            {
              key: 'market_price',
              header: 'Market Price',
              mobilePriority: 5,
              render: (line) => (
                <span style={{ color: theme.textSecondary, fontVariantNumeric: 'tabular-nums' }}>
                  {fmtN(line.unit_price)} {po.currency_code}
                </span>
              ),
            },
            {
              key: 'store_price',
              header: 'Store Price',
              mobilePriority: 6,
              render: (line) => {
                const sp = parseFloat(String(line.store_price ?? 0))
                return sp > 0 ? (
                  <span style={{ color: theme.success, fontVariantNumeric: 'tabular-nums' }}>
                    {fmtN(sp)} {line.store_price_currency ?? po.currency_code}
                  </span>
                ) : (
                  <span style={{ color: theme.textMuted, fontVariantNumeric: 'tabular-nums' }}>
                    —
                  </span>
                )
              },
            },
            {
              key: 'total',
              header: 'Total',
              mobilePriority: 2,
              render: (line) => {
                const fs = parseFloat(String(line.qty_from_stock ?? 0))
                const tb = Math.max(0, parseFloat(String(line.qty ?? 0)) - fs)
                const sp = parseFloat(String(line.store_price ?? 0))
                const mp = parseFloat(String(line.market_price ?? line.unit_price ?? 0))
                const blended =
                  (fs > 0 && sp > 0 ? fs * sp : 0) +
                  tb * (mp || parseFloat(String(line.unit_price ?? 0)))
                return (
                  <span
                    style={{
                      fontWeight: 600,
                      color: theme.textPrimary,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {fmtN(blended || line.total)} {po.currency_code}
                  </span>
                )
              },
            },
            {
              key: 'received',
              header: 'Received',
              mobilePriority: 3,
              render: (line) => {
                const received = line.qty_received >= line.qty
                return (
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                    <span style={{ color: received ? theme.accent : theme.textMuted }}>
                      {fmtN(line.qty_received)}/{fmtN(line.qty)}
                    </span>
                    {received && (
                      <span style={{ marginLeft: '5px', fontSize: '11px', color: theme.accent }}>
                        ✓
                      </span>
                    )}
                  </span>
                )
              },
            },
            {
              key: 'notes',
              header: 'Notes',
              mobilePriority: 1,
              render: (line) => {
                const comments = lineComments[line.id] ?? []
                const activeFlag = getLineFlag(line.id)
                const flagStyle = activeFlag ? FLAG_COLORS[activeFlag] : null
                const openCount = comments.filter((c) => c.flag && !c.resolved).length
                const totalCount = comments.length
                const isAuditFlagged = line.audit_status === 'flagged'
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {isAuditFlagged && (
                      <div
                        style={{
                          fontSize: '12px',
                          color: '#dc2626',
                          fontWeight: 600,
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '4px',
                        }}
                      >
                        <span style={{ flexShrink: 0 }}>⚑</span>
                        <span style={{ color: '#dc2626', fontWeight: 400 }}>
                          {line.audit_note || 'Flagged'}
                        </span>
                      </div>
                    )}
                    <button
                      onClick={() => {
                        setCommentModal({
                          lineId: line.id,
                          description:
                            line.description || line.product_name || `Line ${line.id.slice(0, 6)}`,
                        })
                        setNewComment('')
                        setNewFlag('')
                      }}
                      style={{
                        cursor: 'pointer',
                        background: flagStyle
                          ? `${flagStyle.dot}18`
                          : totalCount > 0
                            ? `${theme.accent}12`
                            : theme.bgSurface,
                        border: `1px solid ${flagStyle ? flagStyle.dot : totalCount > 0 ? theme.accent : theme.border}`,
                        borderRadius: '6px',
                        padding: '4px 10px',
                        fontSize: '12px',
                        color: flagStyle
                          ? flagStyle.dot
                          : totalCount > 0
                            ? theme.accent
                            : theme.textMuted,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {flagStyle && (
                        <span
                          style={{
                            width: '7px',
                            height: '7px',
                            borderRadius: '50%',
                            background: flagStyle.dot,
                            display: 'inline-block',
                            flexShrink: 0,
                          }}
                        />
                      )}
                      {flagStyle
                        ? `${FLAG_COLORS[activeFlag!].label} · ${openCount} open`
                        : totalCount > 0
                          ? `💬 ${totalCount}`
                          : '+ Note'}
                    </button>
                  </div>
                )
              },
            },
          ]

          return (
            <Card>
              <Table
                columns={lineColumns}
                data={po.lines}
                rowKey="id"
                getRowStyle={(line) => {
                  const activeFlag = getLineFlag(line.id)
                  const flagStyle = activeFlag ? FLAG_COLORS[activeFlag] : null
                  const isAuditFlagged = line.audit_status === 'flagged'
                  return {
                    borderBottom: isAuditFlagged
                      ? '1px solid rgba(239,68,68,0.3)'
                      : flagStyle
                        ? `1px solid ${flagStyle.border}`
                        : `1px solid ${theme.border}22`,
                    background: isAuditFlagged
                      ? 'rgba(239,68,68,0.06)'
                      : flagStyle
                        ? flagStyle.bg
                        : 'transparent',
                    borderLeft: isAuditFlagged
                      ? '3px solid #ef4444'
                      : flagStyle
                        ? `3px solid ${flagStyle.dot}`
                        : '3px solid transparent',
                  }
                }}
              />
            </Card>
          )
        })()}

      {activeTab === 'receipts' && (
        <div>
          {(po.status === 'approved' || po.status === 'goods_received') && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  navigate(`/procurement/purchase-orders/${po.id}/receive`)
                }}
              >
                Record Receipt
              </Button>
            </div>
          )}
          {po.receipts.length === 0 && (
            <Card style={{ padding: '32px', textAlign: 'center' }}>
              <span style={{ color: theme.textMuted, fontSize: '13px' }}>No receipts yet.</span>
            </Card>
          )}
          {po.receipts.map((r) => {
            const receiptLineColumns: Column<{
              po_line_id: string
              description: string
              qty_received: number
            }>[] = [
              {
                key: 'description',
                header: 'Description',
                mobilePrimary: true,
                render: (rl) => <span style={{ color: theme.textPrimary }}>{rl.description}</span>,
              },
              {
                key: 'qty_received',
                header: 'Qty received',
                mobilePriority: 1,
                render: (rl) => <span style={{ color: theme.textPrimary }}>{rl.qty_received}</span>,
              },
            ]
            return (
              <Card key={r.id} style={{ marginBottom: '12px', padding: '16px' }}>
                <div
                  style={{ display: 'flex', flexWrap: 'wrap', gap: '24px', marginBottom: '12px' }}
                >
                  <div>
                    <span style={{ fontSize: '11px', color: theme.textMuted }}>Date: </span>
                    <span style={{ fontSize: '13px' }}>{r.receipt_date}</span>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: theme.textMuted }}>Location: </span>
                    <span style={{ fontSize: '13px' }}>{r.location_name ?? '—'}</span>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: theme.textMuted }}>Received by: </span>
                    <span style={{ fontSize: '13px' }}>
                      {r.received_by_name ?? r.received_by_email ?? '—'}
                    </span>
                  </div>
                </div>
                {r.location_notes && (
                  <div
                    style={{ marginBottom: '10px', fontSize: '13px', color: theme.textSecondary }}
                  >
                    <span style={{ fontSize: '11px', color: theme.textMuted }}>
                      Jobsite/Location notes:{' '}
                    </span>
                    {r.location_notes}
                  </div>
                )}
                {r.notes && (
                  <div
                    style={{ marginBottom: '10px', fontSize: '13px', color: theme.textSecondary }}
                  >
                    <span style={{ fontSize: '11px', color: theme.textMuted }}>Notes: </span>
                    {r.notes}
                  </div>
                )}
                {r.photos && r.photos.length > 0 && (
                  <div style={{ marginBottom: '16px' }}>
                    <div
                      style={{
                        fontSize: '11px',
                        color: theme.textMuted,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        marginBottom: '8px',
                      }}
                    >
                      Photos ({r.photos.length})
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                      {r.photos.map((ph) => (
                        <div key={ph.id}>
                          {ph.downloadUrl ? (
                            <div
                              onClick={() => {
                                openLightbox(ph.downloadUrl!)
                              }}
                              style={{
                                cursor: 'zoom-in',
                                borderRadius: '8px',
                                overflow: 'hidden',
                                border: `1px solid ${theme.border}`,
                                boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
                                width: '180px',
                              }}
                            >
                              <img
                                src={ph.downloadUrl}
                                alt={ph.label ?? ph.originalFilename}
                                style={{
                                  width: '180px',
                                  height: '130px',
                                  objectFit: 'cover',
                                  display: 'block',
                                }}
                              />
                              {ph.label && (
                                <div
                                  style={{
                                    padding: '6px 8px',
                                    fontSize: '11px',
                                    color: theme.textSecondary,
                                    background: theme.bgSurface,
                                    borderTop: `1px solid ${theme.border}`,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {ph.label}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div
                              style={{
                                width: '180px',
                                height: '130px',
                                borderRadius: '8px',
                                border: `1px solid ${theme.border}`,
                                background: theme.bgSurface,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '11px',
                                color: theme.textMuted,
                                padding: '8px',
                                textAlign: 'center',
                              }}
                            >
                              {ph.originalFilename}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <Table columns={receiptLineColumns} data={r.lines} />
              </Card>
            )
          })}
        </div>
      )}

      {activeTab === 'returns' && (
        <div>
          {['received', 'invoiced', 'completed'].includes(po.status) &&
            can('procurement.po.edit', 'edit') && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    navigate(`/procurement/purchase-orders/${po.id}/returns/new`)
                  }}
                >
                  ↩ Create Return
                </Button>
              </div>
            )}
          {poReturns.length === 0 && (
            <Card style={{ padding: '32px', textAlign: 'center' }}>
              <span style={{ color: theme.textMuted, fontSize: '13px' }}>
                No returns on this PO.
              </span>
            </Card>
          )}
          {poReturns.map((ret) => {
            const sc: Record<string, { bg: string; text: string }> = {
              draft: { bg: '#f9fafb', text: '#6b7280' },
              submitted: { bg: '#fffbeb', text: '#d97706' },
              approved: { bg: '#f0fdf4', text: '#16a34a' },
              credited: { bg: '#eff6ff', text: '#2563eb' },
            }
            const c = sc[ret.status] ?? sc.draft
            return (
              <Card
                key={ret.id}
                style={{ marginBottom: '10px', padding: '14px 18px', cursor: 'pointer' }}
                onClick={() => {
                  navigate(`/procurement/purchase-orders/${po.id}/returns/${ret.id}`)
                }}
              >
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}
                >
                  <span style={{ fontWeight: 600, fontSize: '13px', color: theme.textPrimary }}>
                    {ret.return_number}
                  </span>
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: '10px',
                      fontSize: '11px',
                      fontWeight: 600,
                      background: c.bg,
                      color: c.text,
                    }}
                  >
                    {ret.status.charAt(0).toUpperCase() + ret.status.slice(1)}
                  </span>
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      background: ret.return_type === 'damage' ? '#fff7ed' : '#f0fdf4',
                      color: ret.return_type === 'damage' ? '#c2410c' : '#15803d',
                    }}
                  >
                    {ret.return_type === 'damage' ? '⚠ Damage' : '↩ Full Refund'}
                  </span>
                  <div style={{ flex: 1 }} />
                  <span style={{ fontSize: '13px', fontWeight: 600, color: theme.accent }}>
                    {ret.currency_code}{' '}
                    {Number(ret.total_returned_value).toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {activeTab === 'approval_log' && (
        <Card>
          {po.notes && (
            <div
              style={{
                padding: '14px 16px',
                borderBottom: `1px solid ${theme.border}`,
                background: theme.bgSurface,
              }}
            >
              <div
                style={{
                  fontSize: '11px',
                  color: theme.textMuted,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: '6px',
                }}
              >
                PO Notes
              </div>
              <div style={{ fontSize: '13px', color: theme.textPrimary, whiteSpace: 'pre-wrap' }}>
                {po.notes}
              </div>
            </div>
          )}
          {po.approval_log.length === 0 && !po.notes && (
            <div
              style={{
                padding: '32px',
                textAlign: 'center',
                color: theme.textMuted,
                fontSize: '13px',
              }}
            >
              No activity yet.
            </div>
          )}
          {po.approval_log.length === 0 && po.notes && (
            <div
              style={{
                padding: '16px',
                textAlign: 'center',
                color: theme.textMuted,
                fontSize: '13px',
              }}
            >
              No approval activity yet.
            </div>
          )}
          {po.approval_log.map((entry) => (
            <div
              key={entry.id}
              style={{
                display: 'flex',
                gap: '16px',
                padding: '12px 16px',
                borderBottom: `1px solid ${theme.border}22`,
                alignItems: 'center',
              }}
            >
              <Badge
                variant={
                  entry.action === 'approved'
                    ? 'success'
                    : entry.action.startsWith('reject')
                      ? 'danger'
                      : 'info'
                }
              >
                {entry.action.replace(/_/g, ' ')}
              </Badge>
              <span style={{ fontSize: '13px', color: theme.textPrimary }}>{entry.user_email}</span>
              {entry.notes && (
                <span style={{ fontSize: '12px', color: theme.textMuted }}>{entry.notes}</span>
              )}
              <span style={{ fontSize: '12px', color: theme.textMuted, marginLeft: 'auto' }}>
                {entry.created_at.slice(0, 16).replace('T', ' ')}
              </span>
            </div>
          ))}
        </Card>
      )}

      {activeTab === 'changes' &&
        (() => {
          const inputStyle: React.CSSProperties = {
            width: '100%',
            padding: '7px 10px',
            borderRadius: '6px',
            border: `1px solid ${theme.borderInput}`,
            background: theme.bgCanvas,
            color: theme.textPrimary,
            fontSize: '13px',
            boxSizing: 'border-box',
          }
          const labelStyle: React.CSSProperties = {
            fontSize: '11px',
            fontWeight: 600,
            color: theme.textMuted,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            display: 'block',
            marginBottom: '4px',
          }

          const initDraft = (): EditDraft => ({
            notes: po.notes ?? '',
            expected_delivery_date: po.expected_delivery_date ?? '',
            lines: po.lines.map((l) => ({
              id: l.id,
              description: l.description,
              qty: l.qty,
              unit_price: l.unit_price,
              uom: l.uom,
            })),
            linesAdded: [],
          })

          const buildChanges = (draft: EditDraft) => {
            const header: Record<string, { from: unknown; to: unknown }> = {}
            if (draft.notes !== (po.notes ?? ''))
              header.notes = { from: po.notes ?? '', to: draft.notes }
            if (draft.expected_delivery_date !== (po.expected_delivery_date ?? ''))
              header.expected_delivery_date = {
                from: po.expected_delivery_date ?? '',
                to: draft.expected_delivery_date,
              }
            const edited: { id: string; field: string; from: unknown; to: unknown }[] = []
            const removed: string[] = []
            for (const dl of draft.lines) {
              if (dl._removed) {
                removed.push(dl.id)
                continue
              }
              const orig = po.lines.find((l) => l.id === dl.id)
              if (!orig) continue
              if (dl.description !== orig.description)
                edited.push({
                  id: dl.id,
                  field: 'description',
                  from: orig.description,
                  to: dl.description,
                })
              if (dl.qty !== orig.qty)
                edited.push({ id: dl.id, field: 'qty_ordered', from: orig.qty, to: dl.qty })
              if (dl.unit_price !== orig.unit_price)
                edited.push({
                  id: dl.id,
                  field: 'unit_price',
                  from: orig.unit_price,
                  to: dl.unit_price,
                })
              if (dl.uom !== orig.uom)
                edited.push({ id: dl.id, field: 'uom', from: orig.uom, to: dl.uom })
            }
            return { header, lines: { edited, added: draft.linesAdded, removed } }
          }

          const hasPending = (po.edit_requests ?? []).some((r) => r.status === 'pending')

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <fieldset
                disabled={lock.lockedByOther}
                style={{ border: 'none', padding: 0, margin: 0 }}
              >
                {/* ── Request edit form ── */}
                <Card style={{ padding: '20px' }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '16px',
                    }}
                  >
                    <div style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary }}>
                      Request an edit
                    </div>
                    {hasPending && <Badge variant="warning">Pending review — submit locked</Badge>}
                    {!editDraft && !hasPending && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setEditDraft(initDraft())
                        }}
                      >
                        Start editing
                      </Button>
                    )}
                    {editDraft && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setEditDraft(null)
                        }}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>

                  {!editDraft && (
                    <div style={{ fontSize: '13px', color: theme.textMuted }}>
                      {hasPending
                        ? 'There is already a pending edit request. An admin must approve or reject it before a new one can be submitted.'
                        : 'Click "Start editing" to propose changes. Changes will not apply until an admin approves them.'}
                    </div>
                  )}

                  {editDraft &&
                    (() => {
                      const existingLineFields: LineItemField<EditDraft['lines'][number]>[] = [
                        {
                          key: 'description',
                          label: 'Description',
                          render: (line, i) => (
                            <input
                              value={line.description}
                              style={inputStyle}
                              disabled={line._removed}
                              onChange={(e) => {
                                const lines = [...editDraft.lines]
                                lines[i] = { ...lines[i], description: e.target.value }
                                setEditDraft({ ...editDraft, lines })
                              }}
                            />
                          ),
                        },
                        {
                          key: 'qty',
                          label: 'Qty',
                          width: '80px',
                          render: (line, i) => (
                            <input
                              type="number"
                              value={line.qty}
                              style={inputStyle}
                              disabled={line._removed}
                              onChange={(e) => {
                                const lines = [...editDraft.lines]
                                lines[i] = { ...lines[i], qty: Number(e.target.value) }
                                setEditDraft({ ...editDraft, lines })
                              }}
                            />
                          ),
                        },
                        {
                          key: 'unit_price',
                          label: 'Unit price',
                          width: '110px',
                          render: (line, i) => (
                            <input
                              type="number"
                              value={line.unit_price}
                              style={inputStyle}
                              disabled={line._removed}
                              onChange={(e) => {
                                const lines = [...editDraft.lines]
                                lines[i] = { ...lines[i], unit_price: Number(e.target.value) }
                                setEditDraft({ ...editDraft, lines })
                              }}
                            />
                          ),
                        },
                        {
                          key: 'uom',
                          label: 'UOM',
                          width: '70px',
                          render: (line, i) => (
                            <input
                              value={line.uom}
                              style={inputStyle}
                              disabled={line._removed}
                              onChange={(e) => {
                                const lines = [...editDraft.lines]
                                lines[i] = { ...lines[i], uom: e.target.value }
                                setEditDraft({ ...editDraft, lines })
                              }}
                            />
                          ),
                        },
                        {
                          key: 'actions',
                          label: '',
                          width: '70px',
                          render: (line, i) => (
                            <button
                              onClick={() => {
                                const lines = [...editDraft.lines]
                                lines[i] = { ...lines[i], _removed: !lines[i]._removed }
                                setEditDraft({ ...editDraft, lines })
                              }}
                              style={{
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                color: line._removed ? theme.accent : theme.danger,
                                fontSize: '12px',
                              }}
                            >
                              {line._removed ? 'Restore' : 'Remove'}
                            </button>
                          ),
                        },
                      ]

                      const addedLineFields: LineItemField<EditDraft['linesAdded'][number]>[] = [
                        {
                          key: 'description',
                          label: 'Description',
                          render: (line, i) => (
                            <input
                              placeholder="Description"
                              value={line.description}
                              style={inputStyle}
                              onChange={(e) => {
                                const a = [...editDraft.linesAdded]
                                a[i] = { ...a[i], description: e.target.value }
                                setEditDraft({ ...editDraft, linesAdded: a })
                              }}
                            />
                          ),
                        },
                        {
                          key: 'qty',
                          label: 'Qty',
                          width: '80px',
                          render: (line, i) => (
                            <input
                              type="number"
                              value={line.qty}
                              style={inputStyle}
                              onChange={(e) => {
                                const a = [...editDraft.linesAdded]
                                a[i] = { ...a[i], qty: Number(e.target.value) }
                                setEditDraft({ ...editDraft, linesAdded: a })
                              }}
                            />
                          ),
                        },
                        {
                          key: 'unit_price',
                          label: 'Unit price',
                          width: '110px',
                          render: (line, i) => (
                            <input
                              type="number"
                              value={line.unit_price}
                              style={inputStyle}
                              onChange={(e) => {
                                const a = [...editDraft.linesAdded]
                                a[i] = { ...a[i], unit_price: Number(e.target.value) }
                                setEditDraft({ ...editDraft, linesAdded: a })
                              }}
                            />
                          ),
                        },
                        {
                          key: 'uom',
                          label: 'UOM',
                          width: '70px',
                          render: (line, i) => (
                            <input
                              value={line.uom}
                              style={inputStyle}
                              onChange={(e) => {
                                const a = [...editDraft.linesAdded]
                                a[i] = { ...a[i], uom: e.target.value }
                                setEditDraft({ ...editDraft, linesAdded: a })
                              }}
                            />
                          ),
                        },
                      ]

                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                          {/* Header fields */}
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                              gap: '12px',
                            }}
                          >
                            <div>
                              <label style={labelStyle}>Notes</label>
                              <textarea
                                value={editDraft.notes}
                                rows={2}
                                style={{ ...inputStyle, resize: 'vertical' }}
                                onChange={(e) => {
                                  setEditDraft({ ...editDraft, notes: e.target.value })
                                }}
                              />
                            </div>
                            <div>
                              <label style={labelStyle}>Expected delivery</label>
                              <input
                                type="date"
                                value={editDraft.expected_delivery_date}
                                style={inputStyle}
                                onChange={(e) => {
                                  setEditDraft({
                                    ...editDraft,
                                    expected_delivery_date: e.target.value,
                                  })
                                }}
                              />
                            </div>
                          </div>

                          {/* Lines */}
                          <div>
                            <div
                              style={{
                                fontSize: '11px',
                                fontWeight: 600,
                                color: theme.textMuted,
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                                marginBottom: '8px',
                              }}
                            >
                              Line items
                            </div>
                            <LineItemEditor
                              fields={existingLineFields}
                              rows={editDraft.lines}
                              rowKey={(line) => line.id}
                              getRowStyle={(line) => ({ opacity: line._removed ? 0.4 : 1 })}
                            />
                            <div style={{ marginTop: '10px' }}>
                              <LineItemEditor
                                fields={addedLineFields}
                                rows={editDraft.linesAdded}
                                rowKey={(_, i) => `new-${i}`}
                                getRowStyle={() => ({ background: theme.accentBg + '44' })}
                                onRemoveRow={(idx) => {
                                  const a = editDraft.linesAdded.filter((_, j) => j !== idx)
                                  setEditDraft({ ...editDraft, linesAdded: a })
                                }}
                                onAddRow={() => {
                                  setEditDraft({
                                    ...editDraft,
                                    linesAdded: [
                                      ...editDraft.linesAdded,
                                      { description: '', qty: 1, unit_price: 0, uom: 'unit' },
                                    ],
                                  })
                                }}
                                addLabel="+ Add line"
                                emptyMessage="No new lines added"
                              />
                            </div>
                          </div>

                          {/* Submit */}
                          <div>
                            <label style={labelStyle}>Reason for changes (optional)</label>
                            <input
                              value={editRequestNotes}
                              style={inputStyle}
                              placeholder="Explain why these changes are needed..."
                              onChange={(e) => {
                                setEditRequestNotes(e.target.value)
                              }}
                            />
                          </div>
                          <div>
                            <Button
                              variant="primary"
                              loading={leR}
                              onClick={() => {
                                const changes = buildChanges(editDraft)
                                void submitEditRequest({
                                  variables: {
                                    id: po.id,
                                    changes: JSON.stringify(changes),
                                    notes: editRequestNotes || undefined,
                                  },
                                })
                              }}
                            >
                              Submit edit request
                            </Button>
                          </div>
                        </div>
                      )
                    })()}
                </Card>

                {/* ── Edit request history ── */}
                <Card>
                  <div
                    style={{
                      padding: '16px 20px',
                      borderBottom: `1px solid ${theme.border}`,
                      fontSize: '13px',
                      fontWeight: 600,
                      color: theme.textPrimary,
                    }}
                  >
                    Edit request history
                  </div>
                  {(po.edit_requests ?? []).length === 0 && (
                    <div
                      style={{
                        padding: '32px',
                        textAlign: 'center',
                        fontSize: '13px',
                        color: theme.textMuted,
                      }}
                    >
                      No edit requests yet.
                    </div>
                  )}
                  {(po.edit_requests ?? []).map((er) => {
                    let parsed: {
                      header?: Record<string, { from: unknown; to: unknown }>
                      lines?: { edited?: unknown[]; added?: unknown[]; removed?: string[] }
                    } = {}
                    try {
                      parsed = JSON.parse(er.changes)
                    } catch {
                      /* ignore */
                    }
                    const headerChanges = Object.entries(parsed.header ?? {})
                    const editedLines = parsed.lines?.edited ?? []
                    const addedLines = parsed.lines?.added ?? []
                    const removedLines = parsed.lines?.removed ?? []
                    const totalChanges =
                      headerChanges.length +
                      editedLines.length +
                      addedLines.length +
                      removedLines.length

                    return (
                      <div
                        key={er.id}
                        style={{
                          borderBottom: `1px solid ${theme.border}22`,
                          padding: '16px 20px',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            marginBottom: '10px',
                            flexWrap: 'wrap',
                          }}
                        >
                          <Badge
                            variant={
                              er.status === 'approved'
                                ? 'success'
                                : er.status === 'rejected'
                                  ? 'danger'
                                  : 'warning'
                            }
                          >
                            {er.status}
                          </Badge>
                          <span style={{ fontSize: '13px', color: theme.textPrimary }}>
                            {er.requested_by_email}
                          </span>
                          <span style={{ fontSize: '12px', color: theme.textMuted }}>
                            {er.created_at.slice(0, 16).replace('T', ' ')}
                          </span>
                          <span
                            style={{ fontSize: '12px', color: theme.textMuted, marginLeft: 'auto' }}
                          >
                            {totalChanges} change{totalChanges !== 1 ? 's' : ''}
                          </span>
                        </div>

                        {/* Diff summary */}
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px',
                            fontSize: '12px',
                            marginBottom: '10px',
                          }}
                        >
                          {headerChanges.map(([field, diff]) => (
                            <div
                              key={field}
                              style={{ display: 'flex', gap: '8px', alignItems: 'center' }}
                            >
                              <span style={{ color: theme.textMuted, minWidth: '140px' }}>
                                {field.replace(/_/g, ' ')}
                              </span>
                              <span style={{ color: theme.danger, textDecoration: 'line-through' }}>
                                {String(diff.from || '—')}
                              </span>
                              <span style={{ color: theme.textMuted }}>→</span>
                              <span style={{ color: theme.accent }}>{String(diff.to || '—')}</span>
                            </div>
                          ))}
                          {(
                            editedLines as {
                              id: string
                              field: string
                              from: unknown
                              to: unknown
                            }[]
                          ).map((e, i) => (
                            <div
                              key={i}
                              style={{ display: 'flex', gap: '8px', alignItems: 'center' }}
                            >
                              <span style={{ color: theme.textMuted, minWidth: '140px' }}>
                                line {e.field.replace(/_/g, ' ')}
                              </span>
                              <span style={{ color: theme.danger, textDecoration: 'line-through' }}>
                                {String(e.from ?? '—')}
                              </span>
                              <span style={{ color: theme.textMuted }}>→</span>
                              <span style={{ color: theme.accent }}>{String(e.to ?? '—')}</span>
                            </div>
                          ))}
                          {addedLines.length > 0 && (
                            <div style={{ color: theme.accent }}>
                              + {addedLines.length} line{addedLines.length !== 1 ? 's' : ''} added
                            </div>
                          )}
                          {removedLines.length > 0 && (
                            <div style={{ color: theme.danger }}>
                              − {removedLines.length} line{removedLines.length !== 1 ? 's' : ''}{' '}
                              removed
                            </div>
                          )}
                        </div>

                        {er.request_notes && (
                          <div
                            style={{
                              fontSize: '12px',
                              color: theme.textMuted,
                              fontStyle: 'italic',
                              marginBottom: '8px',
                            }}
                          >
                            "{er.request_notes}"
                          </div>
                        )}

                        {/* Reviewed info */}
                        {er.status !== 'pending' && (
                          <div
                            style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '0' }}
                          >
                            {er.status === 'approved' ? 'Approved' : 'Rejected'} by{' '}
                            {er.reviewed_by_email} on{' '}
                            {er.reviewed_at?.slice(0, 16).replace('T', ' ')}
                            {er.review_notes && ` — "${er.review_notes}"`}
                          </div>
                        )}

                        {/* Admin approve/reject */}
                        {er.status === 'pending' && (
                          <div
                            style={{
                              display: 'flex',
                              gap: '8px',
                              alignItems: 'flex-start',
                              flexWrap: 'wrap',
                            }}
                          >
                            <Button
                              size="sm"
                              variant="primary"
                              loading={leA}
                              onClick={() =>
                                void approveEditRequest({
                                  variables: {
                                    id: po.id,
                                    requestId: er.id,
                                    reviewNotes: reviewNotes[er.id] || undefined,
                                  },
                                })
                              }
                            >
                              Approve
                            </Button>
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                              <input
                                value={reviewNotes[er.id] ?? ''}
                                onChange={(e) => {
                                  setReviewNotes((p) => ({ ...p, [er.id]: e.target.value }))
                                }}
                                placeholder="Rejection reason (required)"
                                style={{ ...inputStyle, width: '240px' }}
                              />
                              <Button
                                size="sm"
                                variant="danger"
                                loading={leJ}
                                disabled={!reviewNotes[er.id]?.trim()}
                                onClick={() =>
                                  void rejectEditRequest({
                                    variables: {
                                      id: po.id,
                                      requestId: er.id,
                                      reviewNotes: reviewNotes[er.id] ?? '',
                                    },
                                  })
                                }
                              >
                                Reject
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </Card>
              </fieldset>
            </div>
          )
        })()}

      {/* assignDeptHead reserved for future use */}

      {/* Photo lightbox — scroll to zoom, drag to pan */}
      {lightboxUrl && (
        <div
          ref={lbOverlayRef}
          onMouseMove={onLbMouseMove}
          onMouseUp={onLbMouseUp}
          onMouseLeave={onLbMouseUp}
          onClick={closeLightbox}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.88)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            userSelect: 'none',
          }}
        >
          <img
            src={lightboxUrl}
            alt="Receipt photo"
            onMouseDown={onLbMouseDown}
            onClick={(e) => {
              e.stopPropagation()
            }}
            draggable={false}
            style={{
              maxWidth: '90vw',
              maxHeight: '90vh',
              borderRadius: '8px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
              objectFit: 'contain',
              transform: `translate(${lbOffset.x}px, ${lbOffset.y}px) scale(${lbScale})`,
              transformOrigin: 'center center',
              transition: lbDrag.current ? 'none' : 'transform 0.1s ease',
              cursor: lbScale > 1 ? (lbDrag.current ? 'grabbing' : 'grab') : 'zoom-in',
            }}
          />
          {/* Zoom controls */}
          <div
            style={{
              position: 'fixed',
              bottom: '24px',
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              gap: '8px',
              alignItems: 'center',
            }}
          >
            <button
              onClick={(e) => {
                e.stopPropagation()
                setLbScale((s) => Math.max(0.5, s - 0.25))
              }}
              style={{
                background: 'rgba(255,255,255,0.15)',
                border: 'none',
                borderRadius: '6px',
                color: '#fff',
                width: '32px',
                height: '32px',
                fontSize: '18px',
                cursor: 'pointer',
              }}
            >
              −
            </button>
            <span
              style={{ color: '#fff', fontSize: '13px', minWidth: '44px', textAlign: 'center' }}
            >
              {Math.round(lbScale * 100)}%
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setLbScale((s) => Math.min(8, s + 0.25))
              }}
              style={{
                background: 'rgba(255,255,255,0.15)',
                border: 'none',
                borderRadius: '6px',
                color: '#fff',
                width: '32px',
                height: '32px',
                fontSize: '18px',
                cursor: 'pointer',
              }}
            >
              +
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setLbScale(1)
                setLbOffset({ x: 0, y: 0 })
              }}
              style={{
                background: 'rgba(255,255,255,0.15)',
                border: 'none',
                borderRadius: '6px',
                color: '#fff',
                padding: '0 10px',
                height: '32px',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              Reset
            </button>
          </div>
          <button
            onClick={closeLightbox}
            style={{
              position: 'fixed',
              top: '16px',
              right: '20px',
              background: 'rgba(255,255,255,0.15)',
              border: 'none',
              borderRadius: '50%',
              color: '#fff',
              width: '36px',
              height: '36px',
              fontSize: '20px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Line Comments Modal */}
      {commentModal &&
        (() => {
          const FLAG_META: Record<string, { color: string; bg: string; label: string }> = {
            info: { color: '#3b82f6', bg: 'rgba(59,130,246,0.1)', label: 'Info' },
            warning: { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', label: 'Warning' },
            dispute: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)', label: 'Dispute' },
          }
          const comments = lineComments[commentModal.lineId] ?? []
          const auditLine = po.lines.find((l) => l.id === commentModal.lineId)
          const auditFlag = auditLine?.audit_status === 'flagged' ? auditLine : null
          const fmt = (iso: string) => {
            const d = new Date(iso)
            return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()} | ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
          }
          const handleAddComment = async () => {
            if (!newComment.trim() || !id) return
            setAddingComment(true)
            try {
              await api.post(
                `/procurement/purchase-orders/${id}/lines/${commentModal.lineId}/comments`,
                { comment: newComment.trim(), flag: newFlag || undefined },
              )
              fetchLineComments()
              setNewComment('')
              setNewFlag('')
              addToast({ type: 'success', message: 'Comment added' })
            } catch {
              addToast({ type: 'error', message: 'Failed to add comment' })
            } finally {
              setAddingComment(false)
            }
          }
          const handleResolve = async (commentId: string) => {
            if (!id) return
            setResolvingId(commentId)
            try {
              await api.patch(
                `/procurement/purchase-orders/${id}/lines/${commentModal.lineId}/comments/${commentId}/resolve`,
                {},
              )
              fetchLineComments()
              addToast({ type: 'success', message: 'Flag resolved' })
            } catch {
              addToast({ type: 'error', message: 'Failed to resolve flag' })
            } finally {
              setResolvingId(null)
            }
          }
          return (
            <div
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.45)',
                zIndex: 1000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '16px',
              }}
              onClick={(e) => {
                if (e.target === e.currentTarget) setCommentModal(null)
              }}
            >
              <div
                style={{
                  background: theme.bgSurface,
                  borderRadius: '12px',
                  width: '100%',
                  maxWidth: '500px',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
                  display: 'flex',
                  flexDirection: 'column',
                  maxHeight: '90vh',
                  overflow: 'hidden',
                }}
              >
                {/* Header */}
                <div style={{ padding: '18px 20px', borderBottom: `1px solid ${theme.border}` }}>
                  <div style={{ fontSize: '16px', fontWeight: 700, color: theme.textPrimary }}>
                    Comments
                  </div>
                  <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '4px' }}>
                    Item Description: {commentModal.description}
                  </div>
                </div>

                {/* Comment list */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
                  {/* Pinned finance audit flag */}
                  {auditFlag && (
                    <div
                      style={{
                        padding: '12px 20px',
                        borderBottom: `1px solid rgba(239,68,68,0.2)`,
                        background: 'rgba(239,68,68,0.06)',
                        borderLeft: '3px solid #ef4444',
                      }}
                    >
                      <div style={{ marginBottom: '4px' }}>
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: '0.06em',
                            padding: '2px 7px',
                            borderRadius: '4px',
                            background: 'rgba(239,68,68,0.12)',
                            color: '#dc2626',
                            border: '1px solid #ef4444',
                          }}
                        >
                          ⚑ Finance Audit Flag
                        </span>
                      </div>
                      <div
                        style={{ fontSize: '14px', color: theme.textPrimary, marginBottom: '4px' }}
                      >
                        {auditFlag.audit_note || '(no reason given)'}
                      </div>
                      <div style={{ fontSize: '11px', color: theme.textMuted }}>
                        {auditFlag.audit_flagged_by_email ?? 'Finance Team'}
                        {auditFlag.audit_flagged_at && (
                          <span>&nbsp;&nbsp;{fmt(auditFlag.audit_flagged_at)}</span>
                        )}
                      </div>
                    </div>
                  )}
                  {!auditFlag && comments.length === 0 && (
                    <div
                      style={{
                        padding: '24px 20px',
                        textAlign: 'center',
                        fontSize: '13px',
                        color: theme.textMuted,
                      }}
                    >
                      No comments yet.
                    </div>
                  )}
                  {comments.map((c, idx) => {
                    const fm = c.flag ? FLAG_META[c.flag] : null
                    return (
                      <div
                        key={c.id}
                        style={{
                          padding: '12px 20px',
                          borderBottom:
                            idx < comments.length - 1 ? `1px solid ${theme.border}22` : 'none',
                          background: fm && !c.resolved ? fm.bg : 'transparent',
                          borderLeft: fm
                            ? `3px solid ${c.resolved ? theme.border : fm.color}`
                            : '3px solid transparent',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            justifyContent: 'space-between',
                            gap: '8px',
                          }}
                        >
                          <div style={{ flex: 1 }}>
                            {fm && (
                              <div style={{ marginBottom: '4px' }}>
                                <span
                                  style={{
                                    fontSize: '10px',
                                    fontWeight: 700,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.06em',
                                    padding: '2px 7px',
                                    borderRadius: '4px',
                                    background: c.resolved ? theme.bgCanvas : fm.bg,
                                    color: c.resolved ? theme.textMuted : fm.color,
                                    border: `1px solid ${c.resolved ? theme.border : fm.color}`,
                                    textDecoration: c.resolved ? 'line-through' : 'none',
                                  }}
                                >
                                  {fm.label}
                                  {c.resolved ? ' · Resolved' : ''}
                                </span>
                              </div>
                            )}
                            <div
                              style={{
                                fontSize: '14px',
                                color: theme.textPrimary,
                                marginBottom: '4px',
                                fontStyle: c.comment === 'item added' ? 'italic' : 'normal',
                                opacity: c.resolved ? 0.6 : 1,
                              }}
                            >
                              {c.comment}
                            </div>
                            <div style={{ fontSize: '11px', color: theme.textMuted }}>
                              {c.created_by_name}&nbsp;&nbsp;{fmt(c.created_at)}
                              {c.resolved && c.resolved_at && (
                                <span style={{ marginLeft: '8px', color: '#10b981' }}>
                                  · Resolved {fmt(c.resolved_at)}
                                </span>
                              )}
                            </div>
                          </div>
                          {fm && !c.resolved && (
                            <button
                              onClick={() => void handleResolve(c.id)}
                              disabled={resolvingId === c.id}
                              style={{
                                flexShrink: 0,
                                padding: '4px 10px',
                                borderRadius: '5px',
                                border: `1px solid ${fm.color}`,
                                background: 'transparent',
                                color: fm.color,
                                fontSize: '11px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {resolvingId === c.id ? '…' : 'Resolve'}
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Add comment footer */}
                <div style={{ padding: '14px 20px', borderTop: `1px solid ${theme.border}` }}>
                  <div
                    style={{
                      fontSize: '12px',
                      fontWeight: 600,
                      color: theme.textSecondary,
                      marginBottom: '8px',
                    }}
                  >
                    Add Comment {comments.length + (auditFlag ? 2 : 1)}
                  </div>
                  <textarea
                    value={newComment}
                    onChange={(e) => {
                      setNewComment(e.target.value)
                    }}
                    rows={2}
                    placeholder="Type your comment…"
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      border: `1px solid ${theme.border}`,
                      background: theme.bgCanvas,
                      color: theme.textPrimary,
                      fontSize: '13px',
                      resize: 'vertical',
                      boxSizing: 'border-box',
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void handleAddComment()
                    }}
                  />
                  {/* Flag picker */}
                  <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
                    <span
                      style={{
                        fontSize: '11px',
                        color: theme.textMuted,
                        alignSelf: 'center',
                        marginRight: '2px',
                      }}
                    >
                      Flag:
                    </span>
                    {(
                      [
                        ['', 'None', theme.textMuted, theme.border],
                        ['info', 'Info', '#3b82f6', '#3b82f6'],
                        ['warning', 'Warning', '#f59e0b', '#f59e0b'],
                        ['dispute', 'Dispute', '#ef4444', '#ef4444'],
                      ] as [string, string, string, string][]
                    ).map(([val, label, color, border]) => (
                      <button
                        key={val}
                        onClick={() => {
                          setNewFlag(val as typeof newFlag)
                        }}
                        style={{
                          padding: '3px 10px',
                          borderRadius: '5px',
                          border: `1px solid ${newFlag === val ? border : theme.border}`,
                          background: newFlag === val ? `${color}18` : 'transparent',
                          color: newFlag === val ? color : theme.textMuted,
                          fontSize: '11px',
                          fontWeight: newFlag === val ? 700 : 400,
                          cursor: 'pointer',
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      gap: '8px',
                      justifyContent: 'flex-end',
                      marginTop: '10px',
                    }}
                  >
                    <button
                      onClick={() => {
                        setCommentModal(null)
                      }}
                      style={{
                        padding: '8px 16px',
                        borderRadius: '6px',
                        border: `1px solid ${theme.border}`,
                        background: 'transparent',
                        color: theme.textPrimary,
                        fontSize: '13px',
                        cursor: 'pointer',
                      }}
                    >
                      Close
                    </button>
                    <button
                      onClick={() => void handleAddComment()}
                      disabled={!newComment.trim() || addingComment}
                      style={{
                        padding: '8px 18px',
                        borderRadius: '6px',
                        border: 'none',
                        background: newComment.trim() ? theme.accent : theme.border,
                        color: '#fff',
                        fontSize: '13px',
                        cursor: newComment.trim() ? 'pointer' : 'not-allowed',
                        fontWeight: 600,
                      }}
                    >
                      {addingComment ? 'Adding…' : 'Add'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )
        })()}

      <ConfirmDialog
        open={confirmDeletePO}
        onClose={() => {
          setConfirmDeletePO(false)
        }}
        onConfirm={() => {
          setConfirmDeletePO(false)
          void deletePO({ variables: { id: po.id } })
        }}
        title="Delete Purchase Order"
        message={`Delete PO ${po.po_number}? This action cannot be undone.`}
        confirmLabel="Delete"
        confirmVariant="danger"
      />

      {/* Print dialog */}
      {showPrintModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
          }}
          onClick={() => {
            setShowPrintModal(false)
          }}
        >
          <div
            style={{
              background: theme.bgSurface,
              borderRadius: '12px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
              width: '94vw',
              maxWidth: '1100px',
              height: '92vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
            onClick={(e) => {
              e.stopPropagation()
            }}
          >
            {/* Dialog header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 20px',
                borderBottom: `1px solid ${theme.border}`,
                flexShrink: 0,
              }}
            >
              <span style={{ fontWeight: 600, fontSize: '15px', color: theme.textPrimary }}>
                Print Purchase Order — {po.po_number}
              </span>
              <button
                onClick={() => {
                  setShowPrintModal(false)
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: theme.textMuted,
                  fontSize: '18px',
                  lineHeight: 1,
                  padding: '2px 6px',
                  borderRadius: '4px',
                }}
              >
                ×
              </button>
            </div>

            {/* iframe preview */}
            <div style={{ flex: 1, overflow: 'hidden', background: '#f3f4f6', minHeight: 0 }}>
              <iframe
                ref={printIframeRef}
                srcDoc={buildPurchaseOrderHTML({
                  po_number: po.po_number,
                  status: po.status,
                  priority: po.priority ?? 'low',
                  created_at: po.created_at,
                  expected_delivery_date: po.expected_delivery_date,
                  currency_code: po.currency_code,
                  total_amount: po.total_amount,
                  subtotal: po.subtotal ?? po.total_amount,
                  vendor_name: po.vendor_name,
                  created_by_email: po.created_by_email,
                  companyName: 'FNC Group',
                  lines: po.lines.map((l) => ({
                    description: l.description,
                    product_name: l.product_name,
                    qty: l.qty,
                    uom: l.uom,
                    unit_price: l.unit_price,
                    total: l.total,
                  })),
                })}
                style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
                title={`Purchase Order ${po.po_number}`}
              />
            </div>

            {/* Dialog footer */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '8px',
                padding: '14px 20px',
                borderTop: `1px solid ${theme.border}`,
                flexShrink: 0,
              }}
            >
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowPrintModal(false)
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => printIframeRef.current?.contentWindow?.print()}
              >
                Print / Save as PDF
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
