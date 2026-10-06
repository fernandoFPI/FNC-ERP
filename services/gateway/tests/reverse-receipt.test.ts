// Integration tests for reverseReceipt — undoing a CONFIRMED Store In
// receipt (real stock already moved, product cost already updated,
// possibly MO consumption already bumped). Deliberately NOT mocking
// @fnc-erp/db — this exercises the real update_stock_balance trigger and
// the real reverseAndRepostStockMove/findStockMovesForCorrection machinery,
// same reasoning as po-stock-locking.test.ts.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'

const TEST_COMPANY_ID = '00000000-0000-0000-0000-000000000001'
const TEST_USER_EMAIL = 'reverse-receipt-test@fnc-erp.local'
const SKU_PREFIX = 'REVTEST-'
const PO_PREFIX = 'REVTEST-PO-'

let userId: string
let warehouseId: string
let ctx: { auth: { companyId: string; userId: string; role: string; module: string; sessionId: string } }

async function makeProduct(suffix: string): Promise<string> {
  const sku = `${SKU_PREFIX}${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const r = await pool.query<{ id: string }>(
    `INSERT INTO products (company_id, sku, name, uom, category) VALUES ($1,$2,$3,'unit','general') RETURNING id`,
    [TEST_COMPANY_ID, sku, sku],
  )
  return r.rows[0]!.id
}

async function makePO(status: string, extra?: { linkedMoId?: string }): Promise<string> {
  const poNumber = `${PO_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const r = await pool.query<{ id: string }>(
    `INSERT INTO purchase_orders (company_id, po_number, created_by, status, currency_code, purpose, linked_mo_id)
     VALUES ($1,$2,$3,$4,'IQD','stock',$5) RETURNING id`,
    [TEST_COMPANY_ID, poNumber, userId, status, extra?.linkedMoId ?? null],
  )
  return r.rows[0]!.id
}

async function makePOLine(poId: string, productId: string, qtyOrdered: number, unitPrice = 10): Promise<string> {
  const r = await pool.query<{ id: string }>(
    `INSERT INTO po_lines (po_id, line_number, description, product_id, qty_ordered, unit_price, total_price)
     VALUES ($1,1,'test line',$2,$3,$4,$5) RETURNING id`,
    [poId, productId, qtyOrdered, unitPrice, qtyOrdered * unitPrice],
  )
  return r.rows[0]!.id
}

async function getBalance(productId: string, locationId: string): Promise<number> {
  const r = await pool.query<{ qty_on_hand: string }>(
    `SELECT qty_on_hand FROM stock_balances WHERE product_id=$1 AND location_id=$2 AND lot_id IS NULL`,
    [productId, locationId],
  )
  return parseFloat(r.rows[0]?.qty_on_hand ?? '0')
}

// Drives a PO through approved -> bought -> goods_received with one
// confirmed receipt, exactly as the real recordReceipt/confirmReceipt
// resolvers would, so product cost / qty_received are set up exactly as
// real confirmed-receipt data would be.
async function receiveAndConfirm(
  poId: string,
  lineId: string,
  qty: number,
  unitPrice: number,
): Promise<string> {
  await pool.query(`UPDATE purchase_orders SET status='bought' WHERE id=$1`, [poId])
  const receipt = await resolvers.Mutation.recordReceipt(
    null,
    {
      poId,
      input: {
        receipt_date: '2026-01-15',
        location_id: warehouseId,
        lines: [{ po_line_id: lineId, qty_received: qty, actual_unit_price: unitPrice }],
      },
    },
    ctx as never,
  )
  const receiptId = (receipt as { id: string }).id

  // confirmReceipt requires both required photo categories already attached
  // — stand in for the real upload flow with two bare files/document_attachments
  // rows directly, since this test only cares about what confirmReceipt does
  // to stock/qty/cost, not the upload mechanics.
  for (const category of ['po_receipt_photo', 'po_receipt_document']) {
    const fileR = await pool.query<{ id: string }>(
      `INSERT INTO files (company_id, uploaded_by, file_key, original_filename, mime_type, size_bytes, category, status)
       VALUES ($1,$2,$3,'test.jpg','image/jpeg',100,$4,'attached') RETURNING id`,
      [TEST_COMPANY_ID, userId, `revtest-${category}-${receiptId}-${Math.random().toString(36).slice(2, 8)}`, category],
    )
    await pool.query(
      `INSERT INTO document_attachments (entity_type, entity_id, file_id, uploaded_by) VALUES ('po_receipt',$1,$2,$3)`,
      [receiptId, fileR.rows[0]!.id, userId],
    )
  }

  await resolvers.Mutation.confirmReceipt(null, { id: receiptId }, ctx as never)
  return receiptId
}

async function cleanup(): Promise<void> {
  // purchase_orders.linked_mo_id references manufacturing_orders — clear it
  // first or deleting the MO below violates that FK.
  await pool.query(
    `UPDATE purchase_orders SET linked_mo_id=NULL WHERE company_id=$1 AND po_number LIKE $2`,
    [TEST_COMPANY_ID, `${PO_PREFIX}%`],
  )
  await pool.query(
    `DELETE FROM mo_consumptions WHERE mo_id IN (SELECT id FROM manufacturing_orders WHERE company_id=$1 AND mo_number LIKE $2)`,
    [TEST_COMPANY_ID, `${PO_PREFIX}%`],
  )
  await pool.query(`DELETE FROM manufacturing_orders WHERE company_id=$1 AND mo_number LIKE $2`, [
    TEST_COMPANY_ID,
    `${PO_PREFIX}%`,
  ])
  await pool.query(`DELETE FROM boms WHERE company_id=$1 AND created_by=$2`, [TEST_COMPANY_ID, userId])
  await pool.query(
    `DELETE FROM vendor_invoice_lines WHERE po_line_id IN (SELECT id FROM po_lines WHERE po_id IN (SELECT id FROM purchase_orders WHERE company_id=$1 AND po_number LIKE $2))`,
    [TEST_COMPANY_ID, `${PO_PREFIX}%`],
  )
  await pool.query(
    `DELETE FROM vendor_invoices WHERE po_id IN (SELECT id FROM purchase_orders WHERE company_id=$1 AND po_number LIKE $2)`,
    [TEST_COMPANY_ID, `${PO_PREFIX}%`],
  )
  await pool.query(
    `DELETE FROM po_return_items WHERE return_id IN (SELECT id FROM po_returns WHERE company_id=$1 AND po_id IN (SELECT id FROM purchase_orders WHERE po_number LIKE $2))`,
    [TEST_COMPANY_ID, `${PO_PREFIX}%`],
  )
  await pool.query(
    `DELETE FROM po_returns WHERE company_id=$1 AND po_id IN (SELECT id FROM purchase_orders WHERE po_number LIKE $2)`,
    [TEST_COMPANY_ID, `${PO_PREFIX}%`],
  )
  await pool.query(
    `DELETE FROM document_attachments WHERE entity_type='po_receipt' AND entity_id IN (SELECT id FROM po_receipts WHERE po_id IN (SELECT id FROM purchase_orders WHERE company_id=$1 AND po_number LIKE $2))`,
    [TEST_COMPANY_ID, `${PO_PREFIX}%`],
  )
  await pool.query(`DELETE FROM files WHERE company_id=$1 AND file_key LIKE 'revtest-%'`, [TEST_COMPANY_ID])
  // stock_moves.po_receipt_line_id/po_line_id reference po_receipt_lines/
  // po_lines — must go before either of those, not after (this ran after
  // them before and broke on an FK violation the moment a prior test run
  // left any stock_moves rows behind).
  await pool.query(
    `DELETE FROM stock_moves WHERE company_id=$1 AND (
       po_line_id IN (SELECT id FROM po_lines WHERE po_id IN (SELECT id FROM purchase_orders WHERE company_id=$1 AND po_number LIKE $2))
       OR product_id IN (SELECT id FROM products WHERE company_id=$1 AND sku LIKE $3)
     )`,
    [TEST_COMPANY_ID, `${PO_PREFIX}%`, `${SKU_PREFIX}%`],
  )
  await pool.query(
    `DELETE FROM po_receipt_lines WHERE receipt_id IN (SELECT id FROM po_receipts WHERE po_id IN (SELECT id FROM purchase_orders WHERE company_id=$1 AND po_number LIKE $2))`,
    [TEST_COMPANY_ID, `${PO_PREFIX}%`],
  )
  await pool.query(
    `DELETE FROM po_receipts WHERE po_id IN (SELECT id FROM purchase_orders WHERE company_id=$1 AND po_number LIKE $2)`,
    [TEST_COMPANY_ID, `${PO_PREFIX}%`],
  )
  await pool.query(
    `DELETE FROM po_approval_log WHERE po_id IN (SELECT id FROM purchase_orders WHERE company_id=$1 AND po_number LIKE $2)`,
    [TEST_COMPANY_ID, `${PO_PREFIX}%`],
  )
  await pool.query(
    `DELETE FROM po_lines WHERE po_id IN (SELECT id FROM purchase_orders WHERE company_id=$1 AND po_number LIKE $2)`,
    [TEST_COMPANY_ID, `${PO_PREFIX}%`],
  )
  await pool.query(`DELETE FROM purchase_orders WHERE company_id=$1 AND po_number LIKE $2`, [
    TEST_COMPANY_ID,
    `${PO_PREFIX}%`,
  ])
  await pool.query(
    `DELETE FROM product_cost_history WHERE product_id IN (SELECT id FROM products WHERE company_id=$1 AND sku LIKE $2)`,
    [TEST_COMPANY_ID, `${SKU_PREFIX}%`],
  )
  await pool.query(
    `DELETE FROM stock_balances WHERE product_id IN (SELECT id FROM products WHERE company_id=$1 AND sku LIKE $2)`,
    [TEST_COMPANY_ID, `${SKU_PREFIX}%`],
  )
  await pool.query(`DELETE FROM products WHERE company_id=$1 AND sku LIKE $2`, [TEST_COMPANY_ID, `${SKU_PREFIX}%`])
  await pool.query(`DELETE FROM vendors WHERE company_id=$1 AND name LIKE 'REVTEST-%'`, [TEST_COMPANY_ID])
}

beforeAll(async () => {
  const userR = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [TEST_USER_EMAIL],
  )
  userId = userR.rows[0]!.id
  ctx = { auth: { companyId: TEST_COMPANY_ID, userId, role: 'system_admin', module: 'all', sessionId: 'reverse-receipt-test' } }

  const whR = await pool.query<{ id: string }>(
    `SELECT id FROM stock_locations WHERE company_id=$1 AND type='warehouse' AND is_active=true LIMIT 1`,
    [TEST_COMPANY_ID],
  )
  if (!whR.rows[0]) throw new Error('No warehouse location seeded for test company — run seeds first')
  warehouseId = whR.rows[0].id

  await cleanup()
})

