import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { pool } from '@fnc-erp/db'
import { createTestUser, cleanInventoryData } from './setup.js'

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
  await cleanInventoryData()
  await pool.end()
})

describe('Inventory service — performance', () => {
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

  it('GET /inventory/products — P95 < 150ms', async () => {
    const stats = await measure(async () => {
      const t = Date.now()
      const res = await request(app).get('/inventory/products').set('Authorization', `Bearer ${token}`)
      expect(res.status).toBe(200)
      return Date.now() - t
    })
    log('GET /inventory/products', stats)
    expect(stats.p95).toBeLessThan(150)
  })

  it('GET /inventory/locations — P95 < 100ms', async () => {
    const stats = await measure(async () => {
      const t = Date.now()
      const res = await request(app).get('/inventory/locations').set('Authorization', `Bearer ${token}`)
      expect(res.status).toBe(200)
      return Date.now() - t
    })
    log('GET /inventory/locations', stats)
    expect(stats.p95).toBeLessThan(100)
  })

  it('GET /inventory/balances — P95 < 200ms (aggregated stock view)', async () => {
    const stats = await measure(async () => {
      const t = Date.now()
      const res = await request(app).get('/inventory/balances').set('Authorization', `Bearer ${token}`)
      expect(res.status).toBe(200)
      return Date.now() - t
    })
    log('GET /inventory/balances', stats)
    expect(stats.p95).toBeLessThan(200)
  })

  it('GET /inventory/moves — P95 < 200ms (movement history)', async () => {
    const stats = await measure(async () => {
      const t = Date.now()
      const res = await request(app).get('/inventory/moves').set('Authorization', `Bearer ${token}`)
      expect(res.status).toBe(200)
      return Date.now() - t
    })
    log('GET /inventory/moves', stats)
    expect(stats.p95).toBeLessThan(200)
  })

  it('concurrent: 8 simultaneous GET /inventory/products — all complete < 500ms', async () => {
    await request(app).get('/inventory/products').set('Authorization', `Bearer ${token}`)

    const t = Date.now()
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        request(app).get('/inventory/products').set('Authorization', `Bearer ${token}`),
      ),
    )
    const elapsed = Date.now() - t

    for (const res of results) expect(res.status).toBe(200)
    console.log(`  concurrent 8×GET /inventory/products: ${elapsed}ms total`)
    expect(elapsed).toBeLessThan(500)
  })
})
