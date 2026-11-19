import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from '../../../components/ui/Modal'
import { Input } from '../../../components/ui/Input'
import { ActionButton } from '../../../components/ui/ActionButton'
import { useTheme } from '../../../theme/ThemeContext'

export interface ReceivableTransfer {
  id: string
  transferNumber: string
  transferDate: string
  fromLocationName?: string | null
  toLocationName?: string | null
  lines: {
    id: string
    productName?: string | null
    sku?: string | null
    uom?: string | null
    qtySent: number
  }[]
}

export interface ReceivePayload {
  receivedDate: string
  receivedByName?: string
  lines: { lineId: string; qtyReceived: number; remarks?: string }[]
}

const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 4 })

/**
 * Confirm what arrived. Every item starts as "all of it"; a smaller number is a shortage, which needs a remark (what did not
 * arrive is written off with it). The server repeats every check.
 */
export function ReceiveTransferDialog({
  transfer,
  saving,
  onClose,
  onReceive,
}: {
  transfer: ReceivableTransfer | null
  saving: boolean
  onClose: () => void
  onReceive: (id: string, payload: ReceivePayload) => void
}) {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [by, setBy] = useState('')
  const [got, setGot] = useState<Record<string, string>>({})
  const [remarks, setRemarks] = useState<Record<string, string>>({})
  const openedFor = useRef<string | null>(null)

  useEffect(() => {
    if (transfer && openedFor.current !== transfer.id) {
      setDate(new Date().toISOString().slice(0, 10))
      setBy('')
      setGot(Object.fromEntries(transfer.lines.map((l) => [l.id, String(l.qtySent)])))
      setRemarks({})
    }
    openedFor.current = transfer?.id ?? null
  }, [transfer])

  if (!transfer) return <Modal open={false} onClose={onClose} title="" children={null} />

  const rows = transfer.lines.map((l) => {
    const qty = parseFloat(got[l.id] ?? '')
    const valid = Number.isFinite(qty) && qty >= 0 && qty <= l.qtySent + 0.0001
    const short = valid && qty < l.qtySent - 0.0001
    const missingRemark = short && (remarks[l.id] ?? '').trim() === ''
    return { line: l, qty, valid, short, missingRemark }
  })
  const shortCount = rows.filter((r) => r.short).length
  const ready = rows.every((r) => r.valid && !r.missingRemark) && !saving

  function confirm() {
    if (!transfer || !ready) return
    onReceive(transfer.id, {
      receivedDate: date,
      receivedByName: by.trim() || undefined,
      lines: rows.map((r) => ({
        lineId: r.line.id,
        qtyReceived: r.qty,
        remarks: (remarks[r.line.id] ?? '').trim() || undefined,
      })),
    })
  }

  return (
    <Modal
      open
      onClose={onClose}
      closeOnBackdrop={false}
      title={t('inv.transit.receiveTitle', { number: transfer.transferNumber })}
      description={t('inv.transit.receiveHint', {
        from: transfer.fromLocationName ?? '',
        to: transfer.toLocationName ?? '',
        date: transfer.transferDate,
      })}
      size="lg"
      footer={
        <>
          <ActionButton variant="outline" onClick={onClose}>
            {t('inv.transit.cancel')}
          </ActionButton>
          <ActionButton variant="solid" disabled={!ready} loading={saving} onClick={confirm}>
            {t('inv.transit.confirmReceipt')}
          </ActionButton>
        </>
      }
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: '14px',
          marginBottom: '16px',
        }}
      >
        <Input
          field
          label={t('inv.transit.receivedDate')}
          type="date"
          value={date}
          onChange={(e) => {
            setDate(e.target.value)
          }}
        />
        <Input
          field
          label={t('inv.transit.receivedBy')}
          value={by}
          maxLength={200}
          onChange={(e) => {
            setBy(e.target.value)
          }}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {rows.map((r) => (
          <div
            key={r.line.id}
            data-testid="receive-line"
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(200px, 2fr) 100px 120px minmax(160px, 2fr)',
              gap: '10px',
              alignItems: 'flex-end',
              padding: '10px 12px',
              borderRadius: '10px',
              border: `1px solid ${r.short ? theme.warningBorder : theme.border}`,
              background: r.short ? theme.warningBg : 'transparent',
            }}
          >
            <div>
              <div style={{ color: theme.textPrimary, fontWeight: 600 }}>
                {r.line.productName ?? '—'}
              </div>
              <div style={{ fontSize: '12px', color: theme.textSecondary }}>{r.line.sku ?? ''}</div>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: theme.textSecondary, marginBottom: '4px' }}>
                {t('inv.transit.colSentQty')}
              </div>
              <div
                style={{
                  fontVariantNumeric: 'tabular-nums',
                  fontWeight: 600,
                  color: theme.textPrimary,
                }}
              >
                {fmt(r.line.qtySent)} {r.line.uom ?? ''}
              </div>
            </div>
            <Input
              field
              label={t('inv.transit.colReceivedQty')}
              type="number"
              min={0}
              max={r.line.qtySent}
              step="any"
              value={got[r.line.id] ?? ''}
              onChange={(e) => {
                setGot((prev) => ({ ...prev, [r.line.id]: e.target.value }))
              }}
              error={got[r.line.id] !== '' && !r.valid ? `0 – ${fmt(r.line.qtySent)}` : undefined}
            />
            <Input
              field
              label={t('inv.transit.colRemarks')}
              value={remarks[r.line.id] ?? ''}
              maxLength={500}
              onChange={(e) => {
                setRemarks((prev) => ({ ...prev, [r.line.id]: e.target.value }))
              }}
              error={r.missingRemark ? t('inv.transit.needRemark') : undefined}
            />
          </div>
        ))}
      </div>

      {shortCount > 0 && (
        <p
          style={{
            margin: '14px 0 0',
            padding: '10px 12px',
            borderRadius: '10px',
            fontSize: '13px',
            color: theme.warning,
            background: theme.warningBg,
            border: `1px solid ${theme.warningBorder}`,
          }}
        >
          {t('inv.transit.shortWarning', { count: shortCount })}
        </p>
      )}
    </Modal>
  )
}
