// Coverage for the unified per-product Cost field: standard_cost now
// replaces last_market_price everywhere (BOM planning already read it;
// PO/requisition store-pricing auto-fill now does too), and every real
// change to it — a PO receipt, a market-pricing submission, a stock
// adjustment, a cost-only correction, or a manual edit — is logged to
// product_cost_history via the shared recordProductCostChange helper, so
// ProductDetail can show what changed a product's cost and when. Real-
// Postgres pattern, same as stock-adjustment-cost-correction.test.ts.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'

const TEST_COMPANY_ID = '00000000-0000-0000-0000-000000000001'
const TEST_USER_EMAIL = 'product-cost-history-test@fnc-erp.local'
const SKU_PREFIX = 'COSTHISTTEST-'

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

async function getProductCost(productId: string): Promise<{ cost: number; currency: string }> {
  const r = await pool.query<{ standard_cost: string; cost_currency: string | null }>(
    `SELECT standard_cost, cost_currency FROM products WHERE id=$1`,
    [productId],
  )
  return { cost: parseFloat(r.rows[0]!.standard_cost), currency: r.rows[0]!.cost_currency ?? '' }
}

async function getHistory(
  productId: string,
): Promise<{ old_cost: string | null; new_cost: string; currency_code: string; source_type: string; source_label: string | null }[]> {
  const r = await pool.query(
    `SELECT old_cost, new_cost, currency_code, source_type, source_label
     FROM product_cost_history WHERE product_id=$1 ORDER BY changed_at ASC`,
    [productId],
  )
  return r.rows
}

