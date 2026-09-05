import { useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useLazyQuery } from '@apollo/client'
import {
  PO_RECEIPT_QUERY,
  CONFIRM_RECEIPT,
  CANCEL_RECEIPT,
  ATTACH_RECEIPT_PHOTO,
} from '../../../graphql/procurement'
import { DETACH_FILE, FILE_DOWNLOAD_URL_QUERY } from '../../../graphql/hr'
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
import { useToastStore } from '../../../store/toastStore'

type PhotoKind = 'vendor_receipt' | 'materials'
const PHOTO_CATEGORY: Record<PhotoKind, string> = {
  vendor_receipt: 'po_receipt_document',
  materials: 'po_receipt_photo',
}

interface ReceiptLine {
  po_line_id: string
  description: string | null
  product_name: string | null
  sku: string | null
  uom: string | null
  unit_price: string | null
  currency_code: string | null
  fx_rate_to_base: string | null
  qty_received: string
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
  po_id: string
  po_number: string | null
  vendor_name: string | null
  received_from_name: string | null
  base_currency_code: string | null
  receipt_number: string | null
  receipt_date: string
  location_name: string | null
  notes: string | null
  received_by_email: string | null
  received_by_name: string | null
  location_notes: string | null
  created_at: string
  status: string
  confirmed_at: string | null
  lines: ReceiptLine[]
  photos: ReceiptPhoto[]
}

const STATUS_VARIANT: Record<string, 'neutral' | 'warning' | 'success' | 'danger'> = {
  draft: 'warning',
  confirmed: 'success',
  cancelled: 'danger',
}

