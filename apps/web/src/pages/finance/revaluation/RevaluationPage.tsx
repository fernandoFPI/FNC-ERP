import { useState, useEffect, useCallback } from 'react'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import { api } from '../../../lib/axios'

interface Run {
  id: string; run_date: string; period: string; status: 'draft' | 'posted' | 'reversed'
  total_gain_loss: number; journal_entry_id: string | null; line_count: number
  notes: string | null; created_at: string
}

interface ComputeLine {
  account_id: string; account_code: string; account_name: string; account_type: string
  currency_code: string; original_balance: number; fx_rate_used: number
  revalued_balance: number; gain_loss: number
}

interface ComputeResult {
  period: string; run_date: string; functional_currency: string
  lines: ComputeLine[]; total_gain_loss: number
}

interface GLAccount { id: string; code: string; name: string }

const STATUS_BADGE: Record<string, 'neutral' | 'success' | 'warning'> = {
  draft: 'neutral', posted: 'success', reversed: 'warning',
}

const todayStr = new Date().toISOString().slice(0, 10)
const currentPeriod = new Date().toISOString().slice(0, 7)

export default function RevaluationPage() {
  const { theme } = useTheme()
  const [runs, setRuns]           = useState<Run[]>([])
  const [loading, setLoading]     = useState(true)
  const [showCompute, setShowCompute] = useState(false)
  const [computing, setComputing] = useState(false)
  const [posting, setPosting]     = useState(false)
  const [preview, setPreview]     = useState<ComputeResult | null>(null)
  const [glAccounts, setGlAccounts] = useState<GLAccount[]>([])
  const [reversing, setReversing] = useState<string | null>(null)
  const [reverseModal, setReverseModal] = useState<{ runId: string; period: string } | null>(null)
  const [reverseDate, setReverseDate] = useState(todayStr)

  const [computeForm, setComputeForm] = useState({
    period: currentPeriod,
    run_date: todayStr,
    functional_currency: 'IQD',
    gain_account_id: '',
    loss_account_id: '',
    notes: '',
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [runsRes, glRes] = await Promise.all([
        api.get<Run[]>('/finance/revaluation'),
        api.get<GLAccount[]>('/finance/accounts?limit=500'),
      ])
      setRuns(runsRes.data)
      setGlAccounts(glRes.data)
    } catch { /* handled */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  async function handleCompute() {
    setComputing(true)
    try {
      const r = await api.post<ComputeResult>('/finance/revaluation/compute', {
        period: computeForm.period,
        run_date: computeForm.run_date,
        functional_currency: computeForm.functional_currency,
      })
      setPreview(r.data)
    } catch { /* handled */ }
    finally { setComputing(false) }
  }

  async function handlePost() {
    if (!preview || !computeForm.gain_account_id || !computeForm.loss_account_id) return
    setPosting(true)
    try {
      await api.post('/finance/revaluation/post', {
        ...computeForm,
        lines: preview.lines,
      })
      setShowCompute(false)
      setPreview(null)
      setComputeForm({ period: currentPeriod, run_date: todayStr, functional_currency: 'IQD', gain_account_id: '', loss_account_id: '', notes: '' })
      void load()
    } catch { /* handled */ }
    finally { setPosting(false) }
  }

  async function handleReverse() {
    if (!reverseModal) return
    setReversing(reverseModal.runId)
    try {
      await api.post(`/finance/revaluation/${reverseModal.runId}/reverse`, { reversal_date: reverseDate })
      setReverseModal(null)
      void load()
    } catch { /* handled */ }
    finally { setReversing(null) }
  }

  const inputStyle = {
    background: theme.bgSurface, border: `1px solid ${theme.border}`,
    borderRadius: '8px', padding: '6px 10px', fontSize: '12px',
    color: theme.textPrimary, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' as const,
  }
  const labelStyle = { fontSize: '11px', color: theme.textMuted, marginBottom: '3px', display: 'block' as const }

  const totalGainLoss = runs.filter(r => r.status === 'posted').reduce((s, r) => s + Number(r.total_gain_loss), 0)
  const gains  = runs.filter(r => r.status === 'posted' && Number(r.total_gain_loss) > 0).reduce((s, r) => s + Number(r.total_gain_loss), 0)
  const losses = runs.filter(r => r.status === 'posted' && Number(r.total_gain_loss) < 0).reduce((s, r) => s + Number(r.total_gain_loss), 0)

  return (
    <div style={{ padding: '24px' }}>
      <PageHeader
        title="Currency Revaluation"
        subtitle="Revalue foreign-currency monetary balances at period-end rates and post unrealized gain/loss entries"
        actions={<Button variant="primary" size="sm" onClick={() => setShowCompute(true)}>+ New Revaluation Run</Button>}
      />

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: '12px', marginBottom: '20px' }}>
        <Card padding="sm">
          <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>Total Runs</p>
          <p style={{ fontSize: '24px', fontWeight: 700, color: theme.textPrimary }}>{runs.length}</p>
        </Card>
        <Card padding="sm">
          <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>Posted</p>
          <p style={{ fontSize: '24px', fontWeight: 700, color: '#22c55e' }}>{runs.filter(r => r.status === 'posted').length}</p>
        </Card>
        <Card padding="sm">
          <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>Net Gain / (Loss)</p>
          <p style={{ fontSize: '20px', fontWeight: 700, color: totalGainLoss >= 0 ? '#22c55e' : '#ef4444', fontFamily: 'monospace' }}>
            {totalGainLoss >= 0 ? '+' : ''}{totalGainLoss.toLocaleString()}
          </p>
        </Card>
        <Card padding="sm">
          <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>Total Gains</p>
          <AmountDisplay amount={gains} currency="IQD" size="md" colored />
        </Card>
        <Card padding="sm">
          <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>Total Losses</p>
          <p style={{ fontSize: '20px', fontWeight: 700, color: losses < 0 ? '#ef4444' : theme.textMuted, fontFamily: 'monospace' }}>
            {losses.toLocaleString()}
          </p>
        </Card>
      </div>

      {/* Runs table */}
      <Card padding="none">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead>
            <tr style={{ background: theme.bgSurface, borderBottom: `1px solid ${theme.border}` }}>
              {['Period', 'Run Date', 'Lines', 'Total Gain / (Loss)', 'Journal Entry', 'Status', ''].map(h => (
                <th key={h} style={{ padding: '9px 12px', textAlign: 'left', color: theme.textMuted, fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} style={{ padding: '24px', textAlign: 'center', color: theme.textMuted }}>Loading...</td></tr>}
            {!loading && !runs.length && (
              <tr><td colSpan={7} style={{ padding: '24px', textAlign: 'center', color: theme.textMuted }}>
                No revaluation runs yet. Click "+ New Revaluation Run" to create one.
              </td></tr>
            )}
            {runs.map(r => (
              <tr key={r.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                <td style={{ padding: '9px 12px', fontFamily: 'monospace', color: theme.textPrimary, fontWeight: 600 }}>{r.period}</td>
                <td style={{ padding: '9px 12px', color: theme.textSecondary }}>{new Date(r.run_date).toLocaleDateString()}</td>
                <td style={{ padding: '9px 12px', color: theme.textSecondary, textAlign: 'center' }}>{r.line_count}</td>
                <td style={{ padding: '9px 12px', fontFamily: 'monospace', fontWeight: 700, color: Number(r.total_gain_loss) >= 0 ? '#22c55e' : '#ef4444' }}>
                  {Number(r.total_gain_loss) >= 0 ? '+' : ''}{Number(r.total_gain_loss).toLocaleString()}
                </td>
                <td style={{ padding: '9px 12px', color: r.journal_entry_id ? theme.accent : theme.textMuted, fontSize: '11px', fontFamily: 'monospace' }}>
                  {r.journal_entry_id ? r.journal_entry_id.slice(0, 8) + '…' : '—'}
                </td>
                <td style={{ padding: '9px 12px' }}>
                  <Badge variant={STATUS_BADGE[r.status] ?? 'neutral'}>{r.status}</Badge>
                </td>
                <td style={{ padding: '9px 12px' }}>
                  {r.status === 'posted' && (
                    <Button variant="ghost" size="sm" onClick={() => setReverseModal({ runId: r.id, period: r.period })}>
                      Reverse
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Compute / New Run Modal */}
      {showCompute && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <Card padding="lg" style={{ width: '680px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, color: theme.textPrimary, fontSize: '15px' }}>New Revaluation Run</h3>
              <Button variant="ghost" size="sm" onClick={() => { setShowCompute(false); setPreview(null) }}>✕</Button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <div>
                <label style={labelStyle}>Period (YYYY-MM) *</label>
                <input style={inputStyle} value={computeForm.period} placeholder="2025-06"
                  onChange={e => setComputeForm(f => ({ ...f, period: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>Run Date *</label>
                <input type="date" style={inputStyle} value={computeForm.run_date}
                  onChange={e => setComputeForm(f => ({ ...f, run_date: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>Functional Currency</label>
                <select style={inputStyle} value={computeForm.functional_currency}
                  onChange={e => setComputeForm(f => ({ ...f, functional_currency: e.target.value }))}>
                  <option value="IQD">IQD</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Notes</label>
                <input style={inputStyle} value={computeForm.notes}
                  onChange={e => setComputeForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>

            <Button variant="ghost" size="sm" onClick={() => void handleCompute()} disabled={computing || !computeForm.period}>
              {computing ? 'Computing...' : 'Compute Preview'}
            </Button>

            {/* Preview results */}
            {preview && (
              <>
                <div style={{ marginTop: '16px', background: preview.total_gain_loss >= 0 ? '#22c55e18' : '#ef444418', border: `1px solid ${preview.total_gain_loss >= 0 ? '#22c55e' : '#ef4444'}`, borderRadius: '8px', padding: '10px 14px', marginBottom: '12px' }}>
                  <p style={{ fontSize: '13px', fontWeight: 700, color: preview.total_gain_loss >= 0 ? '#22c55e' : '#ef4444', margin: 0 }}>
                    Net Gain/(Loss): {preview.total_gain_loss >= 0 ? '+' : ''}{preview.total_gain_loss.toLocaleString()} {computeForm.functional_currency}
                  </p>
                  <p style={{ fontSize: '11px', color: theme.textMuted, marginTop: '4px' }}>{preview.lines.length} accounts to revalue</p>
                </div>

                <div style={{ maxHeight: '240px', overflowY: 'auto', marginBottom: '16px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                    <thead>
                      <tr style={{ background: theme.bgSurface }}>
                        {['Account', 'CCY', 'Current Balance', 'Rate', 'Revalued', 'Gain/(Loss)'].map(h => (
                          <th key={h} style={{ padding: '6px 8px', textAlign: 'right', color: theme.textMuted, fontWeight: 500 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.lines.map(l => (
                        <tr key={l.account_id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                          <td style={{ padding: '5px 8px', textAlign: 'left' }}>
                            <span style={{ fontFamily: 'monospace', color: theme.textMuted, fontSize: '10px' }}>{l.account_code}</span>
                            <span style={{ color: theme.textPrimary, marginLeft: '6px' }}>{l.account_name}</span>
                          </td>
                          <td style={{ padding: '5px 8px', textAlign: 'right', fontFamily: 'monospace' }}>{l.currency_code}</td>
                          <td style={{ padding: '5px 8px', textAlign: 'right', fontFamily: 'monospace' }}>{l.original_balance.toLocaleString()}</td>
                          <td style={{ padding: '5px 8px', textAlign: 'right', fontFamily: 'monospace' }}>{l.fx_rate_used}</td>
                          <td style={{ padding: '5px 8px', textAlign: 'right', fontFamily: 'monospace' }}>{l.revalued_balance.toLocaleString()}</td>
                          <td style={{ padding: '5px 8px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: l.gain_loss >= 0 ? '#22c55e' : '#ef4444' }}>
                            {l.gain_loss >= 0 ? '+' : ''}{l.gain_loss.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                  <div>
                    <label style={labelStyle}>Unrealized FX Gain Account *</label>
                    <select style={inputStyle} value={computeForm.gain_account_id}
                      onChange={e => setComputeForm(f => ({ ...f, gain_account_id: e.target.value }))}>
                      <option value="">— Select GL account —</option>
                      {glAccounts.map(g => <option key={g.id} value={g.id}>{g.code} · {g.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Unrealized FX Loss Account *</label>
                    <select style={inputStyle} value={computeForm.loss_account_id}
                      onChange={e => setComputeForm(f => ({ ...f, loss_account_id: e.target.value }))}>
                      <option value="">— Select GL account —</option>
                      {glAccounts.map(g => <option key={g.id} value={g.id}>{g.code} · {g.name}</option>)}
                    </select>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <Button variant="ghost" size="sm" onClick={() => { setShowCompute(false); setPreview(null) }}>Cancel</Button>
                  <Button variant="primary" size="sm"
                    onClick={() => void handlePost()}
                    disabled={posting || !computeForm.gain_account_id || !computeForm.loss_account_id || !preview.lines.length}>
                    {posting ? 'Posting...' : 'Post Revaluation Entry'}
                  </Button>
                </div>
              </>
            )}
          </Card>
        </div>
      )}

      {/* Reverse Confirmation Modal */}
      {reverseModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <Card padding="lg" style={{ width: '380px' }}>
            <h3 style={{ margin: '0 0 12px', color: theme.textPrimary, fontSize: '15px' }}>Reverse Revaluation</h3>
            <p style={{ fontSize: '12px', color: theme.textSecondary, marginBottom: '16px' }}>
              This will create a reversal journal entry that cancels the FX revaluation for period <strong>{reverseModal.period}</strong>.
            </p>
            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>Reversal Date</label>
              <input type="date" style={inputStyle} value={reverseDate} onChange={e => setReverseDate(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <Button variant="ghost" size="sm" onClick={() => setReverseModal(null)}>Cancel</Button>
              <Button variant="primary" size="sm" onClick={() => void handleReverse()} disabled={!!reversing}>
                {reversing ? 'Reversing...' : 'Confirm Reversal'}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
