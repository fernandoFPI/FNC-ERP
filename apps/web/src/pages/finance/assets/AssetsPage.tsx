import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import { api } from '../../../lib/axios'

interface AssetSummary {
  active_count: number
  fully_depreciated_count: number
  disposed_count: number
  total_cost: number
  total_book_value: number
  total_accum_dep: number
  pending_this_month: number
}

interface Asset {
  id: string
  asset_number: string
  name: string
  category_name: string | null
  purchase_date: string
  purchase_cost: number
  book_value: number
  accumulated_depreciation: number
  useful_life_months: number
  depreciation_method: string
  status: 'draft' | 'active' | 'fully_depreciated' | 'disposed'
  location: string | null
}

const STATUS_BADGE: Record<string, 'neutral' | 'success' | 'warning' | 'danger' | 'info'> = {
  draft: 'neutral',
  active: 'success',
  fully_depreciated: 'info',
  disposed: 'danger',
}

export default function AssetsPage() {
  const { theme } = useTheme()
  const navigate = useNavigate()
  const [summary, setSummary] = useState<AssetSummary | null>(null)
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [runningDep, setRunningDep] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [sumRes, listRes] = await Promise.all([
        api.get<AssetSummary>('/finance/assets/summary'),
        api.get<Asset[]>('/finance/assets', { params: { status: statusFilter || undefined, search: search || undefined } }),
      ])
      setSummary(sumRes.data)
      setAssets(listRes.data)
    } catch { /* handled by interceptor */ }
    finally { setLoading(false) }
  }, [statusFilter, search])

  useEffect(() => { void load() }, [load])

  async function handleRunDepreciation() {
    const now = new Date()
    now.setMonth(now.getMonth() - 1)
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    if (!confirm(`Post depreciation for ${period}? This will create journal entries for all active assets.`)) return
    setRunningDep(true)
    try {
      const r = await api.post<{ posted: number; period: string }>('/finance/assets/run-depreciation', { period })
      alert(`Posted ${r.data.posted} depreciation entries for ${r.data.period}`)
      void load()
    } catch { alert('Failed to run depreciation') }
    finally { setRunningDep(false) }
  }

  const inputStyle = {
    background: theme.bgSurface,
    border: `1px solid ${theme.border}`,
    borderRadius: '8px',
    padding: '6px 10px',
    fontSize: '12px',
    color: theme.textSecondary,
    fontFamily: 'inherit',
  }

  return (
    <div style={{ padding: '24px' }}>
      <PageHeader
        title="Fixed Assets"
        subtitle="Asset register and depreciation management"
        actions={
          <div style={{ display: 'flex', gap: '8px' }}>
            {(summary?.pending_this_month ?? 0) > 0 && (
              <Button variant="secondary" size="sm" onClick={() => void handleRunDepreciation()} disabled={runningDep}>
                {runningDep ? 'Running...' : `Run Depreciation (${summary?.pending_this_month} pending)`}
              </Button>
            )}
            <Button variant="primary" size="sm" onClick={() => navigate('/finance/assets/new')}>+ New Asset</Button>
          </div>
        }
      />

      {/* KPI Row */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: '12px', marginBottom: '20px' }}>
          <Card padding="sm">
            <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>Total Cost</p>
            <AmountDisplay amount={summary.total_cost} currency="IQD" size="md" />
          </Card>
          <Card padding="sm">
            <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>Net Book Value</p>
            <AmountDisplay amount={summary.total_book_value} currency="IQD" size="md" colored />
          </Card>
          <Card padding="sm">
            <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>Accum. Depreciation</p>
            <AmountDisplay amount={summary.total_accum_dep} currency="IQD" size="md" />
          </Card>
          <Card padding="sm">
            <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>Active Assets</p>
            <p style={{ fontSize: '20px', fontWeight: 700, color: theme.textPrimary }}>{summary.active_count}</p>
          </Card>
          <Card padding="sm">
            <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>Fully Depreciated</p>
            <p style={{ fontSize: '20px', fontWeight: 700, color: theme.textPrimary }}>{summary.fully_depreciated_count}</p>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card padding="sm" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input placeholder="Search name or number..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...inputStyle, width: '220px' }} />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={inputStyle}>
            <option value="">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="fully_depreciated">Fully Depreciated</option>
            <option value="disposed">Disposed</option>
          </select>
          <Button variant="ghost" size="sm" onClick={() => void load()}>Refresh</Button>
        </div>
      </Card>

      {/* Table */}
      <Card padding="none">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${theme.border}`, background: theme.bgSurface }}>
              {['Asset No.', 'Name', 'Category', 'Purchase Date', 'Cost', 'Book Value', 'Depreciated %', 'Status', ''].map(h => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', color: theme.textMuted, fontWeight: 500, whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={9} style={{ padding: '24px', textAlign: 'center', color: theme.textMuted }}>Loading...</td></tr>
            )}
            {!loading && !assets.length && (
              <tr><td colSpan={9} style={{ padding: '24px', textAlign: 'center', color: theme.textMuted }}>No assets found. <span style={{ color: theme.accent, cursor: 'pointer' }} onClick={() => navigate('/finance/assets/new')}>Add your first asset →</span></td></tr>
            )}
            {assets.map(a => {
              const depPct = a.purchase_cost > 0 ? Math.round((a.accumulated_depreciation / a.purchase_cost) * 100) : 0
              return (
                <tr key={a.id} style={{ borderBottom: `1px solid ${theme.border}`, cursor: 'pointer' }}
                    onClick={() => navigate(`/finance/assets/${a.id}`)}>
                  <td style={{ padding: '10px 14px', color: theme.accent, fontFamily: 'monospace' }}>{a.asset_number}</td>
                  <td style={{ padding: '10px 14px', color: theme.textPrimary, fontWeight: 500 }}>{a.name}</td>
                  <td style={{ padding: '10px 14px', color: theme.textSecondary }}>{a.category_name ?? '—'}</td>
                  <td style={{ padding: '10px 14px', color: theme.textSecondary }}>{new Date(a.purchase_date).toLocaleDateString()}</td>
                  <td style={{ padding: '10px 14px' }}><AmountDisplay amount={a.purchase_cost} currency="IQD" size="sm" /></td>
                  <td style={{ padding: '10px 14px' }}><AmountDisplay amount={a.book_value} currency="IQD" size="sm" colored /></td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '60px', height: '4px', borderRadius: '2px', background: theme.border }}>
                        <div style={{ width: `${depPct}%`, height: '100%', background: depPct >= 100 ? '#6b7280' : theme.accent, borderRadius: '2px' }} />
                      </div>
                      <span style={{ color: theme.textSecondary }}>{depPct}%</span>
                    </div>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <Badge variant={STATUS_BADGE[a.status] ?? 'neutral'}>{a.status.replace('_', ' ')}</Badge>
                  </td>
                  <td style={{ padding: '10px 14px' }} onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="sm" onClick={() => navigate(`/finance/assets/${a.id}`)}>View</Button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
