import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from '../../../components/ui/Modal'
import { Input } from '../../../components/ui/Input'
import { SearchableSelect } from '../../../components/ui/SearchableSelect'
import { Textarea } from '../../../components/ui/Textarea'
import { ActionButton } from '../../../components/ui/ActionButton'
import { useTheme } from '../../../theme/ThemeContext'

export interface TransferLocation {
  id: string
  name: string
  code?: string | null
  type?: string | null
}
export interface TransferProduct {
  id: string
  name: string
  sku: string
  name_ar?: string | null
}
export interface TransferLineDraft {
  productId: string
  qty: string
  remarks: string
}
export interface TransferDraft {
  fromLocationId: string
  toLocationId: string
  lines: TransferLineDraft[]
}
export interface TransferPayload {
  fromLocationId: string
  toLocationId: string
  transferDate: string
  driverName?: string
  vehicleNo?: string
  waybillNo?: string
  reference?: string
  notes?: string
  lines: { productId: string; qty: number; remarks?: string }[]
}

/** The kinds of place stock can be sent from or to. Same list as the server (lib/storeTransfers.ts), which is the authority. */
const ENDPOINT_TYPES = ['warehouse', 'site', 'temporary']

const emptyLine = (): TransferLineDraft => ({ productId: '', qty: '', remarks: '' })

/**
 * New transfer: where from, where to, the truck, and the items. Sending takes the stock out of the From store at once and it
 * stays in transit until the other end receives it. The page can open it prefilled from the items ticked in a temporary store.
 */
