import { useTranslation } from 'react-i18next'
import React, { useState } from 'react'
import { useMutation } from '@apollo/client'
import { useTheme } from '../../theme/ThemeContext'
import { useToastStore } from '../../store/toastStore'
import type { ThemeTokens } from '../../theme/tokens'
import {
  START_PROJECT,
  HOLD_PROJECT,
  RESUME_PROJECT,
  SUBMIT_PROJECT,
  APPROVE_PROJECT,
  REJECT_BACK_PROJECT,
  COMPLETE_PROJECT,
  CANCEL_PROJECT,
  CANCEL_PROJECT_AFTER_APPROVAL,
  UPDATE_PROJECT,
  SUBMIT_TO_TEAM,
  APPROVE_RFQ,
  REJECT_RFQ,
  ADVANCE_PHASE,
} from '../../graphql/projects'

type ProjectStatus =
  | 'pending'
  | 'ongoing'
  | 'submitted'
  | 'approved'
  | 'completed'
  | 'on_hold'
  | 'cancelled'
  | 'cancelled_after_approval'

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
  lifecyclePhase?: string
  allowedActions: string[]
  clientDocCount?: number
  rfqLineCount?: number
  isRfq?: boolean
  onTransitioned?: () => void
  timeline?: ProjectTimeline
  /**
   * Why Close Project cannot be pressed yet (shown on the disabled button), or null/omitted when it can.
   * Only the Financing phase uses it. The server enforces the same rule; this just says so up front.
   */
  closeoutGate?: string | null
}

// ── Phase-aware button definitions ─────────────────────────────────────────

interface PhaseButton {
  key: string
  label: string
  variant: 'primary' | 'success' | 'warning' | 'danger'
  requiresReason?: boolean
  requiresTimeline?: 'rfq' | 'bid'
  gate?: string | null
  isAdvancePhase?: boolean
  targetPhase?: string
  /** Ask "are you sure?" first (a step that is hard to take back without an administrator). */
  requiresConfirm?: boolean
}

function getPhaseButtons(
  phase: string,
  status: ProjectStatus,
  allowedActions: string[],
  isRfq: boolean,
  closeoutGate: string | null,
): PhaseButton[] {
  const { t } = useTranslation()
  const has = (a: string) => allowedActions.includes(a)

  if (['cancelled', 'cancelled_after_approval'].includes(status)) return []

  // On hold — only resume
  if (status === 'on_hold') {
    return has('resume') ? [{ key: 'resume', label: t('proj.statusBar.resumeProject'), variant: 'primary' }] : []
  }

  switch (phase) {
    case 'enquiry': {
      const btns: PhaseButton[] = []
      const startKey = has('submit_to_team') ? 'submit_to_team' : has('start') ? 'start' : null
      if (startKey)
        btns.push({
          key: startKey,
          label: t('proj.statusBar.startScopeReview'),
          variant: 'primary',
          requiresTimeline: 'rfq',
        })
      if (has('hold'))
        btns.push({ key: 'hold', label: t('proj.statusBar.putOnHold'), variant: 'warning', requiresReason: true })
      if (has('cancel'))
        btns.push({ key: 'cancel', label: t('proj.statusBar.cancel'), variant: 'danger', requiresReason: true })
      return btns
    }
    case 'scope_review': {
      const btns: PhaseButton[] = [
        {
          key: 'advance_bidding',
          label: t('proj.statusBar.advanceToBidding'),
          variant: 'primary',
          isAdvancePhase: true,
          targetPhase: 'bidding',
          gate: null,
        },
      ]
      if (has('hold'))
        btns.push({ key: 'hold', label: t('proj.statusBar.putOnHold'), variant: 'warning', requiresReason: true })
      if (has('cancel'))
        btns.push({ key: 'cancel', label: t('proj.statusBar.cancel'), variant: 'danger', requiresReason: true })
      return btns
    }
    case 'bidding': {
      const btns: PhaseButton[] = []
      if (has('submit'))
        btns.push({
          key: 'submit',
          label: t('proj.statusBar.submitBidToClient'),
          variant: 'success',
          requiresTimeline: 'bid',
        })
      if (has('hold'))
        btns.push({ key: 'hold', label: t('proj.statusBar.putOnHold'), variant: 'warning', requiresReason: true })
      if (has('cancel'))
        btns.push({ key: 'cancel', label: t('proj.statusBar.cancel'), variant: 'danger', requiresReason: true })
      return btns
    }
    case 'client_approval': {
      const btns: PhaseButton[] = []
      if (isRfq) {
        if (has('approve_rfq'))
          btns.push({ key: 'approve_rfq', label: t('proj.statusBar.markAsAwarded'), variant: 'success' })
        if (has('reject_rfq'))
          btns.push({
            key: 'reject_rfq',
            label: t('proj.statusBar.rejectBid'),
            variant: 'danger',
            requiresReason: true,
          })
      } else {
        if (has('approve'))
          btns.push({ key: 'approve', label: t('proj.statusBar.markAsAwarded'), variant: 'success' })
        if (has('reject_back'))
          btns.push({
            key: 'reject_back',
            label: t('proj.statusBar.requestRevision'),
            variant: 'warning',
            requiresReason: true,
          })
      }
      if (has('cancel'))
        btns.push({ key: 'cancel', label: t('proj.statusBar.cancel'), variant: 'danger', requiresReason: true })
      return btns
    }
    case 'execution': {
      const btns: PhaseButton[] = []
      // Ending the execution hands the project to the finance team (Financing phase); closing it
      // out comes after, once every invoice is paid. `complete` is the status-level action that
      // is available for an approved project, so it also gates this button.
      if (has('complete'))
        btns.push({
          key: 'end_execution',
          label: t('proj.statusBar.endExecution'),
          variant: 'primary',
          isAdvancePhase: true,
          targetPhase: 'financing',
          requiresConfirm: true,
          gate: null,
        })
      if (has('hold'))
        btns.push({ key: 'hold', label: t('proj.statusBar.putOnHold'), variant: 'warning', requiresReason: true })
      if (has('cancel_after_approval'))
        btns.push({
          key: 'cancel_after_approval',
          label: t('proj.statusBar.cancelProject'),
          variant: 'danger',
          requiresReason: true,
        })
      return btns
    }
    case 'financing': {
      // The finance team invoices the project and watches the invoices get paid (Contract Management
      // tab). Only then can it be closed out; the button says why while it cannot.
      const btns: PhaseButton[] = []
      if (has('complete'))
        btns.push({
          key: 'complete',
          label: t('proj.statusBar.closeProject'),
          variant: 'success',
          gate: closeoutGate,
        })
      return btns
    }
    case 'closeout':
      return [] // terminal
    default:
      return []
  }
}