afterAll(async () => {
  await cleanup()
  await pool.query(`DELETE FROM users WHERE email=$1`, [TEST_USER_EMAIL])
  await pool.end()
})

describe('reverseReceipt — happy path', () => {
  it('undoes stock, qty_received, and product cost for a simple confirmed receipt', async () => {
    const productId = await makeProduct('happypath')
    const poId = await makePO('approved')
    // confirmReceipt bases the posted stock cost on po_lines.unit_price (20
    // here), not the receipt line's own actual_unit_price — actual_unit_price
    // only updates po_lines.actual_unit_price, a separate, informational field.
    const lineId = await makePOLine(poId, productId, 10, 20)
    const receiptId = await receiveAndConfirm(poId, lineId, 10, 20)

    expect(await getBalance(productId, warehouseId)).toBe(10)
    const lineAfterReceive = await pool.query<{ qty_received: string }>(
      `SELECT qty_received FROM po_lines WHERE id=$1`,
      [lineId],
    )
    expect(parseFloat(lineAfterReceive.rows[0]!.qty_received)).toBe(10)
    const productAfterReceive = await pool.query<{ standard_cost: string }>(
      `SELECT standard_cost FROM products WHERE id=$1`,
      [productId],
    )
    expect(parseFloat(productAfterReceive.rows[0]!.standard_cost)).toBe(20)

    const result = await resolvers.Mutation.reverseReceipt(
      null,
      { id: receiptId, reason: 'wrong PO, duplicate entry' },
      ctx as never,
    )
    expect((result as { status: string }).status).toBe('reversed')

    expect(await getBalance(productId, warehouseId)).toBe(0)
    const lineAfterReverse = await pool.query<{ qty_received: string }>(
      `SELECT qty_received FROM po_lines WHERE id=$1`,
      [lineId],
    )
    expect(parseFloat(lineAfterReverse.rows[0]!.qty_received)).toBe(0)
    // Only receipt on this PO for this product — cost reversion is
    // unambiguous, should revert to whatever it was before (products.standard_cost
    // defaults to 0, not null, for a freshly-created product with no prior cost).
    const productAfterReverse = await pool.query<{ standard_cost: string | null }>(
      `SELECT standard_cost FROM products WHERE id=$1`,
      [productId],
    )
    expect(parseFloat(productAfterReverse.rows[0]!.standard_cost ?? '0')).toBe(0)

    const receiptRow = await pool.query<{ status: string; reversed_by: string; reversal_reason: string }>(
      `SELECT status, reversed_by, reversal_reason FROM po_receipts WHERE id=$1`,
      [receiptId],
    )
    expect(receiptRow.rows[0]!.status).toBe('reversed')
    expect(receiptRow.rows[0]!.reversed_by).toBe(userId)
    expect(receiptRow.rows[0]!.reversal_reason).toBe('wrong PO, duplicate entry')

    // Terminal — cannot be reversed again.
    await expect(
      resolvers.Mutation.reverseReceipt(null, { id: receiptId, reason: 'second attempt' }, ctx as never),
    ).rejects.toThrow(/only a confirmed receipt/i)
  })

  it('requires a reason', async () => {
    const productId = await makeProduct('noreason')
    const poId = await makePO('approved')
    const lineId = await makePOLine(poId, productId, 5, 10)
    const receiptId = await receiveAndConfirm(poId, lineId, 5, 10)

    await expect(
      resolvers.Mutation.reverseReceipt(null, { id: receiptId, reason: '   ' }, ctx as never),
    ).rejects.toThrow(/reason is required/i)
  })
})

