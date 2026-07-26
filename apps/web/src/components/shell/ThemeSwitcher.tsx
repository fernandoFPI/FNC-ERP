import { useState, useRef, useEffect } from 'react'
import { Card } from '../ui/Card'
import { useTheme } from '../../theme/ThemeContext'
import type { ThemeKey } from '../../theme/tokens'
import { themes } from '../../theme/tokens'

interface ThemePreview {
  canvas: string
  surface: string
  accent: string
}

const PREVIEWS: Record<ThemeKey, ThemePreview> = {
  'light-flat': { canvas: '#f4f6f8', surface: '#ffffff', accent: '#4a7a9b' },
  black: { canvas: '#141618', surface: '#1c1e21', accent: '#6ba8ca' },
}

export function ThemeSwitcher() {
  const { theme, themeKey, setTheme } = useTheme()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => {
      document.removeEventListener('mousedown', handler)
    }
  }, [])

  const themeKeys: ThemeKey[] = ['light-flat', 'black']

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => {
          setOpen((v) => !v)
        }}
        aria-label="Switch theme"
        style={{
          width: '34px',
          height: '34px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: theme.bgSurface,
          border: `1px solid ${theme.border}`,
          borderRadius: '8px',
          color: theme.textSecondary,
          cursor: 'pointer',
          backdropFilter: theme.hasBlur ? theme.blurAmount : 'none',
        }}
      >
        {themeKey === 'black' ? (
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        ) : (
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" />
            <line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" />
            <line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </svg>
        )}
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            zIndex: 500,
            width: '240px',
          }}
        >
          <Card padding="sm" rimHighlight>
            <p
              style={{
                fontSize: '11px',
                fontWeight: 600,
                color: theme.textMuted,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginBottom: '8px',
              }}
            >
              Theme
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {themeKeys.map((key) => {
                const t = themes[key]
                const prev = PREVIEWS[key]
                const isActive = key === themeKey
                return (
                  <button
                    key={key}
                    onClick={() => {
                      setTheme(key)
                      setOpen(false)
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '8px 10px',
                      background: isActive ? theme.accentBg : 'none',
                      border: `1px solid ${isActive ? theme.accentBorder : 'transparent'}`,
                      borderRadius: '8px',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontFamily: 'inherit',
                      width: '100%',
                    }}
                  >
                    {/* Mini preview */}
                    <div
                      style={{
                        width: '36px',
                        height: '26px',
                        borderRadius: '6px',
                        background: prev.canvas,
                        border: `1px solid ${theme.border}`,
                        overflow: 'hidden',
                        position: 'relative',
                        flexShrink: 0,
                      }}
                    >
                      <div
                        style={{
                          position: 'absolute',
                          top: '4px',
                          left: '4px',
                          right: '4px',
                          bottom: '4px',
                          borderRadius: '3px',
                          background: prev.surface,
                          border: `0.5px solid ${prev.accent}44`,
                        }}
                      />
                      <div
                        style={{
                          position: 'absolute',
                          top: '6px',
                          left: '6px',
                          width: '12px',
                          height: '3px',
                          borderRadius: '2px',
                          background: prev.accent,
                        }}
                      />
                    </div>
                    <div>
                      <p
                        style={{
                          fontSize: '12px',
                          fontWeight: 500,
                          color: isActive ? theme.accent : theme.textPrimary,
                          margin: 0,
                        }}
                      >
                        {t.label}
                      </p>
                      <p style={{ fontSize: '10px', color: theme.textMuted, margin: 0 }}>
                        {t.description}
                      </p>
                    </div>
                    {isActive && (
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke={theme.accent}
                        strokeWidth="2.5"
                        style={{ marginLeft: 'auto', flexShrink: 0 }}
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </button>
                )
              })}
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
