import { useState } from 'react'
import { useQuery, useMutation } from '@apollo/client'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { Input } from '../../../components/ui/Input'
import { Select } from '../../../components/ui/Select'
import { EmptyState } from '../../../components/ui/EmptyState'
import { useToastStore } from '../../../store/toastStore'
import {
  INTERCO_PRICING_SETTINGS_QUERY,
  INTERCO_PRICING_HISTORY_QUERY,
  UPDATE_INTERCO_PRICING,
} from '../../../graphql/interco'

interface PricingSettings {
  companyId: string
  companyName: string
  method: string
  costPlusMarkupPct: number
  updatedAt: string
  updatedByEmail: string
}

interface PricingHistory {
  previousMethod: string
  newMethod: string
  changedBy: string
  changedAt: string
  notes: string
}

interface SettingsData {
  companyIntercoPricingSettings: PricingSettings
}

interface HistoryData {
  intercoPricingConfigHistory: PricingHistory[]
}

const COMPANIES = [
  { id: '1', name: 'Yakam' },
  { id: '2', name: 'Factory' },
  { id: '3', name: 'Watanyia' },
]

export default function TransferPricingPage() {
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)

  const [selectedCompanyId, setSelectedCompanyId] = useState('1')
  const [editMethod, setEditMethod] = useState('')
  const [editMarkupPct, setEditMarkupPct] = useState('')
  const [editing, setEditing] = useState(false)

  const { data: settingsData, loading: settingsLoading, refetch: refetchSettings } = useQuery<SettingsData>(
    INTERCO_PRICING_SETTINGS_QUERY,
    { variables: { companyId: selectedCompanyId } }
  )

  const { data: historyData, loading: historyLoading } = useQuery<HistoryData>(
    INTERCO_PRICING_HISTORY_QUERY,
    { variables: { companyId: selectedCompanyId } }
  )

  const [updatePricing, { loading: updating }] = useMutation(UPDATE_INTERCO_PRICING, {
    onCompleted: () => {
      addToast({ type: 'success', message: 'Transfer pricing updated' })
      setEditing(false)
      refetchSettings()
    },
    onError: (e) => addToast({ type: 'error', message: e.message }),
  })

  const settings = settingsData?.companyIntercoPricingSettings
  const history = historyData?.intercoPricingConfigHistory ?? []

  function handleEdit() {
    setEditMethod(settings?.method ?? 'avco')
    setEditMarkupPct(String(settings?.costPlusMarkupPct ?? 0))
    setEditing(true)
  }

  function handleSave() {
    updatePricing({
      variables: {
        companyId: selectedCompanyId,
        input: {
          method: editMethod,
          costPlusMarkupPct: parseFloat(editMarkupPct),
        },
      },
    })
  }

  return (
    <div style={{ padding: '24px' }}>
      <PageHeader
        title="Transfer Pricing Settings"
        subtitle="Configure intercompany stock transfer pricing per entity"
      />

      {/* Company selector */}
      <Card padding="sm" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '12px', color: theme.textMuted }}>Company:</span>
          <Select
            value={selectedCompanyId}
            onChange={(e) => { setSelectedCompanyId(e.target.value); setEditing(false) }}
            options={COMPANIES.map(c => ({ value: c.id, label: c.name }))}
            style={{ minWidth: '160px' }}
          />
        </div>
      </Card>

      {settingsLoading ? (
        <div className="skeleton" style={{ height: '160px', borderRadius: '12px', marginBottom: '16px' }} />
      ) : settings ? (
        <Card padding="md" style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
            <div>
              <h3 style={{ fontSize: '15px', fontWeight: 600, color: theme.textPrimary, marginBottom: '4px' }}>{settings.companyName}</h3>
              <p style={{ fontSize: '12px', color: theme.textMuted }}>Last updated by {settings.updatedByEmail} · {new Date(settings.updatedAt).toLocaleDateString()}</p>
            </div>
            {!editing && (
              <Button variant="secondary" size="sm" onClick={handleEdit}>Edit</Button>
            )}
          </div>

          {editing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <Select
                label="Pricing Method"
                value={editMethod}
                onChange={(e) => setEditMethod(e.target.value)}
                options={[
                  { value: 'avco', label: 'AVCO (Average Cost)' },
                  { value: 'cost_plus', label: 'Cost Plus Markup' },
                  { value: 'market', label: 'Market Price' },
                ]}
              />
              {editMethod === 'cost_plus' && (
                <Input
                  label="Markup % (Cost Plus)"
                  type="number"
                  value={editMarkupPct}
                  onChange={(e) => setEditMarkupPct(e.target.value)}
                  placeholder="e.g. 10"
                  suffix={<span style={{ color: theme.textMuted }}>%</span>}
                />
              )}
              <div style={{ display: 'flex', gap: '8px' }}>
                <Button variant="primary" size="sm" onClick={handleSave} loading={updating}>Save</Button>
                <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={updating}>Cancel</Button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '16px' }}>
              <div>
                <p style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '4px' }}>Method</p>
                <Badge variant="accent">{settings.method.replace('_', ' ').toUpperCase()}</Badge>
              </div>
              {settings.method === 'cost_plus' && (
                <div>
                  <p style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '4px' }}>Markup %</p>
                  <p style={{ fontSize: '18px', fontWeight: 500, color: theme.textPrimary }}>{settings.costPlusMarkupPct}%</p>
                </div>
              )}
            </div>
          )}
        </Card>
      ) : (
        <EmptyState title="No settings" message="No pricing settings configured for this company." />
      )}

      {/* History */}
      <Card padding="none">
        <div style={{ padding: '16px 20px 12px', borderBottom: `1px solid ${theme.border}` }}>
          <h3 style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary }}>Change History</h3>
        </div>
        {historyLoading ? (
          <div style={{ padding: '24px' }}>
            <div className="skeleton" style={{ height: '120px', borderRadius: '8px' }} />
          </div>
        ) : history.length ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: theme.bgSurface }}>
                  {['Previous', 'New', 'Changed By', 'Date', 'Notes'].map((h) => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '10px', fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: `1px solid ${theme.border}`, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.map((h, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${theme.tableBorder}` }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = theme.tableRowHover }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}>
                    <td style={{ padding: '12px 14px' }}><Badge variant="neutral" size="sm">{h.previousMethod}</Badge></td>
                    <td style={{ padding: '12px 14px' }}><Badge variant="accent" size="sm">{h.newMethod}</Badge></td>
                    <td style={{ padding: '12px 14px', color: theme.textSecondary }}>{h.changedBy}</td>
                    <td style={{ padding: '12px 14px', color: theme.textMuted, fontSize: '12px' }}>{new Date(h.changedAt).toLocaleString()}</td>
                    <td style={{ padding: '12px 14px', color: theme.textMuted, fontSize: '12px' }}>{h.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No history" message="No configuration changes recorded yet." />
        )}
      </Card>
    </div>
  )
}