async function makeUploadedFile(category: string): Promise<string> {
  const key = `${SKU_PREFIX}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const r = await pool.query<{ id: string }>(
    `INSERT INTO files (company_id, uploaded_by, file_key, original_filename, mime_type, size_bytes, category, status)
     VALUES ($1,$2,$3,'receipt.jpg','image/jpeg',1024,$4,'uploaded') RETURNING id`,
    [TEST_COMPANY_ID, userId, key, category],
  )
  return r.rows[0]!.id
}

async function attachFile(entityType: string, entityId: string, category: string): Promise<void> {
  const fileId = await makeUploadedFile(category)
  await pool.query(
    `INSERT INTO document_attachments (file_id, entity_type, entity_id, uploaded_by) VALUES ($1,$2,$3,$4)`,
    [fileId, entityType, entityId, userId],
  )
}

async function cleanup(): Promise<void> {
  await pool.query(
    `DELETE FROM document_attachments
     WHERE (entity_type='po_receipt' AND entity_id IN (
             SELECT id FROM po_receipts WHERE po_id IN (SELECT id FROM purchase_orders WHERE po_number LIKE $1)))
        OR (entity_type='purchase_order' AND entity_id IN (SELECT id FROM purchase_orders WHERE po_number LIKE $1))`,
    [`${SKU_PREFIX}%`],
  )
  // stock_moves.po_receipt_line_id/po_line_id both FK into rows deleted
  // below, so this has to go first.
  await pool.query(
    `DELETE FROM stock_moves WHERE po_line_id IN (SELECT id FROM po_lines WHERE po_id IN (SELECT id FROM purchase_orders WHERE po_number LIKE $1))`,
    [`${SKU_PREFIX}%`],
  )
  await pool.query(`DELETE FROM po_receipt_lines WHERE receipt_id IN (SELECT id FROM po_receipts WHERE po_id IN (SELECT id FROM purchase_orders WHERE po_number LIKE $1))`, [
    `${SKU_PREFIX}%`,
  ])
  await pool.query(`DELETE FROM po_receipts WHERE po_id IN (SELECT id FROM purchase_orders WHERE po_number LIKE $1)`, [
    `${SKU_PREFIX}%`,
  ])
  await pool.query(`DELETE FROM po_lines WHERE po_id IN (SELECT id FROM purchase_orders WHERE po_number LIKE $1)`, [
    `${SKU_PREFIX}%`,
  ])
  await pool.query(`DELETE FROM purchase_orders WHERE po_number LIKE $1`, [`${SKU_PREFIX}%`])
  await pool.query(`DELETE FROM vendors WHERE company_id=$1 AND name LIKE $2`, [
    TEST_COMPANY_ID,
    `${SKU_PREFIX}%`,
  ])
  await pool.query(`DELETE FROM files WHERE company_id=$1 AND file_key LIKE $2`, [
    TEST_COMPANY_ID,
    `${SKU_PREFIX}%`,
  ])
  await pool.query(
    `DELETE FROM product_cost_history WHERE product_id IN (SELECT id FROM products WHERE sku LIKE $1)`,
    [`${SKU_PREFIX}%`],
  )
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
    auth: { companyId: TEST_COMPANY_ID, userId, role: 'system_admin', module: 'all', sessionId: 'cost-history-test' },
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

describe('updateProduct — manual Cost edits are logged', () => {
  it('logs a history entry when standard_cost changes, with old and new values', async () => {
    const productId = await makeProduct('manual-edit')

    await resolvers.Mutation.updateProduct(
      null,
      { id: productId, input: { standard_cost: 45, cost_currency: 'USD' } },
      ctx as never,
    )
    expect(await getProductCost(productId)).toEqual({ cost: 45, currency: 'USD' })

    await resolvers.Mutation.updateProduct(
      null,
      { id: productId, input: { standard_cost: 50 } },
      ctx as never,
    )
    expect(await getProductCost(productId)).toEqual({ cost: 50, currency: 'USD' })

    const history = await getHistory(productId)
    expect(history).toHaveLength(2)
    // 0, not null — products.standard_cost defaults to 0 (NOT NULL), so a
    // fresh product's first real cost change still has a real "old" value.
    expect(history[0]).toMatchObject({ old_cost: '0.0000', new_cost: '45.0000', source_type: 'manual_edit' })
    expect(history[1]).toMatchObject({ old_cost: '45.0000', new_cost: '50.0000', source_type: 'manual_edit' })
  })

  it('does not log a no-op edit that resubmits the same cost', async () => {
    const productId = await makeProduct('manual-edit-noop')
    await resolvers.Mutation.updateProduct(
      null,
      { id: productId, input: { standard_cost: 20, cost_currency: 'IQD' } },
      ctx as never,
    )
    await resolvers.Mutation.updateProduct(
      null,
      { id: productId, input: { standard_cost: 20 } },
      ctx as never,
    )
    expect(await getHistory(productId)).toHaveLength(1)
  })

  it('logs a currency-only change even when the numeric cost stays the same', async () => {
    const productId = await makeProduct('manual-edit-currency-change')
    await resolvers.Mutation.updateProduct(
      null,
      { id: productId, input: { standard_cost: 25, cost_currency: 'IQD' } },
      ctx as never,
    )
    // Same number, different currency — a real change (this cost now means
    // 25 USD, not 25 IQD), not the no-op resubmission covered above.
    await resolvers.Mutation.updateProduct(
      null,
      { id: productId, input: { standard_cost: 25, cost_currency: 'USD' } },
      ctx as never,
    )
    expect(await getProductCost(productId)).toEqual({ cost: 25, currency: 'USD' })
    const history = await getHistory(productId)
    expect(history).toHaveLength(2)
    expect(history[1]).toMatchObject({ old_cost: '25.0000', new_cost: '25.0000', currency_code: 'USD' })
  })

  it('a deliberate reset to 0 updates the cost but is not logged as a cost transition', async () => {
    const productId = await makeProduct('manual-edit-zero')
    await resolvers.Mutation.updateProduct(
      null,
      { id: productId, input: { standard_cost: 30, cost_currency: 'IQD' } },
      ctx as never,
    )
    await resolvers.Mutation.updateProduct(
      null,
      { id: productId, input: { standard_cost: 0 } },
      ctx as never,
    )
    expect(await getProductCost(productId)).toEqual({ cost: 0, currency: 'IQD' })
    expect(await getHistory(productId)).toHaveLength(1)
  })
})

describe('updateProduct — Cost edit auto-syncs any location stuck at a $0 Last Cost', () => {
  it('corrects an uncosted location balance when Cost is set, without a separate Stock Adjustment', async () => {
    const productId = await makeProduct('auto-sync-zero-location')
    await pool.query(
      `INSERT INTO stock_moves (company_id, product_id, from_location_id, to_location_id, moved_at, qty, unit_cost, total_cost, source_type, moved_by)
       VALUES ($1,$2,$3,$4,NOW(),$5,0,0,'opening_balance',$6)`,
      [TEST_COMPANY_ID, productId, virtualInId, warehouseId, 6, userId],
    )
    const before = await pool.query<{ average_cost: string }>(
      `SELECT average_cost FROM stock_balances WHERE product_id=$1 AND location_id=$2`,
      [productId, warehouseId],
    )
    expect(parseFloat(before.rows[0]!.average_cost)).toBe(0)

    await resolvers.Mutation.updateProduct(
      null,
      { id: productId, input: { standard_cost: 12, cost_currency: 'USD' } },
      ctx as never,
    )

    const after = await pool.query<{ average_cost: string; last_cost_currency: string }>(
      `SELECT average_cost, last_cost_currency FROM stock_balances WHERE product_id=$1 AND location_id=$2`,
      [productId, warehouseId],
    )
    expect(parseFloat(after.rows[0]!.average_cost)).toBe(12)
    expect(after.rows[0]!.last_cost_currency).toBe('USD')

    const move = await pool.query<{ source_type: string; notes: string }>(
      `SELECT source_type, notes FROM stock_moves WHERE product_id=$1 AND source_type='cost_correction'`,
      [productId],
    )
    expect(move.rows).toHaveLength(1)
    expect(move.rows[0]!.notes).toBe('Synced from product Cost edit')
  })

  it('never overwrites a location that already has its own real recorded cost', async () => {
    const productId = await makeProduct('auto-sync-preserves-real-cost')
    await pool.query(
      `INSERT INTO stock_moves (company_id, product_id, from_location_id, to_location_id, moved_at, qty, unit_cost, total_cost, currency_code, source_type, moved_by)
       VALUES ($1,$2,$3,$4,NOW(),$5,$6,$7,'IQD','po_receipt',$8)`,
      [TEST_COMPANY_ID, productId, virtualInId, warehouseId, 3, 99, 3 * 99, userId],
    )
    await resolvers.Mutation.updateProduct(
      null,
      { id: productId, input: { standard_cost: 12, cost_currency: 'USD' } },
      ctx as never,
    )

    const after = await pool.query<{ average_cost: string; last_cost_currency: string }>(
      `SELECT average_cost, last_cost_currency FROM stock_balances WHERE product_id=$1 AND location_id=$2`,
      [productId, warehouseId],
    )
    expect(parseFloat(after.rows[0]!.average_cost)).toBe(99)
    expect(after.rows[0]!.last_cost_currency).toBe('IQD')

    const moves = await pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM stock_moves WHERE product_id=$1 AND source_type='cost_correction'`,
      [productId],
    )
    expect(moves.rows[0]!.n).toBe(0)
  })
})

