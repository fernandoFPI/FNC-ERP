import React, { createContext, useContext, useEffect, useState } from 'react'
import { themes, ThemeKey, ThemeTokens } from './tokens'

interface ThemeContextValue {
  theme: ThemeTokens
  themeKey: ThemeKey
  setTheme: (key: ThemeKey) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function applyTokens(t: ThemeTokens) {
  const root = document.documentElement
  root.style.setProperty('--bg-canvas', t.bgCanvas)
  root.style.setProperty('--orb-1', t.orb1)
  root.style.setProperty('--orb-2', t.orb2)
  root.style.setProperty('--orb-3', t.orb3)
  root.style.setProperty('--bg-surface', t.bgSurface)
  root.style.setProperty('--bg-surface-hover', t.bgSurfaceHover)
  root.style.setProperty('--bg-topbar', t.bgTopbar)
  root.style.setProperty('--bg-sidebar', t.bgSidebar)
  root.style.setProperty('--border', t.border)
  root.style.setProperty('--border-strong', t.borderStrong)
  root.style.setProperty('--border-input', t.borderInput)
  root.style.setProperty('--text-primary', t.textPrimary)
  root.style.setProperty('--text-secondary', t.textSecondary)
  root.style.setProperty('--text-muted', t.textMuted)
  root.style.setProperty('--accent', t.accent)
  root.style.setProperty('--accent-bg', t.accentBg)
  root.style.setProperty('--accent-border', t.accentBorder)
  root.style.setProperty('--accent-hover', t.accentHover)
  root.style.setProperty('--success', t.success)
  root.style.setProperty('--success-bg', t.successBg)
  root.style.setProperty('--success-border', t.successBorder)
  root.style.setProperty('--warning', t.warning)
  root.style.setProperty('--warning-bg', t.warningBg)
  root.style.setProperty('--warning-border', t.warningBorder)
  root.style.setProperty('--danger', t.danger)
  root.style.setProperty('--danger-bg', t.dangerBg)
  root.style.setProperty('--danger-border', t.dangerBorder)
  root.style.setProperty('--info', t.info)
  root.style.setProperty('--info-bg', t.infoBg)
  root.style.setProperty('--info-border', t.infoBorder)
  root.style.setProperty('--bar-grad-start', t.barGradStart)
  root.style.setProperty('--bar-grad-end', t.barGradEnd)
  root.style.setProperty('--hbar-track', t.hbarTrack)
  root.style.setProperty('--table-row-hover', t.tableRowHover)
  root.style.setProperty('--table-border', t.tableBorder)
  root.style.setProperty('--top-rim', t.topRim)
  root.style.setProperty('--blur', t.blurAmount)
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeKey, setThemeKey] = useState<ThemeKey>(() => {
    const saved = localStorage.getItem('fnc-theme') as ThemeKey | null
    return saved && themes[saved] ? saved : 'dark-glass'
  })

  useEffect(() => {
    const t = themes[themeKey]
    document.documentElement.style.setProperty('transition',
      'background-color 0.25s ease, color 0.25s ease, border-color 0.25s ease')
    document.body.style.transition = 'background-color 0.25s ease, color 0.25s ease'
    applyTokens(t)
    document.body.className = themeKey
    localStorage.setItem('fnc-theme', themeKey)

    // Persist to backend (best-effort, no await)
    const token = localStorage.getItem('fnc-access-token')
    if (token) {
      fetch(`${import.meta.env.VITE_API_URL}/api/v1/auth/me`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ theme_preference: themeKey }),
      }).catch(() => undefined)
    }
  }, [themeKey])

  return (
    <ThemeContext.Provider value={{ theme: themes[themeKey], themeKey, setTheme: setThemeKey }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider')
  return ctx
}
