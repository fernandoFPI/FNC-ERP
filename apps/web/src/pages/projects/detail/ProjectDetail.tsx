import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@apollo/client'
import { PROJECT_QUERY, ADMIN_SET_PROJECT_STATUS, RFQ_LINES_QUERY, UPSERT_RFQ_LINES } from '../../../graphql/projects'
import { MANUFACTURING_REQUESTS_QUERY } from '../../../graphql/manufacturing-requests'
import { useTheme } from '../../../theme/ThemeContext'
import { usePermission } from '../../../hooks/usePermission'
import { useBreakpoint } from '../../../hooks/useBreakpoint'
import { usePagePadding } from '../../../hooks/usePagePadding'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { TabBar } from '../../../components/ui/TabBar'
import { ProjectStatusBar } from '../../../components/projects/ProjectStatusBar'
import { ProjectStageBar } from '../../../components/projects/ProjectStageBar'
import { ProjectKPIRow } from '../../../components/projects/ProjectKPIRow'
import { StageEditDrawer } from '../../../components/projects/StageEditDrawer'
import { ManufacturingRequestForm } from '../components/ManufacturingRequestForm'
import { formatCurrency } from '../../../lib/format'
import { api } from '../../../lib/axios'
import { useToastStore } from '../../../store/toastStore'
import { SearchableSelect } from '../../../components/ui/SearchableSelect'
import { Modal } from '../../../components/ui/Modal'

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'neutral' | 'danger' | 'info'> = {
  pending: 'neutral', ongoing: 'info', submitted: 'warning',
  approved: 'success', completed: 'success', on_hold: 'warning',
  cancelled: 'danger', cancelled_after_approval: 'danger',
}

const ALL_TABS = [
  { key: 'overview', label: 'Overview' }, { key: 'rfq_lines', label: 'Scope of Work' },
  { key: 'stages', label: 'Stages' },
  { key: 'team', label: 'Team' }, { key: 'costs', label: 'Costs' },
  { key: 'pos', label: 'Purchase Orders' },
  { key: 'mfg_requests', label: 'Manufacturing Requests' },
  { key: 'attachments', label: 'Attachments' },
  { key: 'history', label: 'History' },
]

interface Stage { id: string; name: string; sequence: number; status: string; completionPct: number; plannedStartDate?: string; plannedEndDate?: string; actualStartDate?: string; actualEndDate?: string; notes?: string; assignedTo?: string; assignedToName?: string }
interface Member { id: string; employeeId: string; name: string; role?: string; allocatedHours?: number; isActive?: boolean }