describe('reverseReceipt — guards', () => {
  it('refuses once the PO is invoiced, pointing at PO Returns instead', async () => {
    const productId = await makeProduct('invoiced')
    const poId = await makePO('approved')
    const lineId = await makePOLine(poId, productId, 5, 10)
    const receiptId = await receiveAndConfirm(poId, lineId, 5, 10)

    await pool.query(`UPDATE purchase_orders SET status='invoiced' WHERE id=$1`, [poId])

    await expect(
      resolvers.Mutation.reverseReceipt(null, { id: receiptId, reason: 'test' }, ctx as never),
    ).rejects.toThrow(/PO Returns/i)

    expect(await getBalance(productId, warehouseId)).toBe(5)
  })

  it('refuses when the stock has already moved on (insufficient balance)', async () => {
    const productId = await makeProduct('alreadyissued')
    const poId = await makePO('approved')
    const lineId = await makePOLine(poId, productId, 10, 10)
    const receiptId = await receiveAndConfirm(poId, lineId, 10, 10)

    // Simulate 7 of the 10 units already having left the warehouse (a Store
    // Out, a transfer — doesn't matter which for this guard).
    await pool.query(
      `UPDATE stock_balances SET qty_on_hand = 3 WHERE product_id=$1 AND location_id=$2 AND lot_id IS NULL`,
      [productId, warehouseId],
    )

    await expect(
      resolvers.Mutation.reverseReceipt(null, { id: receiptId, reason: 'test' }, ctx as never),
    ).rejects.toThrow(/already moved on/i)

    // Rolled back entirely — the receipt must still be confirmed, not
    // left half-reversed.
    const receiptRow = await pool.query<{ status: string }>(`SELECT status FROM po_receipts WHERE id=$1`, [
      receiptId,
    ])
    expect(receiptRow.rows[0]!.status).toBe('confirmed')
  })

  it('refuses when already invoiced on a vendor AP invoice', async () => {
    const productId = await makeProduct('apinvoiced')
    const poId = await makePO('approved')
    const lineId = await makePOLine(poId, productId, 5, 10)
    const receiptId = await receiveAndConfirm(poId, lineId, 5, 10)

    const vendorR = await pool.query<{ id: string }>(
      `INSERT INTO vendors (company_id, name) VALUES ($1,$2) RETURNING id`,
      [TEST_COMPANY_ID, `REVTEST-Vendor-${Date.now()}`],
    )
    const invoiceR = await pool.query<{ id: string }>(
      `INSERT INTO vendor_invoices (company_id, vendor_id, po_id, invoice_number, invoice_date, due_date, currency_code, status, created_by)
       VALUES ($1,$2,$3,$4,CURRENT_DATE,CURRENT_DATE,'IQD','draft',$5) RETURNING id`,
      [TEST_COMPANY_ID, vendorR.rows[0]!.id, poId, `REVTEST-INV-${Date.now()}`, userId],
    )
    await pool.query(
      `INSERT INTO vendor_invoice_lines (vendor_invoice_id, po_line_id, description, qty, unit_price, total_price)
       VALUES ($1,$2,'test',5,10,50)`,
      [invoiceR.rows[0]!.id, lineId],
    )

    await expect(
      resolvers.Mutation.reverseReceipt(null, { id: receiptId, reason: 'test' }, ctx as never),
    ).rejects.toThrow(/already invoiced/i)

    expect(await getBalance(productId, warehouseId)).toBe(5)
  })

  it('refuses when already covered by a vendor return', async () => {
    const productId = await makeProduct('returned')
    const poId = await makePO('approved')
    const lineId = await makePOLine(poId, productId, 5, 10)
    const receiptId = await receiveAndConfirm(poId, lineId, 5, 10)

    const returnR = await pool.query<{ id: string }>(
      `INSERT INTO po_returns (company_id, po_id, return_number, currency_code, created_by)
       VALUES ($1,$2,$3,'IQD',$4) RETURNING id`,
      [TEST_COMPANY_ID, poId, `REVTEST-RET-${Date.now()}`, userId],
    )
    await pool.query(
      `INSERT INTO po_return_items (return_id, po_line_id, description, quantity_returned, original_unit_price, assessed_unit_price)
       VALUES ($1,$2,'damaged',2,10,10)`,
      [returnR.rows[0]!.id, lineId],
    )

    await expect(
      resolvers.Mutation.reverseReceipt(null, { id: receiptId, reason: 'test' }, ctx as never),
    ).rejects.toThrow(/vendor return/i)

    expect(await getBalance(productId, warehouseId)).toBe(5)
  })
})

