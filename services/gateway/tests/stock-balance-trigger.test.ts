// Covers migration 254's negative-balance guard directly at the trigger
// level (update_stock_balance()) — deliberately below the resolver layer,
// since the whole point of this guard is to be the backstop for a write
// path that skips the G9 resolver guards (a bypassed check, a future call
// site someone forgets to lock). Real Postgres connection, not mocked —
// same reasoning as po-stock-locking.test.ts.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'

const TEST_COMPANY_ID = '00000000-0000-0000-0000-000000000001'
const TEST_USER_EMAIL = 'g9-trigger-test@fnc-erp.local'
const SKU_PREFIX = 'G9TRIGTEST-'

let userId: string
let warehouseId: string
let warehouseName: string
let virtualInId: string
let virtualOutId: string
let transitId: string

async function makeProduct(suffix: string): Promise<{ id: string; sku: string }> {
  const sku = `${SKU_PREFIX}${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const r = await pool.query<{ id: string }>(
    `INSERT INTO products (company_id, sku, name, uom, category) VALUES ($1,$2,$3,'unit','general') RETURNING id`,
    [TEST_COMPANY_ID, sku, sku],
  )
  return { id: r.rows[0]!.id, sku }
}

async function attemptMove(fromLocationId: string, toLocationId: string, productId: string, qty: number) {
  return pool.query(
    `INSERT INTO stock_moves (company_id, product_id, from_location_id, to_location_id, moved_at, qty, unit_cost, total_cost, source_type, moved_by)
     VALUES ($1,$2,$3,$4,NOW(),$5,1,$5,'manual',$6)`,
    [TEST_COMPANY_ID, productId, fromLocationId, toLocationId, qty, userId],
  )
}

async function balanceAt(productId: string, locationId: string): Promise<number> {
  const r = await pool.query<{ qty_on_hand: string }>(
    `SELECT qty_on_hand FROM stock_balances WHERE product_id=$1 AND location_id=$2 AND lot_id IS NULL`,
    [productId, locationId],
  )
  return parseFloat(r.rows[0]?.qty_on_hand ?? '0')
}

async function cleanup(): Promise<void> {
  await pool.query(
    `DELETE FROM stock_moves WHERE company_id=$1 AND product_id IN (SELECT id FROM products WHERE company_id=$1 AND sku LIKE $2)`,
    [TEST_COMPANY_ID, `${SKU_PREFIX}%`],
  )
  await pool.query(
    `DELETE FROM stock_balances WHERE product_id IN (SELECT id FROM products WHERE company_id=$1 AND sku LIKE $2)`,
    [TEST_COMPANY_ID, `${SKU_PREFIX}%`],
  )
  await pool.query(`DELETE FROM products WHERE company_id=$1 AND sku LIKE $2`, [TEST_COMPANY_ID, `${SKU_PREFIX}%`])
  await pool.query(`DELETE FROM stock_locations WHERE company_id=$1 AND name=$2`, [
    TEST_COMPANY_ID,
    'G9 Trigger Test Transit',
  ])
}

beforeAll(async () => {
  const userR = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [TEST_USER_EMAIL],
  )
  userId = userR.rows[0]!.id

  const whR = await pool.query<{ id: string; name: string }>(
    `SELECT id, name FROM stock_locations WHERE company_id=$1 AND type='warehouse' AND is_active=true LIMIT 1`,
    [TEST_COMPANY_ID],
  )
  warehouseId = whR.rows[0]!.id
  warehouseName = whR.rows[0]!.name

  const viR = await pool.query<{ id: string }>(
    `SELECT id FROM stock_locations WHERE company_id=$1 AND type='virtual_in' AND is_active=true LIMIT 1`,
    [TEST_COMPANY_ID],
  )
  virtualInId = viR.rows[0]!.id

  const voR = await pool.query<{ id: string }>(
    `SELECT id FROM stock_locations WHERE company_id=$1 AND type='virtual_out' AND is_active=true LIMIT 1`,
    [TEST_COMPANY_ID],
  )
  virtualOutId = voR.rows[0]!.id

  await cleanup()
  const transitR = await pool.query<{ id: string }>(
    `INSERT INTO stock_locations (company_id, name, type, is_active) VALUES ($1,'G9 Trigger Test Transit','transit',true) RETURNING id`,
    [TEST_COMPANY_ID],
  )
  transitId = transitR.rows[0]!.id
})

afterAll(async () => {
  await cleanup()
  await pool.query(`DELETE FROM users WHERE email=$1`, [TEST_USER_EMAIL])
  await pool.end()
})

describe('update_stock_balance() negative-balance guard (migration 254)', () => {
  it('blocks a move that would take a warehouse location negative, naming the product and location', async () => {
    const { id: productId, sku } = await makeProduct('warehouse')
    // No prior receipt — warehouse starts at 0 for this product, so any
    // outbound move takes it negative.
    let error: Error | undefined
    try {
      await attemptMove(warehouseId, virtualOutId, productId, 1)
    } catch (e) {
      error = e as Error
    }
    expect(error).toBeDefined()
    expect(error!.message).toMatch(/insufficient stock/i)
    // The point of this fix: it names the actual product and location
    // involved, not just "check constraint violated".
    expect(error!.message).toContain(sku)
    expect(error!.message).toContain(warehouseName)
    expect(await balanceAt(productId, warehouseId)).toBe(0)
  })

  it('allows a move that takes a transit location negative', async () => {
    const { id: productId } = await makeProduct('transit')
    await attemptMove(transitId, warehouseId, productId, 1)
    expect(await balanceAt(productId, transitId)).toBe(-1)
  })

  it('allows a move that takes a virtual_in location negative', async () => {
    const { id: productId } = await makeProduct('virtualin')
    await attemptMove(virtualInId, warehouseId, productId, 1)
    expect(await balanceAt(productId, virtualInId)).toBe(-1)
  })
})
