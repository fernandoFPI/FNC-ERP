import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { pool } from '@fnc-erp/db'
import { TEST_COMPANY_ID, createTestUser, cleanProcurementData, createTestVendor } from './setup.js'

const app = createApp()
let token: string
let vendorId: string

beforeAll(async () => {
  const user = await createTestUser()
  token = user.token
  vendorId = await createTestVendor()
})

afterAll(async () => {
  await cleanProcurementData()
  await pool.end()
})

// ── Health ─────────────────────────────────────────────────────────────────────

describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body.service).toBe('procurement')
  })
})

// ── Vendors ────────────────────────────────────────────────────────────────────

describe('Vendors', () => {
  it('GET /procurement/vendors — returns vendors', async () => {
    const res = await request(app).get('/procurement/vendors').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
    expect(res.body.data.length).toBeGreaterThan(0)
  })

  it('GET /procurement/vendors/:id — 404 for unknown vendor', async () => {
    const res = await request(app)
      .get('/procurement/vendors/00000000-0000-0000-0000-000000000099')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(404)
  })

  it('POST /procurement/vendors — creates vendor', async () => {
    const res = await request(app)
      .post('/procurement/vendors')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Test Vendor New', currency_code: 'IQD', payment_terms_days: 30 })
    expect(res.status).toBe(201)
    expect(res.body.data.name).toBe('Test Vendor New')
  })
})

// ── Purchase Orders ────────────────────────────────────────────────────────────

describe('Purchase Orders', () => {
  const poPayload = () => ({
    po_number: `TEST-PO-${Date.now()}`,
    vendor_id: vendorId,
    currency_code: 'IQD',
    lines: [
      { line_number: 1, description: 'Test Item', qty_ordered: 10, unit_price: 5000 },
    ],
  })

  beforeEach(async () => {
    await pool.query(`DELETE FROM po_approval_log WHERE po_id IN (SELECT id FROM purchase_orders WHERE company_id = $1 AND po_number LIKE 'TEST-%')`, [TEST_COMPANY_ID])
    await pool.query(`DELETE FROM po_lines WHERE po_id IN (SELECT id FROM purchase_orders WHERE company_id = $1 AND po_number LIKE 'TEST-%')`, [TEST_COMPANY_ID])
    await pool.query(`DELETE FROM purchase_orders WHERE company_id = $1 AND po_number LIKE 'TEST-%'`, [TEST_COMPANY_ID])
  })

  it('POST /procurement/orders — creates PO in draft status', async () => {
    const res = await request(app)
      .post('/procurement/orders')
      .set('Authorization', `Bearer ${token}`)
      .send(poPayload())
    expect(res.status).toBe(201)
    expect(res.body.data.status).toBe('draft')
    expect(res.body.data.lines).toHaveLength(1)
  })

  it('POST /procurement/orders — rejects invalid currency_code', async () => {
    const res = await request(app)
      .post('/procurement/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...poPayload(), currency_code: 'US' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('POST /procurement/orders — rejects invalid project_id format', async () => {
    const res = await request(app)
      .post('/procurement/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...poPayload(), project_id: 'not-a-uuid' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('POST /:id/submit-to-inventory-check — transitions draft to inventory_check', async () => {
    const createRes = await request(app)
      .post('/procurement/orders')
      .set('Authorization', `Bearer ${token}`)
      .send(poPayload())
    const poId = (createRes.body.data as { id: string }).id

    const actionRes = await request(app)
      .post(`/procurement/orders/${poId}/submit-to-inventory-check`)
      .set('Authorization', `Bearer ${token}`)
    expect(actionRes.status).toBe(200)

    const getRes = await request(app)
      .get(`/procurement/orders/${poId}`)
      .set('Authorization', `Bearer ${token}`)
    expect(getRes.body.data.status).toBe('inventory_check')
  })

  it('POST /:id/submit-to-inventory-check — rejects when PO is not in draft state', async () => {
    const createRes = await request(app)
      .post('/procurement/orders')
      .set('Authorization', `Bearer ${token}`)
      .send(poPayload())
    const poId = (createRes.body.data as { id: string }).id

    // Advance to inventory_check
    await request(app).post(`/procurement/orders/${poId}/submit-to-inventory-check`).set('Authorization', `Bearer ${token}`)

    // Try again — wrong state
    const res = await request(app)
      .post(`/procurement/orders/${poId}/submit-to-inventory-check`)
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('INVALID_STATUS')
  })

  it('Full PO lifecycle: draft → inventory_check → store_pricing → market_pricing → price_verification → pending_approval → approved', async () => {
    const createRes = await request(app)
      .post('/procurement/orders')
      .set('Authorization', `Bearer ${token}`)
      .send(poPayload())
    const poId = (createRes.body.data as { id: string }).id

    let r = await request(app).post(`/procurement/orders/${poId}/submit-to-inventory-check`).set('Authorization', `Bearer ${token}`)
    expect(r.status).toBe(200)

    r = await request(app).post(`/procurement/orders/${poId}/confirm-inventory-check`).set('Authorization', `Bearer ${token}`)
    expect(r.status).toBe(200)

    r = await request(app).post(`/procurement/orders/${poId}/submit-store-pricing`).set('Authorization', `Bearer ${token}`)
    expect(r.status).toBe(200)

    r = await request(app).post(`/procurement/orders/${poId}/submit-market-pricing`).set('Authorization', `Bearer ${token}`)
    expect(r.status).toBe(200)

    r = await request(app).post(`/procurement/orders/${poId}/submit-price-verification`).set('Authorization', `Bearer ${token}`)
    expect(r.status).toBe(200)

    r = await request(app).post(`/procurement/orders/${poId}/approve`).set('Authorization', `Bearer ${token}`)
    expect(r.status).toBe(200)

    const getRes = await request(app).get(`/procurement/orders/${poId}`).set('Authorization', `Bearer ${token}`)
    expect(getRes.body.data.status).toBe('approved')
  })
})
