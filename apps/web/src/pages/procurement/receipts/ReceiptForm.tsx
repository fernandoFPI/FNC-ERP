import { Trans, useTranslation } from 'react-i18next'
import { getPOStatusLabel } from '../../../lib/po-constants'
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
import { EMPLOYEES_QUERY, ATTACH_FILE, ENTITY_ATTACHMENTS_QUERY } from '../../../graphql/hr'
import { hasBuyerReceipt } from '../../../lib/buyerReceipt'
import { receivableLocations } from '../../../lib/receivingLocations'
import {
  AdminPhotoBypass,
  photoBypassReady,
  useIsSystemAdmin,
} from '../../../components/procurement/AdminPhotoBypass'
import type {
  EntityAttachmentsQuery,
  EntityAttachmentsQueryVariables,
} from '../../../graphql/generated'
import { useTheme } from '../../../theme/ThemeContext'
import { useBreakpoint } from '../../../hooks/useBreakpoint'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { ActionButton } from '../../../components/ui/ActionButton'
import { Checkbox } from '../../../components/ui/Checkbox'
import { Input } from '../../../components/ui/Input'
import { Select } from '../../../components/ui/Select'
import { SearchableSelect } from '../../../components/ui/SearchableSelect'
import { Textarea } from '../../../components/ui/Textarea'
import { SectionTitle } from '../../../components/procurement/SectionTitle'
import { StageActionBar } from '../../../components/procurement/StageActionBar'
import {
  RequirementsChecklist,
  type Requirement,
} from '../../../components/procurement/RequirementsChecklist'
import {
  clearLines,
  isLineReceiving,
  receiptRequirements,
  receiptTotals,
  selectAllLines,
  selectLine,
  type ReceiptLine,
} from '../../../lib/receiptLines'
import { ReceiptLinesTable } from './ReceiptLinesTable'
import { ReceiptProofTile, type PendingPhoto, type PhotoKind, type ProofStatus } from './ReceiptProofTile'
import { useToastStore } from '../../../store/toastStore'
import { useAuthStore } from '../../../store/authStore'
import type { AttachFileMutation, AttachFileMutationVariables, EmployeesQuery, EmployeesQueryVariables, PurchaseOrderQuery, PurchaseOrderQueryVariables, RecordDirectDeliveryMutation, RecordDirectDeliveryMutationVariables, RecordReceiptMutation, RecordReceiptMutationVariables, StockLocationsQuery, StockLocationsQueryVariables } from '../../../graphql/generated'

// Direct-to-jobsite deliveries skip Store In entirely, but still need proof
// of delivery — these photos attach straight to the PO (entityType
// 'purchase_order') instead of a po_receipt, since no receipt record exists
// for this path.
const PHOTO_CATEGORY: Record<PhotoKind, string> = {
  vendor_receipt: 'po_receipt_document',
  materials: 'po_receipt_photo',
}

const PO_STATUS_VARIANT: Record<string, 'neutral' | 'warning' | 'success' | 'danger' | 'info'> = {
  approved: 'info',
  items_bought: 'warning',
  goods_received: 'success',
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
      aria-hidden="true"
    >
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" />
      <polyline points="7 3 7 8 15 8" />
    </svg>
  )
}

function IconCheckCircle({ size = 16 }: { size?: number }) {
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
      aria-hidden="true"
    >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  )
}

