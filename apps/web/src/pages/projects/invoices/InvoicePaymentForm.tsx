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
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cheque',        label: 'Cheque' },
  { value: 'cash',          label: 'Cash' },
  { value: 'other',         label: 'Other' },
]

export function InvoicePaymentForm({
  invoiceId, invoiceNumber,
  grossTotal, retentionAmount, netPayable,
  totalPaid, currency,
  whtApplies, whtScenario, whtAmount = 0,
  open, onClose, onSuccess,
}: Props) {
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)
  // For Scenario A (client withholds), cash received = netPayable − WHT.
  const cashTarget = whtApplies && whtScenario === 'client_withholds'
    ? Math.max(0, netPayable - whtAmount)
    : netPayable
  const outstanding = Math.max(0, cashTarget - totalPaid)

  const [form, setForm] = useState({
    paymentDate:      new Date().toISOString().split('T')[0],
    amount:           outstanding as number | '',
    currencyCode:     currency,
    paymentMethod:    'bank_transfer',
    paymentReference: '',
    notes:            '',
  })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) setForm(f => ({ ...f, amount: Math.max(0, cashTarget - totalPaid) }))
  }, [open, cashTarget, totalPaid])

  const amountValue = typeof form.amount === 'number' ? form.amount : 0
  const isOverpayment = amountValue > outstanding
  const isValid       = amountValue > 0 && !isOverpayment && outstanding > 0

  async function handleSubmit() {
    if (!isValid) return
    setSubmitting(true)
    try {
      await api.post(`/projects/invoices/${invoiceId}/payments`, {
        payment_date:      form.paymentDate,
        amount:            amountValue,
        currency_code:     form.currencyCode,
        payment_method:    form.paymentMethod,
        payment_reference: form.paymentReference || null,
        notes:             form.notes            || null,
      })
      const isFullyPaid = amountValue >= outstanding
      addToast({
        type: 'success',
        message: isFullyPaid
          ? `Invoice fully paid · ${formatCurrency(amountValue, currency)} recorded`
          : `Payment of ${formatCurrency(amountValue, currency)} recorded`,
      })
      onSuccess()
      onClose()
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message
      addToast({ type: 'error', message: msg ?? 'Failed to record payment' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="Record Payment"
      description={`Invoice ${invoiceNumber}`}
      footer={
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={submitting}
            disabled={!isValid}
            onClick={handleSubmit}
          >
            Record Payment
          </Button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

        {/* WHT info banner */}
        {whtApplies && whtAmount > 0 && (
          <div style={{
            background: whtScenario === 'client_withholds' ? '#eff6ff' : '#fefce8',
            border: `1px solid ${whtScenario === 'client_withholds' ? '#bfdbfe' : '#fde68a'}`,
            borderRadius: '8px',
            padding: '10px 14px',
            fontSize: '12px',
            color: '#374151',
          }}>
            {whtScenario === 'client_withholds'
              ? `WHT (client withholds): ${formatCurrency(whtAmount, currency)} — client remits this to the tax authority. Cash you receive: ${formatCurrency(cashTarget, currency)}.`
              : `WHT (FNC pays): ${formatCurrency(whtAmount, currency)} — you receive full ${formatCurrency(netPayable, currency)}, FNC remits WHT annually.`
            }
          </div>
        )}

        {/* Outstanding balance card */}
        <div style={{
          background: theme.accentBg,
          border: `1px solid ${theme.accentBorder}`,
          borderRadius: '10px',
          padding: '12px 16px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '8px',
        }}>
          {[
            { label: 'Cash Target',  value: cashTarget,   color: theme.textSecondary, large: false },
            { label: 'Paid So Far',  value: totalPaid,    color: totalPaid > 0 ? theme.success : theme.textMuted, large: false },
            { label: 'Outstanding',  value: outstanding,  color: outstanding > 0 ? theme.accent : theme.success, large: true },
          ].map(({ label, value, color, large }) => (
            <div key={label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {label}
              </div>
              <div style={{ fontSize: large ? '18px' : '14px', fontWeight: large ? 700 : 400, color, fontFamily: 'monospace' }}>
                {formatCurrency(value, currency)}
              </div>
            </div>
          ))}
        </div>

        {outstanding <= 0 ? (
          <div style={{ textAlign: 'center', padding: '20px', color: theme.success, fontSize: '13px', fontWeight: 500 }}>
            ✓ This invoice is fully paid
          </div>
        ) : (
          <>
            <DatePicker
              label="Payment date"
              value={form.paymentDate}
              onChange={v => setForm(f => ({ ...f, paymentDate: v }))}
            />

            <CurrencyInput
              label="Amount received"
              value={form.amount}
              onChange={v => setForm(f => ({ ...f, amount: v }))}
              currency={form.currencyCode}
              error={isOverpayment ? `Cannot exceed outstanding balance of ${formatCurrency(outstanding, currency)}` : undefined}
            />

            <Select
              label="Payment method"
              value={form.paymentMethod}
              onChange={e => setForm(f => ({ ...f, paymentMethod: e.target.value }))}
              options={PAYMENT_METHODS}
            />

            <Input
              label="Reference / transaction ID"
              value={form.paymentReference}
              onChange={e => setForm(f => ({ ...f, paymentReference: e.target.value }))}
              placeholder="Bank transfer ref, cheque number…"
            />

            <Textarea
              label="Notes"
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={2}
            />
          </>
        )}
      </div>
    </Modal>
  )
}
