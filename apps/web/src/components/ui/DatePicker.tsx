import React, { useState, useRef, useEffect } from 'react'
import { Card } from './Card'
import { useTheme } from '../../theme/ThemeContext'

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
}

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export function DatePicker({ value, onChange, label, error, min, max, disabled = false, placeholder = 'YYYY-MM-DD', className = '' }: DatePickerProps) {
  const { theme } = useTheme()
  const [open, setOpen] = useState(false)
  const [viewDate, setViewDate] = useState(() => {
    const d = value ? new Date(value) : new Date()
    return { year: d.getFullYear(), month: d.getMonth() }
  })
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const firstDay = new Date(viewDate.year, viewDate.month, 1).getDay()
  const daysInMonth = new Date(viewDate.year, viewDate.month + 1, 0).getDate()

  const cells: (number | null)[] = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  function selectDay(day: number) {
    const mm = String(viewDate.month + 1).padStart(2, '0')
    const dd = String(day).padStart(2, '0')
    const iso = `${viewDate.year}-${mm}-${dd}`
    if (min && iso < min) return
    if (max && iso > max) return
    onChange?.(iso)
    setOpen(false)
  }

  return (
    <div ref={ref} className={className} style={{ display: 'flex', flexDirection: 'column', gap: '4px', position: 'relative' }}>
      {label && (
        <label style={{ fontSize: '12px', fontWeight: 500, color: error ? theme.danger : theme.textSecondary }}>
          {label}
        </label>
      )}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <input
          type="text"
          value={value ?? ''}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange?.(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          readOnly
          onClick={() => !disabled && setOpen((v) => !v)}
          style={{
            height: '36px',
            padding: '0 36px 0 12px',
            fontSize: '13px',
            background: theme.bgSurface,
            border: `1px solid ${error ? theme.dangerBorder : theme.borderInput}`,
            borderRadius: '8px',
            color: theme.textPrimary,
            fontFamily: 'inherit',
            outline: 'none',
            cursor: disabled ? 'not-allowed' : 'pointer',
            width: '100%',
          }}
        />
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke={theme.textMuted} strokeWidth="2"
          style={{ position: 'absolute', right: '10px', pointerEvents: 'none' }}
        >
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      </div>
      {error && <span style={{ fontSize: '11px', color: theme.danger }}>{error}</span>}
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 600 }}>
          <Card padding="sm" rimHighlight style={{ width: '240px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <button onClick={() => setViewDate(v => {
                const m = v.month - 1
                return m < 0 ? { year: v.year - 1, month: 11 } : { ...v, month: m }
              })} style={{ background: 'none', border: 'none', color: theme.textSecondary, cursor: 'pointer', fontSize: '16px' }}>‹</button>
              <span style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary }}>
                {MONTHS[viewDate.month]} {viewDate.year}
              </span>
              <button onClick={() => setViewDate(v => {
                const m = v.month + 1
                return m > 11 ? { year: v.year + 1, month: 0 } : { ...v, month: m }
              })} style={{ background: 'none', border: 'none', color: theme.textSecondary, cursor: 'pointer', fontSize: '16px' }}>›</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
              {DAYS.map(d => (
                <div key={d} style={{ textAlign: 'center', fontSize: '10px', color: theme.textMuted, padding: '4px 0', fontWeight: 600 }}>{d}</div>
              ))}
              {cells.map((cell, idx) => (
                <div key={idx} style={{ textAlign: 'center' }}>
                  {cell !== null && (
                    <button
                      onClick={() => selectDay(cell)}
                      style={{
                        width: '28px', height: '28px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        border: 'none',
                        background: (() => {
                          const mm = String(viewDate.month + 1).padStart(2, '0')
                          const dd = String(cell).padStart(2, '0')
                          const iso = `${viewDate.year}-${mm}-${dd}`
                          return iso === value ? theme.accentBg : 'none'
                        })(),
                        color: (() => {
                          const mm = String(viewDate.month + 1).padStart(2, '0')
                          const dd = String(cell).padStart(2, '0')
                          const iso = `${viewDate.year}-${mm}-${dd}`
                          return iso === value ? theme.accent : theme.textSecondary
                        })(),
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      {cell}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
