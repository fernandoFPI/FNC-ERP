import React, { useState } from 'react'
import { useMutation } from '@apollo/client'
import { useTheme } from '../../theme/ThemeContext'
import type { ThemeTokens } from '../../theme/tokens'
import {
  START_PROJECT, HOLD_PROJECT, RESUME_PROJECT, SUBMIT_PROJECT,
  APPROVE_PROJECT, REJECT_BACK_PROJECT, COMPLETE_PROJECT,
  CANCEL_PROJECT, CANCEL_PROJECT_AFTER_APPROVAL, UPDATE_PROJECT,
  SUBMIT_TO_TEAM, APPROVE_RFQ, REJECT_RFQ,
} from '../../graphql/projects'

type ProjectStatus = 'pending' | 'ongoing' | 'submitted' | 'approved' | 'completed' | 'on_hold' | 'cancelled' | 'cancelled_after_approval'

interface ProjectTimeline {
  siteVisitDate?: string | null
  siteVisitTime?: string | null
  questionDate?: string | null
  questionTime?: string | null
  submissionDate?: string | null
  submissionTime?: string | null
}

interface Props {
  projectId: string
  status: ProjectStatus
  allowedActions: string[]
  onTransitioned?: () => void
  timeline?: ProjectTimeline
}

const ACTION_LABEL: Record<string, string> = {
  start:                 'Start Project',
  submit_to_team:        'Submit to Team',
  hold:                  'Put On Hold',
  resume:                'Resume',
  submit:                'Submit for Review',
  approve:               'Approve',
  approve_rfq:           'Approve RFQ',
  reject_back:           'Send Back for Rework',
  reject_rfq:            'Send Back for Revision',
  complete:              'Mark Complete',
  cancel:                'Cancel',
  cancel_after_approval: 'Cancel Project',
}

function resolveActionLabel(action: string, _status: ProjectStatus): string {
  return ACTION_LABEL[action] ?? action
}

const REASON_REQUIRED = new Set(['hold', 'reject_back', 'reject_rfq', 'cancel', 'cancel_after_approval'])
const TIMELINE_ACTIONS = new Set(['start', 'submit'])

const inputStyle = (theme: ThemeTokens): React.CSSProperties => ({
  width: '100%', padding: '6px 10px', borderRadius: '6px',
  border: `1px solid ${theme.borderInput}`, background: theme.bgCanvas,
  color: theme.textPrimary, fontSize: '13px', boxSizing: 'border-box' as const,
})
const labelStyle = (theme: ThemeTokens): React.CSSProperties => ({
  fontSize: '11px', color: theme.textMuted, display: 'block', marginBottom: '4px', fontWeight: 500,
})

