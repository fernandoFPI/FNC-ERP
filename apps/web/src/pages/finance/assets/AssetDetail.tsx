import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import { api } from '../../../lib/axios'

interface ScheduleLine {
  id: string; period: string; period_date: string
  depreciation_amount: number; accumulated_depreciation: number; book_value_after: number
  status: 'pending' | 'posted' | 'skipped'
}

interface Asset {
  id: string; asset_number: string; name: string; description: string | null
  category_name: string | null; serial_number: string | null; location: string | null
  purchase_date: string; purchase_cost: number; salvage_value: number
  useful_life_months: number; depreciation_method: string; declining_rate: number | null
  accumulated_depreciation: number; book_value: number
  asset_account_id: string | null; asset_account_name: string | null; asset_account_code: string | null
  accum_dep_account_id: string | null; accum_dep_account_name: string | null; accum_dep_account_code: string | null
  dep_expense_account_id: string | null; dep_expense_account_name: string | null; dep_expense_account_code: string | null
  status: 'draft' | 'active' | 'fully_depreciated' | 'disposed'
  activation_date: string | null; disposal_date: string | null
  disposal_proceeds: number | null; disposal_gain_loss: number | null; disposal_notes: string | null
  notes: string | null; schedule: ScheduleLine[]
}

const STATUS_BADGE: Record<string, 'neutral' | 'success' | 'warning' | 'danger' | 'info'> = {
  draft: 'neutral', active: 'success', fully_depreciated: 'info', disposed: 'danger',
}

