import { useTheme } from '../../theme/ThemeContext'
import {
  getRequisitionLogActionLabel,
  getRequisitionLogActionTone,
} from '../../lib/requisition-constants'

export interface ActivityEntry {
  id: string
  action: string
  actor_name?: string | null
  actor_position?: string | null
  notes?: string | null
  created_at: string
}

interface ActivityTimelineProps {
  entries: ActivityEntry[]
  /** Who an entry with no person behind it (the system) is shown as. */
  systemActor: string
  /** Names the list for a screen reader ("Approval Log"). */
  label?: string
  /** What an action is called. Defaults to the requisition's wording; a purchase order passes its own. */
  actionLabel?: (action: string) => string
  /** The colour of an action's dot and quote: success, danger or info. Defaults to the requisition's rule. */
  actionTone?: (action: string) => 'success' | 'danger' | 'info'
}

/**
 * The approval log as a vertical timeline: what happened, who did it and when, with a rejection's
 * reason drawn as a quote under the step. Entries keep the order they arrive in (oldest first).
 */
export function ActivityTimeline({
  entries,
  systemActor,
  label,
  actionLabel = getRequisitionLogActionLabel,
  actionTone = getRequisitionLogActionTone,
}: ActivityTimelineProps) {
  const { theme } = useTheme()
  const toneColor = {
    success: theme.success,
    danger: theme.danger,
    info: theme.accent,
  }

  return (
    <ol aria-label={label} style={{ listStyle: 'none', margin: 0, padding: '20px 20px 16px' }}>
      {entries.map((entry, i) => {
        const last = i === entries.length - 1
        const color = toneColor[actionTone(entry.action)]
        const who = entry.actor_name ?? systemActor
        const when = entry.created_at.slice(0, 16).replace('T', ' ')
        return (
          <li
            key={entry.id}
            style={{ display: 'flex', gap: '14px', paddingBottom: last ? 0 : '20px' }}
          >
            <div
              aria-hidden="true"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  width: '12px',
                  height: '12px',
                  borderRadius: '50%',
                  background: color,
                  marginTop: '4px',
                }}
              />
              {!last && (
                <span
                  style={{ flex: 1, width: '2px', background: theme.border, marginTop: '4px' }}
                />
              )}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: theme.textPrimary }}>
                {actionLabel(entry.action)}
              </div>
              <div style={{ fontSize: '13px', color: theme.textSecondary, marginTop: '2px' }}>
                {who}
                {entry.actor_position ? ` (${entry.actor_position})` : ''}
                {' · '}
                <time dateTime={entry.created_at}>{when}</time>
              </div>
              {entry.notes && (
                <div
                  style={{
                    marginTop: '8px',
                    padding: '8px 12px',
                    borderInlineStart: `3px solid ${color}`,
                    borderRadius: '8px',
                    background: theme.bgCanvas,
                    fontSize: '13px',
                    color: theme.textPrimary,
                    whiteSpace: 'pre-wrap',
                    overflowWrap: 'anywhere',
                  }}
                >
                  {entry.notes}
                </div>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