export default function ReceiptForm() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  // Interactive PO tour: same reserved id as PurchaseOrderDetail.tsx — see
  // tourDemoPO.ts.
  const isTourDemo = id === TOUR_DEMO_PO_ID
  const { theme } = useTheme()
  const { isPhone } = useBreakpoint()
  const addToast = useToastStore((s) => s.addToast)
  const currentUser = useAuthStore((s) => s.user)

  const [form, setForm] = useState({
    receipt_date: new Date().toISOString().split('T')[0],
    location_id: '',
    // where goods received into a TEMPORARY store are going (a warehouse or a site)
    final_destination_location_id: '',
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

  const { data: poData, loading: poLoading } = useQuery<PurchaseOrderQuery, PurchaseOrderQueryVariables>(PURCHASE_ORDER_QUERY, {
    variables: { id: id ?? '' },
    skip: !id || isTourDemo,
  })
  const demoPurchaseOrder = isTourDemo ? buildTourDemoReceiptPO() : undefined

  useEffect(() => {
    const purchaseOrder = demoPurchaseOrder ?? poData?.purchaseOrder
    if (purchaseOrder && !initialized) {
      setLines(
        (purchaseOrder.lines ?? []).map(
          (l) => {
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
              po_unit_price: parseFloat(l.unit_price),
              selected: false,
            }
          },
        ),
      )
      // Pre-fill receiver from PO's designated receiver if set
      const poReceiverName = purchaseOrder.assigned_receiver_name
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

  const { data: locationsData } = useQuery<StockLocationsQuery, StockLocationsQueryVariables>(STOCK_LOCATIONS_QUERY, { variables: { isActive: true } })
  const { data: employeesData } = useQuery<EmployeesQuery, EmployeesQueryVariables>(EMPLOYEES_QUERY, { variables: { is_active: true } })
  const [recordReceipt] = useMutation<RecordReceiptMutation, RecordReceiptMutationVariables>(RECORD_RECEIPT)
  const [recordDirectDelivery] = useMutation<RecordDirectDeliveryMutation, RecordDirectDeliveryMutationVariables>(RECORD_DIRECT_DELIVERY)
  const [attachFile] = useMutation<AttachFileMutation, AttachFileMutationVariables>(ATTACH_FILE)

  const po = demoPurchaseOrder ?? poData?.purchaseOrder
  // Decided once, at PO creation (PurchaseOrderForm) — not a per-receipt
  // choice. It only concerns the PURCHASED goods (Store In vs direct to the
  // jobsite); the from-stock portion always has its own draft Store Out.
  const isJobsite = po?.purpose === 'project' && po.delivery_destination === 'jobsite'
  // The buyer normally uploads the vendor receipt when they buy (requisition's
  // Items Bought stage), so a jobsite delivery must not demand a second copy.
  // Same rule, same helper, as the Store In detail page (lib/buyerReceipt.ts).
  const { data: buyerReceiptData } = useQuery<
    EntityAttachmentsQuery,
    EntityAttachmentsQueryVariables
  >(ENTITY_ATTACHMENTS_QUERY, {
    variables: { entityType: 'purchase_order', entityId: id ?? '' },
    skip: !isJobsite || !id || isTourDemo,
    fetchPolicy: 'cache-and-network',
  })
  const buyerReceiptOnFile = hasBuyerReceipt(buyerReceiptData?.entityAttachments)
  // System-admin-only override of the photo requirement for a jobsite delivery; the
  // server checks the role and records the reason (receiptPhotoBypass.ts).
  const isSystemAdmin = useIsSystemAdmin()
  const [bypassPhotos, setBypassPhotos] = useState(false)
  const [bypassReason, setBypassReason] = useState('')
  const bypassReady = isSystemAdmin && photoBypassReady(bypassPhotos, bypassReason)
  // Never offer Virtual Receipts / Virtual Consumption: stock put there counts as used up, so the goods would
  // never become stock and the project would never be charged (playbook #105). The server refuses them too.
  const locations = receivableLocations(locationsData?.stockLocations ?? [])
  const receivingIsTemporary = locations.some((l) => l.id === form.location_id && l.type === 'temporary')
  const destinationChoices = locations.filter(
    (l) => (l.type === 'warehouse' || l.type === 'site') && l.id !== form.location_id,
  )
  const employees: {
    id: string
    first_name: string
    last_name: string
    employee_number: string | null
    user_id?: string | null
  }[] = (employeesData?.employees ?? []).filter((x): x is NonNullable<typeof x> => x !== null)

  const employeeOptions = [
    { value: '', label: t('receipt.form.selectReceiver') },
    ...employees.map((e) => ({
      value: e.id,
      label: `${e.first_name} ${e.last_name}`,
      sublabel: e.employee_number ?? undefined,
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
    addFiles(Array.from(e.dataTransfer.files), kind)
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
        entityId: id ?? '',
        label: photo.label || (photo.kind === 'vendor_receipt' ? 'Vendor Receipt' : 'Materials Received'),
      },
    })
  }

  // What is still needed before the form can be saved. ONE list: the checklist, the action bar and the refusal on
  // submit all read it (lib/receiptLines.ts), so they cannot disagree.
  const hasVendorReceipt =
    buyerReceiptOnFile || pendingPhotos.some((p) => p.kind === 'vendor_receipt')
  const hasMaterials = pendingPhotos.some((p) => p.kind === 'materials')
  const photosSkipped = isJobsite && (!hasVendorReceipt || !hasMaterials)
  const requirements = receiptRequirements({
    isJobsite,
    receiverName: form.received_by_name,
    lines,
    hasVendorReceipt,
    hasMaterialsPhoto: hasMaterials,
    photosBypassed: bypassReady,
    needsDestination: !isJobsite && receivingIsTemporary,
    hasDestination: form.final_destination_location_id !== '',
  })
  const openRequirements = requirements.filter((r) => !r.done)
  const requirementLabel = (reqId: (typeof requirements)[number]['id']) =>
    t(
      {
        receiver: 'receipt.form.reqReceiver',
        items: 'receipt.form.reqItems',
        destination: 'receipt.form.reqDestination',
        vendorReceipt: 'receipt.form.reqVendorReceipt',
        materials: 'receipt.form.reqMaterials',
      }[reqId],
    )
  const checklistItems: Requirement[] = requirements.map((r) => ({
    id: r.id,
    label: requirementLabel(r.id),
    done: r.done,
  }))

  // Saves a draft only — no qty_received/stock impact yet. The two required
  // photos (vendor receipt + materials) and the actual "Confirm Receipt" step
  // now happen on the Store In detail page, so this form just needs to
  // capture what's being received and by whom. Direct-to-jobsite deliveries
  // skip all of that (see recordDirectDelivery below).
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const first = openRequirements.at(0)
    if (first) {
      if (first.id === 'receiver') {
        addToast({ type: 'error', message: t('receipt.form.pleaseSelectWhoReceivedTheGoods') })
      } else if (first.id === 'items') {
        addToast({ type: 'error', message: t('receipt.form.selectAtLeastOneItemYou') })
      } else if (first.id === 'destination') {
        addToast({ type: 'error', message: t('receipt.form.reqDestination') })
      } else {
        const missing = openRequirements
          .map((r) =>
            r.id === 'vendorReceipt'
              ? t('receipt.form.theVendorReceipt')
              : r.id === 'materials'
                ? t('receipt.form.aPhotoOfMaterials')
                : null,
          )
          .filter(Boolean)
          .join(t('receipt.form.andJoin'))
        addToast({ type: 'error', message: t('receipt.form.pleaseAttach', { missing }) })
      }
      return
    }
    setSubmitting(true)
    try {
      const toReceive = lines.filter(isLineReceiving)

      if (isJobsite) {
        const isRetry = deliveryRecorded
        if (!isRetry) {
          await recordDirectDelivery({
            variables: {
              poId: id ?? '',
              input: {
                received_date: form.receipt_date,
                notes: form.notes || undefined,
                lines: toReceive.map((l) => ({
                  po_line_id: l.po_line_id,
                  qty_received: parseFloat(l.qty_to_receive),
                })),
                // Only declare the override when a photo really was skipped.
                ...(bypassReady && photosSkipped
                  ? { bypassPhotos: true, bypassReason: bypassReason.trim() }
                  : {}),
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
                  ? { ...p, uploading: false, error: apiErrMsg(photoErr, t('receipt.form.uploadFailedShort')) }
                  : p,
              ),
            )
          }
        }

        if (photosFailed > 0) {
          addToast({
            type: 'error',
            message: t('receipt.form.photosFailed', { count: photosFailed }),
          })
          return
        }

        addToast({
          type: 'success',
          message: t('receipt.form.deliveryMarkedReceivedCostPostedDirectly'),
        })
        navigate(`/procurement/purchase-orders/${id}`)
        return
      }

      let receiptIds: string[]
      if (receiveAll) {
        const { data: receiptData } = await recordReceipt({
          variables: {
            poId: id ?? '',
            input: {
              receipt_date: form.receipt_date,
              location_id: form.location_id || undefined,
              final_destination_location_id: receivingIsTemporary ? form.final_destination_location_id : undefined,
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
        if (!receiptData?.recordReceipt) throw new Error('Receipt creation did not return a result')
        receiptIds = [receiptData.recordReceipt.id]
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
              poId: id ?? '',
              input: {
                receipt_date: form.receipt_date,
                location_id: form.location_id || undefined,
                final_destination_location_id: receivingIsTemporary ? form.final_destination_location_id : undefined,
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
          if (!receiptData?.recordReceipt) throw new Error('Receipt creation did not return a result')
          newIds.push(receiptData.recordReceipt.id)
        }
        receiptIds = newIds
      }

      if (receiptIds.length === 1) {
        addToast({
          type: 'success',
          message: t('receipt.form.draftReceiptSavedAttachPhotosAnd'),
        })
        navigate(`/inventory/store-in/${receiptIds[0]}`)
      } else {
        addToast({
          type: 'success',
          message: t('receipt.form.draftReceiptsSaved', { count: receiptIds.length }),
        })
        navigate('/inventory/store-in')
      }
    } catch (err) {
      addToast({ type: 'error', message: apiErrMsg(err, t('receipt.form.saveFailed')) })
    } finally {
      setSubmitting(false)
    }
  }

  // Summary stats for the side column — recomputed on every render so they stay live as lines are ticked and edited.
  const totals = receiptTotals(lines)

  // The same rows as the New Requisition form: every detail row is one grid, so the columns line up row to row.
  const detailsRow = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
    gap: isPhone ? '14px' : '18px 20px',
    alignItems: 'start',
  } as const
  const hint = { fontSize: '12px', color: theme.textSecondary, marginTop: '4px' } as const

  const primaryLabel = isJobsite ? t('receipt.form.markDelivered') : t('receipt.form.saveDraft')

  const proofStatus = (kind: PhotoKind): { status: ProofStatus; label: string } => {
    const added = pendingPhotos.filter((p) => p.kind === kind).length
    if (kind === 'vendor_receipt' && buyerReceiptOnFile && added === 0)
      return { status: 'onFile', label: t('receipt.form.proofOnFile') }
    if (added > 0) return { status: 'added', label: t('receipt.form.proofAdded', { count: added }) }
    if (bypassReady) return { status: 'skipped', label: t('receipt.form.proofSkipped') }
    return { status: 'missing', label: t('receipt.form.proofMissing') }
  }
  const proofTile = (kind: PhotoKind, title: string, hintText: string, tour?: string) => {
    const { status, label } = proofStatus(kind)
    return (
      <ReceiptProofTile
        data-tour={tour}
        title={title}
        hint={hintText}
        status={status}
        statusLabel={label}
        photos={pendingPhotos.filter((p) => p.kind === kind)}
        dragOver={dragOverKind === kind}
        onDragOver={() => {
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
        onDrop={(e) => {
          handleDrop(e, kind)
        }}
        onTakePhoto={() => {
          openCamera(kind)
        }}
        onAddFile={() => {
          openGallery(kind)
        }}
        onRemove={removePhoto}
      />
    )
  }

  return (
    <div style={{ padding: isPhone ? '12px 16px' : '24px' }}>
      <PageHeader
        compact
        title={po?.po_number ?? t('receipt.form.recordReceiptTitle')}
        subtitle={t('receipt.form.recordGoodsReceipt')}
        badge={po?.status && <Badge variant={PO_STATUS_VARIANT[po.status] ?? 'neutral'}>{getPOStatusLabel(po.status)}</Badge>}
        backPath={`/procurement/purchase-orders/${id}`}
      />

      {/* Who it is from, and where the goods go: it decides what the form asks for. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '4px 20px',
            fontSize: '13px',
            color: theme.textSecondary,
          }}
        >
          <span>
            {t('receipt.form.vendor')}{' '}
            <strong style={{ color: theme.textPrimary }}>{po?.vendor_name ?? '—'}</strong>
          </span>
          <span>
            {t('receipt.form.poDate')}{' '}
            <strong style={{ color: theme.textPrimary }}>
              {po?.created_at ? po.created_at.slice(0, 10) : '—'}
            </strong>
          </span>
        </div>
        {po && (
          <div
            data-destination={isJobsite ? 'jobsite' : 'inventory'}
            style={{
              fontSize: '13px',
              color: theme.textPrimary,
              background: theme.accentBg,
              border: `1px solid ${theme.accentBorder}`,
              borderRadius: '10px',
              padding: '10px 14px',
            }}
          >
            <strong>
              {isJobsite
                ? t('receipt.form.destinationJobsite')
                : t('receipt.form.destinationInventory')}
            </strong>
            {' — '}
            <span style={{ color: theme.textSecondary }}>
              {isJobsite
                ? t('receipt.form.destinationJobsiteHint')
                : t('receipt.form.destinationInventoryHint')}
            </span>
          </div>
        )}
      </div>

      <form onSubmit={(...args: Parameters<typeof handleSubmit>) => void handleSubmit(...args)}>
        <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {/* Left column: the details, the lines, the proof of delivery */}
          <div
            style={{
              flex: '2 1 560px',
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: '20px',
            }}
          >
            <Card
              style={{
                padding: isPhone ? '16px' : '24px',
                display: 'flex',
                flexDirection: 'column',
                gap: isPhone ? '14px' : '18px',
              }}
            >
              <SectionTitle step={1}>{t('receipt.form.stepDetails')}</SectionTitle>

              <div style={detailsRow}>
                <div style={{ minWidth: 0 }}>
                  <Input field
                    label={t('receipt.form.receiptDate')}
                    type="date"
                    value={form.receipt_date}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, receipt_date: e.target.value }))
                    }}
                    required
                  />
                </div>
                {!isJobsite && (
                  <div style={{ minWidth: 0 }}>
                    <Select field
                      label={t('receipt.form.receivingLocationOptional')}
                      value={form.location_id}
                      onChange={(e) => {
                        setForm((f) => ({ ...f, location_id: e.target.value, final_destination_location_id: '' }))
                      }}
                    >
                      <option value="">{t('receipt.form.selectLocation')}</option>
                      {locations.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                          {l.code ? ` (${l.code})` : ''}
                          {l.type === 'temporary' ? ` · ${t('receipt.form.temporaryTag')}` : ''}
                        </option>
                      ))}
                    </Select>
                  </div>
                )}
                {!isJobsite && receivingIsTemporary && (
                  <div style={{ minWidth: 0 }}>
                    <Select field
                      label={t('receipt.form.finalDestination')}
                      value={form.final_destination_location_id}
                      onChange={(e) => {
                        setForm((f) => ({ ...f, final_destination_location_id: e.target.value }))
                      }}
                    >
                      <option value="">{t('receipt.form.selectLocation')}</option>
                      {destinationChoices.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                          {l.code ? ` (${l.code})` : ''}
                        </option>
                      ))}
                    </Select>
                  </div>
                )}
              </div>

              {!isJobsite && (
                <>
                  <div style={detailsRow}>
                    <div style={{ minWidth: 0 }}>
                      <SearchableSelect field
                        label={receiveAll ? t('receipt.form.receivedBy') : t('receipt.form.defaultReceiver')}
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
                        placeholder={t('receipt.form.searchEmployee')}
                        minDropdownWidth={280}
                      />
                      {form.received_by_id && (
                        <div style={hint}>
                          {receiveAll
                            ? t('receipt.form.autoSelectedChangeIfSomeoneElse')
                            : t('receipt.form.usedForAnyLineBelowWith')}
                        </div>
                      )}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <SearchableSelect field
                        label={t('receipt.form.receivedFrom')}
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
                        placeholder={t('receipt.form.searchEmployee')}
                        minDropdownWidth={280}
                      />
                      <div style={hint}>{t('receipt.form.whichEmployeeDeliveredHandedOverThese')}</div>
                    </div>
                  </div>

                  <div>
                    <Checkbox
                      label={t('receipt.form.sameReceiver')}
                      checked={receiveAll}
                      onChange={setReceiveAll}
                    />
                    <div style={{ ...hint, marginInlineStart: '24px' }}>
                      {receiveAll
                        ? t('receipt.form.sameReceiverHint')
                        : t('receipt.form.eachLineBelowCanBeAssigned')}
                    </div>
                  </div>

                  <Input field
                    label={t('receipt.form.locationJobsiteNotes')}
                    placeholder={t('receipt.form.eGSiteBFloor3')}
                    value={form.location_notes}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, location_notes: e.target.value }))
                    }}
                  />
                </>
              )}

              <Textarea field
                label={t('receipt.form.generalNotes')}
                placeholder={t('receipt.form.addAnyAdditionalNotesAboutThis')}
                value={form.notes}
                onChange={(e) => {
                  setForm((f) => ({ ...f, notes: e.target.value }))
                }}
                rows={3}
              />
            </Card>

            <Card style={{ padding: 0 }}>
              <div
                style={{
                  padding: isPhone ? '16px 16px 12px' : '20px 24px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    flexWrap: 'wrap',
                  }}
                >
                  <SectionTitle step={2} data-tour="receipt-lines-title">
                    {t('receipt.form.stepItems')}
                  </SectionTitle>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span
                      aria-live="polite"
                      style={{
                        fontSize: '12px',
                        fontWeight: 600,
                        padding: '3px 10px',
                        borderRadius: '999px',
                        color: theme.textSecondary,
                        background: theme.bgCanvas,
                        border: `1px solid ${theme.border}`,
                      }}
                    >
                      {t('receipt.form.itemsSelectedOf', {
                        selected: totals.selectedCount,
                        total: totals.itemCount,
                      })}
                    </span>
                    <ActionButton
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setLines(selectAllLines)
                      }}
                    >
                      {t('receipt.form.selectAll')}
                    </ActionButton>
                    <ActionButton
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setLines(clearLines)
                      }}
                    >
                      {t('receipt.form.clearSelection')}
                    </ActionButton>
                  </div>
                </div>
                <div style={{ fontSize: '13px', color: theme.textSecondary }}>
                  {t('receipt.form.itemsHint')}
                </div>
              </div>
              <div style={{ padding: isPhone ? '0 12px 12px' : '0 16px 16px' }}>
                <ReceiptLinesTable
                  lines={lines}
                  loading={poLoading}
                  receiveAll={receiveAll}
                  employees={employees}
                  lineReceivers={lineReceivers}
                  onToggle={(poLineId, checked) => {
                    setLines((prev) => prev.map((l) => (l.po_line_id === poLineId ? selectLine(l, checked) : l)))
                  }}
                  onQty={(poLineId, value) => {
                    setLines((prev) =>
                      prev.map((l) => (l.po_line_id === poLineId ? { ...l, qty_to_receive: value } : l)),
                    )
                  }}
                  onReceiver={(poLineId, employeeId) => {
                    if (!employeeId) {
                      setLineReceivers((prev) => {
                        const next = { ...prev }
                        Reflect.deleteProperty(next, poLineId)
                        return next
                      })
                      return
                    }
                    const emp = employees.find((e) => e.id === employeeId)
                    setLineReceivers((prev) => ({
                      ...prev,
                      [poLineId]: {
                        id: employeeId,
                        name: emp ? `${emp.first_name} ${emp.last_name}` : '',
                      },
                    }))
                  }}
                />
              </div>
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

                <Card
                  style={{
                    padding: isPhone ? '16px' : '24px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: isPhone ? '14px' : '18px',
                  }}
                >
                  <SectionTitle step={3}>{t('receipt.form.stepProof')}</SectionTitle>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))',
                      gap: '16px',
                      alignItems: 'start',
                    }}
                  >
                    {proofTile(
                      'vendor_receipt',
                      buyerReceiptOnFile
                        ? t('receipt.form.vendorReceiptOnFile')
                        : t('receipt.form.vendorReceiptRequired'),
                      buyerReceiptOnFile
                        ? t('receipt.form.vendorReceiptOnFileHint')
                        : t('receipt.form.photoScanOrPdfOfThe'),
                      'po-jobsite-photos',
                    )}
                    {proofTile(
                      'materials',
                      t('receipt.form.materialsDeliveredRequired'),
                      t('receipt.form.photoOfTheDeliveredGoodsAt'),
                    )}
                  </div>
                  {isSystemAdmin && (
                    <AdminPhotoBypass
                      enabled={bypassPhotos}
                      reason={bypassReason}
                      onEnabledChange={setBypassPhotos}
                      onReasonChange={setBypassReason}
                    />
                  )}
                </Card>
              </>
            )}
          </div>

          {/* Right column: what is being received, and what the form still needs. Stays in view beside a long list. */}
          <div style={{ flex: '1 1 300px', minWidth: 0, display: 'flex' }}>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '20px',
                width: '100%',
                alignSelf: 'flex-start',
                position: isPhone ? 'static' : 'sticky',
                top: '20px',
              }}
            >
              <Card style={{ padding: isPhone ? '16px' : '24px' }}>
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: '15px',
                    color: theme.textPrimary,
                    marginBottom: '16px',
                  }}
                >
                  {t('receipt.form.receiptSummary')}
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '10px',
                    marginBottom: '16px',
                  }}
                >
                  {[
                    { label: t('receipt.form.items'), value: totals.itemCount.toLocaleString() },
                    {
                      label: t('receipt.form.orderedQty'),
                      value: totals.orderedQtyTotal.toLocaleString(),
                    },
                    {
                      label: t('receipt.form.receivedQty'),
                      value: totals.alreadyCoveredQty.toLocaleString(),
                      color: theme.success,
                    },
                    {
                      label: t('receipt.form.remainingQty'),
                      value: totals.remainingAfterQty.toLocaleString(),
                      color: theme.warning,
                    },
                  ].map((kpi) => (
                    <div
                      key={kpi.label}
                      style={{
                        padding: isPhone ? '10px 12px' : '14px',
                        borderRadius: '10px',
                        background: theme.bgCanvas,
                        border: `1px solid ${theme.border}`,
                        minWidth: 0,
                      }}
                    >
                      <div
                        style={{
                          fontSize: '12px',
                          fontWeight: 500,
                          color: theme.textSecondary,
                          marginBottom: '6px',
                        }}
                      >
                        {kpi.label}
                      </div>
                      <div
                        style={{
                          fontSize: isPhone ? '18px' : '22px',
                          fontWeight: 700,
                          color: kpi.color ?? theme.textPrimary,
                          lineHeight: 1.2,
                          fontVariantNumeric: 'tabular-nums',
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
                  <span style={{ fontWeight: 600, color: theme.textPrimary }}>
                    {t('receipt.form.receiptProgress')}
                  </span>
                  <span style={{ fontWeight: 700, color: theme.accentSolid }}>
                    {totals.progressPct}%
                  </span>
                </div>
                <div
                  role="progressbar"
                  aria-label={t('receipt.form.receiptProgress')}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={totals.progressPct}
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
                      width: `${totals.progressPct}%`,
                      background: theme.accentSolid,
                      borderRadius: '999px',
                      transition: 'width 0.2s',
                    }}
                  />
                </div>
                <div style={{ fontSize: '12px', color: theme.textSecondary, marginTop: '10px' }}>
                  <Trans
                    i18nKey="receipt.form.youAreReceiving"
                    values={{
                      received: totals.receivingNowQty.toLocaleString(),
                      total: totals.orderedQtyTotal.toLocaleString(),
                    }}
                    components={{ strong: <strong style={{ color: theme.textPrimary }} /> }}
                  />
                </div>
              </Card>

              <RequirementsChecklist
                data-tour="receipt-checklist"
                title={isJobsite ? t('receipt.form.checkTitleDeliver') : t('receipt.form.checkTitleSave')}
                items={checklistItems}
                progressLabel={t('receipt.form.checkProgress', {
                  done: requirements.length - openRequirements.length,
                  total: requirements.length,
                })}
                readyLabel={t('receipt.form.checkReady')}
                doneText={t('receipt.form.checkDone')}
                todoText={t('receipt.form.checkTodo')}
              />
            </div>
          </div>
        </div>

        {/* The one action of the page. Desktop: sticks to the bottom of the window; phone: above the bottom navigation. */}
        <div style={{ marginTop: '20px' }}>
          <StageActionBar
            title={isJobsite ? t('receipt.form.barTitleDeliver') : t('receipt.form.barTitleSave')}
            hint={isJobsite ? t('receipt.form.barHintDeliver') : t('receipt.form.barHintSave')}
            status={
              openRequirements.length > 0 ? (
                <span>
                  {t('receipt.form.checkProgress', {
                    done: requirements.length - openRequirements.length,
                    total: requirements.length,
                  })}
                  {' · '}
                  {t('receipt.form.barNext', { item: requirementLabel(openRequirements[0].id) })}
                </span>
              ) : (
                <span style={{ color: theme.success, fontWeight: 600 }}>
                  {isJobsite ? t('receipt.form.barReadyDeliver') : t('receipt.form.barReadySave')}
                </span>
              )
            }
          >
            <ActionButton
              variant="outline"
              type="button"
              onClick={() => {
                navigate(`/procurement/purchase-orders/${id}`)
              }}
            >
              {t('receipt.form.cancel')}
            </ActionButton>
            <ActionButton
              data-tour="po-mark-delivered-btn"
              variant="solid"
              type="submit"
              loading={submitting}
              icon={isJobsite ? <IconCheckCircle size={16} /> : <IconSave size={16} />}
            >
              {primaryLabel}
            </ActionButton>
          </StageActionBar>
        </div>
      </form>
    </div>
  )
}
