import { useTheme } from '../../theme/ThemeContext'

interface Tab {
  key: string
  label: string
  badge?: number
}

interface TabsProps {
  tabs: Tab[]
  activeTab: string
  onChange: (key: string) => void
  className?: string
}

export function Tabs({ tabs, activeTab, onChange, className = '' }: TabsProps) {
  const { theme } = useTheme()

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        gap: '2px',
        borderBottom: `1px solid ${theme.border}`,
        paddingBottom: '0',
      }}
    >
      {tabs.map((tab) => {
        const isActive = tab.key === activeTab
        return (
          <button
            key={tab.key}
            onClick={() => {
              onChange(tab.key)
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              fontSize: '13px',
              fontWeight: isActive ? 600 : 400,
              color: isActive ? theme.accent : theme.textSecondary,
              background: 'none',
              border: 'none',
              borderBottom: `2px solid ${isActive ? theme.accent : 'transparent'}`,
              cursor: 'pointer',
              fontFamily: 'inherit',
              marginBottom: '-1px',
            }}
          >
            {tab.label}
            {tab.badge !== undefined && (
              <span
                style={{
                  padding: '1px 6px',
                  fontSize: '10px',
                  borderRadius: '10px',
                  background: theme.accentBg,
                  color: theme.accent,
                  border: `1px solid ${theme.accentBorder}`,
                }}
              >
                {tab.badge}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
