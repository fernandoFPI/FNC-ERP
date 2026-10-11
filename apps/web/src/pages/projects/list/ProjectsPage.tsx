import i18n from '../../../i18n'
import { useTranslation } from 'react-i18next'
import React, { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@apollo/client'
import { PROJECTS_QUERY } from '../../../graphql/projects'
import { useTheme } from '../../../theme/ThemeContext'
import { usePermission } from '../../../hooks/usePermission'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { useEntityChanged } from '../../../hooks/useEntityChanged'
import { formatCurrency } from '../../../lib/format'
import { SearchableSelect } from '../../../components/ui/SearchableSelect'
import type { Column } from '../../../components/ui/Table'
import { Table } from '../../../components/ui/Table'
import type { ProjectsQuery, ProjectsQueryVariables } from '../../../graphql/generated'

const STATUS_OPTIONS_ADMIN = [
  { value: 'pending', get label() { return i18n.t('proj.list.pending', { defaultValue: "Pending" }) } },
  { value: 'ongoing', get label() { return i18n.t('proj.list.ongoing', { defaultValue: "Ongoing" }) } },
  { value: 'submitted', get label() { return i18n.t('proj.list.submitted', { defaultValue: "Submitted" }) } },
  { value: 'approved', get label() { return i18n.t('proj.list.approved', { defaultValue: "Approved" }) } },
  { value: 'completed', get label() { return i18n.t('proj.list.completed', { defaultValue: "Completed" }) } },
  { value: 'on_hold', get label() { return i18n.t('proj.list.onHold', { defaultValue: "On Hold" }) } },
  { value: 'cancelled', get label() { return i18n.t('proj.list.cancelled', { defaultValue: "Cancelled" }) } },
  { value: 'cancelled_after_approval', get label() { return i18n.t('proj.list.cancelledPostApproval', { defaultValue: "Cancelled (Post-Approval)" }) } },
]

const STATUS_OPTIONS_USER = STATUS_OPTIONS_ADMIN.filter((o) => o.value !== 'pending')

const TYPE_OPTIONS = [
  { value: 'construction', get label() { return i18n.t('proj.list.construction', { defaultValue: "Construction" }) } },
  { value: 'supply', get label() { return i18n.t('proj.list.supply', { defaultValue: "Supply" }) } },
  { value: 'direct_supply', get label() { return i18n.t('proj.list.directSupply', { defaultValue: "Direct Supply" }) } },
  { value: 'services', get label() { return i18n.t('proj.list.services', { defaultValue: "Services" }) } },
  { value: 'rental', get label() { return i18n.t('proj.list.rental', { defaultValue: "Rental" }) } },
  { value: 'fabrication', get label() { return i18n.t('proj.list.fabrication', { defaultValue: "Fabrication" }) } },
  { value: 'manpower_supply', get label() { return i18n.t('proj.list.manpowerSupply', { defaultValue: "Manpower Supply" }) } },
  { value: 'operation_maintenance', get label() { return i18n.t('proj.list.operationMaintenance', { defaultValue: "Operation & Maintenance" }) } },
  { value: 'epc', label: 'EPC' },
]

// Survives refresh and navigating into a project and back — same pattern as
// requisitions-page-filters (RequisitionsPage.tsx).
const FILTERS_STORAGE_KEY = 'projects-page-filters'

interface SavedFilters {
  search: string
  statuses: string[]
  projectType: string
  myProjectsOnly: boolean
}

const FILTER_DEFAULTS: SavedFilters = {
  search: '',
  statuses: [],
  projectType: '',
  myProjectsOnly: false,
}

function loadSavedFilters(): SavedFilters {
  try {
    const raw = sessionStorage.getItem(FILTERS_STORAGE_KEY)
    if (raw) return { ...FILTER_DEFAULTS, ...(JSON.parse(raw) as Partial<SavedFilters>) }
  } catch {
    // ignore corrupt/unavailable storage
  }
  return FILTER_DEFAULTS
}

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'neutral' | 'danger' | 'info'> = {
  pending: 'neutral',
  ongoing: 'info',
  submitted: 'warning',
  approved: 'success',
  completed: 'success',
  on_hold: 'warning',
  cancelled: 'danger',
  cancelled_after_approval: 'danger',
}

interface Project {
  id: string
  code: string
  name: string
  projectType?: string
  status: string
  isRfq?: boolean
  rfqNumber?: string | null
  contractName?: string | null
  clientName?: string | null
  projectValue?: number | null
  budgetAmount?: number | null
  budgetCurrency?: string | null
  plannedStartDate?: string | null
  plannedEndDate?: string | null
  overallCompletionPct?: number | null
  teamCount?: number | null
  openPoCount?: number | null
  allowedActions?: string[] | null
  costSummary?: unknown
  createdAt?: string
}

export default function ProjectsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { theme } = useTheme()
  const { can } = usePermission()
  const isAdmin = can('projects.edit')
  const STATUS_OPTIONS = isAdmin ? STATUS_OPTIONS_ADMIN : STATUS_OPTIONS_USER
  const [params] = useSearchParams()
  // An explicit deep link (e.g. a dashboard widget linking to ?status=pending)
  // wins over whatever was left over in session storage from last visit;
  // otherwise filters survive refresh and navigating into a project and back.
  const [saved] = useState(loadSavedFilters)

  const [view, setView] = useState<'table' | 'card'>('table')
  const [search, setSearch] = useState(params.get('search') ?? saved.search)
  const initialStatus = params.get('status')
  const [statuses, setStatuses] = useState<string[]>(initialStatus ? [initialStatus] : saved.statuses)
  const [projectType, setProjectType] = useState(params.get('projectType') ?? saved.projectType)
  const [myProjectsOnly, setMyProjectsOnly] = useState(saved.myProjectsOnly)
  const [page, setPage] = useState(1)
  const limit = 20

  useEffect(() => {
    try {
      sessionStorage.setItem(
        FILTERS_STORAGE_KEY,
        JSON.stringify({ search, statuses, projectType, myProjectsOnly }),
      )
    } catch {
      // storage unavailable — filters just won't persist
    }
  }, [search, statuses, projectType, myProjectsOnly])

  const { data, loading, refetch } = useQuery<ProjectsQuery, ProjectsQueryVariables>(PROJECTS_QUERY, {
    variables: {
      status: statuses.length > 0 ? statuses : undefined,
      projectType: projectType || undefined,
      search: search || undefined,
      myProjectsOnly: myProjectsOnly || undefined,
      page,
      limit,
    },
    fetchPolicy: 'cache-and-network',
  })
  useEntityChanged('project', () => void refetch())

  const projects: Project[] = data?.projects.data ?? []
  const pagination = data?.projects.pagination

  const toggleStatus = (s: string) => {
    setStatuses((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))
    setPage(1)
  }

  const columns: Column<Project>[] = [
    {
      key: 'name',
      header: t('proj.list.name'),
      mobilePrimary: true,
      render: (p) => (
        <span
          style={{
            fontWeight: 500,
            color: theme.textPrimary,
            maxWidth: '220px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            display: 'block',
          }}
        >
          {p.name}
        </span>
      ),
    },
    {
      key: 'code',
      header: t('proj.list.code'),
      mobileSecondary: true,
      render: (p) => (
        <span style={{ fontFamily: 'monospace', fontSize: '12px', color: theme.textMuted }}>
          {p.code}
        </span>
      ),
    },
    {
      // Column header stays "RFQ #" per request, but shows Contract Name /
      // Number (contractName) instead of the actual rfqNumber field — that's
      // the identifier people are actually filling in and looking for here.
      key: 'contractName',
      header: t('proj.list.rfq'),
      mobileHide: true,
      render: (p) => (
        <span style={{ fontFamily: 'monospace', fontSize: '12px', color: theme.textMuted }}>
          {p.contractName ?? '—'}
        </span>
      ),
    },
    {
      key: 'status',
      header: t('proj.list.status'),
      mobilePriority: 1,
      render: (p) => (
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {p.isRfq && !['approved', 'completed', 'cancelled_after_approval'].includes(p.status) && (
            <Badge variant="info">{t('proj.list.rfq2')}</Badge>
          )}
          <Badge variant={STATUS_VARIANT[p.status] ?? 'neutral'}>
            {p.status.replace(/_/g, ' ')}
          </Badge>
        </div>
      ),
    },
    {
      key: 'clientName',
      header: t('proj.list.client'),
      mobilePriority: 2,
      render: (p) => (
        <span
          style={{
            color: theme.textMuted,
            maxWidth: '160px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            display: 'block',
          }}
        >
          {p.clientName ?? '—'}
        </span>
      ),
    },
    {
      key: 'overallCompletionPct',
      header: t('proj.list.completion'),
      mobilePriority: 3,
      render: (p) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '72px',
              height: '5px',
              background: theme.border,
              borderRadius: '999px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                background: theme.accent,
                width: `${p.overallCompletionPct ?? 0}%`,
                borderRadius: '999px',
              }}
            />
          </div>
          <span style={{ fontSize: '11px', color: theme.textMuted }}>
            {p.overallCompletionPct ?? 0}%
          </span>
        </div>
      ),
    },
    {
      key: 'projectType',
      header: t('proj.list.type'),
      mobilePriority: 4,
      render: (p) => (
        <span style={{ color: theme.textMuted, textTransform: 'capitalize' }}>
          {p.projectType ?? '—'}
        </span>
      ),
    },
    {
      key: 'openPoCount',
      header: t('proj.list.pos'),
      mobilePriority: 5,
      render: (p) => (
        <div style={{ textAlign: 'center' }}>
          {(p.openPoCount ?? 0) > 0 ? (
            <Badge variant="warning">{p.openPoCount}</Badge>
          ) : (
            <span style={{ color: theme.textMuted }}>—</span>
          )}
        </div>
      ),
    },
    ...(isAdmin
      ? [
          {
            key: 'projectValue',
            header: t('proj.list.value'),
            mobilePriority: 6,
            render: (p: Project) => (
              <div
                style={{
                  textAlign: 'end',
                  fontVariantNumeric: 'tabular-nums',
                  color: theme.textPrimary,
                }}
              >
                {p.projectValue ? formatCurrency(p.projectValue, p.budgetCurrency ?? 'IQD') : '—'}
              </div>
            ),
          },
          {
            key: 'budgetAmount',
            header: t('proj.list.budget'),
            mobilePriority: 7,
            render: (p: Project) => (
              <div
                style={{
                  textAlign: 'end',
                  fontVariantNumeric: 'tabular-nums',
                  color: theme.textMuted,
                }}
              >
                {p.budgetAmount ? formatCurrency(p.budgetAmount, p.budgetCurrency ?? 'IQD') : '—'}
              </div>
            ),
          },
        ]
      : []),
  ]

  return (
    <div style={{ padding: '24px' }}>
      <PageHeader
        title={t('proj.list.projects')}
        subtitle={
          pagination ? `${pagination.total} project${pagination.total !== 1 ? 's' : ''}` : undefined
        }
        actions={
          isAdmin ? (
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                navigate('/projects/new')
              }}
            >
              {t('proj.list.newRfq')}
            </Button>
          ) : undefined
        }
      />

      {/* Filter bar */}
      <div
        style={{
          marginTop: '16px',
          background: theme.bgSurface,
          border: `1px solid ${theme.border}`,
          borderRadius: '10px',
          padding: '14px 16px',
        }}
      >
        {/* Search + type + view toggle */}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            style={{
              flex: 1,
              minWidth: '200px',
              padding: '7px 12px',
              borderRadius: '7px',
              border: `1px solid ${theme.borderInput}`,
              background: theme.bgCanvas,
              color: theme.textPrimary,
              fontSize: '13px',
            }}
            placeholder={t('proj.list.searchByNameCodeClient')}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
          />
          <div style={{ minWidth: '160px' }}>
            <SearchableSelect
              value={projectType}
              onChange={(v) => {
                setProjectType(v)
                setPage(1)
              }}
              placeholder={t('proj.list.allTypes')}
              options={TYPE_OPTIONS}
            />
          </div>
          {/* View toggle */}
          <div
            style={{
              display: 'flex',
              border: `1px solid ${theme.border}`,
              borderRadius: '7px',
              overflow: 'hidden',
            }}
          >
            {(['table', 'card'] as const).map((v) => (
              <button
                key={v}
                onClick={() => {
                  setView(v)
                }}
                style={{
                  padding: '7px 14px',
                  fontSize: '13px',
                  border: 'none',
                  cursor: 'pointer',
                  background: view === v ? theme.accent : theme.bgCanvas,
                  color: view === v ? '#fff' : theme.textMuted,
                }}
              >
                {v === 'table' ? t('proj.list.table') : t('proj.list.cards')}
              </button>
            ))}
          </div>
        </div>

        {/* Status chips */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}>
          <button
            onClick={() => {
              setMyProjectsOnly((v) => !v)
              setPage(1)
            }}
            style={{
              padding: '4px 12px',
              borderRadius: '999px',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
              border: `1px solid ${myProjectsOnly ? theme.success : theme.border}`,
              background: myProjectsOnly ? theme.success : theme.bgCanvas,
              color: myProjectsOnly ? '#fff' : theme.textMuted,
            }}
          >
            {t('proj.list.myProjects')}
          </button>
          <div style={{ width: '1px', background: theme.border, margin: '2px 4px' }} />
          {STATUS_OPTIONS.map((o) => {
            const active = statuses.includes(o.value)
            return (
              <button
                key={o.value}
                onClick={() => {
                  toggleStatus(o.value)
                }}
                style={{
                  padding: '4px 12px',
                  borderRadius: '999px',
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  border: `1px solid ${active ? theme.accent : theme.border}`,
                  background: active ? theme.accent : theme.bgCanvas,
                  color: active ? '#fff' : theme.textMuted,
                }}
              >
                {o.label}
              </button>
            )
          })}
          {statuses.length > 0 && (
            <button
              onClick={() => {
                setStatuses([])
                setPage(1)
              }}
              style={{
                padding: '4px 10px',
                borderRadius: '999px',
                fontSize: '12px',
                cursor: 'pointer',
                border: `1px dashed ${theme.border}`,
                background: 'transparent',
                color: theme.textMuted,
              }}
            >
              {t('proj.list.clear')}
            </button>
          )}
          <div style={{ width: '1px', background: theme.border, margin: '2px 4px' }} />
          <button
            onClick={() => {
              setProjectType((v) => (v === 'direct_supply' ? '' : 'direct_supply'))
              setPage(1)
            }}
            style={{
              padding: '4px 12px',
              borderRadius: '999px',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
              border: `1px solid ${projectType === 'direct_supply' ? theme.accent : theme.border}`,
              background: projectType === 'direct_supply' ? theme.accent : theme.bgCanvas,
              color: projectType === 'direct_supply' ? '#fff' : theme.textMuted,
            }}
          >
            {t('proj.list.directSupply')}
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ marginTop: '16px' }}>
        {loading && projects.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px', color: theme.textMuted }}>
            {t('proj.list.loading')}
          </div>
        ) : projects.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px', color: theme.textMuted }}>
            <div style={{ fontSize: '40px', marginBottom: '8px' }}>📁</div>
            <div style={{ marginBottom: '12px' }}>{t('proj.list.noProjectsFound')}</div>
            {isAdmin && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  navigate('/projects/new')
                }}
              >
                {t('proj.list.createFirstProject')}
              </Button>
            )}
          </div>
        ) : view === 'card' ? (
          <CardView
            projects={projects}
            theme={theme}
            onNavigate={(id) => {
              navigate(`/projects/${id}`)
            }}
          />
        ) : (
          <div
            style={{
              background: theme.bgSurface,
              border: `1px solid ${theme.border}`,
              borderRadius: '10px',
              overflow: 'hidden',
            }}
          >
            <Table
              columns={columns}
              data={projects}
              rowKey="id"
              onRowClick={(p) => {
                navigate(`/projects/${p.id}`)
              }}
            />
          </div>
        )}
      </div>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: '16px',
          }}
        >
          <span style={{ fontSize: '13px', color: theme.textMuted }}>{t('proj.list.pageOfTotal', { page: pagination.page, totalPages: pagination.totalPages, total: pagination.total })}</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button
              size="sm"
              variant="secondary"
              disabled={pagination.page <= 1}
              onClick={() => {
                setPage((p) => p - 1)
              }}
            >
              {t('proj.list.prev')}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => {
                setPage((p) => p + 1)
              }}
            >
              {t('proj.list.next')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function CardView({
  projects,
  theme,
  onNavigate,
}: {
  projects: Project[]
  theme: ReturnType<typeof useTheme>['theme']
  onNavigate: (id: string) => void
}) {
  const { t } = useTranslation()
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: '14px',
      }}
    >
      {projects.map((p) => (
        <div
          key={p.id}
          onClick={() => {
            onNavigate(p.id)
          }}
          style={{
            background: theme.bgSurface,
            border: `1px solid ${theme.border}`,
            borderRadius: '10px',
            padding: '18px',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = theme.accent)}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = theme.border)}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: '8px',
              marginBottom: '10px',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: '11px',
                  fontFamily: 'monospace',
                  color: theme.textMuted,
                  marginBottom: '2px',
                }}
              >
                {p.code}
              </div>
              <div
                style={{
                  fontWeight: 600,
                  color: theme.textPrimary,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {p.name}
              </div>
              {p.clientName && (
                <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '2px' }}>
                  {p.clientName}
                </div>
              )}
            </div>
            <Badge variant={STATUS_VARIANT[p.status] ?? 'neutral'}>
              {p.status.replace(/_/g, ' ')}
            </Badge>
          </div>
          <div style={{ marginBottom: '8px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '11px',
                color: theme.textMuted,
                marginBottom: '4px',
              }}
            >
              <span>{t('proj.list.progress')}</span>
              <span>{p.overallCompletionPct ?? 0}%</span>
            </div>
            <div
              style={{
                height: '4px',
                background: theme.border,
                borderRadius: '999px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  background: theme.accent,
                  width: `${p.overallCompletionPct ?? 0}%`,
                }}
              />
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '12px',
              color: theme.textMuted,
            }}
          >
            <span>{formatCurrency(p.projectValue ?? 0, p.budgetCurrency ?? 'IQD')}</span>
            <span>{t('proj.list.membersOpenPos', { value: p.teamCount ?? 0, value2: p.openPoCount ?? 0 })}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
