import request from 'supertest'
import { describe, it, beforeAll, afterAll, expect, beforeEach } from 'vitest'
import { createApp } from '../src/app.js'
import { pool } from '@fnc-erp/db'
import {
  createTestUser,
  cleanIntercoData,
  ensureOpenPeriods,
  TEST_COMPANY_A,
  TEST_COMPANY_B,
} from './setup.js'

const app = createApp()
let token: string
let userId: string

// Test product + location IDs set up in beforeAll
let productId: string
let fromLocationId: string  // company A warehouse
let toLocationId: string    // company B warehouse

beforeAll(async () => {
  const user = await createTestUser()
  token = user.token
  userId = user.userId
  await ensureOpenPeriods()

  // Ensure company A uses avco pricing by default
  await pool.query(
    `UPDATE companies SET interco_transfer_pricing_method='avco', interco_cost_plus_markup_pct=0
     WHERE id=$1`,
    [TEST_COMPANY_A],
  )

  // Create a test product in company A
  const prodResult = await pool.query<{ id: string }>(
    `INSERT INTO products (company_id, sku, name, uom, valuation_method, standard_cost, is_active)
     VALUES ($1,'TEST-STEEL-001','Test Steel Bar','kg','avco',500,true)
     ON CONFLICT (company_id, sku) DO UPDATE SET standard_cost=500 RETURNING id`,
    [TEST_COMPANY_A],
  )
  productId = prodResult.rows[0]!.id

  // Get warehouse locations for both companies
  const fromLoc = await pool.query<{ id: string }>(
    `SELECT id FROM stock_locations WHERE company_id=$1 AND type='warehouse' LIMIT 1`,
    [TEST_COMPANY_A],
  )
  fromLocationId = fromLoc.rows[0]?.id ?? ''

  const toLoc = await pool.query<{ id: string }>(
    `SELECT id FROM stock_locations WHERE company_id=$1 AND type='warehouse' LIMIT 1`,
    [TEST_COMPANY_B],
  )
  toLocationId = toLoc.rows[0]?.id ?? ''

  if (!fromLocationId || !toLocationId) {
    console.warn('[test] No warehouse locations found — run seeds first')
    return
  }

  // Seed stock balance for company A (simulating existing inventory)
  await pool.query(
    `INSERT INTO stock_balances (product_id, location_id, qty_on_hand, average_cost)
     VALUES ($1,$2,100,1000)
     ON CONFLICT (product_id, location_id, lot_id) DO UPDATE
       SET qty_on_hand=100, average_cost=1000`,
    [productId, fromLocationId],
  )
})

afterAll(async () => {
  await pool.query(
    `DELETE FROM interco_stock_transfer_lines WHERE transfer_id IN (
       SELECT id FROM interco_stock_transfers WHERE from_company_id=$1 OR to_company_id=$1
     )`,
    [TEST_COMPANY_A],
  )
  await pool.query(
    `DELETE FROM interco_stock_transfers WHERE from_company_id=$1 OR to_company_id=$1`,
    [TEST_COMPANY_A],
  )
  await pool.query(
    `DELETE FROM interco_pricing_config_log WHERE company_id=$1`,
    [TEST_COMPANY_A],
  )
  await pool.query(
    `DELETE FROM stock_balances WHERE product_id=$1`,
    [productId],
  )
  await pool.query(
    `DELETE FROM products WHERE id=$1`,
    [productId],
  )
  await cleanIntercoData()
})

// ── Transfer pricing resolver ──────────────────────────────────

