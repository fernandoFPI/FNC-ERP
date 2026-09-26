// Regression: myPOQueue's WHERE clause never included status='bought' at
// all — not for the organizer, a buyer, or even system_admin — so a G1
// child PO (forked by finishBuyingRequisition, forever stuck at 'bought'
// until someone records its receipt) was invisible in every user's queue.
// Found live: NF-PO-2026-0057 and 9 siblings, all sitting unreceived with
// nobody ever shown a to-do for them.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'

const TEST_COMPANY_ID = '00000000-0000-0000-0000-000000000001'
const TEST_USER_EMAIL = 'my-po-queue-bought-test@fnc-erp.local'
const BYSTANDER_USER_EMAIL = 'my-po-queue-bought-bystander-test@fnc-erp.local'
const VENDOR_PREFIX = 'MPQBTEST-VENDOR-'
const SKU_PREFIX = 'MPQBTEST-'

let userId: string
let bystanderUserId: string
let warehouseId: string
let vendorId: string
let ctx: { auth: { companyId: string; userId: string; role: string; module: string; sessionId: string } }
let bystanderCtx: { auth: { companyId: string; userId: string; role: string; module: string; sessionId: string } }

async function makeProduct(suffix: string): Promise<string> {
  const sku = `${SKU_PREFIX}${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const r = await pool.query<{ id: string }>(
    `INSERT INTO products (company_id, sku, name, uom, category) VALUES ($1,$2,$3,'unit','general') RETURNING id`,
    [TEST_COMPANY_ID, sku, sku],
  )
  return r.rows[0]!.id
}

async function makeUploadedFile(): Promise<string> {
  const key = `mpqb-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const r = await pool.query<{ id: string }>(
    `INSERT INTO files (company_id, uploaded_by, file_key, original_filename, mime_type, size_bytes, category, status)
     VALUES ($1,$2,$3,'receipt.jpg','image/jpeg',1024,'attachment','uploaded') RETURNING id`,
    [TEST_COMPANY_ID, userId, key],
  )
  return r.rows[0]!.id
}

// Drives a fresh requisition (one line, fully purchased from one vendor)
// all the way to a forked child PO sitting at 'bought' — same path as
// requisition-finish-buying.test.ts's makeReqAtItemsBought + recordPurchase
// + finishBuyingRequisition.
async function makeChildPOAtBought(): Promise<{ poId: string }> {
  const productId = await makeProduct('bought')
  const created = await resolvers.Mutation.createRequisition(
    null,
    { input: { purpose: 'stock', lines: [{ product_id: productId, description: 'x', qty: 5, unit_price: 1 }] } },
    ctx as never,
  )
  const reqId = (created as { id: string }).id
  const lineRow = await pool.query<{ id: string }>(`SELECT id FROM po_lines WHERE requisition_id=$1`, [reqId])
  const lineId = lineRow.rows[0]!.id

  await resolvers.Mutation.submitRequisitionToInventoryCheck(null, { id: reqId }, ctx as never)
  await resolvers.Mutation.confirmRequisitionInventoryCheck(
    null,
    { id: reqId, lineStockQtys: [{ lineId, qtyFromStock: 0 }] },
    ctx as never,
  )
  await resolvers.Mutation.submitRequisitionMarketPricing(
    null,
    { id: reqId, linePrices: [{ lineId, marketPrice: 20, currencyCode: 'IQD' }] },
    ctx as never,
  )
  await resolvers.Mutation.verifyRequisitionPrices(
    null,
    { id: reqId, lineAdjustments: [{ lineId, verifiedPrice: 20 }] },
    ctx as never,
  )
  await resolvers.Mutation.approveRequisition(null, { id: reqId }, ctx as never)

  const receiptFileId = await makeUploadedFile()
  await resolvers.Mutation.recordLinePurchase(
    null,
    { input: { lineId, vendorId, qty: 5, actualUnitPrice: 20, currencyCode: 'IQD', receiptFileId } },
    ctx as never,
  )
  await resolvers.Mutation.finishBuyingRequisition(null, { id: reqId }, ctx as never)

  const line = await pool.query<{ po_id: string }>(`SELECT po_id FROM po_lines WHERE id=$1`, [lineId])
  const poId = line.rows[0]!.po_id
  const po = await pool.query<{ status: string }>(`SELECT status FROM purchase_orders WHERE id=$1`, [poId])
  expect(po.rows[0]!.status).toBe('bought')
  return { poId }
}

