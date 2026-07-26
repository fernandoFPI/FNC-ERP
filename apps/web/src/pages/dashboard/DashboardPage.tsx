import { useQuery, gql } from '@apollo/client'
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../../components/ui/PageHeader'
import { KPICard } from '../../components/ui/KPICard'
import { Card } from '../../components/ui/Card'
import { Table } from '../../components/ui/Table'
import { Badge } from '../../components/ui/Badge'
import { EmptyState } from '../../components/ui/EmptyState'
import { ErrorBoundary } from '../../components/ui/ErrorBoundary'
import { Button } from '../../components/ui/Button'
import { Grid } from '../../components/ui/Grid'
import { BarChart } from '../../components/charts/BarChart'
import { HorizontalBarChart } from '../../components/charts/HorizontalBarChart'
import { useTheme } from '../../theme/ThemeContext'
import { useCompanyStore } from '../../store/companyStore'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import { usePagePadding } from '../../hooks/usePagePadding'

const DASHBOARD_QUERY = gql`
  query Dashboard($companyId: ID!) {
    dashboardKPIs(companyId: $companyId) {
      revenue
      openPOs
      activeProjects
      headcount
      revenueDelta
      openPOsDelta
    }
    recentPurchaseOrders(companyId: $companyId, limit: 5) {
      id
      number
      vendor
      amount
      currency
      status
      date
    }
    activityFeed(companyId: $companyId, limit: 8) {
      id
      action
      entity
      user
      timestamp
    }
    spendByCategory(companyId: $companyId) {
      category
      amount
    }
    revenueVsTarget(companyId: $companyId) {
      month
      revenue
    }
  }
`

interface KPI {
  revenue: number
  openPOs: number
  activeProjects: number
  headcount: number
  revenueDelta: number
  openPOsDelta: number
}

interface PO {
  id: string
  number: string
  vendor: string
  amount: number
  currency: string
  status: string
  date: string
}

interface ActivityEvent {
  id: string
  action: string
  entity: string
  user: string
  timestamp: string
}

interface SpendCategory {
  category: string
  amount: number
}

interface RevenueMonth {
  month: string
  revenue: number
  [key: string]: unknown
}

interface DashboardData {
  dashboardKPIs: KPI
  recentPurchaseOrders: PO[]
  activityFeed: ActivityEvent[]
  spendByCategory: SpendCategory[]
  revenueVsTarget: RevenueMonth[]
}

function statusVariant(status: string): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
  const map: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
    approved: 'success',
    pending: 'warning',
    rejected: 'danger',
    sent: 'info',
    draft: 'neutral',
  }
  return map[status.toLowerCase()] ?? 'neutral'
}

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount)
}

