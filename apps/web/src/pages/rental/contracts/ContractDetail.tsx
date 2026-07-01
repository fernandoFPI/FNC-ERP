import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@apollo/client'
import { RENTAL_CONTRACT_QUERY, ACTIVATE_RENTAL_CONTRACT, CLOSE_RENTAL_CONTRACT, GENERATE_RENTAL_INVOICE } from '../../../graphql/rental'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Modal } from '../../../components/ui/Modal'
import { Input } from '../../../components/ui/Input'
import { Select } from '../../../components/ui/Select'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import { useToastStore } from '../../../store/toastStore'
import { formatCurrency } from '../../../lib/format'

export default function RentalContractDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)
  const [showInvoiceModal, setShowInvoiceModal] = useState(false)
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [whtApplies, setWhtApplies] = useState(false)
  const [whtScenario, setWhtScenario] = useState<'client_withholds' | 'fnc_pays'>('client_withholds')
  const [whtRatePct, setWhtRatePct] = useState('3')

  const { data, loading, refetch } = useQuery(RENTAL_CONTRACT_QUERY, { variables: { id }, skip: !id })
  const [activateContract, { loading: activating }] = useMutation(ACTIVATE_RENTAL_CONTRACT)
  const [closeContract, { loading: closing }] = useMutation(CLOSE_RENTAL_CONTRACT)
  const [generateInvoice, { loading: invoicing }] = useMutation(GENERATE_RENTAL_INVOICE)

  const contract = data?.rentalContract

  async function handleAction(fn: () => Promise<unknown>, msg: string) {
    try {
      await fn()
      addToast({ type: 'success', message: msg })
      refetch()
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    }
  }

  async function handleGenerateInvoice(e: React.FormEvent) {
    e.preventDefault()
    const whtRate = whtApplies ? parseFloat(whtRatePct || '0') / 100 : 0
    await handleAction(() => generateInvoice({ variables: {
      contractId: id, periodStart, periodEnd,
      whtApplies, whtScenario: whtApplies ? whtScenario : undefined, whtRate: whtApplies ? whtRate : undefined,
    } }), 'Invoice generated')
    setShowInvoiceModal(false)
    refetch()
  }

  if (loading || !contract) return <div style={{ padding: '24px', color: 'var(--text-muted)' }}>Loading…</div>

  const cur = contract.currency_code ?? 'IQD'

  const STATUS_VARIANT: Record<string, 'neutral' | 'success' | 'warning' | 'danger'> = {
    draft: 'neutral', active: 'success', closed: 'neutral', cancelled: 'danger',
  }

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1200px' }}>
      <PageHeader
        title={`Contract ${contract.contract_number}`}
        subtitle={`${contract.client_name} · ${contract.asset_name ?? 'No asset'}`}
        actions={
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <Badge variant={STATUS_VARIANT[contract.status] ?? 'neutral'}>{contract.status}</Badge>
            {contract.status === 'draft' && (
              <Button variant="primary" size="sm" onClick={() => handleAction(() => activateContract({ variables: { id } }), 'Contract activated')} loading={activating}>Activate</Button>
            )}
            {contract.status === 'active' && (
              <>
                <Button variant="ghost" size="sm" onClick={() => setShowInvoiceModal(true)}>Generate Invoice</Button>
                <Button variant="ghost" size="sm" onClick={() => handleAction(() => closeContract({ variables: { id } }), 'Contract closed')} loading={closing}>Close</Button>
              </>
            )}
            <Button variant="ghost" size="sm" onClick={() => navigate(`/rental/contracts/${id}/edit`)}>Edit</Button>
          </div>
        }
      />

      {/* Info grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginTop: '20px' }}>
        <Card style={{ padding: '20px' }}>
          <div style={{ fontWeight: 600, color: theme.textPrimary, fontSize: '14px', marginBottom: '12px' }}>Contract Details</div>
          {[
            ['Rental Type', contract.rental_type],
            ['Billing Cycle', contract.billing_cycle],
            ['Rate/Day', `${parseFloat(contract.rate_amount).toLocaleString()} ${cur}`],
            ['Deposit', contract.deposit_amount ? `${parseFloat(contract.deposit_amount).toLocaleString()} ${cur}` : '—'],
            ['Start Date', contract.start_date],
            ['End Date', contract.end_date ?? 'Open-ended'],
            ['Project', contract.project_name ?? '—'],
            ['Client Contact', contract.client_contact ?? '—'],
          ].map(([label, value]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${theme.border}`, fontSize: '13px' }}>
              <span style={{ color: theme.textMuted }}>{label}</span>
              <span style={{ color: theme.textPrimary }}>{value}</span>
            </div>
          ))}
        </Card>

        {/* Recent usage */}
        <Card style={{ padding: '20px' }}>
          <div style={{ fontWeight: 600, color: theme.textPrimary, fontSize: '14px', marginBottom: '12px' }}>Recent Usage</div>
          {(contract.usageLogs ?? []).slice(0, 5).map((l: { id: string; usage_date: string; hours_used: number; operator_name: string }) => (
            <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${theme.border}`, fontSize: '13px' }}>
              <span style={{ color: theme.textSecondary }}>{l.usage_date}</span>
              <span style={{ color: theme.textPrimary }}>{l.hours_used}h — {l.operator_name}</span>
            </div>
          ))}
          {(contract.usageLogs ?? []).length === 0 && <div style={{ color: theme.textMuted, fontSize: '13px' }}>No usage logged</div>}
        </Card>
      </div>

      {/* Invoices */}
      <Card style={{ marginTop: '16px', padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', alignItems: 'center' }}>
          <div style={{ fontWeight: 600, color: theme.textPrimary, fontSize: '14px' }}>Invoices</div>
          {contract.status === 'active' && (
            <Button variant="primary" size="sm" onClick={() => setShowInvoiceModal(true)}>Generate Invoice</Button>
          )}
        </div>
        {(contract.invoices ?? []).map((inv: { id: string; invoice_number: string; billing_period_start: string; billing_period_end: string; days_billed: number; total_amount: number; status: string; invoice_date: string; due_date: string }) => (
          <div key={inv.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: `1px solid ${theme.border}`, fontSize: '13px' }}>
            <div>
              <span style={{ fontFamily: 'monospace', color: theme.accent, marginRight: '8px' }}>{inv.invoice_number}</span>
              <span style={{ color: theme.textMuted }}>{inv.billing_period_start} → {inv.billing_period_end} ({inv.days_billed}d)</span>
            </div>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <AmountDisplay amount={inv.total_amount} currency={cur} />
              <Badge variant={inv.status === 'paid' ? 'success' : 'neutral'}>{inv.status}</Badge>
            </div>
          </div>
        ))}
        {(contract.invoices ?? []).length === 0 && <div style={{ color: theme.textMuted, fontSize: '13px' }}>No invoices generated</div>}
      </Card>

      <Modal open={showInvoiceModal} onClose={() => setShowInvoiceModal(false)} title="Generate Rental Invoice">
        <form onSubmit={handleGenerateInvoice} style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
            <Input label="Billing Period Start" type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} required />
            <Input label="Billing Period End" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} required />
          </div>
          {periodStart && periodEnd && (() => {
            const days = Math.ceil((new Date(periodEnd).getTime() - new Date(periodStart).getTime()) / 864e5) + 1
            const total = days * parseFloat(contract.rate_amount)
            const whtAmt = whtApplies ? Math.round(total * (parseFloat(whtRatePct || '0') / 100) * 100) / 100 : 0
            return (
              <div style={{ fontSize: '13px', color: theme.accent, fontFamily: 'monospace' }}>
                {days} days × {formatCurrency(parseFloat(contract.rate_amount), cur)} = {formatCurrency(total, cur)}
                {whtApplies && whtAmt > 0 && <> · WHT {formatCurrency(whtAmt, cur)}</>}
              </div>
            )
          })()}

          {/* WHT section */}
          <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: '12px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 500, color: theme.textPrimary, marginBottom: '10px' }}>
              <input type="checkbox" checked={whtApplies} onChange={e => setWhtApplies(e.target.checked)} style={{ width: '15px', height: '15px' }} />
              Apply Withholding Tax (WHT)
            </label>
            {whtApplies && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <Select
                  label="WHT scenario"
                  value={whtScenario}
                  onChange={e => setWhtScenario(e.target.value as 'client_withholds' | 'fnc_pays')}
                  options={[
                    { value: 'client_withholds', label: 'Client withholds & pays tax authority' },
                    { value: 'fnc_pays', label: 'FNC pays full, remits WHT annually' },
                  ]}
                />
                <Input label="WHT rate (%)" type="number" min="0" max="100" step="0.1" value={whtRatePct} onChange={e => setWhtRatePct(e.target.value)} />
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <Button variant="ghost" type="button" onClick={() => setShowInvoiceModal(false)}>Cancel</Button>
            <Button variant="primary" type="submit" loading={invoicing}>Generate</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
