import { useTranslation } from 'react-i18next'
import type { CSSProperties } from 'react'
import { useTheme } from '../../theme/ThemeContext'
import { useBreakpoint } from '../../hooks/useBreakpoint'

export interface PhaseBarPhase {
  key: string
  label: string
  statuses: readonly string[]
}

interface PhaseBarProps {
  phases: readonly PhaseBarPhase[]
  /** The record's status key. */
  current: string
  /** Label of that status, shown after the phase name ("Price · Market pricing"). */
  currentLabel: string
  /** Statuses that mean the record left the normal path (rejected, cancelled, deleted). */
  stoppedStatuses?: readonly string[]
}

type PhaseState = 'done' | 'now' | 'todo'

const visuallyHidden: CSSProperties = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
}

/**
 * A short progress strip: one segment per phase, with the current phase and status named.
 * Replaces the twelve-dot status bar on the requisition page; the status names are unchanged,
 * `phases` only groups them. On a phone the segments stand alone and one line names the step.
 */
export function PhaseBar({ phases, current, currentLabel, stoppedStatuses = [] }: PhaseBarProps) {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const { isPhone } = useBreakpoint()

  const stopped = stoppedStatuses.includes(current)
  const index = phases.findIndex((p) => p.statuses.includes(current))
  const finished = !stopped && index === phases.length - 1

  const stateOf = (i: number): PhaseState => {
    if (stopped || index === -1) return 'todo'
    if (finished || i < index) return 'done'
    return i === index ? 'now' : 'todo'
  }

  // "Price · Market pricing"; just the status when the two read the same.
  const phase = index === -1 ? undefined : phases[index]
  const currentText =
    phase && phase.label.toLowerCase() !== currentLabel.toLowerCase()
      ? `${phase.label} · ${currentLabel}`
      : currentLabel

  const barColor: Record<PhaseState, string> = {
    done: theme.success,
    now: theme.accent,
    todo: theme.border,
  }
  const showSummaryRow = isPhone || stopped || index === -1

  return (
    <div role="group" aria-label={t('req.detail.progress')}>
      <ol
        style={{
          display: 'flex',
          gap: '6px',
          listStyle: 'none',
          margin: 0,
          padding: 0,
        }}
      >
        {phases.map((p, i) => {
          const state = stateOf(i)
          return (
            <li
              key={p.key}
              aria-current={state === 'now' ? 'step' : undefined}
              style={{
                flex: '1 1 0',
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              <div
                aria-hidden="true"
                style={{ height: '4px', borderRadius: '2px', background: barColor[state] }}
              />
              {isPhone ? (
                <span style={visuallyHidden}>{p.label}</span>
              ) : (
                <span
                  style={{
                    fontSize: '13px',
                    fontWeight: state === 'now' ? 700 : state === 'done' ? 600 : 500,
                    color:
                      state === 'now'
                        ? theme.textPrimary
                        : state === 'done'
                          ? theme.success
                          : theme.textSecondary,
                  }}
                >
                  {i === index && !stopped ? currentText : p.label}
                  {state === 'done' && <span aria-hidden="true"> ✓</span>}
                </span>
              )}
            </li>
          )
        })}
      </ol>

      <div
        style={{
          display: 'flex',
          justifyContent: showSummaryRow ? 'space-between' : 'flex-end',
          gap: '8px',
          marginTop: '6px',
          fontSize: '13px',
        }}
      >
        {showSummaryRow && (
          <strong style={{ color: stopped ? theme.danger : theme.textPrimary }}>
            {currentText}
          </strong>
        )}
        {phase && !stopped && (
          <span style={{ color: theme.textSecondary }}>
            {t('req.detail.stepOf', { current: index + 1, total: phases.length })}
          </span>
        )}
      </div>
    </div>
  )
}
