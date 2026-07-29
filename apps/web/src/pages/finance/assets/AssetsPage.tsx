import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import { Grid } from '../../../components/ui/Grid'
import type { Column } from '../../../components/ui/Table'
import { Table } from '../../../components/ui/Table'
import { api } from '../../../lib/axios'
import { usePagePadding } from '../../../hooks/usePagePadding'

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
  const pagePadding = usePagePadding()
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
        api.get<Asset[]>('/finance/assets', {
          params: { status: statusFilter || undefined, search: search || undefined },
        }),
      ])
      setSummary(sumRes.data)
      setAssets(listRes.data)
    } catch {
      /* handled by interceptor */
    } finally {
      setLoading(false)
    }
  }, [statusFilter, search])

  useEffect(() => {
    void load()
  }, [load])

  async function handleRunDepreciation() {
    const now = new Date()
    now.setMonth(now.getMonth() - 1)
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    if (
      !confirm(
        `Post depreciation for ${period}? This will create journal entries for all active assets.`,
      )
    )
      return
    setRunningDep(true)
    try {
      const r = await api.post<{ posted: number; period: string }>(
        '/finance/assets/run-depreciation',
        { period },
      )
      alert(`Posted ${r.data.posted} depreciation entries for ${r.data.period}`)
      void load()
    } catch {
      alert('Failed to run depreciation')
    } finally {
      setRunningDep(false)
    }
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

  const columns: Column<Asset>[] = [
    {
      key: 'asset_number',
      header: 'Asset No.',
      mobilePrimary: true,
      render: (a) => (
        <span style={{ color: theme.accent, fontFamily: 'monospace' }}>{a.asset_number}</span>
      ),
    },
    {
      key: 'name',
      header: 'Name',
      mobileSecondary: true,
      render: (a) => a.name,
    },
    {
      key: 'category_name',
      header: 'Category',
      render: (a) => a.category_name ?? '—',
    },
    {
      key: 'purchase_date',
      header: 'Purchase Date',
      render: (a) => new Date(a.purchase_date).toLocaleDateString(),
    },
    {
      key: 'purchase_cost',
      header: 'Cost',
      render: (a) => <AmountDisplay amount={a.purchase_cost} currency="IQD" size="sm" />,
    },
    {
      key: 'book_value',
      header: 'Book Value',
      render: (a) => <AmountDisplay amount={a.book_value} currency="IQD" size="sm" colored />,
    },
    {
      key: 'depreciated_pct',
      header: 'Depreciated %',
      render: (a) => {
        const depPct =
          a.purchase_cost > 0 ? Math.round((a.accumulated_depreciation / a.purchase_cost) * 100) : 0
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                width: '60px',
                height: '4px',
                borderRadius: '2px',
                background: theme.border,
              }}
            >
              <div
                style={{
                  width: `${depPct}%`,
                  height: '100%',
                  background: depPct >= 100 ? '#6b7280' : theme.accent,
                  borderRadius: '2px',
                }}
              />
            </div>
            <span style={{ color: theme.textSecondary }}>{depPct}%</span>
          </div>
        )
      },
    },
    {
      key: 'status',
      header: 'Status',
      render: (a) => (
        <Badge variant={STATUS_BADGE[a.status] ?? 'neutral'}>{a.status.replace('_', ' ')}</Badge>
      ),
    },
    {
      key: 'view',
      header: '',
      mobileAction: true,
      render: (a) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            navigate(`/finance/assets/${a.id}`)
          }}
        >
          View
        </Button>
      ),
    },
  ]

  return (
    <div style={pagePadding}>
      <PageHeader
        title="Fixed Assets"
        subtitle="Asset register and depreciation management"
        actions={
          <div style={{ display: 'flex', gap: '8px' }}>
            {(summary?.pending_this_month ?? 0) > 0 && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void handleRunDepreciation()}
                disabled={runningDep}
              >
                {runningDep
                  ? 'Running...'
                  : `Run Depreciation (${summary?.pending_this_month} pending)`}
              </Button>
            )}
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                navigate('/finance/assets/new')
              }}
            >
              + New Asset
            </Button>
          </div>
        }
      />

      {/* KPI Row */}
      {summary && (
        <Grid cols={5} tabletCols={3} phoneCols={2} gap={12} style={{ marginBottom: '20px' }}>
          <Card padding="sm">
            <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>
              Total Cost
            </p>
            <AmountDisplay amount={summary.total_cost} currency="IQD" size="md" />
          </Card>
          <Card padding="sm">
            <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>
              Net Book Value
            </p>
            <AmountDisplay amount={summary.total_book_value} currency="IQD" size="md" colored />
          </Card>
          <Card padding="sm">
            <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>
              Accum. Depreciation
            </p>
            <AmountDisplay amount={summary.total_accum_dep} currency="IQD" size="md" />
          </Card>
          <Card padding="sm">
            <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>
              Active Assets
            </p>
            <p style={{ fontSize: '20px', fontWeight: 700, color: theme.textPrimary }}>
              {summary.active_count}
            </p>
          </Card>
          <Card padding="sm">
            <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>
              Fully Depreciated
            </p>
            <p style={{ fontSize: '20px', fontWeight: 700, color: theme.textPrimary }}>
              {summary.fully_depreciated_count}
            </p>
          </Card>
        </Grid>
      )}

      {/* Filters */}
      <Card padding="sm" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            placeholder="Search name or number..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
            }}
            style={{ ...inputStyle, width: '220px' }}
          />
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value)
            }}
            style={inputStyle}
          >
            <option value="">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="fully_depreciated">Fully Depreciated</option>
            <option value="disposed">Disposed</option>
          </select>
          <Button variant="ghost" size="sm" onClick={() => void load()}>
            Refresh
          </Button>
        </div>
      </Card>

      {/* Table */}
      <Card padding="none">
        <Table
          columns={columns}
          data={assets}
          rowKey="id"
          loading={loading}
          emptyMessage="No assets found. Use the + New Asset button above to add one."
          onRowClick={(a) => {
            navigate(`/finance/assets/${a.id}`)
          }}
        />
      </Card>
    </div>
  )
}
