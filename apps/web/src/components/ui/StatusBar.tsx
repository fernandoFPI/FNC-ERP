import React from 'react'
import { useTheme } from '../../theme/ThemeContext'

interface StatusStep {
  key: string
  label: string
}

interface StatusBarProps {
  // Spec API
  statuses?: string[]
  current?: string
  rejected?: boolean
  cancelled?: boolean
  // Alternative API used by page files
  steps?: StatusStep[]
  currentStep?: string
  rejectedSteps?: string[]
}

export function StatusBar({
  statuses,
  current,
  rejected = false,
  cancelled = false,
  steps,
  currentStep,
  rejectedSteps = [],
}: StatusBarProps) {
  const { theme } = useTheme()

  // Resolve to common format
  const resolvedStatuses = statuses ?? steps?.map((s) => s.key) ?? []
  const resolvedLabels: Record<string, string> = {}
  steps?.forEach((s) => {
    resolvedLabels[s.key] = s.label
  })

  const resolvedCurrent = current ?? currentStep ?? ''
  const isRejected = rejected || cancelled || rejectedSteps.includes(resolvedCurrent)

  const currentIndex = resolvedStatuses.indexOf(resolvedCurrent)
  const isDanger = isRejected

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0',
        overflowX: 'auto',
        padding: '4px 0',
      }}
    >
      {resolvedStatuses.map((status, i) => {
        const isCompleted = i < currentIndex
        const isCurrent = i === currentIndex
        const isFuture = i > currentIndex

        let dotColor = theme.textMuted
        let labelColor = theme.textMuted
        if (isCurrent && isDanger) {
          dotColor = theme.danger
          labelColor = theme.danger
        } else if (isCurrent) {
          dotColor = theme.accent
          labelColor = theme.accent
        } else if (isCompleted) {
          dotColor = theme.success
          labelColor = theme.success
        }

        const label = resolvedLabels[status] ?? status.replace(/_/g, ' ')

        return (
          <React.Fragment key={status}>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px',
                minWidth: '72px',
              }}
            >
              <div
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  background: isFuture ? 'transparent' : dotColor,
                  border: `2px solid ${dotColor}`,
                  boxShadow: isCurrent && !isDanger ? `0 0 8px ${dotColor}66` : 'none',
                  flexShrink: 0,
                  transition: 'all 0.2s',
                }}
              />
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: isCurrent ? 600 : 400,
                  color: labelColor,
                  textAlign: 'center',
                  whiteSpace: 'nowrap',
                  textTransform: 'capitalize',
                }}
              >
                {label}
              </span>
            </div>
            {i < resolvedStatuses.length - 1 && (
              <div
                style={{
                  flex: 1,
                  height: '1px',
                  background: isCompleted ? theme.success : theme.border,
                  minWidth: '20px',
                  marginTop: '-16px',
                  transition: 'background 0.2s',
                }}
              />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}
