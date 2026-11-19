import i18n, { isRtl, useIsRtl } from '../../i18n'
import { useTranslation } from 'react-i18next'
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTheme } from '../../theme/ThemeContext'
import { fieldControlStyle, fieldRestingBorder } from './fieldStyles'
import { isKeyboardFocus } from './keyboardFocus'
import { menuFocusRing, menuPanelStyle } from './menuStyles'

interface DatePickerProps {
  value?: string
  onChange?: (date: string) => void
  label?: string
  error?: string
  min?: string
  max?: string
  disabled?: boolean
  placeholder?: string
  className?: string
  /** Opt-in: the box of the newer form controls (40 px, 10 px corners, the readable edge). */
  field?: boolean
}

const EN_DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// English keeps the compact labels; other languages use the platform's localized names.
function localizedMonths(): string[] {
  if (!isRtl(i18n.resolvedLanguage)) return EN_MONTHS
  const f = new Intl.DateTimeFormat(i18n.resolvedLanguage, { month: 'short' })
  return Array.from({ length: 12 }, (_, m) => f.format(new Date(2024, m, 1)))
}
function localizedDays(): string[] {
  if (!isRtl(i18n.resolvedLanguage)) return EN_DAYS
  const f = new Intl.DateTimeFormat(i18n.resolvedLanguage, { weekday: 'narrow' })
  return Array.from({ length: 7 }, (_, d) => f.format(new Date(2024, 0, 7 + d)))
}

const PANEL_WIDTH = 296
const PANEL_HEIGHT = 372 // about what the panel needs; decides whether it opens upward
const EDGE = 8
const GAP = 6

// "YYYY-MM-DD" read as numbers: `new Date('2026-11-17')` is midnight UTC, which is the day before in a negative offset.
function monthOf(value: string | undefined): { year: number; month: number } {
  const m = /^(\d{4})-(\d{2})/.exec(value ?? '')
  if (m) return { year: Number(m[1]), month: Number(m[2]) - 1 }
  const d = new Date()
  return { year: d.getFullYear(), month: d.getMonth() }
}

