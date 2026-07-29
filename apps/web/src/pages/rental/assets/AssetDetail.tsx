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

const TABS = ['Overview', 'Usage Logs', 'Maintenance', 'Condition Reports'].map((t) => ({
  key: t,
  label: t,
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
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)
  const [tab, setTab] = useState('Overview')
  const [showUsageForm, setShowUsageForm] = useState(false)
  const [showConditionForm, setShowConditionForm] = useState(false)
  const [maintenanceDetail, setMaintenanceDetail] = useState<string | null>(null)

  const { data, loading } = useQuery(EQUIPMENT_ASSET_QUERY, { variables: { id }, skip: !id })
  const [logUsage] = useMutation(LOG_USAGE)
  const [submitCondition] = useMutation(SUBMIT_CONDITION_REPORT)

  const asset = data?.equipmentAsset

  async function handleUsageLog(entry: UsageLogEntry) {
    try {
      await logUsage({
        variables: { input: { ...entry, asset_id: id } },
        refetchQueries: [{ query: EQUIPMENT_ASSET_QUERY, variables: { id } }],
      })
      addToast({ type: 'success', message: 'Usage logged' })
      setShowUsageForm(false)
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message ?? 'Failed to log usage' })
    }
  }

  async function handleConditionReport(report: ConditionReport) {
    try {
      await submitCondition({
        variables: { input: { ...report, asset_id: id } },
        refetchQueries: [{ query: EQUIPMENT_ASSET_QUERY, variables: { id } }],
      })
      addToast({ type: 'success', message: 'Condition report submitted' })
      setShowConditionForm(false)
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message ?? 'Failed to submit report' })
    }
  }

  if (loading || !asset)
    return <div style={{ padding: '24px', color: 'var(--text-muted)' }}>Loading…</div>

  const usageLogColumns: Column<UsageLogRow>[] = [
    {
      key: 'usage_date',
      header: 'Date',
      mobilePrimary: true,
      render: (l) => (
        <span style={{ color: theme.textSecondary, fontSize: '13px' }}>{l.usage_date}</span>
      ),
    },
    {
      key: 'operator_name',
      header: 'Operator',
      mobileSecondary: true,
      render: (l) => (
        <span style={{ color: theme.textSecondary, fontSize: '13px' }}>{l.operator_name}</span>
      ),
    },
    {
      key: 'hours_used',
      header: 'Hours',
      mobilePriority: 1,
      render: (l) => (
        <span style={{ fontFamily: 'monospace', color: theme.textPrimary }}>{l.hours_used}h</span>
      ),
    },
    {
      key: 'mileage_km',
      header: 'Mileage',
      mobilePriority: 2,
      render: (l) => (
        <span style={{ fontFamily: 'monospace', color: theme.textMuted }}>
          {l.mileage_km ? `${l.mileage_km}km` : '—'}
        </span>
      ),
    },
    {
      key: 'notes',
      header: 'Notes',
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
        subtitle={`${asset.asset_number} · ${asset.category ?? 'Equipment'}`}
        actions={
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <AssetStatusBadge status={asset.status} maintenanceStatus={asset.maintenance_status} />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowUsageForm(true)
              }}
            >
              Log Usage
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowConditionForm(true)
              }}
            >
              Condition Report
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                navigate(`/rental/assets/${id}/edit`)
              }}
            >
              Edit
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
          title="Daily Rate"
          value={parseFloat(asset.daily_rate).toLocaleString()}
          subtitle={asset.currency_code}
          iconColor="info"
        />
        <KPICard
          title="Total Hours"
          value={(asset.total_hours ?? 0).toLocaleString()}
          subtitle="hours operated"
          iconColor="accent"
        />
        <KPICard
          title="Total Mileage"
          value={(asset.total_mileage ?? 0).toLocaleString()}
          subtitle="km"
          iconColor="accent"
        />
        <KPICard
          title="Condition"
          value={`${asset.condition_rating ?? '—'}/5`}
          subtitle="latest rating"
          iconColor={
            asset.condition_rating >= 4
              ? 'success'
              : asset.condition_rating >= 3
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
                Asset Details
              </div>
              {[
                ['Serial Number', asset.serial_number ?? '—'],
                ['Purchase Date', asset.purchase_date ?? '—'],
                [
                  'Purchase Price',
                  asset.purchase_price
                    ? `${parseFloat(asset.purchase_price).toLocaleString()} ${asset.currency_code}`
                    : '—',
                ],
                [
                  'Maintenance Due At',
                  asset.maintenance_due_hours ? `${asset.maintenance_due_hours}h` : '—',
                ],
                ['Last Maintenance', asset.last_maintenance_date ?? '—'],
                ['Maintenance Status', asset.maintenance_status ?? '—'],
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
                Quick Actions
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    navigate(`/rental/contracts/new?assetId=${id}`)
                  }}
                >
                  Create Rental Contract
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    navigate(`/rental/maintenance?assetId=${id}`)
                  }}
                >
                  Schedule Maintenance
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowUsageForm(true)
                  }}
                >
                  Log Usage
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowConditionForm(true)
                  }}
                >
                  Condition Report
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
                Usage History
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setShowUsageForm(true)
                }}
              >
                Log Usage
              </Button>
            </div>
            <Table
              columns={usageLogColumns}
              data={(asset.usageLogs ?? []) as UsageLogRow[]}
              rowKey="id"
              emptyMessage="No usage logs yet"
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
              Maintenance Schedule
            </div>
            {(asset.maintenanceSchedules ?? []).map(
              (ms: {
                id: string
                maintenance_type: string
                scheduled_date: string
                status: string
                description?: string
                estimated_cost?: number
                assigned_to?: string
              }) => (
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
                      {ms.maintenance_type}
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
                      {ms.status}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setMaintenanceDetail(ms.id)
                      }}
                    >
                      View
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
                No scheduled maintenance
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
                Condition Reports
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setShowConditionForm(true)
                }}
              >
                New Report
              </Button>
            </div>
            {(asset.conditionReports ?? []).map(
              (r: {
                id: string
                report_date: string
                rating: number
                notes?: string
                created_by_email?: string
              }) => (
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
        maintenanceDueHours={asset.maintenance_due_hours}
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
