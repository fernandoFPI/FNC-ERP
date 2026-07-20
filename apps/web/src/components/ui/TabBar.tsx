import React from 'react'
import { useTheme } from '../../theme/ThemeContext'

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
}

export function TabBar({ tabs, active, onChange }: TabBarProps) {
  const { theme } = useTheme()

  return (
    <div style={{
      display: 'flex',
      gap: '0',
      borderBottom: `1px solid ${theme.border}`,
      overflowX: 'auto',
    }}>
      {tabs.map((tab, i) => {
        const isActive = tab.key === active
        const prevGroup = i > 0 ? tabs[i - 1].group : undefined
        const newGroup = tab.group && tab.group !== prevGroup
        return (
          <React.Fragment key={tab.key}>
          {newGroup && i > 0 && (
            <div aria-hidden style={{
              flexShrink: 0, alignSelf: 'center',
              width: '1px', height: '18px', background: theme.border, margin: '0 12px',
            }} />
          )}
          <button
            onClick={() => onChange(tab.key)}
            style={{
              background: 'transparent',
              border: 'none',
              borderBottom: isActive ? `2px solid ${theme.accent}` : '2px solid transparent',
              padding: '10px 16px',
              fontSize: '13px',
              fontWeight: isActive ? 500 : 400,
              color: isActive ? theme.accent : theme.textMuted,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'color 0.15s, border-color 0.15s',
              fontFamily: 'inherit',
              marginBottom: '-1px',
            }}
            onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.color = theme.textSecondary }}
            onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.color = theme.textMuted }}
          >
            {tab.label}
            {tab.badge !== undefined && tab.badge > 0 && (
              <span style={{
                fontSize: '10px',
                fontWeight: 600,
                padding: '1px 5px',
                borderRadius: '10px',
                background: theme.accentBg,
                color: theme.accent,
                border: `1px solid ${theme.accentBorder}`,
              }}>
                {tab.badge}
              </span>
            )}
          </button>
          </React.Fragment>
        )
      })}
    </div>
  )
}
