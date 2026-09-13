import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useLazyQuery } from '@apollo/client'
import {
  REQUISITION_ITEMS_BOUGHT_QUERY,
  RECORD_LINE_PURCHASE,
  APPROVE_TOLERANCE_PURCHASE,
  MARK_REQUISITION_LINE_SHORT,
  FINISH_BUYING_REQUISITION,
  ENSURE_CASH_PURCHASE_VENDOR,
} from '../../../graphql/requisitions'
import { VENDORS_QUERY, CREATE_VENDOR, REQUEST_UPLOAD_URL } from '../../../graphql/procurement'
import { FILE_DOWNLOAD_URL_QUERY } from '../../../graphql/hr'
import { useAuthStore } from '../../../store/authStore'
import { useTheme } from '../../../theme/ThemeContext'
import { usePermission } from '../../../hooks/usePermission'
import { usePagePadding } from '../../../hooks/usePagePadding'
import { useEntityChanged } from '../../../hooks/useEntityChanged'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { Select } from '../../../components/ui/Select'
import { SearchableSelect } from '../../../components/ui/SearchableSelect'
import { Modal } from '../../../components/ui/Modal'
import { useToastStore } from '../../../store/toastStore'
import { useTourStore } from '../../../store/tourStore'
import {
  TOUR_DEMO_REQUISITION_ID,
  buildTourDemoItemsBoughtRequisition,
} from '../../../components/help/tourDemoRequisition'

const CURRENCIES = ['IQD', 'USD', 'EUR', 'TRY', 'AED']
const CASH_VENDOR_VALUE = '__cash__'

const fmtN = (n: string | number | null | undefined) =>
  parseFloat(String(n ?? 0)).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

export interface Purchase {
  id: string
  vendor_id: string
  vendor_name?: string | null
  currency_code: string
  qty: string
  actual_unit_price: string
  bought_by?: string | null
  bought_by_name?: string | null
  bought_at: string
  over_tolerance: boolean
  tolerance_approved_by?: string | null
  tolerance_approved_by_name?: string | null
  receipt_file_id?: string | null
  receipt_filename?: string | null
}

export interface ReqLine {
  id: string
  description?: string | null
  product_id?: string | null
  product_name?: string | null
  sku?: string | null
  qty: string
  uom?: string | null
  currency_code: string
  unit_price: string
  approved_unit_price?: string | null
  qty_from_stock?: string | null
  short_reason?: string | null
  short_marked_by?: string | null
  short_marked_at?: string | null
  account_id?: string | null
  account_code?: string | null
  account_name?: string | null
  cost_center_id?: string | null
  cost_center_name?: string | null
  purchases: Purchase[]
}

export interface Requisition {
  id: string
  requisition_number: string
  status: string
  callerHasBuyerPosition?: boolean
  callerCanApprove?: boolean
  lines: ReqLine[]
}

interface Vendor {
  id: string
  name: string
  is_cash_purchase: boolean
}

function remainingToBuy(line: ReqLine): number {
  const ordered = parseFloat(line.qty)
  const fromStock = parseFloat(line.qty_from_stock ?? '0')
  const bought = line.purchases.reduce((sum, p) => sum + parseFloat(p.qty), 0)
  return Math.max(0, ordered - fromStock - bought)
}

function lineIsResolved(line: ReqLine): boolean {
  return !!line.short_marked_at || remainingToBuy(line) <= 0.0001
}

