import { pool } from './client.js'
import { createClient } from 'redis'

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'down'
  service: string
  timestamp: string
  checks: {
    database: CheckResult
    redis: CheckResult
    outbox?: CheckResult
  }
  uptime: number
}

export interface CheckResult {
  status: 'ok' | 'warn' | 'fail'
  latencyMs?: number
  message?: string
}

export async function checkDatabase(): Promise<CheckResult> {
  const start = Date.now()
  try {
    await pool.query('SELECT 1')
    return { status: 'ok', latencyMs: Date.now() - start }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { status: 'fail', message }
  }
}

export async function checkRedis(): Promise<CheckResult> {
  const start = Date.now()
  const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379'
  const client = createClient({ url: redisUrl, RESP: 2 })
  try {
    await client.connect()
    await client.ping()
    return { status: 'ok', latencyMs: Date.now() - start }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { status: 'fail', message }
  } finally {
    try {
      await client.disconnect()
    } catch {
      // ignore disconnect errors during health check
    }
  }
}

export async function checkOutbox(): Promise<CheckResult> {
  try {
    const result = await pool.query<{ stuck_count: string }>(`
      SELECT COUNT(*) AS stuck_count
      FROM service_outbox
      WHERE status IN ('pending','failed')
        AND attempts < max_attempts
        AND created_at < NOW() - INTERVAL '15 minutes'
    `)
    const stuckCount = parseInt(result.rows[0]?.stuck_count ?? '0')
    if (stuckCount > 10) {
      return { status: 'warn', message: `${stuckCount} outbox events stuck for >15 minutes` }
    }
    if (stuckCount > 0) {
      return { status: 'warn', message: `${stuckCount} outbox events pending >15 minutes` }
    }
    return { status: 'ok' }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { status: 'fail', message }
  }
}

export async function buildHealthStatus(
  serviceName: string,
  includeOutbox = false,
): Promise<HealthStatus> {
  const [database, redis, outbox] = await Promise.all([
    checkDatabase(),
    checkRedis(),
    includeOutbox ? checkOutbox() : Promise.resolve(undefined),
  ])

  const checks: HealthStatus['checks'] = { database, redis }
  if (outbox) checks.outbox = outbox

  const hasFailure = database.status === 'fail' || redis.status === 'fail'
  const hasDegradation =
    database.status === 'warn' || redis.status === 'warn' || outbox?.status === 'warn'

  return {
    status: hasFailure ? 'down' : hasDegradation ? 'degraded' : 'ok',
    service: serviceName,
    timestamp: new Date().toISOString(),
    checks,
    uptime: process.uptime(),
  }
}
