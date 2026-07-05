import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { pool } from '@fnc-erp/db'
import { createTestUser, cleanProjectsData } from './setup.js'

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
let projectId: string

beforeAll(async () => {
  const user = await createTestUser()
  token = user.token

  // Seed a project for single-fetch benchmarks
  const res = await request(app)
    .post('/projects')
    .set('Authorization', `Bearer ${token}`)
    .send({
      code: 'TEST-PERF-001',
      name: 'Performance Test Project',
      project_type: 'construction',
      budget_amount: 50_000_000,
      budget_lines: [
        { category: 'materials', budgeted_amount: 30_000_000 },
        { category: 'labour', budgeted_amount: 20_000_000 },
      ],
    })
  projectId = (res.body.data as { id: string }).id
})

afterAll(async () => {
  await cleanProjectsData()
  await pool.end()
})

describe('Projects service — performance', () => {
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

  it('GET /projects — P95 < 200ms (paginated list with joins)', async () => {
    const stats = await measure(async () => {
      const t = Date.now()
      const res = await request(app).get('/projects').set('Authorization', `Bearer ${token}`)
      expect(res.status).toBe(200)
      return Date.now() - t
    })
    log('GET /projects', stats)
    expect(stats.p95).toBeLessThan(200)
  })

  it('GET /projects?page=1&limit=10 — P95 < 200ms', async () => {
    const stats = await measure(async () => {
      const t = Date.now()
      const res = await request(app).get('/projects?page=1&limit=10').set('Authorization', `Bearer ${token}`)
      expect(res.status).toBe(200)
      return Date.now() - t
    })
    log('GET /projects?page=1&limit=10', stats)
    expect(stats.p95).toBeLessThan(200)
  })

  it('GET /projects/:id — P95 < 150ms (single with subqueries)', async () => {
    const stats = await measure(async () => {
      const t = Date.now()
      const res = await request(app).get(`/projects/${projectId}`).set('Authorization', `Bearer ${token}`)
      expect(res.status).toBe(200)
      return Date.now() - t
    })
    log('GET /projects/:id', stats)
    expect(stats.p95).toBeLessThan(150)
  })

  it('GET /projects/:id/budget — P95 < 200ms (budget vs actual aggregation)', async () => {
    const stats = await measure(async () => {
      const t = Date.now()
      const res = await request(app).get(`/projects/${projectId}/budget`).set('Authorization', `Bearer ${token}`)
      expect(res.status).toBe(200)
      return Date.now() - t
    })
    log('GET /projects/:id/budget', stats)
    expect(stats.p95).toBeLessThan(200)
  })

  it('concurrent: 8 simultaneous GET /projects — all complete < 600ms', async () => {
    await request(app).get('/projects').set('Authorization', `Bearer ${token}`)

    const t = Date.now()
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        request(app).get('/projects').set('Authorization', `Bearer ${token}`),
      ),
    )
    const elapsed = Date.now() - t

    for (const res of results) expect(res.status).toBe(200)
    console.log(`  concurrent 8×GET /projects: ${elapsed}ms total`)
    expect(elapsed).toBeLessThan(600)
  })
})