async function cleanup(): Promise<void> {
  await pool.query(
    `DELETE FROM po_line_purchases WHERE po_line_id IN (
       SELECT pl.id FROM po_lines pl JOIN requisitions req ON req.id=pl.requisition_id
       WHERE req.company_id=$1 AND req.organizer_id=$2)`,
    [TEST_COMPANY_ID, userId],
  )
  await pool.query(`DELETE FROM document_attachments WHERE entity_type='po_line_purchase' AND uploaded_by=$1`, [userId])
  await pool.query(`DELETE FROM files WHERE company_id=$1 AND uploaded_by=$2`, [TEST_COMPANY_ID, userId])
  await pool.query(
    `DELETE FROM requisition_approved_totals WHERE requisition_id IN (SELECT id FROM requisitions WHERE company_id=$1 AND organizer_id=$2)`,
    [TEST_COMPANY_ID, userId],
  )
  await pool.query(
    `DELETE FROM requisition_approval_log WHERE requisition_id IN (SELECT id FROM requisitions WHERE company_id=$1 AND organizer_id=$2)`,
    [TEST_COMPANY_ID, userId],
  )
  await pool.query(
    `DELETE FROM po_lines WHERE po_id IN (SELECT id FROM purchase_orders WHERE company_id=$1 AND requisition_id IN (SELECT id FROM requisitions WHERE company_id=$1 AND organizer_id=$2))`,
    [TEST_COMPANY_ID, userId],
  )
  await pool.query(
    `DELETE FROM purchase_orders WHERE company_id=$1 AND requisition_id IN (SELECT id FROM requisitions WHERE company_id=$1 AND organizer_id=$2)`,
    [TEST_COMPANY_ID, userId],
  )
  await pool.query(
    `DELETE FROM po_lines WHERE requisition_id IN (SELECT id FROM requisitions WHERE company_id=$1 AND organizer_id=$2)`,
    [TEST_COMPANY_ID, userId],
  )
  await pool.query(`DELETE FROM requisitions WHERE company_id=$1 AND organizer_id=$2`, [TEST_COMPANY_ID, userId])
  await pool.query(`DELETE FROM products WHERE company_id=$1 AND sku LIKE $2`, [TEST_COMPANY_ID, `${SKU_PREFIX}%`])
  await pool.query(`DELETE FROM vendors WHERE company_id=$1 AND name LIKE $2`, [TEST_COMPANY_ID, `${VENDOR_PREFIX}%`])
}

beforeAll(async () => {
  const userR = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [TEST_USER_EMAIL],
  )
  userId = userR.rows[0]!.id
  // system_admin, matching every other G1 test file's ctx — a plain 'user'
  // organizer can't clear every stage's own position gate (store_pricing,
  // procurement_officer, etc.) alone. This means the organizer clause and
  // the system_admin catch-all both apply here; the bystander test below
  // is what actually isolates "not just anyone sees it".
  ctx = { auth: { companyId: TEST_COMPANY_ID, userId, role: 'system_admin', module: 'all', sessionId: 'mpqb-test' } }

  const bystanderR = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [BYSTANDER_USER_EMAIL],
  )
  bystanderUserId = bystanderR.rows[0]!.id
  bystanderCtx = {
    auth: { companyId: TEST_COMPANY_ID, userId: bystanderUserId, role: 'user', module: 'all', sessionId: 'mpqb-test-bystander' },
  }

  const whR = await pool.query<{ id: string }>(
    `SELECT id FROM stock_locations WHERE company_id=$1 AND type='warehouse' AND is_active=true LIMIT 1`,
    [TEST_COMPANY_ID],
  )
  if (!whR.rows[0]) throw new Error('No warehouse location seeded for test company — run seeds first')
  warehouseId = whR.rows[0].id
  void warehouseId

  await cleanup()

  const v = await pool.query<{ id: string }>(`INSERT INTO vendors (company_id, name) VALUES ($1,$2) RETURNING id`, [
    TEST_COMPANY_ID,
    `${VENDOR_PREFIX}A-${Date.now()}`,
  ])
  vendorId = v.rows[0]!.id

  await pool.query(
    `INSERT INTO company_price_tolerance (company_id, currency_code, tolerance_pct, tolerance_abs, is_provisional)
     VALUES ($1,'IQD',5,1000,true)
     ON CONFLICT (company_id, currency_code) DO UPDATE SET tolerance_pct=5, tolerance_abs=1000`,
    [TEST_COMPANY_ID],
  )
})

afterAll(async () => {
  await cleanup()
  await pool.query(`DELETE FROM users WHERE email=$1`, [TEST_USER_EMAIL])
  await pool.query(`DELETE FROM users WHERE email=$1`, [BYSTANDER_USER_EMAIL])
  await pool.end()
})

describe('myPOQueue — a G1 child PO at status=bought', () => {
  it("shows up in the requisition organizer's queue", async () => {
    const { poId } = await makeChildPOAtBought()
    const queue = (await resolvers.Query.myPOQueue(null, {}, ctx as never)) as { id: string }[]
    expect(queue.some((item) => item.id === poId)).toBe(true)
  })

  it('does not show up for an unrelated user with no position or organizer link', async () => {
    const { poId } = await makeChildPOAtBought()
    const queue = (await resolvers.Query.myPOQueue(null, {}, bystanderCtx as never)) as { id: string }[]
    expect(queue.some((item) => item.id === poId)).toBe(false)
  })
})
