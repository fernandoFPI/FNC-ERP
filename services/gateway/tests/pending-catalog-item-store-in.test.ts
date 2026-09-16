// Regression coverage for a real production gap: confirmReceipt skips the
// stock_moves insert for any receipt line with no catalog product_id yet
// (queuing it into pending_product_catalog_items, source='store_in',
// instead), but neither createProductFromPendingCatalogItem nor
// linkPendingCatalogItemToProduct ever backfilled that missing move once the
// item was cataloged — the receipt stayed 'confirmed' and po_lines.qty_received
// matched what was ordered, but the quantity never actually reached
// stock_balances. completeStoreInLineForResolvedProduct (resolvers.ts) closes
// this the same way completeStockIssuanceLineForResolvedProduct already does
// for the sibling 'stock_issuance' source. Real-Postgres pattern, same as
// project-material-return.test.ts — needs the stock_moves -> stock_balances
// trigger to actually fire.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'

const TEST_COMPANY_ID = '00000000-0000-0000-0000-000000000001'
const TEST_USER_EMAIL = 'pending-store-in-test@fnc-erp.local'
const SKU_PREFIX = 'PENDSITEST-'
const PO_PREFIX = 'PENDSITEST-PO-'

let userId: string
let vendorId: string
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

async function makePO(): Promise<string> {
  const poNumber = `${PO_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const r = await pool.query<{ id: string }>(
    `INSERT INTO purchase_orders (company_id, po_number, vendor_id, status, currency_code, purpose, created_by)
     VALUES ($1,$2,$3,'approved','IQD','stock',$4) RETURNING id`,
    [TEST_COMPANY_ID, poNumber, vendorId, userId],
  )
  return r.rows[0]!.id
}

// product_id left NULL deliberately — a free-text line never mapped to the
// catalog, the exact shape confirmReceipt queues into pending_product_catalog_items.
async function makePOLineNoProduct(poId: string, qtyOrdered: number, unitPrice: number): Promise<string> {
  const r = await pool.query<{ id: string }>(
    `INSERT INTO po_lines (po_id, product_id, description, line_number, qty_ordered, unit_price, total_price, uom)
     VALUES ($1,NULL,'metals',1,$2,$3,$4,'unit') RETURNING id`,
    [poId, qtyOrdered, unitPrice, qtyOrdered * unitPrice],
  )
  return r.rows[0]!.id
}

async function makeUploadedFile(category: string): Promise<string> {
  const key = `pendsi-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
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

// Records + confirms a receipt for one po_line — the real confirmReceipt
// path, photo/document gate included, so this line ends up exactly as
// production got it: a 'confirmed' po_receipts row, qty_received bumped on
// po_lines, and (since product_id is null) a queued pending_product_catalog_items
// row instead of a stock move.
async function confirmReceiptFor(poId: string, poLineId: string, qty: number): Promise<string> {
  const receipt = (await resolvers.Mutation.recordReceipt(
    null,
    {
      poId,
      input: {
        receipt_date: new Date().toISOString().slice(0, 10),
        location_id: warehouseId,
        lines: [{ po_line_id: poLineId, qty_received: qty }],
      },
    },
    ctx as never,
  )) as { id: string }
  await attachFile('po_receipt', receipt.id, 'po_receipt_photo')
  await attachFile('purchase_order', poId, 'po_receipt_document')
  await resolvers.Mutation.confirmReceipt(null, { id: receipt.id }, ctx as never)
  return receipt.id
}

async function getBalance(productId: string, locationId: string): Promise<{ onHand: number }> {
  const r = await pool.query<{ qty_on_hand: string }>(
    `SELECT qty_on_hand FROM stock_balances WHERE product_id=$1 AND location_id=$2 AND lot_id IS NULL`,
    [productId, locationId],
  )
  return { onHand: parseFloat(r.rows[0]?.qty_on_hand ?? '0') }
}

async function cleanup(): Promise<void> {
  await pool.query(
    `DELETE FROM stock_moves WHERE po_line_id IN (
       SELECT id FROM po_lines WHERE po_id IN (SELECT id FROM purchase_orders WHERE company_id=$1 AND po_number LIKE $2)
     )`,
    [TEST_COMPANY_ID, `${PO_PREFIX}%`],
  )
  await pool.query(
    `DELETE FROM pending_product_catalog_items WHERE po_id IN (SELECT id FROM purchase_orders WHERE company_id=$1 AND po_number LIKE $2)`,
    [TEST_COMPANY_ID, `${PO_PREFIX}%`],
  )
  await pool.query(
    `DELETE FROM document_attachments WHERE entity_id IN (
       SELECT id FROM po_receipts WHERE po_id IN (SELECT id FROM purchase_orders WHERE company_id=$1 AND po_number LIKE $2)
     ) OR entity_id IN (SELECT id FROM purchase_orders WHERE company_id=$1 AND po_number LIKE $2)`,
    [TEST_COMPANY_ID, `${PO_PREFIX}%`],
  )
  await pool.query(
    `DELETE FROM po_receipt_lines WHERE receipt_id IN (
       SELECT id FROM po_receipts WHERE po_id IN (SELECT id FROM purchase_orders WHERE company_id=$1 AND po_number LIKE $2)
     )`,
    [TEST_COMPANY_ID, `${PO_PREFIX}%`],
  )
  await pool.query(
    `DELETE FROM po_receipts WHERE po_id IN (SELECT id FROM purchase_orders WHERE company_id=$1 AND po_number LIKE $2)`,
    [TEST_COMPANY_ID, `${PO_PREFIX}%`],
  )
  await pool.query(`DELETE FROM purchase_orders WHERE company_id=$1 AND po_number LIKE $2`, [
    TEST_COMPANY_ID,
    `${PO_PREFIX}%`,
  ])
  // Catches stock_moves with no po_line_id at all — e.g. a manual
  // createStockAdjustment — that the po_line-scoped delete above can't see.
  await pool.query(
    `DELETE FROM stock_moves WHERE product_id IN (SELECT id FROM products WHERE company_id=$1 AND sku LIKE $2)`,
    [TEST_COMPANY_ID, `${SKU_PREFIX}%`],
  )
  await pool.query(
    `DELETE FROM stock_balances WHERE product_id IN (SELECT id FROM products WHERE company_id=$1 AND sku LIKE $2)`,
    [TEST_COMPANY_ID, `${SKU_PREFIX}%`],
  )
  await pool.query(`DELETE FROM products WHERE company_id=$1 AND sku LIKE $2`, [TEST_COMPANY_ID, `${SKU_PREFIX}%`])
  await pool.query(`DELETE FROM files WHERE company_id=$1 AND file_key LIKE $2`, [TEST_COMPANY_ID, 'pendsi-test-%'])
}

beforeAll(async () => {
  const userR = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [TEST_USER_EMAIL],
  )
  userId = userR.rows[0]!.id
  ctx = { auth: { companyId: TEST_COMPANY_ID, userId, role: 'system_admin', module: 'all', sessionId: 'pendsi-test' } }

  const whR = await pool.query<{ id: string }>(
    `SELECT id FROM stock_locations WHERE company_id=$1 AND type='warehouse' AND is_active=true LIMIT 1`,
    [TEST_COMPANY_ID],
  )
  if (!whR.rows[0]) throw new Error('No warehouse location seeded for test company — run seeds first')
  warehouseId = whR.rows[0].id

  const vendorR = await pool.query<{ id: string }>(`SELECT id FROM vendors WHERE company_id=$1 LIMIT 1`, [
    TEST_COMPANY_ID,
  ])
  vendorId =
    vendorR.rows[0]?.id ??
    (
      await pool.query<{ id: string }>(`INSERT INTO vendors (company_id, name) VALUES ($1,$2) RETURNING id`, [
        TEST_COMPANY_ID,
        `${SKU_PREFIX}Vendor`,
      ])
    ).rows[0]!.id

  await cleanup()
})

