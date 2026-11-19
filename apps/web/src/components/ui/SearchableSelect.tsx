import { useTranslation } from 'react-i18next'
import { Fragment, useState, useRef, useEffect, useLayoutEffect, useCallback, useId } from 'react'
import { createPortal } from 'react-dom'
import { useTheme } from '../../theme/ThemeContext'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import { isKeyboardFocus } from './keyboardFocus'
import { menuFocusRing, menuItemStyle, menuPanelStyle, menuSeparatorStyle } from './menuStyles'

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
  /**
   * Opt-in: draw the box like the newer form controls (40 px, 10 px corners, the darker field border) so it lines
   * up with `QuantityStepper` and `MoneyField` beside it. Off, nothing changes for the screens that already use it.
   */
  field?: boolean
  /**
   * The most options drawn at once (default 200). Search always looks through ALL of them, so nothing becomes
   * unreachable; only the list on screen is cut, and a line under it says how many there are. Without a cap a product
   * picker drew all 6,909 products (about 2 seconds to open) and re-drew every one of them on each mouse move.
   */
  maxVisible?: number
}

// Enough to scroll through for a short list (employees, branches), few enough that a list of thousands opens at once.
const DEFAULT_MAX_VISIBLE = 200

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder,
  label,
  error,
  required,
  disabled,
  minDropdownWidth = 260,
  field = false,
  maxVisible = DEFAULT_MAX_VISIBLE,
}: Props) {
  const { t } = useTranslation()
  const { theme, themeKey } = useTheme()
  const { isPhone } = useBreakpoint()
  const isDark = themeKey === 'black'
  const listId = useId()

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({})
  const [triggerFocused, setTriggerFocused] = useState(false)
  const triggerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const listboxRef = useRef<HTMLDivElement>(null)
  const [highlighted, setHighlighted] = useState(0)

  const selected = options.find((o) => o.value === value)

  const needle = query.trim() ? query.toLowerCase() : ''
  const filtered = needle
    ? options.filter(
        (o) =>
          o.label.toLowerCase().includes(needle) ||
          (o.sublabel ?? '').toLowerCase().includes(needle) ||
          (o.keywords ?? '').toLowerCase().includes(needle),
      )
    : options
  // Only what fits a screen is drawn; the keyboard and the highlight work on this list.
  const shown = filtered.length > maxVisible ? filtered.slice(0, maxVisible) : filtered
  const hiddenCount = filtered.length - shown.length

  // What the list looked like when it was opened, for the effect that highlights the chosen row (read there, so it
  // does not run again on every keystroke).
  const latest = useRef({ shown, value })
  useEffect(() => {
    latest.current = { shown, value }
  })

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
    // Never wider than the window, so a generous minDropdownWidth can't push the list off a phone
    const dropWidth = Math.min(
      Math.max(rect.width, minDropdownWidth),
      window.innerWidth - 2 * MARGIN,
    )
    // Keep both edges inside the viewport
    const left = Math.max(MARGIN, Math.min(rect.left, window.innerWidth - dropWidth - MARGIN))
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

  // Placed before the browser paints, so the list never flashes in the wrong spot.
  useLayoutEffect(() => {
    if (open) reposition()
  }, [open, reposition])

  useEffect(() => {
    if (!open) return
    // Start on the chosen row (it is scrolled into view below), or on the first one when nothing is chosen.
    const at = latest.current.shown.findIndex((o) => o.value === latest.current.value)
    setHighlighted(at > 0 ? at : 0)
    setTimeout(() => inputRef.current?.focus(), 0)
  }, [open])

  useEffect(() => {
    if (!open) return
    // Scrolling the list itself must not move it (and must not re-draw every row on each wheel tick).
    const follow = (e: Event) => {
      if (e.target instanceof Node && listRef.current?.contains(e.target)) return
      reposition()
    }
    window.addEventListener('scroll', follow, true)
    window.addEventListener('resize', reposition)
    return () => {
      window.removeEventListener('scroll', follow, true)
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

  // Keep the highlighted row inside the visible part of the list. Done by measuring the list's own scroll box, not with
  // `scrollIntoView`, which would also scroll the page behind it.
  useEffect(() => {
    const box = listboxRef.current
    if (!box) return
    const item = box.querySelector<HTMLDivElement>(`[data-idx="${highlighted}"]`)
    if (!item) return
    const b = box.getBoundingClientRect()
    const r = item.getBoundingClientRect()
    const pad = 6
    if (r.top < b.top + pad) box.scrollTop -= b.top + pad - r.top
    else if (r.bottom > b.bottom - pad) box.scrollTop += r.bottom - (b.bottom - pad)
  }, [highlighted])

  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
    // The list was drawn at the end of <body>, so focus would otherwise be lost: give it back to the field.
    triggerRef.current?.focus()
  }, [])

  const select = useCallback(
    (opt: SearchableSelectOption) => {
      onChange(opt.value)
      close()
    },
    [onChange, close],
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
      setHighlighted((h) => Math.min(h + 1, shown.length - 1))
      e.preventDefault()
    } else if (e.key === 'ArrowUp') {
      setHighlighted((h) => Math.max(h - 1, 0))
      e.preventDefault()
    } else if (e.key === 'Enter') {
      if (shown[highlighted]) select(shown[highlighted])
      e.preventDefault()
    } else if (e.key === 'Escape') {
      // The key closed this list and nothing else: a modal around it must stay open (it holds what was typed).
      e.preventDefault()
      e.stopPropagation()
      close()
    } else if (e.key === 'Tab') {
      // Leave the list the way a native select does: close it and let Tab go on from the field.
      close()
    }
  }

  const upward = dropdownStyle.bottom !== undefined
  const rowHeightTouch = isPhone
  const optionId = (idx: number) => `${listId}-opt-${idx}`

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
        role="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-disabled={disabled ? true : undefined}
        tabIndex={disabled ? -1 : 0}
        onClick={() => {
          if (disabled) return
          setOpen((o) => !o)
        }}
        onKeyDown={handleKeyDown}
        onFocus={(e) => {
          setTriggerFocused(isKeyboardFocus(e.currentTarget))
        }}
        onBlur={() => {
          setTriggerFocused(false)
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: selected?.keywords ? '6px 10px' : field ? '0 12px' : '0 10px',
          minHeight: field ? '40px' : '36px',
          borderRadius: field ? '10px' : '6px',
          cursor: disabled ? 'not-allowed' : 'pointer',
          border: `1px solid ${error ? theme.dangerBorder : open || triggerFocused ? theme.accent : field ? theme.borderField : theme.borderInput}`,
          boxShadow: triggerFocused && !open ? menuFocusRing(theme) : 'none',
          background: theme.bgSurface,
          opacity: disabled ? 0.5 : 1,
          userSelect: 'none',
          outline: 'none',
        }}
      >
        {selected ? (
          <span
            style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, gap: '2px' }}
          >
            {selected.sublabel ? (
              <span
                style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}
              >
                <span
                  style={{
                    fontFamily: 'monospace',
                    fontSize: '11px',
                    color: theme.textSecondary,
                    background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                    padding: '1px 6px',
                    borderRadius: '4px',
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
                  <bdi>{selected.label}</bdi>
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
                <bdi>{selected.label}</bdi>
              </span>
            )}
            {selected.keywords && (
              // The block follows the page's direction (so the line starts under the name in English and in Arabic);
              // only the text inside it runs right to left.
              <span
                style={{
                  display: 'block',
                  fontSize: '13px',
                  lineHeight: 1.5,
                  color: theme.textSecondary,
                  textAlign: 'start',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                <span dir="rtl">{selected.keywords}</span>
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
            {placeholder ?? t('ui.select.search')}
          </span>
        )}
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          aria-hidden="true"
          style={{
            flexShrink: 0,
            marginInlineStart: '6px',
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
            data-menu-panel
            style={{
              ...dropdownStyle,
              ...menuPanelStyle(theme, isDark),
              display: 'flex',
              flexDirection: 'column',
              transformOrigin: upward ? 'bottom center' : 'top center',
              animation: 'fnc-menu-in 0.12s ease-out',
            }}
          >
            {/* Search input */}
            <div
              style={{
                padding: '8px',
                borderBottom: `1px solid ${theme.border}`,
                flexShrink: 0,
              }}
            >
              <div style={{ position: 'relative' }}>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={theme.textSecondary}
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    insetInlineStart: '11px',
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
                  // Drawn on the element itself (not in state): the box is focused by a timer right after the list
                  // opens, and a state change there would re-draw every row for a colour.
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = theme.accent
                    e.currentTarget.style.boxShadow = menuFocusRing(theme)
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = theme.borderInput
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                  placeholder={t('ui.select.search')}
                  aria-label={t('ui.select.search')}
                  aria-controls={listId}
                  aria-activedescendant={shown.length > 0 ? optionId(highlighted) : undefined}
                  style={{
                    width: '100%',
                    height: rowHeightTouch ? '44px' : '38px',
                    paddingBlock: '0',
                    paddingInlineEnd: '10px',
                    paddingInlineStart: '34px',
                    fontSize: '13px',
                    fontFamily: 'inherit',
                    border: `1px solid ${theme.borderInput}`,
                    borderRadius: '8px',
                    background: theme.bgCanvas,
                    color: theme.textPrimary,
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            {/* Options list */}
            <div
              ref={listboxRef}
              id={listId}
              role="listbox"
              aria-label={label ?? placeholder ?? t('ui.select.search')}
              style={{
                overflowY: 'auto',
                flex: 1,
                padding: '6px',
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
              }}
            >
              {filtered.length === 0 ? (
                <div
                  style={{
                    padding: '20px 12px',
                    fontSize: '13px',
                    color: theme.textSecondary,
                    textAlign: 'center',
                  }}
                >
                  {t('ui.select.noResults')}
                </div>
              ) : (
                shown.map((opt, idx) => {
                  // The row with no value is "nothing chosen" (Select..., Custom item): it is never drawn as a pick.
                  const isCustom = opt.value === ''
                  const isSelected = opt.value === value && !isCustom
                  const isHighlighted = idx === highlighted
                  const base = menuItemStyle(theme, {
                    highlighted: isHighlighted,
                    selected: isSelected,
                    touch: rowHeightTouch,
                  })
                  return (
                    <Fragment key={opt.value}>
                      <div
                        id={optionId(idx)}
                        role="option"
                        aria-selected={isSelected}
                        data-idx={idx}
                        onMouseEnter={() => {
                          setHighlighted(idx)
                        }}
                        onMouseDown={(e) => {
                          e.preventDefault()
                          select(opt)
                        }}
                        style={{
                          ...base,
                          // a long list scrolls: rows keep their height instead of being squeezed
                          flexShrink: 0,
                          ...(isCustom
                            ? { color: theme.textSecondary, fontStyle: 'italic' }
                            : null),
                        }}
                      >
                        <div
                          style={{
                            flex: 1,
                            minWidth: 0,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '2px',
                          }}
                        >
                          {opt.sublabel ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span
                                style={{
                                  fontFamily: 'monospace',
                                  fontSize: '11px',
                                  fontWeight: 500,
                                  color: isSelected ? theme.accentSolid : theme.textSecondary,
                                  background: isDark
                                    ? 'rgba(255,255,255,0.08)'
                                    : 'rgba(0,0,0,0.05)',
                                  padding: '1px 6px',
                                  borderRadius: '4px',
                                  flexShrink: 0,
                                }}
                              >
                                {opt.sublabel}
                              </span>
                              <span
                                style={{
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {/* bdi: an English name keeps its own punctuation order inside a right-to-left row */}
                                <bdi>{opt.label}</bdi>
                              </span>
                            </div>
                          ) : (
                            <span>
                              <bdi>{opt.label}</bdi>
                            </span>
                          )}
                          {opt.keywords && (
                            <span
                              style={{
                                display: 'block',
                                fontSize: '13px',
                                fontWeight: 400,
                                lineHeight: 1.5,
                                textAlign: 'start',
                                color: isSelected ? theme.accentSolid : theme.textSecondary,
                              }}
                            >
                              <span dir="rtl">{opt.keywords}</span>
                            </span>
                          )}
                        </div>
                        {isSelected && (
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 16 16"
                            fill="none"
                            aria-hidden="true"
                            style={{ flexShrink: 0 }}
                          >
                            <path
                              d="M3 8.5l3.2 3.2L13 4.8"
                              stroke={theme.accentSolid}
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                      </div>
                      {isCustom && <div aria-hidden="true" style={menuSeparatorStyle(theme)} />}
                    </Fragment>
                  )
                })
              )}
            </div>
            {/* Always in view under the list (not at the end of it, where nobody scrolls to): why the list stops. */}
            {hiddenCount > 0 && (
              <div
                data-testid="select-truncated"
                style={{
                  flexShrink: 0,
                  padding: '8px 14px',
                  fontSize: '12px',
                  color: theme.textSecondary,
                  borderTop: `1px solid ${theme.border}`,
                }}
              >
                {t('ui.select.showingFirst', {
                  shown: shown.length.toLocaleString(),
                  total: filtered.length.toLocaleString(),
                })}
              </div>
            )}
          </div>,
          document.body,
        )}
    </div>
  )
}
