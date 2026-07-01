// vi.mock calls are hoisted before imports

vi.mock('@fnc-erp/config', () => ({
  env: {
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    REDIS_URL: 'redis://localhost:6379',
    JWT_SECRET: 'test-secret-32-chars-minimum-pad!',
    JWT_REFRESH_SECRET: 'test-refresh-secret-32-chars-pad!',
    JWT_ACCESS_EXPIRES_IN: '15m',
    JWT_REFRESH_EXPIRES_IN: '7d',
    ENCRYPTION_KEY: '0'.repeat(64),
    SERVICE_TOKEN: 'service-token-change-in-prod-min32chars',
    LOG_LEVEL: 'error',
    SERVICE_NAME: 'rental-test',
  },
}))

vi.mock('@fnc-erp/db', () => ({
  pool: {
    query: vi.fn(),
    connect: vi.fn(),
  },
  query: vi.fn(),
  withTransaction: vi.fn(),
}))

vi.mock('@fnc-erp/logger', () => ({
  logger: {
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  },
}))

vi.mock('@fnc-erp/auth', () => ({
  requireAuth: () => (req: Record<string, unknown>, _res: unknown, next: () => void) => {
    req['auth'] = {
      userId: 'user-1', companyId: 'company-1',
      role: 'company_admin', module: 'all', sessionId: 'session-1',
    }
    next()
  },
}))

vi.mock('@fnc-erp/audit', () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}))

import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { pool, query } from '@fnc-erp/db'
import { usageLogsRouter } from '../src/routes/usage-logs.js'
import { maintenanceRouter, getUpcomingMaintenance } from '../src/routes/maintenance.js'
import { locationRouter, getFleetLocations } from '../src/routes/location-tracking.js'
import { conditionReportsRouter, getOpenConditionReports } from '../src/routes/condition-reports.js'

function makeApp() {
  const app = express()
  app.use(express.json())
  // Inject auth context
  app.use((req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as Record<string, unknown>)['auth'] = {
      userId: 'user-1', companyId: 'company-1',
      role: 'company_admin', module: 'all', sessionId: 'session-1', ip: '127.0.0.1',
    }
    next()
  })

  // Static routes BEFORE parameterized ones to avoid `:id` swallowing them
  app.get('/assets/locations', (req, res) => {
    void getFleetLocations(
      req as Parameters<typeof getFleetLocations>[0],
      res as Parameters<typeof getFleetLocations>[1],
    )
  })
  app.get('/maintenance/upcoming', (req, res) => {
    void getUpcomingMaintenance(
      req as Parameters<typeof getUpcomingMaintenance>[0],
      res as Parameters<typeof getUpcomingMaintenance>[1],
    )
  })
  app.get('/condition-reports/open', (req, res) => {
    void getOpenConditionReports(
      req as Parameters<typeof getOpenConditionReports>[0],
      res as Parameters<typeof getOpenConditionReports>[1],
    )
  })

  // Parameterized routes after static ones
  app.use('/assets/:id/usage', usageLogsRouter)
  app.use('/assets/:id/maintenance', maintenanceRouter)
  app.use('/assets/:id/location', locationRouter)
  app.use('/assets/:id/condition-reports', conditionReportsRouter)

  return app
}

const mockClient = {
  query: vi.fn().mockResolvedValue({ rows: [] }),
  release: vi.fn(),
}

beforeEach(() => {
  vi.mocked(query).mockReset()
  vi.mocked(pool.query).mockReset()
  vi.mocked(pool.connect).mockReset()
  vi.mocked(pool.connect).mockResolvedValue(mockClient as never)
  mockClient.query.mockReset()
  mockClient.query.mockResolvedValue({ rows: [] })
})