// ── Styles ──────────────────────────────────────────────────────────────────

const inputStyle = (theme: ThemeTokens): React.CSSProperties => ({
  width: '100%',
  padding: '6px 10px',
  borderRadius: '6px',
  border: `1px solid ${theme.borderInput}`,
  background: theme.bgCanvas,
  color: theme.textPrimary,
  fontSize: '13px',
  boxSizing: 'border-box' as const,
})
const labelStyle = (theme: ThemeTokens): React.CSSProperties => ({
  fontSize: '11px',
  color: theme.textMuted,
  display: 'block',
  marginBottom: '4px',
  fontWeight: 500,
})

const VARIANT_COLOR = {
  primary: '', // filled with theme.accent below
  success: '#16a34a',
  warning: '#f59e0b',
  danger: '#ef4444',
}

export function ProjectStatusBar({
  projectId,
  status,
  lifecyclePhase = 'enquiry',
  allowedActions,
  isRfq = false,
  onTransitioned,
  timeline,
  closeoutGate = null,
}: Props) {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)
  const [pendingBtn, setPendingBtn] = useState<PhaseButton | null>(null)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [timelineForm, setTimelineForm] = useState({
    siteVisitDate: '',
    siteVisitTime: '',
    questionDate: '',
    questionTime: '',
    submissionDate: '',
    submissionTime: '',
  })

  const [startProject] = useMutation(START_PROJECT)
  const [submitToTeam] = useMutation(SUBMIT_TO_TEAM)
  const [holdProject] = useMutation(HOLD_PROJECT)
  const [resumeProject] = useMutation(RESUME_PROJECT)
  const [submitProject] = useMutation(SUBMIT_PROJECT)
  const [approveProject] = useMutation(APPROVE_PROJECT)
  const [approveRFQ] = useMutation(APPROVE_RFQ)
  const [rejectBackProject] = useMutation(REJECT_BACK_PROJECT)
  const [rejectRFQ] = useMutation(REJECT_RFQ)
  const [completeProject] = useMutation(COMPLETE_PROJECT)
  const [cancelProject] = useMutation(CANCEL_PROJECT)
  const [cancelProjectAfterApproval] = useMutation(CANCEL_PROJECT_AFTER_APPROVAL)
  const [updateProject] = useMutation(UPDATE_PROJECT)
  const [advancePhaseMut] = useMutation(ADVANCE_PHASE)

  const mutationFor = (key: string) =>
    ({
      start: startProject,
      submit_to_team: submitToTeam,
      hold: holdProject,
      resume: resumeProject,
      submit: submitProject,
      approve: approveProject,
      approve_rfq: approveRFQ,
      reject_back: rejectBackProject,
      reject_rfq: rejectRFQ,
      complete: completeProject,
      cancel: cancelProject,
      cancel_after_approval: cancelProjectAfterApproval,
    })[key] ?? null

  const sliceTime = (tx?: string | null) => (tx ? String(tx).slice(0, 5) : '')

  const handleClick = (btn: PhaseButton) => {
    if (btn.gate) return // gated — button is disabled
    if (btn.requiresConfirm) {
      setPendingBtn(btn)
      return
    }
    if (btn.requiresReason) {
      setPendingBtn(btn)
      setReason('')
      return
    }
    if (btn.requiresTimeline === 'rfq') {
      setPendingBtn(btn)
      setTimelineForm({
        siteVisitDate: timeline?.siteVisitDate ?? '',
        siteVisitTime: sliceTime(timeline?.siteVisitTime),
        questionDate: timeline?.questionDate ?? '',
        questionTime: sliceTime(timeline?.questionTime),
        submissionDate: '',
        submissionTime: '',
      })
      return
    }
    if (btn.requiresTimeline === 'bid') {
      setPendingBtn(btn)
      setTimelineForm({
        siteVisitDate: '',
        siteVisitTime: '',
        questionDate: '',
        questionTime: '',
        submissionDate: timeline?.submissionDate ?? '',
        submissionTime: sliceTime(timeline?.submissionTime),
      })
      return
    }
    void executeBtn(btn)
  }

  const executeBtn = async (btn: PhaseButton, reasonArg?: string) => {
    setSaving(true)
    try {
      if (btn.isAdvancePhase && btn.targetPhase) {
        await advancePhaseMut({ variables: { id: projectId, targetPhase: btn.targetPhase } })
        setPendingBtn(null)
        setReason('')
        onTransitioned?.()
        return
      }
      const mut = mutationFor(btn.key)
      if (!mut) return
      const variables: Record<string, unknown> = { id: projectId }
      if (btn.requiresReason) variables.reason = reasonArg ?? reason
      await mut({ variables })
      setPendingBtn(null)
      setReason('')
      onTransitioned?.()
    } catch (err) {
      // The server explains why it refused (an unpaid invoice, the wrong phase, no permission);
      // without this the rejection was unhandled and the button just seemed to do nothing.
      addToast({ type: 'error', message: err instanceof Error ? err.message : String(err) })
      if (btn.requiresConfirm) setPendingBtn(null)
    } finally {
      setSaving(false)
    }
  }

  const handleTimelineConfirm = async (skip = false) => {
    setSaving(true)
    try {
      if (!skip && pendingBtn) {
        const input: Record<string, unknown> = {}
        if (pendingBtn.requiresTimeline === 'rfq') {
          if (timelineForm.siteVisitDate) input.siteVisitDate = timelineForm.siteVisitDate
          if (timelineForm.siteVisitTime) input.siteVisitTime = timelineForm.siteVisitTime
          if (timelineForm.questionDate) input.questionDate = timelineForm.questionDate
          if (timelineForm.questionTime) input.questionTime = timelineForm.questionTime
        } else if (pendingBtn.requiresTimeline === 'bid') {
          if (timelineForm.submissionDate) input.submissionDate = timelineForm.submissionDate
          if (timelineForm.submissionTime) input.submissionTime = timelineForm.submissionTime
        }
        if (Object.keys(input).length > 0) {
          await updateProject({ variables: { id: projectId, input } })
        }
      }
      if (pendingBtn) {
        const mut = mutationFor(pendingBtn.key)
        if (mut) await mut({ variables: { id: projectId } })
      }
      setPendingBtn(null)
      onTransitioned?.()
    } finally {
      setSaving(false)
    }
  }

  const phase = lifecyclePhase
  const buttons = getPhaseButtons(phase, status, allowedActions, isRfq, closeoutGate)

  const isSideState = ['on_hold', 'cancelled', 'cancelled_after_approval'].includes(status)
  const sideLabel: Record<string, string> = {
    on_hold: t('proj.statusBar.onHold'),
    cancelled: t('proj.statusBar.cancelled'),
    cancelled_after_approval: t('proj.statusBar.cancelledAfterApproval'),
  }
  const sideColor: Record<string, string> = {
    on_hold: '#f59e0b',
    cancelled: '#ef4444',
    cancelled_after_approval: '#b91c1c',
  }

  const tf = timelineForm
  const setTF = (k: keyof typeof timelineForm) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setTimelineForm((f) => ({ ...f, [k]: e.target.value }))
  }

  const btnBg = (btn: PhaseButton) => {
    if (btn.gate) return theme.border
    return btn.variant === 'primary' ? theme.accent : VARIANT_COLOR[btn.variant]
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Side-state badge */}
      {isSideState && (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '4px 12px',
            borderRadius: '999px',
            background: sideColor[status],
            color: '#fff',
            fontSize: '12px',
            fontWeight: 600,
            alignSelf: 'flex-start',
          }}
        >
          {sideLabel[status] ?? status}
        </div>
      )}

      {/* Reason input */}
      {pendingBtn && pendingBtn.requiresReason && !pendingBtn.isAdvancePhase && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: theme.accentBg,
            border: `1px solid ${theme.accentBorder}`,
            borderRadius: '8px',
            padding: '10px 12px',
          }}
        >
          <input
            style={{
              flex: 1,
              padding: '6px 10px',
              borderRadius: '6px',
              border: `1px solid ${theme.borderInput}`,
              background: theme.bgCanvas,
              color: theme.textPrimary,
              fontSize: '13px',
            }}
            placeholder={t('proj.statusBar.reasonFor', { label: pendingBtn.label })}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value)
            }}
            autoFocus
          />
          <button
            disabled={!reason.trim()}
            onClick={() => void executeBtn(pendingBtn)}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              background: reason.trim() ? theme.accent : theme.border,
              color: '#fff',
              border: 'none',
              cursor: reason.trim() ? 'pointer' : 'not-allowed',
              fontSize: '13px',
              fontWeight: 500,
            }}
          >
            {t('proj.statusBar.confirm')}
          </button>
          <button
            onClick={() => {
              setPendingBtn(null)
            }}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              background: 'transparent',
              border: `1px solid ${theme.border}`,
              color: theme.textMuted,
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            {t('proj.statusBar.cancel')}
          </button>
        </div>
      )}

      {/* Confirm — End Execution hands the project to Financing; only an administrator can undo it */}
      {pendingBtn?.requiresConfirm && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '8px 12px',
            background: theme.accentBg,
            border: `1px solid ${theme.accentBorder}`,
            borderRadius: '8px',
            padding: '10px 12px',
          }}
        >
          <span
            style={{
              flex: '1 1 260px',
              fontSize: '13px',
              color: theme.textPrimary,
              lineHeight: 1.45,
            }}
          >
            {t('proj.statusBar.endExecutionConfirm')}
          </span>
          <button
            disabled={saving}
            onClick={() => void executeBtn(pendingBtn)}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              background: saving ? theme.border : theme.accent,
              color: '#fff',
              border: 'none',
              cursor: saving ? 'not-allowed' : 'pointer',
              fontSize: '13px',
              fontWeight: 500,
            }}
          >
            {saving ? t('proj.statusBar.saving') : t('proj.statusBar.confirm')}
          </button>
          <button
            disabled={saving}
            onClick={() => {
              setPendingBtn(null)
            }}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              background: 'transparent',
              border: `1px solid ${theme.border}`,
              color: theme.textMuted,
              cursor: saving ? 'not-allowed' : 'pointer',
              fontSize: '13px',
            }}
          >
            {t('proj.statusBar.cancel')}
          </button>
        </div>
      )}

      {/* Timeline — RFQ schedule (Start Scope Review / Submit to Team) */}
      {pendingBtn?.requiresTimeline === 'rfq' && (
        <div
          style={{
            background: theme.accentBg,
            border: `1px solid ${theme.accentBorder}`,
            borderRadius: '10px',
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary }}>
            {t('proj.statusBar.beforeStartingConfirmTheTenderSchedule')}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={labelStyle(theme)}>{t('proj.statusBar.siteVisitDate')}</label>
              <input
                type="date"
                style={inputStyle(theme)}
                value={tf.siteVisitDate}
                onChange={setTF('siteVisitDate')}
              />
            </div>
            <div>
              <label style={labelStyle(theme)}>{t('proj.statusBar.siteVisitTime')}</label>
              <input
                type="time"
                style={inputStyle(theme)}
                value={tf.siteVisitTime}
                onChange={setTF('siteVisitTime')}
              />
            </div>
            <div>
              <label style={labelStyle(theme)}>{t('proj.statusBar.questionDeadlineDate')}</label>
              <input
                type="date"
                style={inputStyle(theme)}
                value={tf.questionDate}
                onChange={setTF('questionDate')}
              />
            </div>
            <div>
              <label style={labelStyle(theme)}>{t('proj.statusBar.questionDeadlineTime')}</label>
              <input
                type="time"
                style={inputStyle(theme)}
                value={tf.questionTime}
                onChange={setTF('questionTime')}
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              disabled={saving}
              onClick={() => void handleTimelineConfirm(false)}
              style={{
                padding: '6px 16px',
                borderRadius: '6px',
                background: theme.accent,
                color: '#fff',
                border: 'none',
                cursor: saving ? 'not-allowed' : 'pointer',
                fontSize: '13px',
                fontWeight: 500,
              }}
            >
              {saving ? t('proj.statusBar.saving') : t('proj.statusBar.confirm2', { label: pendingBtn.label })}
            </button>
            <button
              disabled={saving}
              onClick={() => void handleTimelineConfirm(true)}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                background: 'transparent',
                border: `1px solid ${theme.border}`,
                color: theme.textMuted,
                cursor: 'pointer',
                fontSize: '13px',
              }}
            >
              {t('proj.statusBar.skip')}
            </button>
            <button
              disabled={saving}
              onClick={() => {
                setPendingBtn(null)
              }}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                background: 'transparent',
                border: `1px solid ${theme.border}`,
                color: theme.textMuted,
                cursor: 'pointer',
                fontSize: '13px',
              }}
            >
              {t('proj.statusBar.cancel')}
            </button>
          </div>
        </div>
      )}

      {/* Timeline — Bid submission date */}
      {pendingBtn?.requiresTimeline === 'bid' && (
        <div
          style={{
            background: theme.accentBg,
            border: `1px solid ${theme.accentBorder}`,
            borderRadius: '10px',
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary }}>
            {t('proj.statusBar.confirmBidSubmissionDetails')}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={labelStyle(theme)}>{t('proj.statusBar.submissionDate')}</label>
              <input
                type="date"
                style={inputStyle(theme)}
                value={tf.submissionDate}
                onChange={setTF('submissionDate')}
              />
            </div>
            <div>
              <label style={labelStyle(theme)}>{t('proj.statusBar.submissionTime')}</label>
              <input
                type="time"
                style={inputStyle(theme)}
                value={tf.submissionTime}
                onChange={setTF('submissionTime')}
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              disabled={saving || !tf.submissionDate}
              onClick={() => void handleTimelineConfirm(false)}
              style={{
                padding: '6px 16px',
                borderRadius: '6px',
                background: tf.submissionDate ? theme.accent : theme.border,
                color: '#fff',
                border: 'none',
                cursor: saving || !tf.submissionDate ? 'not-allowed' : 'pointer',
                fontSize: '13px',
                fontWeight: 500,
              }}
            >
              {saving ? t('proj.statusBar.saving') : t('proj.statusBar.confirmSubmitBid')}
            </button>
            <button
              disabled={saving}
              onClick={() => {
                setPendingBtn(null)
              }}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                background: 'transparent',
                border: `1px solid ${theme.border}`,
                color: theme.textMuted,
                cursor: 'pointer',
                fontSize: '13px',
              }}
            >
              {t('proj.statusBar.cancel')}
            </button>
          </div>
        </div>
      )}

      {/* Action buttons */}
      {!pendingBtn && buttons.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
          {buttons.map((btn) => (
            <button
              key={btn.key}
              onClick={() => {
                handleClick(btn)
              }}
              disabled={!!btn.gate}
              title={btn.gate ?? undefined}
              style={{
                padding: '6px 14px',
                borderRadius: '7px',
                fontSize: '13px',
                fontWeight: 500,
                cursor: btn.gate ? 'not-allowed' : 'pointer',
                border: 'none',
                opacity: btn.gate ? 0.55 : 1,
                background: btnBg(btn),
                color: '#fff',
              }}
            >
              {btn.label}
            </button>
          ))}
        </div>
      )}

      {/* Gate hint */}
      {!pendingBtn && buttons.some((b) => b.gate) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {buttons
            .filter((b) => b.gate)
            .map((b) => (
              <div
                key={b.key}
                style={{
                  fontSize: '11px',
                  color: theme.textMuted,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                <span style={{ color: '#f59e0b', fontWeight: 700 }}>!</span>
                <span>
                  <strong>{b.label}</strong> — {b.gate}
                </span>
              </div>
            ))}
        </div>
      )}
    </div>
  )
}
