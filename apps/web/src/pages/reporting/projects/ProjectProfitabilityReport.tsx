import { useState } from 'react'
import { useQuery } from '@apollo/client'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import { EmptyState } from '../../../components/ui/EmptyState'
import { FilterBar } from '../../../components/ui/FilterBar'
import { PROJECT_PROFITABILITY_QUERY } from '../../../graphql/reporting'

interface CostBreakdown {
  key: string
  label: string
  amount: number
}

interface ProjectRow {
  id: string
  code: string
  name: string
  projectType: string
  companyName: string
  budget: number
  actualCost: number
  revenue: number
  margin: number
  marginPct: number
  status: string
  costBreakdown: CostBreakdown[]
}

interface ProjectProfitabilityData {
  projectProfitabilityReport: ProjectRow[]
}

function statusVariant(
  status: string,
): 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent' {
  const m: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent'> = {
    active: 'success',
    completed: 'info',
    on_hold: 'warning',
    cancelled: 'danger',
  }
  return m[status?.toLowerCase()] ?? 'neutral'
}

function marginColor(
  pct: number,
  theme: { success: string; warning: string; danger: string; textSecondary: string },
) {
  if (pct >= 20) return theme.success
  if (pct >= 5) return theme.warning
  if (pct < 0) return theme.danger
  return theme.textSecondary
}

export default function ProjectProfitabilityReport() {
  const { theme } = useTheme()
  const today = new Date().toISOString().slice(0, 10)
  const firstOfYear = `${new Date().getFullYear()}-01-01`

  const [fromDate, setFromDate] = useState(firstOfYear)
  const [toDate, setToDate] = useState(today)
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const { data, loading, refetch } = useQuery<ProjectProfitabilityData>(
    PROJECT_PROFITABILITY_QUERY,
    {
      variables: { fromDate, toDate, status: statusFilter ? [statusFilter] : undefined },
    },
  )

  const rows = (data?.projectProfitabilityReport ?? []).filter(
    (r) =>
      !search ||
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.code.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div style={{ padding: '24px' }}>
      <PageHeader
        title="Project Profitability"
        subtitle="Margin analysis across all projects"
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              refetch()
            }}
          >
            Refresh
          </Button>
        }
      />

      <Card padding="sm" style={{ marginBottom: '16px' }}>
        <FilterBar
          search={{ value: search, onChange: setSearch, placeholder: 'Search projects…' }}
          filters={[
            {
              key: 'status',
              label: 'Status',
              value: statusFilter,
              onChange: setStatusFilter,
              options: [
                { value: 'active', label: 'Active' },
                { value: 'completed', label: 'Completed' },
                { value: 'on_hold', label: 'On Hold' },
                { value: 'cancelled', label: 'Cancelled' },
              ],
            },
          ]}
          fromDate={fromDate}
          toDate={toDate}
          onFromDateChange={setFromDate}
          onToDateChange={setToDate}
          onExport={() => undefined}
          resultCount={rows.length}
        />
      </Card>

      <Card padding="none">
        {loading ? (
          <div style={{ padding: '24px' }}>
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="skeleton"
                style={{ height: '48px', borderRadius: '6px', marginBottom: '8px' }}
              />
            ))}
          </div>
        ) : rows.length ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: theme.bgSurface }}>
                  {[
                    'Code',
                    'Project',
                    'Company',
                    'Type',
                    'Budget',
                    'Actual Cost',
                    'Revenue',
                    'Margin',
                    'Margin %',
                    'Status',
                    '',
                  ].map((h, i) => (
                    <th
                      key={i}
                      style={{
                        padding: '10px 14px',
                        textAlign: i >= 4 && i <= 8 ? 'right' : 'left',
                        fontSize: '10px',
                        fontWeight: 600,
                        color: theme.textMuted,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        borderBottom: `1px solid ${theme.border}`,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <>
                    <tr
                      key={row.id}
                      style={{ borderBottom: `1px solid ${theme.tableBorder}` }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = theme.tableRowHover
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent'
                      }}
                    >
                      <td
                        style={{ padding: '12px 14px', color: theme.textMuted, fontSize: '12px' }}
                      >
                        {row.code}
                      </td>
                      <td
                        style={{ padding: '12px 14px', color: theme.textPrimary, fontWeight: 500 }}
                      >
                        {row.name}
                      </td>
                      <td style={{ padding: '12px 14px', color: theme.textSecondary }}>
                        {row.companyName}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <Badge variant="neutral" size="sm">
                          {row.projectType}
                        </Badge>
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                        <AmountDisplay amount={row.budget} currency="USD" size="sm" />
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                        <AmountDisplay amount={row.actualCost} currency="USD" size="sm" />
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                        <AmountDisplay amount={row.revenue} currency="USD" size="sm" />
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                        <AmountDisplay amount={row.margin} currency="USD" size="sm" colored />
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                        <span
                          style={{
                            fontWeight: 600,
                            color: marginColor(row.marginPct, theme),
                            fontFamily: 'ui-monospace, monospace',
                          }}
                        >
                          {row.marginPct.toFixed(1)}%
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <Badge variant={statusVariant(row.status)} size="sm">
                          {row.status}
                        </Badge>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <button
                          style={{
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            color: theme.accent,
                            fontSize: '12px',
                            fontFamily: 'inherit',
                          }}
                          onClick={() => {
                            setExpandedId(expandedId === row.id ? null : row.id)
                          }}
                        >
                          {expandedId === row.id ? 'Hide' : 'Costs'}
                        </button>
                      </td>
                    </tr>
                    {expandedId === row.id && (
                      <tr key={`${row.id}-expanded`} style={{ background: theme.bgSurfaceHover }}>
                        <td colSpan={11} style={{ padding: '16px 24px' }}>
                          <p
                            style={{
                              fontSize: '11px',
                              fontWeight: 600,
                              color: theme.textMuted,
                              marginBottom: '10px',
                              textTransform: 'uppercase',
                              letterSpacing: '0.05em',
                            }}
                          >
                            Cost Breakdown
                          </p>
                          <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                            {row.costBreakdown.map((cb) => (
                              <div
                                key={cb.key}
                                style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}
                              >
                                <span style={{ fontSize: '11px', color: theme.textMuted }}>
                                  {cb.label}
                                </span>
                                <AmountDisplay amount={cb.amount} currency="USD" size="sm" />
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="No projects found"
            message="Adjust filters to load project profitability data."
          />
        )}
      </Card>
    </div>
  )
}