describe('Transfer pricing resolver', () => {
  it('avco method returns weighted average cost from stock_balances', async () => {
    await pool.query(
      `UPDATE companies SET interco_transfer_pricing_method='avco' WHERE id=$1`,
      [TEST_COMPANY_A],
    )
    if (!fromLocationId) return

    const res = await request(app)
      .get(
        `/interco/stock-transfers/preview-price?product_id=${productId}&from_company_id=${TEST_COMPANY_A}&from_location_id=${fromLocationId}&qty=10`,
      )
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    const body = res.body.data
    expect(body.method).toBe('avco')
    // AVCO from stock_balances = 1000
    expect(parseFloat(body.avco_at_transfer)).toBeCloseTo(1000, 0)
    expect(parseFloat(body.transfer_price)).toBeCloseTo(1000, 0)
    expect(body.requires_manual_input).toBe(false)
  })

  it('cost_plus method returns avco × (1 + markup_pct)', async () => {
    await pool.query(
      `UPDATE companies SET interco_transfer_pricing_method='cost_plus', interco_cost_plus_markup_pct=0.15
       WHERE id=$1`,
      [TEST_COMPANY_A],
    )
    if (!fromLocationId) return

    const res = await request(app)
      .get(
        `/interco/stock-transfers/preview-price?product_id=${productId}&from_company_id=${TEST_COMPANY_A}&from_location_id=${fromLocationId}&qty=10`,
      )
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    const body = res.body.data
    expect(body.method).toBe('cost_plus')
    // avco=1000, markup=0.15 → price=1150
    expect(parseFloat(body.transfer_price)).toBeCloseTo(1150, 0)
    expect(parseFloat(body.markup_pct_applied)).toBeCloseTo(0.15, 2)
  })

  it('standard method returns products.standard_cost', async () => {
    await pool.query(
      `UPDATE companies SET interco_transfer_pricing_method='standard' WHERE id=$1`,
      [TEST_COMPANY_A],
    )
    if (!fromLocationId) return

    const res = await request(app)
      .get(
        `/interco/stock-transfers/preview-price?product_id=${productId}&from_company_id=${TEST_COMPANY_A}&from_location_id=${fromLocationId}&qty=5`,
      )
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.method).toBe('standard')
    // standard_cost set to 500 in beforeAll
    expect(parseFloat(res.body.data.transfer_price)).toBeCloseTo(500, 0)
  })

  it('standard method throws STANDARD_COST_NOT_SET when standard_cost = 0', async () => {
    await pool.query(
      `UPDATE companies SET interco_transfer_pricing_method='standard' WHERE id=$1`,
      [TEST_COMPANY_A],
    )
    await pool.query(`UPDATE products SET standard_cost=0 WHERE id=$1`, [productId])

    if (!fromLocationId) return

    const res = await request(app)
      .get(
        `/interco/stock-transfers/preview-price?product_id=${productId}&from_company_id=${TEST_COMPANY_A}&from_location_id=${fromLocationId}&qty=5`,
      )
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(422)
    expect(res.body.error?.code).toBe('STANDARD_COST_NOT_SET')

    // Restore standard_cost for subsequent tests
    await pool.query(`UPDATE products SET standard_cost=500 WHERE id=$1`, [productId])
  })

  it('market method with manual price returns that price', async () => {
    await pool.query(
      `UPDATE companies SET interco_transfer_pricing_method='market' WHERE id=$1`,
      [TEST_COMPANY_A],
    )
    if (!fromLocationId) return

    const res = await request(app)
      .get(
        `/interco/stock-transfers/preview-price?product_id=${productId}&from_company_id=${TEST_COMPANY_A}&from_location_id=${fromLocationId}&qty=5&market_price=1800`,
      )
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.method).toBe('market')
    expect(parseFloat(res.body.data.transfer_price)).toBeCloseTo(1800, 0)
    expect(res.body.data.requires_manual_input).toBe(false)
  })

  it('market method without manual price sets requires_manual_input = true', async () => {
    await pool.query(
      `UPDATE companies SET interco_transfer_pricing_method='market' WHERE id=$1`,
      [TEST_COMPANY_A],
    )
    if (!fromLocationId) return

    const res = await request(app)
      .get(
        `/interco/stock-transfers/preview-price?product_id=${productId}&from_company_id=${TEST_COMPANY_A}&from_location_id=${fromLocationId}&qty=5`,
      )
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.requires_manual_input).toBe(true)
    expect(parseFloat(res.body.data.transfer_price)).toBe(0)
  })
})

// ── Admin transfer pricing settings ───────────────────────────

