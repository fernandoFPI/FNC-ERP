import { useState } from 'react'
import { useTheme } from '../../theme/ThemeContext'
import { Modal } from './Modal'
import { Select } from './Select'
import { Input } from './Input'
import { Textarea } from './Textarea'
import { Button } from './Button'
import { api } from '../../lib/axios'

interface IntercoTransactionFormProps {
  onSuccess: () => void
  onCancel: () => void
}

const TRANSACTION_TYPES = [
  { value: 'goods_transfer', label: 'Goods Transfer' },
  { value: 'service_charge', label: 'Service Charge' },
  { value: 'equipment_rental', label: 'Equipment Rental' },
  { value: 'management_fee', label: 'Management Fee' },
]

const COMPANIES = [
  { id: 'yakam', name: 'Nishtimani Yakam' },
  { id: 'factory', name: 'Nishtimani Factory' },
  { id: 'watanyia', name: 'Al Watanyia' },
]

const CURRENCIES = [
  { value: 'IQD', label: 'IQD' },
  { value: 'USD', label: 'USD' },
  { value: 'EUR', label: 'EUR' },
]

interface FormState {
  fromCompanyId: string
  toCompanyId: string
  transactionType: string
  amount: string
  currencyCode: string
  description: string
  reference: string
}

export function IntercoTransactionForm({ onSuccess, onCancel }: IntercoTransactionFormProps) {
  const { theme } = useTheme()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState<FormState>({
    fromCompanyId: '',
    toCompanyId: '',
    transactionType: '',
    amount: '',
    currencyCode: 'USD',
    description: '',
    reference: '',
  })

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const fromCompanyOptions = [
    { value: '', label: 'Select company…' },
    ...COMPANIES.filter(c => c.id !== form.toCompanyId).map(c => ({ value: c.id, label: c.name })),
  ]

  const toCompanyOptions = [
    { value: '', label: 'Select company…' },
    ...COMPANIES.filter(c => c.id !== form.fromCompanyId).map(c => ({ value: c.id, label: c.name })),
  ]

  const txTypeOptions = [
    { value: '', label: 'Select type…' },
    ...TRANSACTION_TYPES,
  ]

  const fromCompany = COMPANIES.find(c => c.id === form.fromCompanyId)
  const toCompany = COMPANIES.find(c => c.id === form.toCompanyId)
  const amountNum = parseFloat(form.amount) || 0

  const handleSubmit = async () => {
    setError(null)
    if (!form.fromCompanyId || !form.toCompanyId || !form.transactionType || !form.amount) {
      setError('Please fill in all required fields.')
      return
    }
    setSubmitting(true)
    try {
      await api.post('/interco/transactions', {
        from_company_id: form.fromCompanyId,
        to_company_id: form.toCompanyId,
        transaction_type: form.transactionType,
        amount: amountNum,
        currency_code: form.currencyCode,
        description: form.description,
        reference: form.reference,
      })
      onSuccess()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create transaction'
      setError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const footer = (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
      <Button onClick={onCancel}>Cancel</Button>
      <Button onClick={handleSubmit} disabled={submitting}>
        {submitting ? 'Submitting…' : 'Create Transaction'}
      </Button>
    </div>
  )

  return (
    <Modal open onClose={onCancel} title="New Intercompany Transaction" size="lg" footer={footer}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {error && (
          <div style={{
            background: theme.dangerBg,
            border: `1px solid ${theme.dangerBorder}`,
            borderRadius: 6,
            padding: '8px 12px',
            color: theme.danger,
            fontSize: 13,
          }}>
            {error}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Select
            label="From Company *"
            value={form.fromCompanyId}
            onChange={e => setForm(f => ({ ...f, fromCompanyId: e.target.value }))}
            options={fromCompanyOptions}
            required
          />
          <Select
            label="To Company *"
            value={form.toCompanyId}
            onChange={e => setForm(f => ({ ...f, toCompanyId: e.target.value }))}
            options={toCompanyOptions}
            required
          />
        </div>

        <Select
          label="Transaction Type *"
          value={form.transactionType}
          onChange={e => setForm(f => ({ ...f, transactionType: e.target.value }))}
          options={txTypeOptions}
          required
        />

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
          <Input
            label="Amount *"
            type="number"
            value={form.amount}
            onChange={set('amount')}
            placeholder="0.00"
            required
          />
          <Select
            label="Currency"
            value={form.currencyCode}
            onChange={e => setForm(f => ({ ...f, currencyCode: e.target.value }))}
            options={CURRENCIES}
          />
        </div>

        <Input
          label="Reference"
          value={form.reference}
          onChange={set('reference')}
          placeholder="e.g. INV-2026-001"
        />

        <Textarea
          label="Description"
          value={form.description}
          onChange={set('description')}
          placeholder="Transaction description…"
          rows={3}
        />

        {/* Journal entry preview */}
        {fromCompany && toCompany && amountNum > 0 && (
          <div style={{
            background: theme.bgSurfaceHover,
            border: `1px solid ${theme.border}`,
            borderRadius: 8,
            padding: '12px 14px',
          }}>
            <div style={{ color: theme.textSecondary, fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
              Journal Entry Preview
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' as const, color: theme.textMuted, fontSize: 11, padding: '2px 8px', fontWeight: 500 }}>Account</th>
                  <th style={{ textAlign: 'right' as const, color: theme.textMuted, fontSize: 11, padding: '2px 8px', fontWeight: 500 }}>Dr</th>
                  <th style={{ textAlign: 'right' as const, color: theme.textMuted, fontSize: 11, padding: '2px 8px', fontWeight: 500 }}>Cr</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ padding: '3px 8px', color: theme.textPrimary }}>
                    {fromCompany.name} — Interco Receivable
                  </td>
                  <td style={{ padding: '3px 8px', color: theme.success, textAlign: 'right' as const }}>
                    {amountNum.toLocaleString('en-US', { minimumFractionDigits: 2 })} {form.currencyCode}
                  </td>
                  <td style={{ padding: '3px 8px', textAlign: 'right' as const }}>—</td>
                </tr>
                <tr>
                  <td style={{ padding: '3px 8px', color: theme.textPrimary }}>
                    {toCompany.name} — Interco Payable
                  </td>
                  <td style={{ padding: '3px 8px', textAlign: 'right' as const }}>—</td>
                  <td style={{ padding: '3px 8px', color: theme.danger, textAlign: 'right' as const }}>
                    {amountNum.toLocaleString('en-US', { minimumFractionDigits: 2 })} {form.currencyCode}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  )
}
