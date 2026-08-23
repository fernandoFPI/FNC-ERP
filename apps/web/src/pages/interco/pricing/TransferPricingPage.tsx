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
import type { Column } from '../../../components/ui/Table'
import { Table } from '../../../components/ui/Table'
import { useToastStore } from '../../../store/toastStore'
import { useCompanyStore } from '../../../store/companyStore'
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

export default function TransferPricingPage() {
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)
  const companies = useCompanyStore((s) => s.companies)
  const activeCompany = useCompanyStore((s) => s.activeCompany)

  // Was hardcoded to fake ids ('1','2','3') that don't exist as real company
  // UUIDs, so every query on this page failed with "invalid input syntax for
  // type uuid". Use the same real company list (with real ids) the entity
  // switcher already has for this logged-in user.
  const [selectedCompanyId, setSelectedCompanyId] = useState(
    () => activeCompany?.id ?? companies[0]?.id ?? '',
  )
  const [editMethod, setEditMethod] = useState('')
  const [editMarkupPct, setEditMarkupPct] = useState('')
  const [editing, setEditing] = useState(false)

  const {
    data: settingsData,
    loading: settingsLoading,
    refetch: refetchSettings,
  } = useQuery<SettingsData>(INTERCO_PRICING_SETTINGS_QUERY, {
    variables: { companyId: selectedCompanyId },
    skip: !selectedCompanyId,
  })

  const { data: historyData, loading: historyLoading } = useQuery<HistoryData>(
    INTERCO_PRICING_HISTORY_QUERY,
    { variables: { companyId: selectedCompanyId }, skip: !selectedCompanyId },
  )

  const [updatePricing, { loading: updating }] = useMutation(UPDATE_INTERCO_PRICING, {
    onCompleted: () => {
      addToast({ type: 'success', message: 'Transfer pricing updated' })
      setEditing(false)
      refetchSettings()
    },
    onError: (e) => {
      addToast({ type: 'error', message: e.message })
    },
  })

  const settings = settingsData?.companyIntercoPricingSettings
  const history = historyData?.intercoPricingConfigHistory ?? []

  const historyColumns: Column<PricingHistory>[] = [
    {
      key: 'previousMethod',
      header: 'Previous',
      mobilePriority: 1,
      render: (h) => (
        <Badge variant="neutral" size="sm">
          {h.previousMethod}
        </Badge>
      ),
    },
    {
      key: 'newMethod',
      header: 'New',
      mobilePrimary: true,
      render: (h) => (
        <Badge variant="accent" size="sm">
          {h.newMethod}
        </Badge>
      ),
    },
    {
      key: 'changedBy',
      header: 'Changed By',
      mobilePriority: 2,
      render: (h) => <span style={{ color: theme.textSecondary }}>{h.changedBy}</span>,
    },
    {
      key: 'changedAt',
      header: 'Date',
      mobileSecondary: true,
      render: (h) => (
        <span style={{ color: theme.textMuted, fontSize: '12px' }}>
          {new Date(h.changedAt).toLocaleString()}
        </span>
      ),
    },
    {
      key: 'notes',
      header: 'Notes',
      mobilePriority: 3,
      render: (h) => (
        <span style={{ color: theme.textMuted, fontSize: '12px' }}>{h.notes || '—'}</span>
      ),
    },
  ]

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
            onChange={(e) => {
              setSelectedCompanyId(e.target.value)
              setEditing(false)
            }}
            options={companies.map((c) => ({ value: c.id, label: c.name }))}
            style={{ minWidth: '160px' }}
          />
        </div>
      </Card>

      {settingsLoading ? (
        <div
          className="skeleton"
          style={{ height: '160px', borderRadius: '12px', marginBottom: '16px' }}
        />
      ) : settings ? (
        <Card padding="md" style={{ marginBottom: '20px' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              marginBottom: '16px',
            }}
          >
            <div>
              <h3
                style={{
                  fontSize: '15px',
                  fontWeight: 600,
                  color: theme.textPrimary,
                  marginBottom: '4px',
                }}
              >
                {settings.companyName}
              </h3>
              <p style={{ fontSize: '12px', color: theme.textMuted }}>
                Last updated by {settings.updatedByEmail} ·{' '}
                {new Date(settings.updatedAt).toLocaleDateString()}
              </p>
            </div>
            {!editing && (
              <Button variant="secondary" size="sm" onClick={handleEdit}>
                Edit
              </Button>
            )}
          </div>

          {editing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <Select
                label="Pricing Method"
                value={editMethod}
                onChange={(e) => {
                  setEditMethod(e.target.value)
                }}
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
                  onChange={(e) => {
                    setEditMarkupPct(e.target.value)
                  }}
                  placeholder="e.g. 10"
                  suffix={<span style={{ color: theme.textMuted }}>%</span>}
                />
              )}
              <div style={{ display: 'flex', gap: '8px' }}>
                <Button variant="primary" size="sm" onClick={handleSave} loading={updating}>
                  Save
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditing(false)
                  }}
                  disabled={updating}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: '16px',
              }}
            >
              <div>
                <p style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '4px' }}>
                  Method
                </p>
                <Badge variant="accent">{settings.method.replace('_', ' ').toUpperCase()}</Badge>
              </div>
              {settings.method === 'cost_plus' && (
                <div>
                  <p style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '4px' }}>
                    Markup %
                  </p>
                  <p style={{ fontSize: '18px', fontWeight: 500, color: theme.textPrimary }}>
                    {settings.costPlusMarkupPct}%
                  </p>
                </div>
              )}
            </div>
          )}
        </Card>
      ) : (
        <EmptyState
          title="No settings"
          message="No pricing settings configured for this company."
        />
      )}

      {/* History */}
      <Card padding="none">
        <div style={{ padding: '16px 20px 12px', borderBottom: `1px solid ${theme.border}` }}>
          <h3 style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary }}>
            Change History
          </h3>
        </div>
        <Table
          columns={historyColumns}
          data={history}
          loading={historyLoading}
          emptyMessage="No configuration changes recorded yet."
        />
      </Card>
    </div>
  )
}
