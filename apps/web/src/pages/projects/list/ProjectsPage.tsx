import React, { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@apollo/client'
import { PROJECTS_QUERY } from '../../../graphql/projects'
import { useTheme } from '../../../theme/ThemeContext'
import { usePermission } from '../../../hooks/usePermission'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { formatCurrency } from '../../../lib/format'
import { SearchableSelect } from '../../../components/ui/SearchableSelect'

const STATUS_OPTIONS_ADMIN = [
  { value: 'pending',                  label: 'Pending' },
  { value: 'ongoing',                  label: 'Ongoing' },
  { value: 'submitted',                label: 'Submitted' },
  { value: 'approved',                 label: 'Approved' },
  { value: 'completed',                label: 'Completed' },
  { value: 'on_hold',                  label: 'On Hold' },
  { value: 'cancelled',                label: 'Cancelled' },
  { value: 'cancelled_after_approval', label: 'Cancelled (Post-Approval)' },
]

const STATUS_OPTIONS_USER = STATUS_OPTIONS_ADMIN.filter((o) => o.value !== 'pending')

const TYPE_OPTIONS = [
  { value: 'construction',  label: 'Construction' },
  { value: 'manufacturing', label: 'Manufacturing' },
  { value: 'service',       label: 'Service' },
  { value: 'other',         label: 'Other' },
]

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'neutral' | 'danger' | 'info'> = {
  pending:                  'neutral',
  ongoing:                  'info',
  submitted:                'warning',
  approved:                 'success',
  completed:                'success',
  on_hold:                  'warning',
  cancelled:                'danger',
  cancelled_after_approval: 'danger',
}

interface Project {
  id: string
  code: string
  name: string
  projectType?: string
  status: string
  rfqNumber?: string
  clientName?: string
  projectValue?: number
  budgetAmount?: number
  budgetCurrency?: string
  plannedStartDate?: string
  plannedEndDate?: string
  overallCompletionPct?: number
  teamCount?: number
  openPoCount?: number
  allowedActions?: string[]
  costSummary?: Record<string, number> | null
  createdAt?: string
}

export default function ProjectsPage() {
  const navigate        = useNavigate()
  const { theme }       = useTheme()
  const { can }         = usePermission()
  const isAdmin         = can('projects.edit')
  const STATUS_OPTIONS  = isAdmin ? STATUS_OPTIONS_ADMIN : STATUS_OPTIONS_USER
  const [params]        = useSearchParams()

  const [view,        setView]        = useState<'table' | 'card'>('table')
  const [search,      setSearch]      = useState(params.get('search') ?? '')
  const [statuses,    setStatuses]    = useState<string[]>(params.get('status') ? [params.get('status')!] : [])
  const [projectType, setProjectType] = useState(params.get('projectType') ?? '')
  const [page,        setPage]        = useState(1)
  const limit = 20

  const { data, loading } = useQuery(PROJECTS_QUERY, {
    variables: {
      status:      statuses.length > 0 ? statuses : undefined,
      projectType: projectType || undefined,
      search:      search      || undefined,
      page,
      limit,
    },
    fetchPolicy: 'cache-and-network',
  })

  const projects: Project[] = data?.projects?.data ?? []
  const pagination          = data?.projects?.pagination

  const toggleStatus = (s: string) => {
    setStatuses(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
    setPage(1)
  }

  const TABLE_HEADERS = isAdmin
    ? ['Code', 'Name', 'Type', 'Status', 'Client', 'Value', 'Budget', 'Completion', 'POs']
    : ['Code', 'Name', 'Type', 'Status', 'Client', 'Completion', 'POs']

  return (
    <div style={{ padding: '24px' }}>
      <PageHeader
        title="Projects"
        subtitle={pagination ? `${pagination.total} project${pagination.total !== 1 ? 's' : ''}` : undefined}
        actions={isAdmin ? (
          <Button variant="primary" size="sm" onClick={() => navigate('/projects/new')}>
            + New Project
          </Button>
        ) : undefined}
      />

      {/* Filter bar */}
      <div style={{ marginTop: '16px', background: theme.bgSurface, border: `1px solid ${theme.border}`, borderRadius: '10px', padding: '14px 16px' }}>
        {/* Search + type + view toggle */}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            style={{ flex: 1, minWidth: '200px', padding: '7px 12px', borderRadius: '7px', border: `1px solid ${theme.borderInput}`, background: theme.bgCanvas, color: theme.textPrimary, fontSize: '13px' }}
            placeholder="Search by name, code, client…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
          />
          <div style={{ minWidth: '160px' }}>
            <SearchableSelect
              value={projectType}
              onChange={(v) => { setProjectType(v); setPage(1) }}
              placeholder="All types"
              options={TYPE_OPTIONS}
            />
          </div>
          {/* View toggle */}
          <div style={{ display: 'flex', border: `1px solid ${theme.border}`, borderRadius: '7px', overflow: 'hidden' }}>
            {(['table', 'card'] as const).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                style={{ padding: '7px 14px', fontSize: '13px', border: 'none', cursor: 'pointer', background: view === v ? theme.accent : theme.bgCanvas, color: view === v ? '#fff' : theme.textMuted }}
              >
                {v === 'table' ? '☰ Table' : '⊞ Cards'}
              </button>
            ))}
          </div>
        </div>

        {/* Status chips */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}>
          {STATUS_OPTIONS.map(o => {
            const active = statuses.includes(o.value)
            return (
              <button
                key={o.value}
                onClick={() => toggleStatus(o.value)}
                style={{
                  padding: '4px 12px', borderRadius: '999px', fontSize: '12px', fontWeight: 500, cursor: 'pointer', border: `1px solid ${active ? theme.accent : theme.border}`,
                  background: active ? theme.accent : theme.bgCanvas, color: active ? '#fff' : theme.textMuted,
                }}
              >
                {o.label}
              </button>
            )
          })}
          {statuses.length > 0 && (
            <button
              onClick={() => { setStatuses([]); setPage(1) }}
              style={{ padding: '4px 10px', borderRadius: '999px', fontSize: '12px', cursor: 'pointer', border: `1px dashed ${theme.border}`, background: 'transparent', color: theme.textMuted }}
            >
              Clear ×
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div style={{ marginTop: '16px' }}>
        {loading && projects.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px', color: theme.textMuted }}>Loading…</div>
        ) : projects.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px', color: theme.textMuted }}>
            <div style={{ fontSize: '40px', marginBottom: '8px' }}>📁</div>
            <div style={{ marginBottom: '12px' }}>No projects found</div>
            {isAdmin && <Button variant="primary" size="sm" onClick={() => navigate('/projects/new')}>Create first project</Button>}
          </div>
        ) : view === 'card' ? (
          <CardView projects={projects} theme={theme} onNavigate={id => navigate(`/projects/${id}`)} />
        ) : (
          <div style={{ background: theme.bgSurface, border: `1px solid ${theme.border}`, borderRadius: '10px', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: theme.bgSurface }}>
                    {TABLE_HEADERS.map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '10px', fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: `1px solid ${theme.border}`, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {projects.map((p, i) => (
                    <tr
                      key={p.id}
                      onClick={() => navigate(`/projects/${p.id}`)}
                      style={{ borderBottom: `1px solid ${theme.border}22`, cursor: 'pointer', background: i % 2 === 0 ? 'transparent' : theme.bgSurface + '66' }}
                      onMouseEnter={e => (e.currentTarget.style.background = theme.bgSurfaceHover)}
                      onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : theme.bgSurface + '66')}
                    >
                      <td style={{ padding: '12px 14px', fontFamily: 'monospace', fontSize: '12px', color: theme.textMuted }}>{p.code}</td>
                      <td style={{ padding: '12px 14px', fontWeight: 500, color: theme.textPrimary, maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</td>
                      <td style={{ padding: '12px 14px', color: theme.textMuted, textTransform: 'capitalize' }}>{p.projectType ?? '—'}</td>
                      <td style={{ padding: '12px 14px' }}><Badge variant={STATUS_VARIANT[p.status] ?? 'neutral'}>{p.status.replace(/_/g, ' ')}</Badge></td>
                      <td style={{ padding: '12px 14px', color: theme.textMuted, maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.clientName ?? '—'}</td>
                      {isAdmin && <td style={{ padding: '12px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: theme.textPrimary }}>{p.projectValue ? formatCurrency(p.projectValue, p.budgetCurrency ?? 'IQD') : '—'}</td>}
                      {isAdmin && <td style={{ padding: '12px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: theme.textMuted }}>{p.budgetAmount ? formatCurrency(p.budgetAmount, p.budgetCurrency ?? 'IQD') : '—'}</td>}
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ width: '72px', height: '5px', background: theme.border, borderRadius: '999px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', background: theme.accent, width: `${p.overallCompletionPct ?? 0}%`, borderRadius: '999px' }} />
                          </div>
                          <span style={{ fontSize: '11px', color: theme.textMuted }}>{p.overallCompletionPct ?? 0}%</span>
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                        {(p.openPoCount ?? 0) > 0
                          ? <Badge variant="warning">{p.openPoCount}</Badge>
                          : <span style={{ color: theme.textMuted }}>—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
          <span style={{ fontSize: '13px', color: theme.textMuted }}>
            Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button size="sm" variant="secondary" disabled={pagination.page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</Button>
            <Button size="sm" variant="secondary" disabled={pagination.page >= pagination.totalPages} onClick={() => setPage(p => p + 1)}>Next →</Button>
          </div>
        </div>
      )}
    </div>
  )
}

function CardView({ projects, theme, onNavigate }: { projects: Project[]; theme: ReturnType<typeof useTheme>['theme']; onNavigate: (id: string) => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '14px' }}>
      {projects.map(p => (
        <div
          key={p.id}
          onClick={() => onNavigate(p.id)}
          style={{ background: theme.bgSurface, border: `1px solid ${theme.border}`, borderRadius: '10px', padding: '18px', cursor: 'pointer' }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = theme.accent)}
          onMouseLeave={e => (e.currentTarget.style.borderColor = theme.border)}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '10px' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '11px', fontFamily: 'monospace', color: theme.textMuted, marginBottom: '2px' }}>{p.code}</div>
              <div style={{ fontWeight: 600, color: theme.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
              {p.clientName && <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '2px' }}>{p.clientName}</div>}
            </div>
            <Badge variant={STATUS_VARIANT[p.status] ?? 'neutral'}>{p.status.replace(/_/g, ' ')}</Badge>
          </div>
          <div style={{ marginBottom: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: theme.textMuted, marginBottom: '4px' }}>
              <span>Progress</span><span>{p.overallCompletionPct ?? 0}%</span>
            </div>
            <div style={{ height: '4px', background: theme.border, borderRadius: '999px', overflow: 'hidden' }}>
              <div style={{ height: '100%', background: theme.accent, width: `${p.overallCompletionPct ?? 0}%` }} />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: theme.textMuted }}>
            <span>{formatCurrency(p.projectValue ?? 0, p.budgetCurrency ?? 'IQD')}</span>
            <span>{p.teamCount ?? 0} members · {p.openPoCount ?? 0} open POs</span>
          </div>
        </div>
      ))}
    </div>
  )
}
