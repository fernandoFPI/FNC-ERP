import request from 'supertest'
import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { pool } from '@fnc-erp/db'
import { createApp } from '../src/app.js'
import { createTestUser, cleanMfgData, TEST_COMPANY_ID, getOrCreateTestProduct } from './setup.js'

const app = createApp()
let token: string
let finishedProductId: string
let componentProductId: string
let wcId: string
let bomId: string

beforeAll(async () => {
  // Clean any leftover data from previous failed runs before starting
  await cleanMfgData()

  const user = await createTestUser()
  token = user.token

  finishedProductId = await getOrCreateTestProduct('TEST-FIN', 50000)
  componentProductId = await getOrCreateTestProduct('TEST-COMP', 10000)

  // Create a test work center
  const wcRes = await pool.query<{ id: string }>(
    `INSERT INTO work_centers (company_id, code, name, cost_per_hour, currency_code)
     VALUES ($1,'TEST-WC','Test Work Center',15000,'IQD')
     ON CONFLICT (company_id, code) DO UPDATE SET name='Test Work Center' RETURNING id`,
    [TEST_COMPANY_ID],
  )
  wcId = wcRes.rows[0]!['id']

  // Ensure stock for component product
  const warehouseLoc = await pool.query<{ id: string }>(
    `SELECT id FROM stock_locations WHERE company_id=$1 AND type='warehouse' LIMIT 1`, [TEST_COMPANY_ID],
  )
  if (warehouseLoc.rows[0]) {
    await pool.query(
      `INSERT INTO stock_balances (product_id, location_id, qty_on_hand, average_cost, qty_reserved)
       VALUES ($1,$2,10000,10000,0)
       ON CONFLICT (product_id, location_id, lot_id)
       DO UPDATE SET qty_on_hand=10000, average_cost=10000, qty_reserved=0`,
      [componentProductId, warehouseLoc.rows[0]['id']],
    )
  }
})

afterAll(async () => {
  await cleanMfgData()
  await pool.query(`DELETE FROM products WHERE company_id=$1 AND sku IN ('TEST-FIN','TEST-COMP')`, [TEST_COMPANY_ID])
})

describe('Manufacturing orders', () => {
  it('creates BOM with correct structure', async () => {
    const res = await request(app)
      .post('/manufacturing/boms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        finished_product_id: finishedProductId,
        name: 'TEST-BOM',
        qty_produced: 1,
        lines: [
          { component_product_id: componentProductId, qty_required: 5, uom: 'kg', work_center_id: wcId, operation_time_hours: 2 },
        ],
      })
    expect(res.status).toBe(201)
    bomId = res.body.data.id as string
    expect(bomId).toBeTruthy()
  })

  it('rejects circular BOM (component = finished product)', async () => {
    const res = await request(app)
      .post('/manufacturing/boms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        finished_product_id: finishedProductId,
        name: 'TEST-CIRCULAR',
        qty_produced: 1,
        lines: [{ component_product_id: finishedProductId, qty_required: 1 }],
      })
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('CIRCULAR_BOM')
  })

  it('creates MO with correct planned costs from BOM', async () => {
    const res = await request(app)
      .post('/manufacturing/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ bom_id: bomId, qty_planned: 2, dispatch_type: 'warehouse_first' })
    expect(res.status).toBe(201)
    // planned_cost = material(10000×5×2) + labour(15000×2×2) = 100000 + 60000 = 160000
    expect(parseFloat(res.body.data.planned_cost as string)).toBeCloseTo(160000, 0)
  })

  it('fetches MO list', async () => {
    const res = await request(app)
      .get('/manufacturing/orders')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
  })

  it('rejects MO completion if qty_produced > qty_planned', async () => {
    const createRes = await request(app)
      .post('/manufacturing/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ bom_id: bomId, qty_planned: 1, dispatch_type: 'warehouse_first' })
    expect(createRes.status).toBe(201)
    const moId = (createRes.body.data as { id: string }).id

    // Force MO to in_progress directly in DB (bypasses stock check in test environment)
    await pool.query(
      `UPDATE manufacturing_orders SET status='in_progress', actual_start=NOW() WHERE id=$1`,
      [moId],
    )

    const consumptions = await pool.query<{ id: string }>('SELECT id FROM mo_consumptions WHERE mo_id=$1', [moId])
    const res = await request(app)
      .post(`/manufacturing/orders/${moId}/complete`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        qty_produced: 999,
        consumptions: consumptions.rows.map(c => ({ mo_consumption_id: c['id'], qty_consumed: 5 })),
      })
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('EXCEEDS_PLANNED')
  })

  it('cancels MO from draft status', async () => {
    const createRes = await request(app)
      .post('/manufacturing/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ bom_id: bomId, qty_planned: 1, dispatch_type: 'warehouse_first' })
    expect(createRes.status).toBe(201)
    const moId = (createRes.body.data as { id: string }).id

    const cancelRes = await request(app)
      .post(`/manufacturing/orders/${moId}/cancel`)
      .set('Authorization', `Bearer ${token}`)
    expect(cancelRes.status).toBe(200)
    expect(cancelRes.body.data.status).toBe('cancelled')
  })
})
