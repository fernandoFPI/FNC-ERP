import i18n from '../../../i18n'
import { useTranslation } from 'react-i18next'
import { useState, useEffect } from 'react'
import { useTheme } from '../../../theme/ThemeContext'
import { api } from '../../../lib/axios'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { Textarea } from '../../../components/ui/Textarea'
import { CurrencyInput } from '../../../components/ui/CurrencyInput'
import { DatePicker } from '../../../components/ui/DatePicker'
import { Select } from '../../../components/ui/Select'
import { useToastStore } from '../../../store/toastStore'
import { formatCurrency } from '../../../lib/format'

interface Props {
  invoiceId: string
  invoiceNumber: string
  grossTotal: number
  retentionAmount: number
  netPayable: number
  totalPaid: number
  currency: string
  whtApplies?: boolean
  whtScenario?: string | null
  whtAmount?: number
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

const PAYMENT_METHODS = [
  { value: 'bank_transfer', get label() { return i18n.t('proj.invPay.bankTransfer', { defaultValue: "Bank Transfer" }) } },
  { value: 'cheque', get label() { return i18n.t('proj.invPay.cheque', { defaultValue: "Cheque" }) } },
  { value: 'cash', get label() { return i18n.t('proj.invPay.cash', { defaultValue: "Cash" }) } },
  { value: 'other', get label() { return i18n.t('proj.invPay.other', { defaultValue: "Other" }) } },
]

export function InvoicePaymentForm({
  invoiceId,
  invoiceNumber,
  netPayable,
  totalPaid,
  currency,
  whtApplies,
  whtScenario,
  whtAmount = 0,
  open,
  onClose,
  onSuccess,
}: Props) {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)
  // For Scenario A (client withholds), cash received = netPayable − WHT.
  const cashTarget =
    whtApplies && whtScenario === 'client_withholds'
      ? Math.max(0, netPayable - whtAmount)
      : netPayable
  const outstanding = Math.max(0, cashTarget - totalPaid)

  const [form, setForm] = useState({
    paymentDate: new Date().toISOString().split('T')[0],
    amount: outstanding as number | '',
    currencyCode: currency,
    paymentMethod: 'bank_transfer',
    paymentReference: '',
    notes: '',
  })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) setForm((f) => ({ ...f, amount: Math.max(0, cashTarget - totalPaid) }))
  }, [open, cashTarget, totalPaid])

  const amountValue = typeof form.amount === 'number' ? form.amount : 0
  const isOverpayment = amountValue > outstanding
  const isValid = amountValue > 0 && !isOverpayment && outstanding > 0

  async function handleSubmit() {
    if (!isValid) return
    setSubmitting(true)
    try {
      await api.post(`/projects/invoices/${invoiceId}/payments`, {
        payment_date: form.paymentDate,
        amount: amountValue,
        currency_code: form.currencyCode,
        payment_method: form.paymentMethod,
        payment_reference: form.paymentReference || null,
        notes: form.notes || null,
      })
      const isFullyPaid = amountValue >= outstanding
      addToast({
        type: 'success',
        message: isFullyPaid
          ? t('proj.invPay.invoiceFullyPaidRecorded', { currency: formatCurrency(amountValue, currency) })
          : t('proj.invPay.paymentOfRecorded', { currency: formatCurrency(amountValue, currency) }),
      })
      onSuccess()
      onClose()
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response
        ?.data?.error?.message
      addToast({ type: 'error', message: msg ?? t('proj.invPay.failedToRecordPayment') })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={t('proj.invPay.recordPayment')}
      description={t('proj.invPay.invoice', { invoiceNumber })}
      footer={
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onClose}>
            {t('proj.invPay.cancel')}
          </Button>
          <Button variant="primary" loading={submitting} disabled={!isValid} onClick={(...args: Parameters<typeof handleSubmit>) => void handleSubmit(...args)}>
            {t('proj.invPay.recordPayment')}
          </Button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {/* WHT info banner */}
        {whtApplies && whtAmount > 0 && (
          <div
            style={{
              background: whtScenario === 'client_withholds' ? '#eff6ff' : '#fefce8',
              border: `1px solid ${whtScenario === 'client_withholds' ? '#bfdbfe' : '#fde68a'}`,
              borderRadius: '8px',
              padding: '10px 14px',
              fontSize: '12px',
              color: '#374151',
            }}
          >
            {whtScenario === 'client_withholds'
              ? t('proj.invPay.whtClientWithholdsClientRemitsThis', { currency: formatCurrency(whtAmount, currency), currency2: formatCurrency(cashTarget, currency) })
              : t('proj.invPay.whtFncPaysYouReceiveFull', { currency: formatCurrency(whtAmount, currency), currency2: formatCurrency(netPayable, currency) })}
          </div>
        )}

        {/* Outstanding balance card */}
        <div
          style={{
            background: theme.accentBg,
            border: `1px solid ${theme.accentBorder}`,
            borderRadius: '10px',
            padding: '12px 16px',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: '8px',
          }}
        >
          {[
            { label: t('proj.invPay.cashTarget'), value: cashTarget, color: theme.textSecondary, large: false },
            {
              label: t('proj.invPay.paidSoFar'),
              value: totalPaid,
              color: totalPaid > 0 ? theme.success : theme.textMuted,
              large: false,
            },
            {
              label: t('proj.invPay.outstanding'),
              value: outstanding,
              color: outstanding > 0 ? theme.accent : theme.success,
              large: true,
            },
          ].map(({ label, value, color, large }) => (
            <div key={label} style={{ textAlign: 'center' }}>
              <div
                style={{
                  fontSize: '10px',
                  color: theme.textMuted,
                  marginBottom: '4px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                {label}
              </div>
              <div
                style={{
                  fontSize: large ? '18px' : '14px',
                  fontWeight: large ? 700 : 400,
                  color,
                  fontFamily: 'monospace',
                }}
              >
                {formatCurrency(value, currency)}
              </div>
            </div>
          ))}
        </div>

        {outstanding <= 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '20px',
              color: theme.success,
              fontSize: '13px',
              fontWeight: 500,
            }}
          >
            {t('proj.invPay.thisInvoiceIsFullyPaid')}
          </div>
        ) : (
          <>
            <DatePicker
              label={t('proj.invPay.paymentDate')}
              value={form.paymentDate}
              onChange={(v) => {
                setForm((f) => ({ ...f, paymentDate: v }))
              }}
            />

            <CurrencyInput
              label={t('proj.invPay.amountReceived')}
              value={form.amount}
              onChange={(v) => {
                setForm((f) => ({ ...f, amount: v }))
              }}
              currency={form.currencyCode}
              error={
                isOverpayment
                  ? t('proj.invPay.cannotExceedOutstandingBalanceOf', { currency: formatCurrency(outstanding, currency) })
                  : undefined
              }
            />

            <Select
              label={t('proj.invPay.paymentMethod')}
              value={form.paymentMethod}
              onChange={(e) => {
                setForm((f) => ({ ...f, paymentMethod: e.target.value }))
              }}
              options={PAYMENT_METHODS}
            />

            <Input
              label={t('proj.invPay.referenceTransactionId')}
              value={form.paymentReference}
              onChange={(e) => {
                setForm((f) => ({ ...f, paymentReference: e.target.value }))
              }}
              placeholder={t('proj.invPay.bankTransferRefChequeNumber')}
            />

            <Textarea
              label={t('proj.invPay.notes')}
              value={form.notes}
              onChange={(e) => {
                setForm((f) => ({ ...f, notes: e.target.value }))
              }}
              rows={2}
            />
          </>
        )}
      </div>
    </Modal>
  )
}