describe('product(id) query exposes costHistory', () => {
  it('returns entries newest first, joined with the acting user\'s name', async () => {
    const productId = await makeProduct('query-exposure')
    await resolvers.Mutation.updateProduct(
      null,
      { id: productId, input: { standard_cost: 10, cost_currency: 'IQD' } },
      ctx as never,
    )
    await resolvers.Mutation.updateProduct(
      null,
      { id: productId, input: { standard_cost: 15 } },
      ctx as never,
    )

    const result = (await resolvers.Query.product(null, { id: productId }, ctx as never)) as {
      costHistory: { new_cost: string; old_cost: string | null; changed_by_name: string | null }[]
    }
    expect(result.costHistory).toHaveLength(2)
    // Newest first.
    expect(parseFloat(result.costHistory[0]!.new_cost)).toBe(15)
    expect(parseFloat(result.costHistory[1]!.new_cost)).toBe(10)
    expect(result.costHistory[0]!.changed_by_name).toBeTruthy()
  })
})

describe('createStockAdjustment cost changes are logged with the right source_type', () => {
  it('tags a quantity-change-with-cost adjustment as stock_adjustment', async () => {
    const productId = await makeProduct('adjustment-source')
    await resolvers.Mutation.createStockAdjustment(
      null,
      { input: { product_id: productId, location_id: warehouseId, new_qty: 5, unit_cost: 8 } },
      ctx as never,
    )
    const history = await getHistory(productId)
    expect(history).toHaveLength(1)
    expect(history[0]).toMatchObject({ source_type: 'stock_adjustment', source_label: 'Stock Adjustment' })
    expect(parseFloat(history[0]!.new_cost)).toBe(8)
  })

  it('tags a same-qty cost-only correction as cost_correction', async () => {
    const productId = await makeProduct('correction-source')
    await pool.query(
      `INSERT INTO stock_moves (company_id, product_id, from_location_id, to_location_id, moved_at, qty, unit_cost, total_cost, source_type, moved_by)
       VALUES ($1,$2,$3,$4,NOW(),$5,0,0,'opening_balance',$6)`,
      [TEST_COMPANY_ID, productId, virtualInId, warehouseId, 6, userId],
    )
    await resolvers.Mutation.createStockAdjustment(
      null,
      { input: { product_id: productId, location_id: warehouseId, new_qty: 6, unit_cost: 11 } },
      ctx as never,
    )
    const history = await getHistory(productId)
    expect(history).toHaveLength(1)
    expect(history[0]).toMatchObject({
      source_type: 'cost_correction',
      source_label: 'Stock Adjustment (cost correction)',
    })
    expect(parseFloat(history[0]!.new_cost)).toBe(11)
  })
})

