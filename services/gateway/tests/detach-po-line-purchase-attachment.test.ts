// Regression test: removing a photo attached to a po_line_purchase used to
// crash with a FK violation whenever it was the one pinned as that
// purchase's receipt_attachment_id — document_attachments.id is referenced
// directly by po_line_purchases.receipt_attachment_id (the one place in the
// schema that points AT an attachment row rather than tagging it by
// entity_type/entity_id), and removeAttachment (packages/db/src/attachments.ts)
// used to delete the row with no awareness of that FK. Same real-Postgres
// pattern as the other G1 test files.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'

const TEST_COMPANY_ID = '00000000-0000-0000-0000-000000000001'
const TEST_USER_EMAIL = 'detach-plp-attachment-test@fnc-erp.local'
const VENDOR_PREFIX = 'DETACHPLPTEST-VENDOR-'
const SKU_PREFIX = 'DETACHPLPTEST-'

let userId: string
let vendorId: string
let ctx: { auth: { companyId: string; userId: string; role: string; module: string; sessionId: string } }

async function makeProduct(suffix: string): Promise<string> {
  const sku = `${SKU_PREFIX}${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const r = await pool.query<{ id: string }>(
    `INSERT INTO products (company_id, sku, name, uom, category) VALUES ($1,$2,$3,'unit','general') RETURNING id`,
    [TEST_COMPANY_ID, sku, sku],
  )
  return r.rows[0]!.id
}

async function makeUploadedFile(): Promise<string> {
  const key = `detach-plp-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const r = await pool.query<{ id: string }>(
    `INSERT INTO files (company_id, uploaded_by, file_key, original_filename, mime_type, size_bytes, category, status)
     VALUES ($1,$2,$3,'receipt.jpg','image/jpeg',1024,'attachment','uploaded') RETURNING id`,
    [TEST_COMPANY_ID, userId, key],
  )
  return r.rows[0]!.id
}

// Drives a fresh requisition (one line, nothing from stock) to items_bought,
// mirroring requisition-items-bought.test.ts's own driver.
async function makeReqAtItemsBought(): Promise<{ reqId: string; lineId: string }> {
  const productId = await makeProduct('line')
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
    { id: reqId, linePrices: [{ lineId, marketPrice: 50, currencyCode: 'IQD' }] },
    ctx as never,
  )
  await resolvers.Mutation.verifyRequisitionPrices(
    null,
    { id: reqId, lineAdjustments: [{ lineId, verifiedPrice: 50 }] },
    ctx as never,
  )
  await resolvers.Mutation.approveRequisition(null, { id: reqId }, ctx as never)
  return { reqId, lineId }
}

async function cleanup(): Promise<void> {
  await pool.query(
    `DELETE FROM document_attachments WHERE entity_type='po_line_purchase' AND entity_id IN (
       SELECT plp.id FROM po_line_purchases plp
       JOIN po_lines pl ON pl.id=plp.po_line_id JOIN requisitions req ON req.id=pl.requisition_id
       WHERE req.company_id=$1 AND req.organizer_id=$2)`,
    [TEST_COMPANY_ID, userId],
  )
  await pool.query(
    `DELETE FROM po_line_purchases WHERE po_line_id IN (
       SELECT pl.id FROM po_lines pl JOIN requisitions req ON req.id=pl.requisition_id
       WHERE req.company_id=$1 AND req.organizer_id=$2)`,
    [TEST_COMPANY_ID, userId],
  )
  await pool.query(
    `DELETE FROM requisition_approved_totals WHERE requisition_id IN (SELECT id FROM requisitions WHERE company_id=$1 AND organizer_id=$2)`,
    [TEST_COMPANY_ID, userId],
  )
  await pool.query(
    `DELETE FROM requisition_approval_log WHERE requisition_id IN (SELECT id FROM requisitions WHERE company_id=$1 AND organizer_id=$2)`,
    [TEST_COMPANY_ID, userId],
  )
  await pool.query(
    `DELETE FROM po_lines WHERE requisition_id IN (SELECT id FROM requisitions WHERE company_id=$1 AND organizer_id=$2)`,
    [TEST_COMPANY_ID, userId],
  )
  await pool.query(`DELETE FROM requisitions WHERE company_id=$1 AND organizer_id=$2`, [TEST_COMPANY_ID, userId])
  await pool.query(`DELETE FROM products WHERE company_id=$1 AND sku LIKE $2`, [TEST_COMPANY_ID, `${SKU_PREFIX}%`])
  await pool.query(`DELETE FROM vendors WHERE company_id=$1 AND name LIKE $2`, [TEST_COMPANY_ID, `${VENDOR_PREFIX}%`])
  await pool.query(`DELETE FROM files WHERE company_id=$1 AND uploaded_by=$2`, [TEST_COMPANY_ID, userId])
}

