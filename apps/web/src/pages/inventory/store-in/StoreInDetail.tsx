import { useTranslation } from 'react-i18next'
import { enumLabel } from '../../../i18n'
import { useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useLazyQuery } from '@apollo/client'
import {
  PO_RECEIPT_QUERY,
  CONFIRM_RECEIPT,
  CANCEL_RECEIPT,
  REVERSE_RECEIPT,
  ATTACH_RECEIPT_PHOTO,
} from '../../../graphql/procurement'
import { DETACH_FILE, FILE_DOWNLOAD_URL_QUERY, ENTITY_ATTACHMENTS_QUERY } from '../../../graphql/hr'
import { hasBuyerReceipt as hasBuyerReceiptIn } from '../../../lib/buyerReceipt'
import {
  AdminPhotoBypass,
  photoBypassReady,
  useIsSystemAdmin,
} from '../../../components/procurement/AdminPhotoBypass'
import { api } from '../../../lib/axios'
import { apiErrMsg } from '../../../lib/apiError'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Table } from '../../../components/ui/Table'
import type { Column } from '../../../components/ui/Table'
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog'
import { EntityAttachments } from '../../../components/inventory/EntityAttachments'
import { buildStoreInHTML } from '../../../lib/storeInHtml'
import { useTheme } from '../../../theme/ThemeContext'
import { usePagePadding } from '../../../hooks/usePagePadding'
import { useCompany } from '../../../hooks/useCompany'
import { usePermission } from '../../../hooks/usePermission'
import { useToastStore } from '../../../store/toastStore'
import type {
  AttachReceiptPhotoMutation,
  AttachReceiptPhotoMutationVariables,
  CancelReceiptMutation,
  CancelReceiptMutationVariables,
  ConfirmReceiptMutation,
  ConfirmReceiptMutationVariables,
  ReverseReceiptMutation,
  ReverseReceiptMutationVariables,
  DetachFileMutation,
  DetachFileMutationVariables,
  EntityAttachmentsQuery,
  EntityAttachmentsQueryVariables,
  FileDownloadUrlQuery,
  FileDownloadUrlQueryVariables,
  PoReceiptQuery,
  PoReceiptQueryVariables,
} from '../../../graphql/generated'

type PhotoKind = 'vendor_receipt' | 'materials'
const PHOTO_CATEGORY: Record<PhotoKind, string> = {
  vendor_receipt: 'po_receipt_document',
  materials: 'po_receipt_photo',
}

interface ReceiptLine {
  po_line_id: string
  description: string | null
  product_name: string | null
  product_name_ar: string | null
  sku: string | null
  uom: string | null
  unit_price: string | null
  currency_code: string | null
  fx_rate_to_base: string | null
  qty_received: string
}

// The PO line's own description is what the buyer typed and what the PO page
// shows; an approved edit request can change it without changing the linked
// catalog product (product_id is deliberately not editable that way). Showing
// the catalog name first made Store In disagree with the PO.
const normName = (v: string | null | undefined) => (v ?? '').trim().toLowerCase()
function lineDisplayName(l: { description: string | null; product_name: string | null }) {
  return l.description?.trim() ? l.description : l.product_name
}
function catalogNameDiffers(l: { description: string | null; product_name: string | null }) {
  return (
    !!l.product_name &&
    !!l.description?.trim() &&
    normName(l.description) !== normName(l.product_name)
  )
}

interface ReceiptPhoto {
  id: string
  fileId: string
  label: string | null
  category: string
  originalFilename: string
  downloadUrl: string | null
  createdAt: string
}

interface Receipt {
  id: string
  po_id: string | null
  po_number: string | null
  vendor_name: string | null
  received_from_name: string | null
  base_currency_code: string | null
  receipt_number: string | null
  receipt_date: string | null
  location_name: string | null
  notes: string | null
  received_by_email: string | null
  received_by_name: string | null
  location_notes: string | null
  created_at: string | null
  status: string
  confirmed_at: string | null
  reversed_at: string | null
  reversal_reason: string | null
  reversed_by_email: string | null
  lines: ReceiptLine[]
  photos: ReceiptPhoto[]
}

