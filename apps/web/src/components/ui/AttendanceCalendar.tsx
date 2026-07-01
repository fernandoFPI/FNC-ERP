import React, { useState } from 'react'
import { useTheme } from '../../theme/ThemeContext'

interface PunchSummary {
  type: 'in' | 'out'
  punchedAt: string
  isValid: boolean
  locationName?: string
}

interface AttendanceDaySummary {
  date: string
  punches: PunchSummary[]
  hoursWorked?: number
  hasOvertime: boolean
  isAbsent: boolean
  isWeekend: boolean
  isLeave: boolean
  leaveTypeName?: string
}

interface AttendanceCalendarProps {
  month: Date
  days: AttendanceDaySummary[]
  onDayClick: (date: string) => void
  loading?: boolean
  onMonthChange?: (month: Date) => void
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function getDaysInMonth(year: number, month: number): Date[] {
  const first = new Date(year, month, 1)
  const startDow = (first.getDay() + 6) % 7 // 0=Mon
  const days: Date[] = []
  for (let i = 0; i < startDow; i++) days.push(new Date(0))
  const last = new Date(year, month + 1, 0).getDate()
  for (let d = 1; d <= last; d++) days.push(new Date(year, month, d))
  return days
}

function fmt(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function AttendanceCalendar({ month, days, onDayClick, loading = false, onMonthChange }: AttendanceCalendarProps) {
  const { theme } = useTheme()
  const [hoverDate, setHoverDate] = useState<string | null>(null)

  const cells = getDaysInMonth(month.getFullYear(), month.getMonth())
  const byDate: Record<string, AttendanceDaySummary> = {}
  days.forEach((d) => { byDate[d.date] = d })

  const monthLabel = month.toLocaleString('default', { month: 'long', year: 'numeric' })

  function prevMonth() {
    onMonthChange?.(new Date(month.getFullYear(), month.getMonth() - 1, 1))
  }
  function nextMonth() {
    onMonthChange?.(new Date(month.getFullYear(), month.getMonth() + 1, 1))
  }

  if (loading) {
    return (
      <div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
          {Array.from({ length: 35 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: '60px', borderRadius: '8px' }} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <button onClick={prevMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted, fontSize: '18px', padding: '4px 8px' }}>‹</button>
        <span style={{ fontWeight: 600, color: theme.textPrimary, fontSize: '15px' }}>{monthLabel}</span>
        <button onClick={nextMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted, fontSize: '18px', padding: '4px 8px' }}>›</button>
      </div>

      {/* Day labels */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '4px' }}>
        {DAY_LABELS.map((d) => (
          <div key={d} style={{ textAlign: 'center', fontSize: '10px', fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '4px 0' }}>{d}</div>
        ))}
      </div>

      {/* Day cells */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
        {cells.map((cell, i) => {
          if (cell.getTime() === 0) {
            return <div key={`empty-${i}`} />
          }
          const dateStr = fmt(cell)
          const summary = byDate[dateStr]
          const isToday = dateStr === fmt(new Date())
          const isHovered = hoverDate === dateStr

          let dotColor = 'transparent'
          let dotTitle = ''
          if (summary) {
            if (summary.isWeekend) { dotColor = theme.textMuted; dotTitle = 'Weekend' }
            else if (summary.isLeave) { dotColor = theme.info; dotTitle = summary.leaveTypeName ?? 'Leave' }
            else if (summary.isAbsent) { dotColor = theme.danger; dotTitle = 'Absent' }
            else if (summary.hasOvertime) { dotColor = theme.warning; dotTitle = `${summary.hoursWorked?.toFixed(1)} hrs (OT)` }
            else { dotColor = theme.success; dotTitle = `${summary.hoursWorked?.toFixed(1)} hrs` }
          }

          return (
            <div
              key={dateStr}
              onClick={() => summary && onDayClick(dateStr)}
              onMouseEnter={() => setHoverDate(dateStr)}
              onMouseLeave={() => setHoverDate(null)}
              style={{
                position: 'relative',
                height: '60px',
                border: `1px solid ${isToday ? theme.accent : theme.border}`,
                borderRadius: '8px',
                padding: '6px 8px',
                cursor: summary ? 'pointer' : 'default',
                background: isHovered && summary ? theme.tableRowHover : isToday ? theme.accentBg : theme.bgSurface,
                transition: 'background 0.15s',
              }}
            >
              <div style={{ fontSize: '12px', fontWeight: isToday ? 700 : 400, color: isToday ? theme.accent : theme.textSecondary }}>
                {cell.getDate()}
              </div>
              {dotColor !== 'transparent' && (
                <div style={{ position: 'absolute', bottom: '6px', left: '50%', transform: 'translateX(-50%)', width: '7px', height: '7px', borderRadius: '50%', background: dotColor }} />
              )}
              {isHovered && summary && dotTitle && (
                <div style={{
                  position: 'absolute', bottom: '110%', left: '50%', transform: 'translateX(-50%)',
                  background: theme.bgSurface, border: `1px solid ${theme.border}`, borderRadius: '6px',
                  padding: '4px 8px', fontSize: '11px', color: theme.textSecondary,
                  whiteSpace: 'nowrap', zIndex: 10, pointerEvents: 'none',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                }}>
                  {dotTitle}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: '16px', marginTop: '12px', flexWrap: 'wrap' }}>
        {[
          { color: theme.success, label: 'Present' },
          { color: theme.warning, label: 'Overtime' },
          { color: theme.danger, label: 'Absent' },
          { color: theme.info, label: 'On leave' },
          { color: theme.textMuted, label: 'Weekend' },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
            <span style={{ fontSize: '11px', color: theme.textMuted }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
