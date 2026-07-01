import { useState } from 'react'
import { useTheme } from '../../theme/ThemeContext'

export interface MaintenanceEvent {
  id: string
  title: string
  date: string
  type: 'scheduled' | 'completed' | 'overdue'
  assetName?: string
}

interface Props {
  events: MaintenanceEvent[]
  onEventClick?: (event: MaintenanceEvent) => void
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}
function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay()
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function MaintenanceCalendar({ events, onEventClick }: Props) {
  const { theme } = useTheme()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())

  const daysInMonth = getDaysInMonth(year, month)
  const firstDay = getFirstDayOfMonth(year, month)

  const eventsByDate: Record<string, MaintenanceEvent[]> = {}
  for (const ev of events) {
    const d = ev.date.slice(0, 10)
    if (!eventsByDate[d]) eventsByDate[d] = []
    eventsByDate[d].push(ev)
  }

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }

  const TYPE_COLOR: Record<string, string> = {
    scheduled: theme.accent,
    completed: theme.success,
    overdue: theme.danger,
  }

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  // pad to full rows
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <button onClick={prevMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.textSecondary, fontSize: '18px' }}>‹</button>
        <span style={{ fontWeight: 600, color: theme.textPrimary, fontSize: '15px' }}>{MONTH_NAMES[month]} {year}</span>
        <button onClick={nextMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.textSecondary, fontSize: '18px' }}>›</button>
      </div>

      {/* Day names */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '1px', marginBottom: '4px' }}>
        {DAY_NAMES.map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: '11px', color: theme.textMuted, paddingBottom: '4px' }}>{d}</div>
        ))}
      </div>

      {/* Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
        {cells.map((day, idx) => {
          if (!day) return <div key={`empty-${idx}`} />
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const dayEvents = eventsByDate[dateStr] ?? []
          const isToday = year === now.getFullYear() && month === now.getMonth() && day === now.getDate()

          return (
            <div
              key={dateStr}
              style={{
                minHeight: '54px',
                border: `1px solid ${isToday ? theme.accent : theme.border}`,
                borderRadius: '4px',
                padding: '4px',
                background: isToday ? theme.accentBg : theme.bgSurface,
              }}
            >
              <div style={{ fontSize: '11px', color: isToday ? theme.accent : theme.textMuted, fontWeight: isToday ? 600 : 400, marginBottom: '2px' }}>
                {day}
              </div>
              {dayEvents.slice(0, 2).map(ev => (
                <button
                  key={ev.id}
                  onClick={() => onEventClick?.(ev)}
                  style={{
                    display: 'block',
                    width: '100%',
                    background: TYPE_COLOR[ev.type] ?? theme.accent,
                    color: '#fff',
                    border: 'none',
                    borderRadius: '3px',
                    padding: '1px 4px',
                    fontSize: '10px',
                    marginBottom: '1px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {ev.title}
                </button>
              ))}
              {dayEvents.length > 2 && (
                <div style={{ fontSize: '9px', color: theme.textMuted }}>+{dayEvents.length - 2} more</div>
              )}
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: '16px', marginTop: '12px', flexWrap: 'wrap' }}>
        {(['scheduled', 'completed', 'overdue'] as const).map(t => (
          <div key={t} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: TYPE_COLOR[t] }} />
            <span style={{ fontSize: '11px', color: theme.textMuted, textTransform: 'capitalize' }}>{t}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
