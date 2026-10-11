import { getRequisitionStatusLabel } from '../../../lib/requisition-constants'
import { useTranslation } from 'react-i18next'
import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@apollo/client'
import {
  REQUISITION_ITEMS_BOUGHT_QUERY,
  RECORD_LINE_PURCHASE,
  APPROVE_TOLERANCE_PURCHASE,
  REJECT_TOLERANCE_PURCHASE,
  MARK_REQUISITION_LINE_SHORT,
  RESOLVE_REQUISITION_LINE_FROM_STOCK,
  FINISH_BUYING_REQUISITION,
  ENSURE_CASH_PURCHASE_VENDOR,
} from '../../../graphql/requisitions'
import { VENDORS_QUERY, CREATE_VENDOR, REQUEST_UPLOAD_URL } from '../../../graphql/procurement'
import {
  STOCK_LOCATIONS_QUERY,
  CENTRAL_WAREHOUSE_LOCATIONS_QUERY,
} from '../../../graphql/inventory'
import { ATTACH_FILE } from '../../../graphql/hr'
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
import { EntityAttachments } from '../../../components/inventory/EntityAttachments'
import { useToastStore } from '../../../store/toastStore'
import type {
  ApproveTolerancePurchaseMutation,
  ApproveTolerancePurchaseMutationVariables,
  AttachFileMutation,
  AttachFileMutationVariables,
  CentralWarehouseLocationsQuery,
  CentralWarehouseLocationsQueryVariables,
  CreateVendorMutation,
  CreateVendorMutationVariables,
  EnsureCashPurchaseVendorMutation,
  EnsureCashPurchaseVendorMutationVariables,
  FinishBuyingRequisitionMutation,
  FinishBuyingRequisitionMutationVariables,
  MarkRequisitionLineShortMutation,
  MarkRequisitionLineShortMutationVariables,
  RecordLinePurchaseMutation,
  RecordLinePurchaseMutationVariables,
  RejectTolerancePurchaseMutation,
  RejectTolerancePurchaseMutationVariables,
  ResolveRequisitionLineFromStockMutation,
  ResolveRequisitionLineFromStockMutationVariables,
  RequestUploadUrlMutation,
  RequestUploadUrlMutationVariables,
  RequisitionItemsBoughtQuery,
  RequisitionItemsBoughtQueryVariables,
  StockLocationsQuery,
  StockLocationsQueryVariables,
  VendorsQuery,
  VendorsQueryVariables,
} from '../../../graphql/generated'

const CURRENCIES = ['IQD', 'USD', 'EUR', 'TRY', 'AED']
const CASH_VENDOR_VALUE = '__cash__'
// Sentinel quickCreateLineId meaning "apply the newly created vendor to
// every still-needed line" rather than one specific line — used by the
// "all items are from the same vendor" toggle's own + New button.
const ALL_LINES_SENTINEL = '__all__'

const fmtN = (n: string | number | null | undefined) =>
  parseFloat(String(n ?? 0)).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })

interface Purchase {
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

interface ReqLine {
  id: string
  description?: string | null
  product_id?: string | null
  product_name?: string | null
  product_name_ar?: string | null
  sku?: string | null
  qty: string
  uom?: string | null
  currency_code: string | null
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

interface Requisition {
  id: string
  requisition_number: string
  status: string
  callerHasBuyerPosition?: boolean | null
  callerCanApprove?: boolean | null
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
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { theme } = useTheme()
  const { isSystemLevel } = usePermission()
  const currentUserId = useAuthStore((s) => s.user?.id)
  const accessToken = useAuthStore((s) => s.accessToken)
  const addToast = useToastStore((s) => s.addToast)
  const padding = usePagePadding()
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const globalFileInputRef = useRef<HTMLInputElement | null>(null)
  // Mirrors globalReceiptFileIds synchronously so a "record all" loop reuses
  // the first upload instead of reading stale state and re-uploading per line.
  const globalReceiptFileIdsRef = useRef<string[] | null>(null)

  const { data, loading, refetch } = useQuery<
    RequisitionItemsBoughtQuery,
    RequisitionItemsBoughtQueryVariables
  >(REQUISITION_ITEMS_BOUGHT_QUERY, {
    variables: { id: id ?? '' },
    skip: !id,
    fetchPolicy: 'cache-and-network',
  })
  useEntityChanged('requisition', () => void refetch())
  const req: Requisition | undefined = data?.requisition
    ? {
        ...data.requisition,
        lines: (data.requisition.lines ?? []).map((l) => ({ ...l, purchases: l.purchases ?? [] })),
      }
    : undefined

  const { data: vendorsData } = useQuery<VendorsQuery, VendorsQueryVariables>(VENDORS_QUERY)
  const vendors: Vendor[] = (vendorsData?.vendors ?? [])
    .filter((v): v is NonNullable<typeof v> => v !== null)
    .filter((v) => !v.is_cash_purchase)

