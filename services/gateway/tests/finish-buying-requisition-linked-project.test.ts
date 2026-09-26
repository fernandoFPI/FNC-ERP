// Regression: finishBuyingRequisition's per-vendor child-PO INSERT set
// project_id but never linked_project_id, even though every other PO-
// creation path (createPurchaseOrder) keeps the two columns in sync to the
// same value — recordDirectDelivery and recordReceipt's cost-posting logic
// read linked_project_id specifically. So every G1 child PO ever forked
// from a project-linked requisition could never have its delivery/receipt
// recorded: recordDirectDelivery rejected it with "Direct-to-jobsite
// delivery requires a project-linked PO marked 'delivered to jobsite'"
// even though the PO plainly was project-linked. Found live: 30 affected
// POs across all 3 companies, all stuck at 'bought'. Found via
// NF-PO-2026-0054.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'

const TEST_COMPANY_ID = '00000000-0000-0000-0000-000000000001'
const TEST_USER_EMAIL = 'finish-buying-linked-project-test@fnc-erp.local'
const VENDOR_PREFIX = 'FBLPTEST-VENDOR-'
const SKU_PREFIX = 'FBLPTEST-'

let userId: string
let vendorId: string
let ctx: { auth: { companyId: string; userId: string; role: string; module: string; sessionId: string } }

async function makeProject(suffix: string): Promise<string> {
  const code = `${SKU_PREFIX}${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const r = await pool.query<{ id: string }>(
    `INSERT INTO projects (company_id, code, name, status, created_by) VALUES ($1,$2,$3,'ongoing',$4) RETURNING id`,
    [TEST_COMPANY_ID, code, code, userId],
  )
  return r.rows[0]!.id
}

async function makeProduct(suffix: string): Promise<string> {
  const sku = `${SKU_PREFIX}${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const r = await pool.query<{ id: string }>(
    `INSERT INTO products (company_id, sku, name, uom, category) VALUES ($1,$2,$3,'unit','general') RETURNING id`,
    [TEST_COMPANY_ID, sku, sku],
  )
  return r.rows[0]!.id
}

async function makeUploadedFile(): Promise<string> {
  const key = `fblp-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const r = await pool.query<{ id: string }>(
    `INSERT INTO files (company_id, uploaded_by, file_key, original_filename, mime_type, size_bytes, category, status)
     VALUES ($1,$2,$3,'receipt.jpg','image/jpeg',1024,'attachment','uploaded') RETURNING id`,
    [TEST_COMPANY_ID, userId, key],
  )
  return r.rows[0]!.id
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
  await pool.query(`DELETE FROM projects WHERE company_id=$1 AND code LIKE $2`, [TEST_COMPANY_ID, `${SKU_PREFIX}%`])
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
  ctx = { auth: { companyId: TEST_COMPANY_ID, userId, role: 'system_admin', module: 'all', sessionId: 'fblp-test' } }

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
  await pool.end()
})

describe('finishBuyingRequisition — linked_project_id on the forked child PO', () => {
  it('sets linked_project_id to the same project as project_id, for a jobsite-delivery requisition', async () => {
    const projectId = await makeProject('fblp')
    const productId = await makeProduct('fblp')

    const created = await resolvers.Mutation.createRequisition(
      null,
      {
        input: {
          purpose: 'project',
          project_id: projectId,
          delivery_destination: 'jobsite',
          lines: [{ product_id: productId, description: 'x', qty: 5, unit_price: 1 }],
        },
      },
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
    const po = await pool.query<{
      status: string
      project_id: string | null
      linked_project_id: string | null
    }>(`SELECT status, project_id, linked_project_id FROM purchase_orders WHERE id=$1`, [poId])
    expect(po.rows[0]!.status).toBe('bought')
    expect(po.rows[0]!.project_id).toBe(projectId)
    expect(po.rows[0]!.linked_project_id).toBe(projectId)

    // Proves the real-world symptom is gone: recordDirectDelivery no longer
    // rejects this child PO for lacking a project link.
    await resolvers.Mutation.recordDirectDelivery(
      null,
      {
        poId,
        input: {
          received_date: new Date().toISOString().slice(0, 10),
          lines: [{ po_line_id: lineId, qty_received: 5 }],
        },
      },
      ctx as never,
    )
    const afterDelivery = await pool.query<{ status: string }>(
      `SELECT status FROM purchase_orders WHERE id=$1`,
      [poId],
    )
    expect(afterDelivery.rows[0]!.status).toBe('goods_received')
  })
})
