// Integration tests for G1 Phase 2 PR 5: the completion evaluator (run in
// the triggering transaction on Store Out confirm, child close, child
// cancel, and line close) and the cancel guard (cancelRequisition blocked
// at/past goods_received, otherwise cascading to cancellable children and
// releasing reservations). Same real-Postgres pattern as the earlier G1
// test files.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'

const TEST_COMPANY_ID = '00000000-0000-0000-0000-000000000001'
const TEST_USER_EMAIL = 'g1-completion-test@fnc-erp.local'
const VENDOR_PREFIX = 'G1CTEST-VENDOR-'
const SKU_PREFIX = 'G1CTEST-'

let userId: string
let warehouseId: string
let ctx: { auth: { companyId: string; userId: string; role: string; module: string; sessionId: string } }
let vendorAId: string
let vendorBId: string

async function makeProduct(suffix: string): Promise<string> {
  const sku = `${SKU_PREFIX}${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const r = await pool.query<{ id: string }>(
    `INSERT INTO products (company_id, sku, name, uom, category) VALUES ($1,$2,$3,'unit','general') RETURNING id`,
    [TEST_COMPANY_ID, sku, sku],
  )
  return r.rows[0]!.id
}

async function receive(productId: string, locationId: string, qty: number, unitCost = 10): Promise<void> {
  const viR = await pool.query<{ id: string }>(
    `SELECT id FROM stock_locations WHERE company_id=$1 AND type='virtual_in' AND is_active=true LIMIT 1`,
    [TEST_COMPANY_ID],
  )
  await pool.query(
    `INSERT INTO stock_moves (company_id, product_id, from_location_id, to_location_id, moved_at, qty, unit_cost, total_cost, source_type, moved_by)
     VALUES ($1,$2,$3,$4,NOW(),$5,$6,$7,'po_receipt',$8)`,
    [TEST_COMPANY_ID, productId, viR.rows[0]!.id, locationId, qty, unitCost, qty * unitCost, userId],
  )
}

async function makeUploadedFile(): Promise<string> {
  const key = `g1c-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const r = await pool.query<{ id: string }>(
    `INSERT INTO files (company_id, uploaded_by, file_key, original_filename, mime_type, size_bytes, category, status)
     VALUES ($1,$2,$3,'receipt.jpg','image/jpeg',1024,'attachment','uploaded') RETURNING id`,
    [TEST_COMPANY_ID, userId, key],
  )
  return r.rows[0]!.id
}

// A single-line requisition, fully covered from stock, driven to
// 'sourcing' via the zero-bought-lines (skip_buying) path — no child PO
// involved at all.
async function makeStockOnlyReqAtSourcing(qty: number): Promise<{ reqId: string; lineId: string; productId: string }> {
  const productId = await makeProduct('stockonly')
  await receive(productId, warehouseId, qty)
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
  return { reqId, lineId, productId }
}

// A single-line requisition, nothing from stock, driven all the way
// through Finish Buying to 'sourcing' with exactly one forked child PO.
async function makeReqWithOneChildAtSourcing(
  qty: number,
  price: number,
): Promise<{ reqId: string; lineId: string; childId: string }> {
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
  const receiptFileId = await makeUploadedFile()
  await resolvers.Mutation.recordLinePurchase(
    null,
    { input: { lineId, vendorId: vendorAId, qty, actualUnitPrice: price, currencyCode: 'IQD', receiptFileId } },
    ctx as never,
  )
  const result = await resolvers.Mutation.finishBuyingRequisition(null, { id: reqId }, ctx as never)
  expect((result as { status: string }).status).toBe('sourcing')
  const child = await pool.query<{ id: string }>(`SELECT id FROM purchase_orders WHERE requisition_id=$1`, [reqId])
  return { reqId, lineId, childId: child.rows[0]!.id }
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
    `DELETE FROM project_cost_actuals WHERE source_type='stock_issue' AND source_id IN (
       SELECT id FROM project_material_issues WHERE company_id=$1 AND created_by=$2)`,
    [TEST_COMPANY_ID, userId],
  )
  await pool.query(
    `DELETE FROM project_material_issue_lines WHERE issue_id IN (SELECT id FROM project_material_issues WHERE company_id=$1 AND created_by=$2)`,
    [TEST_COMPANY_ID, userId],
  )
  await pool.query(`DELETE FROM project_material_issues WHERE company_id=$1 AND created_by=$2`, [TEST_COMPANY_ID, userId])
  await pool.query(
    `DELETE FROM po_approval_log WHERE po_id IN (SELECT id FROM purchase_orders WHERE company_id=$1 AND requisition_id IN (SELECT id FROM requisitions WHERE company_id=$1 AND organizer_id=$2))`,
    [TEST_COMPANY_ID, userId],
  )
  // issueMaterialIssue (Store Out confirm) stamps stock_moves.po_line_id —
  // must go before any po_lines delete, or the FK blocks it.
  await pool.query(
    `DELETE FROM stock_moves WHERE company_id=$1 AND product_id IN (SELECT id FROM products WHERE company_id=$1 AND sku LIKE $2)`,
    [TEST_COMPANY_ID, `${SKU_PREFIX}%`],
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
  ctx = { auth: { companyId: TEST_COMPANY_ID, userId, role: 'system_admin', module: 'all', sessionId: 'g1-c-test' } }

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
  const vB = await pool.query<{ id: string }>(`INSERT INTO vendors (company_id, name) VALUES ($1,$2) RETURNING id`, [
    TEST_COMPANY_ID,
    `${VENDOR_PREFIX}B-${Date.now()}`,
  ])
  vendorBId = vB.rows[0]!.id
})

