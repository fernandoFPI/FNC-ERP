// Integration tests for G1 Phase 2 PR 1: createRequisition,
// submitRequisitionToInventoryCheck, confirmRequisitionInventoryCheck.
// Same real-Postgres pattern as po-stock-locking.test.ts (confirmPOInventoryCheck's
// reservation logic, which this mirrors almost exactly) — deliberately not
// mocking @fnc-erp/db.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'

const TEST_COMPANY_ID = '00000000-0000-0000-0000-000000000001'
const TEST_USER_EMAIL = 'g1-requisition-test@fnc-erp.local'
const SKU_PREFIX = 'G1TEST-'

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

async function receive(productId: string, locationId: string, qty: number, unitCost = 10): Promise<void> {
  await pool.query(
    `INSERT INTO stock_moves (company_id, product_id, from_location_id, to_location_id, moved_at, qty, unit_cost, total_cost, source_type, moved_by)
     VALUES ($1,$2,$3,$4,NOW(),$5,$6,$7,'po_receipt',$8)`,
    [TEST_COMPANY_ID, productId, virtualInId, locationId, qty, unitCost, qty * unitCost, userId],
  )
}

async function getBalance(productId: string, locationId: string): Promise<{ onHand: number; reserved: number }> {
  const r = await pool.query<{ qty_on_hand: string; qty_reserved: string }>(
    `SELECT qty_on_hand, qty_reserved FROM stock_balances WHERE product_id=$1 AND location_id=$2 AND lot_id IS NULL`,
    [productId, locationId],
  )
  return {
    onHand: parseFloat(r.rows[0]?.qty_on_hand ?? '0'),
    reserved: parseFloat(r.rows[0]?.qty_reserved ?? '0'),
  }
}

async function cleanup(): Promise<void> {
  // Scoped by organizer_id, not requisition_number — createRequisition
  // always mints a real REQ-<year>-<seq> number via nextDocumentNumber
  // (the actual production code path, deliberately not test-overridable),
  // so a REQ_PREFIX-based LIKE filter can never match anything real.
  await pool.query(
    `DELETE FROM requisition_approval_log WHERE requisition_id IN (SELECT id FROM requisitions WHERE company_id=$1 AND organizer_id=$2)`,
    [TEST_COMPANY_ID, userId],
  )
  await pool.query(
    `DELETE FROM po_lines WHERE requisition_id IN (SELECT id FROM requisitions WHERE company_id=$1 AND organizer_id=$2)`,
    [TEST_COMPANY_ID, userId],
  )
  await pool.query(`DELETE FROM requisitions WHERE company_id=$1 AND organizer_id=$2`, [
    TEST_COMPANY_ID,
    userId,
  ])
  await pool.query(
    `DELETE FROM stock_moves WHERE company_id=$1 AND product_id IN (SELECT id FROM products WHERE company_id=$1 AND sku LIKE $2)`,
    [TEST_COMPANY_ID, `${SKU_PREFIX}%`],
  )
  await pool.query(
    `DELETE FROM stock_balances WHERE product_id IN (SELECT id FROM products WHERE company_id=$1 AND sku LIKE $2)`,
    [TEST_COMPANY_ID, `${SKU_PREFIX}%`],
  )
  await pool.query(`DELETE FROM products WHERE company_id=$1 AND sku LIKE $2`, [TEST_COMPANY_ID, `${SKU_PREFIX}%`])
  // Extra location the byLocation-sort-order test creates.
  await pool.query(`DELETE FROM stock_locations WHERE company_id=$1 AND name=$2`, [
    TEST_COMPANY_ID,
    `${SKU_PREFIX}SecondWH`,
  ])
}

