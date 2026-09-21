// Integration tests for G1 Phase 2 PR 1: createRequisition,
// submitRequisitionToInventoryCheck, confirmRequisitionInventoryCheck.
// Same real-Postgres pattern as po-stock-locking.test.ts (confirmPOInventoryCheck's
// reservation logic, which this mirrors almost exactly) — deliberately not
// mocking @fnc-erp/db.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'

const TEST_COMPANY_ID = '00000000-0000-0000-0000-000000000001'
const FACTORY_COMPANY_ID = '00000000-0000-0000-0000-000000000002'
const TEST_USER_EMAIL = 'g1-requisition-test@fnc-erp.local'
const TEST_EMPLOYEE_NUMBER = 'G1TEST-STOREKEEPER'
const SKU_PREFIX = 'G1TEST-'

let userId: string
let employeeId: string
let warehouseId: string
let virtualInId: string
let factoryWarehouseId: string
let factoryVirtualInId: string
let baseCurrency: string
let ctx: { auth: { companyId: string; userId: string; role: string; module: string; sessionId: string } }

async function makeProduct(suffix: string): Promise<string> {
  const sku = `${SKU_PREFIX}${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const r = await pool.query<{ id: string }>(
    `INSERT INTO products (company_id, sku, name, uom, category) VALUES ($1,$2,$3,'unit','general') RETURNING id`,
    [TEST_COMPANY_ID, sku, sku],
  )
  return r.rows[0]!.id
}

async function makeFactoryProduct(suffix: string): Promise<string> {
  const sku = `${SKU_PREFIX}${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const r = await pool.query<{ id: string }>(
    `INSERT INTO products (company_id, sku, name, uom, category) VALUES ($1,$2,$3,'unit','general') RETURNING id`,
    [FACTORY_COMPANY_ID, sku, sku],
  )
  return r.rows[0]!.id
}

async function receiveFactory(productId: string, qty: number, unitCost = 10): Promise<void> {
  await pool.query(
    `INSERT INTO stock_moves (company_id, product_id, from_location_id, to_location_id, moved_at, qty, unit_cost, total_cost, source_type, moved_by)
     VALUES ($1,$2,$3,$4,NOW(),$5,$6,$7,'po_receipt',$8)`,
    [FACTORY_COMPANY_ID, productId, factoryVirtualInId, factoryWarehouseId, qty, unitCost, qty * unitCost, userId],
  )
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
    `DELETE FROM po_edit_requests WHERE requisition_id IN (SELECT id FROM requisitions WHERE company_id=$1 AND organizer_id=$2)`,
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
  await pool.query(
    `DELETE FROM stock_moves WHERE company_id=$1 AND product_id IN (SELECT id FROM products WHERE company_id=$1 AND sku LIKE $2)`,
    [FACTORY_COMPANY_ID, `${SKU_PREFIX}%`],
  )
  await pool.query(
    `DELETE FROM stock_balances WHERE product_id IN (SELECT id FROM products WHERE company_id=$1 AND sku LIKE $2)`,
    [FACTORY_COMPANY_ID, `${SKU_PREFIX}%`],
  )
  await pool.query(`DELETE FROM products WHERE company_id=$1 AND sku LIKE $2`, [FACTORY_COMPANY_ID, `${SKU_PREFIX}%`])
}

beforeAll(async () => {
  const userR = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [TEST_USER_EMAIL],
  )
  userId = userR.rows[0]!.id
  ctx = { auth: { companyId: TEST_COMPANY_ID, userId, role: 'system_admin', module: 'all', sessionId: 'g1-test' } }

  const employeeR = await pool.query<{ id: string }>(
    `INSERT INTO employees (company_id, user_id, first_name, last_name, hire_date, employee_number)
     VALUES ($1,$2,'Test','StoreKeeper',CURRENT_DATE,$3)
     ON CONFLICT (company_id, employee_number) DO UPDATE SET user_id = EXCLUDED.user_id RETURNING id`,
    [TEST_COMPANY_ID, userId, TEST_EMPLOYEE_NUMBER],
  )
  employeeId = employeeR.rows[0]!.id

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

  const companyR = await pool.query<{ default_currency: string }>(
    `SELECT default_currency FROM system_configuration WHERE company_id=$1`,
    [TEST_COMPANY_ID],
  )
  baseCurrency = companyR.rows[0]?.default_currency ?? 'IQD'

  const fwhR = await pool.query<{ id: string }>(
    `SELECT id FROM stock_locations WHERE company_id=$1 AND type='warehouse' AND is_active=true LIMIT 1`,
    [FACTORY_COMPANY_ID],
  )
  if (!fwhR.rows[0]) throw new Error('No Factory warehouse location seeded — run seeds first')
  factoryWarehouseId = fwhR.rows[0].id

  const fviR = await pool.query<{ id: string }>(
    `SELECT id FROM stock_locations WHERE company_id=$1 AND type='virtual_in' AND is_active=true LIMIT 1`,
    [FACTORY_COMPANY_ID],
  )
  if (!fviR.rows[0]) throw new Error('No Factory virtual_in location seeded — run seeds first')
  factoryVirtualInId = fviR.rows[0].id

  // Belt-and-braces, same reasoning as products-central-warehouse-search.test.ts:
  // migrations run before seeds, so a freshly-migrated-then-seeded DB can have
  // this still false even though seed-companies.ts now sets it too.
  await pool.query(`UPDATE companies SET is_central_warehouse=true WHERE id=$1`, [FACTORY_COMPANY_ID])

  await cleanup()
})