afterAll(async () => {
  await cleanup()
  await pool.query(`DELETE FROM users WHERE email=$1`, [TEST_USER_EMAIL])
  await pool.end()
})

describe('completion evaluator — Store Out confirm', () => {
  it('completes a fully stock-covered requisition once its Store Out is confirmed', async () => {
    const { reqId } = await makeStockOnlyReqAtSourcing(5)
    const issue = await pool.query<{ id: string }>(`SELECT id FROM project_material_issues WHERE requisition_id=$1`, [reqId])
    expect(issue.rows).toHaveLength(1)

    const before = await pool.query<{ status: string }>(`SELECT status FROM requisitions WHERE id=$1`, [reqId])
    expect(before.rows[0]!.status).toBe('sourcing')

    await resolvers.Mutation.issueMaterialIssue(null, { id: issue.rows[0]!.id }, ctx as never)

    const after = await pool.query<{ status: string }>(`SELECT status FROM requisitions WHERE id=$1`, [reqId])
    expect(after.rows[0]!.status).toBe('completed')
  })

  it('releases the stock reservation on confirm (the pre-existing po_id-only bug this PR fixed)', async () => {
    const productId = await makeProduct('reserve')
    await receive(productId, warehouseId, 6)
    const created = await resolvers.Mutation.createRequisition(
      null,
      { input: { purpose: 'stock', lines: [{ product_id: productId, description: 'x', qty: 6, unit_price: 1 }] } },
      ctx as never,
    )
    const reqId = (created as { id: string }).id
    const lineRow = await pool.query<{ id: string }>(`SELECT id FROM po_lines WHERE requisition_id=$1`, [reqId])
    const lineId = lineRow.rows[0]!.id
    await resolvers.Mutation.submitRequisitionToInventoryCheck(null, { id: reqId }, ctx as never)
    await resolvers.Mutation.confirmRequisitionInventoryCheck(
      null,
      { id: reqId, lineStockQtys: [{ lineId, qtyFromStock: 6, sourceLocationId: warehouseId }] },
      ctx as never,
    )
    await resolvers.Mutation.submitRequisitionStorePricing(null, { id: reqId }, ctx as never)
    await resolvers.Mutation.submitRequisitionMarketPricing(null, { id: reqId }, ctx as never)
    await resolvers.Mutation.verifyRequisitionPrices(null, { id: reqId }, ctx as never)
    await resolvers.Mutation.approveRequisition(null, { id: reqId }, ctx as never)

    const balBefore = await pool.query<{ qty_reserved: string }>(
      `SELECT qty_reserved FROM stock_balances WHERE product_id=$1 AND location_id=$2 AND lot_id IS NULL`,
      [productId, warehouseId],
    )
    expect(parseFloat(balBefore.rows[0]!.qty_reserved)).toBe(6)

    const issue = await pool.query<{ id: string }>(`SELECT id FROM project_material_issues WHERE requisition_id=$1`, [reqId])
    await resolvers.Mutation.issueMaterialIssue(null, { id: issue.rows[0]!.id }, ctx as never)

    const balAfter = await pool.query<{ qty_reserved: string; qty_on_hand: string }>(
      `SELECT qty_reserved, qty_on_hand FROM stock_balances WHERE product_id=$1 AND location_id=$2 AND lot_id IS NULL`,
      [productId, warehouseId],
    )
    expect(parseFloat(balAfter.rows[0]!.qty_reserved)).toBe(0)
    expect(parseFloat(balAfter.rows[0]!.qty_on_hand)).toBe(0)
  })

  it('does not complete a requisition that still has an unresolved forked child line', async () => {
    const { reqId } = await makeReqWithOneChildAtSourcing(4, 10)
    const status = await pool.query<{ status: string }>(`SELECT status FROM requisitions WHERE id=$1`, [reqId])
    expect(status.rows[0]!.status).toBe('sourcing')
  })
})

