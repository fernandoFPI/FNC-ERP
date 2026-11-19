import { useTranslation } from 'react-i18next'
import { useTheme } from '../../../theme/ThemeContext'
import { useBreakpoint } from '../../../hooks/useBreakpoint'
import { Table, type Column } from '../../../components/ui/Table'
import { Checkbox } from '../../../components/ui/Checkbox'
import { QuantityStepper } from '../../../components/ui/QuantityStepper'
import { Select } from '../../../components/ui/Select'
import { clampReceiveQty, isLineComplete, remainingQty, type ReceiptLine } from '../../../lib/receiptLines'

export interface ReceiptEmployee {
  id: string
  first_name: string
  last_name: string
}

interface ReceiptLinesTableProps {
  lines: ReceiptLine[]
  /** The purchase order is still loading: draw placeholder rows instead of "no lines". */
  loading?: boolean
  /** One person receives everything: the per-line receiver column is not drawn. */
  receiveAll: boolean
  employees: ReceiptEmployee[]
  lineReceivers: Record<string, { id: string; name: string }>
  onToggle: (poLineId: string, checked: boolean) => void
  onQty: (poLineId: string, value: string) => void
  onReceiver: (poLineId: string, employeeId: string) => void
}

const number = (n: number) => n.toLocaleString()

const visuallyHidden = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
} as const

/**
 * The lines of the goods receipt: tick what arrived, say how much. A table on a desktop; on a phone every line is a card
 * with its figures labelled and the quantity box full width. A line with nothing left to receive cannot be ticked (it
 * used to be tickable and then refused at submit).
 */
export function ReceiptLinesTable({
  lines,
  loading = false,
  receiveAll,
  employees,
  lineReceivers,
  onToggle,
  onQty,
  onReceiver,
}: ReceiptLinesTableProps) {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const { isPhone } = useBreakpoint()

  const figure = (value: string, color: string = theme.textPrimary, weight = 600) => (
    <span
      style={{
        fontVariantNumeric: 'tabular-nums',
        fontWeight: weight,
        color,
        whiteSpace: 'nowrap',
      }}
    >
      {value}
    </span>
  )

  const columns: Column<ReceiptLine>[] = [
    {
      key: 'selected',
      header: t('receipt.form.receiving'),
      // The box needs no visible heading, and "Receiving?" over it cost 30px of a table that must fit its card: a screen
      // reader still hears it.
      renderHeader: () => <span style={visuallyHidden}>{t('receipt.form.receiving')}</span>,
      width: '56px',
      mobileAction: true,
      render: (line) => (
        <Checkbox
          large={isPhone}
          checked={line.selected}
          disabled={isLineComplete(line)}
          ariaLabel={t('receipt.form.selectLine', { item: line.description })}
          onChange={(checked) => {
            onToggle(line.po_line_id, checked)
          }}
        />
      ),
    },
    {
      key: 'description',
      header: t('receipt.form.item'),
      wrap: true,
      minWidth: '160px',
      mobilePrimary: true,
      render: (line) => (
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontWeight: 600,
              color: line.selected ? theme.textPrimary : theme.textSecondary,
            }}
          >
            {line.description}
          </div>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '2px 10px',
              fontSize: '12px',
              fontWeight: 400,
              color: theme.textSecondary,
              marginTop: '2px',
            }}
          >
            {line.sku && <span>{t('receipt.form.skuLabel', { sku: line.sku })}</span>}
            {line.po_unit_price > 0 && (
              <span>
                {t('receipt.form.poPrice')}: {number(line.po_unit_price)}
              </span>
            )}
            {line.qty_from_stock > 0 && (
              <span style={{ color: theme.success, fontWeight: 600 }}>
                {t('receipt.form.fromStockLine', { qty: number(line.qty_from_stock) })}
              </span>
            )}
            {isLineComplete(line) && (
              <span
                style={{
                  fontWeight: 600,
                  color: theme.success,
                  background: theme.successBg,
                  border: `1px solid ${theme.successBorder}`,
                  borderRadius: '999px',
                  padding: '0 8px',
                }}
              >
                {t('receipt.form.fullyReceived')}
              </span>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'ordered_qty',
      header: t('receipt.form.ordered'),
      render: (line) => figure(number(line.ordered_qty)),
    },
    {
      key: 'qty_received_so_far',
      // short over the column, the full words on a phone card
      header: t('receipt.form.colReceived'),
      mobileLabel: t('receipt.form.previouslyReceived'),
      render: (line) => figure(number(line.qty_received_so_far), theme.textSecondary, 500),
    },
    {
      key: 'remaining',
      header: t('receipt.form.remaining'),
      render: (line) => {
        const left = remainingQty(line)
        return figure(number(left), left > 0 ? theme.textPrimary : theme.success)
      },
    },
    {
      key: 'qty_to_receive',
      header: t('receipt.form.receiveNow'),
      width: '190px',
      mobileFullWidth: true,
      render: (line) => {
        const max = remainingQty(line)
        return (
          <div>
            <QuantityStepper
              value={line.qty_to_receive}
              onChange={(value) => {
                onQty(line.po_line_id, clampReceiveQty(value, max))
              }}
              ariaLabel={t('receipt.form.qtyFor', { item: line.description })}
              decreaseLabel={t('receipt.form.less')}
              increaseLabel={t('receipt.form.more')}
              min={0}
              max={max}
              disabled={!line.selected}
            />
            <div style={{ fontSize: '12px', fontWeight: 400, color: theme.textSecondary, marginTop: '4px' }}>
              {t('receipt.form.maxLabel', { max: number(max) })}
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
            header: t('receipt.form.receiver'),
            width: '180px',
            mobileFullWidth: true,
            render: (line: ReceiptLine) => (
              <Select
                value={lineReceivers[line.po_line_id]?.id ?? ''}
                onChange={(e) => {
                  onReceiver(line.po_line_id, e.target.value)
                }}
              >
                <option value="">{t('receipt.form.default')}</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.first_name} {emp.last_name}
                  </option>
                ))}
              </Select>
            ),
          },
        ]),
  ]

  return (
    <Table<ReceiptLine>
      columns={columns}
      data={lines}
      loading={loading}
      rowKey="po_line_id"
      mobileLayout="fields"
      emptyMessage={t('receipt.form.noLines')}
      // a ticked line is tinted, so the eye can find what is being received in a long order
      getRowStyle={(line) => (line.selected ? { background: theme.accentBg } : {})}
    />
  )
}