describe('confirmReceipt logs a po_receipt cost change with the PO number as source_label', () => {
  it('records the receipt cost against the product via the real recordReceipt/confirmReceipt flow', async () => {
    const productId = await makeProduct('po-receipt-source')
    const vendorR = await pool.query<{ id: string }>(
      `INSERT INTO vendors (company_id, name) VALUES ($1,$2) RETURNING id`,
      [TEST_COMPANY_ID, `${SKU_PREFIX}Vendor`],
    )
    const vendorId = vendorR.rows[0]!.id
    const poNumber = `${SKU_PREFIX}PO-${Date.now()}`
    const poR = await pool.query<{ id: string }>(
      `INSERT INTO purchase_orders (company_id, po_number, vendor_id, status, currency_code, purpose, created_by)
       VALUES ($1,$2,$3,'approved','IQD','stock',$4) RETURNING id`,
      [TEST_COMPANY_ID, poNumber, vendorId, userId],
    )
    const poId = poR.rows[0]!.id
    const lineR = await pool.query<{ id: string }>(
      `INSERT INTO po_lines (po_id, product_id, description, line_number, qty_ordered, unit_price, total_price, uom)
       VALUES ($1,$2,'test line',1,10,9,90,'unit') RETURNING id`,
      [poId, productId],
    )
    const poLineId = lineR.rows[0]!.id

    const receipt = (await resolvers.Mutation.recordReceipt(
      null,
      {
        poId,
        input: {
          receipt_date: new Date().toISOString().slice(0, 10),
          location_id: warehouseId,
          lines: [{ po_line_id: poLineId, qty_received: 10, actual_unit_price: 9 }],
        },
      },
      ctx as never,
    )) as { id: string }
    await attachFile('po_receipt', receipt.id, 'po_receipt_photo')
    await attachFile('purchase_order', poId, 'po_receipt_document')
    await resolvers.Mutation.confirmReceipt(null, { id: receipt.id }, ctx as never)

    expect(await getProductCost(productId)).toEqual({ cost: 9, currency: 'IQD' })
    const history = await getHistory(productId)
    expect(history).toHaveLength(1)
    expect(history[0]).toMatchObject({ old_cost: '0.0000', source_type: 'po_receipt', source_label: poNumber })
    expect(parseFloat(history[0]!.new_cost)).toBe(9)
  })
})