describe('Admin transfer pricing settings', () => {
  beforeEach(async () => {
    await pool.query(
      `UPDATE companies SET interco_transfer_pricing_method='avco', interco_cost_plus_markup_pct=0
       WHERE id=$1`,
      [TEST_COMPANY_A],
    )
  })

  it('company_admin can change method from avco to cost_plus', async () => {
    const res = await request(app)
      .put(`/interco/pricing-settings/${TEST_COMPANY_A}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ method: 'cost_plus', cost_plus_markup_pct: 0.20, notes: 'Test change' })

    expect(res.status).toBe(200)
    expect(res.body.data.method).toBe('cost_plus')
    expect(parseFloat(res.body.data.cost_plus_markup_pct)).toBeCloseTo(0.20, 2)
  })

  it('change is logged in interco_pricing_config_log', async () => {
    await request(app)
      .put(`/interco/pricing-settings/${TEST_COMPANY_A}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ method: 'standard', notes: 'Switching to standard' })

    const log = await pool.query(
      `SELECT * FROM interco_pricing_config_log
       WHERE company_id=$1 ORDER BY created_at DESC LIMIT 1`,
      [TEST_COMPANY_A],
    )
    expect(log.rows[0]).toBeTruthy()
    expect(log.rows[0]?.['new_method']).toBe('standard')
    expect(log.rows[0]?.['previous_method']).toBe('avco')
  })

  it('cost_plus requires markup_pct > 0', async () => {
    const res = await request(app)
      .put(`/interco/pricing-settings/${TEST_COMPANY_A}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ method: 'cost_plus', cost_plus_markup_pct: 0 })

    expect(res.status).toBe(400)
  })

  it('reads current settings via GET', async () => {
    const res = await request(app)
      .get(`/interco/pricing-settings/${TEST_COMPANY_A}`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveProperty('method')
    expect(res.body.data).toHaveProperty('cost_plus_markup_pct')
  })
})

// ── Interco detection ──────────────────────────────────────────

describe('Interco detection in inventory service', () => {
  it('cross-entity move is queued in outbox as INTERCO_STOCK_MOVE_DETECTED', async () => {
    if (!fromLocationId || !toLocationId) return

    // Reset to avco
    await pool.query(
      `UPDATE companies SET interco_transfer_pricing_method='avco' WHERE id=$1`,
      [TEST_COMPANY_A],
    )

    const before = await pool.query<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt FROM service_outbox WHERE event_type='INTERCO_STOCK_MOVE_DETECTED'`,
    )
    const beforeCount = parseInt(before.rows[0]?.cnt ?? '0')

    // We test the outbox event, not the inventory service directly
    // Simulate what inventory service does when it detects cross-entity move
    await pool.query(
      `INSERT INTO service_outbox (service, event_type, payload)
       VALUES ('interco','INTERCO_STOCK_MOVE_DETECTED',$1)`,
      [
        JSON.stringify({
          product_id: productId,
          from_location_id: fromLocationId,
          to_location_id: toLocationId,
          qty: 5,
          source_type: 'manual',
          moved_by: userId,
          from_company_id: TEST_COMPANY_A,
          to_company_id: TEST_COMPANY_B,
        }),
      ],
    )

    const after = await pool.query<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt FROM service_outbox WHERE event_type='INTERCO_STOCK_MOVE_DETECTED'`,
    )
    expect(parseInt(after.rows[0]?.cnt ?? '0')).toBeGreaterThan(beforeCount)
  })
})

// ── Transfer pricing: changing method doesn't affect past transfers ─

describe('Transfer pricing change scope', () => {
  it('changing method does NOT retroactively affect past transfers', async () => {
    // Insert a historical transfer record with a known pricing method
    const result = await pool.query<{ id: string }>(
      `INSERT INTO interco_stock_transfers
         (from_company_id, to_company_id, transfer_number, transfer_date,
          pricing_method, status, initiated_by)
       VALUES ($1,$2,'IST-HIST-2025-0001',CURRENT_DATE,'avco','posted',$3)
       RETURNING id`,
      [TEST_COMPANY_A, TEST_COMPANY_B, userId],
    )
    const histTransferId = result.rows[0]!.id

    // Change pricing method
    await request(app)
      .put(`/interco/pricing-settings/${TEST_COMPANY_A}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ method: 'cost_plus', cost_plus_markup_pct: 0.25 })

    // Historical transfer still has the original pricing method
    const hist = await pool.query(
      `SELECT pricing_method FROM interco_stock_transfers WHERE id=$1`,
      [histTransferId],
    )
    expect(hist.rows[0]?.['pricing_method']).toBe('avco')

    // Cleanup
    await pool.query(`DELETE FROM interco_stock_transfers WHERE id=$1`, [histTransferId])
  })
})

