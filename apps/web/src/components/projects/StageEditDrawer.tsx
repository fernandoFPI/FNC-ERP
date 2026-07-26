import { useState, useEffect } from 'react'
import { useMutation } from '@apollo/client'
import { useTheme } from '../../theme/ThemeContext'
import { UPDATE_PROJECT_STAGE } from '../../graphql/projects'
import { api } from '../../lib/axios'
import { SearchableSelect } from '../ui/SearchableSelect'

interface Stage {
  id: string
  name: string
  sequence: number
  status: string
  completionPct: number
  plannedStartDate?: string
  plannedEndDate?: string
  actualStartDate?: string
  actualEndDate?: string
  notes?: string
  assignedTo?: string
  assignedToName?: string
}

interface TeamMember {
  id: string
  employeeId: string
  name: string
  role?: string
}

interface Props {
  projectId: string
  stage: Stage | null
  open: boolean
  onClose: () => void
  onSaved?: () => void
  teamMembers?: TeamMember[]
  isAdmin?: boolean
}

const STAGE_STATUSES = ['pending', 'active', 'completed', 'cancelled']

export function StageEditDrawer({
  projectId,
  stage,
  open,
  onClose,
  onSaved,
  teamMembers = [],
  isAdmin = false,
}: Props) {
  const { theme } = useTheme()
  const isCreate = !stage
  const [form, setForm] = useState<Partial<Stage & { assignedTo: string }>>({})
  const [saving, setSaving] = useState(false)
  const [updateStage] = useMutation(UPDATE_PROJECT_STAGE)

  useEffect(() => {
    if (stage) setForm({ ...stage, assignedTo: stage.assignedTo ?? '' })
    else setForm({ status: 'pending', completionPct: 0, assignedTo: '' })
  }, [stage, open])

  if (!open) return null

  const set = (key: string, value: unknown) => {
    setForm((f) => ({ ...f, [key]: value }))
  }

  const handleStatusChange = (s: string) => {
    const upd: Partial<Stage> = { status: s }
    if (s === 'active' && !form.actualStartDate)
      upd.actualStartDate = new Date().toISOString().slice(0, 10)
    if (s === 'completed' && !form.actualEndDate) {
      upd.actualEndDate = new Date().toISOString().slice(0, 10)
      upd.completionPct = 100
    }
    setForm((f) => ({ ...f, ...upd }))
  }

  const handleSave = async () => {
    if (!form.name?.trim()) return
    setSaving(true)
    try {
      if (isCreate) {
        await api.post(`/projects/${projectId}/stages`, {
          name: form.name,
          planned_start_date: form.plannedStartDate || null,
          planned_end_date: form.plannedEndDate || null,
          notes: form.notes || null,
          assigned_to: form.assignedTo || null,
        })
      } else {
        await updateStage({
          variables: {
            projectId,
            stageId: stage.id,
            input: {
              name: form.name,
              status: form.status,
              completionPct: form.completionPct,
              plannedStartDate: form.plannedStartDate || null,
              plannedEndDate: form.plannedEndDate || null,
              actualStartDate: form.actualStartDate || null,
              actualEndDate: form.actualEndDate || null,
              notes: form.notes || null,
              assignedTo: form.assignedTo || null,
            },
          },
        })
      }
      onSaved?.()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const inp = (key: string, label: string, type = 'text') => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <label
        style={{
          fontSize: '11px',
          fontWeight: 600,
          color: theme.textMuted,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        {label}
      </label>
      <input
        type={type}
        style={{
          padding: '8px 10px',
          borderRadius: '7px',
          border: `1px solid ${theme.borderInput}`,
          background: theme.bgCanvas,
          color: theme.textPrimary,
          fontSize: '13px',
        }}
        value={String((form as Record<string, unknown>)[key] ?? '')}
        onChange={(e) => {
          set(key, e.target.value)
        }}
      />
    </div>
  )

  return (
    <>
      <div
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 40 }}
        onClick={onClose}
      />
      <div
        style={{
          position: 'fixed',
          right: 0,
          top: 0,
          height: '100%',
          width: '100%',
          maxWidth: '420px',
          background: theme.bgSurface,
          boxShadow: '-4px 0 24px rgba(0,0,0,0.15)',
          zIndex: 50,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: `1px solid ${theme.border}`,
          }}
        >
          <span style={{ fontWeight: 600, color: theme.textPrimary, fontSize: '15px' }}>
            {isCreate ? 'Add Stage' : 'Edit Stage'}
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '20px',
              color: theme.textMuted,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          {inp('name', 'Stage Name')}

          {/* Responsible team member */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label
              style={{
                fontSize: '11px',
                fontWeight: 600,
                color: theme.textMuted,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Responsible Member
            </label>
            {isAdmin ? (
              <>
                <SearchableSelect
                  value={form.assignedTo ?? ''}
                  onChange={(v) => {
                    set('assignedTo', v)
                  }}
                  placeholder="— Unassigned —"
                  options={teamMembers.map((m) => ({
                    value: m.employeeId,
                    label: `${m.name}${m.role ? ` (${m.role})` : ''}`,
                  }))}
                />
                {teamMembers.length === 0 && (
                  <span style={{ fontSize: '11px', color: theme.textMuted }}>
                    Add team members on the Team tab first.
                  </span>
                )}
              </>
            ) : (
              <div
                style={{
                  padding: '8px 10px',
                  borderRadius: '7px',
                  border: `1px solid ${theme.border}`,
                  background: theme.bgCanvas,
                  color: stage?.assignedToName ? theme.textPrimary : theme.textMuted,
                  fontSize: '13px',
                }}
              >
                {stage?.assignedToName ?? '— Unassigned —'}
              </div>
            )}
          </div>

          {!isCreate && (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <SearchableSelect
                  label="Status"
                  value={form.status ?? 'pending'}
                  onChange={handleStatusChange}
                  options={STAGE_STATUSES.map((s) => ({ value: s, label: s.replace('_', ' ') }))}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    color: theme.textMuted,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  Completion:{' '}
                  <span style={{ color: theme.accent }}>{form.completionPct ?? 0}%</span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={form.completionPct ?? 0}
                  onChange={(e) => {
                    set('completionPct', parseInt(e.target.value))
                  }}
                  style={{ width: '100%', accentColor: theme.accent }}
                />
              </div>
            </>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            {inp('plannedStartDate', 'Planned Start', 'date')}
            {inp('plannedEndDate', 'Planned End', 'date')}
            {!isCreate && inp('actualStartDate', 'Actual Start', 'date')}
            {!isCreate && inp('actualEndDate', 'Actual End', 'date')}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label
              style={{
                fontSize: '11px',
                fontWeight: 600,
                color: theme.textMuted,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Notes
            </label>
            <textarea
              rows={3}
              value={form.notes ?? ''}
              onChange={(e) => {
                set('notes', e.target.value)
              }}
              style={{
                padding: '8px 10px',
                borderRadius: '7px',
                border: `1px solid ${theme.borderInput}`,
                background: theme.bgCanvas,
                color: theme.textPrimary,
                fontSize: '13px',
                resize: 'none',
              }}
            />
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '8px',
            padding: '14px 20px',
            borderTop: `1px solid ${theme.border}`,
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              borderRadius: '7px',
              border: `1px solid ${theme.border}`,
              background: 'transparent',
              color: theme.textMuted,
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: '8px 16px',
              borderRadius: '7px',
              background: saving ? theme.border : theme.accent,
              color: '#fff',
              border: 'none',
              cursor: saving ? 'not-allowed' : 'pointer',
              fontSize: '13px',
              fontWeight: 500,
            }}
          >
            {saving ? 'Saving…' : 'Save Stage'}
          </button>
        </div>
      </div>
    </>
  )
}
