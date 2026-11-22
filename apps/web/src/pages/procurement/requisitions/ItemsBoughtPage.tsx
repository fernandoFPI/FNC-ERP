import { getRequisitionStatusLabel } from '../../../lib/requisition-constants'
import { useTranslation } from 'react-i18next'
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react'
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
import { lineHandlerName } from '../../../lib/lineHandler'
import { useTheme } from '../../../theme/ThemeContext'
import { usePermission } from '../../../hooks/usePermission'
import { usePagePadding } from '../../../hooks/usePagePadding'
import { useBreakpoint } from '../../../hooks/useBreakpoint'
import { useEntityChanged } from '../../../hooks/useEntityChanged'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { SearchableSelect } from '../../../components/ui/SearchableSelect'
import { ActionButton } from '../../../components/ui/ActionButton'
import { ChipButton } from '../../../components/ui/ChipButton'
import { ChoiceTile } from '../../../components/ui/ChoiceTile'
import { MoneyField } from '../../../components/ui/MoneyField'
import { QuantityStepper } from '../../../components/ui/QuantityStepper'
import { Modal } from '../../../components/ui/Modal'
import { StageActionBar } from '../../../components/procurement/StageActionBar'
import { ReceiptDropZone } from '../../../components/procurement/ReceiptDropZone'
import { ReceiptTileIcon, VendorTileIcon } from '../../../components/procurement/tileIcons'
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
  /** The owner took this line to buy himself (migration 315). */
  owner_handles?: boolean | null
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
  organizer_id?: string | null
  organizerName?: string | null
  procurementOfficerName?: string | null
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

