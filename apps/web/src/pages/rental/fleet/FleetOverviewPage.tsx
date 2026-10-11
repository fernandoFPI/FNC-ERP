import { useTranslation } from 'react-i18next'
import { enumLabel } from '../../../i18n'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@apollo/client'
import { EQUIPMENT_ASSETS_QUERY } from '../../../graphql/rental'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { KPICard } from '../../../components/ui/KPICard'
import { AssetStatusBadge } from '../../../components/ui/AssetStatusBadge'
import { FilterBar } from '../../../components/ui/FilterBar'
import { FilterPresets } from '../../../components/ui/FilterPresets'
import { useFilterPresets } from '../../../hooks/useFilterPresets'

const FILTER_DEFAULTS = { search: '', status: '' }
import { Button } from '../../../components/ui/Button'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import type { EquipmentAssetsQuery, EquipmentAssetsQueryVariables } from '../../../graphql/generated'

const ASSET_STATUSES = ['available', 'rented', 'maintenance', 'reserved', 'retired']
const capitalize = (x: string) => x.charAt(0).toUpperCase() + x.slice(1)

interface Asset {
  id: string
  asset_number: string
  name: string
  category?: string | null
  status: string
  daily_rate: string
  currency_code: string
  total_hours?: number | null
  maintenance_status?: string | null
  condition_rating?: number | null
  last_maintenance_date?: string | null
}