export default function ProjectDetail() {
  const { id }    = useParams<{ id: string }>()
  const navigate  = useNavigate()
  const { theme } = useTheme()
  const { isPhone } = useBreakpoint()
  const pagePadding = usePagePadding()
  const { can }   = usePermission()
  const isAdmin   = can('projects.edit')
  const addToast = useToastStore((s) => s.addToast)
  const [adminStatus, setAdminStatus] = useState('')
  const [adminSetProjectStatus, { loading: adminSetting }] = useMutation(ADMIN_SET_PROJECT_STATUS, {
    onCompleted: () => { setAdminStatus(''); addToast({ type: 'success', message: 'Status updated' }); void refetch() },
    onError: (e) => addToast({ type: 'error', message: e.message }),
  })
  const [tab, setTab]           = useState('overview')
  const [editStage, setEditStage]     = useState<Stage | null>(null)
  const [stageDrawer, setStageDrawer] = useState(false)
  const [showMRForm, setShowMRForm]   = useState(false)

  // Team tab state
  interface LiveMember { id: string; employee_id: string; employee_name: string; job_title?: string; role?: string; member_type?: string; allocated_hours?: number }
  interface Employee { id: string; first_name: string; last_name: string; job_title?: string }
  const [liveTeam, setLiveTeam]       = useState<LiveMember[]>([])
  const [teamLoading, setTeamLoading] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [employees, setEmployees]     = useState<Employee[]>([])
  const [addForm, setAddForm]         = useState({ employee_id: '', allocated_hours: '', member_type: 'technical' })
  const [addLoading, setAddLoading]   = useState(false)
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    setTeamLoading(true)
    api.get<LiveMember[]>(`/projects/${id}/members`)
      .then(r => setLiveTeam(Array.isArray(r.data) ? r.data : []))
      .catch(() => addToast({ type: 'error', message: 'Failed to load team members' }))
      .finally(() => setTeamLoading(false))
  }, [id])

  useEffect(() => {
    if (!showAddForm) return
    api.get<Employee[]>('/hr/employees', { params: { limit: 200, status: 'active' } })
      .then(r => setEmployees(Array.isArray(r.data) ? r.data : []))
      .catch(() => {})
  }, [showAddForm])

  async function handleAddMember() {
    if (!addForm.employee_id) { addToast({ type: 'error', message: 'Select an employee' }); return }
    setAddLoading(true)
    try {
      const res = await api.post<LiveMember>(`/projects/${id}/members`, {
        employee_id: addForm.employee_id,
        member_type: addForm.member_type,
        allocated_hours: addForm.allocated_hours ? parseFloat(addForm.allocated_hours) : null,
      })
      // Reload full list so we get employee_name joined from DB
      const refreshed = await api.get<LiveMember[]>(`/projects/${id}/members`)
      setLiveTeam(Array.isArray(refreshed.data) ? refreshed.data : [res.data])
      setAddForm({ employee_id: '', allocated_hours: '', member_type: 'technical' })
      setShowAddForm(false)
      addToast({ type: 'success', message: 'Team member added' })
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to add member'
      addToast({ type: 'error', message: msg })
    } finally { setAddLoading(false) }
  }

  async function handleRemoveMember(memberId: string) {
    try {
      await api.delete(`/projects/${id}/members/${memberId}`)
      setLiveTeam(prev => prev.filter(m => m.id !== memberId))
      setConfirmRemoveId(null)
      addToast({ type: 'success', message: 'Member removed' })
    } catch {
      addToast({ type: 'error', message: 'Failed to remove member' })
    }
  }

  const { data, loading, refetch } = useQuery(PROJECT_QUERY, {
    variables: { id }, skip: !id, fetchPolicy: 'cache-and-network',
  })
  const { data: mrData, refetch: refetchMRs } = useQuery(MANUFACTURING_REQUESTS_QUERY, {
    variables: { projectId: id },
    skip: !id || tab !== 'mfg_requests',
    fetchPolicy: 'cache-and-network',
  })
  const { data: rfqLinesData, refetch: refetchRFQLines } = useQuery(RFQ_LINES_QUERY, {
    variables: { projectId: id },
    skip: !id || tab !== 'rfq_lines',
    fetchPolicy: 'cache-and-network',
  })
  const [upsertRFQLines, { loading: savingLines }] = useMutation(UPSERT_RFQ_LINES, {
    onCompleted: () => { addToast({ type: 'success', message: 'Scope of work saved' }); void refetchRFQLines() },
    onError: (e) => addToast({ type: 'error', message: e.message }),
  })

  const p = data?.project

  if (loading && !p) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: theme.textMuted }}>Loading project…</div>
  if (!p) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '12px', color: theme.textMuted }}>
      <span style={{ fontSize: '40px' }}>📁</span>
      <span>Project not found</span>
      <Button variant="secondary" size="sm" onClick={() => navigate('/projects')}>Back to Projects</Button>
    </div>
  )

  const isRfqPhase = p.isRfq && !['approved', 'completed', 'cancelled_after_approval'].includes(p.status)
  const TABS = ALL_TABS
    .filter((t) => t.key !== 'costs' || isAdmin)
    .filter((t) => t.key !== 'rfq_lines' || p.isRfq)

  const parse = (v: unknown): unknown[] => { try { return Array.isArray(v) ? v : JSON.parse(String(v ?? '[]')) } catch { return [] } }
  const stages        = parse(p.stages)        as Stage[]
  const team          = parse(p.team)          as Member[]
  const statusHistory = parse(p.statusHistory) as Record<string, unknown>[]
  const activityLog   = parse(p.activityLog)   as Record<string, unknown>[]
  const recentPos     = parse(p.recentPos)     as Record<string, unknown>[]
  const costSummary   = (() => { try { if (!p.costSummary) return null; return typeof p.costSummary === 'object' ? p.costSummary : JSON.parse(String(p.costSummary)) } catch { return null } })()

  const sec = (title: string) => (
    <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: theme.textMuted, padding: '8px 0 4px', borderBottom: `1px solid ${theme.border}`, marginBottom: '12px' }}>{title}</div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <PageHeader
        title={p.name}
        subtitle={p.code}
        actions={
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <Button variant="secondary" size="sm" onClick={() => navigate(`/projects/${id}/edit`)}>Edit</Button>
            {p.isRfq && isRfqPhase && (
              <Badge variant="info">RFQ</Badge>
            )}
            <Badge variant={STATUS_VARIANT[p.status] ?? 'neutral'}>{p.status.replace(/_/g, ' ')}</Badge>
          </div>
        }
      />

      {/* Status workflow */}
      <div style={{ padding: isPhone ? '12px' : '16px 24px', background: theme.bgSurface, borderBottom: `1px solid ${theme.border}` }}>
        <ProjectStatusBar
          projectId={id!}
          status={p.status}
          allowedActions={p.allowedActions ?? []}
          onTransitioned={() => refetch()}
          timeline={{
            siteVisitDate:  p.siteVisitDate,
            siteVisitTime:  p.siteVisitTime,
            questionDate:   p.questionDate,
            questionTime:   p.questionTime,
            submissionDate: p.submissionDate,
            submissionTime: p.submissionTime,
          }}
        />
        {isAdmin && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px', paddingTop: '10px', borderTop: `1px dashed ${theme.border}` }}>
            <span style={{ fontSize: '11px', color: theme.textMuted, whiteSpace: 'nowrap' }}>Admin override:</span>
            <SearchableSelect
              value={adminStatus}
              onChange={setAdminStatus}
              placeholder="Force set status…"
              options={[
                { value: 'pending',                   label: 'Pending' },
                { value: 'ongoing',                   label: 'Ongoing' },
                { value: 'submitted',                 label: 'Submitted' },
                { value: 'approved',                  label: 'Approved' },
                { value: 'completed',                 label: 'Completed' },
                { value: 'on_hold',                   label: 'On Hold' },
                { value: 'cancelled',                 label: 'Cancelled' },
                { value: 'cancelled_after_approval',  label: 'Cancelled After Approval' },
              ]}
            />
            <Button
              variant="danger"
              size="sm"
              disabled={!adminStatus || adminStatus === p.status}
              loading={adminSetting}
              onClick={() => void adminSetProjectStatus({ variables: { id: id!, status: adminStatus } })}
            >
              Apply
            </Button>
          </div>
        )}
      </div>

      {/* KPI row */}
      <div style={{ padding: isPhone ? '12px' : '16px 24px', background: theme.bgCanvas, borderBottom: `1px solid ${theme.border}` }}>
        <ProjectKPIRow
          projectValue={p.projectValue ?? 0}
          budgetAmount={p.budgetAmount ?? 0}
          currencyCode={p.budgetCurrency ?? 'IQD'}
          overallCompletionPct={p.overallCompletionPct ?? 0}
          teamCount={p.teamCount ?? 0}
          openPoCount={p.openPoCount ?? 0}
          costSummary={costSummary}
          showFinance={isAdmin}
        />
      </div>

      {/* Stage bar */}
      {stages.length > 0 && (
        <div style={{ padding: '12px 24px', background: theme.bgSurface, borderBottom: `1px solid ${theme.border}` }}>
          <ProjectStageBar stages={stages} overallPct={p.overallCompletionPct ?? 0} onStageClick={s => { setEditStage(s); setStageDrawer(true) }} />
        </div>
      )}

      {/* Tabs */}
      <div style={{ padding: isPhone ? '0 8px' : '0 24px', background: theme.bgSurface, borderBottom: `1px solid ${theme.border}`, overflowX: 'auto' }}>
        <TabBar tabs={TABS} active={tab} onChange={setTab} />
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: isPhone ? '16px 12px' : '20px 24px', paddingBottom: isPhone ? 'calc(env(safe-area-inset-bottom, 0px) + 80px)' : undefined }}>
        {tab === 'rfq_lines' && (
          <RFQLinesTab
            projectId={id!}
            lines={rfqLinesData?.rfqLines ?? []}
            isEditable={isRfqPhase || isAdmin}
            saving={savingLines}
            onSave={(lines) => void upsertRFQLines({ variables: { projectId: id!, lines } })}
            theme={theme}
            rfqEstimatedCost={p.rfqEstimatedCost}
            rfqOutcome={p.rfqOutcome}
            rfqOutcomeReason={p.rfqOutcomeReason}
          />
        )}

        {tab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* Alert banners for hold/cancel */}
            {p.holdReason && (
              <div style={{ padding: '12px 16px', borderRadius: '8px', background: '#fef3c7', border: '1px solid #f59e0b', fontSize: '13px', color: '#92400e' }}>
                <strong>On Hold:</strong> {p.holdReason}
              </div>
            )}
            {p.cancelReason && (
              <div style={{ padding: '12px 16px', borderRadius: '8px', background: '#fee2e2', border: '1px solid #ef4444', fontSize: '13px', color: '#991b1b' }}>
                <strong>Cancelled:</strong> {p.cancelReason}
              </div>
            )}

            {/* Details grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>

              {/* Project Info */}
              <div style={{ background: theme.bgSurface, border: `1px solid ${theme.border}`, borderRadius: '10px', padding: '16px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: theme.textMuted, marginBottom: '12px' }}>Project Info</div>
                {[
                  ['Code', p.code],
                  ['Type', String(p.projectType ?? '').replace(/_/g, ' ')],
                  ['Location', p.projectLocation],
                  ['RFQ Number', p.rfqNumber],
                  ['Contract Name', p.contractName],
                  ['Manager', p.managerName],
                  ['Current Stage', p.currentStageName],
                  ['Analytic Account', p.analyticAccountName],
                ].filter(([, v]) => v).map(([label, value]) => (
                  <div key={String(label)} style={{ display: 'flex', gap: '12px', padding: '6px 0', borderBottom: `1px solid ${theme.border}22` }}>
                    <div style={{ width: '130px', flexShrink: 0, fontSize: '12px', color: theme.textMuted }}>{label}</div>
                    <div style={{ fontSize: '13px', color: theme.textPrimary, wordBreak: 'break-word' }}>{String(value)}</div>
                  </div>
                ))}
              </div>

              {/* Client & Timeline */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ background: theme.bgSurface, border: `1px solid ${theme.border}`, borderRadius: '10px', padding: '16px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: theme.textMuted, marginBottom: '12px' }}>Client</div>
                  {[
                    ['Name', p.clientName],
                    ['Contact', p.clientContact],
                  ].filter(([, v]) => v).map(([label, value]) => (
                    <div key={String(label)} style={{ display: 'flex', gap: '12px', padding: '6px 0', borderBottom: `1px solid ${theme.border}22` }}>
                      <div style={{ width: '80px', flexShrink: 0, fontSize: '12px', color: theme.textMuted }}>{label}</div>
                      <div style={{ fontSize: '13px', color: theme.textPrimary }}>{String(value)}</div>
                    </div>
                  ))}
                </div>

                <div style={{ background: theme.bgSurface, border: `1px solid ${theme.border}`, borderRadius: '10px', padding: '16px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: theme.textMuted, marginBottom: '12px' }}>Timeline</div>
                  {(() => {
                    const fmtTime = (t?: string | null) => t ? t.slice(0, 5) : null
                    const fmtDT = (d?: string | null, t?: string | null) => {
                      if (!d) return null
                      return fmtTime(t) ? `${d} · ${fmtTime(t)}` : d
                    }
                    const rows: [string, string | null | undefined][] = [
                      ['Receiving', p.receivingDate],
                      ['Submission', fmtDT(p.submissionDate, p.submissionTime)],
                      ['Site Visit', fmtDT(p.siteVisitDate, p.siteVisitTime)],
                      ['Questions', fmtDT(p.questionDate, p.questionTime)],
                      ['Planned Start', p.plannedStartDate],
                      ['Planned End', p.plannedEndDate],
                      ['Submitted', p.submittedAt?.slice(0, 10)],
                      ['Approved', p.approvedAt?.slice(0, 10)],
                      ['Completed', p.completedAt?.slice(0, 10)],
                      ['Cancelled', p.cancelledAt?.slice(0, 10)],
                      ['Created', p.createdAt?.slice(0, 10)],
                    ]
                    return rows.filter(([, v]) => v).map(([label, value]) => (
                      <div key={label} style={{ display: 'flex', gap: '12px', padding: '6px 0', borderBottom: `1px solid ${theme.border}22` }}>
                        <div style={{ width: '100px', flexShrink: 0, fontSize: '12px', color: theme.textMuted }}>{label}</div>
                        <div style={{ fontSize: '13px', color: theme.textPrimary, fontVariantNumeric: 'tabular-nums' }}>{String(value)}</div>
                      </div>
                    ))
                  })()}
                </div>
              </div>

            </div>
          </div>
        )}

        {tab === 'stages' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <span style={{ fontSize: '13px', color: theme.textMuted }}>{stages.length} stage{stages.length !== 1 ? 's' : ''}</span>
              {isAdmin && <Button variant="primary" size="sm" onClick={() => { setEditStage(null); setStageDrawer(true) }}>Add Stage</Button>}
            </div>
            {stages.length === 0 && <div style={{ color: theme.textMuted, fontSize: '13px', textAlign: 'center', padding: '24px 0' }}>No stages defined.</div>}
            {stages.length > 0 && (
              isPhone ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {[...stages].sort((a, b) => a.sequence - b.sequence).map(s => (
                    <div key={s.id} onClick={() => { setEditStage(s); setStageDrawer(true) }}
                      style={{ display: 'flex', alignItems: 'center', gap: '12px', background: theme.bgSurface, border: `1px solid ${theme.border}`, borderRadius: '8px', padding: '12px 14px', cursor: 'pointer' }}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = theme.accent)} onMouseLeave={e => (e.currentTarget.style.borderColor = theme.border)}>
                      <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: theme.accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, color: theme.accent, flexShrink: 0 }}>{s.sequence}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 500, color: theme.textPrimary, fontSize: '13px' }}>{s.name}</div>
                        {s.plannedStartDate && <div style={{ fontSize: '11px', color: theme.textMuted }}>{s.plannedStartDate} → {s.plannedEndDate ?? '—'}</div>}
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary }}>{s.completionPct}%</div>
                        <Badge variant={s.status === 'completed' ? 'success' : (s.status === 'active' || s.status === 'in_progress') ? 'info' : 'neutral'}>{s.status.replace('_', ' ')}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ background: theme.bgSurface, border: `1px solid ${theme.border}`, borderRadius: '10px', overflow: 'hidden' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '44px 1fr 160px 140px 120px 100px 32px', padding: '8px 16px', borderBottom: `1px solid ${theme.border}`, background: theme.bgCanvas }}>
                    {['#', 'Stage', 'Dates', 'Assigned To', 'Progress', 'Status', ''].map((h, i) => (
                      <div key={i} style={{ fontSize: '11px', fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: i === 4 ? 'center' : 'left' }}>{h}</div>
                    ))}
                  </div>
                  {[...stages].sort((a, b) => a.sequence - b.sequence).map((s, i) => (
                    <div key={s.id} onClick={() => { setEditStage(s); setStageDrawer(true) }}
                      style={{ display: 'grid', gridTemplateColumns: '44px 1fr 160px 140px 120px 100px 32px', alignItems: 'center', padding: '10px 16px', borderBottom: i < stages.length - 1 ? `1px solid ${theme.border}` : 'none', cursor: 'pointer' }}
                      onMouseEnter={e => (e.currentTarget.style.background = theme.bgCanvas)} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: theme.accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: theme.accent }}>{s.sequence}</div>
                      <div style={{ fontSize: '13px', fontWeight: 500, color: theme.textPrimary }}>{s.name}</div>
                      <div style={{ fontSize: '12px', color: theme.textMuted }}>{s.plannedStartDate ? `${s.plannedStartDate} → ${s.plannedEndDate ?? '—'}` : '—'}</div>
                      <div style={{ fontSize: '12px', color: theme.textMuted }}>{s.assignedToName ?? '—'}</div>
                      <div style={{ padding: '0 8px' }}>
                        <div style={{ height: '6px', borderRadius: '3px', background: theme.border, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${s.completionPct}%`, background: s.completionPct === 100 ? '#22c55e' : theme.accent, borderRadius: '3px', transition: 'width 0.3s' }} />
                        </div>
                        <div style={{ fontSize: '11px', color: theme.textMuted, textAlign: 'center', marginTop: '2px' }}>{s.completionPct}%</div>
                      </div>
                      <div><Badge variant={s.status === 'completed' ? 'success' : (s.status === 'active' || s.status === 'in_progress') ? 'info' : 'neutral'}>{s.status.replace('_', ' ')}</Badge></div>
                      <div style={{ color: theme.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
        )}

        {tab === 'team' && (() => {
          const technical  = liveTeam.filter(m => (m.member_type ?? 'technical') === 'technical')
          const commercial = liveTeam.filter(m => m.member_type === 'commercial')

          const typeTag = (type: string) => (
            <span style={{
              display: 'inline-block', padding: '2px 8px', borderRadius: '999px', fontSize: '10px', fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: '0.05em',
              background: type === 'commercial' ? '#7c3aed18' : `${theme.accent}18`,
              color: type === 'commercial' ? '#7c3aed' : theme.accent,
            }}>
              {type === 'commercial' ? 'Commercial' : 'Technical'}
            </span>
          )

          const memberRow = (m: LiveMember, i: number, last: boolean) => (
            <div key={m.id} style={{ display: 'grid', gridTemplateColumns: confirmRemoveId === m.id ? '40px 1fr 1fr 100px 80px 200px' : '40px 1fr 1fr 100px 80px 40px', alignItems: 'center', padding: '10px 16px', borderBottom: !last ? `1px solid ${theme.border}` : 'none' }}>
              <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: m.member_type === 'commercial' ? '#7c3aed18' : theme.accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: m.member_type === 'commercial' ? '#7c3aed' : theme.accent }}>
                {(m.employee_name ?? '?')[0].toUpperCase()}
              </div>
              <div style={{ fontSize: '13px', fontWeight: 500, color: theme.textPrimary }}>{m.employee_name}</div>
              <div style={{ fontSize: '13px', color: theme.textMuted }}>{m.job_title ?? '—'}</div>
              <div>{typeTag(m.member_type ?? 'technical')}</div>
              <div style={{ fontSize: '13px', color: theme.textMuted, textAlign: 'right' }}>{m.allocated_hours != null ? `${m.allocated_hours}h` : '—'}</div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
                {isAdmin && (
                  confirmRemoveId === m.id ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '11px', color: theme.textMuted, whiteSpace: 'nowrap' }}>Remove?</span>
                      <button onClick={() => void handleRemoveMember(m.id)} style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '5px', background: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Yes</button>
                      <button onClick={() => setConfirmRemoveId(null)} style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '5px', background: 'transparent', color: theme.textMuted, border: `1px solid ${theme.border}`, cursor: 'pointer' }}>No</button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmRemoveId(m.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted, padding: '4px', borderRadius: '4px', display: 'flex', alignItems: 'center' }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')} onMouseLeave={e => (e.currentTarget.style.color = theme.textMuted)} title="Remove">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  )
                )}
              </div>
            </div>
          )

          const sectionHeader = (label: string, count: number, color: string) => (
            <div style={{ padding: '8px 16px', background: `${color}10`, borderBottom: `1px solid ${theme.border}`, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color }}>{label}</span>
              <span style={{ fontSize: '11px', color: theme.textMuted }}>({count})</span>
            </div>
          )

          const tableHeader = (
            <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr 1fr 100px 80px 40px', gap: '0', padding: '8px 16px', borderBottom: `1px solid ${theme.border}`, background: theme.bgCanvas }}>
              <div /><div style={{ fontSize: '11px', fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Name</div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Job Title</div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Type</div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>Hours</div>
              <div />
            </div>
          )

          return (
            <div>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <span style={{ fontSize: '13px', color: theme.textMuted }}>
                  {technical.length} technical · {commercial.length} commercial
                </span>
                {isAdmin && (
                  <Button variant="primary" size="sm" onClick={() => setShowAddForm(true)}>Add Member</Button>
                )}
              </div>

              {/* Add Member Modal */}
              <Modal open={showAddForm} onClose={() => { setShowAddForm(false); setAddForm({ employee_id: '', allocated_hours: '', member_type: 'technical' }) }} title="Add Team Member" size="sm">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {/* Team type toggle */}
                  <div>
                    <label style={{ fontSize: '11px', color: theme.textMuted, display: 'block', marginBottom: '6px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Team Type</label>
                    <div style={{ display: 'flex', gap: '0', border: `1px solid ${theme.border}`, borderRadius: '8px', overflow: 'hidden' }}>
                      {(['technical', 'commercial'] as const).map(t => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setAddForm(f => ({ ...f, member_type: t }))}
                          style={{
                            flex: 1, padding: '8px 0', fontSize: '13px', fontWeight: 500, border: 'none', cursor: 'pointer',
                            background: addForm.member_type === t ? (t === 'commercial' ? '#7c3aed' : theme.accent) : theme.bgCanvas,
                            color: addForm.member_type === t ? '#fff' : theme.textMuted,
                            transition: 'background 0.15s',
                          }}
                        >
                          {t === 'technical' ? 'Technical' : 'Commercial'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <SearchableSelect
                    label="Employee"
                    value={addForm.employee_id}
                    onChange={(v) => setAddForm(f => ({ ...f, employee_id: v }))}
                    placeholder="Select employee…"
                    options={employees.map(e => ({
                      value: e.id,
                      label: `${e.first_name} ${e.last_name}${e.job_title ? ` — ${e.job_title}` : ''}`,
                    }))}
                  />
                  <div>
                    <label style={{ fontSize: '11px', color: theme.textMuted, display: 'block', marginBottom: '4px', fontWeight: 500 }}>Allocated Hours (optional)</label>
                    <input
                      type="number" min="0" step="0.5" placeholder="0"
                      value={addForm.allocated_hours}
                      onChange={e => setAddForm(f => ({ ...f, allocated_hours: e.target.value }))}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '7px', border: `1px solid ${theme.borderInput}`, background: theme.bgCanvas, color: theme.textPrimary, fontSize: '13px', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', paddingTop: '4px' }}>
                    <Button variant="ghost" onClick={() => { setShowAddForm(false); setAddForm({ employee_id: '', allocated_hours: '', member_type: 'technical' }) }}>Cancel</Button>
                    <Button variant="primary" loading={addLoading} onClick={handleAddMember}>Add Member</Button>
                  </div>
                </div>
              </Modal>

              {/* Team list */}
              {teamLoading && <div style={{ color: theme.textMuted, fontSize: '13px' }}>Loading…</div>}
              {!teamLoading && liveTeam.length === 0 && (
                <div style={{ color: theme.textMuted, fontSize: '13px', padding: '24px 0', textAlign: 'center' }}>No team members yet.</div>
              )}
              {!teamLoading && liveTeam.length > 0 && (
                isPhone ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {(['technical', 'commercial'] as const).map(type => {
                      const group = liveTeam.filter(m => (m.member_type ?? 'technical') === type)
                      if (group.length === 0) return null
                      return (
                        <React.Fragment key={type}>
                          <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: type === 'commercial' ? '#7c3aed' : theme.accent, padding: '4px 0' }}>
                            {type === 'commercial' ? 'Commercial Team' : 'Technical Team'}
                          </div>
                          {group.map(m => (
                            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', background: theme.bgSurface, border: `1px solid ${theme.border}`, borderRadius: '8px', padding: '10px 12px' }}>
                              <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: m.member_type === 'commercial' ? '#7c3aed18' : theme.accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, color: m.member_type === 'commercial' ? '#7c3aed' : theme.accent, flexShrink: 0 }}>
                                {(m.employee_name ?? '?')[0].toUpperCase()}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 500, color: theme.textPrimary, fontSize: '13px' }}>{m.employee_name}</div>
                                <div style={{ fontSize: '11px', color: theme.textMuted }}>{m.job_title ?? '—'}</div>
                              </div>
                              {m.allocated_hours != null && <span style={{ fontSize: '12px', color: theme.textMuted }}>{m.allocated_hours}h</span>}
                              {isAdmin && (
                                confirmRemoveId === m.id ? (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ fontSize: '11px', color: theme.textMuted }}>Remove?</span>
                                    <button onClick={() => void handleRemoveMember(m.id)} style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Yes</button>
                                    <button onClick={() => setConfirmRemoveId(null)} style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: 'transparent', color: theme.textMuted, border: `1px solid ${theme.border}`, cursor: 'pointer' }}>No</button>
                                  </div>
                                ) : (
                                  <button onClick={() => setConfirmRemoveId(m.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted, padding: '4px', display: 'flex', alignItems: 'center' }}
                                    onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')} onMouseLeave={e => (e.currentTarget.style.color = theme.textMuted)}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                  </button>
                                )
                              )}
                            </div>
                          ))}
                        </React.Fragment>
                      )
                    })}
                  </div>
                ) : (
                  <div style={{ background: theme.bgSurface, border: `1px solid ${theme.border}`, borderRadius: '10px', overflow: 'hidden' }}>
                    {tableHeader}
                    {technical.length > 0 && sectionHeader('Technical Team', technical.length, theme.accent)}
                    {technical.map((m, i) => memberRow(m, i, i === technical.length - 1 && commercial.length === 0))}
                    {commercial.length > 0 && sectionHeader('Commercial Team', commercial.length, '#7c3aed')}
                    {commercial.map((m, i) => memberRow(m, i, i === commercial.length - 1))}
                  </div>
                )
              )}
            </div>
          )
        })()}

        {tab === 'costs' && (
          <div>
            {!costSummary ? (
              <div style={{ color: theme.textMuted, fontSize: '13px', textAlign: 'center', padding: '24px 0' }}>No cost data.</div>
            ) : (() => {
              const cs = costSummary as Record<string, unknown>
              const ccy = String(cs['currencyCode'] ?? p.budgetCurrency ?? 'IQD')
              const gccy = String(cs['grossMarginCurrencyCode'] ?? cs['currencyCode'] ?? 'IQD')
              const budgetRemaining = cs['budgetRemaining'] as number
              const cards = [
                { label: 'Budget Amount',     key: 'budgetAmount',       ccy, accent: false },
                { label: 'Actual Costs',      key: 'actualCosts',        ccy, accent: false },
                { label: 'Equipment Rental',  key: 'equipmentRentalCosts', ccy, accent: false },
                { label: 'Committed Costs',   key: 'committedCosts',     ccy, accent: false },
                { label: 'Budget Remaining',  key: 'budgetRemaining',    ccy, accent: true },
                { label: 'Gross Margin',      key: 'grossMargin',        ccy: gccy, accent: false },
              ].filter(c => cs[c.key] != null)
              return (
                <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr 1fr' : 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                  {cards.map(c => {
                    const val = cs[c.key] as number
                    const isNeg = c.key === 'budgetRemaining' && val < 0
                    return (
                      <div key={c.key} style={{ background: theme.bgSurface, border: `1px solid ${isNeg ? '#ef444466' : theme.border}`, borderRadius: '10px', padding: '16px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>{c.label}</div>
                        <div style={{ fontSize: '20px', fontWeight: 700, color: isNeg ? '#ef4444' : theme.textPrimary, fontVariantNumeric: 'tabular-nums' }}>
                          {formatCurrency(val, c.ccy)}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </div>
        )}

        {tab === 'pos' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <span style={{ fontSize: '13px', color: theme.textMuted }}>{recentPos.length} purchase order{recentPos.length !== 1 ? 's' : ''}</span>
              <Button variant="primary" size="sm" onClick={() => navigate(`/procurement/purchase-orders/new?projectId=${id}`)}>+ Create PO</Button>
            </div>
            {recentPos.length === 0 && <div style={{ color: theme.textMuted, fontSize: '13px', textAlign: 'center', padding: '24px 0' }}>No purchase orders.</div>}
            {recentPos.length > 0 && (
              isPhone ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {recentPos.map((po, i) => (
                    <div key={String(po.id ?? i)} onClick={() => navigate(`/procurement/purchase-orders/${po.id}`)}
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: theme.bgSurface, border: `1px solid ${theme.border}`, borderRadius: '8px', padding: '10px 14px', cursor: 'pointer' }}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = theme.accent)} onMouseLeave={e => (e.currentTarget.style.borderColor = theme.border)}>
                      <div>
                        <div style={{ fontWeight: 500, color: theme.textPrimary, fontSize: '13px' }}>{String(po.po_number ?? '—')}</div>
                        <div style={{ fontSize: '11px', color: theme.textMuted }}>{String(po.vendor_name ?? '')}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 600, fontSize: '13px' }}>{String(po.total_amount ?? '—')}</div>
                        <Badge variant="neutral">{String(po.status ?? '—')}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ background: theme.bgSurface, border: `1px solid ${theme.border}`, borderRadius: '10px', overflow: 'hidden' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr 140px 110px 32px', padding: '8px 16px', borderBottom: `1px solid ${theme.border}`, background: theme.bgCanvas }}>
                    {['PO Number', 'Vendor', 'Amount', 'Status', ''].map((h, i) => (
                      <div key={i} style={{ fontSize: '11px', fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</div>
                    ))}
                  </div>
                  {recentPos.map((po, i) => (
                    <div key={String(po.id ?? i)} onClick={() => navigate(`/procurement/purchase-orders/${po.id}`)}
                      style={{ display: 'grid', gridTemplateColumns: '180px 1fr 140px 110px 32px', alignItems: 'center', padding: '10px 16px', borderBottom: i < recentPos.length - 1 ? `1px solid ${theme.border}` : 'none', cursor: 'pointer' }}
                      onMouseEnter={e => (e.currentTarget.style.background = theme.bgCanvas)} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <div style={{ fontFamily: 'monospace', fontSize: '13px', fontWeight: 600, color: theme.accent }}>{String(po.po_number ?? '—')}</div>
                      <div style={{ fontSize: '13px', color: theme.textPrimary }}>{String(po.vendor_name ?? '—')}</div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary, fontVariantNumeric: 'tabular-nums' }}>{String(po.total_amount ?? '—')}</div>
                      <div><Badge variant="neutral">{String(po.status ?? '—')}</Badge></div>
                      <div style={{ color: theme.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
        )}

        {tab === 'mfg_requests' && (() => {
          const mrs = (mrData?.manufacturingRequests ?? []) as Array<Record<string, unknown>>
          const statusVariant: Record<string, 'neutral' | 'warning' | 'info' | 'success' | 'danger'> = {
            draft: 'neutral', pending_approval: 'warning', approved: 'info',
            in_production: 'info', completed: 'success', cancelled: 'danger',
          }
          return (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <span style={{ fontSize: '13px', color: theme.textMuted }}>{mrs.length} request{mrs.length !== 1 ? 's' : ''}</span>
                <Button variant="primary" size="sm" onClick={() => setShowMRForm(true)}>New Request</Button>
              </div>
              {mrs.length === 0 && <div style={{ color: theme.textMuted, fontSize: '13px', textAlign: 'center', padding: '24px 0' }}>No manufacturing requests yet.</div>}
              {mrs.length > 0 && (
                isPhone ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {mrs.map(mr => (
                      <div key={String(mr['id'])} onClick={() => navigate(`/manufacturing/requests/${mr['id']}`)}
                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: theme.bgSurface, border: `1px solid ${theme.border}`, borderRadius: '8px', padding: '12px 14px', cursor: 'pointer' }}
                        onMouseEnter={e => (e.currentTarget.style.borderColor = theme.accent)} onMouseLeave={e => (e.currentTarget.style.borderColor = theme.border)}>
                        <div>
                          <div style={{ fontWeight: 600, color: theme.accent, fontFamily: 'monospace', fontSize: '13px' }}>{String(mr['requestNumber'] ?? '—')}</div>
                          <div style={{ fontSize: '11px', color: theme.textMuted }}>{String(mr['productName'] ?? '')} · Qty {String(mr['qtyRequested'] ?? 0)}</div>
                        </div>
                        <Badge variant={statusVariant[String(mr['status'])] ?? 'neutral'}>{String(mr['status']).replace(/_/g, ' ')}</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ background: theme.bgSurface, border: `1px solid ${theme.border}`, borderRadius: '10px', overflow: 'hidden' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 80px 130px 120px 32px', padding: '8px 16px', borderBottom: `1px solid ${theme.border}`, background: theme.bgCanvas }}>
                      {['Request #', 'Product', 'Qty', 'Required Date', 'Status', ''].map((h, i) => (
                        <div key={i} style={{ fontSize: '11px', fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</div>
                      ))}
                    </div>
                    {mrs.map((mr, i) => (
                      <div key={String(mr['id'])} onClick={() => navigate(`/manufacturing/requests/${mr['id']}`)}
                        style={{ display: 'grid', gridTemplateColumns: '160px 1fr 80px 130px 120px 32px', alignItems: 'center', padding: '10px 16px', borderBottom: i < mrs.length - 1 ? `1px solid ${theme.border}` : 'none', cursor: 'pointer' }}
                        onMouseEnter={e => (e.currentTarget.style.background = theme.bgCanvas)} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                        <div style={{ fontFamily: 'monospace', fontSize: '13px', fontWeight: 600, color: theme.accent }}>{String(mr['requestNumber'] ?? '—')}</div>
                        <div style={{ fontSize: '13px', color: theme.textPrimary }}>{String(mr['productName'] ?? '—')}</div>
                        <div style={{ fontSize: '13px', color: theme.textMuted }}>{String(mr['qtyRequested'] ?? 0)}</div>
                        <div style={{ fontSize: '13px', color: theme.textMuted }}>{mr['requiredDate'] ? String(mr['requiredDate']).slice(0, 10) : '—'}</div>
                        <div><Badge variant={statusVariant[String(mr['status'])] ?? 'neutral'}>{String(mr['status']).replace(/_/g, ' ')}</Badge></div>
                        <div style={{ color: theme.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          )
        })()}

        {tab === 'attachments' && id && (
          <AttachmentsTab projectId={id} theme={theme} />
        )}

        {tab === 'history' && (() => {
          const EVENT_ICON: Record<string, string> = {
            status_change: '🔄', field_update: '✏️', stage_create: '📋',
            stage_update: '📋', team_add: '👤', team_remove: '👤',
          }
          const EVENT_COLOR: Record<string, string> = {
            status_change: theme.accent, field_update: '#8b5cf6',
            stage_create: '#0ea5e9', stage_update: '#0ea5e9',
            team_add: '#10b981', team_remove: '#ef4444',
          }
          const log = activityLog.length > 0 ? activityLog : statusHistory.map(h => ({
            eventType: 'status_change',
            actorName: h.changed_by_name ?? 'System',
            summary: h.from_status
              ? `Status changed: ${String(h.from_status).replace(/_/g, ' ')} → ${String(h.to_status ?? '').replace(/_/g, ' ')}` + (h.reason ? ` ("${String(h.reason)}")` : '')
              : `Project created with status: ${String(h.to_status ?? '').replace(/_/g, ' ')}`,
            createdAt: h.created_at,
          }))
          return (
            <div style={{ maxWidth: '700px' }}>
              {log.length === 0 && <div style={{ color: theme.textMuted, fontSize: '13px', textAlign: 'center', padding: '24px 0' }}>No activity yet.</div>}
              {log.length > 0 && (
                <div style={{ position: 'relative', paddingLeft: '20px' }}>
                  <div style={{ position: 'absolute', left: '7px', top: '8px', bottom: '8px', width: '2px', background: `${theme.accent}33`, borderRadius: '1px' }} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                    {log.map((entry, i) => {
                      const e = entry as Record<string, unknown>
                      const et = String(e['eventType'] ?? 'status_change')
                      const dotColor = EVENT_COLOR[et] ?? theme.accent
                      const ts = e['createdAt']
                      return (
                        <div key={i} style={{ position: 'relative', paddingBottom: i < log.length - 1 ? '16px' : '0' }}>
                          <div style={{ position: 'absolute', left: '-17px', top: '8px', width: '10px', height: '10px', borderRadius: '50%', background: dotColor, border: `2px solid ${theme.bgCanvas}`, zIndex: 1 }} />
                          <div style={{ background: theme.bgSurface, border: `1px solid ${theme.border}`, borderRadius: '8px', padding: '10px 14px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                                <span style={{ fontSize: '14px' }}>{EVENT_ICON[et] ?? '•'}</span>
                                <div>
                                  <div style={{ fontSize: '13px', color: theme.textPrimary, fontWeight: 500 }}>
                                    {String(e['summary'] ?? '')}
                                  </div>
                                  {!!e['actorName'] && String(e['actorName']) !== 'System' && (
                                    <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '2px' }}>
                                      by {String(e['actorName'])}
                                    </div>
                                  )}
                                </div>
                              </div>
                              {!!ts && (
                                <div style={{ fontSize: '11px', color: theme.textMuted, whiteSpace: 'nowrap', flexShrink: 0, paddingTop: '2px' }}>
                                  {new Date(String(ts)).toLocaleString()}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )
        })()}
      </div>

      <StageEditDrawer
        projectId={id!}
        stage={editStage}
        open={stageDrawer}
        onClose={() => setStageDrawer(false)}
        onSaved={() => refetch()}
        teamMembers={liveTeam.map(m => ({ id: m.id, employeeId: m.employee_id, name: m.employee_name, role: m.role }))}
        isAdmin={isAdmin}
      />
      {showMRForm && (
        <ManufacturingRequestForm projectId={id!} onClose={() => setShowMRForm(false)} onCreated={() => refetchMRs()} />
      )}
    </div>
  )
}

// ── RFQ Scope-of-Work Tab ──────────────────────────────────────────────────

interface RFQLine {
  id?: string
  sequence: number
  phaseLabel: string
  description: string
  quantity: string
  unit: string
  estimatedUnitCost: string
  bidUnitPrice: string
  notes: string
}

function blankLine(seq: number): RFQLine {
  return { sequence: seq, phaseLabel: '', description: '', quantity: '', unit: '', estimatedUnitCost: '', bidUnitPrice: '', notes: '' }
}

function RFQLinesTab({
  projectId: _projectId,
  lines: serverLines,
  isEditable,
  saving,
  onSave,
  theme,
  rfqEstimatedCost,
  rfqOutcome,
  rfqOutcomeReason,
}: {
  projectId: string
  lines: Array<Record<string, unknown>>
  isEditable: boolean
  saving: boolean
  onSave: (lines: Array<{ sequence: number; phaseLabel?: string; description: string; quantity?: number; unit?: string; estimatedUnitCost?: number; bidUnitPrice?: number; notes?: string }>) => void
  theme: ReturnType<typeof useTheme>['theme']
  rfqEstimatedCost?: number | null
  rfqOutcome?: string | null
  rfqOutcomeReason?: string | null
}) {
  const [rows, setRows] = React.useState<RFQLine[]>([blankLine(0)])
  const [dirty, setDirty] = React.useState(false)
  const hasLoadedRef = React.useRef(false)

  React.useEffect(() => {
    if (serverLines.length > 0) {
      hasLoadedRef.current = true
      setRows(serverLines.map((l) => ({
        id: String(l['id'] ?? ''),
        sequence: parseInt(String(l['sequence'] ?? 0)),
        phaseLabel: String(l['phaseLabel'] ?? ''),
        description: String(l['description'] ?? ''),
        quantity: l['quantity'] != null ? String(l['quantity']) : '',
        unit: String(l['unit'] ?? ''),
        estimatedUnitCost: l['estimatedUnitCost'] != null ? String(l['estimatedUnitCost']) : '',
        bidUnitPrice: l['bidUnitPrice'] != null ? String(l['bidUnitPrice']) : '',
        notes: String(l['notes'] ?? ''),
      })))
      setDirty(false)
    } else if (!hasLoadedRef.current) {
      setRows([blankLine(0)])
      setDirty(false)
    }
    // if hasLoadedRef.current is true and serverLines is transiently empty (Apollo refetch in-flight),
    // leave rows unchanged to avoid flickering back to blank
  }, [serverLines])

  const update = (i: number, key: keyof RFQLine, val: string) => {
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, [key]: val } : r))
    setDirty(true)
  }

  const addRow = () => { setRows(prev => [...prev, blankLine(prev.length)]); setDirty(true) }
  const removeRow = (i: number) => { setRows(prev => prev.filter((_, idx) => idx !== i)); setDirty(true) }

  const handleSave = () => {
    const payload = rows.filter(r => r.description.trim()).map((r, idx) => ({
      sequence: idx,
      phaseLabel: r.phaseLabel.trim() || undefined,
      description: r.description.trim(),
      quantity: r.quantity ? parseFloat(r.quantity) : undefined,
      unit: r.unit || undefined,
      estimatedUnitCost: r.estimatedUnitCost ? parseFloat(r.estimatedUnitCost) : undefined,
      bidUnitPrice: r.bidUnitPrice ? parseFloat(r.bidUnitPrice) : undefined,
      notes: r.notes || undefined,
    }))
    onSave(payload)
    setDirty(false)
  }

  const totalEstimated = rows.reduce((s, r) => {
    const qty = parseFloat(r.quantity || '1')
    const cost = parseFloat(r.estimatedUnitCost || '0')
    return s + (qty * cost)
  }, 0)
  const totalBid = rows.reduce((s, r) => {
    const qty = parseFloat(r.quantity || '1')
    const price = parseFloat(r.bidUnitPrice || '0')
    return s + (qty * price)
  }, 0)

  const outcomeColors: Record<string, string> = { won: '#16a34a', lost: '#ef4444', withdrawn: '#f59e0b' }
  const cellStyle: React.CSSProperties = { padding: '4px 6px', fontSize: '12px', border: `1px solid ${theme.border}`, borderRadius: '5px', background: theme.bgCanvas, color: theme.textPrimary, width: '100%', boxSizing: 'border-box' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* Outcome banner */}
      {rfqOutcome && (
        <div style={{ padding: '10px 16px', borderRadius: '8px', background: `${outcomeColors[rfqOutcome] ?? theme.border}22`, border: `1px solid ${outcomeColors[rfqOutcome] ?? theme.border}`, fontSize: '13px', color: outcomeColors[rfqOutcome] ?? theme.textMuted, display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ fontWeight: 600 }}>RFQ Outcome: {rfqOutcome.charAt(0).toUpperCase() + rfqOutcome.slice(1)}</span>
          {rfqOutcomeReason && <span>— {rfqOutcomeReason}</span>}
        </div>
      )}

      {/* Summary row */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        {[
          ...(rfqEstimatedCost != null ? [{ label: 'Internal Estimate', sub: 'from project form', value: rfqEstimatedCost, color: theme.textMuted }] : []),
          { label: 'Scope Cost', sub: 'qty × est. cost/unit', value: totalEstimated, color: '#f59e0b' },
          { label: 'Bid Total', sub: 'qty × bid price/unit', value: totalBid, color: theme.accent },
        ].map(({ label, sub, value, color }) => (
          <div key={label} style={{ background: theme.bgSurface, border: `1px solid ${theme.border}`, borderRadius: '8px', padding: '10px 14px', minWidth: '160px' }}>
            <div style={{ fontSize: '11px', color: theme.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
            <div style={{ fontSize: '18px', fontWeight: 700, color, fontVariantNumeric: 'tabular-nums', marginTop: '2px' }}>
              {value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div style={{ fontSize: '10px', color: theme.textMuted, marginTop: '1px' }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* Lines table */}
      <div style={{ background: theme.bgSurface, border: `1px solid ${theme.border}`, borderRadius: '10px', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: theme.bgSurface }}>
                {['#', 'Phase / Group', 'Description *', 'Qty', 'Unit', 'Est. Cost/Unit', 'Bid Price/Unit', 'Notes', ...(isEditable ? [''] : [])].map(h => (
                  <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${theme.border}`, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const prevPhase = i > 0 ? rows[i - 1]!.phaseLabel.trim() : null
                const thisPhase = row.phaseLabel.trim()
                const isNewPhaseGroup = !isEditable && thisPhase && thisPhase !== prevPhase
                return (
                  <React.Fragment key={i}>
                    {isNewPhaseGroup && (
                      <tr style={{ background: `${theme.accent}18` }}>
                        <td colSpan={8} style={{ padding: '5px 10px', fontSize: '11px', fontWeight: 700, color: theme.accent, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          {thisPhase}
                        </td>
                      </tr>
                    )}
                    <tr style={{ borderBottom: `1px solid ${theme.border}22` }}>
                      <td style={{ padding: '6px 10px', color: theme.textMuted, fontVariantNumeric: 'tabular-nums', width: '32px' }}>{i + 1}</td>
                      <td style={{ padding: '4px 6px', width: '120px' }}>
                        {isEditable
                          ? <input style={cellStyle} value={row.phaseLabel} onChange={e => update(i, 'phaseLabel', e.target.value)} placeholder="e.g. Light Gauge" />
                          : <span style={{ fontSize: '11px', color: theme.accent, fontWeight: 500 }}>{row.phaseLabel || ''}</span>}
                      </td>
                      <td style={{ padding: '4px 6px', minWidth: '200px' }}>
                        {isEditable
                          ? <input style={cellStyle} value={row.description} onChange={e => update(i, 'description', e.target.value)} placeholder="Describe item or deliverable…" />
                          : <span style={{ color: theme.textPrimary }}>{row.description}</span>}
                      </td>
                      <td style={{ padding: '4px 6px', width: '80px' }}>
                        {isEditable
                          ? <input style={cellStyle} type="number" min="0" step="any" value={row.quantity} onChange={e => update(i, 'quantity', e.target.value)} placeholder="0" />
                          : <span style={{ color: theme.textMuted, fontVariantNumeric: 'tabular-nums' }}>{row.quantity || '—'}</span>}
                      </td>
                      <td style={{ padding: '4px 6px', width: '80px' }}>
                        {isEditable
                          ? <input style={cellStyle} value={row.unit} onChange={e => update(i, 'unit', e.target.value)} placeholder="pcs" />
                          : <span style={{ color: theme.textMuted }}>{row.unit || '—'}</span>}
                      </td>
                      <td style={{ padding: '4px 6px', width: '120px' }}>
                        {isEditable
                          ? <input style={cellStyle} type="number" min="0" step="any" value={row.estimatedUnitCost} onChange={e => update(i, 'estimatedUnitCost', e.target.value)} placeholder="0.00" />
                          : <span style={{ color: theme.textMuted, fontVariantNumeric: 'tabular-nums' }}>{row.estimatedUnitCost || '—'}</span>}
                      </td>
                      <td style={{ padding: '4px 6px', width: '120px' }}>
                        {isEditable
                          ? <input style={cellStyle} type="number" min="0" step="any" value={row.bidUnitPrice} onChange={e => update(i, 'bidUnitPrice', e.target.value)} placeholder="0.00" />
                          : <span style={{ color: theme.textPrimary, fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>{row.bidUnitPrice || '—'}</span>}
                      </td>
                      <td style={{ padding: '4px 6px', minWidth: '140px' }}>
                        {isEditable
                          ? <input style={cellStyle} value={row.notes} onChange={e => update(i, 'notes', e.target.value)} placeholder="Optional notes…" />
                          : <span style={{ color: theme.textMuted }}>{row.notes || '—'}</span>}
                      </td>
                      {isEditable && (
                        <td style={{ padding: '4px 8px', width: '32px' }}>
                          <button
                            onClick={() => removeRow(i)}
                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '16px', lineHeight: 1, padding: '2px 4px' }}
                            title="Remove line"
                          >×</button>
                        </td>
                      )}
                    </tr>
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {isEditable && (
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={addRow}
            style={{ padding: '6px 14px', borderRadius: '7px', border: `1px dashed ${theme.border}`, background: 'transparent', color: theme.textMuted, cursor: 'pointer', fontSize: '13px' }}
          >
            + Add Line
          </button>
          <button
            disabled={!dirty || saving}
            onClick={handleSave}
            style={{ padding: '6px 16px', borderRadius: '7px', border: 'none', background: dirty ? theme.accent : theme.border, color: '#fff', cursor: dirty && !saving ? 'pointer' : 'not-allowed', fontSize: '13px', fontWeight: 500 }}
          >
            {saving ? 'Saving…' : 'Save Scope'}
          </button>
        </div>
      )}

      {/* Phase breakdown — only shown when at least one line has a phase label */}
      {(() => {
        const phaseMap = new Map<string, { scopeCost: number; bidTotal: number; count: number }>()
        for (const r of rows) {
          const label = r.phaseLabel.trim() || '(Unassigned)'
          const qty = parseFloat(r.quantity || '0') || 0
          const cost = parseFloat(r.estimatedUnitCost || '0') || 0
          const bid = parseFloat(r.bidUnitPrice || '0') || 0
          const existing = phaseMap.get(label) ?? { scopeCost: 0, bidTotal: 0, count: 0 }
          phaseMap.set(label, { scopeCost: existing.scopeCost + qty * cost, bidTotal: existing.bidTotal + qty * bid, count: existing.count + 1 })
        }
        const hasPhases = [...phaseMap.keys()].some(k => k !== '(Unassigned)')
        if (!hasPhases) return null
        const phases = [...phaseMap.entries()]
        return (
          <div style={{ background: theme.bgSurface, border: `1px solid ${theme.border}`, borderRadius: '10px', overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', fontSize: '10px', fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: `1px solid ${theme.border}` }}>
              Phase Breakdown {isEditable ? '' : '— stages auto-created on approval'}
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr>
                  {['Phase / Group', 'Lines', 'Scope Cost', 'Bid Total'].map(h => (
                    <th key={h} style={{ padding: '7px 14px', textAlign: h === 'Phase / Group' ? 'left' : 'right', fontSize: '10px', fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${theme.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {phases.map(([label, { scopeCost, bidTotal, count }]) => (
                  <tr key={label} style={{ borderBottom: `1px solid ${theme.border}22` }}>
                    <td style={{ padding: '7px 14px', fontWeight: label === '(Unassigned)' ? 400 : 600, color: label === '(Unassigned)' ? theme.textMuted : theme.textPrimary }}>{label}</td>
                    <td style={{ padding: '7px 14px', textAlign: 'right', color: theme.textMuted }}>{count}</td>
                    <td style={{ padding: '7px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#f59e0b' }}>{scopeCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td style={{ padding: '7px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: theme.accent, fontWeight: 600 }}>{bidTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      })()}
    </div>
  )
}

// ── Attachments Tab ───────────────────────────────────────────────────────────

interface FileAttachment {
  id: string
  file_id: string
  original_filename: string
  mime_type: string
  size_bytes: number
  label: string
  created_at: string
  download_url: string | null
}

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

function FileTypeIcon({ mime }: { mime: string }) {
  const isExcel = mime.includes('spreadsheet') || mime.includes('excel')
  const isPdf   = mime === 'application/pdf'
  const isWord  = mime.includes('word')
  const isImage = mime.startsWith('image/')
  const color   = isExcel ? '#16a34a' : isPdf ? '#ef4444' : isWord ? '#2563eb' : isImage ? '#8b5cf6' : '#6b7280'
  return (
    <span style={{ fontSize: '18px', lineHeight: 1, color }}>
      {isExcel ? '📊' : isPdf ? '📄' : isWord ? '📝' : isImage ? '🖼' : '📎'}
    </span>
  )
}

function AttachmentsTab({ projectId, theme }: { projectId: string; theme: ReturnType<typeof useTheme>['theme'] }) {
  const addToast      = useToastStore((s) => s.addToast)
  const fileRef       = React.useRef<HTMLInputElement>(null)
  const [files, setFiles] = React.useState<FileAttachment[]>([])
  const [loading, setLoading]     = React.useState(true)
  const [uploading, setUploading] = React.useState(false)
  const [progress, setProgress]   = React.useState(0)
  const [dragOver, setDragOver]   = React.useState(false)

  const ACCEPT = '.xlsx,.xls,.pdf,.doc,.docx,.jpg,.jpeg,.png,.webp'

  React.useEffect(() => {
    setLoading(true)
    api.get<FileAttachment[]>('/files/attachments', { params: { entityType: 'project', entityId: projectId } })
      .then(r => setFiles(r.data as unknown as FileAttachment[]))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [projectId])

  async function upload(file: File) {
    if (file.size > 52_428_800) { addToast({ type: 'error', message: 'File too large (max 50 MB)' }); return }
    setUploading(true); setProgress(10)
    try {
      const { data: urlRes } = await api.post<{ uploadUrl: string; fileId: string }>(
        '/files/upload-url',
        { filename: file.name, mimeType: file.type, sizeBytes: file.size, category: 'attachment' },
      )
      const { fileId } = urlRes as unknown as { uploadUrl: string; fileId: string }
      setProgress(30)
      const buf = await file.arrayBuffer()
      await api.post(`/files/${fileId}/content`, buf, { headers: { 'Content-Type': file.type }, timeout: 120_000 })
      setProgress(75)
      await api.post('/files/attach', { fileId, entityType: 'project', entityId: projectId, label: file.name })
      setProgress(95)
      const r = await api.get<FileAttachment[]>('/files/attachments', { params: { entityType: 'project', entityId: projectId } })
      setFiles(r.data as unknown as FileAttachment[])
      addToast({ type: 'success', message: `"${file.name}" attached` })
    } catch {
      addToast({ type: 'error', message: 'Upload failed — please try again' })
    } finally {
      setUploading(false); setProgress(0)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function download(f: FileAttachment) {
    try {
      const { data: res } = await api.get<{ downloadUrl: string }>(`/files/${f.file_id}/download-url`)
      const url = (res as unknown as { downloadUrl: string }).downloadUrl
      const a = document.createElement('a'); a.href = url; a.download = f.original_filename; a.click()
    } catch { addToast({ type: 'error', message: 'Download failed' }) }
  }

  async function remove(attachment: FileAttachment) {
    try {
      await api.delete(`/files/attachments/${attachment.id}`)
      setFiles(prev => prev.filter(f => f.id !== attachment.id))
      addToast({ type: 'success', message: 'Attachment removed' })
    } catch { addToast({ type: 'error', message: 'Failed to remove attachment' }) }
  }

  const rowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: '12px',
    padding: '10px 14px', background: theme.bgSurface,
    border: `1px solid ${theme.border}`, borderRadius: '8px',
  }
  const btnStyle: React.CSSProperties = {
    background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px',
    borderRadius: '5px', color: theme.textMuted, display: 'flex', alignItems: 'center',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {loading ? (
        <div style={{ textAlign: 'center', padding: '32px', color: theme.textMuted }}>Loading…</div>
      ) : files.length === 0 ? (
        <div style={{ padding: '16px', color: theme.textMuted, fontSize: '13px' }}>No attachments yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {files.map(f => (
            <div key={f.id} style={rowStyle}>
              <FileTypeIcon mime={f.mime_type} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: 500, color: theme.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {f.label || f.original_filename}
                </div>
                <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '1px' }}>
                  {formatBytes(f.size_bytes)} · {new Date(f.created_at).toLocaleDateString()}
                </div>
              </div>
              <button style={btnStyle} title="Download" onClick={() => void download(f)}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
              </button>
              <button style={{ ...btnStyle, color: '#ef4444' }} title="Remove" onClick={() => void remove(f)}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT}
        style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f) }}
      />

      <div
        style={{
          border: `2px dashed ${dragOver ? theme.accent : theme.border}`,
          borderRadius: '10px', padding: '24px 16px',
          textAlign: 'center', cursor: uploading ? 'not-allowed' : 'pointer',
          background: dragOver ? `${theme.accent}12` : 'transparent',
          transition: 'border-color 0.15s, background 0.15s',
        }}
        onClick={() => !uploading && fileRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) void upload(f) }}
      >
        {uploading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '180px', height: '4px', background: theme.border, borderRadius: '999px', overflow: 'hidden' }}>
              <div style={{ height: '100%', background: theme.accent, width: `${progress}%`, transition: 'width 0.3s' }} />
            </div>
            <p style={{ fontSize: '12px', color: theme.textMuted, margin: 0 }}>Uploading… {progress}%</p>
          </div>
        ) : (
          <>
            <p style={{ fontSize: '13px', color: theme.textSecondary, margin: '0 0 4px' }}>
              Drop file here or <span style={{ color: theme.accent }}>browse</span>
            </p>
            <p style={{ fontSize: '11px', color: theme.textMuted, margin: 0 }}>
              Excel, PDF, Word, images · Max 50 MB
            </p>
          </>
        )}
      </div>
    </div>
  )
}