function isoOf(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

interface PanelPlace {
  left: number
  top?: number
  bottom?: number
}

export function DatePicker({
  value,
  onChange,
  label,
  error,
  min,
  max,
  disabled = false,
  placeholder = 'YYYY-MM-DD',
  className = '',
  field = false,
}: DatePickerProps) {
  const { t } = useTranslation()
  const { theme, themeKey } = useTheme()
  const rtl = useIsRtl()
  const isDark = themeKey === 'black'
  const [open, setOpen] = useState(false)
  const [viewDate, setViewDate] = useState(() => monthOf(value))
  const [place, setPlace] = useState<PanelPlace | null>(null)
  const [hoverDay, setHoverDay] = useState<string | null>(null)
  const [inputFocused, setInputFocused] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const reposition = useCallback(() => {
    const box = boxRef.current
    if (!box) return
    const r = box.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const width = Math.min(PANEL_WIDTH, vw - 2 * EDGE)
    // the panel's near edge lines up with the field's: left edge in English, right edge in Arabic
    const wanted = rtl ? r.right - width : r.left
    const left = Math.max(EDGE, Math.min(wanted, vw - width - EDGE))
    const below = vh - r.bottom - EDGE - GAP
    const above = r.top - EDGE - GAP
    setPlace(
      below < PANEL_HEIGHT && above > below
        ? { left, bottom: vh - r.top + GAP }
        : { left, top: r.bottom + GAP },
    )
  }, [rtl])

  useLayoutEffect(() => {
    if (open) reposition()
  }, [open, reposition])

  useEffect(() => {
    if (!open) return
    const closeOnOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (rootRef.current?.contains(target) === true || panelRef.current?.contains(target) === true)
        return
      setOpen(false)
    }
    const follow = (e: Event) => {
      if (e.target instanceof Node && panelRef.current?.contains(e.target)) return
      reposition()
    }
    document.addEventListener('mousedown', closeOnOutside)
    window.addEventListener('resize', follow)
    window.addEventListener('scroll', follow, true)
    return () => {
      document.removeEventListener('mousedown', closeOnOutside)
      window.removeEventListener('resize', follow)
      window.removeEventListener('scroll', follow, true)
    }
  }, [open, reposition])

  const firstDay = new Date(viewDate.year, viewDate.month, 1).getDay()
  const daysInMonth = new Date(viewDate.year, viewDate.month + 1, 0).getDate()

  const cells: (number | null)[] = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const outOfRange = (iso: string) => (!!min && iso < min) || (!!max && iso > max)

  function pick(iso: string) {
    if (outOfRange(iso)) return
    onChange?.(iso)
    setOpen(false)
    inputRef.current?.focus()
  }

  function step(by: number) {
    setViewDate((v) => {
      const m = v.month + by
      if (m < 0) return { year: v.year - 1, month: 11 }
      if (m > 11) return { year: v.year + 1, month: 0 }
      return { ...v, month: m }
    })
  }

  const now = new Date()
  const todayIso = isoOf(now.getFullYear(), now.getMonth(), now.getDate())
  const dayName = new Intl.DateTimeFormat(i18n.resolvedLanguage, { dateStyle: 'full' })

  // ‹ and › are mirrored by the browser in a right-to-left page, so "previous" already points the way the page reads;
  // swapping them here as well would flip them back (playbook #104).
  const prevGlyph = '‹'
  const nextGlyph = '›'
  const navButton: React.CSSProperties = {
    width: '32px',
    height: '32px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    border: 'none',
    borderRadius: '8px',
    color: theme.textSecondary,
    cursor: 'pointer',
    fontSize: '20px',
    lineHeight: 1,
    fontFamily: 'inherit',
  }

  return (
    <div
      ref={rootRef}
      className={className}
      style={{ display: 'flex', flexDirection: 'column', gap: '4px', position: 'relative' }}
    >
      {label && (
        <label
          style={{
            fontSize: '12px',
            fontWeight: 500,
            color: error ? theme.danger : theme.textSecondary,
          }}
        >
          {label}
        </label>
      )}
      <div ref={boxRef} style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <input
          ref={inputRef}
          type="text"
          value={value ?? ''}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange?.(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          readOnly
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => {
            if (disabled) return
            // open on the month of the chosen date, not the month that was last browsed
            if (!open) setViewDate(monthOf(value))
            setOpen((v) => !v)
          }}
          onKeyDown={(e) => {
            if (disabled) return
            if (e.key === 'Escape' && open) {
              e.preventDefault()
              e.stopPropagation()
              setOpen(false)
            } else if ((e.key === 'Enter' || e.key === 'ArrowDown') && !open) {
              e.preventDefault()
              setViewDate(monthOf(value))
              setOpen(true)
            }
          }}
          onFocus={(e) => {
            setInputFocused(isKeyboardFocus(e.currentTarget))
          }}
          onBlur={() => {
            setInputFocused(false)
          }}
          style={
            field
              ? {
                  ...fieldControlStyle(theme, { error: !!error, rtl, dark: isDark }),
                  paddingInlineEnd: '38px',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  borderColor:
                    open || inputFocused ? theme.accent : fieldRestingBorder(theme, !!error),
                  boxShadow: inputFocused && !open ? menuFocusRing(theme) : 'none',
                }
              : {
                  height: '36px',
                  paddingBlock: 0,
                  paddingInlineStart: '12px',
                  paddingInlineEnd: '36px',
                  fontSize: '13px',
                  background: theme.bgSurface,
                  border: `1px solid ${error ? theme.dangerBorder : open || inputFocused ? theme.accent : theme.borderInput}`,
                  borderRadius: '8px',
                  color: theme.textPrimary,
                  fontFamily: 'inherit',
                  outline: 'none',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  width: '100%',
                  boxShadow: inputFocused && !open ? menuFocusRing(theme) : 'none',
                }
          }
        />
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke={theme.textSecondary}
          strokeWidth="2"
          aria-hidden="true"
          style={{ position: 'absolute', insetInlineEnd: '12px', pointerEvents: 'none' }}
        >
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      </div>
      {error && <span style={{ fontSize: '11px', color: theme.danger }}>{error}</span>}
      {open &&
        place &&
        // At the end of <body>, so a card or a dialog around the field cannot clip the calendar.
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label={label ?? t('ui.datePicker.chooseDate')}
            data-menu-panel
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation()
                setOpen(false)
                inputRef.current?.focus()
              }
            }}
            style={{
              ...menuPanelStyle(theme, isDark),
              position: 'fixed',
              top: place.top,
              bottom: place.bottom,
              left: place.left,
              width: Math.min(PANEL_WIDTH, window.innerWidth - 2 * EDGE),
              zIndex: 9999,
              padding: '12px',
              animation: 'fnc-menu-in 0.12s ease-out',
              transformOrigin: place.bottom !== undefined ? 'bottom center' : 'top center',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '8px',
              }}
            >
              <button
                type="button"
                aria-label={t('ui.datePicker.previousMonth')}
                onClick={() => {
                  step(-1)
                }}
                style={navButton}
              >
                {prevGlyph}
              </button>
              <span style={{ fontSize: '14px', fontWeight: 600, color: theme.textPrimary }}>
                {localizedMonths()[viewDate.month]} {viewDate.year}
              </span>
              <button
                type="button"
                aria-label={t('ui.datePicker.nextMonth')}
                onClick={() => {
                  step(1)
                }}
                style={navButton}
              >
                {nextGlyph}
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
              {localizedDays().map((d, i) => (
                <div
                  key={`${d}-${i}`}
                  style={{
                    textAlign: 'center',
                    fontSize: '11px',
                    color: theme.textSecondary,
                    padding: '4px 0 6px',
                    fontWeight: 600,
                  }}
                >
                  {d}
                </div>
              ))}
              {cells.map((cell, idx) => {
                if (cell === null) return <div key={`blank-${idx}`} />
                const iso = isoOf(viewDate.year, viewDate.month, cell)
                const isSelected = iso === value
                const isToday = iso === todayIso
                const blocked = outOfRange(iso)
                return (
                  <button
                    key={iso}
                    type="button"
                    disabled={blocked}
                    aria-label={dayName.format(new Date(viewDate.year, viewDate.month, cell))}
                    aria-pressed={isSelected}
                    onMouseEnter={() => {
                      setHoverDay(iso)
                    }}
                    onMouseLeave={() => {
                      setHoverDay((h) => (h === iso ? null : h))
                    }}
                    onClick={() => {
                      pick(iso)
                    }}
                    style={{
                      height: '36px',
                      borderRadius: '8px',
                      fontSize: '13px',
                      fontWeight: isSelected ? 700 : 500,
                      // the chosen day is the one solid colour; today is outlined so the two are never confused
                      border: `1px solid ${isToday && !isSelected ? theme.accent : 'transparent'}`,
                      background: isSelected
                        ? theme.accentSolid
                        : hoverDay === iso && !blocked
                          ? theme.accentBg
                          : 'transparent',
                      color: isSelected
                        ? theme.accentSolidText
                        : isToday
                          ? theme.accentSolid
                          : theme.textPrimary,
                      opacity: blocked ? 0.35 : 1,
                      cursor: blocked ? 'not-allowed' : 'pointer',
                      fontFamily: 'inherit',
                      padding: 0,
                    }}
                  >
                    {cell}
                  </button>
                )
              })}
            </div>
            <div
              style={{
                borderTop: `1px solid ${theme.border}`,
                marginTop: '10px',
                paddingTop: '8px',
                display: 'flex',
                justifyContent: 'flex-start',
              }}
            >
              <button
                type="button"
                disabled={outOfRange(todayIso)}
                onClick={() => {
                  pick(todayIso)
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: '4px 2px',
                  fontSize: '12px',
                  fontWeight: 600,
                  fontFamily: 'inherit',
                  color: theme.accentSolid,
                  cursor: outOfRange(todayIso) ? 'not-allowed' : 'pointer',
                  opacity: outOfRange(todayIso) ? 0.4 : 1,
                }}
              >
                {t('ui.datePicker.today')}
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
