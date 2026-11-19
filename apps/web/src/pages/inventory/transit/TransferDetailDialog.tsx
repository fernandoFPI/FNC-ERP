import { useTranslation } from 'react-i18next'
import { Modal } from '../../../components/ui/Modal'
import { Badge } from '../../../components/ui/Badge'
import { Table } from '../../../components/ui/Table'
import type { Column } from '../../../components/ui/Table'
import { ActionButton } from '../../../components/ui/ActionButton'
import { useTheme } from '../../../theme/ThemeContext'

export interface DetailTransfer {
  id: string
  transferNumber: string
  transferDate: string
  status: string
  fromLocationName?: string | null
  toLocationName?: string | null
  driverName?: string | null
  vehicleNo?: string | null
  waybillNo?: string | null
  reference?: string | null
  notes?: string | null
  daysInTransit?: number | null
  receivedDate?: string | null
  receivedByName?: string | null
  lines: DetailLine[]
}

interface DetailLine {
  id: string
  productId: string
  productName?: string | null
  sku?: string | null
  uom?: string | null
  qtySent: number
  qtyReceived?: number | null
  remarks?: string | null
  receiveRemarks?: string | null
}

const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 4 })

/** Everything about one store transfer, read-only: who sent it, how it travelled, when it arrived, and every item sent against received. */
export function TransferDetailDialog({
  transfer,
  onClose,
}: {
  transfer: DetailTransfer | null
  onClose: () => void
}) {
  const { t } = useTranslation()
  const { theme } = useTheme()

  const statusBadge = (s: string) =>
    s === 'in_transit' ? (
      <Badge variant="info">{t('inv.transit.statusInTransit')}</Badge>
    ) : s === 'received' ? (
      <Badge variant="success">{t('inv.transit.statusReceived')}</Badge>
    ) : s === 'received_short' ? (
      <Badge variant="warning">{t('inv.transit.statusShort')}</Badge>
    ) : (
      <Badge variant="neutral">{t('inv.transit.statusCancelled')}</Badge>
    )

  const dash = '—'
  const facts: { label: string; value: string | null | undefined }[] = transfer
    ? [
        { label: t('inv.transit.from'), value: transfer.fromLocationName },
        { label: t('inv.transit.to'), value: transfer.toLocationName },
        { label: t('inv.transit.colSent'), value: transfer.transferDate },
        { label: t('inv.transit.colReceived'), value: transfer.receivedDate },
        { label: t('inv.transit.receivedBy'), value: transfer.receivedByName },
        {
          label: t('inv.transit.colDays'),
          value: transfer.daysInTransit == null ? null : String(transfer.daysInTransit),
        },
        { label: t('inv.transit.driver'), value: transfer.driverName },
        { label: t('inv.transit.vehicle'), value: transfer.vehicleNo },
        { label: t('inv.transit.waybill'), value: transfer.waybillNo },
        { label: t('inv.transit.reference'), value: transfer.reference },
      ]
    : []

  const numberStyle = { fontVariantNumeric: 'tabular-nums' } as const
  const columns: Column<DetailLine>[] = [
    {
      key: 'productName',
      header: t('inv.transit.item'),
      render: (l) => (
        <div>
          <div style={{ color: theme.textPrimary, fontWeight: 600 }}>
            {l.productName ?? l.productId}
          </div>
          {l.sku && <div style={{ fontSize: '12px', color: theme.textSecondary }}>{l.sku}</div>}
        </div>
      ),
    },
    {
      key: 'qtySent',
      header: t('inv.transit.colSentQty'),
      width: '110px',
      render: (l) => (
        <span style={numberStyle}>
          {fmt(l.qtySent)} {l.uom ?? ''}
        </span>
      ),
    },
    {
      key: 'qtyReceived',
      header: t('inv.transit.colReceivedQty'),
      width: '110px',
      render: (l) => (
        <span style={numberStyle}>
          {l.qtyReceived == null ? dash : `${fmt(l.qtyReceived)} ${l.uom ?? ''}`}
        </span>
      ),
    },
    {
      key: '_short',
      header: t('inv.transit.colShort'),
      width: '90px',
      render: (l) => {
        const short = l.qtyReceived == null ? 0 : l.qtySent - l.qtyReceived
        return short > 0 ? (
          <span style={{ ...numberStyle, color: theme.danger, fontWeight: 600 }}>{fmt(short)}</span>
        ) : (
          <span style={{ color: theme.textSecondary }}>{dash}</span>
        )
      },
    },
    {
      key: 'remarks',
      header: t('inv.transit.colRemarks'),
      render: (l) => (
        <div>
          {l.remarks && <div style={{ color: theme.textPrimary }}>{l.remarks}</div>}
          {l.receiveRemarks && (
            <div style={{ fontSize: '12px', color: theme.textSecondary }}>
              {t('inv.transit.colReceiveRemarks')}: {l.receiveRemarks}
            </div>
          )}
          {!l.remarks && !l.receiveRemarks && (
            <span style={{ color: theme.textSecondary }}>{dash}</span>
          )}
        </div>
      ),
    },
  ]

  return (
    <Modal
      open={transfer !== null}
      onClose={onClose}
      title={t('inv.transit.detailTitle', { number: transfer?.transferNumber ?? '' })}
      size="xl"
      footer={
        <ActionButton variant="outline" onClick={onClose}>
          {t('inv.transit.close')}
        </ActionButton>
      }
    >
      {transfer && (
        <div>
          <div style={{ marginBottom: '14px' }}>{statusBadge(transfer.status)}</div>
          <dl
            data-phone-grid=""
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
              gap: '14px 18px',
              margin: '0 0 16px',
            }}
          >
            {facts.map((f) => (
              <div key={f.label} style={{ minWidth: 0 }}>
                <dt style={{ fontSize: '12px', color: theme.textSecondary, marginBottom: '2px' }}>
                  {f.label}
                </dt>
                <dd
                  style={{
                    margin: 0,
                    fontSize: '14px',
                    color: theme.textPrimary,
                    fontWeight: 500,
                    overflowWrap: 'anywhere',
                  }}
                >
                  {f.value ?? dash}
                </dd>
              </div>
            ))}
          </dl>
          {transfer.notes && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '12px', color: theme.textSecondary, marginBottom: '2px' }}>
                {t('inv.transit.notes')}
              </div>
              <div style={{ fontSize: '14px', color: theme.textPrimary, whiteSpace: 'pre-wrap' }}>
                {transfer.notes}
              </div>
            </div>
          )}
          <div
            style={{
              fontSize: '14px',
              fontWeight: 600,
              color: theme.textPrimary,
              marginBottom: '8px',
            }}
          >
            {t('inv.transit.itemsTitle')}
          </div>
          <Table<DetailLine> readable columns={columns} data={transfer.lines} rowKey="id" />
        </div>
      )}
    </Modal>
  )
}
