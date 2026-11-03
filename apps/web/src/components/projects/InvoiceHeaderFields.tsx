import { useTranslation } from 'react-i18next'
import { useTheme } from '../../theme/ThemeContext'
import { Input } from '../ui/Input'
import { Textarea } from '../ui/Textarea'

/** The client-facing block printed at the top of a project invoice (migration 311). */
export interface InvoiceHeaderValues {
  clientContractNo: string
  billToAddress: string
  deliverToAddress: string
  /** YYYY-MM-DD, or '' */
  deliveryDate: string
  periodOfPerformance: string
}

export const EMPTY_INVOICE_HEADER: InvoiceHeaderValues = {
  clientContractNo: '',
  billToAddress: '',
  deliverToAddress: '',
  deliveryDate: '',
  periodOfPerformance: '',
}

/** From the API's nullable fields (a null has nothing to show, so it becomes ''). */
export function toInvoiceHeaderValues(
  src:
    | {
        clientContractNo?: string | null
        billToAddress?: string | null
        deliverToAddress?: string | null
        deliveryDate?: string | null
        periodOfPerformance?: string | null
      }
    | null
    | undefined,
): InvoiceHeaderValues {
  return {
    clientContractNo: src?.clientContractNo ?? '',
    billToAddress: src?.billToAddress ?? '',
    deliverToAddress: src?.deliverToAddress ?? '',
    deliveryDate: (src?.deliveryDate ?? '').slice(0, 10),
    periodOfPerformance: src?.periodOfPerformance ?? '',
  }
}

/** Only the fields that differ, for an update that must change what the person changed and nothing
 *  else: an old invoice shows values derived from the project, and saving a line edit must not
 *  quietly store them as if somebody had typed them. */
export function changedInvoiceHeader(
  before: InvoiceHeaderValues,
  after: InvoiceHeaderValues,
): Partial<InvoiceHeaderValues> {
  const out: Partial<InvoiceHeaderValues> = {}
  for (const key of Object.keys(after) as (keyof InvoiceHeaderValues)[]) {
    if (after[key] !== before[key]) out[key] = after[key]
  }
  return out
}

interface Props {
  values: InvoiceHeaderValues
  onChange: (patch: Partial<InvoiceHeaderValues>) => void
  disabled?: boolean
}

/** One set of fields for the create wizard and for editing an invoice, so they cannot drift apart. */
export function InvoiceHeaderFields({ values, onChange, disabled = false }: Props) {
  const { t } = useTranslation()
  const { theme } = useTheme()

  return (
    <div
      style={{
        background: theme.bgSurface,
        border: `1px solid ${theme.border}`,
        borderRadius: '12px',
        padding: '14px',
      }}
    >
      <div
        style={{
          fontSize: '12px',
          fontWeight: 600,
          color: theme.textSecondary,
          marginBottom: '4px',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        {t('proj.invHeader.title')}
      </div>
      <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '12px' }}>
        {t('proj.invHeader.hint')}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div>
          <Input
            label={t('proj.invHeader.clientContractNo')}
            value={values.clientContractNo}
            disabled={disabled}
            onChange={(e) => {
              onChange({ clientContractNo: e.target.value })
            }}
          />
          <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '3px' }}>
            {t('proj.invHeader.clientContractNoHint')}
          </div>
        </div>
        <Input
          label={t('proj.invHeader.deliveryDate')}
          type="date"
          value={values.deliveryDate}
          disabled={disabled}
          onChange={(e) => {
            onChange({ deliveryDate: e.target.value })
          }}
        />
        <Textarea
          label={t('proj.invHeader.billTo')}
          rows={4}
          value={values.billToAddress}
          disabled={disabled}
          placeholder={t('proj.invHeader.addressPlaceholder')}
          onChange={(e) => {
            onChange({ billToAddress: e.target.value })
          }}
        />
        <Textarea
          label={t('proj.invHeader.deliverTo')}
          rows={4}
          value={values.deliverToAddress}
          disabled={disabled}
          placeholder={t('proj.invHeader.addressPlaceholder')}
          onChange={(e) => {
            onChange({ deliverToAddress: e.target.value })
          }}
        />
        <Input
          label={t('proj.invHeader.periodOfPerformance')}
          value={values.periodOfPerformance}
          disabled={disabled}
          placeholder={t('proj.invHeader.periodPlaceholder')}
          onChange={(e) => {
            onChange({ periodOfPerformance: e.target.value })
          }}
        />
      </div>
    </div>
  )
}
