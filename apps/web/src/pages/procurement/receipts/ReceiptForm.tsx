import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@apollo/client'
import { api } from '../../../lib/axios'
import { apiErrMsg } from '../../../lib/apiError'
import {
  PURCHASE_ORDER_QUERY,
  RECORD_RECEIPT,
  RECORD_DIRECT_DELIVERY,
} from '../../../graphql/procurement'
import { TOUR_DEMO_PO_ID, buildTourDemoReceiptPO } from '../../../components/help/tourDemoPO'
import { STOCK_LOCATIONS_QUERY } from '../../../graphql/inventory'
import { EMPLOYEES_QUERY, ATTACH_FILE } from '../../../graphql/hr'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { Select } from '../../../components/ui/Select'
import { SearchableSelect } from '../../../components/ui/SearchableSelect'
import { Textarea } from '../../../components/ui/Textarea'
import { LineItemEditor, type LineItemField } from '../../../components/ui/LineItemEditor'
import { useToastStore } from '../../../store/toastStore'
import { useAuthStore } from '../../../store/authStore'

interface ReceiptLine {
  po_line_id: string
  description: string
  sku: string | null
  ordered_qty: number
  qty_received_so_far: number
  qty_from_stock: number
  qty_to_receive: string
  po_unit_price: number
  // Lines start unselected — the store keeper actively picks which items
  // they're physically receiving instead of every line showing up
  // pre-filled and editable at once. "Select All" below covers the common
  // full-shipment case in one click.
  selected: boolean
}

// Direct-to-jobsite deliveries skip Store In entirely, but still need proof
// of delivery — these photos attach straight to the PO (entityType
// 'purchase_order') instead of a po_receipt, since no receipt record exists
// for this path.
type PhotoKind = 'vendor_receipt' | 'materials'
const PHOTO_CATEGORY: Record<PhotoKind, string> = {
  vendor_receipt: 'po_receipt_document',
  materials: 'po_receipt_photo',
}

interface PendingPhoto {
  id: string
  file: File
  previewUrl: string
  label: string
  kind: PhotoKind
  uploading: boolean
  error?: string
}

const PO_STATUS_VARIANT: Record<string, 'neutral' | 'warning' | 'success' | 'danger' | 'info'> = {
  approved: 'info',
  items_bought: 'warning',
  goods_received: 'success',
}

// Fixed enterprise accent palette for this page's data-visibility color coding
// (ordered/available/remaining, KPI values, primary CTA) — kept as literal
// values rather than theme tokens so they stay vivid and consistent
// regardless of which of the app's themes is active, matching the intended
// "modern enterprise ERP" reference look.
const BRAND_BLUE = '#2563EB'
const BRAND_GREEN = '#16A34A'
const BRAND_ORANGE = '#F97316'

function IconDocument({ size = 17 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="16" y2="17" />
      <line x1="8" y1="9" x2="10" y2="9" />
    </svg>
  )
}

function IconBarChart({ size = 17 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  )
}

function IconBox({ size = 17 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  )
}

function IconSave({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" />
      <polyline points="7 3 7 8 15 8" />
    </svg>
  )
}

function IconCheckCircle({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  )
}

function IconCamera({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  )
}

