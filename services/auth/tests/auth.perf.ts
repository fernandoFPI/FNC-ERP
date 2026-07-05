import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { pool } from '@fnc-erp/db'
import { createTestUser, cleanTestData, TEST_USER_EMAIL, TEST_USER_PASSWORD, TEST_COMPANY_ID } from './setup.js'

const app = createApp()

// ── Timing utilities ──────────────────────────────────────────────────────────

function percentile(sorted: number[], p: number): number {
  const idx = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))]!
}

interface PerfStats { p50: number; p95: number; p99: number; mean: number; min: number; max: number }

async function measure(fn: () => Promise<number>, iterations = 30, warmup = 5): Promise<PerfStats> {
  for (let i = 0; i < warmup; i++) await fn()
  const times: number[] = []
  for (let i = 0; i < iterations; i++) times.push(await fn())
  times.sort((a, b) => a - b)
  const mean = times.reduce((s, t) => s + t, 0) / times.length
  return { p50: percentile(times, 50), p95: percentile(times, 95), p99: percentile(times, 99), mean, min: times[0]!, max: times[times.length - 1]! }
}

function log(label: string, s: PerfStats) {
  console.log(`  ${label}: min=${s.min}ms p50=${s.p50}ms p95=${s.p95}ms p99=${s.p99}ms max=${s.max}ms mean=${s.mean.toFixed(1)}ms`)
}

// ── Setup ─────────────────────────────────────────────────────────────────────

let token: string

beforeAll(async () => {
  await createTestUser()
  // Get a real token via login (ensures valid session for authenticated endpoint tests)
  const loginRes = await request(app)
    .post('/auth/login')
    .send({ email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD, company_id: TEST_COMPANY_ID })
  token = (loginRes.body.data as { accessToken: string }).accessToken
})

afterAll(async () => {
  await cleanTestData()
  await pool.end()
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Auth service — performance', () => {
  it('GET /health — P95 < 10ms', async () => {
    const stats = await measure(async () => {
      const t = Date.now()
      const res = await request(app).get('/health')
      expect(res.status).toBe(200)
      return Date.now() - t
    })
    log('GET /health', stats)
    expect(stats.p95).toBeLessThan(10)
  })

  it('GET /auth/me — P95 < 80ms', async () => {
    const stats = await measure(async () => {
      const t = Date.now()
      const res = await request(app).get('/auth/me').set('Authorization', `Bearer ${token}`)
      expect(res.status).toBe(200)
      return Date.now() - t
    })
    log('GET /auth/me', stats)
    expect(stats.p95).toBeLessThan(80)
  })

  it('GET /auth/me/companies — P95 < 80ms', async () => {
    const stats = await measure(async () => {
      const t = Date.now()
      const res = await request(app).get('/auth/me/companies').set('Authorization', `Bearer ${token}`)
      expect(res.status).toBe(200)
      return Date.now() - t
    })
    log('GET /auth/me/companies', stats)
    expect(stats.p95).toBeLessThan(80)
  })

  it('concurrent: 8 simultaneous GET /auth/me — all complete < 200ms', async () => {
    // Warmup
    await request(app).get('/auth/me').set('Authorization', `Bearer ${token}`)

    const t = Date.now()
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        request(app).get('/auth/me').set('Authorization', `Bearer ${token}`),
      ),
    )
    const elapsed = Date.now() - t

    for (const res of results) expect(res.status).toBe(200)
    console.log(`  concurrent 8×GET /auth/me: ${elapsed}ms total`)
    expect(elapsed).toBeLessThan(200)
  })

  // Run login benchmark last — it creates many sessions which evict earlier ones (MAX_SESSIONS_PER_USER=5)
  it('POST /auth/login — P95 < 800ms (bcrypt)', async () => {
    const stats = await measure(async () => {
      const t = Date.now()
      const res = await request(app)
        .post('/auth/login')
        .send({ email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD, company_id: TEST_COMPANY_ID })
      expect(res.status).toBe(200)
      return Date.now() - t
    }, 10, 2) // fewer iterations — bcrypt is expensive
    log('POST /auth/login', stats)
    expect(stats.p95).toBeLessThan(800)
  })
})