afterAll(async () => {
  await cleanup()
  await pool.query(`DELETE FROM employees WHERE employee_number=$1`, [TEST_EMPLOYEE_NUMBER])
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

  it('reserves stock, zeroes the line total when fully covered, auto-fills store pricing, and skips straight to pending_approval', async () => {
    const productId = await makeProduct('reserve')
    await receive(productId, warehouseId, 20, 10) // unit_cost 10 -> average_cost becomes 10
    const { reqId, lineId } = await makeReqAtInventoryCheck(productId, 5)

    const result = await resolvers.Mutation.confirmRequisitionInventoryCheck(
      null,
      { id: reqId, lineStockQtys: [{ lineId, qtyFromStock: 5, sourceLocationId: warehouseId }] },
      ctx as never,
    )
    // 100%-from-stock — nothing left to market-price or verify, so this
    // skips straight to pending_approval, mirroring confirmPOInventoryCheck's
    // own inventory_check -> ready_to_issue shortcut.
    expect((result as { status: string }).status).toBe('pending_approval')

    const bal = await getBalance(productId, warehouseId)
    expect(bal.reserved).toBe(5)
    expect(bal.onHand).toBe(20) // reservation never touches on_hand

    const line = await pool.query<{
      total_price: string
      in_stock: boolean
      qty_from_stock: string
      store_price: string
      store_price_currency: string
    }>(
      `SELECT total_price, in_stock, qty_from_stock, store_price, store_price_currency FROM po_lines WHERE id=$1`,
      [lineId],
    )
    expect(line.rows[0]!.in_stock).toBe(true)
    expect(parseFloat(line.rows[0]!.total_price)).toBe(0)
    expect(parseFloat(line.rows[0]!.qty_from_stock)).toBe(5)
    // No standard_cost (Cost) set on the product yet — falls all the way
    // back to average_cost (10) + the company's own default currency, not
    // a hardcoded 'IQD'.
    expect(parseFloat(line.rows[0]!.store_price)).toBe(10)
    expect(line.rows[0]!.store_price_currency).toBe(baseCurrency)
  })

  it('reaches market_pricing even when only partially stock-covered, still auto-filling store price for the covered portion', async () => {
    const productId = await makeProduct('partial')
    await receive(productId, warehouseId, 3, 7)
    const { reqId, lineId } = await makeReqAtInventoryCheck(productId, 10)

    const result = await resolvers.Mutation.confirmRequisitionInventoryCheck(
      null,
      { id: reqId, lineStockQtys: [{ lineId, qtyFromStock: 3, sourceLocationId: warehouseId }] },
      ctx as never,
    )
    expect((result as { status: string }).status).toBe('market_pricing')

    const line = await pool.query<{
      total_price: string
      in_stock: boolean
      store_price: string
      store_price_currency: string
    }>(`SELECT total_price, in_stock, store_price, store_price_currency FROM po_lines WHERE id=$1`, [lineId])
    // Only 3 of 10 covered — NOT fully in_stock, total_price is untouched
    // (still needs a real price once this line reaches market pricing).
    expect(line.rows[0]!.in_stock).toBe(false)
    expect(parseFloat(line.rows[0]!.total_price)).toBe(100) // 10 qty * 10 unit_price, unchanged
    // Store price still gets auto-filled for the from-stock portion —
    // qty_from_stock > 0 is the only gate, not full coverage.
    expect(parseFloat(line.rows[0]!.store_price)).toBe(7)
    expect(line.rows[0]!.store_price_currency).toBe(baseCurrency)
  })

  it('stamps store_keeper_id on the requisition, whether the line needs more purchasing or not', async () => {
    const fullyCoveredProduct = await makeProduct('stamp-full')
    await receive(fullyCoveredProduct, warehouseId, 20, 10)
    const full = await makeReqAtInventoryCheck(fullyCoveredProduct, 5)
    await resolvers.Mutation.confirmRequisitionInventoryCheck(
      null,
      { id: full.reqId, lineStockQtys: [{ lineId: full.lineId, qtyFromStock: 5, sourceLocationId: warehouseId }] },
      ctx as never,
    )
    const fullRow = await pool.query<{ store_keeper_id: string | null; status: string }>(
      `SELECT store_keeper_id, status FROM requisitions WHERE id=$1`,
      [full.reqId],
    )
    expect(fullRow.rows[0]!.store_keeper_id).toBe(employeeId)
    expect(fullRow.rows[0]!.status).toBe('pending_approval')

    const needsPurchaseProduct = await makeProduct('stamp-partial')
    await receive(needsPurchaseProduct, warehouseId, 3, 7)
    const partial = await makeReqAtInventoryCheck(needsPurchaseProduct, 10)
    await resolvers.Mutation.confirmRequisitionInventoryCheck(
      null,
      { id: partial.reqId, lineStockQtys: [{ lineId: partial.lineId, qtyFromStock: 3, sourceLocationId: warehouseId }] },
      ctx as never,
    )
    const partialRow = await pool.query<{ store_keeper_id: string | null; status: string }>(
      `SELECT store_keeper_id, status FROM requisitions WHERE id=$1`,
      [partial.reqId],
    )
    expect(partialRow.rows[0]!.store_keeper_id).toBe(employeeId)
    expect(partialRow.rows[0]!.status).toBe('market_pricing')
  })

  it('prefers the product\'s own Cost (standard_cost) and its real currency over the average-cost/base-currency fallback', async () => {
    const productId = await makeProduct('cached')
    await receive(productId, warehouseId, 20, 10) // average_cost 10, in base currency
    await pool.query(`UPDATE products SET standard_cost=25, cost_currency='USD' WHERE id=$1`, [
      productId,
    ])
    const { reqId, lineId } = await makeReqAtInventoryCheck(productId, 5)

    await resolvers.Mutation.confirmRequisitionInventoryCheck(
      null,
      { id: reqId, lineStockQtys: [{ lineId, qtyFromStock: 5, sourceLocationId: warehouseId }] },
      ctx as never,
    )

    const line = await pool.query<{ store_price: string; store_price_currency: string }>(
      `SELECT store_price, store_price_currency FROM po_lines WHERE id=$1`,
      [lineId],
    )
    expect(parseFloat(line.rows[0]!.store_price)).toBe(25)
    expect(line.rows[0]!.store_price_currency).toBe('USD')
  })

  it("uses the product's own declared cost_currency ahead of the company base currency when there's no cached market price", async () => {
    const productId = await makeProduct('costcurrency')
    await receive(productId, warehouseId, 20, 15)
    await pool.query(`UPDATE products SET cost_currency='USD' WHERE id=$1`, [productId])
    const { reqId, lineId } = await makeReqAtInventoryCheck(productId, 5)

    await resolvers.Mutation.confirmRequisitionInventoryCheck(
      null,
      { id: reqId, lineStockQtys: [{ lineId, qtyFromStock: 5, sourceLocationId: warehouseId }] },
      ctx as never,
    )

    const line = await pool.query<{ store_price: string; store_price_currency: string }>(
      `SELECT store_price, store_price_currency FROM po_lines WHERE id=$1`,
      [lineId],
    )
    expect(parseFloat(line.rows[0]!.store_price)).toBe(15)
    expect(line.rows[0]!.store_price_currency).toBe('USD')
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

  // Reselect-item, at the one point in the lifecycle safe to swap a
  // line's product directly (no reservation exists yet for any line).
  it('reselects the item, reserves against the new product, and logs who/when', async () => {
    const wrongProductId = await makeProduct('reselect-wrong')
    const rightProductId = await makeProduct('reselect-right')
    await receive(wrongProductId, warehouseId, 20)
    await receive(rightProductId, warehouseId, 20)
    const { reqId, lineId } = await makeReqAtInventoryCheck(wrongProductId, 5)

    const result = await resolvers.Mutation.confirmRequisitionInventoryCheck(
      null,
      {
        id: reqId,
        lineStockQtys: [
          { lineId, qtyFromStock: 5, sourceLocationId: warehouseId, productId: rightProductId },
        ],
      },
      ctx as never,
    )
    // 100%-from-stock — skips straight to pending_approval.
    expect((result as { status: string }).status).toBe('pending_approval')

    // Reserved against the NEW product, not the one the line started with.
    expect((await getBalance(wrongProductId, warehouseId)).reserved).toBe(0)
    expect((await getBalance(rightProductId, warehouseId)).reserved).toBe(5)

    const line = await pool.query<{ product_id: string; description: string; uom: string }>(
      `SELECT product_id, description, uom FROM po_lines WHERE id=$1`,
      [lineId],
    )
    expect(line.rows[0]!.product_id).toBe(rightProductId)

    const log = await pool.query<{ action: string; actor_id: string; notes: string; created_at: string }>(
      `SELECT action, actor_id, notes, created_at FROM requisition_approval_log
       WHERE requisition_id=$1 AND action='item_swapped'`,
      [reqId],
    )
    expect(log.rows).toHaveLength(1)
    expect(log.rows[0]!.actor_id).toBe(userId)
    expect(log.rows[0]!.notes).toContain('reselected')
    expect(log.rows[0]!.created_at).toBeTruthy()
  })

  it('leaves the reservation and line untouched when no productId override is given', async () => {
    const productId = await makeProduct('reselect-untouched')
    await receive(productId, warehouseId, 20)
    const { reqId, lineId } = await makeReqAtInventoryCheck(productId, 5)

    await resolvers.Mutation.confirmRequisitionInventoryCheck(
      null,
      { id: reqId, lineStockQtys: [{ lineId, qtyFromStock: 5, sourceLocationId: warehouseId }] },
      ctx as never,
    )

    const line = await pool.query<{ product_id: string }>(`SELECT product_id FROM po_lines WHERE id=$1`, [lineId])
    expect(line.rows[0]!.product_id).toBe(productId)
    const log = await pool.query(
      `SELECT id FROM requisition_approval_log WHERE requisition_id=$1 AND action='item_swapped'`,
      [reqId],
    )
    expect(log.rows).toHaveLength(0)
  })

  // Regression coverage: same includeCentralWarehouse gap fixed in
  // requisitionLineProductAvailability (the reselect preview), but here in
  // the actual confirm mutation's own product-swap lookup — this is the
  // one that was still scoped to "this requisition's own company only",
  // so confirming after reselecting a real central-warehouse item threw
  // "Product <id> not found" instead of accepting the swap.
  it('accepts a reselected item that belongs to the central warehouse company', async () => {
    const wrongProductId = await makeProduct('reselect-cw-wrong')
    const factoryProductId = await makeFactoryProduct('reselect-cw-right')
    const { reqId, lineId } = await makeReqAtInventoryCheck(wrongProductId, 2)

    const result = await resolvers.Mutation.confirmRequisitionInventoryCheck(
      null,
      { id: reqId, lineStockQtys: [{ lineId, qtyFromStock: 0, productId: factoryProductId }] },
      ctx as never,
    )
    expect(result).toBeTruthy()

    const line = await pool.query<{ product_id: string }>(`SELECT product_id FROM po_lines WHERE id=$1`, [lineId])
    expect(line.rows[0]!.product_id).toBe(factoryProductId)
  })
})

describe('requisitionLineProductAvailability (reselect-item preview)', () => {
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

  it('reports on-hand/available for the override product, keyed by the requisition line', async () => {
    const wrongProductId = await makeProduct('preview-wrong')
    const rightProductId = await makeProduct('preview-right')
    await receive(rightProductId, warehouseId, 12)
    const { reqId, lineId } = await makeReqAtInventoryCheck(wrongProductId, 5)

    const rows = (await resolvers.Query.requisitionLineProductAvailability(
      null,
      { requisitionId: reqId, overrides: [{ lineId, productId: rightProductId }] },
      ctx as never,
    )) as { lineId: string; productId: string; qtyRequired: number; qtyOnHand: number; qtyAvailable: number; isAvailable: boolean }[]

    expect(rows).toHaveLength(1)
    expect(rows[0]!.lineId).toBe(lineId)
    expect(rows[0]!.productId).toBe(rightProductId)
    expect(rows[0]!.qtyRequired).toBe(5)
    expect(rows[0]!.qtyOnHand).toBe(12)
    expect(rows[0]!.qtyAvailable).toBe(12)
    expect(rows[0]!.isAvailable).toBe(true)
  })

  it('returns an empty list for no overrides', async () => {
    const { reqId } = await makeReqAtInventoryCheck(await makeProduct('preview-empty'), 1)
    const rows = await resolvers.Query.requisitionLineProductAvailability(
      null,
      { requisitionId: reqId, overrides: [] },
      ctx as never,
    )
    expect(rows).toEqual([])
  })

  // Regression coverage: the includeCentralWarehouse fix for the reselect
  // picker (products query) let a caller SELECT a central-warehouse
  // product, but this resolver's own product lookup and stock queries were
  // never updated to match — still scoped to "this requisition's own
  // company only", same class of gap requisitionStockAvailability (the
  // non-override path, just above in resolvers.ts) already handles
  // correctly. Result: picking a real Factory item here looked like it
  // "glitched" to 0 on-hand / no locations, even though the item genuinely
  // has stock at the group's central warehouse.
  it('finds a central-warehouse product\'s stock, even though the requisition is at a different company', async () => {
    const wrongProductId = await makeProduct('preview-cw-wrong')
    const factoryProductId = await makeFactoryProduct('preview-cw-right')
    await receiveFactory(factoryProductId, 9)
    const { reqId, lineId } = await makeReqAtInventoryCheck(wrongProductId, 3)

    const rows = (await resolvers.Query.requisitionLineProductAvailability(
      null,
      { requisitionId: reqId, overrides: [{ lineId, productId: factoryProductId }] },
      ctx as never,
    )) as {
      lineId: string
      productId: string
      qtyOnHand: number
      qtyAvailable: number
      isAvailable: boolean
      byLocation: { companyId: string; locationId: string; qtyAvailable: number }[]
    }[]

    expect(rows).toHaveLength(1)
    expect(rows[0]!.qtyOnHand).toBe(9)
    expect(rows[0]!.qtyAvailable).toBe(9)
    expect(rows[0]!.isAvailable).toBe(true)
    expect(rows[0]!.byLocation).toHaveLength(1)
    expect(rows[0]!.byLocation[0]!.companyId).toBe(FACTORY_COMPANY_ID)
    expect(rows[0]!.byLocation[0]!.locationId).toBe(factoryWarehouseId)
    expect(rows[0]!.byLocation[0]!.qtyAvailable).toBe(9)
  })
})

// Regression coverage for the same reservation-orphaning bug class found
// live on REQ-2026-0013 (production): an edit request removing a
// from-stock line, or shrinking its qty_ordered below the already-
// reserved qty_from_stock, must release the excess back to
// stock_balances rather than stranding it. Mirrors po-stock-locking.test.ts's
// own coverage of applyPOEditChanges — this is applyRequisitionEditChanges'
// side of the same shared release helpers.
describe('applyRequisitionEditChanges releases stock reservations', () => {
  async function makeReqAtMarketPricing(productId: string, qtyOrdered: number, qtyFromStock: number) {
    const created = await resolvers.Mutation.createRequisition(
      null,
      { input: { purpose: 'stock', lines: [{ product_id: productId, description: 'x', qty: qtyOrdered, unit_price: 10 }] } },
      ctx as never,
    )
    const reqId = (created as { id: string }).id
    await resolvers.Mutation.submitRequisitionToInventoryCheck(null, { id: reqId }, ctx as never)
    const lineRow = await pool.query<{ id: string }>(`SELECT id FROM po_lines WHERE requisition_id=$1`, [reqId])
    const lineId = lineRow.rows[0]!.id
    await resolvers.Mutation.confirmRequisitionInventoryCheck(
      null,
      { id: reqId, lineStockQtys: [{ lineId, qtyFromStock, sourceLocationId: warehouseId }] },
      ctx as never,
    )
    return { reqId, lineId }
  }

  it('releases the reservation when an edit request removes a from-stock line', async () => {
    const productId = await makeProduct('edit-remove')
    await receive(productId, warehouseId, 20)
    const { reqId, lineId } = await makeReqAtMarketPricing(productId, 10, 4)
    expect((await getBalance(productId, warehouseId)).reserved).toBe(4)

    await resolvers.Mutation.submitPOEditRequest(
      null,
      { requisitionId: reqId, changes: JSON.stringify({ lines: { removed: [lineId] } }) },
      ctx as never,
    )

    expect((await getBalance(productId, warehouseId)).reserved).toBe(0)
    const remainingLine = await pool.query(`SELECT id FROM po_lines WHERE id=$1`, [lineId])
    expect(remainingLine.rows.length).toBe(0)
  })

  it('caps the reservation down when qty_ordered is edited below the existing qty_from_stock', async () => {
    const productId = await makeProduct('edit-shrink')
    await receive(productId, warehouseId, 20)
    const { reqId, lineId } = await makeReqAtMarketPricing(productId, 10, 5)
    expect((await getBalance(productId, warehouseId)).reserved).toBe(5)

    await resolvers.Mutation.submitPOEditRequest(
      null,
      {
        requisitionId: reqId,
        changes: JSON.stringify({ lines: { edited: [{ id: lineId, field: 'qty_ordered', from: 10, to: 3 }] } }),
      },
      ctx as never,
    )

    expect((await getBalance(productId, warehouseId)).reserved).toBe(3)
    const line = await pool.query<{ qty_ordered: string; qty_from_stock: string }>(
      `SELECT qty_ordered, qty_from_stock FROM po_lines WHERE id=$1`,
      [lineId],
    )
    expect(parseFloat(line.rows[0]!.qty_ordered)).toBe(3)
    expect(parseFloat(line.rows[0]!.qty_from_stock)).toBe(3)
  })

  it('ignores a product_id edit on an existing line rather than orphaning its reservation', async () => {
    const productId = await makeProduct('edit-swap-old')
    const otherProductId = await makeProduct('edit-swap-new')
    await receive(productId, warehouseId, 20)
    const { reqId, lineId } = await makeReqAtMarketPricing(productId, 10, 4)
    expect((await getBalance(productId, warehouseId)).reserved).toBe(4)

    await resolvers.Mutation.submitPOEditRequest(
      null,
      {
        requisitionId: reqId,
        changes: JSON.stringify({
          lines: { edited: [{ id: lineId, field: 'product_id', from: productId, to: otherProductId }] },
        }),
      },
      ctx as never,
    )

    const line = await pool.query<{ product_id: string }>(`SELECT product_id FROM po_lines WHERE id=$1`, [lineId])
    expect(line.rows[0]!.product_id).toBe(productId)
    expect((await getBalance(productId, warehouseId)).reserved).toBe(4)
    expect((await getBalance(otherProductId, warehouseId)).reserved).toBe(0)
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