  // "Resolve from stock" location picker — own company's locations plus the
  // group's central warehouse (same includeCentralWarehouse reasoning used
  // throughout procurement: stock a buyer needs to resolve a line against
  // may live at the central warehouse, not necessarily this company).
  const { data: locationsData } = useQuery<StockLocationsQuery, StockLocationsQueryVariables>(
    STOCK_LOCATIONS_QUERY,
    { variables: { isActive: true } },
  )
  const { data: centralLocationsData } = useQuery<
    CentralWarehouseLocationsQuery,
    CentralWarehouseLocationsQueryVariables
  >(CENTRAL_WAREHOUSE_LOCATIONS_QUERY, { variables: { isActive: true } })
  const stockLocationOptions = [
    ...(locationsData?.stockLocations ?? [])
      .filter((l) => !['virtual_in', 'virtual_out'].includes(l.type))
      .map((l) => ({ value: l.id, label: l.name })),
    ...(centralLocationsData?.centralWarehouseLocations ?? [])
      .filter((l) => !['virtual_in', 'virtual_out'].includes(l.type))
      .map((l) => ({ value: l.id, label: t('req.bought.centralWarehouseSuffix', { name: l.name }) })),
  ]

  const [ensureCashVendor] = useMutation<
    EnsureCashPurchaseVendorMutation,
    EnsureCashPurchaseVendorMutationVariables
  >(ENSURE_CASH_PURCHASE_VENDOR)
  const [cashVendorId, setCashVendorId] = useState<string | null>(null)
  useEffect(() => {
    if (!id) return
    void ensureCashVendor().then((res) => {
      const vendorId = res.data?.ensureCashPurchaseVendor.id
      if (vendorId) setCashVendorId(vendorId)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const onErr = (e: Error) => {
    addToast({ type: 'error', message: e.message })
  }

  const [recordPurchase, { loading: lRecording }] = useMutation<
    RecordLinePurchaseMutation,
    RecordLinePurchaseMutationVariables
  >(RECORD_LINE_PURCHASE, {
    onCompleted: () => void refetch(),
    onError: onErr,
  })
  const [approveTolerance, { loading: lApproving }] = useMutation<
    ApproveTolerancePurchaseMutation,
    ApproveTolerancePurchaseMutationVariables
  >(APPROVE_TOLERANCE_PURCHASE, {
    onCompleted: () => void refetch(),
    onError: onErr,
  })
  const [rejectTolerance, { loading: lRejecting }] = useMutation<
    RejectTolerancePurchaseMutation,
    RejectTolerancePurchaseMutationVariables
  >(REJECT_TOLERANCE_PURCHASE, {
    onCompleted: () => {
      addToast({
        type: 'success',
        message: t('req.bought.purchaseRejectedRecordItAgainWith'),
      })
      setRejectPurchaseFor(null)
      setRejectPurchaseReason('')
      void refetch()
    },
    onError: onErr,
  })
  const [markShort, { loading: lMarkingShort }] = useMutation<
    MarkRequisitionLineShortMutation,
    MarkRequisitionLineShortMutationVariables
  >(MARK_REQUISITION_LINE_SHORT, {
    onCompleted: () => {
      setShortReasonFor(null)
      setShortReasonText('')
      void refetch()
    },
    onError: onErr,
  })
  const [resolveFromStock, { loading: lResolvingStock }] = useMutation<
    ResolveRequisitionLineFromStockMutation,
    ResolveRequisitionLineFromStockMutationVariables
  >(RESOLVE_REQUISITION_LINE_FROM_STOCK, {
    onCompleted: () => {
      addToast({ type: 'success', message: t('req.bought.resolvedFromStockNoPurchaseNeeded') })
      setResolveStockFor(null)
      setResolveStockQty('')
      setResolveStockLocation('')
      void refetch()
    },
    onError: onErr,
  })
  const [finishBuying, { loading: lFinishing }] = useMutation<
    FinishBuyingRequisitionMutation,
    FinishBuyingRequisitionMutationVariables
  >(FINISH_BUYING_REQUISITION, {
    onCompleted: () => {
      addToast({ type: 'success', message: t('req.bought.buyingFinished') })
      navigate(`/procurement/requisitions/${id}`)
    },
    onError: onErr,
  })
  const [createVendor] = useMutation<CreateVendorMutation, CreateVendorMutationVariables>(
    CREATE_VENDOR,
  )
  const [requestUploadUrl] = useMutation<
    RequestUploadUrlMutation,
    RequestUploadUrlMutationVariables
  >(REQUEST_UPLOAD_URL)
  // Attaches every receipt photo past the first one — recordLinePurchase
  // only ever takes one receiptFileId (the primary), so extras are
  // attached right after via the same generic document_attachments
  // mechanism the post-record "Receipts" modal uses, pointed at the newly
  // created purchase's own id.
  const [attachFile] = useMutation<AttachFileMutation, AttachFileMutationVariables>(ATTACH_FILE)

  // ── Per-line "record a purchase" form state ─────────────────────────────
  const [selectedVendor, setSelectedVendor] = useState<Record<string, string>>({})
  const [sameVendorForAll, setSameVendorForAll] = useState(false)
  const [globalVendorId, setGlobalVendorId] = useState('')
  const [purchaseQty, setPurchaseQty] = useState<Record<string, string>>({})
  const [purchasePrice, setPurchasePrice] = useState<Record<string, string>>({})
  const [purchaseCurrency, setPurchaseCurrency] = useState<Record<string, string>>({})
  const [pendingFiles, setPendingFiles] = useState<Record<string, File[]>>({})
  const [sameReceiptForAll, setSameReceiptForAll] = useState(false)
  const [globalReceiptFiles, setGlobalReceiptFiles] = useState<File[]>([])
  // Cached fileIds from the first line these receipts were uploaded for —
  // reused for every subsequent line so the same files are uploaded once,
  // not once per line they're attached to.
  const [globalReceiptFileIds, setGlobalReceiptFileIds] = useState<string[] | null>(null)
  const [uploadingLine, setUploadingLine] = useState<string | null>(null)
  const [recordingAll, setRecordingAll] = useState(false)
  const [shortReasonFor, setShortReasonFor] = useState<string | null>(null)
  const [shortReasonText, setShortReasonText] = useState('')
  const [rejectPurchaseFor, setRejectPurchaseFor] = useState<string | null>(null)
  const [rejectPurchaseReason, setRejectPurchaseReason] = useState('')
  const [resolveStockFor, setResolveStockFor] = useState<string | null>(null)
  const [resolveStockQty, setResolveStockQty] = useState('')
  const [resolveStockLocation, setResolveStockLocation] = useState('')
  // Purchase id whose receipts modal is open — lets a buyer attach more
  // than one receipt photo per purchase (e.g. several pages of one
  // receipt) via the same generic document_attachments mechanism already
  // used for signed documents elsewhere, instead of the single receiptFileId
  // recordLinePurchase sets as the primary one at record time.
  const [receiptsModalFor, setReceiptsModalFor] = useState<string | null>(null)
  const [quickCreateOpen, setQuickCreateOpen] = useState(false)
  const [quickCreateLineId, setQuickCreateLineId] = useState<string | null>(null)
  const [quickCreateName, setQuickCreateName] = useState('')
  const [creatingVendor, setCreatingVendor] = useState(false)

  if (!id) return null
  if (loading && !req) {
    return (
      <div style={{ ...padding, maxWidth: '1100px', margin: '0 auto' }}>
        <div style={{ color: theme.textMuted, fontSize: '13px' }}>{t('req.bought.loading')}</div>
      </div>
    )
  }
  if (!req) {
    return (
      <div style={{ ...padding, maxWidth: '1100px', margin: '0 auto' }}>
        <div style={{ color: theme.textMuted, fontSize: '13px' }}>{t('req.bought.requisitionNotFound')}</div>
      </div>
    )
  }

  const canBuy = isSystemLevel || !!req.callerHasBuyerPosition
  const canApproveTolerance = isSystemLevel || !!req.callerCanApprove

  const vendorOptions = [
    { value: CASH_VENDOR_VALUE, label: t('req.bought.cashPurchase') },
    ...vendors.map((v) => ({ value: v.id, label: v.name })),
  ]

  // ── Finish Buying gates (mirrors finishBuyingRequisition's own 3 gates) ──
  const unresolvedLines = req.lines.filter((l) => !lineIsResolved(l))
  const allPurchases = req.lines.flatMap((l) => l.purchases)
  const missingReceipt = allPurchases.filter((p) => !p.receipt_file_id)
  const unapprovedTolerance = allPurchases.filter(
    (p) => p.over_tolerance && !p.tolerance_approved_by,
  )
  const canFinishBuying =
    unresolvedLines.length === 0 && missingReceipt.length === 0 && unapprovedTolerance.length === 0

  // Applies one vendor to every line that still needs buying — backs the
  // "all items are from the same vendor" toggle, so the buyer picks a
  // vendor once instead of per line.
  function applyVendorToAllLines(vendorId: string) {
    setGlobalVendorId(vendorId)
    setSelectedVendor((prev) => {
      const next = { ...prev }
      for (const line of req?.lines ?? []) {
        if (!line.short_marked_at && remainingToBuy(line) > 0) next[line.id] = vendorId
      }
      return next
    })
  }

  function toggleSameVendorForAll(checked: boolean) {
    setSameVendorForAll(checked)
    if (checked && globalVendorId) applyVendorToAllLines(globalVendorId)
  }

  async function uploadReceiptFile(file: File): Promise<string> {
    const { data: urlData } = await requestUploadUrl({
      variables: {
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
        category: 'attachment',
      },
    })
    const fileId = urlData?.requestUploadUrl.fileId
    if (!fileId) throw new Error(t('req.bought.couldNotPrepareUpload'))

    const apiBase = import.meta.env.VITE_API_URL
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
      throw new Error(errJson.error?.message ?? t('req.bought.uploadFailed', { reason: proxyRes.statusText }))
    }
    return fileId
  }

  async function handleUploadAndRecord(lineId: string): Promise<boolean> {
    const line = req?.lines.find((l) => l.id === lineId)
    const vendorSel = selectedVendor[lineId]
    // Qty/price default to what the buyer would very likely enter anyway
    // (the full remaining quantity, at the already-approved price) — typing
    // is only needed when the actual purchase differs.
    const qty = parseFloat(purchaseQty[lineId] || String(line ? remainingToBuy(line) : 0))
    const defaultPrice = line?.approved_unit_price ?? line?.unit_price ?? '0'
    const price = parseFloat(purchasePrice[lineId] || defaultPrice)
    const files = sameReceiptForAll ? globalReceiptFiles : (pendingFiles[lineId] ?? [])
    if (!vendorSel) {
      addToast({ type: 'error', message: t('req.bought.selectAVendor') })
      return false
    }
    if (!(qty > 0)) {
      addToast({ type: 'error', message: t('req.bought.qtyMustBeGreaterThan0') })
      return false
    }
    if (!(price > 0)) {
      addToast({ type: 'error', message: t('req.bought.actualPriceMustBeGreaterThan') })
      return false
    }
    if (files.length === 0) {
      addToast({ type: 'error', message: t('req.bought.attachAReceiptPhoto') })
      return false
    }
    const vendorId = vendorSel === CASH_VENDOR_VALUE ? cashVendorId : vendorSel
    if (!vendorId) {
      addToast({
        type: 'error',
        message: t('req.bought.cashPurchaseVendorIsNotReady'),
      })
      return false
    }
    const currencyCode = purchaseCurrency[lineId] ?? line?.currency_code ?? 'IQD'

    setUploadingLine(lineId)
    try {
      // In "same receipt for all" mode, every file is uploaded once (on the
      // first line it's used for) and every later line reuses those same
      // fileIds instead of re-uploading identical bytes.
      const sharedFileIds = globalReceiptFileIdsRef.current ?? globalReceiptFileIds
      const fileIds =
        sameReceiptForAll && sharedFileIds
          ? sharedFileIds
          : await (async () => {
              const ids: string[] = []
              for (const f of files) ids.push(await uploadReceiptFile(f))
              return ids
            })()
      if (sameReceiptForAll && !sharedFileIds) {
        globalReceiptFileIdsRef.current = fileIds
        setGlobalReceiptFileIds(fileIds)
      }

      const result = await recordPurchase({
        variables: {
          input: {
            lineId,
            vendorId,
            qty,
            actualUnitPrice: price,
            currencyCode,
            receiptFileId: fileIds[0],
          },
        },
      })
      // recordLinePurchase only takes one receiptFileId (the primary) —
      // every other attached file goes onto the new purchase's own
      // document_attachments the same way the post-record "Receipts"
      // modal would, instead of being dropped.
      const purchaseId = result.data?.recordLinePurchase.id
      if (purchaseId) {
        for (const extraFileId of fileIds.slice(1)) {
          await attachFile({
            variables: {
              fileId: extraFileId,
              entityType: 'po_line_purchase',
              entityId: purchaseId,
            },
          })
        }
      }
      addToast({ type: 'success', message: t('req.bought.purchaseRecorded') })
      // In "same vendor for all" mode, keep every line pinned to the shared
      // vendor even across this reset — otherwise a second partial purchase
      // on the same line would fail vendor validation with the field hidden.
      setSelectedVendor((prev) => ({ ...prev, [lineId]: sameVendorForAll ? globalVendorId : '' }))
      setPurchaseQty((prev) => ({ ...prev, [lineId]: '' }))
      setPurchasePrice((prev) => ({ ...prev, [lineId]: '' }))
      // In "same receipt for all" mode, keep the shared files selected so
      // the next line can reuse them too — only clear the per-line ones
      // otherwise.
      if (!sameReceiptForAll) setPendingFiles((prev) => ({ ...prev, [lineId]: [] }))
      return true
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
      return false
    } finally {
      setUploadingLine(null)
    }
  }

  // Records every line that still needs buying with the one shared receipt.
  // Sequential (each call locks its own line) and stops at the first failure
  // so the buyer fixes that line and clicks again — already-recorded lines
  // drop out of the list, so a retry never double-records them.
  async function handleRecordAll() {
    if (!req) return
    const pending = req.lines.filter((l) => !l.short_marked_at && remainingToBuy(l) > 0)
    setRecordingAll(true)
    try {
      for (const l of pending) {
        if (!(await handleUploadAndRecord(l.id))) break
      }
    } finally {
      setRecordingAll(false)
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
      const newId = result.data?.createVendor.id
      if (newId) {
        if (quickCreateLineId === ALL_LINES_SENTINEL) applyVendorToAllLines(newId)
        else setSelectedVendor((prev) => ({ ...prev, [quickCreateLineId]: newId }))
      }
      addToast({ type: 'success', message: t('req.bought.vendorCreated') })
      setQuickCreateOpen(false)
      setQuickCreateName('')
      setQuickCreateLineId(null)
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    } finally {
      setCreatingVendor(false)
    }
  }

  return (
    <div style={{ ...padding, maxWidth: '1100px', margin: '0 auto' }}>
      <PageHeader
        title={t('req.bought.pageTitle', { number: req.requisition_number })}
        subtitle={t('req.bought.recordEachPurchasePerVendorWith')}
        backPath={`/procurement/requisitions/${id}`}
        backLabel={t('req.bought.requisitionBack')}
        status={
          <Badge variant={req.status === 'items_bought' ? 'accent' : 'neutral'}>
            {getRequisitionStatusLabel(req.status)}
          </Badge>
        }
      />

      {!canBuy && (
        <Card
          style={{
            padding: '14px 20px',
            marginTop: '16px',
            borderInlineStart: `3px solid ${theme.warning}`,
          }}
        >
          <div style={{ fontSize: '13px', color: theme.textMuted }}>
            {t('req.bought.onlyABuyerPositionHolderFor')}
          </div>
        </Card>
      )}

      {req.status !== 'items_bought' && (
        <Card
          style={{ padding: '14px 20px', marginTop: '16px', borderInlineStart: `3px solid ${theme.info}` }}
        >
          <div style={{ fontSize: '13px', color: theme.textMuted }}>
            {t('req.bought.thisRequisitionIsNoLongerAt')}
          </div>
        </Card>
      )}

      {canBuy && req.status === 'items_bought' && req.lines.length > 1 && (
        <Card
          style={{
            padding: '14px 20px',
            marginTop: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          <div>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '13px',
                color: theme.textPrimary,
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={sameVendorForAll}
                onChange={(e) => {
                  toggleSameVendorForAll(e.target.checked)
                }}
              />
              {t('req.bought.allItemsAreFromTheSame')}
            </label>
            {sameVendorForAll && (
              <div
                style={{
                  display: 'flex',
                  gap: '6px',
                  alignItems: 'flex-end',
                  marginTop: '10px',
                  maxWidth: '420px',
                }}
              >
                <div style={{ flex: 1 }}>
                  <SearchableSelect
                    label={t('req.bought.vendorForAllItems')}
                    value={globalVendorId}
                    onChange={(v) => {
                      applyVendorToAllLines(v)
                    }}
                    options={vendorOptions}
                    placeholder={t('req.bought.searchVendor')}
                    minDropdownWidth={320}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setQuickCreateLineId(ALL_LINES_SENTINEL)
                    setQuickCreateOpen(true)
                  }}
                >
                  {t('req.bought.new')}
                </Button>
              </div>
            )}
          </div>
          <div>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '13px',
                color: theme.textPrimary,
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={sameReceiptForAll}
                onChange={(e) => {
                  setSameReceiptForAll(e.target.checked)
                }}
              />
              {t('req.bought.attachOneReceiptForAllItems')}
            </label>
            {sameReceiptForAll && (
              <div
                style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '10px' }}
              >
                <input
                  ref={globalFileInputRef}
                  type="file"
                  accept="image/*,application/pdf"
                  multiple
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? [])
                    setGlobalReceiptFiles((prev) => [...prev, ...files])
                    setGlobalReceiptFileIds(null)
                    globalReceiptFileIdsRef.current = null
                    e.target.value = ''
                  }}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => globalFileInputRef.current?.click()}
                >
                  {globalReceiptFiles.length > 0
                    ? `📎 ${t('req.bought.filesAttachedAddMore', { count: globalReceiptFiles.length })}`
                    : t('req.bought.attachReceiptPhotoS')}
                </Button>
                {globalReceiptFiles.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setGlobalReceiptFiles([])
                      setGlobalReceiptFileIds(null)
                      globalReceiptFileIdsRef.current = null
                    }}
                  >
                    {t('req.bought.clear')}
                  </Button>
                )}
                <Button
                  variant="primary"
                  size="sm"
                  loading={recordingAll}
                  onClick={() => void handleRecordAll()}
                >
                  {t('req.bought.recordAllPurchases')}
                </Button>
              </div>
            )}
          </div>
        </Card>
      )}

      {req.lines.map((line) => {
        const resolved = lineIsResolved(line)
        const remaining = remainingToBuy(line)
        return (
          <Card key={line.id} style={{ padding: '20px', marginTop: '16px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: '10px',
                flexWrap: 'wrap',
              }}
            >
              <div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: theme.textPrimary }}>
                  {line.description || line.product_name || '—'}
                </div>
                {line.product_name_ar && (
                  <div
                    dir="rtl"
                    style={{
                      fontSize: '12px',
                      color: theme.textMuted,
                      textAlign: 'start',
                      marginTop: '2px',
                    }}
                  >
                    {line.product_name_ar}
                  </div>
                )}
                <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '2px' }}>
                  {t('req.bought.orderedFromStock', {
                    qty: fmtN(line.qty),
                    uom: line.uom,
                    stock: fmtN(line.qty_from_stock ?? 0),
                  })}{' '}
                  {t('req.bought.remainingToBuy')}{' '}
                  <strong style={{ color: remaining > 0 ? theme.warning : theme.success }}>
                    {fmtN(remaining)}
                  </strong>
                  {line.approved_unit_price && (
                    <>
                      {' '}
                      {t('req.bought.approvedPrice', {
                        price: fmtN(line.approved_unit_price),
                        currency: line.currency_code,
                      })}
                    </>
                  )}
                </div>
                {(line.account_name || line.cost_center_name) && (
                  <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '2px' }}>
                    {line.account_name ? t('req.bought.accountLabel', { name: line.account_name }) : ''}
                    {line.account_name && line.cost_center_name ? ' · ' : ''}
                    {line.cost_center_name ? t('req.bought.costCenterLabel', { name: line.cost_center_name }) : ''}
                  </div>
                )}
              </div>
              {line.short_marked_at && (
                <Badge variant="neutral">
                  {t('req.bought.markedShort', { reason: line.short_reason })}
                </Badge>
              )}
              {resolved && !line.short_marked_at && <Badge variant="success">{t('req.bought.fullyBought')}</Badge>}
            </div>

            {/* ── Existing purchases for this line ── */}
            {line.purchases.length > 0 && (
              <div
                style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}
              >
                {line.purchases.map((p) => (
                  <div key={p.id}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        flexWrap: 'wrap',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        border: `1px solid ${p.over_tolerance && !p.tolerance_approved_by ? theme.warning : theme.border}`,
                        background:
                          p.over_tolerance && !p.tolerance_approved_by
                            ? theme.warningBg
                            : theme.bgSurface,
                        fontSize: '12px',
                      }}
                    >
                      <span style={{ fontWeight: 600, color: theme.textPrimary }}>
                        {p.vendor_name ?? t('req.bought.vendor')}
                      </span>
                      <span style={{ color: theme.textSecondary }}>
                        {fmtN(p.qty)} @ {fmtN(p.actual_unit_price)} {p.currency_code}
                      </span>
                      <span style={{ color: theme.textMuted }}>{p.bought_by_name ?? ''}</span>
                      <button
                        onClick={() => {
                          setReceiptsModalFor(p.id)
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: p.receipt_file_id ? theme.accent : theme.danger,
                          cursor: 'pointer',
                          fontSize: '12px',
                          padding: 0,
                        }}
                      >
                        {p.receipt_file_id ? t('req.bought.receipts') : t('req.bought.noReceiptAddOne')}
                      </button>
                      {p.over_tolerance && (
                        <Badge variant={p.tolerance_approved_by ? 'success' : 'warning'}>
                          {p.tolerance_approved_by
                            ? t('req.bought.approvedBy', { name: p.tolerance_approved_by_name ?? '' })
                            : t('req.bought.overTolerance')}
                        </Badge>
                      )}
                      {p.over_tolerance && !p.tolerance_approved_by && (
                        <>
                          <Button
                            variant="secondary"
                            size="sm"
                            loading={lApproving}
                            disabled={!canApproveTolerance || p.bought_by === currentUserId}
                            onClick={() =>
                              void approveTolerance({ variables: { purchaseId: p.id } })
                            }
                          >
                            {p.bought_by === currentUserId
                              ? t('req.bought.needsADifferentApprover')
                              : t('req.bought.approveOverride')}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            style={{ color: theme.danger }}
                            disabled={!canApproveTolerance || p.bought_by === currentUserId}
                            onClick={() => {
                              setRejectPurchaseFor(p.id)
                            }}
                          >
                            {t('req.bought.reject')}
                          </Button>
                        </>
                      )}
                    </div>
                    {rejectPurchaseFor === p.id && (
                      <div
                        style={{
                          marginTop: '10px',
                          width: '100%',
                          display: 'flex',
                          gap: '8px',
                          alignItems: 'flex-end',
                          flexWrap: 'wrap',
                        }}
                      >
                        <div style={{ flex: 1, minWidth: '200px' }}>
                          <Input
                            label={t('req.bought.whyIsThisRejectedTheBuyer')}
                            value={rejectPurchaseReason}
                            onChange={(e) => {
                              setRejectPurchaseReason(e.target.value)
                            }}
                          />
                        </div>
                        <Button
                          variant="danger"
                          size="sm"
                          loading={lRejecting}
                          disabled={!rejectPurchaseReason.trim()}
                          onClick={() =>
                            void rejectTolerance({
                              variables: { purchaseId: p.id, reason: rejectPurchaseReason },
                            })
                          }
                        >
                          {t('req.bought.confirmReject')}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setRejectPurchaseFor(null)
                            setRejectPurchaseReason('')
                          }}
                        >
                          {t('req.bought.cancel')}
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* ── Record a purchase / mark short ── */}
            {canBuy && req.status === 'items_bought' && !line.short_marked_at && remaining > 0 && (
              <div
                style={{
                  marginTop: '14px',
                  padding: '14px',
                  borderRadius: '8px',
                  border: `1px solid ${theme.border}`,
                }}
              >
                <div
                  style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}
                >
                  <div style={{ flex: 1, minWidth: '200px' }}>
                    {sameVendorForAll ? (
                      <div>
                        <div
                          style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '4px' }}
                        >
                          {t('req.bought.vendor')}
                        </div>
                        <div
                          style={{ fontSize: '13px', color: theme.textPrimary, padding: '8px 0' }}
                        >
                          {vendorOptions.find((v) => v.value === globalVendorId)?.label ??
                            t('req.bought.selectAbove')}
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-end' }}>
                        <div style={{ flex: 1 }}>
                          <SearchableSelect
                            label={t('req.bought.vendor')}
                            value={selectedVendor[line.id] ?? ''}
                            onChange={(v) => {
                              setSelectedVendor((prev) => ({ ...prev, [line.id]: v }))
                            }}
                            options={vendorOptions}
                            placeholder={t('req.bought.searchVendor')}
                            minDropdownWidth={320}
                          />
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setQuickCreateLineId(line.id)
                            setQuickCreateOpen(true)
                          }}
                        >
                          {t('req.bought.new')}
                        </Button>
                      </div>
                    )}
                  </div>
                  <div style={{ width: '110px' }}>
                    <Input
                      label={t('req.bought.qty')}
                      type="number"
                      min="0"
                      max={remaining}
                      // Defaults to the full remaining qty — the buyer only
                      // needs to type when this purchase is a partial one.
                      value={purchaseQty[line.id] || (remaining > 0 ? String(remaining) : '')}
                      onChange={(e) => {
                        setPurchaseQty((prev) => ({ ...prev, [line.id]: e.target.value }))
                      }}
                    />
                  </div>
                  <div style={{ width: '130px' }}>
                    <Input
                      label={t('req.bought.actualPrice')}
                      type="number"
                      min="0"
                      // Defaults to the already-approved price — the buyer
                      // only needs to type when the real price differs.
                      value={
                        purchasePrice[line.id] || (line.approved_unit_price ?? line.unit_price)
                      }
                      onChange={(e) => {
                        setPurchasePrice((prev) => ({ ...prev, [line.id]: e.target.value }))
                      }}
                    />
                  </div>
                  <div style={{ width: '100px' }}>
                    <Select
                      label={t('req.bought.currency')}
                      value={purchaseCurrency[line.id] ?? line.currency_code}
                      onChange={(e) => {
                        setPurchaseCurrency((prev) => ({ ...prev, [line.id]: e.target.value }))
                      }}
                      options={CURRENCIES.map((c) => ({ value: c, label: c }))}
                    />
                  </div>
                </div>
                <div
                  style={{
                    display: 'flex',
                    gap: '10px',
                    alignItems: 'center',
                    marginTop: '10px',
                    flexWrap: 'wrap',
                  }}
                >
                  {sameReceiptForAll ? (
                    <span style={{ fontSize: '12px', color: theme.textMuted }}>
                      {globalReceiptFiles.length > 0
                        ? `📎 ${t('req.bought.filesSameForAll', { count: globalReceiptFiles.length })}`
                        : t('req.bought.attachTheSharedReceiptSAbove')}
                    </span>
                  ) : (
                    <>
                      <input
                        ref={(el) => {
                          fileInputRefs.current[line.id] = el
                        }}
                        type="file"
                        accept="image/*,application/pdf"
                        multiple
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          const files = Array.from(e.target.files ?? [])
                          setPendingFiles((prev) => ({
                            ...prev,
                            [line.id]: [...(prev[line.id] ?? []), ...files],
                          }))
                          e.target.value = ''
                        }}
                      />
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => fileInputRefs.current[line.id]?.click()}
                      >
                        {(() => {
                          const receipts = pendingFiles[line.id] ?? []
                          return receipts.length > 0
                            ? `📎 ${t('req.bought.filesAddMore', { count: receipts.length })}`
                            : t('req.bought.attachReceiptPhotoS')
                        })()}
                      </Button>
                      {(pendingFiles[line.id] ?? []).length > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setPendingFiles((prev) => ({ ...prev, [line.id]: [] }))
                          }}
                        >
                          {t('req.bought.clear')}
                        </Button>
                      )}
                    </>
                  )}
                  {!sameReceiptForAll && (
                    <Button
                      variant="primary"
                      size="sm"
                      loading={lRecording || uploadingLine === line.id}
                      onClick={() => void handleUploadAndRecord(line.id)}
                    >
                      {t('req.bought.recordPurchase')}
                    </Button>
                  )}
                  {line.product_id && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setResolveStockFor(line.id)
                        setResolveStockQty(String(remaining))
                      }}
                    >
                      {t('req.bought.resolveFromStock')}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShortReasonFor(line.id)
                    }}
                  >
                    {t('req.bought.markShort')}
                  </Button>
                </div>
              </div>
            )}

            {resolveStockFor === line.id && (
              <div
                style={{
                  marginTop: '10px',
                  padding: '12px',
                  borderRadius: '8px',
                  border: `1px solid ${theme.border}`,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <div style={{ fontSize: '12px', color: theme.textMuted }}>
                  {t('req.bought.stockArrivedAfterInventoryCheckMarked')}
                </div>
                <div
                  style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', flexWrap: 'wrap' }}
                >
                  <div style={{ width: '120px' }}>
                    <Input
                      label={t('req.bought.qtyFromStock')}
                      type="number"
                      min="0"
                      max={remaining}
                      value={resolveStockQty}
                      onChange={(e) => {
                        setResolveStockQty(e.target.value)
                      }}
                    />
                  </div>
                  <div style={{ flex: 1, minWidth: '220px' }}>
                    <SearchableSelect
                      label={t('req.bought.sourceLocation')}
                      value={resolveStockLocation}
                      onChange={setResolveStockLocation}
                      options={stockLocationOptions}
                      placeholder={t('req.bought.searchLocation')}
                      minDropdownWidth={320}
                    />
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    loading={lResolvingStock}
                    disabled={!resolveStockLocation || !(parseFloat(resolveStockQty) > 0)}
                    onClick={() =>
                      void resolveFromStock({
                        variables: {
                          lineId: line.id,
                          qty: parseFloat(resolveStockQty) || 0,
                          sourceLocationId: resolveStockLocation,
                        },
                      })
                    }
                  >
                    {t('req.bought.confirmResolveFromStock')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setResolveStockFor(null)
                    }}
                  >
                    {t('req.bought.cancel')}
                  </Button>
                </div>
              </div>
            )}

            {shortReasonFor === line.id && (
              <div
                style={{
                  marginTop: '10px',
                  display: 'flex',
                  gap: '8px',
                  alignItems: 'flex-end',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ flex: 1, minWidth: '200px' }}>
                  <Input
                    label={t('req.bought.reasonTheVendorCanTSupply')}
                    value={shortReasonText}
                    onChange={(e) => {
                      setShortReasonText(e.target.value)
                    }}
                  />
                </div>
                <Button
                  variant="danger"
                  size="sm"
                  loading={lMarkingShort}
                  disabled={!shortReasonText.trim()}
                  onClick={() =>
                    void markShort({ variables: { lineId: line.id, reason: shortReasonText } })
                  }
                >
                  {t('req.bought.confirmMarkShort')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShortReasonFor(null)
                  }}
                >
                  {t('req.bought.cancel')}
                </Button>
              </div>
            )}
          </Card>
        )
      })}

      {req.status === 'items_bought' && canBuy && (
        <Card style={{ padding: '20px', marginTop: '16px' }}>
          <div
            style={{
              fontSize: '14px',
              fontWeight: 600,
              color: theme.textPrimary,
              marginBottom: '8px',
            }}
          >
            {t('req.bought.finishBuying')}
          </div>
          {!canFinishBuying && (
            <ul
              style={{
                fontSize: '12px',
                color: theme.warning,
                margin: '0 0 12px',
                paddingInlineStart: '18px',
              }}
            >
              {unresolvedLines.length > 0 && (
                <li>
                  {t('req.bought.unresolvedLines', { count: unresolvedLines.length })}
                </li>
              )}
              {missingReceipt.length > 0 && (
                <li>{t('req.bought.missingReceipts', { count: missingReceipt.length })}</li>
              )}
              {unapprovedTolerance.length > 0 && (
                <li>
                  {t('req.bought.unapprovedTolerance', { count: unapprovedTolerance.length })}
                </li>
              )}
            </ul>
          )}
          <Button
            variant="primary"
            loading={lFinishing}
            disabled={!canFinishBuying}
            onClick={() => void finishBuying({ variables: { id: req.id } })}
          >
            {t('req.bought.finishBuying2')}
          </Button>
        </Card>
      )}

      <Modal
        open={quickCreateOpen}
        onClose={() => {
          setQuickCreateOpen(false)
          setQuickCreateName('')
        }}
        title={t('req.bought.newVendor')}
        size="sm"
        footer={
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setQuickCreateOpen(false)
              }}
            >
              {t('req.bought.cancel')}
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={creatingVendor}
              disabled={!quickCreateName.trim()}
              onClick={() => void handleQuickCreateVendor()}
            >
              {t('req.bought.create')}
            </Button>
          </div>
        }
      >
        <Input
          label={t('req.bought.vendorName')}
          value={quickCreateName}
          onChange={(e) => {
            setQuickCreateName(e.target.value)
          }}
          placeholder={t('req.bought.eGAlRasheedHardware')}
        />
      </Modal>

      <Modal
        open={!!receiptsModalFor}
        onClose={() => {
          setReceiptsModalFor(null)
        }}
        title={t('req.bought.receipts2')}
        size="md"
      >
        {receiptsModalFor && (
          <EntityAttachments
            entityType="po_line_purchase"
            entityId={receiptsModalFor}
            title={t('req.bought.receiptPhotos')}
            description={t('req.bought.attachOneOrMoreReceiptPhotos')}
            uploadButtonLabel={t('req.bought.addReceipt')}
            category="attachment"
          />
        )}
      </Modal>
    </div>
  )
}
