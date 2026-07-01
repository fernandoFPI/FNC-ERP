import { useState } from 'react'
import { useQuery, useMutation } from '@apollo/client'
import { FX_RATES_QUERY, FX_STALENESS_QUERY, UPSERT_FX_RATE, TRIGGER_FX_SYNC } from '../../../graphql/finance'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Table, Column } from '../../../components/ui/Table'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Modal } from '../../../components/ui/Modal'
import { Input } from '../../../components/ui/Input'
import { Select } from '../../../components/ui/Select'
import { useToastStore } from '../../../store/toastStore'

interface FXRate {
  id: string
  from_currency: string
  to_currency: string
  rate: string
  rate_date: string
  source?: string
  created_at?: string
}

interface StalenessStatus {
  currencyPair: string
  lastRate?: number
  lastRateDate?: string
  ageHours?: number
  status: string
  message: string
}

const CURRENCIES = ['IQD', 'USD', 'EUR', 'TRY', 'GBP', 'AED', 'SAR']

export default function FXRatesPage() {
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ from_currency: 'USD', to_currency: 'IQD', rate: '', rate_date: new Date().toISOString().split('T')[0] })

  const { data: ratesData, loading: ratesLoading, refetch } = useQuery(FX_RATES_QUERY, {
    variables: {},
    fetchPolicy: 'cache-and-network',
  })

  const { data: stalenessData } = useQuery(FX_STALENESS_QUERY, {
    fetchPolicy: 'cache-and-network',
  })

  const [upsertRate, { loading: upserting }] = useMutation(UPSERT_FX_RATE)
  const [triggerSync, { loading: syncing }] = useMutation(TRIGGER_FX_SYNC)

  const rates: FXRate[] = ratesData?.fxRates ?? []
  const pairs: StalenessStatus[] = stalenessData?.fxRateStaleness?.pairs ?? []

  async function handleUpsert(e: React.FormEvent) {
    e.preventDefault()
    try {
      await upsertRate({
        variables: { input: { from_currency: form.from_currency, to_currency: form.to_currency, rate: parseFloat(form.rate), rate_date: form.rate_date, source: 'manual' } },
        refetchQueries: [{ query: FX_RATES_QUERY, variables: {} }, { query: FX_STALENESS_QUERY }],
      })
      addToast({ type: 'success', message: 'FX rate saved' })
      setShowForm(false)
      setForm({ from_currency: 'USD', to_currency: 'IQD', rate: '', rate_date: new Date().toISOString().split('T')[0] })
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    }
  }

  async function handleSync() {
    try {
      await triggerSync()
      addToast({ type: 'success', message: 'FX sync triggered' })
      setTimeout(() => refetch(), 2000)
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    }
  }

  const rateColumns: Column<FXRate>[] = [
    { key: 'from_currency', header: 'From', render: (r) => <Badge variant="accent">{r.from_currency}</Badge> },
    { key: 'to_currency', header: 'To', render: (r) => <Badge variant="info">{r.to_currency}</Badge> },
    { key: 'rate', header: 'Rate', render: (r) => <span style={{ fontFamily: 'monospace', color: theme.textPrimary }}>{parseFloat(r.rate).toFixed(4)}</span> },
    { key: 'rate_date', header: 'Date', render: (r) => <span style={{ color: theme.textSecondary, fontSize: '13px' }}>{r.rate_date}</span> },
    { key: 'source', header: 'Source', render: (r) => <Badge variant="neutral">{r.source ?? 'manual'}</Badge> },
  ]

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1400px' }}>
      <PageHeader
        title="FX Rates"
        subtitle="Exchange rate management"
        actions={
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button variant="ghost" size="sm" onClick={handleSync} loading={syncing}>Sync Rates</Button>
            <Button variant="primary" size="sm" onClick={() => setShowForm(true)}>Add Rate</Button>
          </div>
        }
      />

      {/* Staleness overview */}
      {pairs.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '16px', marginBottom: '16px' }}>
          {pairs.map((p) => (
            <div key={p.currencyPair} style={{
              background: theme.bgSurface,
              border: `1px solid ${p.status === 'ok' ? theme.success : p.status === 'stale' ? theme.warning : theme.danger}`,
              borderRadius: '8px',
              padding: '10px 14px',
              minWidth: '140px',
            }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: theme.textPrimary }}>{p.currencyPair}</div>
              <div style={{ fontSize: '14px', fontFamily: 'monospace', color: theme.textPrimary, marginTop: '4px' }}>
                {p.lastRate != null ? p.lastRate.toFixed(4) : '—'}
              </div>
              <div style={{ fontSize: '11px', color: p.status === 'ok' ? theme.success : p.status === 'stale' ? theme.warning : theme.danger, marginTop: '2px' }}>
                {p.ageHours != null ? `${Math.round(p.ageHours)}h ago` : 'no data'} · {p.message}
              </div>
            </div>
          ))}
        </div>
      )}

      <Card>
        <Table columns={rateColumns} data={rates} loading={ratesLoading} rowKey="id" />
      </Card>

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Add / Update FX Rate">
        <form onSubmit={handleUpsert} style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
            <Select label="From Currency" value={form.from_currency} onChange={(e) => setForm((f) => ({ ...f, from_currency: e.target.value }))}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
            <Select label="To Currency" value={form.to_currency} onChange={(e) => setForm((f) => ({ ...f, to_currency: e.target.value }))}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
            <Input label="Rate" type="number" step="0.0001" min="0" value={form.rate} onChange={(e) => setForm((f) => ({ ...f, rate: e.target.value }))} required />
            <Input label="Date" type="date" value={form.rate_date} onChange={(e) => setForm((f) => ({ ...f, rate_date: e.target.value }))} required />
          </div>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <Button variant="ghost" type="button" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button variant="primary" type="submit" loading={upserting}>Save</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
