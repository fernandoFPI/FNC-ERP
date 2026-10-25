// Coverage for a real gap: a custom-description line always queues into
// pending_product_catalog_items as "needs cataloging" — but a lot of these
// are a one-time service/expense (hiring a taxi to deliver materials) that
// was never meant to become a permanent catalog product, or a duplicate of
// an existing product under different wording (handled by linking instead).
// dismissPendingCatalogItem lets a store keeper say so without creating or
// linking a product. Real-Postgres pattern, same as
// pending-catalog-item-store-in.test.ts.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'

const TEST_COMPANY_ID = 'f0000000-0000-0000-0000-000000000009'
const TEST_USER_EMAIL = 'dismiss-pending-catalog-test@fnc-erp.local'
const PO_PREFIX = 'DISMISSPENDTEST-PO-'

let userId: string
let vendorId: string
let warehouseId: string
let ctx: { auth: { companyId: string; userId: string; role: string; module: string; sessionId: string } }

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
// catalog, the exact shape confirmReceipt queues into
// pending_product_catalog_items.
async function makePOLineNoProduct(poId: string, qtyOrdered: number, unitPrice: number): Promise<string> {
  const r = await pool.query<{ id: string }>(
    `INSERT INTO po_lines (po_id, product_id, description, line_number, qty_ordered, unit_price, total_price, uom)
     VALUES ($1,NULL,'Taxi delivery to site',1,$2,$3,$4,'unit') RETURNING id`,
    [poId, qtyOrdered, unitPrice, qtyOrdered * unitPrice],
  )
  return r.rows[0]!.id
}

async function makeUploadedFile(category: string): Promise<string> {
  const key = `dismisspend-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
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

// Real confirmReceipt path — this is exactly how production queues a
// no-product-id line into pending_product_catalog_items (source='store_in').
async function confirmReceiptFor(poId: string, poLineId: string, qty: number): Promise<void> {
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
}

async function getPendingItem(poLineId: string) {
  const r = await pool.query<{
    id: string
    status: string
    dismiss_reason: string | null
    resolved_by: string | null
  }>(
    `SELECT id, status, dismiss_reason, resolved_by FROM pending_product_catalog_items WHERE po_line_id=$1`,
    [poLineId],
  )
  return r.rows[0]
}

async function cleanup(): Promise<void> {
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
  await pool.query(`DELETE FROM files WHERE company_id=$1 AND file_key LIKE $2`, [
    TEST_COMPANY_ID,
    'dismisspend-test-%',
  ])
}

beforeAll(async () => {
  const userR = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [TEST_USER_EMAIL],
  )
  userId = userR.rows[0]!.id
  ctx = {
    auth: { companyId: TEST_COMPANY_ID, userId, role: 'system_admin', module: 'all', sessionId: 'dismiss-pending-test' },
  }

  const vendorR = await pool.query<{ id: string }>(
    `INSERT INTO vendors (company_id, name) VALUES ($1,$2) RETURNING id`,
    [TEST_COMPANY_ID, `${PO_PREFIX}Vendor`],
  )
  vendorId = vendorR.rows[0]!.id

  const wh = await pool.query<{ id: string }>(
    `SELECT id FROM stock_locations WHERE company_id=$1 AND type='warehouse' AND is_active=true LIMIT 1`,
    [TEST_COMPANY_ID],
  )
  if (!wh.rows[0]) throw new Error('No warehouse location seeded for test company — run seeds first')
  warehouseId = wh.rows[0].id

  await cleanup()
})

afterAll(async () => {
  await cleanup()
  await pool.query(`DELETE FROM vendors WHERE company_id=$1 AND name LIKE $2`, [
    TEST_COMPANY_ID,
    `${PO_PREFIX}%`,
  ])
  await pool.query(`DELETE FROM users WHERE email=$1`, [TEST_USER_EMAIL])
  await pool.end()
})

describe('dismissPendingCatalogItem', () => {
  it('marks a pending item dismissed, leaves po_lines.product_id null, and stores the optional reason', async () => {
    const poId = await makePO()
    const lineId = await makePOLineNoProduct(poId, 1, 15000)
    await confirmReceiptFor(poId, lineId, 1)

    const before = await getPendingItem(lineId)
    expect(before?.status).toBe('pending')

    const result = await resolvers.Mutation.dismissPendingCatalogItem(
      null,
      { id: before!.id, reason: 'One-time taxi delivery, not an inventory item' },
      ctx as never,
    )
    expect(result).toBe(true)

    const after = await getPendingItem(lineId)
    expect(after?.status).toBe('dismissed')
    expect(after?.dismiss_reason).toBe('One-time taxi delivery, not an inventory item')
    expect(after?.resolved_by).toBe(userId)

    const line = await pool.query<{ product_id: string | null }>(
      `SELECT product_id FROM po_lines WHERE id=$1`,
      [lineId],
    )
    expect(line.rows[0]!.product_id).toBeNull()
  })

  it('does not require a reason', async () => {
    const poId = await makePO()
    const lineId = await makePOLineNoProduct(poId, 1, 5000)
    await confirmReceiptFor(poId, lineId, 1)
    const pending = await getPendingItem(lineId)

    await resolvers.Mutation.dismissPendingCatalogItem(null, { id: pending!.id }, ctx as never)

    const after = await getPendingItem(lineId)
    expect(after?.status).toBe('dismissed')
    expect(after?.dismiss_reason).toBeNull()
  })

  it('drops out of the pending queue once dismissed', async () => {
    const poId = await makePO()
    const lineId = await makePOLineNoProduct(poId, 1, 7500)
    await confirmReceiptFor(poId, lineId, 1)
    const pending = await getPendingItem(lineId)

    await resolvers.Mutation.dismissPendingCatalogItem(null, { id: pending!.id }, ctx as never)

    const queue = (await resolvers.Query.pendingProductCatalogItems(
      null,
      {},
      ctx as never,
    )) as { id: string }[]
    expect(queue.find((q) => q.id === pending!.id)).toBeUndefined()
  })

  it('refuses to dismiss a request that was already resolved', async () => {
    const poId = await makePO()
    const lineId = await makePOLineNoProduct(poId, 1, 3000)
    await confirmReceiptFor(poId, lineId, 1)
    const pending = await getPendingItem(lineId)

    await resolvers.Mutation.dismissPendingCatalogItem(null, { id: pending!.id }, ctx as never)

    await expect(
      resolvers.Mutation.dismissPendingCatalogItem(null, { id: pending!.id, reason: 'again' }, ctx as never),
    ).rejects.toThrow(/not found \(or already resolved\)/i)
  })
})
