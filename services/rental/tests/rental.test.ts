import request from 'supertest'
import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { pool } from '@fnc-erp/db'
import { createApp } from '../src/app.js'
import { createTestUser, cleanRentalData, TEST_COMPANY_ID } from './setup.js'

const app = createApp()
let token: string
let assetId: string
let contractId: string

beforeAll(async () => {
  await cleanRentalData() // clear any stale data from previous runs
  const user = await createTestUser()
  token = user.token
})

afterAll(async () => {
  await cleanRentalData()
})

describe('Equipment rental', () => {
  it('creates asset with status=available', async () => {
    const res = await request(app)
      .post('/rental/assets')
      .set('Authorization', `Bearer ${token}`)
      .send({
        asset_number: 'TEST-CRANE-001',
        name: 'Test Tower Crane',
        category: 'crane',
        daily_rate: 500_000,
        currency_code: 'IQD',
      })
    expect(res.status).toBe(201)
    expect(res.body.data.status).toBe('available')
    assetId = res.body.data.id as string
  })

  it('creates contract and sets asset to rented', async () => {
    const res = await request(app)
      .post('/rental/contracts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        rental_type: 'external',
        client_name: 'Test Client LLC',
        billing_cycle: 'monthly',
        rate_amount: 15_000_000,
        currency_code: 'IQD',
        start_date: '2026-06-01',
        lines: [{ asset_id: assetId, qty: 1, daily_rate: 500_000 }],
      })
    expect(res.status).toBe(201)
    contractId = res.body.data.id as string

    // Asset should now be rented
    const assetRes = await request(app).get(`/rental/assets/${assetId}`).set('Authorization', `Bearer ${token}`)
    expect(assetRes.body.data.status).toBe('rented')
  })

  it('prevents renting an asset already on active contract', async () => {
    // Create second asset and try to create contract for already-rented assetId
    const res = await request(app)
      .post('/rental/contracts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        rental_type: 'external',
        client_name: 'Another Client',
        billing_cycle: 'monthly',
        rate_amount: 5_000_000,
        currency_code: 'IQD',
        start_date: '2026-06-01',
        lines: [{ asset_id: assetId, qty: 1, daily_rate: 500_000 }],
      })
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('ASSET_NOT_AVAILABLE')
  })

  it('activates contract', async () => {
    const res = await request(app).post(`/rental/contracts/${contractId}/activate`).set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('active')
  })

  it('creates invoice for billing period', async () => {
    const res = await request(app)
      .post(`/rental/contracts/${contractId}/invoices`)
      .set('Authorization', `Bearer ${token}`)
      .send({ billing_period_start: '2026-06-01', billing_period_end: '2026-06-30' })
    expect(res.status).toBe(201)
    expect(res.body.data.days_billed).toBe(29)  // 29 days from Jun 1 to Jun 30
    // amount = 29 × 500_000 × 1 = 14_500_000
    expect(parseFloat(res.body.data.amount as string)).toBe(14_500_000)
  })

  it('completing contract releases assets back to available', async () => {
    const res = await request(app).post(`/rental/contracts/${contractId}/complete`).set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('completed')

    const assetRes = await pool.query<{ status: string }>('SELECT status FROM equipment_assets WHERE id=$1', [assetId])
    expect(assetRes.rows[0]?.status).toBe('available')
  })

  it('cancelling contract also releases assets', async () => {
    // Create a new asset and contract to cancel
    const assetRes = await request(app)
      .post('/rental/assets')
      .set('Authorization', `Bearer ${token}`)
      .send({ asset_number: 'TEST-EXCAV-001', name: 'Test Excavator', daily_rate: 300_000, currency_code: 'IQD' })
    const aid = (assetRes.body.data as { id: string }).id

    const cRes = await request(app)
      .post('/rental/contracts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        rental_type: 'external', client_name: 'Client X', billing_cycle: 'monthly',
        rate_amount: 9_000_000, currency_code: 'IQD', start_date: '2026-07-01',
        lines: [{ asset_id: aid, qty: 1, daily_rate: 300_000 }],
      })
    const cid = (cRes.body.data as { id: string }).id

    await request(app).post(`/rental/contracts/${cid}/cancel`).set('Authorization', `Bearer ${token}`).send({ reason: 'Client withdrew' })

    const assetCheck = await pool.query<{ status: string }>('SELECT status FROM equipment_assets WHERE id=$1', [aid])
    expect(assetCheck.rows[0]?.status).toBe('available')
  })
})
