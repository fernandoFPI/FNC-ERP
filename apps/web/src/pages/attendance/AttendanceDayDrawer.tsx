import { useTheme } from '../../theme/ThemeContext'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import { Drawer } from '../../components/ui/Drawer'
import { Modal } from '../../components/ui/Modal'
import { Badge } from '../../components/ui/Badge'
import type { Column } from '../../components/ui/Table'
import { Table } from '../../components/ui/Table'

interface Punch {
  id: string
  punch_type: string
  punched_at: string
  is_valid: boolean
  work_location_name?: string
  distance_from_zone?: number
  rejection_reason?: string
}

interface DayMeta {
  hoursWorked?: number
  hasOvertime?: boolean
  isAbsent?: boolean
  leaveTypeName?: string
}

interface Props {
  open: boolean
  onClose: () => void
  date: string | null
  punches: Punch[]
  loading: boolean
  dayMeta?: DayMeta
}

export function AttendanceDayDrawer({ open, onClose, date, punches, loading, dayMeta }: Props) {
  const { theme } = useTheme()
  const { isPhone } = useBreakpoint()

  const sessions = punches.filter((p) => p.punch_type === 'in').length
  const invalid = punches.filter((p) => !p.is_valid)
  const validCount = punches.filter((p) => p.is_valid).length
  const hours = dayMeta?.hoursWorked ?? 0

  const columns: Column<Punch>[] = [
    {
      key: 'punch_type',
      header: 'Type',
      render: (p) => (
        <Badge variant={p.punch_type === 'in' ? 'success' : 'info'}>
          {p.punch_type === 'in' ? '▶ In' : '■ Out'}
        </Badge>
      ),
    },
    {
      key: 'punched_at',
      header: 'Time',
      render: (p) => (
        <span style={{ fontFamily: 'monospace', fontSize: '13px', color: theme.textPrimary }}>
          {p.punched_at?.slice(11, 19) ?? '—'}
        </span>
      ),
    },
    {
      key: 'work_location_name',
      header: 'Location',
      render: (p) => (
        <span style={{ fontSize: '12px', color: theme.textMuted }}>
          {p.work_location_name ?? '—'}
        </span>
      ),
    },
    {
      key: 'distance_from_zone',
      header: 'Dist.',
      render: (p) =>
        p.distance_from_zone != null ? (
          <span
            style={{
              fontFamily: 'monospace',
              fontSize: '12px',
              color: p.distance_from_zone > 100 ? theme.danger : theme.textMuted,
            }}
          >
            {p.distance_from_zone.toFixed(0)}m
          </span>
        ) : (
          <span style={{ color: theme.textMuted }}>—</span>
        ),
    },
    {
      key: 'is_valid',
      header: 'Valid',
      render: (p) => (
        <Badge variant={p.is_valid ? 'success' : 'danger'}>
          {p.is_valid ? 'Valid' : 'Invalid'}
        </Badge>
      ),
    },
  ]

  const title = date
    ? new Date(date + 'T12:00:00').toLocaleDateString('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : ''

  const content = (
    <>
      {/* KPI row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '8px',
          marginBottom: '16px',
        }}
      >
        {[
          { label: 'Hours', value: `${hours.toFixed(1)}h`, color: theme.textPrimary },
          { label: 'Sessions', value: String(sessions), color: theme.textPrimary },
          { label: 'Valid', value: String(validCount), color: theme.success },
          {
            label: 'Invalid',
            value: String(invalid.length),
            color: invalid.length > 0 ? theme.danger : theme.textMuted,
          },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            style={{
              background: theme.bgSurface,
              border: `1px solid ${theme.border}`,
              borderRadius: '8px',
              padding: '10px 8px',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontSize: '10px',
                color: theme.textMuted,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: '4px',
              }}
            >
              {label}
            </div>
            <div style={{ fontSize: '16px', fontWeight: 700, fontFamily: 'monospace', color }}>
              {value}
            </div>
          </div>
        ))}
      </div>

      {/* Status tags */}
      {(dayMeta?.hasOvertime || dayMeta?.isAbsent || dayMeta?.leaveTypeName) && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
          {dayMeta?.hasOvertime && (
            <span
              style={{
                padding: '3px 10px',
                borderRadius: '999px',
                background: '#f59e0b22',
                border: '1px solid #f59e0b44',
                fontSize: '12px',
                fontWeight: 600,
                color: '#b45309',
              }}
            >
              ⏱ Overtime
            </span>
          )}
          {dayMeta?.isAbsent && (
            <span
              style={{
                padding: '3px 10px',
                borderRadius: '999px',
                background: '#ef444422',
                border: '1px solid #ef444444',
                fontSize: '12px',
                fontWeight: 600,
                color: '#b91c1c',
              }}
            >
              Absent
            </span>
          )}
          {dayMeta?.leaveTypeName && (
            <span
              style={{
                padding: '3px 10px',
                borderRadius: '999px',
                background: '#3b82f622',
                border: '1px solid #3b82f644',
                fontSize: '12px',
                fontWeight: 600,
                color: '#1d4ed8',
              }}
            >
              Leave · {dayMeta.leaveTypeName}
            </span>
          )}
        </div>
      )}

      {/* Punch log */}
      <div
        style={{
          fontSize: '11px',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: theme.textMuted,
          marginBottom: '8px',
        }}
      >
        Punch Log
      </div>
      <Table
        columns={columns}
        data={punches}
        loading={loading}
        rowKey="id"
        emptyMessage="No punches recorded for this day"
      />

      {/* Invalid detail */}
      {invalid.length > 0 && (
        <div style={{ marginTop: '20px' }}>
          <div
            style={{
              fontSize: '11px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: theme.danger,
              marginBottom: '8px',
            }}
          >
            Invalid Punches
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {invalid.map((p) => (
              <div
                key={p.id}
                style={{
                  padding: '10px 12px',
                  background: '#ef444411',
                  border: '1px solid #ef444433',
                  borderRadius: '8px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: p.rejection_reason ? '6px' : 0,
                  }}
                >
                  <Badge variant={p.punch_type === 'in' ? 'success' : 'info'}>{p.punch_type}</Badge>
                  <span
                    style={{
                      fontFamily: 'monospace',
                      fontSize: '12px',
                      color: theme.textSecondary,
                    }}
                  >
                    {p.punched_at?.slice(11, 19)}
                  </span>
                </div>
                {p.rejection_reason && (
                  <div style={{ fontSize: '12px', color: theme.danger, fontStyle: 'italic' }}>
                    {p.rejection_reason}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )

  if (isPhone) {
    return (
      <Modal open={open} onClose={onClose} title={title} size="lg" bottomSheet>
        {content}
      </Modal>
    )
  }

  return (
    <Drawer open={open} onClose={onClose} title={title} width="460px">
      {content}
    </Drawer>
  )
}
