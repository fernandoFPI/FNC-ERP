import React from 'react'
import { useTheme } from '../../theme/ThemeContext'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import { ScrollFadeRow } from './ScrollFadeRow'
import { isKeyboardFocus } from './keyboardFocus'

interface Tab {
  key: string
  label: string
  badge?: number
  group?: string
}

interface TabBarProps {
  tabs: Tab[]
  active: string
  onChange: (key: string) => void
  /** Shorter labels shown on phone, keyed by tab key — falls back to `label`. */
  phoneLabels?: Partial<Record<string, string>>
  /** Background this strip sits on, for the ScrollFadeRow edge fade. Defaults to page canvas. */
  fadeColor?: string
  /**
   * Opt-in: inactive tabs in the readable secondary grey (the default pale grey is 2.6:1 on white, text needs 4.5:1), the
   * active tab in the solid accent and semibold, slightly larger, and a ring for keyboard focus. Off, nothing changes.
   */
  readable?: boolean
}

export function TabBar({
  tabs,
  active,
  onChange,
  phoneLabels,
  fadeColor,
  readable = false,
}: TabBarProps) {
  const { theme } = useTheme()
  const { isPhone } = useBreakpoint()

  return (
    <ScrollFadeRow
      fadeColor={fadeColor}
      style={{
        borderBottom: `1px solid ${theme.border}`,
      }}
    >
      {tabs.map((tab, i) => {
        const isActive = tab.key === active
        const prevGroup = i > 0 ? tabs[i - 1].group : undefined
        const newGroup = tab.group && tab.group !== prevGroup
        return (
          <React.Fragment key={tab.key}>
            {newGroup && i > 0 && (
              <div
                aria-hidden
                style={{
                  flexShrink: 0,
                  alignSelf: 'center',
                  width: '1px',
                  height: '18px',
                  background: theme.border,
                  margin: '0 12px',
                }}
              />
            )}
            <button
              onClick={() => {
                onChange(tab.key)
              }}
              style={{
                background: 'transparent',
                border: 'none',
                borderBottom: isActive
                  ? `2px solid ${readable ? theme.accentSolid : theme.accent}`
                  : '2px solid transparent',
                padding: isPhone
                  ? readable
                    ? '11px 12px'
                    : '9px 12px'
                  : readable
                    ? '12px 16px'
                    : '10px 16px',
                fontSize: isPhone ? (readable ? '13px' : '12px') : readable ? '14px' : '13px',
                fontWeight: isActive ? (readable ? 600 : 500) : 400,
                color: isActive
                  ? readable
                    ? theme.accentSolid
                    : theme.accent
                  : readable
                    ? theme.textSecondary
                    : theme.textMuted,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'color 0.15s, border-color 0.15s',
                fontFamily: 'inherit',
                marginBottom: '-1px',
                flexShrink: 0,
              }}
              onMouseEnter={(e) => {
                if (!isActive)
                  e.currentTarget.style.color = readable ? theme.textPrimary : theme.textSecondary
              }}
              onMouseLeave={(e) => {
                if (!isActive)
                  e.currentTarget.style.color = readable ? theme.textSecondary : theme.textMuted
              }}
              onFocus={(e) => {
                if (readable && isKeyboardFocus(e.currentTarget))
                  e.currentTarget.style.boxShadow = `inset 0 0 0 2px ${theme.accentSolid}`
              }}
              onBlur={(e) => {
                if (readable) e.currentTarget.style.boxShadow = 'none'
              }}
            >
              {isPhone ? (phoneLabels?.[tab.key] ?? tab.label) : tab.label}
              {tab.badge !== undefined && tab.badge > 0 && (
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 600,
                    padding: '1px 5px',
                    borderRadius: '10px',
                    background: theme.accentBg,
                    color: readable ? theme.accentSolid : theme.accent,
                    border: `1px solid ${theme.accentBorder}`,
                  }}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          </React.Fragment>
        )
      })}
    </ScrollFadeRow>
  )
}
