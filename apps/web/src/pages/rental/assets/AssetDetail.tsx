import { useTranslation } from 'react-i18next'
import { enumLabel, tl } from '../../../i18n'
import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@apollo/client'
import { EQUIPMENT_ASSET_QUERY, LOG_USAGE, SUBMIT_CONDITION_REPORT } from '../../../graphql/rental'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { TabBar } from '../../../components/ui/TabBar'
import { Button } from '../../../components/ui/Button'
import { KPICard } from '../../../components/ui/KPICard'
import { AssetStatusBadge } from '../../../components/ui/AssetStatusBadge'
import type { UsageLogEntry } from '../../../components/ui/UsageLogForm'
import { UsageLogForm } from '../../../components/ui/UsageLogForm'
import type { ConditionReport } from '../../../components/ui/ConditionReportForm'
import { ConditionReportForm } from '../../../components/ui/ConditionReportForm'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import { Badge } from '../../../components/ui/Badge'
import type { Column } from '../../../components/ui/Table'
import { Table } from '../../../components/ui/Table'
import { useToastStore } from '../../../store/toastStore'
import { MaintenanceRecordDetail } from '../maintenance/MaintenanceRecordDetail'
import type { EquipmentAssetQuery, EquipmentAssetQueryVariables, LogUsageMutation, LogUsageMutationVariables, SubmitConditionReportMutation, SubmitConditionReportMutationVariables } from '../../../graphql/generated'

const TABS = ['Overview', 'Usage Logs', 'Maintenance', 'Condition Reports'].map((k) => ({
  key: k,
  get label() {
    return tl('rental.assetDetail.tabOpts', k, k)
  },
}))

interface UsageLogRow {
  id: string
  usage_date: string
  hours_used: number
  mileage_km?: number
  operator_name: string
  notes?: string
}

