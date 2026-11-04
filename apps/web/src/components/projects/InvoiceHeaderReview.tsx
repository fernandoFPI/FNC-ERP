import { Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../../theme/ThemeContext'
import { ExpenseLineFlag } from '../finance/ExpenseLineFlag'
import { lineFlagState } from '../../lib/expenseClaimFlags'
import {
  INVOICE_HEADER_FLAG_FIELDS,
  invoiceHeaderValue,
  type InvoiceHeaderFlagField,
  type InvoiceHeaderSource,
} from '../../lib/invoiceHeaderFlags'

export interface InvoiceHeaderFlagInfo {
  field: string
  reason: string
  flaggedByName?: string | null
  addressedAt?: string | null
  resolvedAt?: string | null
}

const flagFields = (f: InvoiceHeaderFlagInfo) => ({
  flag_reason: f.reason,
  flag_addressed_at: f.addressedAt,
  flag_resolved_at: f.resolvedAt,
})

// Generated or taken from the project, so the invoice itself has nothing to edit there.
const NOT_EDITABLE_HERE: InvoiceHeaderFlagField[] = ['invoice_number', 'job', 'reference']

/**
 * The printed header of an invoice (Date of Issue, Due Date, Invoice No., Deliver To, Bill To, Contract No.,
 * Job, Period of Performance, Date of Delivery, Reference) as far as review is concerned (migration 314):
 *  - while an approver is rejecting, every field with a tick box and, once ticked, its own reason;
 *  - otherwise, the fields an approver flagged, with what is wrong, and "Confirm fixed" once the invoice is
 *    back in review. Nothing is drawn when there is nothing to say.
 * The page keeps the ticked reasons; this only draws them.
 */
export function InvoiceHeaderReview({
  invoice,
  flags,
  rejecting,
  ticked,
  onToggle,
  onReason,
  onResolve,
  resolvingField = null,
}: {
  invoice: InvoiceHeaderSource
  flags: InvoiceHeaderFlagInfo[]
  rejecting: boolean
  ticked: Record<string, string>
  onToggle: (field: InvoiceHeaderFlagField) => void
  onReason: (field: InvoiceHeaderFlagField, reason: string) => void
  // Given only to someone who may confirm a fix; the creator never sees the button.
  onResolve?: (field: InvoiceHeaderFlagField) => void
  resolvingField?: string | null
}) {
  const { t } = useTranslation()
  const { theme } = useTheme()

  const label: Record<InvoiceHeaderFlagField, string> = {
    invoice_date: t('proj.invDetail.hdrDateOfIssue'),
    due_date: t('proj.invDetail.hdrDueDate'),
    invoice_number: t('proj.invDetail.hdrInvoiceNo'),
    deliver_to_address: t('proj.invDetail.hdrDeliverTo'),
    bill_to_address: t('proj.invDetail.hdrBillTo'),
    client_contract_no: t('proj.invDetail.hdrContractNo'),
    job: t('proj.invDetail.hdrJob'),
    period_of_performance: t('proj.invDetail.hdrPeriod'),
    delivery_date: t('proj.invDetail.hdrDeliveryDate'),
    reference: t('proj.invDetail.hdrReference'),
  }

  const live = new Map(
    flags.filter((f) => lineFlagState(flagFields(f)) !== 'none').map((f) => [f.field, f]),
  )
  const fields = INVOICE_HEADER_FLAG_FIELDS.filter((f) => (rejecting ? true : live.has(f)))
  if (fields.length === 0) return null

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '6px 10px',
    borderRadius: '6px',
    border: `1px solid ${theme.border}`,
    background: theme.bgCanvas,
    color: theme.textPrimary,
    fontSize: '12px',
    boxSizing: 'border-box',
    height: '56px',
    resize: 'vertical',
    fontFamily: 'inherit',
  }

  return (
    <div
      data-testid="invoice-header-review"
      style={{
        marginBottom: '16px',
        border: `1px solid ${theme.border}`,
        borderRadius: '10px',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '10px 14px',
          background: theme.bgSurfaceHover,
          fontSize: '12px',
          fontWeight: 600,
          color: theme.textPrimary,
        }}
      >
        {rejecting ? t('proj.invDetail.headerTitle') : t('proj.invDetail.headerFlagsTitle')}
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          {fields.map((field) => {
            const flag = live.get(field)
            const state = flag ? lineFlagState(flagFields(flag)) : 'none'
            const isTicked = field in ticked
            const edge = isTicked
              ? theme.accent
              : state === 'open'
                ? theme.danger
                : state === 'fixed'
                  ? theme.warning
                  : null
            const rowStyle: React.CSSProperties = {
              background: edge ? `${edge}0c` : undefined,
              boxShadow: edge ? `inset 4px 0 0 ${edge}` : undefined,
            }
            const value = invoiceHeaderValue(invoice, field)
            return (
              <Fragment key={field}>
                <tr data-testid="invoice-header-row" data-field={field} style={rowStyle}>
                  {rejecting && (
                    <td style={{ padding: '8px 12px', width: '36px' }}>
                      <input
                        type="checkbox"
                        checked={isTicked}
                        onChange={() => {
                          onToggle(field)
                        }}
                        aria-label={`${t('proj.invDetail.headerFlagThis')}: ${label[field]}`}
                        title={t('proj.invDetail.headerFlagThis')}
                      />
                    </td>
                  )}
                  <td
                    style={{
                      padding: '8px 12px',
                      width: '190px',
                      fontSize: '12px',
                      color: theme.textMuted,
                      verticalAlign: 'top',
                    }}
                  >
                    {label[field]}
                  </td>
                  <td
                    style={{
                      padding: '8px 12px',
                      fontSize: '13px',
                      color: theme.textPrimary,
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {value || '—'}
                    {NOT_EDITABLE_HERE.includes(field) && (
                      <span
                        style={{
                          marginInlineStart: '8px',
                          fontSize: '11px',
                          color: theme.textMuted,
                        }}
                      >
                        {t('proj.invDetail.headerNotEditable')}
                      </span>
                    )}
                  </td>
                </tr>
                {(isTicked || flag) && (
                  <tr style={{ ...rowStyle, borderBottom: `1px solid ${theme.border}` }}>
                    <td colSpan={rejecting ? 3 : 2} style={{ padding: '2px 12px 12px' }}>
                      {flag && (
                        <ExpenseLineFlag
                          line={flagFields(flag)}
                          flaggedByName={flag.flaggedByName}
                          onResolve={
                            onResolve
                              ? () => {
                                  onResolve(field)
                                }
                              : undefined
                          }
                          resolving={resolvingField === field}
                        />
                      )}
                      {isTicked && (
                        <div style={{ marginTop: flag ? '10px' : 0 }}>
                          <textarea
                            style={inputStyle}
                            value={ticked[field] ?? ''}
                            onChange={(e) => {
                              onReason(field, e.target.value)
                            }}
                            placeholder={t('proj.invDetail.whatIsWrongField')}
                            aria-label={`${t('proj.invDetail.whatIsWrongField')} ${label[field]}`}
                          />
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
