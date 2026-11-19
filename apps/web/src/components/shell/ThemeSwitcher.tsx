import { useTranslation } from 'react-i18next'
import { useTheme } from '../../theme/ThemeContext'
import type { ThemeKey } from '../../theme/tokens'
import { themes } from '../../theme/tokens'
import {
  MenuCaption,
  MenuRow,
  MenuTick,
  ShellMenuPanel,
  TopbarButton,
  useShellMenu,
} from './shellParts'

interface ThemePreview {
  canvas: string
  surface: string
  accent: string
}

// The swatches show each theme's own colours, so they are fixed on purpose (not read from the active theme).
const PREVIEWS: Record<ThemeKey, ThemePreview> = {
  'light-flat': { canvas: '#f4f6f8', surface: '#ffffff', accent: '#4a7a9b' },
  black: { canvas: '#141618', surface: '#1c1e21', accent: '#6ba8ca' },
}

export function ThemeSwitcher() {
  const { t } = useTranslation()
  const { theme, themeKey, setTheme } = useTheme()
  const menu = useShellMenu()

  const themeKeys: ThemeKey[] = ['light-flat', 'black']

  return (
    <div ref={menu.containerRef} style={{ position: 'relative' }}>
      <TopbarButton
        ref={menu.triggerRef}
        onClick={menu.toggle}
        aria-label={t('shell.theme.switchTheme')}
        aria-haspopup="menu"
        aria-expanded={menu.open}
        active={menu.open}
      >
        {themeKey === 'black' ? (
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        ) : (
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
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
      </TopbarButton>

      {menu.open && (
        <ShellMenuPanel
          align="end"
          label={t('shell.theme.theme')}
          panelRef={menu.panelRef}
          onKeyDown={menu.onKeyDown}
          header={<MenuCaption>{t('shell.theme.theme')}</MenuCaption>}
          minWidth={256}
        >
          {themeKeys.map((key) => {
            const tk = themes[key]
            const prev = PREVIEWS[key]
            const isActive = key === themeKey
            return (
              <MenuRow
                key={key}
                role="menuitemradio"
                checked={isActive}
                onSelect={() => {
                  setTheme(key)
                  menu.close()
                  menu.triggerRef.current?.focus()
                }}
              >
                {/* Mini preview */}
                <span
                  aria-hidden="true"
                  style={{
                    width: '36px',
                    height: '26px',
                    borderRadius: '6px',
                    background: prev.canvas,
                    border: `1px solid ${theme.borderStrong}`,
                    overflow: 'hidden',
                    position: 'relative',
                    flexShrink: 0,
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      top: '4px',
                      insetInlineStart: '4px',
                      insetInlineEnd: '4px',
                      bottom: '4px',
                      borderRadius: '3px',
                      background: prev.surface,
                      border: `0.5px solid ${prev.accent}44`,
                    }}
                  />
                  <span
                    style={{
                      position: 'absolute',
                      top: '6px',
                      insetInlineStart: '6px',
                      width: '12px',
                      height: '3px',
                      borderRadius: '2px',
                      background: prev.accent,
                    }}
                  />
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span>{tk.label}</span>
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 400,
                      color: theme.textSecondary,
                    }}
                  >
                    {tk.description}
                  </span>
                </span>
                {isActive && <MenuTick />}
              </MenuRow>
            )
          })}
        </ShellMenuPanel>
      )}
    </div>
  )
}