beforeAll(async () => {
  const userR = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [TEST_USER_EMAIL],
  )
  userId = userR.rows[0]!.id
  ctx = { auth: { companyId: TEST_COMPANY_ID, userId, role: 'system_admin', module: 'all', sessionId: 'g1-test' } }

  const whR = await pool.query<{ id: string }>(
    `SELECT id FROM stock_locations WHERE company_id=$1 AND type='warehouse' AND is_active=true LIMIT 1`,
    [TEST_COMPANY_ID],
  )
  if (!whR.rows[0]) throw new Error('No warehouse location seeded for test company — run seeds first')
  warehouseId = whR.rows[0].id

  const viR = await pool.query<{ id: string }>(
    `SELECT id FROM stock_locations WHERE company_id=$1 AND type='virtual_in' AND is_active=true LIMIT 1`,
    [TEST_COMPANY_ID],
  )
  if (!viR.rows[0]) throw new Error('No virtual_in location seeded for test company — run seeds first')
  virtualInId = viR.rows[0].id

  await cleanup()
})

afterAll(async () => {
  await cleanup()
  await pool.query(`DELETE FROM users WHERE email=$1`, [TEST_USER_EMAIL])
  await pool.end()
})

describe('createRequisition', () => {
  it('creates a requisition with a fresh REQ- number and its lines, all requisition-scoped with no child PO yet', async () => {
    const productId = await makeProduct('create')
    const created = await resolvers.Mutation.createRequisition(
      null,
      { input: { purpose: 'stock', lines: [{ product_id: productId, description: 'test line', qty: 5, unit_price: 10 }] } },
      ctx as never,
    )
    expect((created as { status: string }).status).toBe('draft')
    expect((created as { requisition_number: string }).requisition_number).toMatch(/^REQ-/)

    const lines = await pool.query<{ requisition_id: string; po_id: string | null }>(
      `SELECT requisition_id, po_id FROM po_lines WHERE requisition_id=$1`,
      [(created as { id: string }).id],
    )
    expect(lines.rows).toHaveLength(1)
    expect(lines.rows[0]!.requisition_id).toBe((created as { id: string }).id)
    expect(lines.rows[0]!.po_id).toBeNull()
  })

  it('rejects a requisition with no lines', async () => {
    await expect(
      resolvers.Mutation.createRequisition(null, { input: { purpose: 'stock', lines: [] } }, ctx as never),
    ).rejects.toThrow(/at least one line/i)
  })
})

describe('submitRequisitionToInventoryCheck', () => {
  it('transitions draft -> inventory_check and logs it', async () => {
    const productId = await makeProduct('submit')
    const created = await resolvers.Mutation.createRequisition(
      null,
      { input: { purpose: 'stock', lines: [{ product_id: productId, description: 'x', qty: 1, unit_price: 1 }] } },
      ctx as never,
    )
    const reqId = (created as { id: string }).id

    const updated = await resolvers.Mutation.submitRequisitionToInventoryCheck(
      null,
      { id: reqId },
      ctx as never,
    )
    expect((updated as { status: string }).status).toBe('inventory_check')

    const log = await pool.query<{ action: string; from_status: string; to_status: string }>(
      `SELECT action, from_status, to_status FROM requisition_approval_log WHERE requisition_id=$1`,
      [reqId],
    )
    expect(log.rows).toHaveLength(1)
    expect(log.rows[0]).toEqual({
      action: 'submit_to_inventory_check',
      from_status: 'draft',
      to_status: 'inventory_check',
    })
  })

  it('rejects submitting from a status other than draft', async () => {
    const productId = await makeProduct('badstatus')
    const created = await resolvers.Mutation.createRequisition(
      null,
      { input: { purpose: 'stock', lines: [{ product_id: productId, description: 'x', qty: 1, unit_price: 1 }] } },
      ctx as never,
    )
    const reqId = (created as { id: string }).id
    await resolvers.Mutation.submitRequisitionToInventoryCheck(null, { id: reqId }, ctx as never)

    await expect(
      resolvers.Mutation.submitRequisitionToInventoryCheck(null, { id: reqId }, ctx as never),
    ).rejects.toThrow(/expected 'draft', got 'inventory_check'/i)
  })
})