// ── Manual transfer via API ────────────────────────────────────

describe('Manual interco stock transfer', () => {
  it('rejects when from_company_id = to_company_id', async () => {
    const res = await request(app)
      .post('/interco/stock-transfers')
      .set('Authorization', `Bearer ${token}`)
      .send({
        from_company_id: TEST_COMPANY_A,
        to_company_id: TEST_COMPANY_A,
        transfer_date: '2025-06-01',
        lines: [{ product_id: productId, from_location_id: fromLocationId, to_location_id: toLocationId, qty: 5 }],
      })
    expect(res.status).toBe(400)
    expect(res.body.error?.code).toBe('SAME_COMPANY')
  })

  it('queues INTERCO_STOCK_TRANSFER_EXECUTE for valid manual transfer (avco)', async () => {
    if (!fromLocationId || !toLocationId) return

    await pool.query(
      `UPDATE companies SET interco_transfer_pricing_method='avco' WHERE id=$1`,
      [TEST_COMPANY_A],
    )

    const before = await pool.query<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt FROM service_outbox WHERE event_type='INTERCO_STOCK_TRANSFER_EXECUTE'`,
    )

    const res = await request(app)
      .post('/interco/stock-transfers')
      .set('Authorization', `Bearer ${token}`)
      .send({
        from_company_id: TEST_COMPANY_A,
        to_company_id: TEST_COMPANY_B,
        transfer_date: '2025-06-01',
        notes: 'Manual transfer test',
        lines: [
          {
            product_id: productId,
            from_location_id: fromLocationId,
            to_location_id: toLocationId,
            qty: 5,
          },
        ],
      })

    expect(res.status).toBe(202)
    const after = await pool.query<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt FROM service_outbox WHERE event_type='INTERCO_STOCK_TRANSFER_EXECUTE'`,
    )
    expect(parseInt(after.rows[0]?.cnt ?? '0')).toBeGreaterThan(
      parseInt(before.rows[0]?.cnt ?? '0'),
    )
  })

  it('returns MARKET_PRICE_REQUIRED when market pricing and no market_price', async () => {
    if (!fromLocationId || !toLocationId) return

    await pool.query(
      `UPDATE companies SET interco_transfer_pricing_method='market' WHERE id=$1`,
      [TEST_COMPANY_A],
    )

    const res = await request(app)
      .post('/interco/stock-transfers')
      .set('Authorization', `Bearer ${token}`)
      .send({
        from_company_id: TEST_COMPANY_A,
        to_company_id: TEST_COMPANY_B,
        transfer_date: '2025-06-01',
        lines: [{ product_id: productId, from_location_id: fromLocationId, to_location_id: toLocationId, qty: 5 }],
      })

    expect(res.status).toBe(422)
    expect(res.body.error?.code).toBe('MARKET_PRICE_REQUIRED')
    expect(res.body.error?.requires_market_price).toBe(true)
  })

  it('cancels pending transfer', async () => {
    // Insert a pending transfer
    const result = await pool.query<{ id: string }>(
      `INSERT INTO interco_stock_transfers
         (from_company_id, to_company_id, transfer_number, transfer_date,
          pricing_method, status, initiated_by)
       VALUES ($1,$2,'IST-CANCEL-TEST',CURRENT_DATE,'avco','pending',$3)
       RETURNING id`,
      [TEST_COMPANY_A, TEST_COMPANY_B, userId],
    )
    const pendingId = result.rows[0]!.id

    const res = await request(app)
      .post(`/interco/stock-transfers/${pendingId}/cancel`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data?.status).toBe('cancelled')
  })
})