// ── Usage Logs ────────────────────────────────────────────────
describe('GET /assets/:id/usage', () => {
  it('returns logs and stats', async () => {
    const logRow = { id: 'log-1', asset_id: 'asset-1', log_date: '2026-06-01', hours_operated: 8 }
    const statsRow = { asset_id: 'asset-1', total_hours_operated: 120, maintenance_status: 'ok' }
    vi.mocked(query)
      .mockResolvedValueOnce({ rows: [logRow] } as never)
      .mockResolvedValueOnce({ rows: [statsRow] } as never)

    const res = await request(makeApp()).get('/assets/asset-1/usage')
    expect(res.status).toBe(200)
    expect(res.body.data.logs).toHaveLength(1)
    expect(res.body.data.stats.maintenance_status).toBe('ok')
  })

  it('passes from_date and to_date as parameterized query args (no SQL injection)', async () => {
    vi.mocked(query).mockResolvedValue({ rows: [] } as never)
    await request(makeApp()).get('/assets/asset-1/usage?from_date=2026-01-01&to_date=2026-06-30')

    const callArgs = vi.mocked(query).mock.calls[0]!
    // Values must appear in the params array, not interpolated into the SQL string
    expect(callArgs[1]).toContain('2026-01-01')
    expect(callArgs[1]).toContain('2026-06-30')
    expect(String(callArgs[0])).not.toContain("'2026-01-01'")
  })
})

describe('GET /assets/:id/usage/summary', () => {
  it('returns aggregated usage summary', async () => {
    vi.mocked(query).mockResolvedValueOnce({
      rows: [{ days_logged: '15', total_hours: '120.5', total_fuel: '450' }],
    } as never)

    const res = await request(makeApp()).get('/assets/asset-1/usage/summary')
    expect(res.status).toBe(200)
    expect(res.body.data.days_logged).toBe('15')
  })
})

describe('POST /assets/:id/usage', () => {
  it('rejects hours_operated > 24', async () => {
    const res = await request(makeApp())
      .post('/assets/asset-1/usage')
      .send({ log_date: '2026-06-01', hours_operated: 25 })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('rejects future log_date', async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [{ id: 'asset-1', status: 'rented' }] } as never)

    const futureDate = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
    const res = await request(makeApp())
      .post('/assets/asset-1/usage')
      .send({ log_date: futureDate, hours_operated: 8 })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('FUTURE_DATE')
  })

  it('returns 404 when asset not found', async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [] } as never)
    const res = await request(makeApp())
      .post('/assets/asset-1/usage')
      .send({ log_date: '2026-06-01', hours_operated: 8 })
    expect(res.status).toBe(404)
  })

  it('returns maintenance warning when within 20 hours of due', async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [{ id: 'asset-1', status: 'rented' }] } as never)
    mockClient.query
      .mockResolvedValueOnce({ rows: [] })              // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 'log-1' }] }) // INSERT log
      .mockResolvedValueOnce({ rows: [] })              // COMMIT
    vi.mocked(query).mockResolvedValueOnce({
      rows: [{ asset_id: 'asset-1', total_hours_operated: 248, next_maintenance_due_hours: 250 }],
    } as never)

    const res = await request(makeApp())
      .post('/assets/asset-1/usage')
      .send({ log_date: '2026-06-01', hours_operated: 8 })
    expect(res.status).toBe(201)
    expect(res.body.warnings?.[0]?.type).toBe('due_soon')
  })

  it('uses ON CONFLICT upsert so double-submit is idempotent', async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [{ id: 'asset-1', status: 'rented' }] } as never)
    mockClient.query
      .mockResolvedValueOnce({ rows: [] })              // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 'log-1' }] }) // INSERT (upsert)
      .mockResolvedValueOnce({ rows: [] })              // COMMIT
    vi.mocked(query).mockResolvedValueOnce({ rows: [{ total_hours_operated: 8 }] } as never)

    await request(makeApp())
      .post('/assets/asset-1/usage')
      .send({ log_date: '2026-06-01', hours_operated: 8 })

    // calls[0] is BEGIN — the INSERT is calls[1]
    const insertSql = String(mockClient.query.mock.calls[1]?.[0])
    expect(insertSql).toContain('ON CONFLICT')
    expect(insertSql).toContain('DO UPDATE')
  })
})

describe('POST /assets/:id/usage/:logId/verify', () => {
  it('returns 403 for non-admin role', async () => {
    const app = express()
    app.use(express.json())
    app.use((req: express.Request, _res: express.Response, next: express.NextFunction) => {
      (req as Record<string, unknown>)['auth'] = {
        userId: 'u1', companyId: 'c1', role: 'employee', module: 'all', sessionId: 'x',
      }
      next()
    })
    app.use('/assets/:id/usage', usageLogsRouter)

    const res = await request(app).post('/assets/asset-1/usage/log-1/verify').send({})
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('FORBIDDEN')
  })

  it('verifies log for admin', async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [] } as never)
    const res = await request(makeApp()).post('/assets/asset-1/usage/log-1/verify').send({})
    expect(res.status).toBe(200)
    expect(res.body.data.message).toContain('verified')
  })
})

