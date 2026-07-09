import { useState, useRef, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@apollo/client'
import { api } from '../../../lib/axios'
import { apiErrMsg } from '../../../lib/apiError'
import { PURCHASE_ORDER_QUERY, RECORD_RECEIPT, ATTACH_RECEIPT_PHOTO } from '../../../graphql/procurement'
import { STOCK_LOCATIONS_QUERY } from '../../../graphql/inventory'
import { EMPLOYEES_QUERY } from '../../../graphql/hr'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { Select } from '../../../components/ui/Select'
import { SearchableSelect } from '../../../components/ui/SearchableSelect'
import { Textarea } from '../../../components/ui/Textarea'
import { useToastStore } from '../../../store/toastStore'
import { useAuthStore } from '../../../store/authStore'

interface ReceiptLine {
  po_line_id: string
  description: string
  ordered_qty: number
  qty_received_so_far: number
  qty_to_receive: string
}

interface PendingPhoto {
  file: File
  previewUrl: string
  label: string
  uploading: boolean
  error?: string
}

export default function ReceiptForm() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const currentUser = useAuthStore((s) => s.user)

  const [form, setForm] = useState({
    receipt_date: new Date().toISOString().split('T')[0],
    location_id: '',
    notes: '',
    received_by_id: '',
    received_by_name: '',
    location_notes: '',
  })
  const [lines, setLines] = useState<ReceiptLine[]>([])
  const [initialized, setInitialized] = useState(false)
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [savedReceiptId, setSavedReceiptId] = useState<string | null>(null)

  const { data: poData } = useQuery(PURCHASE_ORDER_QUERY, { variables: { id }, skip: !id })

  useEffect(() => {
    if (poData?.purchaseOrder && !initialized) {
      setLines(poData.purchaseOrder.lines.map((l: { id: string; description?: string; qty: string; qty_received?: string }) => ({
        po_line_id: l.id,
        description: l.description ?? '',
        ordered_qty: parseFloat(l.qty),
        qty_received_so_far: parseFloat(l.qty_received ?? '0'),
        qty_to_receive: String(Math.max(0, parseFloat(l.qty) - parseFloat(l.qty_received ?? '0'))),
      })))
      // Pre-fill receiver from PO's designated receiver if set
      const poReceiverName = poData.purchaseOrder.assigned_receiver_name as string | null
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
  }, [poData, initialized])

  const { data: locationsData } = useQuery(STOCK_LOCATIONS_QUERY, { variables: { isActive: true } })
  const { data: employeesData } = useQuery(EMPLOYEES_QUERY, { variables: { is_active: true } })
  const [recordReceipt] = useMutation(RECORD_RECEIPT)
  const [attachReceiptPhoto] = useMutation(ATTACH_RECEIPT_PHOTO)

  const po = poData?.purchaseOrder
  const locations = locationsData?.stockLocations ?? []
  const employees: Array<{ id: string; first_name: string; last_name: string; employee_number: string; user_id?: string }> = employeesData?.employees ?? []

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
      setForm((f) => ({ ...f, received_by_id: matched.id, received_by_name: `${matched.first_name} ${matched.last_name}` }))
    }
  }, [employees, currentUser?.id])

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    const newPhotos: PendingPhoto[] = files.map((f) => ({
      file: f,
      previewUrl: URL.createObjectURL(f),
      label: '',
      uploading: false,
    }))
    setPendingPhotos((prev) => [...prev, ...newPhotos])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function removePhoto(idx: number) {
    setPendingPhotos((prev) => {
      URL.revokeObjectURL(prev[idx]!.previewUrl)
      return prev.filter((_, i) => i !== idx)
    })
  }

  async function uploadPhoto(photo: PendingPhoto): Promise<string> {
    // Step 1: register the file and get a fileId
    const regResp = await api.post<{ fileId: string }>('/files/upload-url', {
      filename: photo.file.name,
      mimeType: photo.file.type || 'image/jpeg',
      sizeBytes: photo.file.size,
      category: 'po_receipt_photo',
    })
    const { fileId } = regResp.data
    // Step 2: POST binary to gateway proxy — no CORS issue
    await api.post(`/files/${fileId}/content`, photo.file, {
      headers: { 'Content-Type': photo.file.type || 'image/jpeg' },
    })
    return fileId
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.received_by_name.trim()) { addToast({ type: 'error', message: 'Please select who received the goods' }); return }
    if (pendingPhotos.length === 0) { addToast({ type: 'error', message: 'At least one photo is required' }); return }
    setSubmitting(true)
    try {
      // If the receipt was already saved (photo retry), skip re-recording
      let receiptId = savedReceiptId
      if (!receiptId) {
        const { data: receiptData } = await recordReceipt({
          variables: {
            poId: id,
            input: {
              receipt_date: form.receipt_date,
              location_id: form.location_id || undefined,
              notes: form.notes || undefined,
              received_by_name: form.received_by_name,
              location_notes: form.location_notes || undefined,
              lines: lines
                .filter((l) => parseFloat(l.qty_to_receive) > 0)
                .map((l) => ({ po_line_id: l.po_line_id, qty_received: parseFloat(l.qty_to_receive) })),
            },
          },
          refetchQueries: [{ query: PURCHASE_ORDER_QUERY, variables: { id } }],
        })
        receiptId = receiptData.recordReceipt.id as string
        setSavedReceiptId(receiptId)
      }

      // Upload photos sequentially. On a retry (savedReceiptId already set), skip photos
      // that previously succeeded (no error). Only re-attempt ones still showing an error.
      let photosFailed = 0
      for (let i = 0; i < pendingPhotos.length; i++) {
        const photo = pendingPhotos[i]!
        if (savedReceiptId && !photo.error) continue // already uploaded successfully
        setPendingPhotos((prev) => prev.map((p, idx) => idx === i ? { ...p, uploading: true, error: undefined } : p))
        try {
          const fileId = await uploadPhoto(photo)
          await attachReceiptPhoto({
            variables: { receiptId, fileId, label: photo.label || undefined },
          })
          setPendingPhotos((prev) => prev.map((p, idx) => idx === i ? { ...p, uploading: false } : p))
        } catch (photoErr) {
          photosFailed++
          setPendingPhotos((prev) => prev.map((p, idx) => idx === i ? { ...p, uploading: false, error: apiErrMsg(photoErr, 'Upload failed') } : p))
          addToast({ type: 'error', message: `Photo ${i + 1} failed: ${apiErrMsg(photoErr, 'Upload failed')}` })
        }
      }

      if (photosFailed > 0) {
        addToast({ type: 'error', message: `Receipt saved but ${photosFailed} photo${photosFailed > 1 ? 's' : ''} failed to upload. Fix the errors above and re-submit the failed photos.` })
        // Don't navigate — let user see which photos failed and retry
        return
      }

      addToast({ type: 'success', message: 'Receipt recorded' })
      navigate(`/procurement/purchase-orders/${id}`)
    } catch (err) {
      addToast({ type: 'error', message: apiErrMsg(err, 'Save failed') })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1000px' }}>
      <PageHeader
        title={`Record Receipt — ${po?.po_number ?? ''}`}
        subtitle={`Vendor: ${po?.vendor_name ?? ''}`}
        backPath={`/procurement/purchase-orders/${id}`}
      />

      <form onSubmit={handleSubmit}>
        <Card style={{ marginTop: '20px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ fontWeight: 600, color: theme.textPrimary, marginBottom: '4px' }}>Receipt Details</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
            <Input label="Receipt Date" type="date" value={form.receipt_date} onChange={(e) => setForm((f) => ({ ...f, receipt_date: e.target.value }))} required />
            <Select label="Receiving Location (optional)" value={form.location_id} onChange={(e) => setForm((f) => ({ ...f, location_id: e.target.value }))}>
              <option value="">Select location…</option>
              {locations.map((l: { id: string; name: string; code?: string }) => (
                <option key={l.id} value={l.id}>{l.name}{l.code ? ` (${l.code})` : ''}</option>
              ))}
            </Select>
            <div>
              <SearchableSelect
                label="Received By *"
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
                  Auto-selected — change if someone else received the goods
                </div>
              )}
            </div>
          </div>
          <Input
            label="Location / Jobsite Notes"
            placeholder="e.g. Site B, Floor 3, Gate 2 — describe where goods were delivered"
            value={form.location_notes}
            onChange={(e) => setForm((f) => ({ ...f, location_notes: e.target.value }))}
          />
          <Textarea label="Notes" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} />
        </Card>

        <Card style={{ marginTop: '16px', padding: '20px' }}>
          <div style={{ fontWeight: 600, color: theme.textPrimary, marginBottom: '12px' }}>Photos (required)</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '12px' }}>
            {pendingPhotos.map((photo, idx) => (
              <div key={idx} style={{ position: 'relative', width: '140px' }}>
                <img
                  src={photo.previewUrl}
                  alt={`photo-${idx}`}
                  style={{ width: '140px', height: '100px', objectFit: 'cover', borderRadius: '6px', border: `1px solid ${theme.border}` }}
                />
                {photo.uploading && (
                  <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '12px' }}>
                    Uploading…
                  </div>
                )}
                {photo.error && (
                  <div style={{ position: 'absolute', inset: 0, background: 'rgba(200,0,0,0.5)', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '11px', padding: '4px', textAlign: 'center' }}>
                    {photo.error}
                  </div>
                )}
                <Input
                  placeholder="Caption (optional)"
                  value={photo.label}
                  onChange={(e) => setPendingPhotos((prev) => prev.map((p, i) => i === idx ? { ...p, label: e.target.value } : p))}
                  style={{ marginTop: '4px', fontSize: '11px', padding: '4px 6px' }}
                />
                <button
                  type="button"
                  onClick={() => removePhoto(idx)}
                  style={{ position: 'absolute', top: '4px', right: '4px', background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: '50%', color: '#fff', width: '20px', height: '20px', cursor: 'pointer', fontSize: '12px', lineHeight: '20px', textAlign: 'center', padding: 0 }}
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              style={{ width: '140px', height: '100px', border: `2px dashed ${theme.border}`, borderRadius: '6px', cursor: 'pointer', background: 'transparent', color: theme.textMuted, fontSize: '13px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
            >
              <span style={{ fontSize: '24px' }}>+</span>
              <span>Add Photo</span>
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={handleFileSelect}
          />
          <div style={{ fontSize: '12px', color: theme.textMuted }}>
            At least one photo is required. Capture the delivered goods, packaging labels, or delivery location.
          </div>
        </Card>

        <Card style={{ marginTop: '16px' }}>
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${theme.border}`, fontWeight: 600, color: theme.textPrimary }}>Lines</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: theme.bgSurface }}>
                {['Description', 'Ordered', 'Received', 'To Receive'].map((h) => (
                  <th key={h} style={{ padding: '8px 16px', textAlign: 'left', fontWeight: 600, fontSize: '11px', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: `1px solid ${theme.border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map((line, i) => (
                <tr key={line.po_line_id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                  <td style={{ padding: '8px 16px', color: theme.textSecondary }}>{line.description}</td>
                  <td style={{ padding: '8px 16px', fontFamily: 'monospace', color: theme.textPrimary }}>{line.ordered_qty.toLocaleString()}</td>
                  <td style={{ padding: '8px 16px', fontFamily: 'monospace', color: theme.textMuted }}>{line.qty_received_so_far.toLocaleString()}</td>
                  <td style={{ padding: '8px 16px' }}>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.qty_to_receive}
                      onChange={(e) => setLines((prev) => prev.map((l, idx) => idx === i ? { ...l, qty_to_receive: e.target.value } : l))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '16px' }}>
          <Button variant="ghost" type="button" onClick={() => navigate(`/procurement/purchase-orders/${id}`)}>Cancel</Button>
          <Button variant="primary" type="submit" loading={submitting}>Record Receipt</Button>
        </div>
      </form>
    </div>
  )
}