export default function AssetDetail() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)
  const [tab, setTab] = useState('Overview')
  const [showUsageForm, setShowUsageForm] = useState(false)
  const [showConditionForm, setShowConditionForm] = useState(false)
  const [maintenanceDetail, setMaintenanceDetail] = useState<string | null>(null)

  const { data, loading } = useQuery<EquipmentAssetQuery, EquipmentAssetQueryVariables>(EQUIPMENT_ASSET_QUERY, { variables: { id: id ?? '' }, skip: !id })
  const [logUsage] = useMutation<LogUsageMutation, LogUsageMutationVariables>(LOG_USAGE)
  const [submitCondition] = useMutation<SubmitConditionReportMutation, SubmitConditionReportMutationVariables>(SUBMIT_CONDITION_REPORT)

  const asset = data?.equipmentAsset

  async function handleUsageLog(entry: UsageLogEntry) {
    try {
      await logUsage({
        variables: { input: { ...entry, asset_id: id ?? '' } },
        refetchQueries: [{ query: EQUIPMENT_ASSET_QUERY, variables: { id } }],
      })
      addToast({ type: 'success', message: t('rental.assetDetail.usageLogged') })
      setShowUsageForm(false)
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message ?? t('rental.assetDetail.failedToLogUsage') })
    }
  }

  async function handleConditionReport(report: ConditionReport) {
    try {
      await submitCondition({
        variables: { input: { ...report, asset_id: id ?? '' } },
        refetchQueries: [{ query: EQUIPMENT_ASSET_QUERY, variables: { id } }],
      })
      addToast({ type: 'success', message: t('rental.assetDetail.conditionReportSubmitted') })
      setShowConditionForm(false)
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message ?? t('rental.assetDetail.failedToSubmitReport') })
    }
  }

  if (loading || !asset)
    return <div style={{ padding: '24px', color: 'var(--text-muted)' }}>{t('rental.assetDetail.loading')}</div>

  const usageLogColumns: Column<UsageLogRow>[] = [
    {
      key: 'usage_date',
      header: t('rental.assetDetail.date'),
      mobilePrimary: true,
      render: (l) => (
        <span style={{ color: theme.textSecondary, fontSize: '13px' }}>{l.usage_date}</span>
      ),
    },
    {
      key: 'operator_name',
      header: t('rental.assetDetail.operator'),
      mobileSecondary: true,
      render: (l) => (
        <span style={{ color: theme.textSecondary, fontSize: '13px' }}>{l.operator_name}</span>
      ),
    },
    {
      key: 'hours_used',
      header: t('rental.assetDetail.hours'),
      mobilePriority: 1,
      render: (l) => (
        <span style={{ fontFamily: 'monospace', color: theme.textPrimary }}>{l.hours_used}h</span>
      ),
    },
    {
      key: 'mileage_km',
      header: t('rental.assetDetail.mileage'),
      mobilePriority: 2,
      render: (l) => (
        <span style={{ fontFamily: 'monospace', color: theme.textMuted }}>
          {l.mileage_km ? `${l.mileage_km}km` : '—'}
        </span>
      ),
    },
    {
      key: 'notes',
      header: t('rental.assetDetail.notes'),
      mobilePriority: 3,
      render: (l) => (
        <span style={{ color: theme.textMuted, fontSize: '12px' }}>{l.notes ?? '—'}</span>
      ),
    },
  ]

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1300px' }}>
      <PageHeader
        title={asset.name}
        subtitle={`${asset.asset_number} · ${asset.category ?? t('rental.assetDetail.equipment')}`}
        actions={
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <AssetStatusBadge
              status={asset.status as 'available' | 'rented' | 'maintenance' | 'retired' | 'reserved'}
              maintenanceStatus={
                (asset.maintenance_status ?? undefined) as
                  | 'ok'
                  | 'due_soon'
                  | 'overdue'
                  | 'in_progress'
                  | undefined
              }
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowUsageForm(true)
              }}
            >
              {t('rental.assetDetail.logUsage')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowConditionForm(true)
              }}
            >
              {t('rental.assetDetail.conditionReport')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                navigate(`/rental/assets/${id}/edit`)
              }}
            >
              {t('rental.assetDetail.edit')}
            </Button>
          </div>
        }
      />

      {/* KPI */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '12px',
          marginTop: '20px',
        }}
      >
        <KPICard
          title={t('rental.assetDetail.dailyRate')}
          value={parseFloat(asset.daily_rate).toLocaleString()}
          subtitle={asset.currency_code}
          iconColor="info"
        />
        <KPICard
          title={t('rental.assetDetail.totalHours')}
          value={(asset.total_hours ?? 0).toLocaleString()}
          subtitle={t('rental.assetDetail.hoursOperated')}
          iconColor="accent"
        />
        <KPICard
          title={t('rental.assetDetail.totalMileage')}
          value={(asset.total_mileage ?? 0).toLocaleString()}
          subtitle="km"
          iconColor="accent"
        />
        <KPICard
          title={t('rental.assetDetail.condition')}
          value={`${asset.condition_rating ?? '—'}/5`}
          subtitle={t('rental.assetDetail.latestRating')}
          iconColor={
            (asset.condition_rating ?? 0) >= 4
              ? 'success'
              : (asset.condition_rating ?? 0) >= 3
                ? 'warning'
                : 'danger'
          }
        />
      </div>

      <div style={{ marginTop: '16px' }}>
        <TabBar tabs={TABS} active={tab} onChange={setTab} />
      </div>

      <div style={{ marginTop: '16px' }}>
        {tab === 'Overview' && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '16px',
            }}
          >
            <Card style={{ padding: '20px' }}>
              <div
                style={{
                  fontWeight: 600,
                  color: theme.textPrimary,
                  fontSize: '14px',
                  marginBottom: '12px',
                }}
              >
                {t('rental.assetDetail.assetDetails')}
              </div>
              {[
                [t('rental.assetDetail.serialNumber'), asset.serial_number ?? '—'],
                [t('rental.assetDetail.purchaseDate'), asset.purchase_date ?? '—'],
                [
                  t('rental.assetDetail.purchasePrice'),
                  asset.purchase_price
                    ? `${asset.purchase_price.toLocaleString()} ${asset.currency_code}`
                    : '—',
                ],
                [
                  t('rental.assetDetail.maintenanceDueAt'),
                  asset.maintenance_due_hours ? `${asset.maintenance_due_hours}h` : '—',
                ],
                [t('rental.assetDetail.lastMaintenance'), asset.last_maintenance_date ?? '—'],
                [t('rental.assetDetail.maintenanceStatus'), asset.maintenance_status ?? '—'],
              ].map(([label, value]) => (
                <div
                  key={label}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '6px 0',
                    borderBottom: `1px solid ${theme.border}`,
                    fontSize: '13px',
                  }}
                >
                  <span style={{ color: theme.textMuted }}>{label}</span>
                  <span style={{ color: theme.textPrimary }}>{value}</span>
                </div>
              ))}
              {asset.description && (
                <div style={{ marginTop: '12px', fontSize: '13px', color: theme.textSecondary }}>
                  {asset.description}
                </div>
              )}
            </Card>
            <Card style={{ padding: '20px' }}>
              <div
                style={{
                  fontWeight: 600,
                  color: theme.textPrimary,
                  fontSize: '14px',
                  marginBottom: '12px',
                }}
              >
                {t('rental.assetDetail.quickActions')}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    navigate(`/rental/contracts/new?assetId=${id}`)
                  }}
                >
                  {t('rental.assetDetail.createRentalContract')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    navigate(`/rental/maintenance?assetId=${id}`)
                  }}
                >
                  {t('rental.assetDetail.scheduleMaintenance')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowUsageForm(true)
                  }}
                >
                  {t('rental.assetDetail.logUsage')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowConditionForm(true)
                  }}
                >
                  {t('rental.assetDetail.conditionReport')}
                </Button>
              </div>
            </Card>
          </div>
        )}

        {tab === 'Usage Logs' && (
          <Card style={{ padding: '20px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: '12px',
                alignItems: 'center',
              }}
            >
              <div style={{ fontWeight: 600, color: theme.textPrimary, fontSize: '14px' }}>
                {t('rental.assetDetail.usageHistory')}
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setShowUsageForm(true)
                }}
              >
                {t('rental.assetDetail.logUsage')}
              </Button>
            </div>
            <Table
              columns={usageLogColumns}
              data={(asset.usageLogs ?? []) as UsageLogRow[]}
              rowKey="id"
              emptyMessage={t('rental.assetDetail.noUsageLogsYet')}
            />
          </Card>
        )}

        {tab === 'Maintenance' && (
          <Card style={{ padding: '20px' }}>
            <div
              style={{
                fontWeight: 600,
                color: theme.textPrimary,
                fontSize: '14px',
                marginBottom: '12px',
              }}
            >
              {t('rental.assetDetail.maintenanceSchedule')}
            </div>
            {(asset.maintenanceSchedules ?? []).map(
              (ms) => (
                <div
                  key={ms.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '10px 0',
                    borderBottom: `1px solid ${theme.border}`,
                    fontSize: '13px',
                  }}
                >
                  <div>
                    <div style={{ color: theme.textPrimary, fontWeight: 500 }}>
                      {enumLabel(ms.maintenance_type)}
                    </div>
                    {ms.description && (
                      <div style={{ color: theme.textMuted, fontSize: '11px' }}>
                        {ms.description}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <span style={{ color: theme.textMuted }}>{ms.scheduled_date}</span>
                    {ms.estimated_cost != null && (
                      <AmountDisplay
                        amount={ms.estimated_cost}
                        currency={asset.currency_code}
                        size="sm"
                      />
                    )}
                    <Badge
                      variant={
                        ms.status === 'completed'
                          ? 'success'
                          : ms.status === 'overdue'
                            ? 'danger'
                            : 'neutral'
                      }
                    >
                      {enumLabel(ms.status)}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setMaintenanceDetail(ms.id)
                      }}
                    >
                      {t('rental.assetDetail.view')}
                    </Button>
                  </div>
                </div>
              ),
            )}
            {(asset.maintenanceSchedules ?? []).length === 0 && (
              <div
                style={{
                  color: theme.textMuted,
                  textAlign: 'center',
                  padding: '24px',
                  fontSize: '13px',
                }}
              >
                {t('rental.assetDetail.noScheduledMaintenance')}
              </div>
            )}
          </Card>
        )}

        {tab === 'Condition Reports' && (
          <Card style={{ padding: '20px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: '12px',
                alignItems: 'center',
              }}
            >
              <div style={{ fontWeight: 600, color: theme.textPrimary, fontSize: '14px' }}>
                {t('rental.assetDetail.conditionReports')}
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setShowConditionForm(true)
                }}
              >
                {t('rental.assetDetail.newReport')}
              </Button>
            </div>
            {(asset.conditionReports ?? []).map(
              (r) => (
                <div
                  key={r.id}
                  style={{ padding: '12px 0', borderBottom: `1px solid ${theme.border}` }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: '6px',
                    }}
                  >
                    <span style={{ fontSize: '13px', color: theme.textSecondary }}>
                      {r.report_date}
                    </span>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {[1, 2, 3, 4, 5].map((i) => (
                        <div
                          key={i}
                          style={{
                            width: '16px',
                            height: '16px',
                            borderRadius: '50%',
                            background: i <= r.rating ? theme.accent : theme.bgSurfaceHover,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '9px',
                            color: i <= r.rating ? '#fff' : theme.textMuted,
                          }}
                        >
                          {i}
                        </div>
                      ))}
                    </div>
                  </div>
                  {r.notes && (
                    <div style={{ fontSize: '12px', color: theme.textMuted }}>{r.notes}</div>
                  )}
                  {r.created_by_email && (
                    <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '4px' }}>
                      By: {r.created_by_email}
                    </div>
                  )}
                </div>
              ),
            )}
          </Card>
        )}
      </div>

      <UsageLogForm
        open={showUsageForm}
        assetId={id ?? ''}
        assetName={asset.name}
        maintenanceDueHours={asset.maintenance_due_hours ?? undefined}
        currentHours={asset.total_hours ?? 0}
        onSubmit={handleUsageLog}
        onClose={() => {
          setShowUsageForm(false)
        }}
      />

      <ConditionReportForm
        open={showConditionForm}
        assetId={id ?? ''}
        assetName={asset.name}
        onSubmit={handleConditionReport}
        onClose={() => {
          setShowConditionForm(false)
        }}
      />

      {maintenanceDetail && (
        <MaintenanceRecordDetail
          open={!!maintenanceDetail}
          recordId={maintenanceDetail}
          assetId={id ?? ''}
          onClose={() => {
            setMaintenanceDetail(null)
          }}
          onCompleted={() => {
            setMaintenanceDetail(null)
          }}
        />
      )}
    </div>
  )
}