const STATUS_VARIANT: Record<string, 'neutral' | 'warning' | 'success' | 'danger'> = {
  draft: 'warning',
  confirmed: 'success',
  cancelled: 'danger',
  reversed: 'danger',
}

const fmtAmt = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function StoreInDetail() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { theme } = useTheme()
  const pagePadding = usePagePadding()
  const { activeCompany } = useCompany()
  const { can } = usePermission()
  const canReverse = can('procurement.po.reverse_receipt', 'edit')
  const addToast = useToastStore((s) => s.addToast)
  const [showPrintModal, setShowPrintModal] = useState(false)
  const printIframeRef = useRef<HTMLIFrameElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const captureKindRef = useRef<PhotoKind>('materials')
  const [uploadingKind, setUploadingKind] = useState<PhotoKind | null>(null)
  const [reverseOpen, setReverseOpen] = useState(false)
  const [reverseReason, setReverseReason] = useState('')
  const [dragOverKind, setDragOverKind] = useState<PhotoKind | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  // System-admin-only override of the photo requirement; the server enforces the role.
  const isSystemAdmin = useIsSystemAdmin()
  const [bypassPhotos, setBypassPhotos] = useState(false)
  const [bypassReason, setBypassReason] = useState('')
  const [cancelOpen, setCancelOpen] = useState(false)

  const { data, loading, error, refetch } = useQuery<PoReceiptQuery, PoReceiptQueryVariables>(
    PO_RECEIPT_QUERY,
    {
      variables: { id: id ?? '' },
      skip: !id,
      fetchPolicy: 'cache-and-network',
    },
  )
  const receipt: Receipt | undefined = data?.poReceipt ?? undefined

  // The vendor receipt is normally uploaded earlier by the buyer, straight
  // onto the PO — this just checks whether one's there so Confirm doesn't
  // also demand a redundant copy attached to this specific receipt.
  const { data: buyerReceiptData } = useQuery<
    EntityAttachmentsQuery,
    EntityAttachmentsQueryVariables
  >(ENTITY_ATTACHMENTS_QUERY, {
    variables: { entityType: 'purchase_order', entityId: receipt?.po_id ?? '' },
    skip: !receipt?.po_id,
    fetchPolicy: 'cache-and-network',
  })
  // The acceptance rule (mirrors confirmReceipt's own) lives in lib/buyerReceipt.ts,
  // shared with the jobsite delivery form so the two can't drift apart.
  const hasBuyerReceipt = hasBuyerReceiptIn(buyerReceiptData?.entityAttachments)

  const [attachReceiptPhoto] = useMutation<
    AttachReceiptPhotoMutation,
    AttachReceiptPhotoMutationVariables
  >(ATTACH_RECEIPT_PHOTO)
  const [detachFile, { loading: detaching }] = useMutation<
    DetachFileMutation,
    DetachFileMutationVariables
  >(DETACH_FILE)
  const [getDownloadUrl] = useLazyQuery<FileDownloadUrlQuery, FileDownloadUrlQueryVariables>(
    FILE_DOWNLOAD_URL_QUERY,
  )
  const [confirmReceipt, { loading: confirming }] = useMutation<
    ConfirmReceiptMutation,
    ConfirmReceiptMutationVariables
  >(CONFIRM_RECEIPT, {
    onCompleted: () => {
      addToast({ type: 'success', message: t('inv.storeInDetail.receiptConfirmedInventoryUpdated') })
      setConfirmOpen(false)
      void refetch()
    },
    onError: (e) => {
      addToast({ type: 'error', message: e.message })
      setConfirmOpen(false)
    },
  })
  const [cancelReceipt, { loading: cancelling }] = useMutation<
    CancelReceiptMutation,
    CancelReceiptMutationVariables
  >(CANCEL_RECEIPT, {
    onCompleted: () => {
      addToast({ type: 'success', message: t('inv.storeInDetail.draftReceiptCancelled') })
      setCancelOpen(false)
      navigate('/inventory/store-in')
    },
    onError: (e) => {
      addToast({ type: 'error', message: e.message })
      setCancelOpen(false)
    },
  })
  const [reverseReceipt, { loading: reversing }] = useMutation<
    ReverseReceiptMutation,
    ReverseReceiptMutationVariables
  >(REVERSE_RECEIPT, {
    onCompleted: () => {
      addToast({ type: 'success', message: t('inv.storeInDetail.receiptReversedStockAndPoQuantities') })
      setReverseOpen(false)
      setReverseReason('')
      void refetch()
    },
    onError: (e) => {
      addToast({ type: 'error', message: e.message })
    },
  })

  if (loading && !receipt)
    return <div style={{ padding: '48px', color: theme.textMuted }}>{t('inv.storeInDetail.loading')}</div>
  if (error)
    return (
      <div style={{ padding: '48px', color: '#991b1b' }}>
        {t('inv.storeInDetail.couldntLoad', { message: error.message })}
      </div>
    )
  if (!receipt)
    return <div style={{ padding: '48px', color: theme.textMuted }}>{t('inv.storeInDetail.storeInRecordNotFound')}</div>
  // Nested function declarations below don't retain the null-check
  // narrowing above (TS resets narrowing at function boundaries), so
  // capture receipt in a variable whose declared type is already non-null.
  const loadedReceipt: Receipt = receipt

  const isDraft = receipt.status === 'draft'
  const hasDocPhoto = receipt.photos.some((p) => p.category === 'po_receipt_document')
  const hasMaterialsPhoto = receipt.photos.some((p) => p.category === 'po_receipt_photo')
  const photosComplete = (hasDocPhoto || hasBuyerReceipt) && hasMaterialsPhoto
  // A system admin can confirm without the photos by ticking the override and giving a reason.
  const bypassing = isSystemAdmin && !photosComplete && photoBypassReady(bypassPhotos, bypassReason)
  const canConfirm = photosComplete || bypassing

  function openCamera(kind: PhotoKind) {
    captureKindRef.current = kind
    cameraInputRef.current?.click()
  }
  function openGallery(kind: PhotoKind) {
    captureKindRef.current = kind
    fileInputRef.current?.click()
  }

  async function uploadOneFile(file: File, kind: PhotoKind): Promise<void> {
    const regResp = await api.post<{ fileId: string }>('/files/upload-url', {
      filename: file.name,
      mimeType: file.type || 'image/jpeg',
      sizeBytes: file.size,
      category: PHOTO_CATEGORY[kind],
    })
    const { fileId } = regResp.data
    await api.post(`/files/${fileId}/content`, file, {
      headers: { 'Content-Type': file.type || 'image/jpeg' },
    })
    await attachReceiptPhoto({
      variables: {
        receiptId: loadedReceipt.id,
        fileId,
        label: kind === 'vendor_receipt' ? t('inv.storeInDetail.vendorReceipt') : t('inv.storeInDetail.materialsReceived'),
      },
    })
  }

  async function uploadFiles(files: File[], kind: PhotoKind): Promise<void> {
    if (files.length === 0) return
    setUploadingKind(kind)
    try {
      for (const file of files) {
        await uploadOneFile(file, kind)
      }
    } catch (err) {
      addToast({ type: 'error', message: apiErrMsg(err, t('inv.storeInDetail.photoUploadFailed')) })
    } finally {
      // Always refetch, even after a mid-batch failure — files uploaded
      // before the one that failed are already attached server-side and
      // should show up immediately rather than staying invisible until some
      // unrelated refetch happens to fire later.
      await refetch()
      setUploadingKind(null)
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    const kind = captureKindRef.current
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (cameraInputRef.current) cameraInputRef.current.value = ''
    await uploadFiles(files, kind)
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>, kind: PhotoKind) {
    e.preventDefault()
    setDragOverKind(null)
    void uploadFiles(Array.from(e.dataTransfer.files), kind)
  }

  async function handleDownload(photo: ReceiptPhoto) {
    try {
      const { data: dlData } = await getDownloadUrl({ variables: { fileId: photo.fileId } })
      const url = dlData?.fileDownloadUrl.downloadUrl
      if (!url) throw new Error(t('inv.storeInDetail.noDownloadUrl'))
      const a = document.createElement('a')
      a.href = url
      a.download = photo.originalFilename
      a.target = '_blank'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } catch (err) {
      addToast({ type: 'error', message: apiErrMsg(err, t('inv.storeInDetail.downloadFailed')) })
    }
  }

  async function handleRemovePhoto(photo: ReceiptPhoto) {
    try {
      await detachFile({
        variables: { attachmentId: photo.id, entityType: 'po_receipt', entityId: loadedReceipt.id },
      })
      await refetch()
    } catch (err) {
      addToast({ type: 'error', message: apiErrMsg(err, t('inv.storeInDetail.removeFailed')) })
    }
  }

  function renderPhotoSection(kind: PhotoKind, label: string, hint: string, optional = false) {
    const category = PHOTO_CATEGORY[kind]
    const photos = loadedReceipt.photos.filter((p) => p.category === category)
    const isDragOver = dragOverKind === kind
    return (
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOverKind(kind)
        }}
        onDragLeave={(e) => {
          // dragleave fires when the pointer moves onto a CHILD element too
          // (button, existing-photo row) — only actually clear the highlight
          // once the pointer has left the whole zone, or it flickers on/off
          // while dragging over its contents.
          if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
          setDragOverKind((prev) => (prev === kind ? null : prev))
        }}
        onDrop={(e) => {
          handleDrop(e, kind)
        }}
        style={{
          marginBottom: '16px',
          padding: isDragOver ? '10px' : 0,
          borderRadius: '8px',
          background: isDragOver ? 'rgba(37,99,235,0.06)' : 'transparent',
          outline: isDragOver ? `2px dashed ${theme.accent}` : 'none',
          outlineOffset: '2px',
          transition: 'background 0.15s, outline 0.15s',
        }}
      >
        <div
          style={{
            fontWeight: 600,
            color: theme.textPrimary,
            marginBottom: '8px',
            fontSize: '13px',
          }}
        >
          {label} {photos.length > 0 ? '✓' : optional ? '(optional)' : '(required)'}
        </div>
        {photos.length > 0 && (
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '8px' }}
          >
            {photos.map((p) => (
              <div
                key={p.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '8px 10px',
                  border: `1px solid ${theme.border}`,
                  borderRadius: '6px',
                  fontSize: '12px',
                }}
              >
                <span
                  style={{
                    flex: 1,
                    color: theme.textSecondary,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {p.originalFilename}
                </span>
                <Button variant="ghost" size="sm" onClick={() => void handleDownload(p)}>
                  {t('inv.storeInDetail.download')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  style={{ color: theme.danger }}
                  disabled={detaching}
                  onClick={() => void handleRemovePhoto(p)}
                >
                  {t('inv.storeInDetail.remove')}
                </Button>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            loading={uploadingKind === kind}
            onClick={() => {
              openCamera(kind)
            }}
          >
            {t('inv.storeInDetail.takePhoto')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            loading={uploadingKind === kind}
            onClick={() => {
              openGallery(kind)
            }}
          >
            {t('inv.storeInDetail.addPhotoPdf')}
          </Button>
        </div>
        <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '4px' }}>
          {t('inv.storeInDetail.dragDropHint', { hint })}
        </div>
      </div>
    )
  }

  const baseCcy = receipt.base_currency_code ?? 'IQD'
  // Converted to base currency — this is what safely sums across lines even
  // when they're priced in different currencies, so it's the right figure
  // for the overall Total Cost, but NOT for the per-line Total column (see
  // lineTotalNative below).
  const lineTotal = (l: ReceiptLine) =>
    parseFloat(l.qty_received) *
    parseFloat(l.unit_price ?? '0') *
    (parseFloat(l.fx_rate_to_base ?? '1') || 1)
  // Same, but without the fx_rate_to_base conversion — for the per-line
  // Total column, which sits right next to this same line's own Unit Price
  // and should read in that same native currency (a line genuinely priced
  // in USD showing its total in IQD with no visible conversion looks like
  // a bug, even when the number itself is correct).
  const lineTotalNative = (l: ReceiptLine) =>
    parseFloat(l.qty_received) * parseFloat(l.unit_price ?? '0')

  const totalCost = receipt.lines.reduce((s, l) => s + lineTotal(l), 0)

  const columns: Column<ReceiptLine>[] = [
    {
      key: 'product',
      header: t('inv.storeInDetail.item'),
      render: (l) => (
        <div>
          <div style={{ color: theme.textPrimary, fontWeight: 500 }}>
            {lineDisplayName(l) ?? '—'}
          </div>
          {catalogNameDiffers(l) && (
            <div style={{ fontSize: '11px', color: theme.warning }}>
              {t('inv.storeInDetail.catalogItem', { name: l.product_name })}
            </div>
          )}
          {l.sku && <div style={{ fontSize: '11px', color: theme.textMuted }}>{l.sku}</div>}
        </div>
      ),
    },
    {
      key: 'qty',
      header: t('inv.storeInDetail.qty'),
      render: (l) => (
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
          {l.qty_received} {l.uom ?? ''}
        </span>
      ),
    },
    {
      key: 'unitPrice',
      header: t('inv.storeInDetail.unitPrice'),
      render: (l) => (
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
          {fmtAmt(parseFloat(l.unit_price ?? '0'))} {l.currency_code ?? baseCcy}
        </span>
      ),
    },
    {
      key: 'total',
      header: t('inv.storeInDetail.total'),
      render: (l) => (
        <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
          {fmtAmt(lineTotalNative(l))} {l.currency_code ?? baseCcy}
        </span>
      ),
    },
  ]

  return (
    <div style={{ ...pagePadding, margin: '0 auto', maxWidth: '1100px' }}>
      <PageHeader
        title={receipt.receipt_number ?? receipt.id.slice(0, 8)}
        subtitle={`${receipt.po_number ? t('inv.storeInDetail.subtitlePo', { number: receipt.po_number }) : t('inv.storeInDetail.noLinkedPo')} • ${receipt.receipt_date?.slice(0, 10) ?? '—'}`}
        backPath="/inventory/store-in"
        actions={
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <Badge variant={STATUS_VARIANT[receipt.status] ?? 'neutral'}>{enumLabel(receipt.status)}</Badge>
            <Button
              variant="secondary"
              onClick={() => {
                setShowPrintModal(true)
              }}
            >
              {t('inv.storeInDetail.print')}
            </Button>
            {receipt.status === 'confirmed' && canReverse && (
              <Button
                variant="danger"
                onClick={() => {
                  setReverseOpen(true)
                }}
              >
                {t('inv.storeInDetail.reverseReceipt')}
              </Button>
            )}
          </div>
        }
      />

      <Card style={{ marginTop: '20px', padding: '20px' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '16px',
            marginBottom: '20px',
          }}
        >
          <div>
            <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '2px' }}>
              {t('inv.storeInDetail.receivedFrom')}
            </div>
            <div style={{ fontSize: '13px', color: theme.textPrimary }}>
              {receipt.received_from_name ?? '—'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '2px' }}>
              {t('inv.storeInDetail.receivedBy')}
            </div>
            <div style={{ fontSize: '13px', color: theme.textPrimary }}>
              {receipt.received_by_name ?? receipt.received_by_email ?? '—'}
            </div>
          </div>
          {receipt.po_number && (
            <div>
              <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '2px' }}>
                {t('inv.storeInDetail.linkedPo')}
              </div>
              <div style={{ fontSize: '13px', color: theme.textPrimary }}>{receipt.po_number}</div>
            </div>
          )}
          <div>
            <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '2px' }}>
              {t('inv.storeInDetail.totalCost')}
            </div>
            <div style={{ fontSize: '13px', color: theme.textPrimary, fontWeight: 600 }}>
              {fmtAmt(totalCost)} {baseCcy}
            </div>
          </div>
        </div>
        {(receipt.notes || receipt.location_notes) && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: '7px',
              background: theme.bgSurface,
              border: `1px solid ${theme.border}`,
              fontSize: '12px',
              color: theme.textSecondary,
              marginBottom: '20px',
            }}
          >
            {[receipt.location_notes, receipt.notes].filter(Boolean).join(' — ')}
          </div>
        )}
        {receipt.status === 'reversed' && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: '7px',
              background: '#ef444410',
              border: '1px solid #ef4444',
              fontSize: '12px',
              color: '#ef4444',
              marginBottom: '20px',
            }}
          >
            <strong>{t('inv.storeInDetail.reversed')}</strong>
            {receipt.reversed_at && ` on ${receipt.reversed_at.slice(0, 10)}`}
            {receipt.reversed_by_email && ` by ${receipt.reversed_by_email}`}
            {receipt.reversal_reason && ` — ${receipt.reversal_reason}`}
          </div>
        )}

        <Table<ReceiptLine>
          columns={columns}
          data={receipt.lines}
          rowKey="po_line_id"
          emptyMessage={t('inv.storeInDetail.noItems')}
        />
      </Card>

      {isDraft && (
        <Card style={{ marginTop: '20px', padding: '20px' }}>
          <div style={{ fontWeight: 600, color: theme.textPrimary, marginBottom: '4px' }}>
            {t('inv.storeInDetail.requiredPhotos')}
          </div>
          <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '16px' }}>
            {t('inv.storeInDetail.draftNotice')}{' '}
            {hasBuyerReceipt
              ? t('inv.storeInDetail.theBuyerAlreadyAttachedAVendor')
              : t('inv.storeInDetail.attachBothPhotosBelowThenConfirm')}
          </div>
          {receipt.po_id && (
            <div style={{ marginBottom: '16px' }}>
              <EntityAttachments
                entityType="purchase_order"
                entityId={receipt.po_id}
                readOnly
                title={t('inv.storeInDetail.buyerSReceipt')}
                description={t('inv.storeInDetail.uploadedByTheBuyerDuringItems')}
                recordLabel="this purchase"
              />
            </div>
          )}
          {renderPhotoSection(
            'vendor_receipt',
            t('inv.storeInDetail.vendorReceiptFallback'),
            t('inv.storeInDetail.vendorReceiptFallbackHint'),
            hasBuyerReceipt,
          )}
          {renderPhotoSection(
            'materials',
            t('inv.storeInDetail.materialsReceivedLabel'),
            t('inv.storeInDetail.materialsReceivedHint'),
          )}
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '8px',
              marginTop: '16px',
              paddingTop: '16px',
              borderTop: `1px solid ${theme.border}`,
            }}
          >
            <Button
              variant="ghost"
              onClick={() => {
                setCancelOpen(true)
              }}
            >
              {t('inv.storeInDetail.cancelReceipt')}
            </Button>
            <Button
              variant="primary"
              disabled={!canConfirm}
              onClick={() => {
                setConfirmOpen(true)
              }}
            >
              {t('inv.storeInDetail.confirmReceipt')}
            </Button>
          </div>
          {!canConfirm && (
            <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '8px' }}>
              {hasMaterialsPhoto
                ? t('inv.storeInDetail.attachAVendorReceiptBeforeConfirming')
                : !(hasDocPhoto || hasBuyerReceipt)
                  ? t('inv.storeInDetail.attachAMaterialsPhotoAndA')
                  : t('inv.storeInDetail.attachAMaterialsPhotoBeforeConfirming')}
            </div>
          )}
          {isSystemAdmin && !photosComplete && (
            <AdminPhotoBypass
              enabled={bypassPhotos}
              reason={bypassReason}
              onEnabledChange={setBypassPhotos}
              onReasonChange={setBypassReason}
            />
          )}
        </Card>
      )}

      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={(e) => void handleFileSelect(e)}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => void handleFileSelect(e)}
      />

      <div style={{ marginTop: '20px' }}>
        <EntityAttachments
          entityType="po_receipt"
          entityId={receipt.id}
          recordLabel="this Store In record"
        />
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => {
          setConfirmOpen(false)
        }}
        onConfirm={() => {
          void confirmReceipt({
            variables: bypassing
              ? { id: receipt.id, bypassPhotos: true, bypassReason: bypassReason.trim() }
              : { id: receipt.id },
          })
        }}
        title={t('inv.storeInDetail.confirmReceipt')}
        message={t('inv.storeInDetail.confirmingWillAddTheseItemsTo')}
        confirmLabel={t('inv.storeInDetail.confirm')}
        confirmVariant="primary"
        loading={confirming}
      />

      <ConfirmDialog
        open={cancelOpen}
        onClose={() => {
          setCancelOpen(false)
        }}
        onConfirm={() => {
          void cancelReceipt({ variables: { id: receipt.id } })
        }}
        title={t('inv.storeInDetail.cancelReceipt')}
        message={t('inv.storeInDetail.areYouSureYouWantTo')}
        confirmLabel={t('inv.storeInDetail.cancelReceipt')}
        confirmVariant="danger"
        loading={cancelling}
      />

      {/* Reverse Receipt modal — requires a reason, unlike the draft-only dialogs above */}
      {reverseOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <Card style={{ padding: '24px', width: '440px' }}>
            <h3 style={{ margin: '0 0 12px', color: theme.textPrimary, fontSize: '15px' }}>
              {t('inv.storeInDetail.reverseReceipt')}
            </h3>
            <p style={{ fontSize: '12px', color: theme.textSecondary, marginBottom: '12px' }}>
              {t('inv.storeInDetail.thisUndoesTheStockThisReceipt')}
            </p>
            <textarea
              value={reverseReason}
              onChange={(e) => {
                setReverseReason(e.target.value)
              }}
              placeholder={t('inv.storeInDetail.whyIsThisReceiptBeingReversed')}
              style={{
                width: '100%',
                height: '80px',
                resize: 'vertical',
                padding: '8px 10px',
                borderRadius: '8px',
                border: `1px solid ${theme.border}`,
                background: theme.bgSurface,
                color: theme.textPrimary,
                fontSize: '12px',
                fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
            />
            <div
              style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}
            >
              <Button
                variant="ghost"
                onClick={() => {
                  setReverseOpen(false)
                  setReverseReason('')
                }}
              >
                {t('inv.storeInDetail.cancel')}
              </Button>
              <Button
                variant="danger"
                disabled={reversing || !reverseReason.trim()}
                onClick={() => {
                  void reverseReceipt({ variables: { id: receipt.id, reason: reverseReason } })
                }}
              >
                {t('inv.storeInDetail.reverseReceipt')}
              </Button>
            </div>
          </Card>
        </div>
      )}

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
                {t('inv.storeInDetail.printTitle', { number: receipt.receipt_number })}
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

            <div style={{ flex: 1, overflow: 'hidden', background: '#f3f4f6', minHeight: 0 }}>
              <iframe
                ref={printIframeRef}
                srcDoc={buildStoreInHTML({
                  receiptNumber: receipt.receipt_number ?? receipt.id.slice(0, 8),
                  receiptDate: receipt.receipt_date ?? '',
                  poNumber: receipt.po_number,
                  receivedFromName: receipt.received_from_name,
                  locationName: receipt.location_name,
                  notes:
                    [receipt.location_notes, receipt.notes].filter(Boolean).join(' — ') || null,
                  receivedByName: receipt.received_by_name ?? receipt.received_by_email,
                  companyName: activeCompany?.name,
                  baseCurrencyCode: baseCcy,
                  lines: receipt.lines.map((l) => ({
                    productName: lineDisplayName(l),
                    productNameAr: catalogNameDiffers(l) ? null : l.product_name_ar,
                    sku: l.sku,
                    qtyReceived: parseFloat(l.qty_received),
                    uom: l.uom,
                    unitPrice: parseFloat(l.unit_price ?? '0'),
                    currencyCode: l.currency_code,
                    fxRateToBase: parseFloat(l.fx_rate_to_base ?? '1') || 1,
                  })),
                })}
                style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
                title={t('inv.storeInDetail.iframeTitle', { number: receipt.receipt_number })}
              />
            </div>

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
                {t('inv.storeInDetail.cancel')}
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => printIframeRef.current?.contentWindow?.print()}
              >
                {t('inv.storeInDetail.printSaveAsPdf')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