describe('completion evaluator — child close and child cancel', () => {
  it('completes the requisition once its only child PO is completed (completePO bridge)', async () => {
    const { reqId, childId } = await makeReqWithOneChildAtSourcing(3, 12)
    // Simulate the child having reached 'payment_pending' (G1 Phase 3
    // Milestone A's child-vocabulary equivalent of 'invoiced', since this
    // child has a requisition_id — see completePO's dual-vocab branch) via
    // the receiving/audit pipeline — not part of what this PR tests, so
    // fast-forwarded directly rather than re-driving the whole flow.
    await pool.query(`UPDATE purchase_orders SET status='payment_pending', funding_decided=true WHERE id=$1`, [childId])

    await resolvers.Mutation.completePO(null, { id: childId }, ctx as never)

    const after = await pool.query<{ status: string }>(`SELECT status FROM requisitions WHERE id=$1`, [reqId])
    expect(after.rows[0]!.status).toBe('completed')
  })

  it('completes the requisition once its only child PO is cancelled', async () => {
    const { reqId, childId } = await makeReqWithOneChildAtSourcing(3, 12)
    const result = await resolvers.Mutation.cancelChildPurchaseOrder(null, { id: childId, reason: 'vendor backed out' }, ctx as never)
    expect((result as { status: string }).status).toBe('cancelled')

    const after = await pool.query<{ status: string }>(`SELECT status FROM requisitions WHERE id=$1`, [reqId])
    expect(after.rows[0]!.status).toBe('completed')
  })

  it('rejects cancelling a child PO not in bought status', async () => {
    const { childId } = await makeReqWithOneChildAtSourcing(3, 12)
    await pool.query(`UPDATE purchase_orders SET status='goods_received' WHERE id=$1`, [childId])
    await expect(
      resolvers.Mutation.cancelChildPurchaseOrder(null, { id: childId, reason: 'x' }, ctx as never),
    ).rejects.toThrow(/cannot cancel child po in status/i)
  })
})

describe('closeRequisitionLine', () => {
  it('requires a reason and only works once sourcing', async () => {
    const productId = await makeProduct('notyetsourcing')
    const created = await resolvers.Mutation.createRequisition(
      null,
      { input: { purpose: 'stock', lines: [{ product_id: productId, description: 'x', qty: 2, unit_price: 1 }] } },
      ctx as never,
    )
    const reqId = (created as { id: string }).id
    const lineRow = await pool.query<{ id: string }>(`SELECT id FROM po_lines WHERE requisition_id=$1`, [reqId])
    const lineId = lineRow.rows[0]!.id

    await expect(
      resolvers.Mutation.closeRequisitionLine(null, { lineId, reason: '  ' }, ctx as never),
    ).rejects.toThrow(/reason is required/i)
    await expect(
      resolvers.Mutation.closeRequisitionLine(null, { lineId, reason: 'stuck' }, ctx as never),
    ).rejects.toThrow(/must be in sourcing status/i)
  })

  it('closes a stuck stock line and completes the requisition, blocks a second close', async () => {
    const { reqId, lineId } = await makeStockOnlyReqAtSourcing(5)
    // Never confirm the Store Out — close the line manually instead, as
    // if the physical stock turned out damaged/miscounted.
    const result = await resolvers.Mutation.closeRequisitionLine(
      null,
      { lineId, reason: 'stock found damaged, will not be issued' },
      ctx as never,
    )
    const r = result as { closed_reason: string; closed_by: string; closed_at: string }
    expect(r.closed_reason).toBe('stock found damaged, will not be issued')
    expect(r.closed_by).toBe(userId)
    expect(r.closed_at).toBeTruthy()

    const after = await pool.query<{ status: string }>(`SELECT status FROM requisitions WHERE id=$1`, [reqId])
    expect(after.rows[0]!.status).toBe('completed')

    await expect(
      resolvers.Mutation.closeRequisitionLine(null, { lineId, reason: 'again' }, ctx as never),
    ).rejects.toThrow(/must be in sourcing status|already closed/i)
  })
})

