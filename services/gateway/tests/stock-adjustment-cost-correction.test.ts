// Coverage for a real gap: stock that arrives with no cost (an uncosted
// opening balance, a manual adjustment with no price entered) stays at a
// $0 last cost forever, since nothing in this system ever retroactively
// revalues existing stock_balances rows — only a NEW stock move with a real
// unit_cost does, and createStockAdjustment used to treat "same qty, new
// cost" as a pure no-op (the frontend even disabled the submit button for
// it). Fixed by letting that same-qty case post a same-location "self move"
// for the full current qty at the new cost, so it goes through the exact
// trigger every other cost update goes through. Real-Postgres pattern, same
// as cancel-material-issue-reservation.test.ts.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'

const TEST_COMPANY_ID = '00000000-0000-0000-0000-000000000001'
const TEST_USER_EMAIL = 'stock-adjustment-cost-correction-test@fnc-erp.local'
const SKU_PREFIX = 'COSTCORRECTTEST-'

let userId: string
let warehouseId: string
let virtualInId: string
let ctx: { auth: { companyId: string; userId: string; role: string; module: string; sessionId: string } }

async function makeProduct(suffix: string): Promise<string> {
  const sku = `${SKU_PREFIX}${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const r = await pool.query<{ id: string }>(
    `INSERT INTO products (company_id, sku, name, uom, category) VALUES ($1,$2,$3,'unit','general') RETURNING id`,
    [TEST_COMPANY_ID, sku, sku],
  )
  return r.rows[0]!.id
}

// Mirrors an uncosted opening balance / adjustment: the very first move for
// this product carries unit_cost=0, so stock_balances lands at qty>0,
// average_cost=0 — exactly the state 122 real production products are
// currently stuck in.
async function receiveUncosted(productId: string, qty: number): Promise<void> {
  await pool.query(
    `INSERT INTO stock_moves (company_id, product_id, from_location_id, to_location_id, moved_at, qty, unit_cost, total_cost, source_type, moved_by)
     VALUES ($1,$2,$3,$4,NOW(),$5,0,0,'opening_balance',$6)`,
    [TEST_COMPANY_ID, productId, virtualInId, warehouseId, qty, userId],
  )
}

async function getBalance(productId: string): Promise<{ qty: number; cost: number }> {
  const r = await pool.query<{ qty_on_hand: string; average_cost: string }>(
    `SELECT qty_on_hand, average_cost FROM stock_balances WHERE product_id=$1 AND location_id=$2 AND lot_id IS NULL`,
    [productId, warehouseId],
  )
  return {
    qty: parseFloat(r.rows[0]?.qty_on_hand ?? '0'),
    cost: parseFloat(r.rows[0]?.average_cost ?? '0'),
  }
}

async function cleanup(): Promise<void> {
  await pool.query(
    `DELETE FROM stock_moves WHERE product_id IN (SELECT id FROM products WHERE sku LIKE $1)`,
    [`${SKU_PREFIX}%`],
  )
  await pool.query(
    `DELETE FROM stock_balances WHERE product_id IN (SELECT id FROM products WHERE sku LIKE $1)`,
    [`${SKU_PREFIX}%`],
  )
  await pool.query(`DELETE FROM products WHERE sku LIKE $1`, [`${SKU_PREFIX}%`])
}

beforeAll(async () => {
  const userR = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [TEST_USER_EMAIL],
  )
  userId = userR.rows[0]!.id
  ctx = {
    auth: { companyId: TEST_COMPANY_ID, userId, role: 'system_admin', module: 'all', sessionId: 'cost-correction-test' },
  }

  const wh = await pool.query<{ id: string }>(
    `SELECT id FROM stock_locations WHERE company_id=$1 AND type='warehouse' AND is_active=true LIMIT 1`,
    [TEST_COMPANY_ID],
  )
  if (!wh.rows[0]) throw new Error('No warehouse location seeded for test company — run seeds first')
  warehouseId = wh.rows[0].id

  const vi = await pool.query<{ id: string }>(
    `SELECT id FROM stock_locations WHERE company_id=$1 AND type='virtual_in' AND is_active=true LIMIT 1`,
    [TEST_COMPANY_ID],
  )
  if (!vi.rows[0]) throw new Error('No virtual_in location seeded for test company — run seeds first')
  virtualInId = vi.rows[0].id

  await cleanup()
})

afterAll(async () => {
  await cleanup()
  await pool.query(`DELETE FROM users WHERE email=$1`, [TEST_USER_EMAIL])
  await pool.end()
})

describe('createStockAdjustment — cost-only correction (same qty, new cost)', () => {
  it('corrects an uncosted balance to a real cost without changing qty_on_hand', async () => {
    const productId = await makeProduct('basic-correction')
    await receiveUncosted(productId, 5)
    expect(await getBalance(productId)).toEqual({ qty: 5, cost: 0 })

    const result = (await resolvers.Mutation.createStockAdjustment(
      null,
      { input: { product_id: productId, location_id: warehouseId, new_qty: 5, unit_cost: 45 } },
      ctx as never,
    )) as { id: string | null; source_type: string; qty: string; unit_cost?: string }

    expect(result.id).not.toBeNull()
    expect(result.source_type).toBe('cost_correction')

    const after = await getBalance(productId)
    expect(after.qty).toBe(5)
    expect(after.cost).toBe(45)
  })

  it('records a real, auditable stock_moves row for the correction (from==to, qty==current on-hand)', async () => {
    const productId = await makeProduct('audit-trail')
    await receiveUncosted(productId, 12)

    await resolvers.Mutation.createStockAdjustment(
      null,
      {
        input: {
          product_id: productId,
          location_id: warehouseId,
          new_qty: 12,
          unit_cost: 7.5,
          notes: 'Backfilling real cost from vendor invoice',
        },
      },
      ctx as never,
    )

    // Filtered by source_type, not just "most recent" — the uncosted
    // receive above and this correction can land in the same millisecond,
    // and moved_at alone isn't a reliable tie-breaker between them.
    const moves = await pool.query<{
      from_location_id: string
      to_location_id: string
      qty: string
      unit_cost: string
      total_cost: string
      source_type: string
      notes: string
    }>(
      `SELECT from_location_id, to_location_id, qty, unit_cost, total_cost, source_type, notes
       FROM stock_moves WHERE product_id=$1 AND source_type='cost_correction'`,
      [productId],
    )
    expect(moves.rows).toHaveLength(1)
    const move = moves.rows[0]!
    expect(move.from_location_id).toBe(warehouseId)
    expect(move.to_location_id).toBe(warehouseId)
    expect(parseFloat(move.qty)).toBe(12)
    expect(parseFloat(move.unit_cost)).toBe(7.5)
    expect(parseFloat(move.total_cost)).toBeCloseTo(90, 5)
    expect(move.source_type).toBe('cost_correction')
    expect(move.notes).toBe('Backfilling real cost from vendor invoice')
  })

  it('stays a true no-op when qty is unchanged and no cost (or the same cost) is given', async () => {
    const productId = await makeProduct('true-noop')
    await receiveUncosted(productId, 8)

    const noCost = (await resolvers.Mutation.createStockAdjustment(
      null,
      { input: { product_id: productId, location_id: warehouseId, new_qty: 8 } },
      ctx as never,
    )) as { id: string | null }
    expect(noCost.id).toBeNull()
    expect(await getBalance(productId)).toEqual({ qty: 8, cost: 0 })

    // Now give it a real cost, then submit the identical cost again.
    await resolvers.Mutation.createStockAdjustment(
      null,
      { input: { product_id: productId, location_id: warehouseId, new_qty: 8, unit_cost: 20 } },
      ctx as never,
    )
    const sameCostAgain = (await resolvers.Mutation.createStockAdjustment(
      null,
      { input: { product_id: productId, location_id: warehouseId, new_qty: 8, unit_cost: 20 } },
      ctx as never,
    )) as { id: string | null }
    expect(sameCostAgain.id).toBeNull()
    expect(await getBalance(productId)).toEqual({ qty: 8, cost: 20 })
  })

  it('throws a clear error rather than a raw constraint violation when there is no on-hand qty to correct', async () => {
    const productId = await makeProduct('zero-qty')
    // No receipt at all — qty_on_hand is 0 (no stock_balances row exists yet).

    await expect(
      resolvers.Mutation.createStockAdjustment(
        null,
        { input: { product_id: productId, location_id: warehouseId, new_qty: 0, unit_cost: 15 } },
        ctx as never,
      ),
    ).rejects.toThrow(/No on-hand quantity to correct cost for/i)
  })

  it('still syncs the product-level Cost even when it already matches this location\'s own average_cost', async () => {
    // The unified product Cost (products.standard_cost) can diverge from a
    // single location's stock_balances.average_cost — e.g. a manual edit,
    // or stock that arrived via an interco transfer, which prices
    // stock_balances directly without going through recordProductCostChange.
    // Simulate that divergence directly, then submit a correction whose
    // value happens to equal THIS location's cost but not the product's.
    const productId = await makeProduct('product-vs-location-divergence')
    await receiveUncosted(productId, 4)
    await resolvers.Mutation.createStockAdjustment(
      null,
      { input: { product_id: productId, location_id: warehouseId, new_qty: 4, unit_cost: 45 } },
      ctx as never,
    )
    expect(await getBalance(productId)).toEqual({ qty: 4, cost: 45 })

    await pool.query(`UPDATE products SET standard_cost=99, cost_currency='IQD' WHERE id=$1`, [productId])

    const beforeMoves = await pool.query(
      `SELECT count(*)::int AS n FROM stock_moves WHERE product_id=$1 AND source_type='cost_correction'`,
      [productId],
    )

    const result = (await resolvers.Mutation.createStockAdjustment(
      null,
      { input: { product_id: productId, location_id: warehouseId, new_qty: 4, unit_cost: 45 } },
      ctx as never,
    )) as { id: string | null }

    // This location's own ledger has nothing to correct (45 already there),
    // so no new stock_moves row — but the product-level Cost, which had
    // drifted to 99, must still be brought back in line with 45.
    expect(result.id).toBeNull()
    const afterMoves = await pool.query(
      `SELECT count(*)::int AS n FROM stock_moves WHERE product_id=$1 AND source_type='cost_correction'`,
      [productId],
    )
    expect(afterMoves.rows[0]!.n).toBe(beforeMoves.rows[0]!.n)

    const product = await pool.query<{ standard_cost: string }>(
      `SELECT standard_cost FROM products WHERE id=$1`,
      [productId],
    )
    expect(parseFloat(product.rows[0]!.standard_cost)).toBe(45)
  })

  it('a real quantity change with a cost still works exactly as before (unaffected by this fix)', async () => {
    const productId = await makeProduct('qty-change-unaffected')
    await receiveUncosted(productId, 3)

    const result = (await resolvers.Mutation.createStockAdjustment(
      null,
      { input: { product_id: productId, location_id: warehouseId, new_qty: 10, unit_cost: 6 } },
      ctx as never,
    )) as { id: string | null; source_type: string }

    expect(result.id).not.toBeNull()
    expect(result.source_type).toBe('adjustment')
    expect(await getBalance(productId)).toEqual({ qty: 10, cost: 6 })
  })
})