export function ProjectStatusBar({ projectId, status, allowedActions, onTransitioned, timeline }: Props) {
  const { theme } = useTheme()
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [reason, setReason]               = useState('')
  const [saving, setSaving]               = useState(false)
  const [timelineForm, setTimelineForm]   = useState({
    siteVisitDate: '', siteVisitTime: '',
    questionDate:  '', questionTime:  '',
    submissionDate: '', submissionTime: '',
  })

  const [startProject]               = useMutation(START_PROJECT)
  const [submitToTeam]               = useMutation(SUBMIT_TO_TEAM)
  const [holdProject]                = useMutation(HOLD_PROJECT)
  const [resumeProject]              = useMutation(RESUME_PROJECT)
  const [submitProject]              = useMutation(SUBMIT_PROJECT)
  const [approveProject]             = useMutation(APPROVE_PROJECT)
  const [approveRFQ]                 = useMutation(APPROVE_RFQ)
  const [rejectBackProject]          = useMutation(REJECT_BACK_PROJECT)
  const [rejectRFQ]                  = useMutation(REJECT_RFQ)
  const [completeProject]            = useMutation(COMPLETE_PROJECT)
  const [cancelProject]              = useMutation(CANCEL_PROJECT)
  const [cancelProjectAfterApproval] = useMutation(CANCEL_PROJECT_AFTER_APPROVAL)
  const [updateProject]              = useMutation(UPDATE_PROJECT)

  const mutationFor = (action: string) => ({
    start:                 startProject,
    submit_to_team:        submitToTeam,
    hold:                  holdProject,
    resume:                resumeProject,
    submit:                submitProject,
    approve:               approveProject,
    approve_rfq:           approveRFQ,
    reject_back:           rejectBackProject,
    reject_rfq:            rejectRFQ,
    complete:              completeProject,
    cancel:                cancelProject,
    cancel_after_approval: cancelProjectAfterApproval,
  }[action] ?? null)

  const sliceTime = (t?: string | null) => t ? String(t).slice(0, 5) : ''

  const handleAction = (action: string) => {
    if (REASON_REQUIRED.has(action)) {
      setPendingAction(action); setReason(''); return
    }
    if (action === 'start' || action === 'submit_to_team') {
      setPendingAction(action)
      setTimelineForm({
        siteVisitDate:  timeline?.siteVisitDate  ?? '',
        siteVisitTime:  sliceTime(timeline?.siteVisitTime),
        questionDate:   timeline?.questionDate   ?? '',
        questionTime:   sliceTime(timeline?.questionTime),
        submissionDate: '', submissionTime: '',
      })
      return
    }
    if (action === 'submit') {
      setPendingAction('submit')
      setTimelineForm({
        siteVisitDate: '', siteVisitTime: '',
        questionDate:  '', questionTime:  '',
        submissionDate: timeline?.submissionDate ?? '',
        submissionTime: sliceTime(timeline?.submissionTime),
      })
      return
    }
    void executeAction(action)
  }

  const executeAction = async (action: string, reasonArg?: string) => {
    const mut = mutationFor(action)
    if (!mut) return
    const variables: Record<string, unknown> = { id: projectId }
    if (REASON_REQUIRED.has(action)) variables['reason'] = reasonArg ?? reason
    await mut({ variables })
    setPendingAction(null); setReason('')
    onTransitioned?.()
  }

  const handleTimelineConfirm = async (skip = false) => {
    setSaving(true)
    try {
      if (!skip) {
        const input: Record<string, unknown> = {}
        if (pendingAction === 'start' || pendingAction === 'submit_to_team') {
          if (timelineForm.siteVisitDate) input['siteVisitDate'] = timelineForm.siteVisitDate
          if (timelineForm.siteVisitTime) input['siteVisitTime'] = timelineForm.siteVisitTime
          if (timelineForm.questionDate)  input['questionDate']  = timelineForm.questionDate
          if (timelineForm.questionTime)  input['questionTime']  = timelineForm.questionTime
        } else if (pendingAction === 'submit') {
          if (timelineForm.submissionDate) input['submissionDate'] = timelineForm.submissionDate
          if (timelineForm.submissionTime) input['submissionTime'] = timelineForm.submissionTime
        }
        if (Object.keys(input).length > 0) {
          await updateProject({ variables: { id: projectId, input } })
        }
      }
      const mut = mutationFor(pendingAction!)
      if (mut) await mut({ variables: { id: projectId } })
      setPendingAction(null)
      onTransitioned?.()
    } finally {
      setSaving(false)
    }
  }

  const isSideState  = ['on_hold', 'cancelled', 'cancelled_after_approval'].includes(status)

  const sideStateLabel: Record<string, string> = {
    on_hold: 'On Hold', cancelled: 'Cancelled', cancelled_after_approval: 'Cancelled After Approval',
  }
  const sideStateColor: Record<string, string> = {
    on_hold: '#f59e0b', cancelled: '#ef4444', cancelled_after_approval: '#b91c1c',
  }

  const tf = timelineForm
  const setTF = (k: keyof typeof timelineForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setTimelineForm(f => ({ ...f, [k]: e.target.value }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Side-state badge */}
      {isSideState && (
        <div style={{ display: 'inline-flex', alignItems: 'center', padding: '4px 12px', borderRadius: '999px', background: sideStateColor[status], color: '#fff', fontSize: '12px', fontWeight: 600, alignSelf: 'flex-start' }}>
          {sideStateLabel[status] ?? status}
        </div>
      )}

      {/* Reason input */}
      {pendingAction && REASON_REQUIRED.has(pendingAction) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: theme.accentBg, border: `1px solid ${theme.accentBorder}`, borderRadius: '8px', padding: '10px 12px' }}>
          <input
            style={{ flex: 1, padding: '6px 10px', borderRadius: '6px', border: `1px solid ${theme.borderInput}`, background: theme.bgCanvas, color: theme.textPrimary, fontSize: '13px' }}
            placeholder={`Reason for "${resolveActionLabel(pendingAction, status)}"…`}
            value={reason}
            onChange={e => setReason(e.target.value)}
            autoFocus
          />
          <button
            disabled={!reason.trim()}
            onClick={() => void executeAction(pendingAction)}
            style={{ padding: '6px 14px', borderRadius: '6px', background: reason.trim() ? theme.accent : theme.border, color: '#fff', border: 'none', cursor: reason.trim() ? 'pointer' : 'not-allowed', fontSize: '13px', fontWeight: 500 }}
          >
            Confirm
          </button>
          <button
            onClick={() => setPendingAction(null)}
            style={{ padding: '6px 12px', borderRadius: '6px', background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textMuted, cursor: 'pointer', fontSize: '13px' }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Timeline modal — Submit to Team / Start */}
      {(pendingAction === 'start' || pendingAction === 'submit_to_team') && (
        <div style={{ background: theme.accentBg, border: `1px solid ${theme.accentBorder}`, borderRadius: '10px', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary }}>
            Before starting — confirm the tender schedule
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={labelStyle(theme)}>Site Visit Date</label>
              <input type="date" style={inputStyle(theme)} value={tf.siteVisitDate} onChange={setTF('siteVisitDate')} />
            </div>
            <div>
              <label style={labelStyle(theme)}>Site Visit Time</label>
              <input type="time" style={inputStyle(theme)} value={tf.siteVisitTime} onChange={setTF('siteVisitTime')} />
            </div>
            <div>
              <label style={labelStyle(theme)}>Question Deadline Date</label>
              <input type="date" style={inputStyle(theme)} value={tf.questionDate} onChange={setTF('questionDate')} />
            </div>
            <div>
              <label style={labelStyle(theme)}>Question Deadline Time</label>
              <input type="time" style={inputStyle(theme)} value={tf.questionTime} onChange={setTF('questionTime')} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              disabled={saving}
              onClick={() => void handleTimelineConfirm(false)}
              style={{ padding: '6px 16px', borderRadius: '6px', background: theme.accent, color: '#fff', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: 500 }}
            >
              {saving ? 'Saving…' : 'Confirm & Submit to Team'}
            </button>
            <button
              disabled={saving}
              onClick={() => void handleTimelineConfirm(true)}
              style={{ padding: '6px 14px', borderRadius: '6px', background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textMuted, cursor: 'pointer', fontSize: '13px' }}
            >
              Skip
            </button>
            <button
              disabled={saving}
              onClick={() => setPendingAction(null)}
              style={{ padding: '6px 12px', borderRadius: '6px', background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textMuted, cursor: 'pointer', fontSize: '13px' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Timeline modal — Submit for Approval */}
      {pendingAction === 'submit' && (
        <div style={{ background: theme.accentBg, border: `1px solid ${theme.accentBorder}`, borderRadius: '10px', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary }}>
            Confirm submission details
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={labelStyle(theme)}>Submission Date *</label>
              <input type="date" style={inputStyle(theme)} value={tf.submissionDate} onChange={setTF('submissionDate')} />
            </div>
            <div>
              <label style={labelStyle(theme)}>Submission Time</label>
              <input type="time" style={inputStyle(theme)} value={tf.submissionTime} onChange={setTF('submissionTime')} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              disabled={saving || !tf.submissionDate}
              onClick={() => void handleTimelineConfirm(false)}
              style={{ padding: '6px 16px', borderRadius: '6px', background: tf.submissionDate ? theme.accent : theme.border, color: '#fff', border: 'none', cursor: (saving || !tf.submissionDate) ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: 500 }}
            >
              {saving ? 'Saving…' : 'Confirm & Submit for Approval'}
            </button>
            <button
              disabled={saving}
              onClick={() => setPendingAction(null)}
              style={{ padding: '6px 12px', borderRadius: '6px', background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textMuted, cursor: 'pointer', fontSize: '13px' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Action buttons */}
      {!pendingAction && allowedActions.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {allowedActions.map(action => {
            const isDanger   = action === 'cancel' || action === 'cancel_after_approval'
            const isApprove  = action === 'approve_rfq' || action === 'approve'
            const isWarning  = action === 'reject_rfq' || action === 'reject_back'
            const bg = isDanger ? '#ef4444' : isApprove ? '#16a34a' : isWarning ? '#f59e0b' : theme.accent
            return (
              <button
                key={action}
                onClick={() => handleAction(action)}
                style={{
                  padding: '6px 14px', borderRadius: '7px', fontSize: '13px', fontWeight: 500, cursor: 'pointer', border: 'none',
                  background: bg, color: '#fff',
                }}
              >
                {resolveActionLabel(action, status)}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
