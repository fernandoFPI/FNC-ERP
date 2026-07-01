// Top-level vi.mock calls are hoisted before imports

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
    SERVICE_TOKEN: 'service-token-change-in-prod-min32chars-padding',
    HR_SERVICE_URL: 'http://localhost:3004',
    PROJECTS_SERVICE_URL: 'http://localhost:3006',
    LOG_LEVEL: 'error',
    SERVICE_NAME: 'gateway-test',
  },
}))

vi.mock('@fnc-erp/db', () => ({
  pool: { query: vi.fn(), connect: vi.fn() },
  query: vi.fn(),
  withTransaction: vi.fn(),
  buildHealthStatus: vi.fn(),
}))

vi.mock('@fnc-erp/logger', () => ({
  logger: {
    child: () => ({
      info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
    }),
  },
  requestLogger: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  createServiceLogger: () => ({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
  }),
}))

vi.mock('@fnc-erp/auth', () => ({
  requireAuth: () => (req: Record<string, unknown>, _res: unknown, next: () => void) => {
    req['auth'] = {
      userId: 'user-1',
      companyId: 'company-1',
      role: 'user',
      module: 'all',
      sessionId: 'session-1',
      ipAddress: '127.0.0.1',
      userAgent: 'test',
    }
    next()
  },
  requireRole: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}))

import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { pool, query } from '@fnc-erp/db'
import { mobileSyncRouter } from '../src/routes/mobile-sync.js'

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/mobile', mobileSyncRouter)
  return app
}

// ── Sync endpoint ─────────────────────────────────────────────
describe('GET /mobile/sync', () => {
  beforeEach(() => {
    vi.mocked(query).mockReset()
    vi.mocked(pool.query).mockReset()
  })

  it('returns 400 when device_id is missing', async () => {
    const app = makeApp()
    const res = await request(app).get('/mobile/sync')
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('MISSING_DEVICE_ID')
  })

  it('returns sync payload with syncedAt and changes', async () => {
    // profile query
    vi.mocked(query).mockResolvedValue({ rows: [{ id: 'emp-1', first_name: 'Ali', last_name: 'Hassan', employee_number: 'E001', contract_type: 'full_time', updated_at: new Date().toISOString() }] } as never)
    // all entity queries → empty
    vi.mocked(pool.query).mockResolvedValue({ rows: [] } as never)

    const app = makeApp()
    const res = await request(app).get('/mobile/sync?device_id=device-1&entities=profile')

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toHaveProperty('syncedAt')
    expect(res.body.data).toHaveProperty('changes')
  })

  it('handles empty since param as full sync', async () => {
    vi.mocked(query).mockResolvedValue({ rows: [] } as never)
    vi.mocked(pool.query).mockResolvedValue({ rows: [] } as never)

    const app = makeApp()
    const res = await request(app).get('/mobile/sync?device_id=device-1')
    expect(res.status).toBe(200)
  })

  it('only syncs requested entities', async () => {
    vi.mocked(query).mockResolvedValue({ rows: [] } as never)
    vi.mocked(pool.query).mockResolvedValue({ rows: [] } as never)

    const app = makeApp()
    const res = await request(app).get('/mobile/sync?device_id=device-1&entities=profile,leave')

    expect(res.status).toBe(200)
    const changeKeys = Object.keys(res.body.data.changes)
    expect(changeKeys).toContain('profile')
    expect(changeKeys).toContain('leave')
    expect(changeKeys).not.toContain('products')
  })
})