describe('cancelRequisition', () => {
  it('is blocked when a child PO is at or past goods_received', async () => {
    const { reqId, childId } = await makeReqWithOneChildAtSourcing(3, 12)
    await pool.query(`UPDATE purchase_orders SET status='goods_received' WHERE id=$1`, [childId])
    await expect(
      resolvers.Mutation.cancelRequisition(null, { id: reqId, reason: 'no longer needed' }, ctx as never),
    ).rejects.toThrow(/already at 'goods_received'/i)
  })

  it('cascades to cancellable children and releases reservations otherwise', async () => {
    const stockProductId = await makeProduct('cancelstock')
    await receive(stockProductId, warehouseId, 10)
    const created = await resolvers.Mutation.createRequisition(
      null,
      {
        input: {
          purpose: 'stock',
          lines: [
            { product_id: stockProductId, description: 'from stock', qty: 4, unit_price: 1 },
            { product_id: await makeProduct('cancelbuy'), description: 'to purchase', qty: 3, unit_price: 1 },
          ],
        },
      },
      ctx as never,
    )
    const reqId = (created as { id: string }).id
    const lines = await pool.query<{ id: string; description: string }>(
      `SELECT id, description FROM po_lines WHERE requisition_id=$1 ORDER BY line_number`,
      [reqId],
    )
    const stockLineId = lines.rows.find((l) => l.description === 'from stock')!.id
    const buyLineId = lines.rows.find((l) => l.description === 'to purchase')!.id

    await resolvers.Mutation.submitRequisitionToInventoryCheck(null, { id: reqId }, ctx as never)
    await resolvers.Mutation.confirmRequisitionInventoryCheck(
      null,
      {
        id: reqId,
        lineStockQtys: [
          { lineId: stockLineId, qtyFromStock: 4, sourceLocationId: warehouseId },
          { lineId: buyLineId, qtyFromStock: 0 },
        ],
      },
      ctx as never,
    )
    await resolvers.Mutation.submitRequisitionStorePricing(null, { id: reqId }, ctx as never)
    await resolvers.Mutation.submitRequisitionMarketPricing(
      null,
      { id: reqId, linePrices: [{ lineId: buyLineId, marketPrice: 10, currencyCode: 'IQD' }] },
      ctx as never,
    )
    await resolvers.Mutation.verifyRequisitionPrices(
      null,
      { id: reqId, lineAdjustments: [{ lineId: buyLineId, verifiedPrice: 10 }] },
      ctx as never,
    )
    await resolvers.Mutation.approveRequisition(null, { id: reqId }, ctx as never)
    const receiptFileId = await makeUploadedFile()
    await resolvers.Mutation.recordLinePurchase(
      null,
      { input: { lineId: buyLineId, vendorId: vendorBId, qty: 3, actualUnitPrice: 10, currencyCode: 'IQD', receiptFileId } },
      ctx as never,
    )
    await resolvers.Mutation.finishBuyingRequisition(null, { id: reqId }, ctx as never)

    const balBefore = await pool.query<{ qty_reserved: string }>(
      `SELECT qty_reserved FROM stock_balances WHERE product_id=$1 AND location_id=$2 AND lot_id IS NULL`,
      [stockProductId, warehouseId],
    )
    expect(parseFloat(balBefore.rows[0]!.qty_reserved)).toBe(4)

    const result = await resolvers.Mutation.cancelRequisition(null, { id: reqId, reason: 'project cancelled' }, ctx as never)
    expect((result as { status: string }).status).toBe('cancelled')

    const child = await pool.query<{ status: string }>(`SELECT status FROM purchase_orders WHERE requisition_id=$1`, [reqId])
    expect(child.rows[0]!.status).toBe('cancelled')

    const balAfter = await pool.query<{ qty_reserved: string }>(
      `SELECT qty_reserved FROM stock_balances WHERE product_id=$1 AND location_id=$2 AND lot_id IS NULL`,
      [stockProductId, warehouseId],
    )
    expect(parseFloat(balAfter.rows[0]!.qty_reserved)).toBe(0)

    const issue = await pool.query<{ status: string }>(`SELECT status FROM project_material_issues WHERE requisition_id=$1`, [reqId])
    expect(issue.rows[0]!.status).toBe('cancelled')
  })

  it('rejects a non-organizer, non-admin caller', async () => {
    const { reqId } = await makeStockOnlyReqAtSourcing(2)
    const strangerCtx = {
      auth: { companyId: TEST_COMPANY_ID, userId: '00000000-0000-0000-0000-000000000099', role: 'user', module: 'all', sessionId: 'x' },
    }
    await expect(
      resolvers.Mutation.cancelRequisition(null, { id: reqId, reason: 'x' }, strangerCtx as never),
    ).rejects.toThrow(/only the requisition organizer or an admin/i)
  })
})
