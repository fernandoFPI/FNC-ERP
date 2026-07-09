import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@apollo/client'
import { PURCHASE_ORDER_QUERY } from '../../../graphql/procurement'
import { api } from '../../../lib/axios'
import { apiErrMsg } from '../../../lib/apiError'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { Textarea } from '../../../components/ui/Textarea'
import { useToastStore } from '../../../store/toastStore'

interface POLine {
  id: string
  description: string
  qty: number
  qty_received: number
  unit_price: number
  uom: string
  currency_code?: string
}


interface ReturnItem {
  po_line_id: string
  description: string
  quantity_returned: string
  original_unit_price: number
  assessed_unit_price: string
  damage_notes: string
  max_qty: number
  selected: boolean
}

interface UploadedPhoto {
  file_id: string
  original_filename: string
  size_bytes: number
  previewUrl?: string
}

export default function POReturnForm() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [returnType, setReturnType] = useState<'full_refund' | 'damage'>('full_refund')
  const [notes, setNotes] = useState('')
  const [damageDescription, setDamageDescription] = useState('')
  const [items, setItems] = useState<ReturnItem[]>([])
  const [saving, setSaving] = useState(false)

  // Photo upload state
  const [uploadedPhotos, setUploadedPhotos] = useState<UploadedPhoto[]>([])
  const [uploading, setUploading] = useState(false)

  const { data, loading } = useQuery<{
    purchaseOrder: {
      id: string; po_number: string; vendor_name: string
      currency_code: string; status: string
      lines: POLine[]
    }
  }>(PURCHASE_ORDER_QUERY, { variables: { id }, skip: !id })

  const po = data?.purchaseOrder

  // Strip trailing zeros: 10.0000 → "10", 10.5000 → "10.5"
  const stripZeros = (n: number | string) => String(parseFloat(String(n)))

  // Display format: up to 2 decimal places, no trailing zeros
  const fmtN = (n: number | string) =>
    parseFloat(String(n)).toLocaleString(undefined, { maximumFractionDigits: 2 })

  useEffect(() => {
    if (!po?.lines) return
    setItems(po.lines.map((line) => ({
      po_line_id:          line.id,
      description:         line.description,
      quantity_returned:   '',
      original_unit_price: parseFloat(String(line.unit_price)),
      assessed_unit_price: stripZeros(line.unit_price),
      damage_notes:        '',
      max_qty:             parseFloat(String(line.qty_received ?? line.qty)),
      selected:            false,
    })))
  }, [po])

  // Reset assessed prices when switching to full_refund
  useEffect(() => {
    if (returnType === 'full_refund') {
      setItems((prev) => prev.map((it) => ({
        ...it, assessed_unit_price: stripZeros(it.original_unit_price),
      })))
      setUploadedPhotos([])
    }
  }, [returnType])

  function toggleItem(idx: number) {
    setItems((prev) => prev.map((it, i) =>
      i === idx ? { ...it, selected: !it.selected, quantity_returned: it.selected ? '' : stripZeros(it.max_qty) } : it,
    ))
  }

  function updateItem(idx: number, field: keyof ReturnItem, value: string) {
    setItems((prev) => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it))
  }

  async function handlePhotoUpload(files: FileList) {
    setUploading(true)
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) {
        addToast({ type: 'error', message: `${file.name} is not an image` })
        continue
      }
      try {
        // Request a file record + presigned upload URL
        const initRes = await api.post<{ fileId: string; uploadUrl: string }>('/files/upload-url', {
          filename:  file.name,
          mimeType:  file.type,
          sizeBytes: file.size,
          category: 'po_return_damage_photo',
        })
        const { fileId, uploadUrl } = initRes.data

        // Upload via the proxy endpoint to avoid B2 CORS issues
        await api.post(`/files/${fileId}/content`, file, {
          headers: { 'Content-Type': file.type },
        })

        void uploadUrl // presigned URL available but we use proxy

        const previewUrl = URL.createObjectURL(file)
        setUploadedPhotos((prev) => [
          ...prev,
          { file_id: fileId, original_filename: file.name, size_bytes: file.size, previewUrl },
        ])
        addToast({ type: 'success', message: `${file.name} uploaded` })
      } catch (e) {
        addToast({ type: 'error', message: apiErrMsg(e, `Failed to upload ${file.name}`) })
      }
    }
    setUploading(false)
  }

  function removePhoto(fileId: string) {
    setUploadedPhotos((prev) => prev.filter((p) => p.file_id !== fileId))
  }

  const selectedItems = items.filter((it) => it.selected)

  const totalReturned = selectedItems.reduce((sum, it) => {
    const qty = parseFloat(it.quantity_returned) || 0
    const price = parseFloat(it.assessed_unit_price) || 0
    return sum + qty * price
  }, 0)

  function validate(): string | null {
    if (selectedItems.length === 0) return 'Select at least one item to return'
    for (const it of selectedItems) {
      const qty = parseFloat(it.quantity_returned)
      if (!qty || qty <= 0) return `Enter a valid quantity for "${it.description}"`
      if (qty > it.max_qty) return `Quantity for "${it.description}" cannot exceed ${it.max_qty}`
      if (returnType === 'damage') {
        const assessed = parseFloat(it.assessed_unit_price)
        if (isNaN(assessed) || assessed < 0) return `Enter a valid assessed price for "${it.description}"`
        if (Math.round(assessed * 10000) > Math.round(it.original_unit_price * 10000))
          return `Assessed price for "${it.description}" cannot exceed original price`
      }
    }
    if (returnType === 'damage' && !damageDescription.trim())
      return 'Damage description is required for damage returns'
    if (returnType === 'damage' && uploadedPhotos.length === 0)
      return 'At least one photo of the damaged goods is required'
    return null
  }

  async function handleSave() {
    const err = validate()
    if (err) { addToast({ type: 'error', message: err }); return }

    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        return_type: returnType,
        notes:       notes || undefined,
        damage_description: returnType === 'damage' ? damageDescription : undefined,
        currency_code: po?.currency_code ?? 'IQD',
        items: selectedItems.map((it) => ({
          po_line_id:          it.po_line_id,
          description:         it.description,
          quantity_returned:   parseFloat(it.quantity_returned),
          original_unit_price: it.original_unit_price,
          assessed_unit_price: returnType === 'full_refund'
            ? it.original_unit_price
            : parseFloat(it.assessed_unit_price),
          damage_notes: it.damage_notes || undefined,
        })),
      }

      const r = await api.post<{ id: string; return_number: string }>(
        `/procurement/purchase-orders/${id}/returns`, payload,
      )

      // Attach uploaded photos to the return
      if (uploadedPhotos.length > 0) {
        await Promise.all(uploadedPhotos.map((p) =>
          api.post('/files/attach', {
            fileId:     p.file_id,
            entityType: 'po_return',
            entityId:   r.data.id,
          }).catch(() => {}),
        ))
      }

      addToast({ type: 'success', message: `Return ${r.data.return_number} created` })
      navigate(`/procurement/purchase-orders/${id}/returns/${r.data.id}`)
    } catch (e) {
      addToast({ type: 'error', message: apiErrMsg(e, 'Failed to create return') })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center', color: theme.textMuted }}>Loading PO…</div>
  }
  if (!po) {
    return <div style={{ padding: '40px', textAlign: 'center', color: theme.danger }}>Purchase order not found.</div>
  }
  if (!['received', 'invoiced', 'completed'].includes(po.status)) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: theme.danger }}>
        Returns can only be created for received, invoiced, or completed POs.
      </div>
    )
  }

  const cardStyle = {
    background: theme.bgSurface,
    border: `1px solid ${theme.border}`,
    borderRadius: '10px',
    padding: '20px',
    marginBottom: '16px',
  }
  const labelStyle: React.CSSProperties = {
    fontSize: '11px', fontWeight: 600, color: theme.textMuted,
    textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px', display: 'block',
  }

  return (
    <div style={{ maxWidth: '820px', margin: '0 auto' }}>
      <PageHeader
        title="Create PO Return"
        subtitle={`${po.po_number} · ${po.vendor_name}`}
        backPath={`/procurement/purchase-orders/${id}`}
      />

      {/* Return type selector */}
      <div style={cardStyle}>
        <div style={{ ...labelStyle }}>Return Type</div>
        <div style={{ display: 'flex', gap: '12px' }}>
          {(['full_refund', 'damage'] as const).map((type) => {
            const active = returnType === type
            return (
              <button
                key={type}
                type="button"
                onClick={() => setReturnType(type)}
                style={{
                  flex: 1, padding: '14px 16px', borderRadius: '8px',
                  border: `2px solid ${active ? theme.accent : theme.border}`,
                  background: active ? theme.accentBg : theme.bgCanvas,
                  cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: '13px', color: active ? theme.accent : theme.textPrimary }}>
                  {type === 'full_refund' ? '↩ Full Refund' : '⚠ Damage Return'}
                </div>
                <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '4px' }}>
                  {type === 'full_refund'
                    ? 'Item returned in good condition — vendor refunds full purchase price'
                    : 'Item was damaged — vendor credit at assessed/negotiated price'}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── DAMAGE-ONLY SECTIONS ─────────────────────────────────────── */}
      {returnType === 'damage' && (
        <>
          {/* Damage description */}
          <div style={cardStyle}>
            <label style={labelStyle}>Damage Report Description *</label>
            <Textarea
              value={damageDescription}
              onChange={(e) => setDamageDescription(e.target.value)}
              placeholder="Describe the damage in detail — what happened, extent of damage, condition on return…"
              rows={4}
            />
          </div>

          {/* Photo upload */}
          <div style={cardStyle}>
            <label style={labelStyle}>
              Photos of Damaged Goods *
              <span style={{ color: theme.danger, marginLeft: '2px' }}>required</span>
            </label>

            {/* Upload button */}
            <div
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${uploadedPhotos.length === 0 ? theme.danger : theme.accent}`,
                borderRadius: '8px', padding: '24px', textAlign: 'center', cursor: 'pointer',
                background: theme.bgCanvas, marginBottom: uploadedPhotos.length > 0 ? '14px' : '0',
                transition: 'border-color 0.15s',
              }}
            >
              <div style={{ fontSize: '24px', marginBottom: '6px' }}>📷</div>
              <div style={{ fontSize: '13px', color: theme.textPrimary, fontWeight: 500 }}>
                {uploading ? 'Uploading…' : 'Click to upload photos'}
              </div>
              <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '4px' }}>
                JPG, PNG, WEBP · Multiple files allowed
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => { if (e.target.files?.length) void handlePhotoUpload(e.target.files) }}
            />

            {/* Photo thumbnails */}
            {uploadedPhotos.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                {uploadedPhotos.map((photo) => (
                  <div
                    key={photo.file_id}
                    style={{
                      position: 'relative', width: '90px', height: '90px',
                      borderRadius: '8px', overflow: 'hidden',
                      border: `1px solid ${theme.border}`,
                    }}
                  >
                    {photo.previewUrl ? (
                      <img
                        src={photo.previewUrl}
                        alt={photo.original_filename}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <div style={{
                        width: '100%', height: '100%', display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        background: theme.bgSurface, fontSize: '10px', color: theme.textMuted,
                        padding: '4px', textAlign: 'center',
                      }}>
                        {photo.original_filename}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => removePhoto(photo.file_id)}
                      style={{
                        position: 'absolute', top: '3px', right: '3px',
                        width: '20px', height: '20px', borderRadius: '50%',
                        background: 'rgba(0,0,0,0.6)', border: 'none',
                        color: '#fff', fontSize: '11px', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{
            ...cardStyle, background: '#fffbeb', border: '1px solid #fcd34d',
          }}>
            <div style={{ fontSize: '12px', color: '#92400e' }}>
              <strong>Note:</strong> Employee responsibility and salary deduction will be assigned by the approver (Finance / HR) after submission.
            </div>
          </div>
        </>
      )}

      {/* Item selection */}
      <div style={cardStyle}>
        <div style={{ ...labelStyle, marginBottom: '12px' }}>Select Items to Return</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {items.map((item, idx) => (
            <div
              key={item.po_line_id}
              style={{
                border: `1px solid ${item.selected ? theme.accent : theme.border}`,
                borderRadius: '8px', padding: '14px',
                background: item.selected ? theme.accentBg : theme.bgCanvas,
                transition: 'border-color 0.15s, background 0.15s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: item.selected ? '14px' : '0' }}>
                <input
                  type="checkbox"
                  checked={item.selected}
                  onChange={() => toggleItem(idx)}
                  style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: theme.accent }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13px', fontWeight: 500, color: theme.textPrimary }}>
                    {item.description}
                  </div>
                  <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '2px' }}>
                    Max returnable: {fmtN(item.max_qty)} &nbsp;·&nbsp;
                    Original price: {po.currency_code} {fmtN(item.original_unit_price)}
                  </div>
                </div>
              </div>

              {item.selected && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={labelStyle}>Quantity to Return</label>
                    <Input
                      type="number"
                      min={0.001}
                      max={item.max_qty}
                      step="any"
                      value={item.quantity_returned}
                      onChange={(e) => updateItem(idx, 'quantity_returned', e.target.value)}
                      placeholder={`Max ${item.max_qty}`}
                    />
                  </div>

                  {returnType === 'damage' && (
                    <div>
                      <label style={labelStyle}>
                        Assessed Unit Price ({po.currency_code})
                        <span style={{ fontWeight: 400, textTransform: 'none', marginLeft: '4px' }}>
                          ≤ {fmtN(item.original_unit_price)}
                        </span>
                      </label>
                      <Input
                        type="number"
                        min={0}
                        max={item.original_unit_price}
                        step="any"
                        value={item.assessed_unit_price}
                        onChange={(e) => updateItem(idx, 'assessed_unit_price', e.target.value)}
                      />
                    </div>
                  )}

                  {returnType === 'damage' && (
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={labelStyle}>Item-Level Damage Notes (optional)</label>
                      <Input
                        value={item.damage_notes}
                        onChange={(e) => updateItem(idx, 'damage_notes', e.target.value)}
                        placeholder="Specific damage notes for this item…"
                      />
                    </div>
                  )}

                  <div style={{ gridColumn: '1 / -1', paddingTop: '4px', borderTop: `1px solid ${theme.border}` }}>
                    <span style={{ fontSize: '11px', color: theme.textMuted }}>Line return value: </span>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: theme.accent }}>
                      {po.currency_code}{' '}
                      {fmtN(
                        (parseFloat(item.quantity_returned) || 0) *
                        (returnType === 'full_refund' ? item.original_unit_price : (parseFloat(item.assessed_unit_price) || 0))
                      )}
                    </span>
                    {returnType === 'damage' && parseFloat(item.quantity_returned) > 0 && (
                      <span style={{ fontSize: '11px', color: theme.danger, marginLeft: '12px' }}>
                        Loss: {po.currency_code}{' '}
                        {fmtN(
                          (parseFloat(item.quantity_returned) || 0) *
                          (item.original_unit_price - (parseFloat(item.assessed_unit_price) || 0))
                        )}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}

          {items.length === 0 && (
            <div style={{ color: theme.textMuted, fontSize: '13px', padding: '12px 0' }}>
              No received items found on this PO.
            </div>
          )}
        </div>
      </div>

      {/* Notes */}
      <div style={cardStyle}>
        <label style={labelStyle}>General Notes (optional)</label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Any additional notes about this return…"
          rows={3}
        />
      </div>

      {/* Summary + submit */}
      <div style={{
        ...cardStyle, marginBottom: '40px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: selectedItems.length > 0 ? theme.accentBg : theme.bgSurface,
        border: `1px solid ${selectedItems.length > 0 ? theme.accent : theme.border}`,
      }}>
        <div>
          <div style={{ fontSize: '12px', color: theme.textMuted }}>
            {selectedItems.length} item{selectedItems.length !== 1 ? 's' : ''} selected
            {returnType === 'damage' && uploadedPhotos.length > 0 && (
              <span style={{ marginLeft: '8px' }}>· {uploadedPhotos.length} photo{uploadedPhotos.length !== 1 ? 's' : ''} attached</span>
            )}
          </div>
          {selectedItems.length > 0 && (
            <div style={{ fontSize: '16px', fontWeight: 700, color: theme.accent, marginTop: '2px' }}>
              Total Return Value: {po.currency_code} {fmtN(totalReturned)}
            </div>
          )}
          {returnType === 'damage' && uploadedPhotos.length === 0 && (
            <div style={{ fontSize: '11px', color: theme.danger, marginTop: '4px' }}>
              ⚠ Photo upload required for damage return
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <Button variant="secondary" onClick={() => navigate(`/procurement/purchase-orders/${id}`)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={saving || uploading}
            disabled={selectedItems.length === 0}
            onClick={() => void handleSave()}
          >
            Create Return
          </Button>
        </div>
      </div>
    </div>
  )
}