export function TransferDialog({
  open,
  onClose,
  locations,
  products,
  initial,
  saving,
  onSend,
}: {
  open: boolean
  onClose: () => void
  locations: TransferLocation[]
  products: TransferProduct[]
  initial: TransferDraft | null
  saving: boolean
  onSend: (payload: TransferPayload) => void
}) {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const today = new Date().toISOString().slice(0, 10)
  const [fromId, setFromId] = useState('')
  const [toId, setToId] = useState('')
  const [date, setDate] = useState(today)
  const [driver, setDriver] = useState('')
  const [vehicle, setVehicle] = useState('')
  const [waybill, setWaybill] = useState('')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<TransferLineDraft[]>([emptyLine()])
  const wasOpen = useRef(false)

  // Each time the dialog opens it starts from what the page gave it (or empty): nothing typed last time leaks into the next.
  useEffect(() => {
    if (open && !wasOpen.current) {
      setFromId(initial?.fromLocationId ?? '')
      setToId(initial?.toLocationId ?? '')
      setDate(new Date().toISOString().slice(0, 10))
      setDriver('')
      setVehicle('')
      setWaybill('')
      setReference('')
      setNotes('')
      setLines(initial && initial.lines.length > 0 ? initial.lines : [emptyLine()])
    }
    wasOpen.current = open
  }, [open, initial])

  const places = locations
    .filter((l) => ENDPOINT_TYPES.includes(l.type ?? ''))
    .map((l) => ({
      value: l.id,
      label: `${l.name}${l.code ? ` (${l.code})` : ''}${l.type === 'temporary' ? ` · ${t('receipt.form.temporaryTag')}` : ''}`,
    }))
  const productOptions = products.map((p) => ({
    value: p.id,
    label: p.name,
    sublabel: p.sku,
    keywords: p.name_ar ?? undefined,
  }))

  const usable = lines.filter((l) => l.productId !== '' && parseFloat(l.qty) > 0)
  const ready = fromId !== '' && toId !== '' && fromId !== toId && usable.length > 0 && !saving

  function setLine(i: number, patch: Partial<TransferLineDraft>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  }

  function send() {
    if (!ready) return
    onSend({
      fromLocationId: fromId,
      toLocationId: toId,
      transferDate: date,
      driverName: driver.trim() || undefined,
      vehicleNo: vehicle.trim() || undefined,
      waybillNo: waybill.trim() || undefined,
      reference: reference.trim() || undefined,
      notes: notes.trim() || undefined,
      lines: usable.map((l) => ({
        productId: l.productId,
        qty: parseFloat(l.qty),
        remarks: l.remarks.trim() || undefined,
      })),
    })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeOnBackdrop={false}
      title={t('inv.transit.transferDialogTitle')}
      description={t('inv.transit.transferDialogHint')}
      size="lg"
      footer={
        <>
          <ActionButton variant="outline" onClick={onClose}>
            {t('inv.transit.cancel')}
          </ActionButton>
          <ActionButton variant="solid" disabled={!ready} loading={saving} onClick={send}>
            {t('inv.transit.send')}
          </ActionButton>
        </>
      }
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: '14px',
        }}
      >
        <SearchableSelect
          field
          label={t('inv.transit.from')}
          value={fromId}
          onChange={setFromId}
          options={places}
          placeholder={t('inv.transit.selectStore')}
        />
        <SearchableSelect
          field
          label={t('inv.transit.to')}
          value={toId}
          onChange={setToId}
          options={places.filter((p) => p.value !== fromId)}
          placeholder={t('inv.transit.selectStore')}
        />
        <Input
          field
          label={t('inv.transit.date')}
          type="date"
          value={date}
          onChange={(e) => {
            setDate(e.target.value)
          }}
        />
        <Input
          field
          label={t('inv.transit.driver')}
          value={driver}
          maxLength={200}
          onChange={(e) => {
            setDriver(e.target.value)
          }}
        />
        <Input
          field
          label={t('inv.transit.vehicle')}
          value={vehicle}
          maxLength={100}
          onChange={(e) => {
            setVehicle(e.target.value)
          }}
        />
        <Input
          field
          label={t('inv.transit.waybill')}
          value={waybill}
          maxLength={100}
          onChange={(e) => {
            setWaybill(e.target.value)
          }}
        />
        <Input
          field
          label={t('inv.transit.reference')}
          value={reference}
          maxLength={200}
          onChange={(e) => {
            setReference(e.target.value)
          }}
        />
      </div>

      <div style={{ marginTop: '18px' }}>
        <div
          style={{
            fontSize: '12px',
            fontWeight: 600,
            color: theme.textSecondary,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            marginBottom: '8px',
          }}
        >
          {t('inv.transit.itemsTitle')}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {lines.map((l, i) => (
            <div
              key={i}
              data-testid="transfer-line"
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(220px, 2fr) 110px minmax(140px, 1fr) auto',
                gap: '10px',
                alignItems: 'flex-end',
              }}
            >
              <SearchableSelect
                field
                label={t('inv.transit.item')}
                value={l.productId}
                onChange={(v) => {
                  setLine(i, { productId: v })
                }}
                options={productOptions}
                placeholder={t('inv.transit.searchItem')}
                minDropdownWidth={380}
              />
              <Input
                field
                label={t('inv.transit.qty')}
                type="number"
                min={0}
                step="any"
                value={l.qty}
                onChange={(e) => {
                  setLine(i, { qty: e.target.value })
                }}
              />
              <Input
                field
                label={t('inv.transit.remarks')}
                value={l.remarks}
                maxLength={500}
                onChange={(e) => {
                  setLine(i, { remarks: e.target.value })
                }}
              />
              <ActionButton
                variant="ghost"
                size="sm"
                ariaLabel={t('inv.transit.removeLine')}
                disabled={lines.length === 1}
                onClick={() => {
                  setLines((prev) => prev.filter((_, idx) => idx !== i))
                }}
              >
                ✕
              </ActionButton>
            </div>
          ))}
        </div>
        <div style={{ marginTop: '10px' }}>
          <ActionButton
            variant="outline"
            size="sm"
            onClick={() => {
              setLines((prev) => [...prev, emptyLine()])
            }}
          >
            {t('inv.transit.addLine')}
          </ActionButton>
        </div>
      </div>

      <div style={{ marginTop: '14px' }}>
        <Textarea
          field
          label={t('inv.transit.notes')}
          value={notes}
          rows={2}
          onChange={(e) => {
            setNotes(e.target.value)
          }}
        />
      </div>
    </Modal>
  )
}
