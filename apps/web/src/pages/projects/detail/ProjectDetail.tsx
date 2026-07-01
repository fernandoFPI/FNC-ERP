import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@apollo/client'
import { PROJECT_QUERY, ADMIN_SET_PROJECT_STATUS } from '../../../graphql/projects'
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
  { key: 'overview', label: 'Overview' }, { key: 'stages', label: 'Stages' },
  { key: 'team', label: 'Team' }, { key: 'costs', label: 'Costs' },
  { key: 'pos', label: 'Purchase Orders' },
  { key: 'mfg_requests', label: 'Manufacturing Requests' },
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
  const TABS      = isAdmin ? ALL_TABS : ALL_TABS.filter((t) => t.key !== 'costs')
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
  interface LiveMember { id: string; employee_id: string; employee_name: string; job_title?: string; role?: string; allocated_hours?: number }
  interface Employee { id: string; first_name: string; last_name: string; job_title?: string }
  const [liveTeam, setLiveTeam]       = useState<LiveMember[]>([])
  const [teamLoading, setTeamLoading] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [employees, setEmployees]     = useState<Employee[]>([])
  const [addForm, setAddForm]         = useState({ employee_id: '', allocated_hours: '' })
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
        allocated_hours: addForm.allocated_hours ? parseFloat(addForm.allocated_hours) : null,
      })
      // Reload full list so we get employee_name joined from DB
      const refreshed = await api.get<LiveMember[]>(`/projects/${id}/members`)
      setLiveTeam(Array.isArray(refreshed.data) ? refreshed.data : [res.data])
      setAddForm({ employee_id: '', allocated_hours: '' })
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
  const p = data?.project

  if (loading && !p) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: theme.textMuted }}>Loading project…</div>
  if (!p) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '12px', color: theme.textMuted }}>
      <span style={{ fontSize: '40px' }}>📁</span>
      <span>Project not found</span>
      <Button variant="secondary" size="sm" onClick={() => navigate('/projects')}>Back to Projects</Button>
    </div>
  )

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

        {tab === 'team' && (
          <div>
            {/* Header row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <span style={{ fontSize: '13px', color: theme.textMuted }}>{liveTeam.length} member{liveTeam.length !== 1 ? 's' : ''}</span>
              {isAdmin && (
                <Button variant="primary" size="sm" onClick={() => setShowAddForm(true)}>Add Member</Button>
              )}
            </div>

            {/* Add Member Modal */}
            <Modal open={showAddForm} onClose={() => { setShowAddForm(false); setAddForm({ employee_id: '', allocated_hours: '' }) }} title="Add Team Member" size="sm">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
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
                  <Button variant="ghost" onClick={() => { setShowAddForm(false); setAddForm({ employee_id: '', allocated_hours: '' }) }}>Cancel</Button>
                  <Button variant="primary" loading={addLoading} onClick={handleAddMember}>Add Member</Button>
                </div>
              </div>
            </Modal>

            {/* Team table */}
            {teamLoading && <div style={{ color: theme.textMuted, fontSize: '13px' }}>Loading…</div>}
            {!teamLoading && liveTeam.length === 0 && (
              <div style={{ color: theme.textMuted, fontSize: '13px', padding: '24px 0', textAlign: 'center' }}>No team members yet.</div>
            )}
            {!teamLoading && liveTeam.length > 0 && (
              isPhone ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {liveTeam.map(m => (
                    <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', background: theme.bgSurface, border: `1px solid ${theme.border}`, borderRadius: '8px', padding: '10px 12px' }}>
                      <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: theme.accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, color: theme.accent, flexShrink: 0 }}>
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
                </div>
              ) : (
                <div style={{ background: theme.bgSurface, border: `1px solid ${theme.border}`, borderRadius: '10px', overflow: 'hidden' }}>
                  {/* Table header */}
                  <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr 1fr 80px 40px', gap: '0', padding: '8px 16px', borderBottom: `1px solid ${theme.border}`, background: theme.bgCanvas }}>
                    <div />
                    <div style={{ fontSize: '11px', fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Name</div>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Job Title</div>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>Hours</div>
                    <div />
                  </div>
                  {/* Table rows */}
                  {liveTeam.map((m, i) => (
                    <div key={m.id} style={{ display: 'grid', gridTemplateColumns: confirmRemoveId === m.id ? '40px 1fr 1fr 80px 160px' : '40px 1fr 1fr 80px 40px', alignItems: 'center', padding: '10px 16px', borderBottom: i < liveTeam.length - 1 ? `1px solid ${theme.border}` : 'none' }}>
                      <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: theme.accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: theme.accent }}>
                        {(m.employee_name ?? '?')[0].toUpperCase()}
                      </div>
                      <div style={{ fontSize: '13px', fontWeight: 500, color: theme.textPrimary }}>{m.employee_name}</div>
                      <div style={{ fontSize: '13px', color: theme.textMuted }}>{m.job_title ?? '—'}</div>
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
                  ))}
                </div>
              )
            )}

          </div>
        )}

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
