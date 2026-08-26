import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useTheme } from '../../theme/ThemeContext'

export interface SearchableSelectOption {
  value: string
  label: string
  sublabel?: string
  // A second line shown under the label (in the trigger and the dropdown
  // list) and also matched by search — e.g. an Arabic translation. Kept
  // separate from sublabel, which is a short-code badge (SKU, employee
  // number) rather than a full line of text.
  keywords?: string
}

interface Props {
  value: string
  onChange: (value: string) => void
  options: SearchableSelectOption[]
  placeholder?: string
  label?: string
  error?: string
  required?: boolean
  disabled?: boolean
  minDropdownWidth?: number
}

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = 'Search…',
  label,
  error,
  required,
  disabled,
  minDropdownWidth = 260,
}: Props) {
  const { theme, themeKey } = useTheme()
  const isDark = themeKey === 'black'

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({})
  const triggerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [highlighted, setHighlighted] = useState(0)

  const selected = options.find((o) => o.value === value)

  const filtered = query.trim()
    ? options.filter(
        (o) =>
          o.label.toLowerCase().includes(query.toLowerCase()) ||
          (o.sublabel ?? '').toLowerCase().includes(query.toLowerCase()) ||
          (o.keywords ?? '').toLowerCase().includes(query.toLowerCase()),
      )
    : options

  useEffect(() => {
    setHighlighted(0)
  }, [query])

  // Position the portal dropdown — flips upward when insufficient space below
  const reposition = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const MARGIN = 8
    const MAX_HEIGHT = 320
    const spaceBelow = window.innerHeight - rect.bottom - MARGIN
    const spaceAbove = rect.top - MARGIN
    const openUpward = spaceBelow < 200 && spaceAbove > spaceBelow
    const availableHeight = openUpward
      ? Math.min(MAX_HEIGHT, spaceAbove)
      : Math.min(MAX_HEIGHT, spaceBelow)
    const dropWidth = Math.max(rect.width, minDropdownWidth)
    // Keep left edge inside viewport
    const left = Math.min(rect.left, window.innerWidth - dropWidth - MARGIN)
    setDropdownStyle(
      openUpward
        ? {
            position: 'fixed',
            bottom: window.innerHeight - rect.top + MARGIN,
            left,
            width: dropWidth,
            maxHeight: availableHeight,
            zIndex: 9999,
          }
        : {
            position: 'fixed',
            top: rect.bottom + MARGIN,
            left,
            width: dropWidth,
            maxHeight: availableHeight,
            zIndex: 9999,
          },
    )
  }, [minDropdownWidth])

  useEffect(() => {
    if (!open) return
    reposition()
    setTimeout(() => inputRef.current?.focus(), 0)
  }, [open, reposition])

  useEffect(() => {
    if (!open) return
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [open, reposition])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      const target = e.target as Node
      if (triggerRef.current?.contains(target)) return
      if (listRef.current?.contains(target)) return
      setOpen(false)
      setQuery('')
    }
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('mousedown', onDown)
    }
  }, [open])

  // Scroll highlighted item into view
  useEffect(() => {
    if (!listRef.current) return
    const item = listRef.current.querySelector<HTMLDivElement>(`[data-idx="${highlighted}"]`)
    item?.scrollIntoView({ block: 'nearest' })
  }, [highlighted])

  const select = useCallback(
    (opt: SearchableSelectOption) => {
      onChange(opt.value)
      setOpen(false)
      setQuery('')
    },
    [onChange],
  )

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        setOpen(true)
        e.preventDefault()
      }
      return
    }
    if (e.key === 'ArrowDown') {
      setHighlighted((h) => Math.min(h + 1, filtered.length - 1))
      e.preventDefault()
    } else if (e.key === 'ArrowUp') {
      setHighlighted((h) => Math.max(h - 1, 0))
      e.preventDefault()
    } else if (e.key === 'Enter') {
      if (filtered[highlighted]) select(filtered[highlighted])
      e.preventDefault()
    } else if (e.key === 'Escape') {
      setOpen(false)
      setQuery('')
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      {label && (
        <label
          style={{
            display: 'block',
            fontSize: '12px',
            color: error ? theme.danger : theme.textSecondary,
            marginBottom: '4px',
            fontWeight: 500,
          }}
        >
          {label}
          {required && <span style={{ color: theme.danger }}> *</span>}
        </label>
      )}

      {/* Trigger */}
      <div
        ref={triggerRef}
        tabIndex={disabled ? -1 : 0}
        onClick={() => {
          if (disabled) return
          setOpen((o) => !o)
        }}
        onKeyDown={handleKeyDown}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: selected?.keywords ? '6px 10px' : '0 10px',
          minHeight: '36px',
          borderRadius: '6px',
          cursor: disabled ? 'not-allowed' : 'pointer',
          border: `1px solid ${error ? theme.dangerBorder : open ? theme.accent : theme.borderInput}`,
          background: theme.bgSurface,
          opacity: disabled ? 0.5 : 1,
          userSelect: 'none',
          outline: 'none',
        }}
      >
        {selected ? (
          <span style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, gap: '2px' }}>
            {selected.sublabel ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                <span
                  style={{
                    fontFamily: 'monospace',
                    fontSize: '11px',
                    color: theme.textMuted,
                    background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
                    padding: '1px 5px',
                    borderRadius: '3px',
                    flexShrink: 0,
                  }}
                >
                  {selected.sublabel}
                </span>
                <span
                  style={{
                    fontSize: '13px',
                    color: theme.textPrimary,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {selected.label}
                </span>
              </span>
            ) : (
              <span
                style={{
                  fontSize: '13px',
                  color: theme.textPrimary,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {selected.label}
              </span>
            )}
            {selected.keywords && (
              <span
                dir="rtl"
                style={{
                  fontSize: '13px',
                  color: theme.textMuted,
                  textAlign: 'left',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {selected.keywords}
              </span>
            )}
          </span>
        ) : (
          <span
            style={{
              fontSize: '13px',
              color: theme.textMuted,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
            }}
          >
            {placeholder}
          </span>
        )}
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          style={{
            flexShrink: 0,
            marginLeft: '6px',
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.15s',
          }}
        >
          <path
            d="M2 4l4 4 4-4"
            stroke={theme.textMuted}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      {error && (
        <span style={{ fontSize: '11px', color: theme.danger, marginTop: '2px', display: 'block' }}>
          {error}
        </span>
      )}

      {/* Portal dropdown — escapes Card overflow:hidden */}
      {open &&
        createPortal(
          <div
            ref={listRef}
            style={{
              ...dropdownStyle,
              background: isDark ? '#1e2030' : '#ffffff',
              border: `1px solid ${theme.border}`,
              borderRadius: '8px',
              boxShadow: '0 8px 28px rgba(0,0,0,0.22)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Search input */}
            <div
              style={{ padding: '8px', borderBottom: `1px solid ${theme.border}`, flexShrink: 0 }}
            >
              <div style={{ position: 'relative' }}>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={theme.textMuted}
                  strokeWidth="2"
                  style={{
                    position: 'absolute',
                    left: '8px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    pointerEvents: 'none',
                  }}
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value)
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="Search…"
                  style={{
                    width: '100%',
                    padding: '6px 8px 6px 28px',
                    fontSize: '13px',
                    border: `1px solid ${theme.border}`,
                    borderRadius: '6px',
                    background: isDark ? '#12131f' : '#f0f2f5',
                    color: theme.textPrimary,
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            {/* Options list */}
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {filtered.length === 0 ? (
                <div
                  style={{
                    padding: '12px',
                    fontSize: '13px',
                    color: theme.textMuted,
                    textAlign: 'center',
                  }}
                >
                  No results
                </div>
              ) : (
                filtered.map((opt, idx) => {
                  const isCustom = opt.value === ''
                  const isSelected = opt.value === value
                  const isHighlighted = idx === highlighted
                  return (
                    <div
                      key={opt.value}
                      data-idx={idx}
                      onMouseEnter={() => {
                        setHighlighted(idx)
                      }}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        select(opt)
                      }}
                      style={{
                        padding: '8px 12px',
                        cursor: 'pointer',
                        borderBottom: isCustom ? `1px solid ${theme.border}` : 'none',
                        background: isHighlighted
                          ? isDark
                            ? 'rgba(255,255,255,0.07)'
                            : 'rgba(0,0,0,0.05)'
                          : isSelected
                            ? isDark
                              ? 'rgba(99,102,241,0.15)'
                              : 'rgba(99,102,241,0.08)'
                            : 'transparent',
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        {opt.sublabel ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span
                              style={{
                                fontFamily: 'monospace',
                                fontSize: '11px',
                                color: isSelected ? theme.accent : theme.textMuted,
                                background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
                                padding: '1px 6px',
                                borderRadius: '4px',
                                flexShrink: 0,
                              }}
                            >
                              {opt.sublabel}
                            </span>
                            <span
                              style={{
                                fontSize: '13px',
                                color: isSelected
                                  ? theme.accent
                                  : isDark
                                    ? theme.textPrimary
                                    : '#1a1a2e',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {opt.label}
                            </span>
                          </div>
                        ) : (
                          <span
                            style={{
                              fontSize: '13px',
                              fontStyle: isCustom ? 'italic' : 'normal',
                              color: isSelected
                                ? theme.accent
                                : isCustom
                                  ? theme.textMuted
                                  : isDark
                                    ? theme.textPrimary
                                    : '#1a1a2e',
                            }}
                          >
                            {opt.label}
                          </span>
                        )}
                        {opt.keywords && (
                          <span
                            dir="rtl"
                            style={{
                              fontSize: '13px',
                              textAlign: 'left',
                              color: isSelected ? theme.accent : theme.textMuted,
                            }}
                          >
                            {opt.keywords}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