describe('confirmRequisitionInventoryCheck reservation', () => {
  async function makeReqAtInventoryCheck(productId: string, qtyOrdered: number) {
    const created = await resolvers.Mutation.createRequisition(
      null,
      { input: { purpose: 'stock', lines: [{ product_id: productId, description: 'x', qty: qtyOrdered, unit_price: 10 }] } },
      ctx as never,
    )
    const reqId = (created as { id: string }).id
    await resolvers.Mutation.submitRequisitionToInventoryCheck(null, { id: reqId }, ctx as never)
    const lineRow = await pool.query<{ id: string }>(`SELECT id FROM po_lines WHERE requisition_id=$1`, [reqId])
    return { reqId, lineId: lineRow.rows[0]!.id }
  }

  it('reserves stock, zeroes the line total when fully covered, and moves to store_pricing', async () => {
    const productId = await makeProduct('reserve')
    await receive(productId, warehouseId, 20)
    const { reqId, lineId } = await makeReqAtInventoryCheck(productId, 5)

    const result = await resolvers.Mutation.confirmRequisitionInventoryCheck(
      null,
      { id: reqId, lineStockQtys: [{ lineId, qtyFromStock: 5, sourceLocationId: warehouseId }] },
      ctx as never,
    )
    expect((result as { status: string }).status).toBe('store_pricing')

    const bal = await getBalance(productId, warehouseId)
    expect(bal.reserved).toBe(5)
    expect(bal.onHand).toBe(20) // reservation never touches on_hand

    const line = await pool.query<{ total_price: string; in_stock: boolean; qty_from_stock: string }>(
      `SELECT total_price, in_stock, qty_from_stock FROM po_lines WHERE id=$1`,
      [lineId],
    )
    expect(line.rows[0]!.in_stock).toBe(true)
    expect(parseFloat(line.rows[0]!.total_price)).toBe(0)
    expect(parseFloat(line.rows[0]!.qty_from_stock)).toBe(5)
  })

  it('reaches store_pricing even when nothing is stock-covered (partial reservation, rest still needs buying)', async () => {
    const productId = await makeProduct('partial')
    await receive(productId, warehouseId, 3)
    const { reqId, lineId } = await makeReqAtInventoryCheck(productId, 10)

    const result = await resolvers.Mutation.confirmRequisitionInventoryCheck(
      null,
      { id: reqId, lineStockQtys: [{ lineId, qtyFromStock: 3, sourceLocationId: warehouseId }] },
      ctx as never,
    )
    expect((result as { status: string }).status).toBe('store_pricing')

    const line = await pool.query<{ total_price: string; in_stock: boolean }>(
      `SELECT total_price, in_stock FROM po_lines WHERE id=$1`,
      [lineId],
    )
    // Only 3 of 10 covered — NOT fully in_stock, total_price is untouched
    // (still needs a real price once this line reaches market pricing).
    expect(line.rows[0]!.in_stock).toBe(false)
    expect(parseFloat(line.rows[0]!.total_price)).toBe(100) // 10 qty * 10 unit_price, unchanged
  })

  it('rejects a from-stock line with no chosen source location, reserving nothing', async () => {
    const productId = await makeProduct('nolocation')
    await receive(productId, warehouseId, 10)
    const { reqId, lineId } = await makeReqAtInventoryCheck(productId, 3)

    await expect(
      resolvers.Mutation.confirmRequisitionInventoryCheck(
        null,
        { id: reqId, lineStockQtys: [{ lineId, qtyFromStock: 3 }] },
        ctx as never,
      ),
    ).rejects.toThrow(/source stock location/i)

    const bal = await getBalance(productId, warehouseId)
    expect(bal.reserved).toBe(0)
    const status = await pool.query<{ status: string }>(`SELECT status FROM requisitions WHERE id=$1`, [reqId])
    expect(status.rows[0]!.status).toBe('inventory_check') // rolled back, not stuck mid-transition
  })

  it('rejects reserving more than is available, leaving the balance untouched', async () => {
    const productId = await makeProduct('insufficient')
    await receive(productId, warehouseId, 2)
    const { reqId, lineId } = await makeReqAtInventoryCheck(productId, 5)

    await expect(
      resolvers.Mutation.confirmRequisitionInventoryCheck(
        null,
        { id: reqId, lineStockQtys: [{ lineId, qtyFromStock: 5, sourceLocationId: warehouseId }] },
        ctx as never,
      ),
    ).rejects.toThrow(/insufficient available stock/i)

    const bal = await getBalance(productId, warehouseId)
    expect(bal.reserved).toBe(0)
    expect(bal.onHand).toBe(2)
  })

  it('shares the reservation pool with a concurrent PO on the same (product, location)', async () => {
    // Confirms the design claim from the G1 investigation: qty_reserved is
    // pooled across requisitions and POs alike, not tracked per-parent.
    const productId = await makeProduct('sharedpool')
    await receive(productId, warehouseId, 10)
    const { reqId, lineId } = await makeReqAtInventoryCheck(productId, 4)

    await resolvers.Mutation.confirmRequisitionInventoryCheck(
      null,
      { id: reqId, lineStockQtys: [{ lineId, qtyFromStock: 4, sourceLocationId: warehouseId }] },
      ctx as never,
    )
    expect((await getBalance(productId, warehouseId)).reserved).toBe(4)

    // A second requisition trying to reserve the remaining 6 succeeds; a
    // third trying to reserve even 1 more (only 0 left) fails.
    const { reqId: reqId2, lineId: lineId2 } = await makeReqAtInventoryCheck(productId, 6)
    await resolvers.Mutation.confirmRequisitionInventoryCheck(
      null,
      { id: reqId2, lineStockQtys: [{ lineId: lineId2, qtyFromStock: 6, sourceLocationId: warehouseId }] },
      ctx as never,
    )
    expect((await getBalance(productId, warehouseId)).reserved).toBe(10)

    const { reqId: reqId3, lineId: lineId3 } = await makeReqAtInventoryCheck(productId, 1)
    await expect(
      resolvers.Mutation.confirmRequisitionInventoryCheck(
        null,
        { id: reqId3, lineStockQtys: [{ lineId: lineId3, qtyFromStock: 1, sourceLocationId: warehouseId }] },
        ctx as never,
      ),
    ).rejects.toThrow(/insufficient available stock/i)
  })
})