export default function ItemsBoughtPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { theme } = useTheme()
  const { isSystemLevel } = usePermission()
  const currentUserId = useAuthStore((s) => s.user?.id)
  const accessToken = useAuthStore((s) => s.accessToken)
  const addToast = useToastStore((s) => s.addToast)
  const padding = usePagePadding()
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const isTourMode = useTourStore((s) => s.isActive)
  const isTourDemo = id === TOUR_DEMO_REQUISITION_ID

  const { data, loading, refetch } = useQuery(REQUISITION_ITEMS_BOUGHT_QUERY, {
    variables: { id },
    skip: !id || isTourDemo,
    fetchPolicy: 'cache-and-network',
  })
  useEntityChanged('requisition', () => void refetch())
  const req: Requisition | undefined = isTourDemo ? buildTourDemoItemsBoughtRequisition() : data?.requisition

  const { data: vendorsData } = useQuery(VENDORS_QUERY)
  const vendors: Vendor[] = (vendorsData?.vendors ?? []).filter((v: Vendor) => !v.is_cash_purchase)

  const [ensureCashVendor] = useMutation(ENSURE_CASH_PURCHASE_VENDOR)
  const [cashVendorId, setCashVendorId] = useState<string | null>(null)
  useEffect(() => {
    if (!id) return
    void ensureCashVendor().then((res) => {
      const vendorId = res.data?.ensureCashPurchaseVendor?.id
      if (vendorId) setCashVendorId(vendorId)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const onErr = (e: Error) => addToast({ type: 'error', message: e.message })

  const [recordPurchase, { loading: lRecording }] = useMutation(RECORD_LINE_PURCHASE, {
    onCompleted: () => void refetch(),
    onError: onErr,
  })
  const [approveTolerance, { loading: lApproving }] = useMutation(APPROVE_TOLERANCE_PURCHASE, {
    onCompleted: () => void refetch(),
    onError: onErr,
  })
  const [markShort, { loading: lMarkingShort }] = useMutation(MARK_REQUISITION_LINE_SHORT, {
    onCompleted: () => {
      setShortReasonFor(null)
      setShortReasonText('')
      void refetch()
    },
    onError: onErr,
  })
  const [finishBuying, { loading: lFinishing }] = useMutation(FINISH_BUYING_REQUISITION, {
    onCompleted: () => {
      addToast({ type: 'success', message: 'Buying finished' })
      navigate(`/procurement/requisitions/${id}`)
    },
    onError: onErr,
  })
  const [createVendor] = useMutation(CREATE_VENDOR)
  const [requestUploadUrl] = useMutation(REQUEST_UPLOAD_URL)
  const [getDownloadUrl] = useLazyQuery(FILE_DOWNLOAD_URL_QUERY)

  // ── Per-line "record a purchase" form state ─────────────────────────────
  const [selectedVendor, setSelectedVendor] = useState<Record<string, string>>({})
  const [purchaseQty, setPurchaseQty] = useState<Record<string, string>>({})
  const [purchasePrice, setPurchasePrice] = useState<Record<string, string>>({})
  const [purchaseCurrency, setPurchaseCurrency] = useState<Record<string, string>>({})
  const [pendingFile, setPendingFile] = useState<Record<string, File | null>>({})
  const [uploadingLine, setUploadingLine] = useState<string | null>(null)
  const [shortReasonFor, setShortReasonFor] = useState<string | null>(null)
  const [shortReasonText, setShortReasonText] = useState('')
  const [quickCreateOpen, setQuickCreateOpen] = useState(false)
  const [quickCreateLineId, setQuickCreateLineId] = useState<string | null>(null)
  const [quickCreateName, setQuickCreateName] = useState('')
  const [creatingVendor, setCreatingVendor] = useState(false)

  if (!id) return null
  if (loading && !req) {
    return (
      <div style={{ ...padding, maxWidth: '1100px', margin: '0 auto' }}>
        <div style={{ color: theme.textMuted, fontSize: '13px' }}>Loading…</div>
      </div>
    )
  }
  if (!req) {
    return (
      <div style={{ ...padding, maxWidth: '1100px', margin: '0 auto' }}>
        <div style={{ color: theme.textMuted, fontSize: '13px' }}>Requisition not found.</div>
      </div>
    )
  }

  const canBuy = isSystemLevel || !!req.callerHasBuyerPosition
  const canApproveTolerance = isSystemLevel || !!req.callerCanApprove

  const vendorOptions = [
    { value: CASH_VENDOR_VALUE, label: '💵 Cash Purchase' },
    ...vendors.map((v) => ({ value: v.id, label: v.name })),
  ]

  // ── Finish Buying gates (mirrors finishBuyingRequisition's own 3 gates) ──
  const unresolvedLines = req.lines.filter((l) => !lineIsResolved(l))
  const allPurchases = req.lines.flatMap((l) => l.purchases)
  const missingReceipt = allPurchases.filter((p) => !p.receipt_file_id)
  const unapprovedTolerance = allPurchases.filter((p) => p.over_tolerance && !p.tolerance_approved_by)
  const canFinishBuying =
    unresolvedLines.length === 0 && missingReceipt.length === 0 && unapprovedTolerance.length === 0

  async function handleUploadAndRecord(lineId: string) {
    const vendorSel = selectedVendor[lineId]
    const qty = parseFloat(purchaseQty[lineId] ?? '0')
    const price = parseFloat(purchasePrice[lineId] ?? '0')
    const file = pendingFile[lineId]
    if (!vendorSel) {
      addToast({ type: 'error', message: 'Select a vendor' })
      return
    }
    if (!(qty > 0)) {
      addToast({ type: 'error', message: 'Qty must be greater than 0' })
      return
    }
    if (!(price > 0)) {
      addToast({ type: 'error', message: 'Actual price must be greater than 0' })
      return
    }
    if (!file) {
      addToast({ type: 'error', message: 'Attach a receipt photo' })
      return
    }
    const vendorId = vendorSel === CASH_VENDOR_VALUE ? cashVendorId : vendorSel
    if (!vendorId) {
      addToast({ type: 'error', message: 'Cash Purchase vendor is not ready yet — try again in a moment' })
      return
    }
    const line = req?.lines.find((l) => l.id === lineId)
    const currencyCode = purchaseCurrency[lineId] ?? line?.currency_code ?? 'IQD'

    setUploadingLine(lineId)
    try {
      // Tour mode: requestUploadUrl is an Apollo mutation, mocked fine by
      // the global tourLink — but the raw fetch() below it is not an
      // Apollo operation, so it isn't intercepted, and the mocked
      // response has no real fileId to give it anyway. Skip straight to
      // recordPurchase with a placeholder id, same as everywhere else in
      // the tour where a real upload/attachment step is stood in for.
      let fileId: string | null | undefined = 'tour-demo-receipt'
      if (!isTourMode) {
        const { data: urlData } = await requestUploadUrl({
          variables: {
            filename: file.name,
            mimeType: file.type || 'application/octet-stream',
            sizeBytes: file.size,
            category: 'attachment',
          },
        })
        fileId = urlData?.requestUploadUrl?.fileId
        if (!fileId) throw new Error('Could not prepare the upload')

        const apiBase = import.meta.env.VITE_API_URL as string
        const proxyRes = await fetch(`${apiBase}/api/v1/files/${fileId}/content`, {
          method: 'POST',
          body: file,
          headers: {
            'Content-Type': file.type || 'application/octet-stream',
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
        })
        if (!proxyRes.ok) {
          const errJson = (await proxyRes.json().catch(() => ({}))) as { error?: { message?: string } }
          throw new Error(errJson?.error?.message ?? `Upload failed: ${proxyRes.statusText}`)
        }
      }

      await recordPurchase({
        variables: {
          input: { lineId, vendorId, qty, actualUnitPrice: price, currencyCode, receiptFileId: fileId },
        },
      })
      addToast({ type: 'success', message: 'Purchase recorded' })
      setSelectedVendor((prev) => ({ ...prev, [lineId]: '' }))
      setPurchaseQty((prev) => ({ ...prev, [lineId]: '' }))
      setPurchasePrice((prev) => ({ ...prev, [lineId]: '' }))
      setPendingFile((prev) => ({ ...prev, [lineId]: null }))
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    } finally {
      setUploadingLine(null)
    }
  }

  async function handleQuickCreateVendor() {
    if (!quickCreateName.trim() || !quickCreateLineId) return
    setCreatingVendor(true)
    try {
      const result = await createVendor({
        variables: { input: { name: quickCreateName.trim() } },
        refetchQueries: [{ query: VENDORS_QUERY }],
      })
      const newId = result.data?.createVendor?.id
      if (newId) setSelectedVendor((prev) => ({ ...prev, [quickCreateLineId]: newId }))
      addToast({ type: 'success', message: 'Vendor created' })
      setQuickCreateOpen(false)
      setQuickCreateName('')
      setQuickCreateLineId(null)
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    } finally {
      setCreatingVendor(false)
    }
  }

  async function handleViewReceipt(fileId: string) {
    const { data: dlData } = await getDownloadUrl({ variables: { fileId } })
    const url = dlData?.fileDownloadUrl?.downloadUrl
    if (url) window.open(url, '_blank', 'noopener,noreferrer')
    else addToast({ type: 'error', message: 'Could not load the receipt' })
  }

  return (
    <div style={{ ...padding, maxWidth: '1100px', margin: '0 auto' }}>
      <PageHeader
        title={`Items Bought — ${req.requisition_number}`}
        subtitle="Record each purchase, per vendor, with its receipt"
        backPath={`/procurement/requisitions/${id}`}
        backLabel="Requisition"
        status={<Badge variant={req.status === 'items_bought' ? 'accent' : 'neutral'}>{req.status}</Badge>}
      />

      {!canBuy && (
        <Card style={{ padding: '14px 20px', marginTop: '16px', borderLeft: `3px solid ${theme.warning}` }}>
          <div style={{ fontSize: '13px', color: theme.textMuted }}>
            Only a buyer position holder for this requisition (or an admin) can record purchases here.
            You can still review what's been recorded so far.
          </div>
        </Card>
      )}

      {req.status !== 'items_bought' && (
        <Card style={{ padding: '14px 20px', marginTop: '16px', borderLeft: `3px solid ${theme.info}` }}>
          <div style={{ fontSize: '13px', color: theme.textMuted }}>
            This requisition is no longer at the items_bought stage — shown read-only.
          </div>
        </Card>
      )}

      {req.lines.map((line) => {
        const resolved = lineIsResolved(line)
        const remaining = remainingToBuy(line)
        return (
          <Card
            key={line.id}
            data-tour={isTourDemo ? `items-bought-line-${line.id}` : undefined}
            style={{ padding: '20px', marginTop: '16px' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: theme.textPrimary }}>
                  {line.description || line.product_name || '—'}
                </div>
                <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '2px' }}>
                  Ordered {fmtN(line.qty)} {line.uom} — from stock {fmtN(line.qty_from_stock ?? 0)} — remaining to buy{' '}
                  <strong style={{ color: remaining > 0 ? theme.warning : theme.success }}>{fmtN(remaining)}</strong>
                  {line.approved_unit_price && (
                    <> — approved price {fmtN(line.approved_unit_price)} {line.currency_code}</>
                  )}
                </div>
                {(line.account_name || line.cost_center_name) && (
                  <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '2px' }}>
                    {line.account_name ? `Account: ${line.account_name}` : ''}
                    {line.account_name && line.cost_center_name ? ' · ' : ''}
                    {line.cost_center_name ? `Cost center: ${line.cost_center_name}` : ''}
                  </div>
                )}
              </div>
              {line.short_marked_at && (
                <Badge variant="neutral">Marked short — {line.short_reason}</Badge>
              )}
              {resolved && !line.short_marked_at && <Badge variant="success">Fully bought</Badge>}
            </div>

            {/* ── Existing purchases for this line ── */}
            {line.purchases.length > 0 && (
              <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {line.purchases.map((p) => (
                  <div
                    key={p.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      flexWrap: 'wrap',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: `1px solid ${p.over_tolerance && !p.tolerance_approved_by ? theme.warning : theme.border}`,
                      background: p.over_tolerance && !p.tolerance_approved_by ? theme.warningBg : theme.bgSurface,
                      fontSize: '12px',
                    }}
                  >
                    <span style={{ fontWeight: 600, color: theme.textPrimary }}>{p.vendor_name ?? 'Vendor'}</span>
                    <span style={{ color: theme.textSecondary }}>
                      {fmtN(p.qty)} @ {fmtN(p.actual_unit_price)} {p.currency_code}
                    </span>
                    <span style={{ color: theme.textMuted }}>{p.bought_by_name ?? ''}</span>
                    {p.receipt_file_id ? (
                      <button
                        onClick={() => void handleViewReceipt(p.receipt_file_id!)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: theme.accent,
                          cursor: 'pointer',
                          fontSize: '12px',
                          padding: 0,
                        }}
                      >
                        📎 Receipt
                      </button>
                    ) : (
                      <span style={{ color: theme.danger }}>⚠ No receipt</span>
                    )}
                    {p.over_tolerance && (
                      <Badge variant={p.tolerance_approved_by ? 'success' : 'warning'}>
                        {p.tolerance_approved_by ? `Approved by ${p.tolerance_approved_by_name ?? ''}` : 'Over tolerance'}
                      </Badge>
                    )}
                    {p.over_tolerance && !p.tolerance_approved_by && (
                      <Button
                        data-tour="items-bought-approve-override-btn"
                        variant="secondary"
                        size="sm"
                        loading={lApproving}
                        disabled={!canApproveTolerance || p.bought_by === currentUserId}
                        onClick={() => void approveTolerance({ variables: { purchaseId: p.id } })}
                      >
                        {p.bought_by === currentUserId ? 'Needs a different approver' : 'Approve override'}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* ── Record a purchase / mark short ── */}
            {canBuy && req.status === 'items_bought' && !line.short_marked_at && remaining > 0 && (
              <div style={{ marginTop: '14px', padding: '14px', borderRadius: '8px', border: `1px solid ${theme.border}` }}>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <div style={{ flex: 1, minWidth: '200px' }}>
                    <div data-tour="items-bought-vendor-row" style={{ display: 'flex', gap: '6px', alignItems: 'flex-end' }}>
                      <div style={{ flex: 1 }}>
                        <SearchableSelect
                          label="Vendor"
                          value={selectedVendor[line.id] ?? ''}
                          onChange={(v) => setSelectedVendor((prev) => ({ ...prev, [line.id]: v }))}
                          options={vendorOptions}
                          placeholder="Search vendor…"
                          minDropdownWidth={320}
                        />
                      </div>
                      <Button
                        data-tour="items-bought-new-vendor-btn"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setQuickCreateLineId(line.id)
                          setQuickCreateOpen(true)
                        }}
                      >
                        + New
                      </Button>
                    </div>
                  </div>
                  <div data-tour="items-bought-qty-price-row" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <div style={{ width: '110px' }}>
                    <Input
                      label="Qty"
                      type="number"
                      min="0"
                      max={remaining}
                      value={purchaseQty[line.id] ?? ''}
                      onChange={(e) => setPurchaseQty((prev) => ({ ...prev, [line.id]: e.target.value }))}
                    />
                  </div>
                  <div style={{ width: '130px' }}>
                    <Input
                      label="Actual price"
                      type="number"
                      min="0"
                      value={purchasePrice[line.id] ?? ''}
                      onChange={(e) => setPurchasePrice((prev) => ({ ...prev, [line.id]: e.target.value }))}
                    />
                  </div>
                  <div style={{ width: '100px' }}>
                    <Select
                      label="Currency"
                      value={purchaseCurrency[line.id] ?? line.currency_code}
                      onChange={(e) => setPurchaseCurrency((prev) => ({ ...prev, [line.id]: e.target.value }))}
                      options={CURRENCIES.map((c) => ({ value: c, label: c }))}
                    />
                  </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '10px', flexWrap: 'wrap' }}>
                  <input
                    ref={(el) => {
                      fileInputRefs.current[line.id] = el
                    }}
                    type="file"
                    accept="image/*,application/pdf"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null
                      setPendingFile((prev) => ({ ...prev, [line.id]: file }))
                      e.target.value = ''
                    }}
                  />
                  <Button
                    data-tour="items-bought-attach-receipt-btn"
                    variant="secondary"
                    size="sm"
                    onClick={() => fileInputRefs.current[line.id]?.click()}
                  >
                    {pendingFile[line.id] ? `📎 ${pendingFile[line.id]!.name}` : 'Attach receipt photo *'}
                  </Button>
                  <Button
                    data-tour="items-bought-record-btn"
                    variant="primary"
                    size="sm"
                    loading={lRecording || uploadingLine === line.id}
                    onClick={() => void handleUploadAndRecord(line.id)}
                  >
                    Record purchase
                  </Button>
                  <Button
                    data-tour="items-bought-mark-short-btn"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShortReasonFor(line.id)}
                  >
                    Mark short
                  </Button>
                </div>
              </div>
            )}

            {shortReasonFor === line.id && (
              <div style={{ marginTop: '10px', display: 'flex', gap: '8px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '200px' }}>
                  <Input
                    label="Reason the vendor can't supply the rest"
                    value={shortReasonText}
                    onChange={(e) => setShortReasonText(e.target.value)}
                  />
                </div>
                <Button
                  variant="danger"
                  size="sm"
                  loading={lMarkingShort}
                  disabled={!shortReasonText.trim()}
                  onClick={() => void markShort({ variables: { lineId: line.id, reason: shortReasonText } })}
                >
                  Confirm mark short
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setShortReasonFor(null)}>
                  Cancel
                </Button>
              </div>
            )}
          </Card>
        )
      })}

      {req.status === 'items_bought' && canBuy && (
        <Card style={{ padding: '20px', marginTop: '16px' }}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: theme.textPrimary, marginBottom: '8px' }}>
            Finish buying
          </div>
          {!canFinishBuying && (
            <ul style={{ fontSize: '12px', color: theme.warning, margin: '0 0 12px', paddingLeft: '18px' }}>
              {unresolvedLines.length > 0 && (
                <li>{unresolvedLines.length} line(s) still have qty remaining to buy or mark short</li>
              )}
              {missingReceipt.length > 0 && <li>{missingReceipt.length} purchase(s) are missing a receipt photo</li>}
              {unapprovedTolerance.length > 0 && (
                <li>{unapprovedTolerance.length} over-tolerance purchase(s) still need supervisor approval</li>
              )}
            </ul>
          )}
          <Button
            data-tour="items-bought-finish-buying-btn"
            variant="primary"
            loading={lFinishing}
            disabled={!canFinishBuying}
            onClick={() => void finishBuying({ variables: { id: req.id } })}
          >
            Finish Buying
          </Button>
        </Card>
      )}

      <Modal
        open={quickCreateOpen}
        onClose={() => {
          setQuickCreateOpen(false)
          setQuickCreateName('')
        }}
        title="New vendor"
        size="sm"
        footer={
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <Button variant="ghost" size="sm" onClick={() => setQuickCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={creatingVendor}
              disabled={!quickCreateName.trim()}
              onClick={() => void handleQuickCreateVendor()}
            >
              Create
            </Button>
          </div>
        }
      >
        <Input
          label="Vendor name"
          value={quickCreateName}
          onChange={(e) => setQuickCreateName(e.target.value)}
          placeholder="e.g. Al-Rasheed Hardware"
        />
      </Modal>
    </div>
  )
}
