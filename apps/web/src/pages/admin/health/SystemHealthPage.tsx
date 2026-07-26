import { useQuery } from '@apollo/client'
import { useState, useEffect } from 'react'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { SYSTEM_HEALTH_QUERY } from '../../../graphql/admin'

interface ServiceChecks {
  database: string
  redis: string
  outbox: string
}

interface ServiceHealth {
  service: string
  status: string
  latencyMs: number
  checks: ServiceChecks
  uptime: number
  lastChecked: string
}

interface HealthData {
  systemHealth: ServiceHealth[]
}

function statusVariant(
  s: string,
): 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent' {
  const m: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent'> = {
    healthy: 'success',
    degraded: 'warning',
    unhealthy: 'danger',
    starting: 'info',
  }
  return m[s?.toLowerCase()] ?? 'neutral'
}

function checkVariant(s: string): 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent' {
  if (s === 'ok' || s === 'healthy') return 'success'
  if (s === 'degraded') return 'warning'
  if (s === 'error' || s === 'unhealthy') return 'danger'
  return 'neutral'
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${mins}m`
  return `${mins}m`
}

export default function SystemHealthPage() {
  const { theme } = useTheme()
  const { data, loading, refetch } = useQuery<HealthData>(SYSTEM_HEALTH_QUERY, {
    pollInterval: 10000,
    fetchPolicy: 'network-only',
  })

  // Local 1s countdown showing seconds since last cache refresh
  const [secondsAgo, setSecondsAgo] = useState(0)
  useEffect(() => {
    const t = setInterval(() => {
      setSecondsAgo((s) => s + 1)
    }, 1000)
    return () => {
      clearInterval(t)
    }
  }, [])
  useEffect(() => {
    setSecondsAgo(0)
  }, [data])

  const services = data?.systemHealth ?? []
  const allHealthy = services.every((s) => s.status === 'healthy')

  return (
    <div style={{ padding: '24px' }}>
      <PageHeader
        title="System Health"
        subtitle="Service status and infrastructure checks"
        status={
          !loading && services.length > 0 ? (
            <Badge variant={allHealthy ? 'success' : 'danger'} dot>
              {allHealthy ? 'All Systems Operational' : 'Issues Detected'}
            </Badge>
          ) : undefined
        }
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '11px',
                color: theme.textMuted,
              }}
            >
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: theme.success,
                  boxShadow: `0 0 0 2px ${theme.success}40`,
                  animation: 'pulse 2s infinite',
                }}
              />
              {secondsAgo === 0 ? 'Just updated' : `${secondsAgo}s ago`}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                refetch()
              }}
            >
              Refresh
            </Button>
          </div>
        }
      />

      {loading ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '16px',
          }}
        >
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton" style={{ height: '160px', borderRadius: '12px' }} />
          ))}
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '16px',
          }}
        >
          {services.map((svc) => (
            <Card key={svc.service} padding="md" rimHighlight>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: '16px',
                }}
              >
                <div>
                  <p
                    style={{
                      fontSize: '14px',
                      fontWeight: 600,
                      color: theme.textPrimary,
                      textTransform: 'capitalize',
                    }}
                  >
                    {svc.service}
                  </p>
                  <p style={{ fontSize: '11px', color: theme.textMuted, marginTop: '2px' }}>
                    Updated {new Date(svc.lastChecked).toLocaleTimeString()}
                  </p>
                </div>
                <Badge variant={statusVariant(svc.status)}>{svc.status}</Badge>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '12px',
                  marginBottom: '12px',
                }}
              >
                <div>
                  <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '2px' }}>
                    Latency
                  </p>
                  <p
                    style={{
                      fontSize: '16px',
                      fontWeight: 500,
                      color: svc.latencyMs > 200 ? theme.warning : theme.success,
                    }}
                  >
                    {svc.latencyMs}ms
                  </p>
                </div>
                <div>
                  <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '2px' }}>
                    Uptime
                  </p>
                  <p style={{ fontSize: '16px', fontWeight: 500, color: theme.textPrimary }}>
                    {formatUptime(svc.uptime)}
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {Object.entries(svc.checks).map(([key, val]) => (
                  <div
                    key={key}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '12px',
                        color: theme.textSecondary,
                        textTransform: 'capitalize',
                      }}
                    >
                      {key}
                    </span>
                    <Badge variant={checkVariant(val)} size="sm">
                      {val}
                    </Badge>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      {!loading && services.length === 0 && (
        <Card padding="md">
          <p style={{ color: theme.textMuted, textAlign: 'center', fontSize: '13px' }}>
            No health data available. Ensure the gateway health endpoint is running.
          </p>
        </Card>
      )}
    </div>
  )
}
