import { useTheme } from '../../theme/ThemeContext'
import { Card } from '../ui/Card'

export interface Requirement {
  id: string
  label: string
  done: boolean
}

interface RequirementsChecklistProps {
  title: string
  items: Requirement[]
  /** "2 of 4 done" */
  progressLabel: string
  /** Shown instead of the list's progress when every item is done. */
  readyLabel: string
  /** Read by a screen reader after each item, since the tick is only a drawing. */
  doneText: string
  todoText: string
  'data-tour'?: string
}

/**
 * "Before you create it": what the form still needs, one line each, ticked as the person fills it in. The caller
 * builds the list from the SAME rules its submit uses (so the list and the refusal cannot disagree); this component
 * only draws it. It never blocks anything.
 */
export function RequirementsChecklist({
  title,
  items,
  progressLabel,
  readyLabel,
  doneText,
  todoText,
  'data-tour': dataTour,
}: RequirementsChecklistProps) {
  const { theme } = useTheme()
  const ready = items.every((i) => i.done)

  return (
    <Card data-tour={dataTour} style={{ padding: '20px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px',
          flexWrap: 'wrap',
          marginBottom: '12px',
        }}
      >
        <div style={{ fontWeight: 600, fontSize: '15px', color: theme.textPrimary }}>{title}</div>
        <span
          aria-live="polite"
          data-ready={ready}
          style={{
            fontSize: '12px',
            fontWeight: 600,
            padding: '3px 10px',
            borderRadius: '999px',
            color: ready ? theme.success : theme.textSecondary,
            background: ready ? theme.successBg : theme.bgCanvas,
            border: `1px solid ${ready ? theme.successBorder : theme.border}`,
          }}
        >
          {ready ? readyLabel : progressLabel}
        </span>
      </div>
      <ul
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}
      >
        {items.map((item) => (
          <li
            key={item.id}
            data-done={item.done}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              fontSize: '13px',
              lineHeight: 1.4,
            }}
          >
            <span
              aria-hidden="true"
              style={{
                flex: 'none',
                width: '18px',
                height: '18px',
                marginTop: '1px',
                borderRadius: '50%',
                display: 'grid',
                placeItems: 'center',
                border: `1.5px solid ${item.done ? theme.success : theme.borderField}`,
                background: item.done ? theme.success : 'transparent',
                color: theme.bgSurface,
              }}
            >
              {item.done && (
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
              )}
            </span>
            <span
              style={{
                color: item.done ? theme.textSecondary : theme.textPrimary,
                fontWeight: item.done ? 400 : 500,
              }}
            >
              {item.label}
              <span
                style={{
                  position: 'absolute',
                  width: '1px',
                  height: '1px',
                  overflow: 'hidden',
                  clip: 'rect(0 0 0 0)',
                  whiteSpace: 'nowrap',
                }}
              >
                {' — '}
                {item.done ? doneText : todoText}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  )
}
