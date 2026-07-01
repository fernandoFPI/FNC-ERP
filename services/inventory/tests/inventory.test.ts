import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { pool } from '@fnc-erp/db'
import {
  TEST_COMPANY_ID, createTestUser, cleanInventoryData, getWarehouseLocationId, getVirtualInLocationId,
} from './setup.js'

const app = createApp()
let token: string
let warehouseLocId: string
let virtualInLocId: string

beforeAll(async () => {
  const user = await createTestUser()
  token = user.token
  warehouseLocId = await getWarehouseLocationId()
  virtualInLocId = await getVirtualInLocationId()
})

afterAll(async () => {
  await cleanInventoryData()
  await pool.end()
})

// ── Health ─────────────────────────────────────────────────────────────────────

describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body.service).toBe('inventory')
  })
})

// ── Products ───────────────────────────────────────────────────────────────────

describe('Products', () => {
  beforeEach(async () => {
    await pool.query(`DELETE FROM products WHERE company_id = $1 AND sku LIKE 'TEST-%'`, [TEST_COMPANY_ID])
  })

  it('POST /inventory/products — creates product', async () => {
    const res = await request(app)
      .post('/inventory/products')
      .set('Authorization', `Bearer ${token}`)
      .send({ sku: 'TEST-PROD-001', name: 'Test Product', uom: 'unit', valuation_method: 'avco' })
    expect(res.status).toBe(201)
    expect(res.body.data.sku).toBe('TEST-PROD-001')
  })

  it('POST /inventory/products — rejects duplicate SKU', async () => {
    await request(app)
      .post('/inventory/products')
      .set('Authorization', `Bearer ${token}`)
      .send({ sku: 'TEST-DUP-001', name: 'Dup', uom: 'unit' })
    const res = await request(app)
      .post('/inventory/products')
      .set('Authorization', `Bearer ${token}`)
      .send({ sku: 'TEST-DUP-001', name: 'Dup Again', uom: 'unit' })
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('DUPLICATE_SKU')
  })

  it('GET /inventory/products — returns products', async () => {
    const res = await request(app)
      .get('/inventory/products')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
  })

  it('GET /inventory/products/:id — 404 for unknown', async () => {
    const res = await request(app)
      .get('/inventory/products/00000000-0000-0000-0000-000000000099')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(404)
  })
})

// ── Locations ──────────────────────────────────────────────────────────────────

describe('Locations', () => {
  it('GET /inventory/locations — returns seeded locations', async () => {
    const res = await request(app)
      .get('/inventory/locations')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.data.length).toBeGreaterThan(0)
  })
})

// ── Stock Moves ────────────────────────────────────────────────────────────────

describe('Stock moves', () => {
  let productId: string

  beforeEach(async () => {
    await pool.query(`DELETE FROM stock_moves WHERE company_id = $1`, [TEST_COMPANY_ID])
    await pool.query(`DELETE FROM stock_balances WHERE product_id IN (SELECT id FROM products WHERE company_id = $1 AND sku = 'TEST-MOVE-001')`, [TEST_COMPANY_ID])
    await pool.query(`DELETE FROM products WHERE company_id = $1 AND sku = 'TEST-MOVE-001'`, [TEST_COMPANY_ID])

    const p = await pool.query<{ id: string }>(
      `INSERT INTO products (company_id, sku, name, uom) VALUES ($1,'TEST-MOVE-001','Move Test Product','unit') RETURNING id`,
      [TEST_COMPANY_ID],
    )
    productId = p.rows[0]!.id
  })

  it('POST /inventory/moves — creates move from virtual_in to warehouse', async () => {
    const res = await request(app)
      .post('/inventory/moves')
      .set('Authorization', `Bearer ${token}`)
      .send({
        product_id: productId,
        from_location_id: virtualInLocId,
        to_location_id: warehouseLocId,
        qty: 10,
        unit_cost: 1000,
      })
    expect(res.status).toBe(201)
    expect(parseFloat(res.body.data.qty)).toBe(10)
  })

  it('POST /inventory/moves — rejects insufficient stock', async () => {
    const res = await request(app)
      .post('/inventory/moves')
      .set('Authorization', `Bearer ${token}`)
      .send({
        product_id: productId,
        from_location_id: warehouseLocId,
        to_location_id: virtualInLocId,
        qty: 999,
        unit_cost: 0,
      })
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('INSUFFICIENT_STOCK')
  })

  it('POST /inventory/moves — rejects same from/to location', async () => {
    const res = await request(app)
      .post('/inventory/moves')
      .set('Authorization', `Bearer ${token}`)
      .send({
        product_id: productId,
        from_location_id: warehouseLocId,
        to_location_id: warehouseLocId,
        qty: 5,
      })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('SAME_LOCATION')
  })
})

// ── Balances ───────────────────────────────────────────────────────────────────

describe('Stock balances', () => {
  it('GET /inventory/balances — returns balance rows', async () => {
    const res = await request(app)
      .get('/inventory/balances')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
  })
})
