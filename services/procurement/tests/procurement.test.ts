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

  it('POST /procurement/orders — rejects invalid vendor', async () => {
    const payload = poPayload()
    const res = await request(app)
      .post('/procurement/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...payload, vendor_id: '00000000-0000-0000-0000-000000000099' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_VENDOR')
  })

  it('POST /procurement/orders — rejects duplicate PO number', async () => {
    const payload = { ...poPayload(), po_number: 'TEST-DUP-PO' }
    await request(app).post('/procurement/orders').set('Authorization', `Bearer ${token}`).send(payload)
    const res = await request(app).post('/procurement/orders').set('Authorization', `Bearer ${token}`).send(payload)
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('DUPLICATE_PO')
  })

  it('POST /procurement/orders/:id/action — submit transitions draft to submitted', async () => {
    const createRes = await request(app)
      .post('/procurement/orders')
      .set('Authorization', `Bearer ${token}`)
      .send(poPayload())
    const poId = (createRes.body.data as { id: string }).id

    const actionRes = await request(app)
      .post(`/procurement/orders/${poId}/action`)
      .set('Authorization', `Bearer ${token}`)
      .send({ action: 'submit' })
    expect(actionRes.status).toBe(200)
    expect(actionRes.body.data.status).toBe('submitted')
  })

  it('POST /procurement/orders/:id/action — rejects invalid transition', async () => {
    const createRes = await request(app)
      .post('/procurement/orders')
      .set('Authorization', `Bearer ${token}`)
      .send(poPayload())
    const poId = (createRes.body.data as { id: string }).id

    const res = await request(app)
      .post(`/procurement/orders/${poId}/action`)
      .set('Authorization', `Bearer ${token}`)
      .send({ action: 'approve_l1' })
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('INVALID_TRANSITION')
  })

  it('Full PO lifecycle: draft → submitted → pending_review → under_review → approved_l1 → approved_l2 → ordered', async () => {
    const createRes = await request(app)
      .post('/procurement/orders')
      .set('Authorization', `Bearer ${token}`)
      .send(poPayload())
    const poId = (createRes.body.data as { id: string }).id

    const actions = ['submit', 'review', 'start_review', 'approve_l1', 'approve_l2', 'mark_ordered']
    let currentStatus = 'draft'
    for (const action of actions) {
      const res = await request(app)
        .post(`/procurement/orders/${poId}/action`)
        .set('Authorization', `Bearer ${token}`)
        .send({ action })
      expect(res.status).toBe(200)
      currentStatus = (res.body.data as { status: string }).status
    }
    expect(currentStatus).toBe('ordered')
  })
})