beforeAll(async () => {
  const userR = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [TEST_USER_EMAIL],
  )
  userId = userR.rows[0]!.id
  ctx = { auth: { companyId: TEST_COMPANY_ID, userId, role: 'system_admin', module: 'all', sessionId: 'detach-plp-test' } }

  await cleanup()

  const v = await pool.query<{ id: string }>(
    `INSERT INTO vendors (company_id, name) VALUES ($1,$2) RETURNING id`,
    [TEST_COMPANY_ID, `${VENDOR_PREFIX}A-${Date.now()}`],
  )
  vendorId = v.rows[0]!.id
})

afterAll(async () => {
  await cleanup()
  await pool.query(`DELETE FROM users WHERE email=$1`, [TEST_USER_EMAIL])
  await pool.end()
})

describe('detachFile on a po_line_purchase receipt', () => {
  it('removes the pinned primary receipt without a FK violation, promoting the remaining photo', async () => {
    const { lineId } = await makeReqAtItemsBought()
    const fileA = await makeUploadedFile()
    const fileB = await makeUploadedFile()

    const purchase = await resolvers.Mutation.recordLinePurchase(
      null,
      { input: { lineId, vendorId, qty: 5, actualUnitPrice: 50, currencyCode: 'IQD', receiptFileId: fileA } },
      ctx as never,
    )
    const purchaseId = (purchase as { id: string }).id

    const beforeRow = await pool.query<{ receipt_attachment_id: string }>(
      `SELECT receipt_attachment_id FROM po_line_purchases WHERE id=$1`,
      [purchaseId],
    )
    const pinnedAttachmentId = beforeRow.rows[0]!.receipt_attachment_id
    expect(pinnedAttachmentId).toBeTruthy()

    // A second photo attached afterward — not pinned as the primary.
    await resolvers.Mutation.attachFile(
      null,
      { fileId: fileB, entityType: 'po_line_purchase', entityId: purchaseId },
      ctx as never,
    )

    // Removing the PINNED one used to throw:
    // "update or delete on table document_attachments violates foreign key
    // constraint po_line_purchases_receipt_attachment_id_fkey"
    const removed = await resolvers.Mutation.detachFile(
      null,
      { attachmentId: pinnedAttachmentId, entityType: 'po_line_purchase', entityId: purchaseId },
      ctx as never,
    )
    expect(removed).toBe(true)

    const afterFirstRemoval = await pool.query<{ receipt_attachment_id: string | null }>(
      `SELECT receipt_attachment_id FROM po_line_purchases WHERE id=$1`,
      [purchaseId],
    )
    // Promoted to the one remaining attachment, not left dangling/null while
    // a photo still exists.
    expect(afterFirstRemoval.rows[0]!.receipt_attachment_id).not.toBeNull()
    expect(afterFirstRemoval.rows[0]!.receipt_attachment_id).not.toBe(pinnedAttachmentId)

    const newPinnedId = afterFirstRemoval.rows[0]!.receipt_attachment_id as string
    const removedSecond = await resolvers.Mutation.detachFile(
      null,
      { attachmentId: newPinnedId, entityType: 'po_line_purchase', entityId: purchaseId },
      ctx as never,
    )
    expect(removedSecond).toBe(true)

    const afterSecondRemoval = await pool.query<{ receipt_attachment_id: string | null }>(
      `SELECT receipt_attachment_id FROM po_line_purchases WHERE id=$1`,
      [purchaseId],
    )
    // No photos left — correctly null, not pointing at a deleted row.
    expect(afterSecondRemoval.rows[0]!.receipt_attachment_id).toBeNull()

    // The purchase itself survives both removals — only the attachment rows
    // (and their pin) were ever meant to go.
    const purchaseStillExists = await pool.query(`SELECT id FROM po_line_purchases WHERE id=$1`, [purchaseId])
    expect(purchaseStillExists.rows.length).toBe(1)
  })
})
