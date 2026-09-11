// Integration tests for G1 Phase 3 Milestone A: the additive child-vocabulary
// workflow transitions (packages/workflow) and the dual-vocabulary resolver
// widening in services/gateway/src/graphql/resolvers.ts — confirmReceipt,
// recordReceipt, sendPOToAudit, passPOAudit, failPOAudit, setPOLineAuditStatus,
// setPOFunding, setPOLineAccounting and completePO all branching on
// requisition_id to pick 'finance_review'/'payment_pending'/'closed' instead
// of 'finance_audit'/'invoiced'/'completed' for a G1 child — plus the new
// requisitions/myRequisitionApprovalQueue queries and the requisitionId-
// widened edit-request mutations. Same real-Postgres pattern as the earlier
// G1 test files.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'

const TEST_COMPANY_ID = '00000000-0000-0000-0000-000000000001'
const TEST_USER_EMAIL = 'g1-dualvocab-test@fnc-erp.local'
const VENDOR_PREFIX = 'G1DVTEST-VENDOR-'
const SKU_PREFIX = 'G1DVTEST-'

let userId: string
let warehouseId: string
let ctx: { auth: { companyId: string; userId: string; role: string; module: string; sessionId: string } }
let vendorAId: string

async function makeProduct(suffix: string): Promise<string> {
  const sku = `${SKU_PREFIX}${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const r = await pool.query<{ id: string }>(
    `INSERT INTO products (company_id, sku, name, uom, category) VALUES ($1,$2,$3,'unit','general') RETURNING id`,
    [TEST_COMPANY_ID, sku, sku],
  )
  return r.rows[0]!.id
}

async function makeUploadedFile(category: string): Promise<string> {
  const key = `g1dv-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
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

// A single-line requisition, nothing from stock, driven through Finish Buying
// to 'sourcing' with exactly one forked child PO — the child lands at
// 'bought' (see requisition-finish-buying.test.ts:326), the entry point for
// every dual-vocabulary resolver under test here.
async function makeReqWithOneChildAtBought(
  qty: number,
  price: number,
): Promise<{ reqId: string; childId: string; childLineId: string }> {
  const productId = await makeProduct('withchild')
  const created = await resolvers.Mutation.createRequisition(
    null,
    { input: { purpose: 'stock', lines: [{ product_id: productId, description: 'x', qty, unit_price: 1 }] } },
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
  await resolvers.Mutation.submitRequisitionStorePricing(null, { id: reqId }, ctx as never)
  await resolvers.Mutation.submitRequisitionMarketPricing(
    null,
    { id: reqId, linePrices: [{ lineId, marketPrice: price, currencyCode: 'IQD' }] },
    ctx as never,
  )
  await resolvers.Mutation.verifyRequisitionPrices(
    null,
    { id: reqId, lineAdjustments: [{ lineId, verifiedPrice: price }] },
    ctx as never,
  )
  await resolvers.Mutation.approveRequisition(null, { id: reqId }, ctx as never)
  const receiptFileId = await makeUploadedFile('attachment')
  await resolvers.Mutation.recordLinePurchase(
    null,
    { input: { lineId, vendorId: vendorAId, qty, actualUnitPrice: price, currencyCode: 'IQD', receiptFileId } },
    ctx as never,
  )
  const result = await resolvers.Mutation.finishBuyingRequisition(null, { id: reqId }, ctx as never)
  expect((result as { status: string }).status).toBe('sourcing')
  const child = await pool.query<{ id: string; status: string }>(
    `SELECT id, status FROM purchase_orders WHERE requisition_id=$1`,
    [reqId],
  )
  expect(child.rows[0]!.status).toBe('bought')
  const childLine = await pool.query<{ id: string }>(`SELECT id FROM po_lines WHERE po_id=$1`, [child.rows[0]!.id])
  return { reqId, childId: child.rows[0]!.id, childLineId: childLine.rows[0]!.id }
}

// Drives a requisition (no child needed) up to a POST_APPROVAL_REQUISITION_STATUSES
// status ('sourcing') via the pure-stock path, for edit-request tests that
// only care about the requisition side, not a child PO.
async function makeReqAtSourcing(qty: number): Promise<{ reqId: string; lineId: string }> {
  const productId = await makeProduct('stockonly')
  const viR = await pool.query<{ id: string }>(
    `SELECT id FROM stock_locations WHERE company_id=$1 AND type='virtual_in' AND is_active=true LIMIT 1`,
    [TEST_COMPANY_ID],
  )
  await pool.query(
    `INSERT INTO stock_moves (company_id, product_id, from_location_id, to_location_id, moved_at, qty, unit_cost, total_cost, source_type, moved_by)
     VALUES ($1,$2,$3,$4,NOW(),$5,10,$6,'po_receipt',$7)`,
    [TEST_COMPANY_ID, productId, viR.rows[0]!.id, warehouseId, qty, qty * 10, userId],
  )
  const created = await resolvers.Mutation.createRequisition(
    null,
    { input: { purpose: 'stock', lines: [{ product_id: productId, description: 'x', qty, unit_price: 1 }] } },
    ctx as never,
  )
  const reqId = (created as { id: string }).id
  const lineRow = await pool.query<{ id: string }>(`SELECT id FROM po_lines WHERE requisition_id=$1`, [reqId])
  const lineId = lineRow.rows[0]!.id
  await resolvers.Mutation.submitRequisitionToInventoryCheck(null, { id: reqId }, ctx as never)
  await resolvers.Mutation.confirmRequisitionInventoryCheck(
    null,
    { id: reqId, lineStockQtys: [{ lineId, qtyFromStock: qty, sourceLocationId: warehouseId }] },
    ctx as never,
  )
  await resolvers.Mutation.submitRequisitionStorePricing(null, { id: reqId }, ctx as never)
  await resolvers.Mutation.submitRequisitionMarketPricing(null, { id: reqId }, ctx as never)
  await resolvers.Mutation.verifyRequisitionPrices(null, { id: reqId }, ctx as never)
  const result = await resolvers.Mutation.approveRequisition(null, { id: reqId }, ctx as never)
  expect((result as { status: string }).status).toBe('sourcing')
  return { reqId, lineId }
}

async function cleanup(): Promise<void> {
  // po_line_purchases.receipt_attachment_id references document_attachments —
  // must go first, or deleting the attachment below violates that FK.
  await pool.query(
    `DELETE FROM po_line_purchases WHERE po_line_id IN (
       SELECT pl.id FROM po_lines pl JOIN requisitions req ON req.id=pl.requisition_id
       WHERE req.company_id=$1 AND req.organizer_id=$2)`,
    [TEST_COMPANY_ID, userId],
  )
  await pool.query(
    `DELETE FROM document_attachments WHERE file_id IN (
       SELECT id FROM files WHERE company_id=$1 AND uploaded_by=$2)`,
    [TEST_COMPANY_ID, userId],
  )
  await pool.query(`DELETE FROM files WHERE company_id=$1 AND uploaded_by=$2`, [TEST_COMPANY_ID, userId])
  await pool.query(
    `DELETE FROM po_edit_requests WHERE requisition_id IN (SELECT id FROM requisitions WHERE company_id=$1 AND organizer_id=$2)`,
    [TEST_COMPANY_ID, userId],
  )
  await pool.query(
    `DELETE FROM po_edit_requests WHERE po_id IN (
       SELECT id FROM purchase_orders WHERE company_id=$1 AND requisition_id IN (SELECT id FROM requisitions WHERE company_id=$1 AND organizer_id=$2))`,
    [TEST_COMPANY_ID, userId],
  )
  await pool.query(
    `DELETE FROM requisition_approval_log WHERE requisition_id IN (SELECT id FROM requisitions WHERE company_id=$1 AND organizer_id=$2)`,
    [TEST_COMPANY_ID, userId],
  )
  await pool.query(
    `DELETE FROM po_approval_log WHERE po_id IN (SELECT id FROM purchase_orders WHERE company_id=$1 AND requisition_id IN (SELECT id FROM requisitions WHERE company_id=$1 AND organizer_id=$2))`,
    [TEST_COMPANY_ID, userId],
  )
  await pool.query(
    `DELETE FROM stock_moves WHERE company_id=$1 AND product_id IN (SELECT id FROM products WHERE company_id=$1 AND sku LIKE $2)`,
    [TEST_COMPANY_ID, `${SKU_PREFIX}%`],
  )
  // po_receipt_lines.po_line_id has no ON DELETE CASCADE from po_lines —
  // must remove receipts (which cascades to their lines) before po_lines.
  await pool.query(
    `DELETE FROM po_receipts WHERE po_id IN (SELECT id FROM purchase_orders WHERE company_id=$1 AND requisition_id IN (SELECT id FROM requisitions WHERE company_id=$1 AND organizer_id=$2))`,
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
  // The stock-only sourcing path (makeReqAtSourcing) auto-creates a Store
  // Out (project_material_issues) via the completion evaluator — must go
  // before requisitions, or its FK blocks the delete.
  await pool.query(
    `DELETE FROM project_cost_actuals WHERE source_type='stock_issue' AND source_id IN (
       SELECT id FROM project_material_issues WHERE company_id=$1 AND created_by=$2)`,
    [TEST_COMPANY_ID, userId],
  )
  await pool.query(
    `DELETE FROM project_material_issue_lines WHERE issue_id IN (SELECT id FROM project_material_issues WHERE company_id=$1 AND created_by=$2)`,
    [TEST_COMPANY_ID, userId],
  )
  await pool.query(`DELETE FROM project_material_issues WHERE company_id=$1 AND created_by=$2`, [TEST_COMPANY_ID, userId])
  await pool.query(`DELETE FROM requisitions WHERE company_id=$1 AND organizer_id=$2`, [TEST_COMPANY_ID, userId])
  await pool.query(
    `DELETE FROM stock_balances WHERE product_id IN (SELECT id FROM products WHERE company_id=$1 AND sku LIKE $2)`,
    [TEST_COMPANY_ID, `${SKU_PREFIX}%`],
  )
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
  ctx = { auth: { companyId: TEST_COMPANY_ID, userId, role: 'system_admin', module: 'all', sessionId: 'g1-dv-test' } }

  const whR = await pool.query<{ id: string }>(
    `SELECT id FROM stock_locations WHERE company_id=$1 AND type='warehouse' AND is_active=true LIMIT 1`,
    [TEST_COMPANY_ID],
  )
  if (!whR.rows[0]) throw new Error('No warehouse location seeded for test company — run seeds first')
  warehouseId = whR.rows[0].id

  await cleanup()

  const vA = await pool.query<{ id: string }>(`INSERT INTO vendors (company_id, name) VALUES ($1,$2) RETURNING id`, [
    TEST_COMPANY_ID,
    `${VENDOR_PREFIX}A-${Date.now()}`,
  ])
  vendorAId = vA.rows[0]!.id
})

afterAll(async () => {
  await cleanup()
  await pool.query(`DELETE FROM users WHERE email=$1`, [TEST_USER_EMAIL])
  await pool.end()
})

describe('G1 child dual-vocabulary lifecycle', () => {
  it('drives a child PO from bought through closed via the widened receipt/finance/payment resolvers, completing the requisition', async () => {
    const { reqId, childId, childLineId } = await makeReqWithOneChildAtBought(4, 25)

    const receipt = await resolvers.Mutation.recordReceipt(
      null,
      {
        poId: childId,
        input: {
          receipt_date: new Date().toISOString().slice(0, 10),
          location_id: warehouseId,
          lines: [{ po_line_id: childLineId, qty_received: 4, actual_unit_price: 25 }],
        },
      },
      ctx as never,
    )
    const receiptId = (receipt as { id: string }).id

    await attachFile('po_receipt', receiptId, 'po_receipt_photo')
    await attachFile('purchase_order', childId, 'po_receipt_document')

    await resolvers.Mutation.confirmReceipt(null, { id: receiptId }, ctx as never)

    const afterConfirm = await pool.query<{ status: string }>(`SELECT status FROM purchase_orders WHERE id=$1`, [childId])
    expect(afterConfirm.rows[0]!.status).toBe('goods_received')

    await resolvers.Mutation.sendPOToAudit(null, { id: childId }, ctx as never)
    const afterAudit = await pool.query<{ status: string }>(`SELECT status FROM purchase_orders WHERE id=$1`, [childId])
    expect(afterAudit.rows[0]!.status).toBe('finance_review')

    // Exercises the dual-vocab widening in setPOLineAuditStatus — would
    // throw "PO must be in finance_audit status" pre-fix for a child
    // sitting at finance_review.
    const auditedLine = await resolvers.Mutation.setPOLineAuditStatus(
      null,
      { poId: childId, lineId: childLineId, auditStatus: 'ok' },
      ctx as never,
    )
    expect((auditedLine as { audit_status: string }).audit_status).toBe('ok')

    await resolvers.Mutation.passPOAudit(null, { id: childId }, ctx as never)
    const afterPass = await pool.query<{ status: string }>(`SELECT status FROM purchase_orders WHERE id=$1`, [childId])
    expect(afterPass.rows[0]!.status).toBe('payment_pending')

    await resolvers.Mutation.setPOFunding(null, { id: childId, fundingSource: 'vendor_ap' }, ctx as never)
    const afterFunding = await pool.query<{ funding_decided: boolean }>(
      `SELECT funding_decided FROM purchase_orders WHERE id=$1`,
      [childId],
    )
    expect(afterFunding.rows[0]!.funding_decided).toBe(true)

    await resolvers.Mutation.completePO(null, { id: childId }, ctx as never)
    const afterComplete = await pool.query<{ status: string }>(`SELECT status FROM purchase_orders WHERE id=$1`, [childId])
    expect(afterComplete.rows[0]!.status).toBe('closed')

    const reqAfter = await pool.query<{ status: string }>(`SELECT status FROM requisitions WHERE id=$1`, [reqId])
    expect(reqAfter.rows[0]!.status).toBe('completed')
  })

  it('failPOAudit sends a finance_review child back to goods_received', async () => {
    const { childId, childLineId } = await makeReqWithOneChildAtBought(2, 15)
    const receipt = await resolvers.Mutation.recordReceipt(
      null,
      {
        poId: childId,
        input: {
          receipt_date: new Date().toISOString().slice(0, 10),
          location_id: warehouseId,
          lines: [{ po_line_id: childLineId, qty_received: 2, actual_unit_price: 15 }],
        },
      },
      ctx as never,
    )
    const receiptId = (receipt as { id: string }).id
    await attachFile('po_receipt', receiptId, 'po_receipt_photo')
    await attachFile('purchase_order', childId, 'po_receipt_document')
    await resolvers.Mutation.confirmReceipt(null, { id: receiptId }, ctx as never)
    await resolvers.Mutation.sendPOToAudit(null, { id: childId }, ctx as never)

    await resolvers.Mutation.failPOAudit(null, { id: childId, notes: 'price mismatch' }, ctx as never)
    const after = await pool.query<{ status: string }>(`SELECT status FROM purchase_orders WHERE id=$1`, [childId])
    expect(after.rows[0]!.status).toBe('goods_received')
  })

  it('rejects setPOLineAuditStatus on a child not yet at finance_review', async () => {
    const { childId, childLineId } = await makeReqWithOneChildAtBought(1, 9)
    await expect(
      resolvers.Mutation.setPOLineAuditStatus(
        null,
        { poId: childId, lineId: childLineId, auditStatus: 'ok' },
        ctx as never,
      ),
    ).rejects.toThrow(/must be in finance_audit or finance_review status/i)
  })

  // Regression test for the invariant poHasNewVocabBuyRecordsGW depends on:
  // requisition_id alone is NOT a safe proxy for "use the new vocab", so a
  // PO with requisition_id set but zero po_line_purchases entries must stay
  // on the old vocab through the ambiguous goods_received fork point.
  //
  // This is NOT the shape of the real 24 Phase 1 children on prod —
  // verified against migrations/258_g1_requisition_split_phase1.sql §4-5,
  // that migration remapped their status to the new vocab AND backfilled
  // them synthetic po_line_purchases in the same transaction, so on prod
  // today status and buy-records already agree for all 24. What this
  // guards is a PO some FUTURE backfill (e.g. Milestone B's window
  // backfill) gives requisition_id to without also giving it synthetic
  // po_line_purchases the way 258 did — simulated here by stripping a
  // real child's po_line_purchases after the fact.
  it('keeps a requisition_id-stamped PO with no purchase records on the old vocab all the way through completion', async () => {
    const { reqId, childId, childLineId } = await makeReqWithOneChildAtBought(2, 20)
    await pool.query(`DELETE FROM po_line_purchases WHERE po_line_id IN (SELECT id FROM po_lines WHERE po_id=$1)`, [childId])
    // Force straight to goods_received the way a PO backfilled with
    // requisition_id but no synthetic po_line_purchases would already be
    // sitting there — markPOLineBought/finishBuyingPO (the real
    // items_bought->goods_received path) never apply to a PO with
    // requisition_id set, so there's no resolver call that gets it there
    // other than this fast-forward.
    await pool.query(`UPDATE purchase_orders SET status='goods_received' WHERE id=$1`, [childId])

    const receipt = await resolvers.Mutation.recordReceipt(
      null,
      {
        poId: childId,
        input: {
          receipt_date: new Date().toISOString().slice(0, 10),
          location_id: warehouseId,
          lines: [{ po_line_id: childLineId, qty_received: 2, actual_unit_price: 20 }],
        },
      },
      ctx as never,
    )
    const receiptId = (receipt as { id: string }).id
    await pool.query(`UPDATE po_receipts SET status='confirmed', confirmed_at=NOW() WHERE id=$1`, [receiptId])

    await resolvers.Mutation.sendPOToAudit(null, { id: childId }, ctx as never)
    const afterAudit = await pool.query<{ status: string }>(`SELECT status FROM purchase_orders WHERE id=$1`, [childId])
    expect(afterAudit.rows[0]!.status).toBe('finance_audit')

    await resolvers.Mutation.passPOAudit(null, { id: childId }, ctx as never)
    const afterPass = await pool.query<{ status: string }>(`SELECT status FROM purchase_orders WHERE id=$1`, [childId])
    expect(afterPass.rows[0]!.status).toBe('invoiced')

    await resolvers.Mutation.setPOFunding(null, { id: childId, fundingSource: 'vendor_ap' }, ctx as never)
    await resolvers.Mutation.completePO(null, { id: childId }, ctx as never)
    const afterComplete = await pool.query<{ status: string }>(`SELECT status FROM purchase_orders WHERE id=$1`, [childId])
    expect(afterComplete.rows[0]!.status).toBe('completed')

    // requisition_id was still set throughout — evaluateRequisitionCompletion
    // runs as part of completePO's bridge either way and must not throw;
    // this requisition isn't at 'sourcing' (skipped straight to a forced
    // goods_received above) so it's a no-op, not an assertion on status.
    await expect(
      pool.query(`SELECT status FROM requisitions WHERE id=$1`, [reqId]),
    ).resolves.toBeTruthy()
  })

  it('drives a requisition_id-stamped PO already at finance_audit through invoiced to completed on the old path (no receipt/audit re-drive needed)', async () => {
    const { childId } = await makeReqWithOneChildAtBought(3, 30)
    await pool.query(`DELETE FROM po_line_purchases WHERE po_line_id IN (SELECT id FROM po_lines WHERE po_id=$1)`, [childId])
    await pool.query(`UPDATE purchase_orders SET status='finance_audit' WHERE id=$1`, [childId])

    await resolvers.Mutation.passPOAudit(null, { id: childId }, ctx as never)
    const afterPass = await pool.query<{ status: string }>(`SELECT status FROM purchase_orders WHERE id=$1`, [childId])
    expect(afterPass.rows[0]!.status).toBe('invoiced')

    await resolvers.Mutation.setPOFunding(null, { id: childId, fundingSource: 'vendor_ap' }, ctx as never)
    await resolvers.Mutation.completePO(null, { id: childId }, ctx as never)
    const afterComplete = await pool.query<{ status: string }>(`SELECT status FROM purchase_orders WHERE id=$1`, [childId])
    expect(afterComplete.rows[0]!.status).toBe('completed')
  })
})

describe('requisitions query', () => {
  it('lists a created requisition, honoring the status filter', async () => {
    const { reqId } = await makeReqAtSourcing(3)
    const all = await resolvers.Query.requisitions(null, {}, ctx as never)
    expect((all as { id: string }[]).some((r) => r.id === reqId)).toBe(true)

    const filtered = await resolvers.Query.requisitions(null, { status: 'sourcing' }, ctx as never)
    expect((filtered as { id: string; status: string }[]).some((r) => r.id === reqId)).toBe(true)
    expect((filtered as { status: string }[]).every((r) => r.status === 'sourcing')).toBe(true)

    const wrongStatus = await resolvers.Query.requisitions(null, { status: 'draft' }, ctx as never)
    expect((wrongStatus as { id: string }[]).some((r) => r.id === reqId)).toBe(false)
  })
})

describe('myRequisitionApprovalQueue query', () => {
  it('surfaces a requisition awaiting action via the system_admin catch-all', async () => {
    const productId = await makeProduct('queue')
    const created = await resolvers.Mutation.createRequisition(
      null,
      { input: { purpose: 'stock', lines: [{ product_id: productId, description: 'x', qty: 1, unit_price: 1 }] } },
      ctx as never,
    )
    const reqId = (created as { id: string }).id
    await resolvers.Mutation.submitRequisitionToInventoryCheck(null, { id: reqId }, ctx as never)

    const queue = await resolvers.Query.myRequisitionApprovalQueue(null, {}, ctx as never)
    expect((queue as { id: string; status: string }[]).some((r) => r.id === reqId && r.status === 'inventory_check')).toBe(true)
  })
})

describe('edit-request mutations widened for requisitionId', () => {
  it('auto-applies a pre-approval edit request against a requisition', async () => {
    const productId = await makeProduct('editpre')
    const created = await resolvers.Mutation.createRequisition(
      null,
      { input: { purpose: 'stock', lines: [{ product_id: productId, description: 'x', qty: 2, unit_price: 5 }] } },
      ctx as never,
    )
    const reqId = (created as { id: string }).id

    const result = await resolvers.Mutation.submitPOEditRequest(
      null,
      { requisitionId: reqId, changes: JSON.stringify({ header: { notes: { from: null, to: 'edited pre-approval' } } }), notes: 'fixing notes' },
      ctx as never,
    )
    expect((result as { status: string }).status).toBe('approved')

    const req = await pool.query<{ notes: string }>(`SELECT notes FROM requisitions WHERE id=$1`, [reqId])
    expect(req.rows[0]!.notes).toBe('edited pre-approval')
  })

  it('requires review for a post-approval edit request, applying only on approve', async () => {
    const { reqId } = await makeReqAtSourcing(2)

    const submitted = await resolvers.Mutation.submitPOEditRequest(
      null,
      { requisitionId: reqId, changes: JSON.stringify({ header: { priority: { from: 'normal', to: 'high' } } }) },
      ctx as never,
    )
    const submittedRow = submitted as { id: string; status: string }
    expect(submittedRow.status).toBe('pending')

    const beforeApproval = await pool.query<{ priority: string }>(`SELECT priority FROM requisitions WHERE id=$1`, [reqId])
    expect(beforeApproval.rows[0]!.priority).not.toBe('high')

    await resolvers.Mutation.approvePOEditRequest(
      null,
      { requisitionId: reqId, requestId: submittedRow.id, reviewNotes: 'looks fine' },
      ctx as never,
    )
    const afterApproval = await pool.query<{ priority: string }>(`SELECT priority FROM requisitions WHERE id=$1`, [reqId])
    expect(afterApproval.rows[0]!.priority).toBe('high')
  })

  it('rejects a post-approval edit request without applying it', async () => {
    const { reqId } = await makeReqAtSourcing(2)
    const submitted = await resolvers.Mutation.submitPOEditRequest(
      null,
      { requisitionId: reqId, changes: JSON.stringify({ header: { priority: { from: 'normal', to: 'emergency' } } }) },
      ctx as never,
    )
    const submittedRow = submitted as { id: string }

    const rejected = await resolvers.Mutation.rejectPOEditRequest(
      null,
      { requisitionId: reqId, requestId: submittedRow.id, reviewNotes: 'not warranted' },
      ctx as never,
    )
    expect((rejected as { status: string }).status).toBe('rejected')

    const req = await pool.query<{ priority: string }>(`SELECT priority FROM requisitions WHERE id=$1`, [reqId])
    expect(req.rows[0]!.priority).not.toBe('emergency')
  })

  it('notifyPOOwnerForEditRequest accepts a requisitionId and returns true', async () => {
    const productId = await makeProduct('notify')
    const created = await resolvers.Mutation.createRequisition(
      null,
      { input: { purpose: 'stock', lines: [{ product_id: productId, description: 'x', qty: 2, unit_price: 5 }] } },
      ctx as never,
    )
    const reqId = (created as { id: string }).id
    const lineRow = await pool.query<{ id: string }>(`SELECT id FROM po_lines WHERE requisition_id=$1`, [reqId])
    const lineId = lineRow.rows[0]!.id
    await resolvers.Mutation.submitRequisitionToInventoryCheck(null, { id: reqId }, ctx as never)
    await resolvers.Mutation.confirmRequisitionInventoryCheck(null, { id: reqId, lineStockQtys: [{ lineId, qtyFromStock: 0 }] }, ctx as never)
    await resolvers.Mutation.submitRequisitionStorePricing(null, { id: reqId }, ctx as never)
    const marketResult = await resolvers.Mutation.submitRequisitionMarketPricing(
      null,
      { id: reqId, linePrices: [{ lineId, marketPrice: 8, currencyCode: 'IQD' }] },
      ctx as never,
    )
    expect((marketResult as { status: string }).status).toBe('price_verification')

    const notifyResult = await resolvers.Mutation.notifyPOOwnerForEditRequest(
      null,
      { requisitionId: reqId, reason: 'price looks off' },
      ctx as never,
    )
    expect(notifyResult).toBe(true)
  })
})
