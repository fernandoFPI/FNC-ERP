import { useState, useRef, useEffect } from 'react'
import { useTheme } from '../../theme/ThemeContext'
import type { FilterPreset } from '../../hooks/useFilterPresets'

interface Props {
  presets: FilterPreset[]
  onApply: (preset: FilterPreset) => void
  onSave: (name: string) => void
  onDelete: (id: string) => void
}

export function FilterPresets({ presets, onApply, onSave, onDelete }: Props) {
  const { theme } = useTheme()
  const [open, setOpen] = useState(false)
  const [saveName, setSaveName] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => {
      document.removeEventListener('mousedown', handler)
    }
  }, [open])

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus())
    } else {
      setSaveName('')
    }
  }, [open])

  function handleSave() {
    if (!saveName.trim()) return
    onSave(saveName.trim())
    setSaveName('')
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        onClick={() => {
          setOpen((o) => !o)
        }}
        title="Saved filter presets"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          padding: '6px 10px',
          borderRadius: '8px',
          border: `1px solid ${open ? theme.accentBorder : theme.border}`,
          background: open ? theme.accentBg : theme.bgSurface,
          color: open ? theme.accent : theme.textMuted,
          cursor: 'pointer',
          fontSize: '12px',
          fontWeight: 500,
          whiteSpace: 'nowrap',
          fontFamily: 'inherit',
          transition: 'all 0.12s ease',
        }}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
        Presets
        {presets.length > 0 && (
          <span
            style={{
              fontSize: '10px',
              fontWeight: 700,
              lineHeight: '1.4',
              background: theme.border,
              color: theme.textMuted,
              borderRadius: '10px',
              padding: '1px 5px',
            }}
          >
            {presets.length}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            zIndex: 300,
            width: '256px',
            background: theme.bgSurface,
            border: `1px solid ${theme.border}`,
            borderRadius: '12px',
            boxShadow: '0 8px 28px rgba(0,0,0,0.16)',
            overflow: 'hidden',
          }}
        >
          {/* Preset list */}
          {presets.length > 0 ? (
            <div style={{ maxHeight: '224px', overflowY: 'auto' }}>
              {presets.map((preset, i) => (
                <div
                  key={preset.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    borderBottom: i < presets.length - 1 ? `1px solid ${theme.border}` : 'none',
                  }}
                >
                  <button
                    onClick={() => {
                      onApply(preset)
                      setOpen(false)
                    }}
                    style={{
                      flex: 1,
                      padding: '9px 12px',
                      textAlign: 'left',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '13px',
                      color: theme.textPrimary,
                      fontFamily: 'inherit',
                    }}
                    onMouseEnter={(e) => {
                      const row = e.currentTarget.parentElement
                      if (row) row.style.background = theme.bgSurfaceHover ?? theme.border
                    }}
                    onMouseLeave={(e) => {
                      const row = e.currentTarget.parentElement
                      if (row) row.style.background = 'transparent'
                    }}
                  >
                    {preset.name}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onDelete(preset.id)
                    }}
                    title="Delete preset"
                    style={{
                      padding: '8px 10px',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: theme.textMuted,
                      display: 'flex',
                      alignItems: 'center',
                      flexShrink: 0,
                    }}
                    onMouseEnter={(e) => {
                      ;(e.currentTarget as HTMLButtonElement).style.color = theme.danger
                    }}
                    onMouseLeave={(e) => {
                      ;(e.currentTarget as HTMLButtonElement).style.color = theme.textMuted
                    }}
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                    >
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div
              style={{
                padding: '16px 12px',
                fontSize: '12px',
                color: theme.textMuted,
                textAlign: 'center',
                fontStyle: 'italic',
              }}
            >
              No saved presets
            </div>
          )}

          {/* Save current filters */}
          <div
            style={{
              padding: '10px 12px',
              borderTop: `1px solid ${theme.border}`,
              background: theme.bgSidebar ?? theme.bgSurface,
            }}
          >
            <div
              style={{
                fontSize: '10px',
                fontWeight: 700,
                color: theme.textMuted,
                textTransform: 'uppercase',
                letterSpacing: '0.07em',
                marginBottom: '6px',
              }}
            >
              Save current filters
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <input
                ref={inputRef}
                value={saveName}
                onChange={(e) => {
                  setSaveName(e.target.value)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSave()
                  else if (e.key === 'Escape') setOpen(false)
                }}
                placeholder="Name this preset…"
                maxLength={50}
                style={{
                  flex: 1,
                  padding: '6px 8px',
                  borderRadius: '7px',
                  fontSize: '12px',
                  background: theme.bgSurface,
                  border: `1px solid ${theme.border}`,
                  color: theme.textPrimary,
                  outline: 'none',
                  fontFamily: 'inherit',
                }}
              />
              <button
                onClick={handleSave}
                disabled={!saveName.trim()}
                style={{
                  padding: '6px 10px',
                  borderRadius: '7px',
                  fontSize: '12px',
                  fontWeight: 600,
                  background: saveName.trim() ? theme.accent : theme.border,
                  color: saveName.trim() ? '#fff' : theme.textMuted,
                  border: 'none',
                  cursor: saveName.trim() ? 'pointer' : 'not-allowed',
                  whiteSpace: 'nowrap',
                  fontFamily: 'inherit',
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