// ── Maintenance Schedules ─────────────────────────────────────
describe('POST /assets/:id/maintenance/schedules', () => {
  it('rejects missing interval_hours for hours_based trigger', async () => {
    const res = await request(makeApp())
      .post('/assets/asset-1/maintenance/schedules')
      .send({ name: 'Oil Change', maintenance_type: 'oil_change', trigger_type: 'hours_based' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('MISSING_INTERVAL')
  })

  it('rejects missing interval_days for calendar trigger', async () => {
    const res = await request(makeApp())
      .post('/assets/asset-1/maintenance/schedules')
      .send({ name: 'Annual Inspection', maintenance_type: 'inspection', trigger_type: 'calendar' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('MISSING_INTERVAL')
  })

  it('creates schedule with valid hours_based input', async () => {
    vi.mocked(query).mockResolvedValueOnce({
      rows: [{ id: 'sched-1', name: 'Oil Change', interval_hours: 250 }],
    } as never)

    const res = await request(makeApp())
      .post('/assets/asset-1/maintenance/schedules')
      .send({ name: 'Oil Change', maintenance_type: 'oil_change', trigger_type: 'hours_based', interval_hours: 250 })
    expect(res.status).toBe(201)
    expect(res.body.data.name).toBe('Oil Change')
  })
})

// ── Maintenance Records lifecycle ─────────────────────────────
describe('POST /assets/:id/maintenance/records/:recordId/start', () => {
  it('sets asset to in_progress, maintenance status, and records maintenance_in', async () => {
    mockClient.query.mockResolvedValue({ rows: [] })

    const res = await request(makeApp())
      .post('/assets/asset-1/maintenance/records/rec-1/start')
      .send({})
    expect(res.status).toBe(200)

    const sqls = mockClient.query.mock.calls.map((c) => String(c[0]))
    expect(sqls.some((s) => s.includes("'in_progress'"))).toBe(true)
    expect(sqls.some((s) => s.includes("'maintenance'"))).toBe(true)
    expect(sqls.some((s) => s.includes("'maintenance_in'"))).toBe(true)
  })
})

describe('POST /assets/:id/maintenance/records/:recordId/complete', () => {
  it('sets record to completed, asset to available, and records maintenance_out', async () => {
    mockClient.query.mockResolvedValue({ rows: [] })

    const res = await request(makeApp())
      .post('/assets/asset-1/maintenance/records/rec-1/complete')
      .send({ engine_hours_at_service: 500, actual_cost: 150000, findings: 'Oil changed' })
    expect(res.status).toBe(200)

    const sqls = mockClient.query.mock.calls.map((c) => String(c[0]))
    expect(sqls.some((s) => s.includes("'completed'"))).toBe(true)
    expect(sqls.some((s) => s.includes("'available'"))).toBe(true)
    expect(sqls.some((s) => s.includes("'maintenance_out'"))).toBe(true)
  })
})

describe('GET /maintenance/upcoming', () => {
  it('returns upcoming maintenance list', async () => {
    vi.mocked(query).mockResolvedValueOnce({
      rows: [
        { id: 'r1', due_date: '2026-05-01', status: 'overdue',   urgency: 'overdue' },
        { id: 'r2', due_date: '2026-06-20', status: 'scheduled', urgency: 'upcoming' },
      ],
    } as never)

    const res = await request(makeApp()).get('/maintenance/upcoming')
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(2)
  })
})

// ── Location Tracking ─────────────────────────────────────────
describe('GET /assets/:id/location', () => {
  it('returns current location', async () => {
    vi.mocked(query).mockResolvedValueOnce({
      rows: [{ id: 'loc-1', movement_type: 'deployed', location_name: 'Site A' }],
    } as never)

    const res = await request(makeApp()).get('/assets/asset-1/location')
    expect(res.status).toBe(200)
    expect(res.body.data.movement_type).toBe('deployed')
  })

  it('returns null when no location history', async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [] } as never)
    const res = await request(makeApp()).get('/assets/asset-1/location')
    expect(res.status).toBe(200)
    expect(res.body.data).toBeNull()
  })
})

describe('POST /assets/:id/location', () => {
  it('rejects unknown movement_type', async () => {
    const res = await request(makeApp())
      .post('/assets/asset-1/location')
      .send({ movement_type: 'teleported' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('returns 404 when asset not found', async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [] } as never)
    const res = await request(makeApp())
      .post('/assets/asset-1/location')
      .send({ movement_type: 'deployed', project_id: '00000000-0000-0000-0000-000000000001' })
    expect(res.status).toBe(404)
  })

  it('records location and updates asset current_location_id', async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [{ id: 'asset-1' }] } as never)
    mockClient.query
      .mockResolvedValueOnce({ rows: [] })                                           // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 'loc-1', movement_type: 'deployed' }] }) // INSERT
      .mockResolvedValueOnce({ rows: [] })                                           // UPDATE asset
      .mockResolvedValueOnce({ rows: [] })                                           // UPDATE stats
      .mockResolvedValueOnce({ rows: [] })                                           // COMMIT

    const res = await request(makeApp())
      .post('/assets/asset-1/location')
      .send({
        movement_type: 'deployed',
        stock_location_id: '00000000-0000-0000-0000-000000000002',
        location_name: 'Site B',
      })
    expect(res.status).toBe(201)
    expect(res.body.data.movement_type).toBe('deployed')
  })
})