// The columns of a line's row. The header row and every line use the same widths, so they line up like a table.
const LINE_COLUMNS = '36px minmax(220px, 2.2fr) repeat(4, minmax(84px, 1fr)) minmax(150px, 1.3fr)'
// Text only a screen reader gets: on a desktop the header row names the columns once.
const SR_ONLY = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
} as const

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
  const { isPhone } = useBreakpoint()
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

  // Phone: the lines are an accordion with one entry card open at a time (four lines used to make a 4,500px page).
  // null = automatic (the first line that still needs buying), '' = everything closed, an id = that line.
  const [openLineId, setOpenLineId] = useState<string | null>(null)
  // Phone: the "Apply to all items" card is one row until it is opened (or one of its choices is on).
  const [batchOpen, setBatchOpen] = useState(false)
  const needingBuyingKey = (req?.lines ?? [])
    .filter((l) => !l.short_marked_at && remainingToBuy(l) > 0)
    .map((l) => l.id)
    .join(',')
  const previouslyNeeding = useRef<Set<string>>(new Set())
  useEffect(() => {
    const now = new Set(needingBuyingKey ? needingBuyingKey.split(',') : [])
    // Taken before the ref is overwritten below: React runs the updater later, when the ref already holds `now`.
    const before = previouslyNeeding.current
    // The line being bought is done: hand over to the next one that still needs buying.
    setOpenLineId((current) =>
      current && before.has(current) && !now.has(current) ? null : current,
    )
    previouslyNeeding.current = now
  }, [needingBuyingKey])

  if (!id) return null
  if (loading && !req) {
    return (
      <div style={{ ...padding, maxWidth: '1800px', margin: '0 auto' }}>
        <div style={{ color: theme.textMuted, fontSize: '13px' }}>{t('req.bought.loading')}</div>
      </div>
    )
  }
  if (!req) {
    return (
      <div style={{ ...padding, maxWidth: '1800px', margin: '0 auto' }}>
        <div style={{ color: theme.textMuted, fontSize: '13px' }}>{t('req.bought.requisitionNotFound')}</div>
      </div>
    )
  }

  const canBuy = isSystemLevel || !!req.callerHasBuyerPosition
  // The owner may also buy the lines he took at Market pricing; procurement keeps every line (it can step in).
  const isOwner = !!currentUserId && req.organizer_id === currentUserId
  const canBuyLine = (l: ReqLine) => canBuy || (isOwner && !!l.owner_handles)
  const ownsAnyLine = isOwner && req.lines.some((l) => !!l.owner_handles)
  const canApproveTolerance = isSystemLevel || !!req.callerCanApprove
  // Phone accordion: which line's entry card is open.
  const firstNeedingId =
    req.lines.find((l) => !l.short_marked_at && remainingToBuy(l) > 0)?.id ?? null
  const openId = openLineId === null ? firstNeedingId : openLineId || null

  // One cell of a line's row. A screen reader always gets the label; a phone shows it above the value; a desktop
  // shows it once, in the header row above the lines.
  const lineCell = (label: string, content: ReactNode) => (
    <div style={{ minWidth: 0, fontSize: '13px', color: theme.textPrimary }}>
      <span
        style={
          isPhone
            ? {
                display: 'block',
                fontSize: '12px',
                fontWeight: 500,
                color: theme.textSecondary,
                marginBottom: '2px',
              }
            : SR_ONLY
        }
      >
        {label}
      </span>
      {content}
    </div>
  )

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
    unresolvedLines.length === 0 &&
    missingReceipt.length === 0 &&
    unapprovedTolerance.length === 0

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
    const pending = req.lines.filter(
      (l) => canBuyLine(l) && !l.short_marked_at && remainingToBuy(l) > 0,
    )
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

  // Vendors already used on this requisition, most recent first, for the one-tap picks on a line's entry card.
  // The cash vendor and any vendor that is not in the list are not offered here (Cash has its own chip).
  const recentVendors = (() => {
    const seen = new Set<string>()
    const out: { value: string; label: string }[] = []
    const bought = req.lines
      .flatMap((l) => l.purchases)
      .sort((a, b) => b.bought_at.localeCompare(a.bought_at))
    for (const p of bought) {
      if (seen.has(p.vendor_id)) continue
      const vendor = vendors.find((v) => v.id === p.vendor_id)
      if (!vendor) continue
      seen.add(p.vendor_id)
      out.push({ value: vendor.id, label: vendor.name })
      if (out.length === 3) break
    }
    return out
  })()

  // The one-tap vendor choices: Cash, the vendors already used on this requisition, and "+ New vendor". A line's card
  // and the "apply to all items" card both use it, so a vendor is picked the same way in both.
  function renderVendorChips(
    selected: string,
    onPick: (vendorValue: string) => void,
    onNewVendor: () => void,
  ) {
    return (
      <div
        role="group"
        aria-label={t('req.bought.quickPick')}
        style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}
      >
        <ChipButton
          selected={selected === CASH_VENDOR_VALUE}
          onClick={() => {
            onPick(CASH_VENDOR_VALUE)
          }}
        >
          {t('req.bought.cashChip')}
        </ChipButton>
        {recentVendors.map((v) => (
          <ChipButton
            key={v.value}
            selected={selected === v.value}
            onClick={() => {
              onPick(v.value)
            }}
          >
            {v.label}
          </ChipButton>
        ))}
        <ChipButton dashed onClick={onNewVendor}>
          {t('req.bought.newVendorChip')}
        </ChipButton>
      </div>
    )
  }

  // The card a buyer fills in to record one purchase on a line: vendor (search or a quick pick), quantity, price
  // with its currency, the receipt, and the three ways to finish the line (record, resolve from stock, mark short).
  // The logic it calls (handleUploadAndRecord and the setters) is the page's own and unchanged.
  function renderEntryCard(line: ReqLine, remaining: number) {
    const qtyValue = purchaseQty[line.id] || (remaining > 0 ? String(remaining) : '')
    const priceValue = purchasePrice[line.id] || (line.approved_unit_price ?? line.unit_price)
    // Typed as possibly missing: nothing is chosen until the buyer picks one, and then the line's own currency applies
    // (the same order handleUploadAndRecord uses when it records).
    const chosenCurrency = purchaseCurrency[line.id] as string | undefined
    const currencyValue = chosenCurrency ?? line.currency_code ?? 'IQD'
    const currencyChoices = CURRENCIES.includes(currencyValue)
      ? CURRENCIES
      : [currencyValue, ...CURRENCIES]
    const qtyNumber = parseFloat(qtyValue)
    const priceNumber = parseFloat(priceValue)
    // Only a preview for the buyer; the server stores qty and price, never this product.
    const previewTotal = qtyNumber * priceNumber
    const files = pendingFiles[line.id] ?? []
    const vendorValue = selectedVendor[line.id] ?? ''
    const approvedPrice =
      `${fmtN(line.approved_unit_price ?? line.unit_price)} ${line.currency_code ?? ''}`.trim()
    const fieldLabel = {
      fontSize: '12px',
      fontWeight: 600,
      color: theme.textSecondary,
      marginBottom: '4px',
    } as const

    return (
      <div
        data-entry-card={line.id}
        style={{
          marginTop: '14px',
          padding: isPhone ? '14px' : '16px 18px',
          borderRadius: '12px',
          border: `1px solid ${theme.border}`,
          background: theme.bgSurface,
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
        }}
      >
        <div>
          <div style={{ fontSize: '14px', fontWeight: 700, color: theme.textPrimary }}>
            {t('req.bought.recordAPurchase')}
          </div>
          <div style={{ fontSize: '13px', color: theme.textSecondary, marginTop: '2px' }}>
            {t('req.bought.recordCaption', {
              qty: fmtN(remaining),
              uom: line.uom ?? '',
              price: approvedPrice,
            })}
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isPhone ? '1fr' : 'minmax(0, 1.25fr) minmax(0, 1fr)',
            gap: '16px 28px',
            alignItems: 'start',
          }}
        >
          <div style={{ minWidth: 0 }}>
            {sameVendorForAll ? (
              <div>
                <div style={fieldLabel}>{t('req.bought.vendor')}</div>
                <div style={{ fontSize: '13px', color: theme.textPrimary, padding: '8px 0' }}>
                  {vendorOptions.find((v) => v.value === globalVendorId)?.label ??
                    t('req.bought.selectAbove')}
                </div>
              </div>
            ) : (
              <>
                <SearchableSelect
                  field
                  label={t('req.bought.vendor')}
                  value={vendorValue}
                  onChange={(v) => {
                    setSelectedVendor((prev) => ({ ...prev, [line.id]: v }))
                  }}
                  options={vendorOptions}
                  placeholder={t('req.bought.searchVendor')}
                  minDropdownWidth={320}
                />
                {renderVendorChips(
                  vendorValue,
                  (picked) => {
                    setSelectedVendor((prev) => ({ ...prev, [line.id]: picked }))
                  },
                  () => {
                    setQuickCreateLineId(line.id)
                    setQuickCreateOpen(true)
                  },
                )}
              </>
            )}
          </div>

          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div>
                <div style={fieldLabel}>{t('req.bought.qty')}</div>
                <QuantityStepper
                  // Defaults to the full remaining qty: the buyer only needs to type when this purchase is a partial one.
                  value={qtyValue}
                  onChange={(v) => {
                    setPurchaseQty((prev) => ({ ...prev, [line.id]: v }))
                  }}
                  ariaLabel={t('req.bought.qty')}
                  decreaseLabel={t('req.bought.decreaseQty')}
                  increaseLabel={t('req.bought.increaseQty')}
                  max={remaining}
                />
              </div>
              <div style={{ flex: 1, minWidth: '190px' }}>
                <div style={fieldLabel}>{t('req.bought.actualPrice')}</div>
                <MoneyField
                  // Defaults to the already-approved price: the buyer only needs to type when the real price differs.
                  value={priceValue}
                  onChange={(v) => {
                    setPurchasePrice((prev) => ({ ...prev, [line.id]: v }))
                  }}
                  ariaLabel={t('req.bought.actualPrice')}
                  currency={currencyValue}
                  onCurrencyChange={(c) => {
                    setPurchaseCurrency((prev) => ({ ...prev, [line.id]: c }))
                  }}
                  currencies={currencyChoices}
                  currencyAriaLabel={t('req.bought.currency')}
                  invalid={priceValue !== '' && !(priceNumber > 0)}
                />
              </div>
            </div>
            {previewTotal > 0 && (
              <div style={{ fontSize: '13px', color: theme.textSecondary, marginTop: '8px' }}>
                {t('req.bought.lineTotal')}{' '}
                <strong
                  style={{
                    color: theme.textPrimary,
                    fontWeight: 600,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {fmtN(previewTotal)} {currencyValue}
                </strong>
              </div>
            )}
          </div>
        </div>

        {sameReceiptForAll ? (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: '10px',
              border: `1px dashed ${theme.borderField}`,
              background: theme.bgSurfaceHover,
              fontSize: '13px',
              color: theme.textSecondary,
            }}
          >
            {globalReceiptFiles.length > 0
              ? `📎 ${t('req.bought.filesSameForAll', { count: globalReceiptFiles.length })}`
              : t('req.bought.attachTheSharedReceiptSAbove')}
          </div>
        ) : (
          <ReceiptDropZone
            files={files}
            onAdd={(added) => {
              setPendingFiles((prev) => ({
                ...prev,
                [line.id]: [...(prev[line.id] ?? []), ...added],
              }))
            }}
            onRemove={(position) => {
              setPendingFiles((prev) => ({
                ...prev,
                [line.id]: (prev[line.id] ?? []).filter((_, i) => i !== position),
              }))
            }}
            onClear={() => {
              setPendingFiles((prev) => ({ ...prev, [line.id]: [] }))
            }}
            browseLabel={t('req.bought.attachReceiptPhotoS')}
            addMoreLabel={`📎 ${t('req.bought.filesAddMore', { count: files.length })}`}
            hint={t('req.bought.dropReceiptHint')}
            clearLabel={t('req.bought.clear')}
            removeLabel={(name) => t('req.bought.removeFile', { name })}
          />
        )}

        <div
          style={{
            display: 'flex',
            gap: '10px',
            alignItems: 'center',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            paddingTop: '14px',
            borderTop: `1px solid ${theme.border}`,
          }}
        >
          {/* On a phone the main action comes first and Mark short drops below it. */}
          <div style={{ order: isPhone ? 2 : 0, alignSelf: isPhone ? 'center' : undefined }}>
            <ActionButton
              variant="ghost"
              onClick={() => {
                setShortReasonFor(line.id)
              }}
            >
              {t('req.bought.markShort')}
            </ActionButton>
          </div>
          <div
            style={{
              display: 'flex',
              gap: '10px',
              flexWrap: 'wrap',
              flex: isPhone ? '1 1 100%' : undefined,
              flexDirection: isPhone ? 'column-reverse' : 'row',
            }}
          >
            {line.product_id && (
              <ActionButton
                variant="outline"
                fullWidth={isPhone}
                onClick={() => {
                  setResolveStockFor(line.id)
                  setResolveStockQty(String(remaining))
                }}
              >
                {t('req.bought.resolveFromStock')}
              </ActionButton>
            )}
            {!sameReceiptForAll && (
              <ActionButton
                variant="solid"
                size="lg"
                fullWidth={isPhone}
                loading={lRecording || uploadingLine === line.id}
                onClick={() => void handleUploadAndRecord(line.id)}
              >
                {t('req.bought.recordPurchase')}
              </ActionButton>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ ...padding, maxWidth: '1800px', margin: '0 auto' }}>
      <PageHeader
        title={t('req.bought.pageTitle', { number: req.requisition_number })}
        subtitle={t('req.bought.recordEachPurchasePerVendorWith')}
        backPath={`/procurement/requisitions/${id}`}
        backLabel={t('req.bought.requisitionBack')}
        compact
        status={
          <Badge variant={req.status === 'items_bought' ? 'accent' : 'neutral'}>
            {getRequisitionStatusLabel(req.status)}
          </Badge>
        }
      />

      {!canBuy && !ownsAnyLine && (
        <Card
          style={{
            padding: '14px 20px',
            marginTop: '16px',
            borderInlineStart: `3px solid ${theme.warning}`,
          }}
        >
          <div style={{ fontSize: '13px', color: theme.textSecondary }}>
            {t('req.bought.onlyABuyerPositionHolderFor')}
          </div>
        </Card>
      )}

      {!canBuy && ownsAnyLine && (
        <Card
          style={{
            padding: '14px 20px',
            marginTop: '16px',
            borderInlineStart: `3px solid ${theme.info}`,
          }}
        >
          <div style={{ fontSize: '13px', color: theme.textSecondary }}>
            {t('req.bought.ownerBuysOwnItems')}
          </div>
        </Card>
      )}

      {req.status !== 'items_bought' && (
        <Card
          style={{ padding: '14px 20px', marginTop: '16px', borderInlineStart: `3px solid ${theme.info}` }}
        >
          <div style={{ fontSize: '13px', color: theme.textSecondary }}>
            {t('req.bought.thisRequisitionIsNoLongerAt')}
          </div>
        </Card>
      )}

      {req.status === 'items_bought' && req.lines.filter(canBuyLine).length > 1 && (
        <Card
          style={{
            padding: isPhone ? '4px 16px' : '16px 20px',
            marginTop: '16px',
            display: 'grid',
            gap: isPhone ? '4px' : '16px',
          }}
        >
          {isPhone ? (
            // One row until opened: the choices are shortcuts, not the work (which is the line below).
            <button
              type="button"
              aria-expanded={batchOpen || sameVendorForAll || sameReceiptForAll}
              onClick={() => {
                setBatchOpen((open) => !open)
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
                minHeight: '48px',
                padding: 0,
                background: 'transparent',
                border: 'none',
                textAlign: 'start',
                fontFamily: 'inherit',
                cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <span style={{ minWidth: 0 }}>
                <span
                  style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: 700,
                    color: theme.textPrimary,
                  }}
                >
                  {t('req.bought.applyToAllTitle')}
                </span>
                {(batchOpen || sameVendorForAll || sameReceiptForAll) && (
                  <span
                    style={{
                      display: 'block',
                      fontSize: '13px',
                      color: theme.textSecondary,
                      marginTop: '2px',
                    }}
                  >
                    {t('req.bought.applyToAllHint')}
                  </span>
                )}
              </span>
              <span aria-hidden="true" style={{ color: theme.textSecondary, flexShrink: 0 }}>
                {batchOpen || sameVendorForAll || sameReceiptForAll ? '▴' : '▾'}
              </span>
            </button>
          ) : (
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: theme.textPrimary }}>
                {t('req.bought.applyToAllTitle')}
              </div>
              <div style={{ fontSize: '13px', color: theme.textSecondary, marginTop: '2px' }}>
                {t('req.bought.applyToAllHint')}
              </div>
            </div>
          )}
          <div
            style={{
              // Kept mounted while closed so a choice made earlier (a vendor, a receipt) is never lost.
              display:
                isPhone && !(batchOpen || sameVendorForAll || sameReceiptForAll) ? 'none' : 'grid',
              gridTemplateColumns: isPhone ? '1fr' : 'repeat(2, minmax(0, 1fr))',
              gap: '14px',
              alignItems: 'start',
              paddingBottom: isPhone ? '12px' : 0,
            }}
          >
            <ChoiceTile
              icon={<VendorTileIcon />}
              title={t('req.bought.allItemsAreFromTheSame')}
              description={t('req.bought.sameVendorTileHint')}
              checked={sameVendorForAll}
              onChange={toggleSameVendorForAll}
            >
              <div style={{ maxWidth: '460px' }}>
                <SearchableSelect
                  field
                  label={t('req.bought.vendorForAllItems')}
                  value={globalVendorId}
                  onChange={(v) => {
                    applyVendorToAllLines(v)
                  }}
                  options={vendorOptions}
                  placeholder={t('req.bought.searchVendor')}
                  minDropdownWidth={320}
                />
                {renderVendorChips(globalVendorId, applyVendorToAllLines, () => {
                  setQuickCreateLineId(ALL_LINES_SENTINEL)
                  setQuickCreateOpen(true)
                })}
              </div>
            </ChoiceTile>
            <ChoiceTile
              icon={<ReceiptTileIcon />}
              title={t('req.bought.attachOneReceiptForAllItems')}
              description={t('req.bought.sameReceiptTileHint')}
              checked={sameReceiptForAll}
              onChange={setSameReceiptForAll}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {/* Changing the shared files means they must be uploaded afresh for the next line recorded. */}
                <ReceiptDropZone
                  files={globalReceiptFiles}
                  onAdd={(added) => {
                    setGlobalReceiptFiles((prev) => [...prev, ...added])
                    setGlobalReceiptFileIds(null)
                    globalReceiptFileIdsRef.current = null
                  }}
                  onRemove={(position) => {
                    setGlobalReceiptFiles((prev) => prev.filter((_, i) => i !== position))
                    setGlobalReceiptFileIds(null)
                    globalReceiptFileIdsRef.current = null
                  }}
                  onClear={() => {
                    setGlobalReceiptFiles([])
                    setGlobalReceiptFileIds(null)
                    globalReceiptFileIdsRef.current = null
                  }}
                  browseLabel={t('req.bought.attachReceiptPhotoS')}
                  addMoreLabel={`📎 ${t('req.bought.filesAttachedAddMore', { count: globalReceiptFiles.length })}`}
                  hint={t('req.bought.dropReceiptHint')}
                  clearLabel={t('req.bought.clear')}
                  removeLabel={(name) => t('req.bought.removeFile', { name })}
                />
                <div style={{ display: 'flex', justifyContent: isPhone ? 'stretch' : 'flex-end' }}>
                  <ActionButton
                    variant="solid"
                    size="lg"
                    fullWidth={isPhone}
                    loading={recordingAll}
                    onClick={() => void handleRecordAll()}
                  >
                    {t('req.bought.recordAllPurchases')}
                  </ActionButton>
                </div>
              </div>
            </ChoiceTile>
          </div>
        </Card>
      )}

      {/* The lines read as one list: a header row, then a row per line (joined borders, like a table). */}
      {!isPhone && req.lines.length > 0 && (
        <div
          aria-hidden="true"
          style={{
            display: 'grid',
            gridTemplateColumns: LINE_COLUMNS,
            gap: '8px 16px',
            marginTop: '16px',
            padding: '10px 20px',
            background: theme.bgSurface,
            border: `1px solid ${theme.border}`,
            borderRadius: '12px 12px 0 0',
            fontSize: '11px',
            fontWeight: 600,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            color: theme.textSecondary,
          }}
        >
          <div>#</div>
          <div>{t('req.bought.colItem')}</div>
          <div>{t('req.bought.colOrdered')}</div>
          <div>{t('req.bought.colFromStock')}</div>
          <div>{t('req.bought.colLeftToBuy')}</div>
          <div>{t('req.bought.colApprovedPrice')}</div>
          <div>{t('req.bought.colStatus')}</div>
        </div>
      )}
      {req.lines.map((line, index) => {
        const resolved = lineIsResolved(line)
        const remaining = remainingToBuy(line)
        const handlerName = lineHandlerName(line, req)
        // A line that still has something to buy is the active one: it carries the entry strip below.
        const needsBuying = !line.short_marked_at && remaining > 0
        // Phone accordion: only the open line shows its purchases and its entry card.
        const collapsedOnPhone = isPhone && openId !== line.id
        const lineFromStock = parseFloat(line.qty_from_stock ?? '0') || 0
        const statusBadge = line.short_marked_at ? (
          <Badge variant="neutral">
            {t('req.bought.markedShort', { reason: line.short_reason })}
          </Badge>
        ) : resolved ? (
          <Badge variant="success">{t('req.bought.fullyBought')}</Badge>
        ) : (
          <Badge variant="warning">{t('req.bought.notBoughtYet')}</Badge>
        )
        const toggleOpen = () => {
          setOpenLineId(openId === line.id ? '' : line.id)
        }
        return (
          <div
            key={line.id}
            data-line-id={line.id}
            data-needs-buying={needsBuying ? 'true' : undefined}
            style={{
              padding: '16px 20px',
              background: needsBuying ? theme.accentBg : theme.bgSurface,
              border: `1px solid ${theme.border}`,
              // a clear line between two rows; a phone's rows are cards of their own
              borderTop: isPhone
                ? `1px solid ${theme.border}`
                : index === 0
                  ? 'none'
                  : `2px solid ${theme.borderStrong}`,
              borderInlineStart: needsBuying
                ? `4px solid ${theme.accent}`
                : `1px solid ${theme.border}`,
              // on a phone every line is a card of its own; on a desktop the last row closes the list
              borderRadius: isPhone ? '12px' : index === req.lines.length - 1 ? '0 0 12px 12px' : 0,
              marginTop: isPhone ? '12px' : 0,
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: isPhone ? 'repeat(2, minmax(0, 1fr))' : LINE_COLUMNS,
                gap: '8px 16px',
                alignItems: 'start',
              }}
            >
              {/* The line's number: its own column on a desktop, in front of the name on a phone. */}
              {!isPhone && (
                <div
                  data-line-number={index + 1}
                  style={{
                    fontSize: '13px',
                    fontWeight: 600,
                    color: theme.textSecondary,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {index + 1}
                </div>
              )}
              <div
                style={{
                  gridColumn: isPhone ? '1 / -1' : undefined,
                  minWidth: 0,
                  ...(isPhone
                    ? { position: 'relative', paddingInlineEnd: '28px', cursor: 'pointer' }
                    : {}),
                }}
                // Phone: tapping the name opens or closes the line (one open at a time).
                {...(isPhone
                  ? {
                      role: 'button',
                      tabIndex: 0,
                      'aria-expanded': !collapsedOnPhone,
                      onClick: toggleOpen,
                      onKeyDown: (e: ReactKeyboardEvent) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          toggleOpen()
                        }
                      },
                    }
                  : {})}
              >
                {isPhone && (
                  <span
                    aria-hidden="true"
                    style={{
                      position: 'absolute',
                      insetInlineEnd: 0,
                      top: 0,
                      fontSize: '16px',
                      color: theme.textSecondary,
                    }}
                  >
                    {collapsedOnPhone ? '▾' : '▴'}
                  </span>
                )}
                <div style={{ fontSize: '14px', fontWeight: 600, color: theme.textPrimary }}>
                  {isPhone && (
                    <span data-line-number={index + 1} style={{ color: theme.textSecondary }}>
                      {index + 1}.{' '}
                    </span>
                  )}
                  {line.description || line.product_name || '—'}
                  {/* Every line that needs buying says who buys it; one fully covered from stock has nobody. */}
                  {(parseFloat(line.qty) || 0) - (parseFloat(line.qty_from_stock ?? '0') || 0) >
                    0.0001 && (
                    <>
                      {' '}
                      {line.owner_handles ? (
                        <Badge variant="accent">{t('req.bought.ownerItem')}</Badge>
                      ) : (
                        <Badge variant="neutral">{t('req.bought.procurementItem')}</Badge>
                      )}
                      {handlerName && (
                        <span
                          style={{
                            marginInlineStart: '6px',
                            fontSize: '12px',
                            fontWeight: 400,
                            color: theme.textSecondary,
                          }}
                        >
                          {handlerName}
                        </span>
                      )}
                    </>
                  )}
                </div>
                {/* The block keeps the page's own direction, so the Arabic name starts right under the English one
                    (a block that is itself right-to-left puts "start" on the right edge, under the handler's name).
                    Only the text is right-to-left. */}
                {line.product_name_ar && (
                  <div data-arabic-name style={{ textAlign: 'start', marginTop: '3px' }}>
                    <span
                      dir="rtl"
                      style={{ fontSize: '14px', lineHeight: 1.5, color: theme.textSecondary }}
                    >
                      {line.product_name_ar}
                    </span>
                  </div>
                )}
                {(line.account_name || line.cost_center_name) && (
                  <div style={{ fontSize: '12px', color: theme.textSecondary, marginTop: '2px' }}>
                    {line.account_name ? t('req.bought.accountLabel', { name: line.account_name }) : ''}
                    {line.account_name && line.cost_center_name ? ' · ' : ''}
                    {line.cost_center_name ? t('req.bought.costCenterLabel', { name: line.cost_center_name }) : ''}
                  </div>
                )}
              </div>
              {isPhone ? (
                // Phone: one wrapped line of the facts that matter instead of five stacked label/value cells.
                <div
                  style={{
                    gridColumn: '1 / -1',
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: '4px 12px',
                    fontSize: '13px',
                    color: theme.textSecondary,
                  }}
                >
                  <span>
                    {t('req.bought.colOrdered')}{' '}
                    <strong style={{ color: theme.textPrimary }}>
                      {fmtN(line.qty)} {line.uom ?? ''}
                    </strong>
                  </span>
                  {lineFromStock > 0 && (
                    <span>
                      {t('req.bought.colFromStock')}{' '}
                      <strong style={{ color: theme.textPrimary }}>{fmtN(lineFromStock)}</strong>
                    </span>
                  )}
                  <span>
                    {t('req.bought.colLeftToBuy')}{' '}
                    <strong style={{ color: remaining > 0 ? theme.textPrimary : theme.success }}>
                      {fmtN(remaining)}
                    </strong>
                  </span>
                  {line.approved_unit_price && (
                    <span>
                      {t('req.bought.colApprovedPrice')}{' '}
                      <strong style={{ color: theme.textPrimary }}>
                        {fmtN(line.approved_unit_price)} {line.currency_code ?? ''}
                      </strong>
                    </span>
                  )}
                  <span>{statusBadge}</span>
                </div>
              ) : (
                <>
                  {lineCell(t('req.bought.colOrdered'), `${fmtN(line.qty)} ${line.uom ?? ''}`)}
                  {lineCell(t('req.bought.colFromStock'), fmtN(line.qty_from_stock ?? 0))}
                  {lineCell(
                    t('req.bought.colLeftToBuy'),
                    <strong style={{ color: remaining > 0 ? theme.textPrimary : theme.success }}>
                      {fmtN(remaining)}
                    </strong>,
                  )}
                  {lineCell(
                    t('req.bought.colApprovedPrice'),
                    line.approved_unit_price
                      ? `${fmtN(line.approved_unit_price)} ${line.currency_code ?? ''}`
                      : '—',
                  )}
                  {lineCell(t('req.bought.colStatus'), statusBadge)}
                </>
              )}
            </div>

            {/* ── Existing purchases for this line ── */}
            {!collapsedOnPhone && line.purchases.length > 0 && (
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
                      <span style={{ color: theme.textSecondary }}>{p.bought_by_name ?? ''}</span>
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
                          <Input field
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
            {!collapsedOnPhone &&
              canBuyLine(line) &&
              req.status === 'items_bought' &&
              !line.short_marked_at &&
              remaining > 0 &&
              renderEntryCard(line, remaining)}

            {!collapsedOnPhone && resolveStockFor === line.id && (
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
                    <Input field
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
                    <SearchableSelect field
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

            {!collapsedOnPhone && shortReasonFor === line.id && (
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
                  <Input field
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
          </div>
        )
      })}

      {req.status === 'items_bought' && canBuy && (
        <StageActionBar
          title={t('req.bought.finishBuying')}
          hint={t('req.bought.finishesByItself')}
          status={
            canFinishBuying ? undefined : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {unresolvedLines.length > 0 && (
                  <Badge variant="warning">
                    {t('req.bought.unresolvedLines', { count: unresolvedLines.length })}
                  </Badge>
                )}
                {missingReceipt.length > 0 && (
                  <Badge variant="warning">
                    {t('req.bought.missingReceipts', { count: missingReceipt.length })}
                  </Badge>
                )}
                {unapprovedTolerance.length > 0 && (
                  <Badge variant="warning">
                    {t('req.bought.unapprovedTolerance', { count: unapprovedTolerance.length })}
                  </Badge>
                )}
              </div>
            )
          }
        >
          <Button
            variant="primary"
            loading={lFinishing}
            disabled={!canFinishBuying}
            onClick={() => void finishBuying({ variables: { id: req.id } })}
          >
            {t('req.bought.finishBuying2')}
          </Button>
        </StageActionBar>
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
        <Input field
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