const fmtAmt = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function StoreInDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { theme } = useTheme()
  const pagePadding = usePagePadding()
  const { activeCompany } = useCompany()
  const addToast = useToastStore((s) => s.addToast)
  const [showPrintModal, setShowPrintModal] = useState(false)
  const printIframeRef = useRef<HTMLIFrameElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const captureKindRef = useRef<PhotoKind>('materials')
  const [uploadingKind, setUploadingKind] = useState<PhotoKind | null>(null)
  const [dragOverKind, setDragOverKind] = useState<PhotoKind | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)

  const { data, loading, error, refetch } = useQuery(PO_RECEIPT_QUERY, {
    variables: { id },
    skip: !id,
    fetchPolicy: 'cache-and-network',
  })
  const receipt: Receipt | undefined = data?.poReceipt

  const [attachReceiptPhoto] = useMutation(ATTACH_RECEIPT_PHOTO)
  const [detachFile, { loading: detaching }] = useMutation(DETACH_FILE)
  const [getDownloadUrl] = useLazyQuery(FILE_DOWNLOAD_URL_QUERY)
  const [confirmReceipt, { loading: confirming }] = useMutation(CONFIRM_RECEIPT, {
    onCompleted: () => {
      addToast({ type: 'success', message: 'Receipt confirmed — inventory updated' })
      setConfirmOpen(false)
      void refetch()
    },
    onError: (e) => {
      addToast({ type: 'error', message: e.message })
      setConfirmOpen(false)
    },
  })
  const [cancelReceipt, { loading: cancelling }] = useMutation(CANCEL_RECEIPT, {
    onCompleted: () => {
      addToast({ type: 'success', message: 'Draft receipt cancelled' })
      setCancelOpen(false)
      navigate('/inventory/store-in')
    },
    onError: (e) => {
      addToast({ type: 'error', message: e.message })
      setCancelOpen(false)
    },
  })

  if (loading && !receipt)
    return <div style={{ padding: '48px', color: theme.textMuted }}>Loading…</div>
  if (error)
    return (
      <div style={{ padding: '48px', color: '#991b1b' }}>
        Couldn't load this Store In record: {error.message}
      </div>
    )
  if (!receipt)
    return <div style={{ padding: '48px', color: theme.textMuted }}>Store In record not found.</div>

  const isDraft = receipt.status === 'draft'
  const hasDocPhoto = receipt.photos.some((p) => p.category === 'po_receipt_document')
  const hasMaterialsPhoto = receipt.photos.some((p) => p.category === 'po_receipt_photo')
  const canConfirm = hasDocPhoto && hasMaterialsPhoto

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
        receiptId: receipt!.id,
        fileId,
        label: kind === 'vendor_receipt' ? 'Vendor Receipt' : 'Materials Received',
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
      addToast({ type: 'error', message: apiErrMsg(err, 'Photo upload failed') })
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
    void uploadFiles(Array.from(e.dataTransfer.files ?? []), kind)
  }

  async function handleDownload(photo: ReceiptPhoto) {
    try {
      const { data: dlData } = await getDownloadUrl({ variables: { fileId: photo.fileId } })
      const url = dlData?.fileDownloadUrl?.downloadUrl
      if (!url) throw new Error('No download URL')
      const a = document.createElement('a')
      a.href = url
      a.download = photo.originalFilename
      a.target = '_blank'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } catch (err) {
      addToast({ type: 'error', message: apiErrMsg(err, 'Download failed') })
    }
  }

  async function handleRemovePhoto(photo: ReceiptPhoto) {
    try {
      await detachFile({
        variables: { attachmentId: photo.id, entityType: 'po_receipt', entityId: receipt!.id },
      })
      await refetch()
    } catch (err) {
      addToast({ type: 'error', message: apiErrMsg(err, 'Remove failed') })
    }
  }

  function renderPhotoSection(kind: PhotoKind, label: string, hint: string) {
    const category = PHOTO_CATEGORY[kind]
    const photos = receipt!.photos.filter((p) => p.category === category)
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
        onDrop={(e) => handleDrop(e, kind)}
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
          {label} {photos.length > 0 ? '✓' : '(required)'}
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
                  Download
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  style={{ color: theme.danger }}
                  disabled={detaching}
                  onClick={() => void handleRemovePhoto(p)}
                >
                  Remove
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
            onClick={() => openCamera(kind)}
          >
            📷 Take Photo
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            loading={uploadingKind === kind}
            onClick={() => openGallery(kind)}
          >
            + Add Photo / PDF
          </Button>
        </div>
        <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '4px' }}>
          {hint} Or drag &amp; drop files onto this section.
        </div>
      </div>
    )
  }

  const baseCcy = receipt.base_currency_code ?? 'IQD'
  const lineTotal = (l: ReceiptLine) =>
    parseFloat(l.qty_received) * parseFloat(l.unit_price ?? '0') * (parseFloat(l.fx_rate_to_base ?? '1') || 1)

  const totalCost = receipt.lines.reduce((s, l) => s + lineTotal(l), 0)

  const columns: Column<ReceiptLine>[] = [
    {
      key: 'product',
      header: 'Item',
      render: (l) => (
        <div>
          <div style={{ color: theme.textPrimary, fontWeight: 500 }}>
            {l.product_name ?? l.description ?? '—'}
          </div>
          {l.sku && <div style={{ fontSize: '11px', color: theme.textMuted }}>{l.sku}</div>}
        </div>
      ),
    },
    {
      key: 'qty',
      header: 'Qty',
      render: (l) => (
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
          {l.qty_received} {l.uom ?? ''}
        </span>
      ),
    },
    {
      key: 'unitPrice',
      header: 'Unit Price',
      render: (l) => (
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
          {fmtAmt(parseFloat(l.unit_price ?? '0'))} {l.currency_code ?? baseCcy}
        </span>
      ),
    },
    {
      key: 'total',
      header: `Total (${baseCcy})`,
      render: (l) => (
        <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
          {fmtAmt(lineTotal(l))}
        </span>
      ),
    },
  ]

  return (
    <div style={{ ...pagePadding, margin: '0 auto', maxWidth: '1100px' }}>
      <PageHeader
        title={receipt.receipt_number ?? receipt.id.slice(0, 8)}
        subtitle={`${receipt.po_number ? `PO ${receipt.po_number}` : 'No linked PO'} • ${receipt.receipt_date.slice(0, 10)}`}
        backPath="/inventory/store-in"
        actions={
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <Badge variant={STATUS_VARIANT[receipt.status] ?? 'neutral'}>{receipt.status}</Badge>
            <Button
              variant="secondary"
              onClick={() => {
                setShowPrintModal(true)
              }}
            >
              Print
            </Button>
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
              Received From
            </div>
            <div style={{ fontSize: '13px', color: theme.textPrimary }}>
              {receipt.received_from_name ?? '—'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '2px' }}>
              Received By
            </div>
            <div style={{ fontSize: '13px', color: theme.textPrimary }}>
              {receipt.received_by_name ?? receipt.received_by_email ?? '—'}
            </div>
          </div>
          {receipt.po_number && (
            <div>
              <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '2px' }}>
                Linked PO
              </div>
              <div style={{ fontSize: '13px', color: theme.textPrimary }}>{receipt.po_number}</div>
            </div>
          )}
          <div>
            <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '2px' }}>
              Total Cost
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

        <Table<ReceiptLine>
          columns={columns}
          data={receipt.lines}
          rowKey="po_line_id"
          emptyMessage="No items."
        />
      </Card>

      {isDraft && (
        <Card style={{ marginTop: '20px', padding: '20px' }}>
          <div style={{ fontWeight: 600, color: theme.textPrimary, marginBottom: '4px' }}>
            Required Photos
          </div>
          <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '16px' }}>
            This receipt is still a draft — nothing has been added to inventory yet. Attach both
            photos below, then confirm to update stock and the linked PO.
          </div>
          {renderPhotoSection(
            'vendor_receipt',
            'Vendor Receipt',
            "Photo, scan, or PDF of the vendor's actual receipt or invoice document.",
          )}
          {renderPhotoSection(
            'materials',
            'Materials Received',
            'Photo of the delivered goods, packaging labels, or delivery location.',
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
              Cancel Receipt
            </Button>
            <Button
              variant="primary"
              disabled={!canConfirm}
              onClick={() => {
                setConfirmOpen(true)
              }}
            >
              Confirm Receipt
            </Button>
          </div>
          {!canConfirm && (
            <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '8px' }}>
              Attach both required photos before confirming.
            </div>
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
          void confirmReceipt({ variables: { id: receipt.id } })
        }}
        title="Confirm Receipt"
        message="Confirming will add these items to inventory and update the linked PO. This cannot be undone."
        confirmLabel="Confirm"
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
        title="Cancel Receipt"
        message="Are you sure you want to cancel this draft receipt? Nothing has been added to inventory yet, so this simply discards it."
        confirmLabel="Cancel Receipt"
        confirmVariant="danger"
        loading={cancelling}
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
                Print Store In — {receipt.receipt_number}
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
                  receiptDate: receipt.receipt_date,
                  poNumber: receipt.po_number,
                  receivedFromName: receipt.received_from_name,
                  locationName: receipt.location_name,
                  notes: [receipt.location_notes, receipt.notes].filter(Boolean).join(' — ') || null,
                  receivedByName: receipt.received_by_name ?? receipt.received_by_email,
                  companyName: activeCompany?.name,
                  baseCurrencyCode: baseCcy,
                  lines: receipt.lines.map((l) => ({
                    productName: l.product_name ?? l.description,
                    sku: l.sku,
                    qtyReceived: parseFloat(l.qty_received),
                    uom: l.uom,
                    unitPrice: parseFloat(l.unit_price ?? '0'),
                    currencyCode: l.currency_code,
                    fxRateToBase: parseFloat(l.fx_rate_to_base ?? '1') || 1,
                  })),
                })}
                style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
                title={`Store In ${receipt.receipt_number}`}
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