export default function DashboardPage() {
  const { theme } = useTheme()
  const { isPhone, isTablet } = useBreakpoint()
  const pagePadding = usePagePadding()
  const navigate = useNavigate()
  const { activeCompany } = useCompanyStore()
  const companyId = activeCompany?.id ?? ''
  const currency = activeCompany?.currencyCode ?? 'USD'
  const chartHeight = isPhone ? 200 : isTablet ? 240 : 260

  const now = new Date()
  const subtitle = `${now.toLocaleString('default', { month: 'long', year: 'numeric' })} · ${activeCompany?.name ?? ''}`

  const { data, loading, refetch } = useQuery<DashboardData>(DASHBOARD_QUERY, {
    variables: { companyId },
    skip: !companyId,
  })

  useEffect(() => {
    if (activeCompany?.id) {
      refetch({ companyId: activeCompany.id })
    }
  }, [activeCompany?.id])

  return (
    <ErrorBoundary
      fallback={
        <div style={{ padding: '24px' }}>
          <Card padding="md">
            <EmptyState
              title="Failed to load dashboard"
              message="Could not fetch data from the server."
            >
              <Button variant="secondary" size="sm" onClick={() => refetch()}>
                Retry
              </Button>
            </EmptyState>
          </Card>
        </div>
      }
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
          ...pagePadding,
          paddingBottom: isPhone ? 'calc(env(safe-area-inset-bottom, 0px) + 80px)' : undefined,
        }}
      >
        <PageHeader
          title="Dashboard"
          subtitle={subtitle}
          actions={
            <Button
              variant="primary"
              size="md"
              onClick={() => {
                navigate('/reporting/executive')
              }}
            >
              New report
            </Button>
          }
        />

        {/* KPI Grid */}
        <Grid cols={4} tabletCols={2} phoneCols={2} gap={12}>
          <KPICard
            label="Revenue"
            value={loading ? '—' : formatCurrency(data?.dashboardKPIs.revenue ?? 0, currency)}
            delta={
              data
                ? {
                    value: `${data.dashboardKPIs.revenueDelta > 0 ? '+' : ''}${data.dashboardKPIs.revenueDelta}%`,
                    direction: data.dashboardKPIs.revenueDelta >= 0 ? 'up' : 'down',
                  }
                : undefined
            }
            loading={loading}
            iconColor="success"
            icon={
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <line x1="12" y1="1" x2="12" y2="23" />
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
            }
          />
          <KPICard
            label="Open POs"
            value={loading ? '—' : String(data?.dashboardKPIs.openPOs ?? 0)}
            delta={
              data
                ? {
                    value: `${data.dashboardKPIs.openPOsDelta > 0 ? '+' : ''}${data.dashboardKPIs.openPOsDelta}`,
                    direction: data.dashboardKPIs.openPOsDelta > 0 ? 'up' : 'neutral',
                  }
                : undefined
            }
            loading={loading}
            iconColor="warning"
            icon={
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <circle cx="9" cy="21" r="1" />
                <circle cx="20" cy="21" r="1" />
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
              </svg>
            }
          />
          <KPICard
            label="Active projects"
            value={loading ? '—' : String(data?.dashboardKPIs.activeProjects ?? 0)}
            loading={loading}
            iconColor="info"
            icon={
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              </svg>
            }
          />
          <KPICard
            label="Headcount"
            value={loading ? '—' : String(data?.dashboardKPIs.headcount ?? 0)}
            loading={loading}
            iconColor="accent"
            icon={
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            }
          />
        </Grid>

        {/* Charts row */}
        <Grid cols={2} tabletCols={1} phoneCols={1} gap={14}>
          <Card padding="md" rimHighlight>
            <p
              style={{
                fontSize: '13px',
                fontWeight: 600,
                color: theme.textPrimary,
                marginBottom: '16px',
              }}
            >
              Revenue
            </p>
            {loading ? (
              <div className="skeleton" style={{ height: '260px', borderRadius: '8px' }} />
            ) : (data?.revenueVsTarget?.length ?? 0) > 0 ? (
              <BarChart
                data={data?.revenueVsTarget ?? []}
                xKey="month"
                bars={[{ key: 'revenue', label: 'Revenue' }]}
                height={chartHeight}
              />
            ) : (
              <EmptyState message="No revenue data available" />
            )}
          </Card>

          <Card padding="md" rimHighlight>
            <p
              style={{
                fontSize: '13px',
                fontWeight: 600,
                color: theme.textPrimary,
                marginBottom: '16px',
              }}
            >
              Spend by category
            </p>
            {loading ? (
              <div className="skeleton" style={{ height: '260px', borderRadius: '8px' }} />
            ) : (data?.spendByCategory?.length ?? 0) > 0 ? (
              <HorizontalBarChart
                data={(data?.spendByCategory ?? []).map((d) => ({
                  label: d.category,
                  value: d.amount,
                }))}
                height={chartHeight}
                formatValue={(v) => formatCurrency(v, currency)}
              />
            ) : (
              <EmptyState message="No spend data available" />
            )}
          </Card>
        </Grid>

        {/* Bottom row: Recent POs + Activity feed */}
        <Grid cols={2} tabletCols={1} phoneCols={1} gap={14}>
          <Card padding="none" rimHighlight>
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${theme.border}` }}>
              <p style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary, margin: 0 }}>
                Recent purchase orders
              </p>
            </div>
            <Table<Record<string, unknown>>
              columns={[
                {
                  key: 'number',
                  header: 'PO #',
                  mobilePrimary: true,
                  render: (row) => (
                    <span style={{ color: theme.accent, fontWeight: 500 }}>
                      {String(row.number ?? '')}
                    </span>
                  ),
                },
                { key: 'vendor', header: 'Vendor', mobileSecondary: true },
                {
                  key: 'amount',
                  header: 'Amount',
                  render: (row) =>
                    formatCurrency(Number(row.amount), String(row.currency ?? currency)),
                },
                {
                  key: 'status',
                  header: 'Status',
                  mobileAction: true,
                  render: (row) => (
                    <Badge variant={statusVariant(String(row.status ?? ''))} size="sm">
                      {String(row.status ?? '')}
                    </Badge>
                  ),
                },
              ]}
              data={
                loading
                  ? []
                  : ((data?.recentPurchaseOrders as unknown as Record<string, unknown>[]) ?? [])
              }
              loading={loading}
              emptyMessage="No purchase orders"
            />
          </Card>

          <Card padding="none" rimHighlight>
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${theme.border}` }}>
              <p style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary, margin: 0 }}>
                Activity feed
              </p>
            </div>
            {loading ? (
              <div style={{ padding: '16px' }}>
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="skeleton"
                    style={{ height: '36px', marginBottom: '8px', borderRadius: '6px' }}
                  />
                ))}
              </div>
            ) : (data?.activityFeed?.length ?? 0) === 0 ? (
              <EmptyState message="No recent activity" />
            ) : (
              <div style={{ padding: '8px 0' }}>
                {(data?.activityFeed ?? []).map((event) => (
                  <div
                    key={event.id}
                    style={{
                      padding: '10px 20px',
                      borderBottom: `1px solid ${theme.tableBorder}`,
                      display: 'flex',
                      gap: '10px',
                      alignItems: 'flex-start',
                    }}
                  >
                    <div
                      style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        background: theme.accent,
                        marginTop: '6px',
                        flexShrink: 0,
                      }}
                    />
                    <div>
                      <p style={{ fontSize: '12px', color: theme.textSecondary, margin: 0 }}>
                        <span style={{ fontWeight: 500, color: theme.textPrimary }}>
                          {event.user}
                        </span>{' '}
                        <span style={{ color: theme.accent }}>
                          {event.action.replace(/_/g, ' ')}
                        </span>
                        {event.entity && event.entity !== 'null' ? <> {event.entity}</> : null}
                      </p>
                      <p
                        style={{
                          fontSize: '11px',
                          color: theme.textMuted,
                          margin: 0,
                          marginTop: '2px',
                        }}
                      >
                        {new Date(event.timestamp).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </Grid>
      </div>
    </ErrorBoundary>
  )
}
