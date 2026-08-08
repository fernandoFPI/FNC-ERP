import { useQuery, gql } from '@apollo/client'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../../components/ui/PageHeader'
import { Card } from '../../components/ui/Card'
import { Table } from '../../components/ui/Table'
import { Badge } from '../../components/ui/Badge'
import { EmptyState } from '../../components/ui/EmptyState'
import { ErrorBoundary } from '../../components/ui/ErrorBoundary'
import { Button } from '../../components/ui/Button'
import { Grid } from '../../components/ui/Grid'
import { useTheme } from '../../theme/ThemeContext'
import { useCompanyStore } from '../../store/companyStore'
import { useAuthStore } from '../../store/authStore'
import { usePermission } from '../../hooks/usePermission'
import { usePagePadding } from '../../hooks/usePagePadding'
import { useBreakpoint } from '../../hooks/useBreakpoint'

const MY_DASHBOARD_QUERY = gql`
  query MyDashboard($companyId: ID!) {
    myPOQueue {
      id
      po_number
      status
      currency_code
      total_amount
      vendor_name
    }
    myProjects(companyId: $companyId) {
      id
      code
      name
      status
      projectType
    }
    myActivityFeed(companyId: $companyId, limit: 8) {
      id
      action
      entity
      timestamp
    }
  }
`

interface MyPO {
  id: string
  po_number: string
  status: string
  currency_code: string
  total_amount: number
  vendor_name: string | null
}

interface MyProject {
  id: string
  code: string
  name: string
  status: string
  projectType: string
}

interface MyActivityEvent {
  id: string
  action: string
  entity: string
  timestamp: string
}

interface MyDashboardData {
  myPOQueue: MyPO[]
  myProjects: MyProject[]
  myActivityFeed: MyActivityEvent[]
}

function statusVariant(status: string): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
  const map: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
    approved: 'success',
    active: 'success',
    ongoing: 'success',
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

interface QuickLink {
  label: string
  path: string
  permKey?: string
}

const QUICK_LINKS: QuickLink[] = [
  { label: 'My PO Queue', path: '/procurement/queue', permKey: 'procurement.po.view' },
  { label: 'Attendance', path: '/attendance', permKey: 'attendance.view' },
  { label: 'Payslips', path: '/payroll/payslips', permKey: 'payroll.payslips.view' },
  { label: 'My Profile', path: '/settings/profile' },
]

export default function MyDashboard() {
  const { theme } = useTheme()
  const { isPhone } = useBreakpoint()
  const pagePadding = usePagePadding()
  const navigate = useNavigate()
  const { activeCompany } = useCompanyStore()
  const user = useAuthStore((s) => s.user)
  const { can } = usePermission()
  const companyId = activeCompany?.id ?? ''
  const currency = activeCompany?.currencyCode ?? 'USD'

  const now = new Date()
  const displayName = user?.firstName || user?.email || 'there'
  const subtitle = `${now.toLocaleString('default', { month: 'long', year: 'numeric' })} · ${activeCompany?.name ?? ''}`

  const { data, loading, refetch } = useQuery<MyDashboardData>(MY_DASHBOARD_QUERY, {
    variables: { companyId },
    skip: !companyId,
  })

  const visibleLinks = QUICK_LINKS.filter((link) => !link.permKey || can(link.permKey))

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
        <PageHeader title={`Welcome, ${displayName}`} subtitle={subtitle} />

        {visibleLinks.length > 0 && (
          <Card padding="md" rimHighlight>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {visibleLinks.map((link) => (
                <Button
                  key={link.path}
                  variant="secondary"
                  size="sm"
                  onClick={() => navigate(link.path)}
                >
                  {link.label}
                </Button>
              ))}
            </div>
          </Card>
        )}

        <Grid cols={2} tabletCols={1} phoneCols={1} gap={14}>
          <Card padding="none" rimHighlight>
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${theme.border}` }}>
              <p style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary, margin: 0 }}>
                My pending POs
              </p>
            </div>
            <Table<Record<string, unknown>>
              columns={[
                {
                  key: 'po_number',
                  header: 'PO #',
                  mobilePrimary: true,
                  render: (row) => (
                    <span style={{ color: theme.accent, fontWeight: 500 }}>
                      {String(row.po_number ?? '')}
                    </span>
                  ),
                },
                {
                  key: 'vendor_name',
                  header: 'Vendor',
                  mobileSecondary: true,
                  render: (row) => <span>{String(row.vendor_name ?? '—')}</span>,
                },
                {
                  key: 'total_amount',
                  header: 'Amount',
                  render: (row) =>
                    formatCurrency(Number(row.total_amount), String(row.currency_code ?? currency)),
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
                loading ? [] : ((data?.myPOQueue as unknown as Record<string, unknown>[]) ?? [])
              }
              loading={loading}
              emptyMessage="Nothing waiting on you right now"
              onRowClick={(row) => navigate(`/procurement/purchase-orders/${String(row.id)}`)}
            />
          </Card>

          <Card padding="none" rimHighlight>
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${theme.border}` }}>
              <p style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary, margin: 0 }}>
                My projects
              </p>
            </div>
            <Table<Record<string, unknown>>
              columns={[
                {
                  key: 'name',
                  header: 'Project',
                  mobilePrimary: true,
                  render: (row) => (
                    <span style={{ color: theme.accent, fontWeight: 500 }}>
                      {String(row.name ?? '')}
                    </span>
                  ),
                },
                { key: 'code', header: 'Code', mobileSecondary: true },
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
                loading ? [] : ((data?.myProjects as unknown as Record<string, unknown>[]) ?? [])
              }
              loading={loading}
              emptyMessage="You're not assigned to any projects yet"
              onRowClick={(row) => navigate(`/projects/${String(row.id)}`)}
            />
          </Card>
        </Grid>

        <Card padding="none" rimHighlight>
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${theme.border}` }}>
            <p style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary, margin: 0 }}>
              My recent activity
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
          ) : (data?.myActivityFeed?.length ?? 0) === 0 ? (
            <EmptyState message="No recent activity" />
          ) : (
            <div style={{ padding: '8px 0' }}>
              {(data?.myActivityFeed ?? []).map((event) => (
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
      </div>
    </ErrorBoundary>
  )
}