export default function AssetDetail() {
  const { theme } = useTheme()
  const navigate  = useNavigate()
  const { id }    = useParams<{ id: string }>()
  const [asset, setAsset] = useState<Asset | null>(null)
  const [tab, setTab]     = useState<'overview' | 'schedule'>('overview')
  const [activating, setActivating] = useState(false)
  const [disposing, setDisposing]   = useState(false)
  const [showDispose, setShowDispose] = useState(false)
  const [disposeForm, setDisposeForm] = useState({ disposal_date: new Date().toISOString().slice(0, 10), disposal_proceeds: '0', disposal_notes: '', gain_loss_account_id: '', cash_account_id: '' })

  async function load() {
    if (!id) return
    try {
      const r = await api.get<Asset>(`/finance/assets/${id}`)
      setAsset(r.data)
    } catch { navigate('/finance/assets') }
  }

  useEffect(() => { void load() }, [id])

  async function handleActivate() {
    if (!id || !confirm('Activate this asset? This will generate the full depreciation schedule.')) return
    setActivating(true)
    try {
      await api.post(`/finance/assets/${id}/activate`, {})
      await load()
    } catch { alert('Failed to activate asset') }
    finally { setActivating(false) }
  }

  async function handleDispose(e: React.FormEvent) {
    e.preventDefault()
    if (!id) return
    setDisposing(true)
    try {
      await api.post(`/finance/assets/${id}/dispose`, {
        disposal_date: disposeForm.disposal_date,
        disposal_proceeds: Number(disposeForm.disposal_proceeds),
        disposal_notes: disposeForm.disposal_notes || undefined,
        gain_loss_account_id: disposeForm.gain_loss_account_id || undefined,
        cash_account_id: disposeForm.cash_account_id || undefined,
      })
      setShowDispose(false)
      await load()
    } catch { alert('Failed to dispose asset') }
    finally { setDisposing(false) }
  }

  if (!asset) return <div style={{ padding: '24px', color: theme.textMuted }}>Loading...</div>

  const depPct = asset.purchase_cost > 0 ? Math.round((asset.accumulated_depreciation / asset.purchase_cost) * 100) : 0
  const postedCount  = asset.schedule.filter(s => s.status === 'posted').length
  const pendingCount = asset.schedule.filter(s => s.status === 'pending').length

  const row = (label: string, value: React.ReactNode) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${theme.border}`, fontSize: '12px' }}>
      <span style={{ color: theme.textMuted }}>{label}</span>
      <span style={{ color: theme.textPrimary, fontWeight: 500, textAlign: 'right' }}>{value ?? '—'}</span>
    </div>
  )

  return (
    <div style={{ padding: '24px' }}>
      <PageHeader
        title={asset.name}
        subtitle={asset.asset_number}
        actions={
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <Badge variant={STATUS_BADGE[asset.status] ?? 'neutral'}>{asset.status.replace('_', ' ')}</Badge>
            {asset.status === 'draft' && (
              <>
                <Button variant="secondary" size="sm" onClick={() => navigate(`/finance/assets/${id}/edit`)}>Edit</Button>
                <Button variant="primary" size="sm" onClick={() => void handleActivate()} disabled={activating}>
                  {activating ? 'Activating...' : 'Activate'}
                </Button>
              </>
            )}
            {['active', 'fully_depreciated'].includes(asset.status) && (
              <Button variant="danger" size="sm" onClick={() => setShowDispose(true)}>Dispose</Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => navigate('/finance/assets')}>← Back</Button>
          </div>
        }
      />

      {/* Progress Bar */}
      <Card padding="sm" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: theme.textMuted, marginBottom: '6px' }}>
          <span>Depreciation Progress</span>
          <span>{depPct}% depreciated — {postedCount} of {asset.schedule.length} periods posted</span>
        </div>
        <div style={{ height: '8px', background: theme.border, borderRadius: '4px', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${depPct}%`, background: depPct >= 100 ? '#6b7280' : theme.accent, borderRadius: '4px', transition: 'width 0.3s' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px', marginTop: '12px' }}>
          {[
            { label: 'Cost', value: <AmountDisplay amount={asset.purchase_cost} currency="IQD" size="sm" /> },
            { label: 'Accum. Dep.', value: <AmountDisplay amount={asset.accumulated_depreciation} currency="IQD" size="sm" /> },
            { label: 'Book Value', value: <AmountDisplay amount={asset.book_value} currency="IQD" size="sm" colored /> },
            { label: 'Salvage Value', value: <AmountDisplay amount={asset.salvage_value} currency="IQD" size="sm" /> },
          ].map(kpi => (
            <div key={kpi.label}>
              <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '2px' }}>{kpi.label}</p>
              {kpi.value}
            </div>
          ))}
        </div>
      </Card>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0', marginBottom: '16px', borderBottom: `1px solid ${theme.border}` }}>
        {(['overview', 'schedule'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '8px 16px', fontSize: '12px', border: 'none', background: 'transparent', cursor: 'pointer',
            color: tab === t ? theme.accent : theme.textSecondary, fontWeight: tab === t ? 600 : 400,
            borderBottom: tab === t ? `2px solid ${theme.accent}` : '2px solid transparent',
          }}>
            {t === 'overview' ? 'Overview' : `Schedule (${asset.schedule.length})`}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <Card padding="md">
            <p style={{ fontSize: '12px', fontWeight: 600, color: theme.textPrimary, marginBottom: '12px' }}>Asset Details</p>
            {row('Asset Number', asset.asset_number)}
            {row('Category', asset.category_name)}
            {row('Serial Number', asset.serial_number)}
            {row('Location', asset.location)}
            {row('Purchase Date', new Date(asset.purchase_date).toLocaleDateString())}
            {row('Activation Date', asset.activation_date ? new Date(asset.activation_date).toLocaleDateString() : null)}
            {asset.notes && row('Notes', asset.notes)}
          </Card>
          <Card padding="md">
            <p style={{ fontSize: '12px', fontWeight: 600, color: theme.textPrimary, marginBottom: '12px' }}>Depreciation Settings</p>
            {row('Method', asset.depreciation_method === 'straight_line' ? 'Straight Line' : 'Declining Balance')}
            {row('Useful Life', `${asset.useful_life_months} months (${Math.round(asset.useful_life_months / 12 * 10) / 10} years)`)}
            {row('Declining Rate', asset.declining_rate != null ? `${(asset.declining_rate * 100).toFixed(0)}% p.a.` : null)}
            {row('Monthly Dep. (SL)', ((asset.purchase_cost - asset.salvage_value) / asset.useful_life_months).toLocaleString(undefined, { maximumFractionDigits: 2 }))}
            {row('Periods Posted', `${postedCount}`)}
            {row('Periods Pending', `${pendingCount}`)}
            <p style={{ fontSize: '12px', fontWeight: 600, color: theme.textPrimary, margin: '12px 0 12px' }}>GL Accounts</p>
            {row('Asset Account', asset.asset_account_code ? `${asset.asset_account_code} — ${asset.asset_account_name}` : null)}
            {row('Accum. Dep. Account', asset.accum_dep_account_code ? `${asset.accum_dep_account_code} — ${asset.accum_dep_account_name}` : null)}
            {row('Dep. Expense Account', asset.dep_expense_account_code ? `${asset.dep_expense_account_code} — ${asset.dep_expense_account_name}` : null)}
            {(!asset.asset_account_id || !asset.accum_dep_account_id || !asset.dep_expense_account_id) && (
              <div style={{ marginTop: '8px', padding: '8px', background: '#fef3c7', borderRadius: '6px', fontSize: '11px', color: '#92400e' }}>
                GL accounts not fully configured — depreciation entries won't be posted as journal entries.
              </div>
            )}
          </Card>
          {asset.status === 'disposed' && (
            <Card padding="md" style={{ gridColumn: '1 / -1', borderColor: '#ef4444' }}>
              <p style={{ fontSize: '12px', fontWeight: 600, color: '#ef4444', marginBottom: '12px' }}>Disposal Details</p>
              {row('Disposal Date', asset.disposal_date ? new Date(asset.disposal_date).toLocaleDateString() : null)}
              {row('Proceeds', asset.disposal_proceeds != null ? <AmountDisplay amount={asset.disposal_proceeds} currency="IQD" size="sm" /> : null)}
              {row('Gain / (Loss)', asset.disposal_gain_loss != null ? (
                <span style={{ color: (asset.disposal_gain_loss) >= 0 ? '#22c55e' : '#ef4444' }}>
                  {asset.disposal_gain_loss >= 0 ? '+' : ''}{asset.disposal_gain_loss.toLocaleString()}
                </span>
              ) : null)}
              {asset.disposal_notes && row('Notes', asset.disposal_notes)}
            </Card>
          )}
        </div>
      )}

      {tab === 'schedule' && (
        <Card padding="none">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: theme.bgSurface, borderBottom: `1px solid ${theme.border}` }}>
                {['Period', 'Depreciation', 'Accum. Dep.', 'Book Value', 'Status'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', color: theme.textMuted, fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!asset.schedule.length && (
                <tr><td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: theme.textMuted }}>
                  Schedule will be generated when the asset is activated.
                </td></tr>
              )}
              {asset.schedule.map(s => (
                <tr key={s.id} style={{ borderBottom: `1px solid ${theme.border}`, background: s.period === new Date().toISOString().slice(0, 7) ? `${theme.accentBg}` : 'transparent' }}>
                  <td style={{ padding: '8px 14px', color: theme.textPrimary, fontFamily: 'monospace' }}>{s.period}</td>
                  <td style={{ padding: '8px 14px' }}><AmountDisplay amount={s.depreciation_amount} currency="IQD" size="sm" /></td>
                  <td style={{ padding: '8px 14px' }}><AmountDisplay amount={s.accumulated_depreciation} currency="IQD" size="sm" /></td>
                  <td style={{ padding: '8px 14px' }}><AmountDisplay amount={s.book_value_after} currency="IQD" size="sm" colored /></td>
                  <td style={{ padding: '8px 14px' }}>
                    <Badge variant={s.status === 'posted' ? 'success' : s.status === 'skipped' ? 'danger' : 'neutral'}>{s.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Dispose Modal */}
      {showDispose && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <Card padding="md" style={{ width: '440px' }}>
            <p style={{ fontSize: '14px', fontWeight: 600, color: theme.textPrimary, marginBottom: '16px' }}>Dispose Asset</p>
            <form onSubmit={(e) => { void handleDispose(e) }}>
              {[
                { label: 'Disposal Date *', key: 'disposal_date', type: 'date' },
                { label: 'Proceeds Received', key: 'disposal_proceeds', type: 'number' },
              ].map(f => (
                <div key={f.key} style={{ marginBottom: '12px' }}>
                  <label style={{ fontSize: '11px', color: theme.textMuted, display: 'block', marginBottom: '4px' }}>{f.label}</label>
                  <input type={f.type} value={disposeForm[f.key as keyof typeof disposeForm]}
                    onChange={e => setDisposeForm(p => ({ ...p, [f.key]: e.target.value }))}
                    style={{ width: '100%', background: theme.bgSurface, border: `1px solid ${theme.border}`, borderRadius: '8px', padding: '7px 10px', fontSize: '13px', color: theme.textPrimary, fontFamily: 'inherit', boxSizing: 'border-box' }} />
                </div>
              ))}
              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '11px', color: theme.textMuted, display: 'block', marginBottom: '4px' }}>Notes</label>
                <textarea value={disposeForm.disposal_notes} onChange={e => setDisposeForm(p => ({ ...p, disposal_notes: e.target.value }))}
                  rows={2} style={{ width: '100%', background: theme.bgSurface, border: `1px solid ${theme.border}`, borderRadius: '8px', padding: '7px 10px', fontSize: '13px', color: theme.textPrimary, fontFamily: 'inherit', resize: 'none', boxSizing: 'border-box' }} />
              </div>
              <div style={{ padding: '10px', background: theme.bgSurface, borderRadius: '6px', fontSize: '11px', color: theme.textMuted, marginBottom: '16px' }}>
                Book value: <strong style={{ color: theme.textPrimary }}>{asset.book_value.toLocaleString()}</strong> —
                Estimated {Number(disposeForm.disposal_proceeds) >= asset.book_value ? 'gain' : 'loss'}:
                <strong style={{ color: Number(disposeForm.disposal_proceeds) >= asset.book_value ? '#22c55e' : '#ef4444' }}>
                  {' '}{(Number(disposeForm.disposal_proceeds) - asset.book_value).toLocaleString()}
                </strong>
              </div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <Button type="button" variant="ghost" onClick={() => setShowDispose(false)}>Cancel</Button>
                <Button type="submit" variant="danger" disabled={disposing}>{disposing ? 'Disposing...' : 'Confirm Disposal'}</Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  )
}