// G1 Phase 3 Milestone A screen 2 — requisitionStockAvailability, the
// requisition equivalent of poStockAvailability (same formula, same
// POLineAvailability shape). Backs the inventory-check panel's on-hand/
// reserved/available display.
describe('requisitionStockAvailability', () => {
  async function makeReqAtInventoryCheck(productId: string, qtyOrdered: number) {
    const created = await resolvers.Mutation.createRequisition(
      null,
      { input: { purpose: 'stock', lines: [{ product_id: productId, description: 'x', qty: qtyOrdered, unit_price: 10 }] } },
      ctx as never,
    )
    const reqId = (created as { id: string }).id
    await resolvers.Mutation.submitRequisitionToInventoryCheck(null, { id: reqId }, ctx as never)
    const lineRow = await pool.query<{ id: string }>(`SELECT id FROM po_lines WHERE requisition_id=$1`, [reqId])
    return { reqId, lineId: lineRow.rows[0]!.id }
  }

  it('reports on-hand/available/isAvailable and a byLocation breakdown for a fully-covered line', async () => {
    const productId = await makeProduct('avail-full')
    await receive(productId, warehouseId, 20)
    const { reqId, lineId } = await makeReqAtInventoryCheck(productId, 5)

    const rows = (await resolvers.Query.requisitionStockAvailability(
      null,
      { requisitionId: reqId },
      ctx as never,
    )) as { lineId: string; qtyRequired: number; qtyOnHand: number; qtyAvailable: number; isAvailable: boolean; byLocation: { locationId: string; qtyOnHand: number }[] }[]

    expect(rows).toHaveLength(1)
    expect(rows[0]!.lineId).toBe(lineId)
    expect(rows[0]!.qtyRequired).toBe(5)
    expect(rows[0]!.qtyOnHand).toBe(20)
    expect(rows[0]!.qtyAvailable).toBe(20)
    expect(rows[0]!.isAvailable).toBe(true)
    expect(rows[0]!.byLocation.some((l) => l.locationId === warehouseId)).toBe(true)
  })

  it('reports isAvailable false and a lower qtyAvailable once some of the line is reserved by another requisition', async () => {
    const productId = await makeProduct('avail-partial')
    await receive(productId, warehouseId, 6)
    // Reserve 4 via a separate requisition's confirmed inventory check.
    const reserver = await makeReqAtInventoryCheck(productId, 4)
    await resolvers.Mutation.confirmRequisitionInventoryCheck(
      null,
      { id: reserver.reqId, lineStockQtys: [{ lineId: reserver.lineId, qtyFromStock: 4, sourceLocationId: warehouseId }] },
      ctx as never,
    )

    const { reqId } = await makeReqAtInventoryCheck(productId, 5)
    const rows = (await resolvers.Query.requisitionStockAvailability(
      null,
      { requisitionId: reqId },
      ctx as never,
    )) as { qtyOnHand: number; qtyAvailable: number; isAvailable: boolean }[]

    expect(rows[0]!.qtyOnHand).toBe(6)
    expect(rows[0]!.qtyAvailable).toBe(2)
    expect(rows[0]!.isAvailable).toBe(false)
  })

  it('returns nothing for a caller with no organizer/store_keeper/admin relationship to the requisition', async () => {
    const productId = await makeProduct('avail-restricted')
    const { reqId } = await makeReqAtInventoryCheck(productId, 1)
    const strangerCtx = {
      auth: { companyId: TEST_COMPANY_ID, userId: '00000000-0000-0000-0000-000000000099', role: 'user', module: 'all', sessionId: 'x' },
    }
    const rows = await resolvers.Query.requisitionStockAvailability(null, { requisitionId: reqId }, strangerCtx as never)
    expect(rows).toEqual([])
  })

  it('sorts byLocation by largest available first, not by on-hand', async () => {
    const secondWh = await pool.query<{ id: string }>(
      `INSERT INTO stock_locations (company_id, name, type, is_active) VALUES ($1,$2,'warehouse',true) RETURNING id`,
      [TEST_COMPANY_ID, `${SKU_PREFIX}SecondWH`],
    )
    const secondWhId = secondWh.rows[0]!.id

    const productId = await makeProduct('avail-sort')
    // Main warehouse: more on hand (30) but heavily reserved elsewhere,
    // leaving less available (5) than the second warehouse (20 on hand,
    // nothing reserved, so 20 available) — on-hand-only order would put
    // the main warehouse first; available-first order must not.
    await receive(productId, warehouseId, 30)
    const reserver = await makeReqAtInventoryCheck(productId, 25)
    await resolvers.Mutation.confirmRequisitionInventoryCheck(
      null,
      { id: reserver.reqId, lineStockQtys: [{ lineId: reserver.lineId, qtyFromStock: 25, sourceLocationId: warehouseId }] },
      ctx as never,
    )
    await receive(productId, secondWhId, 20)

    const { reqId } = await makeReqAtInventoryCheck(productId, 1)
    const rows = (await resolvers.Query.requisitionStockAvailability(
      null,
      { requisitionId: reqId },
      ctx as never,
    )) as { byLocation: { locationId: string; qtyOnHand: number; qtyAvailable: number }[] }[]

    const locs = rows[0]!.byLocation
    expect(locs).toHaveLength(2)
    expect(locs[0]!.locationId).toBe(secondWhId)
    expect(locs[0]!.qtyAvailable).toBe(20)
    expect(locs[1]!.locationId).toBe(warehouseId)
    expect(locs[1]!.qtyAvailable).toBe(5)
    // Confirms on-hand alone would have ordered these the other way.
    expect(locs[1]!.qtyOnHand).toBeGreaterThan(locs[0]!.qtyOnHand)
  })
})