export default function FleetOverviewPage() {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined)
  const currentFilters = { search, status: statusFilter ?? '' }
  const { presets, savePreset, deletePreset, resolvePreset } = useFilterPresets(
    'fleet_overview',
    FILTER_DEFAULTS,
  )

  const { data, refetch } = useQuery<EquipmentAssetsQuery, EquipmentAssetsQueryVariables>(EQUIPMENT_ASSETS_QUERY, {
    variables: { status: statusFilter },
    fetchPolicy: 'cache-and-network',
  })

  const assets: Asset[] = data?.equipmentAssets ?? []

  const filtered = search
    ? assets.filter(
        (a) =>
          a.name.toLowerCase().includes(search.toLowerCase()) ||
          a.asset_number.toLowerCase().includes(search.toLowerCase()),
      )
    : assets

  const byStatus = (s: string) => assets.filter((a) => a.status === s).length
  const overdueMaintenance = assets.filter((a) => a.maintenance_status === 'overdue').length
  const avgUtilization =
    assets.length > 0 ? Math.round((byStatus('rented') / assets.length) * 100) : 0

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1500px' }}>
      <PageHeader
        title={t('rental.fleet.fleetOverview')}
        subtitle={`${assets.length} assets`}
        actions={
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              navigate('/rental/assets/new')
            }}
          >
            {t('rental.fleet.addAsset')}
          </Button>
        }
      />

      {/* KPI */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
          gap: '12px',
          marginTop: '20px',
        }}
      >
        {ASSET_STATUSES.map((s) => (
          <KPICard
            key={s}
            title={capitalize(enumLabel(s))}
            value={byStatus(s)}
            subtitle={t('rental.fleet.assets')}
            iconColor={
              s === 'available'
                ? 'success'
                : s === 'rented'
                  ? 'info'
                  : s === 'maintenance'
                    ? 'warning'
                    : s === 'retired'
                      ? 'accent'
                      : 'accent'
            }
          />
        ))}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '12px',
          marginTop: '12px',
        }}
      >
        <KPICard
          title={t('rental.fleet.fleetUtilization')}
          value={`${avgUtilization}%`}
          subtitle={t('rental.fleet.currentlyRented')}
          iconColor="info"
        />
        <KPICard
          title={t('rental.fleet.overdueMaintenance')}
          value={overdueMaintenance}
          subtitle={t('rental.fleet.assetsNeedingService')}
          iconColor={overdueMaintenance > 0 ? 'danger' : 'success'}
        />
      </div>

      {/* Status filter */}
      <div style={{ display: 'flex', gap: '8px', marginTop: '16px', flexWrap: 'wrap' }}>
        <button
          onClick={() => {
            setStatusFilter(undefined)
          }}
          style={{
            padding: '4px 12px',
            borderRadius: '20px',
            border: `1px solid ${!statusFilter ? theme.accent : theme.border}`,
            background: !statusFilter ? theme.accentBg : 'transparent',
            color: !statusFilter ? theme.accent : theme.textMuted,
            cursor: 'pointer',
            fontSize: '12px',
          }}
        >
          {t('rental.fleet.all')}
        </button>
        {ASSET_STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => {
              setStatusFilter(statusFilter === s ? undefined : s)
            }}
            style={{
              padding: '4px 12px',
              borderRadius: '20px',
              border: `1px solid ${statusFilter === s ? theme.accent : theme.border}`,
              background: statusFilter === s ? theme.accentBg : 'transparent',
              color: statusFilter === s ? theme.accent : theme.textMuted,
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            {enumLabel(s)} ({byStatus(s)})
          </button>
        ))}
      </div>

      {/* Asset grid */}
      <div style={{ marginTop: '16px' }}>
        <FilterBar
          search={search}
          onSearchChange={setSearch}
          resultCount={filtered.length}
          onRefresh={() => void refetch()}
        >
          <FilterPresets
            presets={presets}
            onApply={(preset) => {
              const r = resolvePreset(preset)
              setSearch(r.search)
              setStatusFilter(r.status || undefined)
            }}
            onSave={(name) => {
              savePreset(name, currentFilters)
            }}
            onDelete={deletePreset}
          />
        </FilterBar>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '12px',
            marginTop: '12px',
          }}
        >
          {filtered.map((a) => (
            <div
              key={a.id}
              style={{ cursor: 'pointer' }}
              onClick={() => {
                navigate(`/rental/assets/${a.id}`)
              }}
            >
              <Card style={{ padding: '16px', transition: 'border-color 0.15s' }}>
                <div
                  style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}
                >
                  <span style={{ fontFamily: 'monospace', color: theme.accent, fontSize: '12px' }}>
                    {a.asset_number}
                  </span>
                  {a.category && (
                    <span
                      style={{
                        fontSize: '11px',
                        color: theme.textMuted,
                        textTransform: 'capitalize',
                      }}
                    >
                      {enumLabel(a.category)}
                    </span>
                  )}
                </div>
                <div
                  style={{
                    fontWeight: 600,
                    color: theme.textPrimary,
                    fontSize: '14px',
                    marginBottom: '8px',
                  }}
                >
                  {a.name}
                </div>
                <AssetStatusBadge
                  status={
                    a.status as 'available' | 'rented' | 'maintenance' | 'retired' | 'reserved'
                  }
                  maintenanceStatus={
                    a.maintenance_status as
                      | 'ok'
                      | 'due_soon'
                      | 'overdue'
                      | 'in_progress'
                      | undefined
                  }
                />
                <div
                  style={{
                    marginTop: '8px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '12px',
                  }}
                >
                  <span style={{ color: theme.textMuted }}>
                    {t('rental.fleet.rate')}{' '}
                    <AmountDisplay
                      amount={parseFloat(a.daily_rate)}
                      currency={a.currency_code}
                      size="sm"
                    />
                  </span>
                  {a.total_hours != null && (
                    <span style={{ color: theme.textMuted }}>{t('rental.fleet.hTotal', { total_hours: a.total_hours.toLocaleString() })}</span>
                  )}
                </div>
                {a.condition_rating != null && (
                  <div style={{ marginTop: '6px', display: 'flex', gap: '3px' }}>
                    {[1, 2, 3, 4, 5].map((r) => (
                      <div
                        key={r}
                        style={{
                          width: '16px',
                          height: '4px',
                          borderRadius: '2px',
                          background:
                            r <= (a.condition_rating ?? 0) ? theme.accent : theme.bgSurfaceHover,
                        }}
                      />
                    ))}
                    <span style={{ fontSize: '10px', color: theme.textMuted, marginInlineStart: '4px' }}>
                      {t('rental.fleet.condition')}
                    </span>
                  </div>
                )}
              </Card>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
