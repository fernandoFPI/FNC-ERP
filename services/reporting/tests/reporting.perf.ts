import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { pool } from '@fnc-erp/db'
import { createTestUser, cleanReportingData, TEST_COMPANY_ID } from './setup.js'

const app = createApp()

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

let token: string

beforeAll(async () => {
  const user = await createTestUser()
  token = user.token
})

afterAll(async () => {
  await cleanReportingData()
  await pool.end()
})

describe('Reporting service — performance', () => {
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

  it('GET /reporting/trial-balance — P95 < 300ms (entity financial report)', async () => {
    const stats = await measure(async () => {
      const t = Date.now()
      const res = await request(app)
        .get(`/reporting/trial-balance?from_date=2025-01-01&to_date=2025-12-31`)
        .set('Authorization', `Bearer ${token}`)
      expect(res.status).toBe(200)
      return Date.now() - t
    })
    log('GET /reporting/trial-balance', stats)
    expect(stats.p95).toBeLessThan(300)
  })

  it('GET /reporting/profit-loss — P95 < 300ms', async () => {
    const stats = await measure(async () => {
      const t = Date.now()
      const res = await request(app)
        .get(`/reporting/profit-loss?from_date=2025-01-01&to_date=2025-12-31`)
        .set('Authorization', `Bearer ${token}`)
      expect(res.status).toBe(200)
      return Date.now() - t
    })
    log('GET /reporting/profit-loss', stats)
    expect(stats.p95).toBeLessThan(300)
  })

  it('GET /reporting/balance-sheet — P95 < 300ms', async () => {
    const stats = await measure(async () => {
      const t = Date.now()
      const res = await request(app)
        .get(`/reporting/balance-sheet?as_of=2025-12-31`)
        .set('Authorization', `Bearer ${token}`)
      expect(res.status).toBe(200)
      return Date.now() - t
    })
    log('GET /reporting/balance-sheet', stats)
    expect(stats.p95).toBeLessThan(300)
  })

  it('GET /reporting/consolidated/trial-balance — P95 < 400ms (cross-entity aggregation)', async () => {
    const stats = await measure(async () => {
      const t = Date.now()
      const res = await request(app)
        .get(`/reporting/consolidated/trial-balance?from_date=2025-01-01&to_date=2025-12-31`)
        .set('Authorization', `Bearer ${token}`)
      expect(res.status).toBe(200)
      return Date.now() - t
    })
    log('GET /reporting/consolidated/trial-balance', stats)
    expect(stats.p95).toBeLessThan(400)
  })

  it('concurrent: 8 simultaneous GET /reporting/trial-balance — all complete < 800ms', async () => {
    await request(app)
      .get('/reporting/trial-balance?from_date=2025-01-01&to_date=2025-12-31')
      .set('Authorization', `Bearer ${token}`)

    const t = Date.now()
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        request(app)
          .get('/reporting/trial-balance?from_date=2025-01-01&to_date=2025-12-31')
          .set('Authorization', `Bearer ${token}`),
      ),
    )
    const elapsed = Date.now() - t

    for (const res of results) expect(res.status).toBe(200)
    console.log(`  concurrent 8×GET /reporting/trial-balance: ${elapsed}ms total`)
    expect(elapsed).toBeLessThan(800)
  })
})
