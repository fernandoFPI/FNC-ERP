import { useTheme } from '../../theme/ThemeContext'
import { Badge } from './Badge'
import { formatUptime } from '../../lib/format'
import { formatRelativeTime } from '../../lib/format'

interface SystemHealthCardProps {
  service: string
  status: 'ok' | 'degraded' | 'down'
  latencyMs?: number
  checks: {
    database?: 'ok' | 'warn' | 'fail'
    redis?: 'ok' | 'warn' | 'fail'
    outbox?: 'ok' | 'warn' | 'fail'
  }
  uptime?: number
  lastChecked?: string
}

const statusBadge: Record<'ok' | 'degraded' | 'down', 'success' | 'warning' | 'danger'> = {
  ok: 'success',
  degraded: 'warning',
  down: 'danger',
}

const checkColor: Record<'ok' | 'warn' | 'fail', string> = {
  ok: 'var(--check-ok)',
  warn: 'var(--check-warn)',
  fail: 'var(--check-fail)',
}

function PulseDot({ color }: { color: string }) {
  return (
    <span style={{ position: 'relative', display: 'inline-block', width: 10, height: 10 }}>
      <span style={{
        display: 'inline-block',
        width: 10,
        height: 10,
        borderRadius: '50%',
        background: color,
        position: 'absolute',
        top: 0,
        left: 0,
      }} />
      <span style={{
        display: 'inline-block',
        width: 10,
        height: 10,
        borderRadius: '50%',
        background: color,
        opacity: 0.4,
        position: 'absolute',
        top: 0,
        left: 0,
        animation: 'pulse-ring 1.5s ease-out infinite',
      }} />
    </span>
  )
}

export function SystemHealthCard({ service, status, latencyMs, checks, uptime, lastChecked }: SystemHealthCardProps) {
  const { theme } = useTheme()

  const statusColor = status === 'ok' ? theme.success : status === 'degraded' ? theme.warning : theme.danger

  const latencyColor = latencyMs === undefined
    ? theme.textMuted
    : latencyMs <= 200
      ? theme.success
      : latencyMs <= 500
        ? theme.warning
        : theme.danger

  const checkDotColor = (v: 'ok' | 'warn' | 'fail') =>
    v === 'ok' ? theme.success : v === 'warn' ? theme.warning : theme.danger

  const checkEntries = Object.entries(checks) as Array<[string, 'ok' | 'warn' | 'fail']>

  return (
    <div style={{
      background: theme.bgSurface,
      border: `1px solid ${theme.border}`,
      borderRadius: 12,
      padding: '16px 20px',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      backdropFilter: 'blur(8px)',
    }}>
      <style>{`
        @keyframes pulse-ring {
          0% { transform: scale(1); opacity: 0.4; }
          100% { transform: scale(2.2); opacity: 0; }
        }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <PulseDot color={statusColor} />
          <span style={{ color: theme.textPrimary, fontWeight: 600, fontSize: 15 }}>{service}</span>
        </div>
        <Badge variant={statusBadge[status]}>{status.toUpperCase()}</Badge>
      </div>

      {/* Latency */}
      {latencyMs !== undefined && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: theme.textMuted, fontSize: 12 }}>Latency:</span>
          <span style={{ color: latencyColor, fontWeight: 600, fontSize: 13 }}>{latencyMs} ms</span>
        </div>
      )}

      {/* Checks */}
      {checkEntries.length > 0 && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {checkEntries.map(([name, val]) => (
            <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: checkDotColor(val),
                display: 'inline-block',
                flexShrink: 0,
              }} />
              <span style={{ color: theme.textSecondary, fontSize: 12 }}>{name}</span>
            </div>
          ))}
        </div>
      )}

      {/* Uptime + last checked */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: theme.textMuted }}>
        {uptime !== undefined && (
          <span>Uptime: <span style={{ color: theme.textSecondary }}>{formatUptime(uptime)}</span></span>
        )}
        {lastChecked && (
          <span>Checked {formatRelativeTime(lastChecked)}</span>
        )}
      </div>

      {/* suppress unused import warning */}
      <span style={{ display: 'none' }}>{checkColor.ok}</span>
    </div>
  )
}
