import React from 'react'
import { useTheme } from '../../theme/ThemeContext'

interface LeaveEntry {
  employeeName: string
  startDate: string
  endDate: string
  leaveTypeName: string
  status: string
}

interface LeaveCalendarProps {
  month: Date
  leaves: LeaveEntry[]
  onMonthChange: (month: Date) => void
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const LEAVE_COLORS = ['#6C9BF5', '#5EC5A0', '#F5A66C', '#C56CBA', '#F56C6C', '#6CD9F5', '#F5D96C']

function toDate(s: string) {
  return new Date(s + 'T00:00:00')
}
function fmt(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function LeaveCalendar({ month, leaves, onMonthChange }: LeaveCalendarProps) {
  const { theme } = useTheme()
  const year = month.getFullYear()
  const mon = month.getMonth()

  const firstDay = new Date(year, mon, 1)
  const startDow = (firstDay.getDay() + 6) % 7
  const daysInMonth = new Date(year, mon + 1, 0).getDate()

  const monthLabel = month.toLocaleString('default', { month: 'long', year: 'numeric' })

  // Build date → list of leave entries for approved leaves
  const dateLeaves: Record<string, (LeaveEntry & { colorIdx: number })[]> = {}
  const typeColorMap: Record<string, number> = {}
  let colorCounter = 0

  leaves
    .filter((l) => l.status === 'approved')
    .forEach((l) => {
      if (typeColorMap[l.leaveTypeName] == null) {
        typeColorMap[l.leaveTypeName] = colorCounter++ % LEAVE_COLORS.length
      }
      const start = toDate(l.startDate)
      const end = toDate(l.endDate)
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const key = fmt(d)
        if (!dateLeaves[key]) dateLeaves[key] = []
        dateLeaves[key].push({ ...l, colorIdx: typeColorMap[l.leaveTypeName] })
      }
    })

  const cells: (number | null)[] = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '12px',
        }}
      >
        <button
          onClick={() => {
            onMonthChange(new Date(year, mon - 1, 1))
          }}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: theme.textMuted,
            fontSize: '18px',
            padding: '4px 8px',
          }}
        >
          ‹
        </button>
        <span style={{ fontWeight: 600, color: theme.textPrimary, fontSize: '15px' }}>
          {monthLabel}
        </span>
        <button
          onClick={() => {
            onMonthChange(new Date(year, mon + 1, 1))
          }}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: theme.textMuted,
            fontSize: '18px',
            padding: '4px 8px',
          }}
        >
          ›
        </button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: '2px',
          marginBottom: '4px',
        }}
      >
        {DAY_LABELS.map((d) => (
          <div
            key={d}
            style={{
              textAlign: 'center',
              fontSize: '10px',
              fontWeight: 600,
              color: theme.textMuted,
              textTransform: 'uppercase',
              padding: '4px 0',
            }}
          >
            {d}
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
        {cells.map((day, i) => {
          if (day == null) return <div key={`e-${i}`} />
          const dateStr = `${year}-${String(mon + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const entries = dateLeaves[dateStr] ?? []

          return (
            <div
              key={dateStr}
              style={{
                height: '56px',
                border: `1px solid ${theme.border}`,
                borderRadius: '6px',
                padding: '4px',
                overflow: 'hidden',
                background: theme.bgSurface,
              }}
            >
              <div style={{ fontSize: '11px', color: theme.textSecondary, marginBottom: '2px' }}>
                {day}
              </div>
              {entries.slice(0, 2).map((e, j) => (
                <div
                  key={j}
                  style={{
                    fontSize: '9px',
                    lineHeight: 1.2,
                    background: `${LEAVE_COLORS[e.colorIdx]}22`,
                    color: LEAVE_COLORS[e.colorIdx],
                    borderRadius: '3px',
                    padding: '1px 3px',
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    textOverflow: 'ellipsis',
                    marginBottom: '1px',
                  }}
                >
                  {e.employeeName.split(' ')[0]}
                </div>
              ))}
              {entries.length > 2 && (
                <div style={{ fontSize: '9px', color: theme.textMuted }}>+{entries.length - 2}</div>
              )}
            </div>
          )
        })}
      </div>

      {/* Legend */}
      {Object.keys(typeColorMap).length > 0 && (
        <div style={{ display: 'flex', gap: '12px', marginTop: '10px', flexWrap: 'wrap' }}>
          {Object.entries(typeColorMap).map(([type, idx]) => (
            <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '3px',
                  background: LEAVE_COLORS[idx],
                }}
              />
              <span style={{ fontSize: '11px', color: theme.textMuted }}>{type}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
