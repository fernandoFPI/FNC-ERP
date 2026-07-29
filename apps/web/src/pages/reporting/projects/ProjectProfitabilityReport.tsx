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
import type { Column } from '../../../components/ui/Table'
import { Table } from '../../../components/ui/Table'
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

  const columns: Column<ProjectRow>[] = [
    {
      key: 'name',
      header: 'Project',
      mobilePrimary: true,
      render: (row) => (
        <span style={{ color: theme.textPrimary, fontWeight: 500 }}>{row.name}</span>
      ),
    },
    {
      key: 'code',
      header: 'Code',
      mobileSecondary: true,
      render: (row) => <span style={{ color: theme.textMuted, fontSize: '12px' }}>{row.code}</span>,
    },
    {
      key: 'companyName',
      header: 'Company',
      mobilePriority: 8,
      render: (row) => <span style={{ color: theme.textSecondary }}>{row.companyName}</span>,
    },
    {
      key: 'projectType',
      header: 'Type',
      mobilePriority: 7,
      render: (row) => (
        <Badge variant="neutral" size="sm">
          {row.projectType}
        </Badge>
      ),
    },
    {
      key: 'budget',
      header: 'Budget',
      mobilePriority: 5,
      render: (row) => <AmountDisplay amount={row.budget} currency="USD" size="sm" />,
    },
    {
      key: 'actualCost',
      header: 'Actual Cost',
      mobilePriority: 6,
      render: (row) => <AmountDisplay amount={row.actualCost} currency="USD" size="sm" />,
    },
    {
      key: 'revenue',
      header: 'Revenue',
      mobilePriority: 4,
      render: (row) => <AmountDisplay amount={row.revenue} currency="USD" size="sm" />,
    },
    {
      key: 'margin',
      header: 'Margin',
      mobilePriority: 3,
      render: (row) => <AmountDisplay amount={row.margin} currency="USD" size="sm" colored />,
    },
    {
      key: 'marginPct',
      header: 'Margin %',
      mobilePriority: 2,
      render: (row) => (
        <span
          style={{
            fontWeight: 600,
            color: marginColor(row.marginPct, theme),
            fontFamily: 'ui-monospace, monospace',
          }}
        >
          {row.marginPct.toFixed(1)}%
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      mobilePriority: 1,
      render: (row) => (
        <Badge variant={statusVariant(row.status)} size="sm">
          {row.status}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      mobileAction: true,
      render: (row) => (
        <button
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: theme.accent,
            fontSize: '12px',
            fontFamily: 'inherit',
          }}
          onClick={(e) => {
            e.stopPropagation()
            setExpandedId(expandedId === row.id ? null : row.id)
          }}
        >
          {expandedId === row.id ? 'Hide' : 'Costs'}
        </button>
      ),
    },
  ]

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
          <Table
            columns={columns}
            data={rows}
            rowKey="id"
            renderExpanded={(row) =>
              expandedId === row.id ? (
                <div>
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
                        <span style={{ fontSize: '11px', color: theme.textMuted }}>{cb.label}</span>
                        <AmountDisplay amount={cb.amount} currency="USD" size="sm" />
                      </div>
                    ))}
                  </div>
                </div>
              ) : null
            }
          />
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