afterAll(async () => {
  await cleanup()
  await pool.query(`DELETE FROM users WHERE email=$1`, [TEST_USER_EMAIL])
  await pool.end()
})

describe('completeStoreInLineForResolvedProduct (via createProductFromPendingCatalogItem)', () => {
  it('backfills the missing stock move once a store_in item is cataloged as a new product', async () => {
    const poId = await makePO()
    const poLineId = await makePOLineNoProduct(poId, 10, 50)
    await confirmReceiptFor(poId, poLineId, 10)

    const pendingRes = await pool.query<{ id: string; source: string; status: string }>(
      `SELECT id, source, status FROM pending_product_catalog_items WHERE po_line_id=$1`,
      [poLineId],
    )
    expect(pendingRes.rows).toHaveLength(1)
    expect(pendingRes.rows[0]!.source).toBe('store_in')
    expect(pendingRes.rows[0]!.status).toBe('pending')
    const pendingId = pendingRes.rows[0]!.id

    // Confirmed as received, but nothing has actually moved yet — this is
    // the exact state the production bug left behind.
    const beforeMoves = await pool.query(`SELECT id FROM stock_moves WHERE po_line_id=$1`, [poLineId])
    expect(beforeMoves.rows).toHaveLength(0)

    const product = (await resolvers.Mutation.createProductFromPendingCatalogItem(
      null,
      { id: pendingId, input: { name: 'Test Metals Widget', uom: 'unit' } },
      ctx as never,
    )) as { id: string }

    const moves = await pool.query<{ qty: string; unit_cost: string; to_location_id: string; source_type: string }>(
      `SELECT qty, unit_cost, to_location_id, source_type FROM stock_moves WHERE po_line_id=$1`,
      [poLineId],
    )
    expect(moves.rows).toHaveLength(1)
    expect(parseFloat(moves.rows[0]!.qty)).toBe(10)
    expect(parseFloat(moves.rows[0]!.unit_cost)).toBe(50)
    expect(moves.rows[0]!.to_location_id).toBe(warehouseId)
    expect(moves.rows[0]!.source_type).toBe('po_receipt')

    expect((await getBalance(product.id, warehouseId)).onHand).toBe(10)
  })

  it('backfills the missing stock move when linked to an existing product instead of a new one', async () => {
    const existingProductId = await makeProduct('existing')
    const poId = await makePO()
    const poLineId = await makePOLineNoProduct(poId, 6, 25)
    await confirmReceiptFor(poId, poLineId, 6)

    const pendingRes = await pool.query<{ id: string }>(
      `SELECT id FROM pending_product_catalog_items WHERE po_line_id=$1`,
      [poLineId],
    )
    const pendingId = pendingRes.rows[0]!.id

    await resolvers.Mutation.linkPendingCatalogItemToProduct(
      null,
      { id: pendingId, productId: existingProductId },
      ctx as never,
    )

    const moves = await pool.query<{ qty: string; product_id: string }>(
      `SELECT qty, product_id FROM stock_moves WHERE po_line_id=$1`,
      [poLineId],
    )
    expect(moves.rows).toHaveLength(1)
    expect(moves.rows[0]!.product_id).toBe(existingProductId)
    expect(parseFloat(moves.rows[0]!.qty)).toBe(6)
    expect((await getBalance(existingProductId, warehouseId)).onHand).toBe(6)
  })

  it('does not double-count a line a store keeper already fixed by hand with a manual stock adjustment', async () => {
    const existingProductId = await makeProduct('manually-fixed')
    const poId = await makePO()
    const poLineId = await makePOLineNoProduct(poId, 7, 30)
    await confirmReceiptFor(poId, poLineId, 7)

    // The store keeper notices the item never shows as on hand and corrects
    // it directly — same real path production used (createStockAdjustment),
    // with no link back to this receipt line at all.
    await resolvers.Mutation.createStockAdjustment(
      null,
      { input: { product_id: existingProductId, location_id: warehouseId, new_qty: 7 } },
      ctx as never,
    )
    expect((await getBalance(existingProductId, warehouseId)).onHand).toBe(7)

    const pendingRes = await pool.query<{ id: string }>(
      `SELECT id FROM pending_product_catalog_items WHERE po_line_id=$1`,
      [poLineId],
    )
    const pendingId = pendingRes.rows[0]!.id

    // Cataloging happens after the manual fix — this must NOT also post the
    // backfill move, or the balance would double to 14.
    await resolvers.Mutation.linkPendingCatalogItemToProduct(
      null,
      { id: pendingId, productId: existingProductId },
      ctx as never,
    )

    const moves = await pool.query(`SELECT id FROM stock_moves WHERE po_line_id=$1`, [poLineId])
    expect(moves.rows).toHaveLength(0)
    expect((await getBalance(existingProductId, warehouseId)).onHand).toBe(7)
  })

  it('backfills both receipts when the same line was received in two partial deliveries before being cataloged', async () => {
    const poId = await makePO()
    const poLineId = await makePOLineNoProduct(poId, 15, 12)
    await confirmReceiptFor(poId, poLineId, 10)
    // A second, distinct partial receipt against the same still-uncataloged
    // line — pending_product_catalog_items' own ON CONFLICT(po_line_id) DO
    // NOTHING means only the first queued it; both receipts still need
    // their own missing stock move once resolved.
    await confirmReceiptFor(poId, poLineId, 5)

    const receiptLinesCount = await pool.query(`SELECT id FROM po_receipt_lines WHERE po_line_id=$1`, [poLineId])
    expect(receiptLinesCount.rows).toHaveLength(2)

    const pendingRes = await pool.query<{ id: string }>(
      `SELECT id FROM pending_product_catalog_items WHERE po_line_id=$1`,
      [poLineId],
    )
    expect(pendingRes.rows).toHaveLength(1) // still just one ticket, per the unique constraint
    const pendingId = pendingRes.rows[0]!.id

    const product = (await resolvers.Mutation.createProductFromPendingCatalogItem(
      null,
      { id: pendingId, input: { name: 'Test Two-Batch Widget', uom: 'unit' } },
      ctx as never,
    )) as { id: string }

    const moves = await pool.query<{ qty: string }>(`SELECT qty FROM stock_moves WHERE po_line_id=$1 ORDER BY qty`, [
      poLineId,
    ])
    expect(moves.rows).toHaveLength(2)
    expect(moves.rows.map((r) => parseFloat(r.qty))).toEqual([5, 10])
    expect((await getBalance(product.id, warehouseId)).onHand).toBe(15)
  })
})