describe('reverseReceipt — linked Manufacturing Order', () => {
  async function makeMO(productId: string, qtyPlanned: number): Promise<string> {
    const finishedProductId = await makeProduct('mo-finished')
    const bomR = await pool.query<{ id: string }>(
      `INSERT INTO boms (company_id, finished_product_id, created_by) VALUES ($1,$2,$3) RETURNING id`,
      [TEST_COMPANY_ID, finishedProductId, userId],
    )
    const moR = await pool.query<{ id: string }>(
      `INSERT INTO manufacturing_orders (company_id, mo_number, bom_id, finished_product_id, qty_planned, status, created_by)
       VALUES ($1,$2,$3,$4,1,'confirmed',$5) RETURNING id`,
      [TEST_COMPANY_ID, `${PO_PREFIX}MO-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, bomR.rows[0]!.id, finishedProductId, userId],
    )
    await pool.query(
      `INSERT INTO mo_consumptions (mo_id, component_product_id, qty_planned, qty_consumed) VALUES ($1,$2,$3,0)`,
      [moR.rows[0]!.id, productId, qtyPlanned],
    )
    return moR.rows[0]!.id
  }

  it('decrements consumption and un-confirms the MO when exactly reconstructible', async () => {
    const productId = await makeProduct('mo-clean')
    const moId = await makeMO(productId, 10)
    const poId = await makePO('approved', { linkedMoId: moId })
    const lineId = await makePOLine(poId, productId, 10, 5)
    const receiptId = await receiveAndConfirm(poId, lineId, 10, 5)

    const consumptionAfterReceive = await pool.query<{ qty_consumed: string }>(
      `SELECT qty_consumed FROM mo_consumptions WHERE mo_id=$1 AND component_product_id=$2`,
      [moId, productId],
    )
    expect(parseFloat(consumptionAfterReceive.rows[0]!.qty_consumed)).toBe(10)
    const moAfterReceive = await pool.query<{ status: string }>(`SELECT status FROM manufacturing_orders WHERE id=$1`, [moId])
    expect(moAfterReceive.rows[0]!.status).toBe('confirmed')

    await resolvers.Mutation.reverseReceipt(null, { id: receiptId, reason: 'wrong MO' }, ctx as never)

    const consumptionAfterReverse = await pool.query<{ qty_consumed: string }>(
      `SELECT qty_consumed FROM mo_consumptions WHERE mo_id=$1 AND component_product_id=$2`,
      [moId, productId],
    )
    expect(parseFloat(consumptionAfterReverse.rows[0]!.qty_consumed)).toBe(0)
    const moAfterReverse = await pool.query<{ status: string }>(`SELECT status FROM manufacturing_orders WHERE id=$1`, [moId])
    expect(moAfterReverse.rows[0]!.status).toBe('draft')
  })

  it('blocks reversal once the MO has moved into real production', async () => {
    const productId = await makeProduct('mo-inprogress')
    const moId = await makeMO(productId, 10)
    const poId = await makePO('approved', { linkedMoId: moId })
    const lineId = await makePOLine(poId, productId, 10, 5)
    const receiptId = await receiveAndConfirm(poId, lineId, 10, 5)

    await pool.query(`UPDATE manufacturing_orders SET status='in_progress' WHERE id=$1`, [moId])

    await expect(
      resolvers.Mutation.reverseReceipt(null, { id: receiptId, reason: 'test' }, ctx as never),
    ).rejects.toThrow(/already moved past confirmation/i)

    expect(await getBalance(productId, warehouseId)).toBe(10)
  })

  it('blocks reversal when consumption already hit its planned cap from an earlier contributor', async () => {
    const productId = await makeProduct('mo-capped')
    const moId = await makeMO(productId, 5)
    const poId = await makePO('approved', { linkedMoId: moId })
    const lineId = await makePOLine(poId, productId, 10, 5)
    const receiptId = await receiveAndConfirm(poId, lineId, 10, 5)

    // Simulate the cap having already absorbed more than this receipt's own
    // contribution (e.g. another receipt on another PO also fed this
    // component) — qty_consumed no longer equals this receipt's own total.
    await pool.query(`UPDATE mo_consumptions SET qty_consumed=5 WHERE mo_id=$1 AND component_product_id=$2`, [
      moId,
      productId,
    ])

    await expect(
      resolvers.Mutation.reverseReceipt(null, { id: receiptId, reason: 'test' }, ctx as never),
    ).rejects.toThrow(/already hit its planned cap/i)

    expect(await getBalance(productId, warehouseId)).toBe(10)
  })
})
