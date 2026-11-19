import { useTranslation } from 'react-i18next'
import { useState, useEffect } from 'react'
import { useMutation } from '@apollo/client'
import { useTheme } from '../../theme/ThemeContext'
import { UPDATE_PROJECT_STAGE } from '../../graphql/projects'
import { api } from '../../lib/axios'
import { useToastStore } from '../../store/toastStore'
import { SearchableSelect } from '../ui/SearchableSelect'
import { Drawer } from '../ui/Drawer'
import { Input } from '../ui/Input'
import { Textarea } from '../ui/Textarea'
import { ActionButton } from '../ui/ActionButton'

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
  const { t } = useTranslation()
  const { theme } = useTheme()
  const isCreate = !stage
  const [form, setForm] = useState<Partial<Stage & { assignedTo: string }>>({})
  const [saving, setSaving] = useState(false)
  const [updateStage] = useMutation(UPDATE_PROJECT_STAGE)
  const addToast = useToastStore((s) => s.addToast)

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
    } catch (err) {
      // The shared axios client shows nothing on an error and a failed mutation only rejects, so without this a refused
      // save looked like a dead button (and threw out of the click handler).
      // A REST refusal carries the server's sentence; a GraphQL one is the error's own message (an axios error's
      // message is just the status code, so it is never shown).
      const e = err as { response?: { data?: { error?: { message?: string } } }; message?: string }
      addToast({
        type: 'error',
        message:
          e.response?.data?.error?.message ??
          (e.response ? undefined : e.message) ??
          t('proj.stageEdit.couldNotSave'),
      })
    } finally {
      setSaving(false)
    }
  }

  const inp = (key: string, label: string, type = 'text') => (
    <Input
      field
      label={label}
      type={type}
      value={String((form as Record<string, unknown>)[key] ?? '')}
      onChange={(e) => {
        set(key, e.target.value)
      }}
    />
  )

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={isCreate ? t('proj.stageEdit.addStage') : t('proj.stageEdit.editStage')}
      width="420px"
      footer={
        <>
          <ActionButton variant="outline" onClick={onClose}>
            {t('proj.stageEdit.cancel')}
          </ActionButton>
          <ActionButton
            variant="solid"
            loading={saving}
            onClick={() => {
              void handleSave()
            }}
          >
            {saving ? t('proj.stageEdit.saving') : t('proj.stageEdit.saveStage')}
          </ActionButton>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {inp('name', t('proj.stageEdit.stageName'))}

        {/* Responsible team member */}
        {isAdmin ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <SearchableSelect
              field
              label={t('proj.stageEdit.responsibleMember')}
              value={form.assignedTo ?? ''}
              onChange={(v) => {
                set('assignedTo', v)
              }}
              placeholder={t('proj.stageEdit.unassigned')}
              options={teamMembers.map((m) => ({
                value: m.employeeId,
                label: `${m.name}${m.role ? ` (${m.role})` : ''}`,
              }))}
            />
            {teamMembers.length === 0 && (
              <span style={{ fontSize: '12px', color: theme.textSecondary }}>
                {t('proj.stageEdit.addTeamMembersOnTheTeam')}
              </span>
            )}
          </div>
        ) : (
          <Input
            field
            readOnly
            label={t('proj.stageEdit.responsibleMember')}
            value={stage?.assignedToName ?? t('proj.stageEdit.unassigned')}
          />
        )}

        {!isCreate && (
          <>
            <SearchableSelect
              field
              label={t('proj.stageEdit.status')}
              value={form.status ?? 'pending'}
              onChange={handleStatusChange}
              options={STAGE_STATUSES.map((s) => ({ value: s, label: s.replace('_', ' ') }))}
            />

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label
                htmlFor="stage-completion"
                style={{ fontSize: '12px', fontWeight: 500, color: theme.textSecondary }}
              >
                {t('proj.stageEdit.completion')}{' '}
                <span style={{ color: theme.accentSolid, fontWeight: 600 }}>
                  {form.completionPct ?? 0}%
                </span>
              </label>
              <input
                id="stage-completion"
                type="range"
                min={0}
                max={100}
                step={5}
                value={form.completionPct ?? 0}
                onChange={(e) => {
                  set('completionPct', parseInt(e.target.value))
                }}
                style={{ width: '100%', accentColor: theme.accentSolid }}
              />
            </div>
          </>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: '12px',
          }}
        >
          {inp('plannedStartDate', t('proj.stageEdit.plannedStart'), 'date')}
          {inp('plannedEndDate', t('proj.stageEdit.plannedEnd'), 'date')}
          {!isCreate && inp('actualStartDate', t('proj.stageEdit.actualStart'), 'date')}
          {!isCreate && inp('actualEndDate', t('proj.stageEdit.actualEnd'), 'date')}
        </div>

        <Textarea
          field
          rows={3}
          label={t('proj.stageEdit.notes')}
          value={form.notes ?? ''}
          onChange={(e) => {
            set('notes', e.target.value)
          }}
        />
      </div>
    </Drawer>
  )
}