export default function ReceiptForm() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  // Interactive PO tour: same reserved id as PurchaseOrderDetail.tsx — see
  // tourDemoPO.ts.
  const isTourDemo = id === TOUR_DEMO_PO_ID
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)
  const currentUser = useAuthStore((s) => s.user)

  const [form, setForm] = useState({
    receipt_date: new Date().toISOString().split('T')[0],
    location_id: '',
    notes: '',
    received_by_id: '',
    received_by_name: '',
    received_from_id: '',
    received_from_name: '',
    location_notes: '',
  })
  const [lines, setLines] = useState<ReceiptLine[]>([])
  const [initialized, setInitialized] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([])
  const [dragOverKind, setDragOverKind] = useState<PhotoKind | null>(null)
  // If recordDirectDelivery succeeds but a photo upload fails, retrying
  // submit should only retry the failed photos — not record the delivery
  // (and double-count qty_received/cost) a second time.
  const [deliveryRecorded, setDeliveryRecorded] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const captureKindRef = useRef<PhotoKind>('materials')
  // Default: everything received by the one person in "Received By" below — this is
  // exactly today's form. Unchecking it reveals a per-line receiver picker so a
  // delivery split across multiple people doesn't need a separate form trip each.
  const [receiveAll, setReceiveAll] = useState(true)
  const [lineReceivers, setLineReceivers] = useState<Record<string, { id: string; name: string }>>(
    {},
  )

  const { data: poData } = useQuery(PURCHASE_ORDER_QUERY, {
    variables: { id },
    skip: !id || isTourDemo,
  })
  const demoPurchaseOrder = isTourDemo ? buildTourDemoReceiptPO() : undefined

  useEffect(() => {
    const purchaseOrder = demoPurchaseOrder ?? poData?.purchaseOrder
    if (purchaseOrder && !initialized) {
      setLines(
        purchaseOrder.lines.map(
          (l: {
            id: string
            description?: string
            sku?: string | null
            qty: string
            qty_received?: string
            qty_from_stock?: string
            unit_price?: string
          }) => {
            const orderedQty = parseFloat(l.qty)
            const receivedSoFar = parseFloat(l.qty_received ?? '0')
            const fromStock = parseFloat(l.qty_from_stock ?? '0')
            const toReceive = Math.max(0, orderedQty - receivedSoFar - fromStock)
            return {
              po_line_id: l.id,
              description: l.description ?? '',
              sku: l.sku ?? null,
              ordered_qty: orderedQty,
              qty_received_so_far: receivedSoFar,
              qty_from_stock: fromStock,
              qty_to_receive: String(toReceive),
              po_unit_price: parseFloat(l.unit_price ?? '0'),
              selected: false,
            }
          },
        ),
      )
      // Pre-fill receiver from PO's designated receiver if set
      const poReceiverName = purchaseOrder.assigned_receiver_name as string | null
      if (poReceiverName) {
        // Find this employee in the list to get their ID, or just store the name
        const matched = employees.find((e) => `${e.first_name} ${e.last_name}` === poReceiverName)
        if (matched) {
          setForm((f) => ({ ...f, received_by_id: matched.id, received_by_name: poReceiverName }))
        } else {
          setForm((f) => ({ ...f, received_by_name: poReceiverName }))
        }
      }
      setInitialized(true)
    }
  }, [poData, demoPurchaseOrder, initialized])

  const { data: locationsData } = useQuery(STOCK_LOCATIONS_QUERY, { variables: { isActive: true } })
  const { data: employeesData } = useQuery(EMPLOYEES_QUERY, { variables: { is_active: true } })
  const [recordReceipt] = useMutation(RECORD_RECEIPT)
  const [recordDirectDelivery] = useMutation(RECORD_DIRECT_DELIVERY)
  const [attachFile] = useMutation(ATTACH_FILE)

  const po = demoPurchaseOrder ?? poData?.purchaseOrder
  // Decided once, at PO creation (PurchaseOrderForm) — not a per-receipt
  // choice, since the from-stock portion's auto Store Out already has to
  // know this at PO approval time, long before anyone reaches receiving.
  const isJobsite = po?.purpose === 'project' && po?.delivery_destination === 'jobsite'
  const locations = locationsData?.stockLocations ?? []
  const employees: {
    id: string
    first_name: string
    last_name: string
    employee_number: string
    user_id?: string
  }[] = employeesData?.employees ?? []

  const employeeOptions = [
    { value: '', label: 'Select receiver…' },
    ...employees.map((e) => ({
      value: e.id,
      label: `${e.first_name} ${e.last_name}`,
      sublabel: e.employee_number,
    })),
  ]

  // Auto-select the current user's employee record once employees load
  useEffect(() => {
    if (!employees.length || form.received_by_id) return
    // Try to match by linked user_id
    const matched = employees.find((e) => e.user_id === currentUser?.id)
    if (matched) {
      setForm((f) => ({
        ...f,
        received_by_id: matched.id,
        received_by_name: `${matched.first_name} ${matched.last_name}`,
      }))
    }
  }, [employees, currentUser?.id])

  function openCamera(kind: PhotoKind) {
    captureKindRef.current = kind
    cameraInputRef.current?.click()
  }
  function openGallery(kind: PhotoKind) {
    captureKindRef.current = kind
    fileInputRef.current?.click()
  }

  function addFiles(files: File[], kind: PhotoKind) {
    const newPhotos: PendingPhoto[] = files.map((f) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file: f,
      previewUrl: URL.createObjectURL(f),
      label: '',
      kind,
      uploading: false,
    }))
    setPendingPhotos((prev) => [...prev, ...newPhotos])
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    addFiles(Array.from(e.target.files ?? []), captureKindRef.current)
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (cameraInputRef.current) cameraInputRef.current.value = ''
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>, kind: PhotoKind) {
    e.preventDefault()
    setDragOverKind(null)
    addFiles(Array.from(e.dataTransfer.files ?? []), kind)
  }

  function removePhoto(photoId: string) {
    setPendingPhotos((prev) => {
      const photo = prev.find((p) => p.id === photoId)
      if (photo) URL.revokeObjectURL(photo.previewUrl)
      return prev.filter((p) => p.id !== photoId)
    })
  }

  async function uploadAndAttachPhoto(photo: PendingPhoto): Promise<void> {
    const regResp = await api.post<{ fileId: string }>('/files/upload-url', {
      filename: photo.file.name,
      mimeType: photo.file.type || 'image/jpeg',
      sizeBytes: photo.file.size,
      category: PHOTO_CATEGORY[photo.kind],
    })
    const { fileId } = regResp.data
    await api.post(`/files/${fileId}/content`, photo.file, {
      headers: { 'Content-Type': photo.file.type || 'image/jpeg' },
    })
    await attachFile({
      variables: {
        fileId,
        entityType: 'purchase_order',
        entityId: id,
        label: photo.label || (photo.kind === 'vendor_receipt' ? 'Vendor Receipt' : 'Materials Received'),
      },
    })
  }

  function renderPhotoGrid(kind: PhotoKind) {
    const photos = pendingPhotos.filter((p) => p.kind === kind)
    const isDragOver = dragOverKind === kind
    return (
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOverKind(kind)
        }}
        onDragLeave={(e) => {
          // dragleave fires when the pointer moves onto a CHILD element too
          // (button, thumbnail) — only actually clear the highlight once the
          // pointer has left the whole zone, or it flickers on/off while
          // dragging over its contents.
          if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
          setDragOverKind((prev) => (prev === kind ? null : prev))
        }}
        onDrop={(e) => handleDrop(e, kind)}
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '12px',
          padding: isDragOver ? '10px' : 0,
          borderRadius: '8px',
          background: isDragOver ? 'rgba(37,99,235,0.06)' : 'transparent',
          outline: isDragOver ? `2px dashed ${BRAND_BLUE}` : 'none',
          outlineOffset: '2px',
          transition: 'background 0.15s, outline 0.15s',
        }}
      >
        {photos.map((photo) => (
          <div key={photo.id} style={{ position: 'relative', width: '140px' }}>
            {photo.file.type === 'application/pdf' ? (
              <div
                style={{
                  width: '140px',
                  height: '100px',
                  borderRadius: '6px',
                  border: `1px solid ${theme.border}`,
                  background: theme.bgSurface,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                  padding: '6px',
                }}
              >
                <span style={{ fontSize: '28px' }}>📄</span>
                <span
                  style={{
                    fontSize: '10px',
                    color: theme.textMuted,
                    maxWidth: '120px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {photo.file.name}
                </span>
              </div>
            ) : (
              <img
                src={photo.previewUrl}
                alt={photo.file.name}
                style={{
                  width: '140px',
                  height: '100px',
                  objectFit: 'cover',
                  borderRadius: '6px',
                  border: `1px solid ${theme.border}`,
                }}
              />
            )}
            {photo.uploading && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'rgba(0,0,0,0.4)',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontSize: '12px',
                }}
              >
                Uploading…
              </div>
            )}
            {photo.error && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'rgba(200,0,0,0.5)',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontSize: '11px',
                  padding: '4px',
                  textAlign: 'center',
                }}
              >
                {photo.error}
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                removePhoto(photo.id)
              }}
              style={{
                position: 'absolute',
                top: '4px',
                right: '4px',
                background: 'rgba(0,0,0,0.6)',
                border: 'none',
                borderRadius: '50%',
                color: '#fff',
                width: '20px',
                height: '20px',
                cursor: 'pointer',
                fontSize: '12px',
                lineHeight: '20px',
                textAlign: 'center',
                padding: 0,
              }}
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => openCamera(kind)}
          style={{
            width: '140px',
            height: '100px',
            border: `2px dashed ${BRAND_BLUE}`,
            borderRadius: '6px',
            cursor: 'pointer',
            background: 'transparent',
            color: BRAND_BLUE,
            fontSize: '13px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px',
          }}
        >
          <IconCamera size={22} />
          <span>Take Photo</span>
        </button>
        <button
          type="button"
          onClick={() => openGallery(kind)}
          style={{
            width: '140px',
            height: '100px',
            border: `2px dashed ${theme.border}`,
            borderRadius: '6px',
            cursor: 'pointer',
            background: 'transparent',
            color: theme.textMuted,
            fontSize: '13px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px',
          }}
        >
          <span style={{ fontSize: '24px' }}>+</span>
          <span>Add Photo / PDF</span>
          <span style={{ fontSize: '10px' }}>or drag &amp; drop</span>
        </button>
      </div>
    )
  }

  // Saves a draft only — no qty_received/stock impact yet. The two required
  // photos (vendor receipt + materials) and the actual "Confirm Receipt" step
  // now happen on the Store In detail page, so this form just needs to
  // capture what's being received and by whom. Direct-to-jobsite deliveries
  // skip all of that (see recordDirectDelivery below).
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isJobsite && !form.received_by_name.trim()) {
      addToast({ type: 'error', message: 'Please select who received the goods' })
      return
    }
    if (!lines.some((l) => l.selected && parseFloat(l.qty_to_receive) > 0)) {
      addToast({ type: 'error', message: 'Select at least one item you\'re receiving' })
      return
    }
    if (isJobsite) {
      const hasVendorReceipt = pendingPhotos.some((p) => p.kind === 'vendor_receipt')
      const hasMaterials = pendingPhotos.some((p) => p.kind === 'materials')
      if (!hasVendorReceipt || !hasMaterials) {
        const missing = [
          !hasVendorReceipt ? 'the vendor receipt' : null,
          !hasMaterials ? 'a photo of the materials delivered' : null,
        ]
          .filter(Boolean)
          .join(' and ')
        addToast({ type: 'error', message: `Please attach ${missing}` })
        return
      }
    }
    setSubmitting(true)
    try {
      const toReceive = lines.filter((l) => l.selected && parseFloat(l.qty_to_receive) > 0)

      if (isJobsite) {
        const isRetry = deliveryRecorded
        if (!isRetry) {
          await recordDirectDelivery({
            variables: {
              poId: id,
              input: {
                received_date: form.receipt_date,
                notes: form.notes || undefined,
                lines: toReceive.map((l) => ({
                  po_line_id: l.po_line_id,
                  qty_received: parseFloat(l.qty_to_receive),
                })),
              },
            },
          })
          setDeliveryRecorded(true)
        }

        // On a retry (delivery already recorded), skip photos that previously
        // succeeded (no error) — only re-attempt ones still showing an error.
        let photosFailed = 0
        for (const photo of pendingPhotos) {
          if (isRetry && !photo.error) continue
          setPendingPhotos((prev) =>
            prev.map((p) => (p.id === photo.id ? { ...p, uploading: true, error: undefined } : p)),
          )
          try {
            await uploadAndAttachPhoto(photo)
            setPendingPhotos((prev) =>
              prev.map((p) => (p.id === photo.id ? { ...p, uploading: false } : p)),
            )
          } catch (photoErr) {
            photosFailed++
            setPendingPhotos((prev) =>
              prev.map((p) =>
                p.id === photo.id
                  ? { ...p, uploading: false, error: apiErrMsg(photoErr, 'Upload failed') }
                  : p,
              ),
            )
          }
        }

        if (photosFailed > 0) {
          addToast({
            type: 'error',
            message: `Delivery recorded, but ${photosFailed} photo${photosFailed > 1 ? 's' : ''} failed to upload. Fix the errors above and try again — the delivery itself won't be recorded twice.`,
          })
          return
        }

        addToast({
          type: 'success',
          message: 'Delivery marked received — cost posted directly to the project',
        })
        navigate(`/procurement/purchase-orders/${id}`)
        return
      }

      let receiptIds: string[]
      if (receiveAll) {
        const { data: receiptData } = await recordReceipt({
          variables: {
            poId: id,
            input: {
              receipt_date: form.receipt_date,
              location_id: form.location_id || undefined,
              notes: form.notes || undefined,
              received_by_name: form.received_by_name,
              received_from_name: form.received_from_name || undefined,
              location_notes: form.location_notes || undefined,
              lines: toReceive.map((l) => ({
                po_line_id: l.po_line_id,
                qty_received: parseFloat(l.qty_to_receive),
              })),
            },
          },
        })
        receiptIds = [receiptData.recordReceipt.id as string]
      } else {
        // Group lines by their effective receiver (per-line override, falling back
        // to the top "Received By" field), then file one draft receipt per distinct
        // receiver — same underlying multi-receipt model as separate form trips,
        // just done as one submission. Each draft gets its own required photos and
        // confirm step later, since each represents a physically distinct delivery.
        const groups = new Map<string, { name: string; lines: typeof toReceive }>()
        for (const line of toReceive) {
          const override = lineReceivers[line.po_line_id]
          const name = override?.name || form.received_by_name
          const key = override?.id || form.received_by_id || name
          const group = groups.get(key)
          if (group) group.lines.push(line)
          else groups.set(key, { name, lines: [line] })
        }
        const newIds: string[] = []
        for (const { name, lines: groupLines } of groups.values()) {
          const { data: receiptData } = await recordReceipt({
            variables: {
              poId: id,
              input: {
                receipt_date: form.receipt_date,
                location_id: form.location_id || undefined,
                notes: form.notes || undefined,
                received_by_name: name,
                received_from_name: form.received_from_name || undefined,
                location_notes: form.location_notes || undefined,
                lines: groupLines.map((l) => ({
                  po_line_id: l.po_line_id,
                  qty_received: parseFloat(l.qty_to_receive),
                })),
              },
            },
          })
          newIds.push(receiptData.recordReceipt.id as string)
        }
        receiptIds = newIds
      }

      if (receiptIds.length === 1) {
        addToast({
          type: 'success',
          message: 'Draft receipt saved — attach photos and confirm to complete it',
        })
        navigate(`/inventory/store-in/${receiptIds[0]}`)
      } else {
        addToast({
          type: 'success',
          message: `${receiptIds.length} draft receipts saved — open each from Store In to attach photos and confirm`,
        })
        navigate('/inventory/store-in')
      }
    } catch (err) {
      addToast({ type: 'error', message: apiErrMsg(err, 'Save failed') })
    } finally {
      setSubmitting(false)
    }
  }

  function remainingQty(line: ReceiptLine): number {
    return Math.max(0, line.ordered_qty - line.qty_received_so_far - line.qty_from_stock)
  }

  function toggleLineSelected(poLineId: string, checked: boolean) {
    setLines((prev) =>
      prev.map((l) => {
        if (l.po_line_id !== poLineId) return l
        // Re-selecting after having zeroed it out should default back to the
        // full remaining qty rather than staying at 0.
        const qty =
          checked && parseFloat(l.qty_to_receive || '0') <= 0
            ? String(remainingQty(l))
            : l.qty_to_receive
        return { ...l, selected: checked, qty_to_receive: qty }
      }),
    )
  }

  // Summary stats for the right-hand column — recomputed on every render so
  // they stay live as the user checks lines and edits quantities.
  const itemCount = lines.length
  const orderedQtyTotal = lines.reduce((s, l) => s + l.ordered_qty, 0)
  const alreadyCoveredQty = lines.reduce((s, l) => s + l.qty_received_so_far + l.qty_from_stock, 0)
  const receivingNowQty = lines.reduce(
    (s, l) => s + (l.selected ? parseFloat(l.qty_to_receive || '0') || 0 : 0),
    0,
  )
  const remainingAfterQty = Math.max(0, orderedQtyTotal - alreadyCoveredQty - receivingNowQty)
  const progressPct =
    orderedQtyTotal > 0
      ? Math.min(100, Math.round(((alreadyCoveredQty + receivingNowQty) / orderedQtyTotal) * 100))
      : 0
  const selectedCount = lines.filter((l) => l.selected).length

  const receiptLineFields: LineItemField<ReceiptLine>[] = [
    {
      key: 'selected',
      label: 'Receiving?',
      width: '70px',
      render: (line) => (
        <input
          type="checkbox"
          checked={line.selected}
          onChange={(e) => {
            toggleLineSelected(line.po_line_id, e.target.checked)
          }}
          style={{ width: '18px', height: '18px', cursor: 'pointer' }}
        />
      ),
    },
    {
      key: 'description',
      label: 'Item',
      render: (line) => (
        <div>
          <div
            style={{
              fontWeight: 500,
              color: line.selected ? theme.textPrimary : theme.textSecondary,
            }}
          >
            {line.description}
          </div>
          {line.sku && (
            <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '1px' }}>
              SKU: {line.sku}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'po_unit_price',
      label: 'PO Price',
      render: (line) => (
        <span style={{ fontFamily: 'monospace', color: theme.textMuted, whiteSpace: 'nowrap' }}>
          {line.po_unit_price > 0 ? line.po_unit_price.toLocaleString() : '—'}
        </span>
      ),
    },
    {
      key: 'ordered_qty',
      label: 'Ordered',
      render: (line) => (
        <span style={{ fontFamily: 'monospace', fontWeight: 600, color: BRAND_BLUE }}>
          {line.ordered_qty.toLocaleString()}
        </span>
      ),
    },
    {
      key: 'qty_received_so_far',
      label: 'Previously Received',
      render: (line) => (
        <span style={{ fontFamily: 'monospace', color: theme.textMuted }}>
          {line.qty_received_so_far.toLocaleString()}
        </span>
      ),
    },
    {
      key: 'qty_from_stock',
      label: 'Available in Stock',
      render: (line) => (
        <span
          style={{
            fontFamily: 'monospace',
            fontWeight: line.qty_from_stock > 0 ? 600 : 400,
            color: line.qty_from_stock > 0 ? BRAND_GREEN : theme.textMuted,
          }}
        >
          {line.qty_from_stock > 0 ? line.qty_from_stock.toLocaleString() : '—'}
        </span>
      ),
    },
    {
      key: 'remaining',
      label: 'Remaining',
      render: (line) => (
        <span style={{ fontFamily: 'monospace', fontWeight: 600, color: BRAND_ORANGE }}>
          {remainingQty(line).toLocaleString()}
        </span>
      ),
    },
    {
      key: 'qty_to_receive',
      label: 'Receive Now',
      width: '140px',
      render: (line, i) => {
        const max = remainingQty(line)
        return (
          <div>
            <Input
              type="number"
              min="0"
              max={max}
              step="0.01"
              disabled={!line.selected}
              value={line.qty_to_receive}
              onChange={(e) => {
                const val = e.target.value
                // Cap at what's actually left to receive — can't over-receive by typo.
                const clamped =
                  val !== '' && !isNaN(parseFloat(val)) && parseFloat(val) > max ? String(max) : val
                setLines((prev) =>
                  prev.map((l, idx) => (idx === i ? { ...l, qty_to_receive: clamped } : l)),
                )
              }}
            />
            <div style={{ fontSize: '10px', color: theme.textMuted, marginTop: '2px' }}>
              Max: {max.toLocaleString()}
            </div>
          </div>
        )
      },
    },
    ...(receiveAll
      ? []
      : [
          {
            key: 'receiver',
            label: 'Receiver',
            width: '160px',
            render: (line: ReceiptLine) => (
              <Select
                value={lineReceivers[line.po_line_id]?.id ?? ''}
                onChange={(e) => {
                  const empId = e.target.value
                  if (!empId) {
                    setLineReceivers((prev) => {
                      const next = { ...prev }
                      delete next[line.po_line_id]
                      return next
                    })
                    return
                  }
                  const emp = employees.find((emp2) => emp2.id === empId)
                  setLineReceivers((prev) => ({
                    ...prev,
                    [line.po_line_id]: {
                      id: empId,
                      name: emp ? `${emp.first_name} ${emp.last_name}` : '',
                    },
                  }))
                }}
              >
                <option value="">— Default —</option>
                {employees.map((emp2) => (
                  <option key={emp2.id} value={emp2.id}>
                    {emp2.first_name} {emp2.last_name}
                  </option>
                ))}
              </Select>
            ),
          },
        ]),
  ]

  return (
    <div style={{ padding: '24px' }}>
      <PageHeader
        title={po?.po_number ?? 'Record Receipt'}
        subtitle="Record Goods Receipt"
        badge={po?.status && <Badge variant={PO_STATUS_VARIANT[po.status] ?? 'neutral'}>{po.status}</Badge>}
        backPath={`/procurement/purchase-orders/${id}`}
        actions={
          <Button
            data-tour="po-mark-delivered-btn"
            type="button"
            variant="primary"
            icon={isJobsite ? <IconCheckCircle size={16} /> : <IconSave size={16} />}
            loading={submitting}
            onClick={() => formRef.current?.requestSubmit()}
          >
            {isJobsite ? 'Mark Delivered' : 'Save Draft'}
          </Button>
        }
      />
      <div
        style={{
          display: 'flex',
          gap: '20px',
          flexWrap: 'wrap',
          marginTop: '-14px',
          marginBottom: '20px',
          fontSize: '13px',
          color: theme.textSecondary,
        }}
      >
        <span>
          <span style={{ color: theme.textMuted }}>Vendor:</span>{' '}
          <strong style={{ color: theme.textPrimary }}>{po?.vendor_name || '—'}</strong>
        </span>
        <span>
          <span style={{ color: theme.textMuted }}>PO Date:</span>{' '}
          <strong style={{ color: theme.textPrimary }}>
            {po?.created_at ? po.created_at.slice(0, 10) : '—'}
          </strong>
        </span>
      </div>

      <form ref={formRef} onSubmit={handleSubmit}>
        <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'stretch' }}>
          {/* Left column ~70%: Receipt Information */}
          <div style={{ flex: '2 1 560px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <Card
              style={{
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                gap: '18px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontWeight: 600,
                  fontSize: '15px',
                  color: theme.textPrimary,
                }}
              >
                <span style={{ color: theme.textMuted, display: 'flex' }}>
                  <IconDocument />
                </span>
                Receipt Information
              </div>

              <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <div style={{ flex: '1 1 180px' }}>
                  <Input
                    label="Receipt Date"
                    type="date"
                    value={form.receipt_date}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, receipt_date: e.target.value }))
                    }}
                    required
                  />
                </div>

                {!isJobsite && (
                  <div style={{ flex: '1.4 1 220px' }}>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '12px',
                        fontWeight: 500,
                        color: theme.textSecondary,
                        marginBottom: '4px',
                      }}
                    >
                      &nbsp;
                    </label>
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontSize: '13px',
                        fontWeight: receiveAll ? 600 : 400,
                        color: receiveAll ? BRAND_BLUE : theme.textMuted,
                        cursor: 'pointer',
                        paddingTop: '2px',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={receiveAll}
                        onChange={(e) => {
                          setReceiveAll(e.target.checked)
                        }}
                        style={{ width: '15px', height: '15px', cursor: 'pointer', accentColor: BRAND_BLUE }}
                      />
                      Receive All Items
                    </label>
                    <div style={{ fontSize: '11px', color: theme.textMuted, marginLeft: '23px' }}>
                      (Single receiver)
                    </div>
                  </div>
                )}
              </div>
              {!isJobsite && !receiveAll && (
                <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '-10px' }}>
                  Each line below can be assigned its own receiver — leave a line unassigned to
                  use the default receiver.
                </div>
              )}

              {!isJobsite && (
                <>
                  <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                    <div style={{ flex: '1 1 200px' }}>
                      <Select
                        label="Receiving Location (optional)"
                        value={form.location_id}
                        onChange={(e) => {
                          setForm((f) => ({ ...f, location_id: e.target.value }))
                        }}
                      >
                        <option value="">Select location…</option>
                        {locations.map((l: { id: string; name: string; code?: string }) => (
                          <option key={l.id} value={l.id}>
                            {l.name}
                            {l.code ? ` (${l.code})` : ''}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div style={{ flex: '1 1 200px' }}>
                      <SearchableSelect
                        label={receiveAll ? 'Received By *' : 'Default Receiver *'}
                        value={form.received_by_id}
                        onChange={(v) => {
                          const emp = employees.find((e) => e.id === v)
                          setForm((f) => ({
                            ...f,
                            received_by_id: v,
                            received_by_name: emp ? `${emp.first_name} ${emp.last_name}` : '',
                          }))
                        }}
                        options={employeeOptions}
                        placeholder="Search employee…"
                        minDropdownWidth={280}
                      />
                      {form.received_by_id && (
                        <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '3px' }}>
                          {receiveAll
                            ? 'Auto-selected — change if someone else received the goods'
                            : 'Used for any line below with no receiver of its own'}
                        </div>
                      )}
                    </div>
                    <div style={{ flex: '1 1 200px' }}>
                      <SearchableSelect
                        label="Received From"
                        value={form.received_from_id}
                        onChange={(v) => {
                          const emp = employees.find((e) => e.id === v)
                          setForm((f) => ({
                            ...f,
                            received_from_id: v,
                            received_from_name: emp ? `${emp.first_name} ${emp.last_name}` : '',
                          }))
                        }}
                        options={employeeOptions}
                        placeholder="Search employee…"
                        minDropdownWidth={280}
                      />
                      <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '3px' }}>
                        Which employee delivered / handed over these goods (optional)
                      </div>
                    </div>
                  </div>
                  <Input
                    label="Location / Jobsite Notes"
                    placeholder="e.g. Site B, Floor 3, Gate 2 — describe where goods were delivered"
                    value={form.location_notes}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, location_notes: e.target.value }))
                    }}
                  />
                </>
              )}

              <Textarea
                label="General Notes"
                placeholder="Add any additional notes about this receipt (damage, condition, packaging, etc.)"
                value={form.notes}
                onChange={(e) => {
                  setForm((f) => ({ ...f, notes: e.target.value }))
                }}
                rows={3}
              />
            </Card>

            {isJobsite && (
              <>
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  style={{ display: 'none' }}
                  onChange={handleFileSelect}
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,application/pdf"
                  multiple
                  style={{ display: 'none' }}
                  onChange={handleFileSelect}
                />

                <Card style={{ padding: '20px' }}>
                  <div
                    data-tour="po-jobsite-photos"
                    style={{ fontWeight: 600, color: theme.textPrimary, marginBottom: '12px' }}
                  >
                    Vendor Receipt (required)
                  </div>
                  {renderPhotoGrid('vendor_receipt')}
                  <div style={{ fontSize: '12px', color: theme.textMuted }}>
                    Photo, scan, or PDF of the vendor's actual receipt or invoice document.
                  </div>
                </Card>

                <Card style={{ padding: '20px' }}>
                  <div style={{ fontWeight: 600, color: theme.textPrimary, marginBottom: '12px' }}>
                    Materials Delivered (required)
                  </div>
                  {renderPhotoGrid('materials')}
                  <div style={{ fontSize: '12px', color: theme.textMuted }}>
                    Photo of the delivered goods at the jobsite.
                  </div>
                </Card>
              </>
            )}
          </div>

          {/* Right column ~30%: Receipt Summary — stretched to match the left column's height */}
          <div style={{ flex: '1 1 280px', display: 'flex' }}>
            <Card
              style={{
                padding: '24px',
                position: 'sticky',
                top: '20px',
                width: '100%',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontWeight: 600,
                  fontSize: '15px',
                  color: theme.textPrimary,
                  marginBottom: '16px',
                }}
              >
                <span style={{ color: theme.textMuted, display: 'flex' }}>
                  <IconBarChart />
                </span>
                Receipt Summary
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '10px',
                  marginBottom: '20px',
                }}
              >
                {[
                  { label: 'Items', value: itemCount },
                  { label: 'Ordered Qty', value: orderedQtyTotal.toLocaleString() },
                  {
                    label: 'Received Qty',
                    value: alreadyCoveredQty.toLocaleString(),
                    color: BRAND_GREEN,
                  },
                  {
                    label: 'Remaining Qty',
                    value: remainingAfterQty.toLocaleString(),
                    color: BRAND_ORANGE,
                  },
                ].map((kpi) => (
                  <div
                    key={kpi.label}
                    style={{
                      padding: '14px',
                      borderRadius: '10px',
                      background: theme.bgCanvas,
                      border: `1px solid ${theme.border}`,
                    }}
                  >
                    <div
                      style={{
                        fontSize: '11px',
                        fontWeight: 500,
                        color: theme.textMuted,
                        marginBottom: '6px',
                      }}
                    >
                      {kpi.label}
                    </div>
                    <div
                      style={{
                        fontSize: '24px',
                        fontWeight: 700,
                        color: kpi.color ?? theme.textPrimary,
                        lineHeight: 1,
                      }}
                    >
                      {kpi.value}
                    </div>
                  </div>
                ))}
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '12px',
                  marginBottom: '6px',
                }}
              >
                <span style={{ fontWeight: 600, color: theme.textPrimary }}>Receipt Progress</span>
                <span style={{ fontWeight: 700, color: BRAND_BLUE }}>{progressPct}%</span>
              </div>
              <div
                style={{
                  height: '8px',
                  borderRadius: '999px',
                  background: theme.bgCanvas,
                  border: `1px solid ${theme.border}`,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${progressPct}%`,
                    background: BRAND_BLUE,
                    borderRadius: '999px',
                    transition: 'width 0.2s',
                  }}
                />
              </div>
              <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '10px' }}>
                You are receiving{' '}
                <strong style={{ color: theme.textPrimary }}>
                  {receivingNowQty.toLocaleString()}
                </strong>{' '}
                of {orderedQtyTotal.toLocaleString()} items
              </div>
            </Card>
          </div>
        </div>

        {/* Receiving Lines */}
        <Card style={{ marginTop: '20px' }}>
          <div
            style={{
              padding: '16px 20px',
              borderBottom: `1px solid ${theme.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              flexWrap: 'wrap',
            }}
          >
            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontWeight: 600,
                  fontSize: '15px',
                  color: theme.textPrimary,
                }}
              >
                <span style={{ color: theme.textMuted, display: 'flex' }}>
                  <IconBox />
                </span>
                Receiving Lines
              </div>
              <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '2px' }}>
                Review each item and enter the quantity you are receiving.
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setLines((prev) =>
                    prev.map((l) =>
                      remainingQty(l) > 0
                        ? {
                            ...l,
                            selected: true,
                            qty_to_receive:
                              parseFloat(l.qty_to_receive || '0') > 0
                                ? l.qty_to_receive
                                : String(remainingQty(l)),
                          }
                        : l,
                    ),
                  )
                }}
              >
                Select All
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setLines((prev) => prev.map((l) => ({ ...l, selected: false })))
                }}
              >
                Deselect All
              </Button>
            </div>
          </div>
          <div style={{ padding: '16px 20px' }}>
            <LineItemEditor
              fields={receiptLineFields}
              rows={lines}
              rowKey={(line) => line.po_line_id}
            />
          </div>
        </Card>

        {/* Sticky footer action bar */}
        <div
          style={{
            position: 'sticky',
            bottom: '0',
            marginTop: '20px',
            background: theme.bgSurface,
            border: `1px solid ${theme.border}`,
            borderRadius: '12px',
            boxShadow: '0 -6px 20px rgba(15,23,42,0.08)',
            padding: '14px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
            zIndex: 5,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span
                style={{
                  color: BRAND_BLUE,
                  display: 'flex',
                  padding: '8px',
                  borderRadius: '8px',
                  background: '#EFF6FF',
                }}
              >
                <IconBox size={18} />
              </span>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary }}>
                  {selectedCount} Item{selectedCount === 1 ? '' : 's'} Selected
                </div>
                <div style={{ fontSize: '11px', color: theme.textMuted }}>
                  of {itemCount} total item{itemCount === 1 ? '' : 's'}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span
                style={{
                  color: BRAND_GREEN,
                  display: 'flex',
                  padding: '8px',
                  borderRadius: '8px',
                  background: '#F0FDF4',
                }}
              >
                <IconCheckCircle size={18} />
              </span>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary }}>
                  Quantity Receiving: {receivingNowQty.toLocaleString()}
                </div>
                <div style={{ fontSize: '11px', color: theme.textMuted }}>
                  of {orderedQtyTotal.toLocaleString()} ordered
                </div>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <Button
              variant="secondary"
              type="button"
              onClick={() => {
                navigate(`/procurement/purchase-orders/${id}`)
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              loading={submitting}
              icon={isJobsite ? <IconCheckCircle size={16} /> : <IconSave size={16} />}
              style={{
                background: BRAND_BLUE,
                border: `1px solid ${BRAND_BLUE}`,
                color: '#ffffff',
                fontWeight: 600,
              }}
            >
              {isJobsite ? 'Mark Delivered' : 'Save Draft'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  )
}