describe('GET /assets/locations (fleet overview)', () => {
  it('returns one row per active asset with latest location', async () => {
    vi.mocked(query).mockResolvedValueOnce({
      rows: [
        { asset_id: 'a1', asset_name: 'Crane 1',    movement_type: 'deployed',  location_name: 'Site A' },
        { asset_id: 'a2', asset_name: 'Generator 1', movement_type: 'returned', location_name: 'Warehouse' },
      ],
    } as never)

    const res = await request(makeApp()).get('/assets/locations')
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(2)
  })
})

// ── Condition Reports ─────────────────────────────────────────
describe('POST /assets/:id/condition-reports', () => {
  it('rejects invalid overall_condition', async () => {
    const res = await request(makeApp())
      .post('/assets/asset-1/condition-reports')
      .send({ overall_condition: 'excellent' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('inserts ASSET_CONDITION_ALERT outbox event for critical condition', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [] })                                              // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 'report-1', overall_condition: 'critical' }] }) // INSERT report
      .mockResolvedValueOnce({ rows: [] })                                              // INSERT outbox
      .mockResolvedValueOnce({ rows: [] })                                              // COMMIT

    const res = await request(makeApp())
      .post('/assets/asset-1/condition-reports')
      .send({ overall_condition: 'critical', issues_found: 'Hydraulic leak detected' })
    expect(res.status).toBe(201)

    const sqls = mockClient.query.mock.calls.map((c) => String(c[0]))
    expect(sqls.some((s) => s.includes('ASSET_CONDITION_ALERT'))).toBe(true)
  })

  it('does NOT insert alert outbox event for good condition', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [] })                                           // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 'report-1', overall_condition: 'good' }] }) // INSERT report
      .mockResolvedValueOnce({ rows: [] })                                           // COMMIT

    const res = await request(makeApp())
      .post('/assets/asset-1/condition-reports')
      .send({ overall_condition: 'good' })
    expect(res.status).toBe(201)

    const sqls = mockClient.query.mock.calls.map((c) => String(c[0]))
    expect(sqls.every((s) => !s.includes('ASSET_CONDITION_ALERT'))).toBe(true)
  })
})

describe('POST /assets/:id/condition-reports/:reportId/close', () => {
  it('rejects action_taken shorter than 10 chars', async () => {
    const res = await request(makeApp())
      .post('/assets/asset-1/condition-reports/rep-1/close')
      .send({ action_taken: 'Short' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('ACTION_REQUIRED')
  })

  it('closes report with valid action_taken', async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [] } as never)
    const res = await request(makeApp())
      .post('/assets/asset-1/condition-reports/rep-1/close')
      .send({ action_taken: 'Scheduled hydraulic service for next week' })
    expect(res.status).toBe(200)
    expect(res.body.data.message).toContain('closed')
  })
})

describe('GET /condition-reports/open', () => {
  it('returns open reports across all assets', async () => {
    vi.mocked(query).mockResolvedValueOnce({
      rows: [
        { id: 'r1', overall_condition: 'critical', status: 'open' },
        { id: 'r2', overall_condition: 'poor',     status: 'acknowledged' },
      ],
    } as never)

    const res = await request(makeApp()).get('/condition-reports/open')
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(2)
  })
})