// ── Offline action submission ─────────────────────────────────
describe('POST /mobile/actions', () => {
  beforeEach(() => {
    vi.mocked(pool.query).mockReset()
    vi.mocked(query).mockReset()
  })

  it('returns 400 when no actions provided', async () => {
    const app = makeApp()
    const res = await request(app)
      .post('/mobile/actions')
      .send({ actions: [], device_id: 'device-1' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('NO_ACTIONS')
  })

  it('returns 400 when more than 50 actions submitted', async () => {
    const actions = Array.from({ length: 51 }, (_, i) => ({
      client_id: `cid-${i}`,
      action_type: 'punch_in',
      payload: {},
      action_taken_at: new Date().toISOString(),
    }))

    const app = makeApp()
    const res = await request(app)
      .post('/mobile/actions')
      .send({ actions, device_id: 'device-1' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('TOO_MANY_ACTIONS')
  })

  it('marks duplicate action as duplicate when already in log', async () => {
    vi.stubGlobal('fetch', vi.fn())
    // Dedup check returns an existing row
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ id: 'existing' }] } as never)  // dedup check
      .mockResolvedValueOnce({ rows: [] } as never)                     // audit insert

    const app = makeApp()
    const res = await request(app)
      .post('/mobile/actions')
      .send({
        actions: [{
          client_id: 'dup-client-id',
          action_type: 'punch_in',
          payload: {},
          action_taken_at: new Date().toISOString(),
        }],
        device_id: 'device-1',
      })

    expect(res.status).toBe(200)
    const result = res.body.data.results[0]
    expect(result.status).toBe('duplicate')
  })

  it('returns conflict when OT request already actioned on server', async () => {
    vi.stubGlobal('fetch', vi.fn())
    const requestId = 'ot-request-id'
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [] } as never)                              // dedup check — not a dup
      .mockResolvedValueOnce({ rows: [{ id: requestId, status: 'approved' }] } as never) // OT status check
      .mockResolvedValueOnce({ rows: [] } as never)                              // audit insert

    const app = makeApp()
    const res = await request(app)
      .post('/mobile/actions')
      .send({
        actions: [{
          client_id: 'new-client-id',
          action_type: 'approve_overtime',
          payload: { overtime_request_id: requestId },
          action_taken_at: new Date().toISOString(),
        }],
        device_id: 'device-1',
      })

    expect(res.status).toBe(200)
    const result = res.body.data.results[0]
    expect(result.status).toBe('conflict')
    expect(result.rejection_reason).toContain('approved')
  })

  it('processes OT approval when request is still pending', async () => {
    const requestId = 'ot-pending-id'
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [] } as never)                              // dedup
      .mockResolvedValueOnce({ rows: [{ id: requestId, status: 'pending' }] } as never) // OT status
      .mockResolvedValueOnce({ rows: [] } as never)                              // UPDATE
      .mockResolvedValueOnce({ rows: [] } as never)                              // audit insert

    const app = makeApp()
    const res = await request(app)
      .post('/mobile/actions')
      .send({
        actions: [{
          client_id: 'approve-client-id',
          action_type: 'approve_overtime',
          payload: { overtime_request_id: requestId },
          action_taken_at: new Date().toISOString(),
        }],
        device_id: 'device-1',
      })

    expect(res.status).toBe(200)
    const result = res.body.data.results[0]
    expect(result.status).toBe('processed')
    expect(result.record_id).toBe(requestId)
  })

  it('processes leave rejection when request is still pending', async () => {
    const requestId = 'leave-pending-id'
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [] } as never)                              // dedup
      .mockResolvedValueOnce({ rows: [{ id: requestId, status: 'pending' }] } as never) // leave status
      .mockResolvedValueOnce({ rows: [] } as never)                              // UPDATE
      .mockResolvedValueOnce({ rows: [] } as never)                              // audit insert

    const app = makeApp()
    const res = await request(app)
      .post('/mobile/actions')
      .send({
        actions: [{
          client_id: 'reject-leave-id',
          action_type: 'reject_leave',
          payload: { leave_request_id: requestId, review_notes: 'Staffing issues' },
          action_taken_at: new Date().toISOString(),
        }],
        device_id: 'device-1',
      })

    expect(res.status).toBe(200)
    expect(res.body.data.results[0].status).toBe('processed')
  })

  it('rejects material issue when stock is insufficient', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [] } as never)                         // dedup
      .mockResolvedValueOnce({ rows: [{ qty_on_hand: '5' }] } as never)    // stock balance
      .mockResolvedValueOnce({ rows: [] } as never)                         // audit insert

    const app = makeApp()
    const res = await request(app)
      .post('/mobile/actions')
      .send({
        actions: [{
          client_id: 'material-client-id',
          action_type: 'create_material_issue',
          payload: {
            project_id: 'proj-1',
            issue_date: '2026-06-04',
            lines: [{ product_id: 'prod-1', from_location_id: 'loc-1', qty_issued: 10 }],
          },
          action_taken_at: new Date().toISOString(),
        }],
        device_id: 'device-1',
      })

    expect(res.status).toBe(200)
    const result = res.body.data.results[0]
    expect(result.status).toBe('rejected')
    expect(result.rejection_reason).toContain('Insufficient stock')
  })

  it('sorts multiple actions by action_taken_at before processing', async () => {
    const processedOrder: string[] = []

    vi.mocked(pool.query).mockImplementation(async (sql: unknown) => {
      const sqlStr = String(sql)
      if (sqlStr.includes('offline_action_log') && sqlStr.includes('SELECT')) {
        return { rows: [] } as never // dedup check
      }
      if (sqlStr.includes('overtime_requests') && sqlStr.includes('SELECT')) {
        return { rows: [{ id: 'ot-id', status: 'pending' }] } as never
      }
      if (sqlStr.includes('leave_requests') && sqlStr.includes('SELECT')) {
        return { rows: [{ id: 'leave-id', status: 'pending' }] } as never
      }
      if (sqlStr.includes('UPDATE')) {
        // Track which update ran by checking the mock call order
        processedOrder.push(sqlStr.includes('overtime') ? 'ot' : 'leave')
      }
      return { rows: [] } as never
    })

    const earlier = new Date(Date.now() - 60_000).toISOString()
    const later = new Date().toISOString()

    const app = makeApp()
    await request(app)
      .post('/mobile/actions')
      .send({
        actions: [
          // Submit in reverse order — should be sorted before processing
          {
            client_id: 'second',
            action_type: 'approve_leave',
            payload: { leave_request_id: 'leave-id' },
            action_taken_at: later,
          },
          {
            client_id: 'first',
            action_type: 'approve_overtime',
            payload: { overtime_request_id: 'ot-id' },
            action_taken_at: earlier,
          },
        ],
        device_id: 'device-1',
      })

    // OT (earlier timestamp) should have been processed first
    expect(processedOrder[0]).toBe('ot')
  })
})

// ── Sync protocol helpers (pure) ─────────────────────────────
describe('Sync protocol — delta logic', () => {
  it('since=epoch means full sync (no time filter applied)', async () => {
    vi.mocked(query).mockResolvedValue({ rows: [] } as never)
    vi.mocked(pool.query).mockResolvedValue({ rows: [] } as never)

    const app = makeApp()
    const res = await request(app).get('/mobile/sync?device_id=d1&entities=products')
    expect(res.status).toBe(200)
  })

  it('since timestamp is respected — passes to query', async () => {
    let capturedParam: unknown = null
    vi.mocked(query).mockImplementation(async (_sql, params) => {
      capturedParam = (params as unknown[])[1]
      return { rows: [] } as never
    })
    vi.mocked(pool.query).mockResolvedValue({ rows: [] } as never)

    const since = '2026-01-01T00:00:00Z'
    const app = makeApp()
    await request(app).get(`/mobile/sync?device_id=d1&entities=locations&since=${since}`)

    expect(capturedParam).not.toBeNull()
    expect(new Date(String(capturedParam)).getFullYear()).toBe(2026)
  })
})
