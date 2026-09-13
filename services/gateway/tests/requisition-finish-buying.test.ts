// Integration tests for G1 Phase 2 PR 4: finishBuyingRequisition (forks one
// child purchase_orders row per distinct vendor, handles the mutate-in-place
// vs fragment-into-new-rows line-forking rule, and its three pre-flight
// gates), plus requisitionChildPurchaseOrders and
// PurchaseOrder.isLegacyNoPurchaseRecord. Same real-Postgres pattern as the
// earlier G1 test files.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'

const TEST_COMPANY_ID = '00000000-0000-0000-0000-000000000001'
const TEST_USER_EMAIL = 'g1-finish-buying-test@fnc-erp.local'
const BUYER_USER_EMAIL = 'g1-finish-buying-buyer-test@fnc-erp.local'
const SECOND_ADMIN_EMAIL = 'g1-finish-buying-second-admin-test@fnc-erp.local'
const BUYER_EMPLOYEE_NUMBER = 'G1FBTEST-BUYER'
const VENDOR_PREFIX = 'G1FBTEST-VENDOR-'
const SKU_PREFIX = 'G1FBTEST-'

let userId: string
let warehouseId: string
let ctx: { auth: { companyId: string; userId: string; role: string; module: string; sessionId: string } }
let buyerUserId: string
let buyerEmployeeId: string
let buyerCtx: { auth: { companyId: string; userId: string; role: string; module: string; sessionId: string } }
// approveTolerancePurchase refuses to let the recorder approve their own
// entry (see requisition-items-bought.test.ts) — this second admin exists
// purely so tests here can approve a purchase ctx itself recorded.
let secondAdminUserId: string
let secondAdminCtx: { auth: { companyId: string; userId: string; role: string; module: string; sessionId: string } }
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
  const key = `g1fb-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const r = await pool.query<{ id: string }>(
    `INSERT INTO files (company_id, uploaded_by, file_key, original_filename, mime_type, size_bytes, category, status)
     VALUES ($1,$2,$3,'receipt.jpg','image/jpeg',1024,'attachment','uploaded') RETURNING id`,
    [TEST_COMPANY_ID, userId, key],
  )
  return r.rows[0]!.id
}

// finished_product_id has no FK constraint (see 017_manufacturing_schema.sql's
// own comment), so a plain products row stands in for it — only bom_id is a
// real FK a manufacturing_orders row needs satisfied.
async function makeManufacturingOrder(): Promise<string> {
  const productId = await makeProduct('mo')
  const bom = await pool.query<{ id: string }>(
    `INSERT INTO boms (company_id, finished_product_id, created_by) VALUES ($1,$2,$3) RETURNING id`,
    [TEST_COMPANY_ID, productId, userId],
  )
  const moNumber = `G1FBTEST-MO-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const mo = await pool.query<{ id: string }>(
    `INSERT INTO manufacturing_orders (company_id, mo_number, bom_id, finished_product_id, qty_planned, created_by)
     VALUES ($1,$2,$3,$4,1,$5) RETURNING id`,
    [TEST_COMPANY_ID, moNumber, bom.rows[0]!.id, productId, userId],
  )
  return mo.rows[0]!.id
}

// Drives a fresh requisition (one line) to items_bought. qtyFromStock
// defaults to 0 (whole line needs purchasing).
async function makeReqAtItemsBought(opts: {
  qtyOrdered: number
  marketPrice: number
  qtyFromStock?: number
  linkedMoId?: string
}): Promise<{ reqId: string; lineId: string; productId: string }> {
  const productId = await makeProduct('fb')
  const qtyFromStock = opts.qtyFromStock ?? 0
  if (qtyFromStock > 0) await receive(productId, warehouseId, qtyFromStock)

  const created = await resolvers.Mutation.createRequisition(
    null,
    {
      input: {
        purpose: opts.linkedMoId ? 'manufacturing' : 'stock',
        linked_mo_id: opts.linkedMoId,
        lines: [{ product_id: productId, description: 'x', qty: opts.qtyOrdered, unit_price: 1 }],
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
    { id: reqId, lineStockQtys: [{ lineId, qtyFromStock, sourceLocationId: qtyFromStock > 0 ? warehouseId : undefined }] },
    ctx as never,
  )
  await resolvers.Mutation.submitRequisitionStorePricing(null, { id: reqId }, ctx as never)
  await resolvers.Mutation.submitRequisitionMarketPricing(
    null,
    { id: reqId, linePrices: [{ lineId, marketPrice: opts.marketPrice, currencyCode: 'IQD' }] },
    ctx as never,
  )
  await resolvers.Mutation.verifyRequisitionPrices(
    null,
    { id: reqId, lineAdjustments: [{ lineId, verifiedPrice: opts.marketPrice }] },
    ctx as never,
  )
  const result = await resolvers.Mutation.approveRequisition(null, { id: reqId }, ctx as never)
  expect((result as { status: string }).status).toBe('items_bought')
  return { reqId, lineId, productId }
}

async function recordPurchase(
  lineId: string,
  vendorId: string,
  qty: number,
  price: number,
  opts: { withReceipt?: boolean } = {},
): Promise<{ id: string }> {
  const receiptFileId = opts.withReceipt === false ? undefined : await makeUploadedFile()
  const r = await resolvers.Mutation.recordLinePurchase(
    null,
    { input: { lineId, vendorId, qty, actualUnitPrice: price, currencyCode: 'IQD', receiptFileId } },
    ctx as never,
  )
  return r as { id: string }
}

async function cleanup(): Promise<void> {
  await pool.query(
    `DELETE FROM po_line_purchases WHERE po_line_id IN (
       SELECT pl.id FROM po_lines pl JOIN requisitions req ON req.id=pl.requisition_id
       WHERE req.company_id=$1 AND req.organizer_id=$2)`,
    [TEST_COMPANY_ID, userId],
  )
  await pool.query(
    `DELETE FROM document_attachments WHERE entity_type='po_line_purchase' AND uploaded_by=$1`,
    [userId],
  )
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
    `DELETE FROM project_material_issue_lines WHERE issue_id IN (SELECT id FROM project_material_issues WHERE company_id=$1 AND created_by=$2)`,
    [TEST_COMPANY_ID, userId],
  )
  await pool.query(`DELETE FROM project_material_issues WHERE company_id=$1 AND created_by=$2`, [
    TEST_COMPANY_ID,
    userId,
  ])
  // Child POs forked from this requisition's lines, and their lines.
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
  // manufacturing_orders.bom_id is a real FK into boms — delete in that order.
  // Both filtered by created_by=userId rather than SKU, since neither table
  // is keyed off a product's own SKU.
  await pool.query(`DELETE FROM manufacturing_orders WHERE company_id=$1 AND created_by=$2`, [
    TEST_COMPANY_ID,
    userId,
  ])
  await pool.query(`DELETE FROM boms WHERE company_id=$1 AND created_by=$2`, [TEST_COMPANY_ID, userId])
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
  ctx = { auth: { companyId: TEST_COMPANY_ID, userId, role: 'system_admin', module: 'all', sessionId: 'g1-fb-test' } }

  const buyerUserR = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [BUYER_USER_EMAIL],
  )
  buyerUserId = buyerUserR.rows[0]!.id
  const buyerEmployeeR = await pool.query<{ id: string }>(
    `INSERT INTO employees (company_id, user_id, first_name, last_name, hire_date, employee_number)
     VALUES ($1,$2,'Test','Buyer',CURRENT_DATE,$3)
     ON CONFLICT (company_id, employee_number) DO UPDATE SET user_id = EXCLUDED.user_id RETURNING id`,
    [TEST_COMPANY_ID, buyerUserId, BUYER_EMPLOYEE_NUMBER],
  )
  buyerEmployeeId = buyerEmployeeR.rows[0]!.id
  await pool.query(`DELETE FROM po_position_assignments WHERE employee_id=$1 AND position='buyer'`, [buyerEmployeeId])
  await pool.query(
    `INSERT INTO po_position_assignments (company_id, employee_id, position, is_active, assigned_by)
     VALUES ($1,$2,'buyer',true,$3)`,
    [TEST_COMPANY_ID, buyerEmployeeId, userId],
  )
  buyerCtx = {
    auth: { companyId: TEST_COMPANY_ID, userId: buyerUserId, role: 'user', module: 'all', sessionId: 'g1-fb-test-buyer' },
  }

  const secondAdminR = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [SECOND_ADMIN_EMAIL],
  )
  secondAdminUserId = secondAdminR.rows[0]!.id
  secondAdminCtx = {
    auth: { companyId: TEST_COMPANY_ID, userId: secondAdminUserId, role: 'system_admin', module: 'all', sessionId: 'g1-fb-test-second-admin' },
  }

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

  // Deterministic tolerance for this whole suite, seeded up front so no
  // test's outcome depends on another test having run first.
  await pool.query(
    `INSERT INTO company_price_tolerance (company_id, currency_code, tolerance_pct, tolerance_abs, is_provisional)
     VALUES ($1,'IQD',5,1000,true)
     ON CONFLICT (company_id, currency_code) DO UPDATE SET tolerance_pct=5, tolerance_abs=1000`,
    [TEST_COMPANY_ID],
  )
})

afterAll(async () => {
  await cleanup()
  await pool.query(`DELETE FROM po_position_assignments WHERE employee_id=$1`, [buyerEmployeeId])
  await pool.query(`DELETE FROM employees WHERE employee_number=$1`, [BUYER_EMPLOYEE_NUMBER])
  await pool.query(`DELETE FROM users WHERE email=$1`, [TEST_USER_EMAIL])
  await pool.query(`DELETE FROM users WHERE email=$1`, [BUYER_USER_EMAIL])
  await pool.query(`DELETE FROM users WHERE email=$1`, [SECOND_ADMIN_EMAIL])
  await pool.end()
})

describe('finishBuyingRequisition', () => {
  it('rejects when a line still has an unresolved remaining qty', async () => {
    const { reqId, lineId } = await makeReqAtItemsBought({ qtyOrdered: 10, marketPrice: 20 })
    await recordPurchase(lineId, vendorAId, 4, 20) // only 4 of 10 bought, not marked short
    await expect(
      resolvers.Mutation.finishBuyingRequisition(null, { id: reqId }, ctx as never),
    ).rejects.toThrow(/fully bought or marked short/i)
  })

  it('rejects when a recorded purchase has no receipt attached', async () => {
    const { reqId, lineId } = await makeReqAtItemsBought({ qtyOrdered: 5, marketPrice: 20 })
    await recordPurchase(lineId, vendorAId, 5, 20, { withReceipt: false })
    await expect(
      resolvers.Mutation.finishBuyingRequisition(null, { id: reqId }, ctx as never),
    ).rejects.toThrow(/attach a receipt/i)
  })

  it('rejects when an over-tolerance purchase is unapproved', async () => {
    const { reqId, lineId } = await makeReqAtItemsBought({ qtyOrdered: 5, marketPrice: 100 })
    const p = await recordPurchase(lineId, vendorAId, 5, 200) // way over tolerance
    await expect(
      resolvers.Mutation.finishBuyingRequisition(null, { id: reqId }, ctx as never),
    ).rejects.toThrow(/over-tolerance purchase must be approved/i)

    // approveTolerancePurchase refuses the same user who recorded it —
    // needs a different supervisor.
    await resolvers.Mutation.approveTolerancePurchase(null, { purchaseId: p.id }, secondAdminCtx as never)
    const result = await resolvers.Mutation.finishBuyingRequisition(null, { id: reqId }, ctx as never)
    expect((result as { status: string }).status).toBe('sourcing')
  })

  it('rejects from a user with no buyer position, allows one holding it', async () => {
    const { reqId, lineId } = await makeReqAtItemsBought({ qtyOrdered: 3, marketPrice: 10 })
    await recordPurchase(lineId, vendorAId, 3, 10)
    await pool.query(`UPDATE po_position_assignments SET is_active=false WHERE employee_id=$1`, [buyerEmployeeId])
    await expect(
      resolvers.Mutation.finishBuyingRequisition(null, { id: reqId }, buyerCtx as never),
    ).rejects.toThrow(/only a buyer position holder/i)
    await pool.query(`UPDATE po_position_assignments SET is_active=true WHERE employee_id=$1`, [buyerEmployeeId])

    const result = await resolvers.Mutation.finishBuyingRequisition(null, { id: reqId }, buyerCtx as never)
    expect((result as { status: string }).status).toBe('sourcing')
  })

  it('simple case: single vendor, nothing from stock — mutates the line in place, no new row', async () => {
    const { reqId, lineId } = await makeReqAtItemsBought({ qtyOrdered: 8, marketPrice: 15 })
    await recordPurchase(lineId, vendorAId, 8, 15)
    await resolvers.Mutation.finishBuyingRequisition(null, { id: reqId }, ctx as never)

    const line = await pool.query<{ po_id: string | null; qty_ordered: string; unit_price: string; actual_unit_price: string | null; currency_code: string }>(
      `SELECT po_id, qty_ordered, unit_price, actual_unit_price, currency_code FROM po_lines WHERE id=$1`,
      [lineId],
    )
    expect(line.rows[0]!.po_id).not.toBeNull()
    expect(parseFloat(line.rows[0]!.qty_ordered)).toBe(8)
    expect(parseFloat(line.rows[0]!.unit_price)).toBe(15)
    // Regression: left null pre-fix — the Finance Audit panel's "Actual
    // Price (entered by buyer)" box reads this column specifically and
    // falsely claimed "buyer hasn't recorded a price" for every G1 forked
    // line. Found live on PO-2026-0028.
    expect(line.rows[0]!.actual_unit_price).not.toBeNull()
    expect(parseFloat(line.rows[0]!.actual_unit_price!)).toBe(15)

    // Exactly one line total for this requisition — no fragmentation.
    const allLines = await pool.query(`SELECT id FROM po_lines WHERE requisition_id=$1`, [reqId])
    expect(allLines.rows).toHaveLength(1)

    const child = await pool.query<{ status: string; vendor_id: string }>(
      `SELECT status, vendor_id FROM purchase_orders WHERE id=$1`,
      [line.rows[0]!.po_id],
    )
    expect(child.rows[0]!.status).toBe('bought')
    expect(child.rows[0]!.vendor_id).toBe(vendorAId)
  })

  // G1 Phase 3 — Manufacturing Order is the third call site migrated from
  // direct PO creation to requisition-first purchasing (Project and Vendor
  // already done). purchase_orders.linked_mo_id is what the existing MO-
  // consumption-on-receipt logic (confirmReceipt, issueMaterialIssue) reads
  // — it never knows or cares whether the PO came from a requisition fork
  // or a direct create, so the only thing that has to work is this
  // propagation at fork time.
  it('propagates linked_mo_id from a manufacturing requisition onto its forked child PO', async () => {
    const moId = await makeManufacturingOrder()
    const { reqId, lineId } = await makeReqAtItemsBought({ qtyOrdered: 5, marketPrice: 12, linkedMoId: moId })

    const reqRow = await pool.query<{ purpose: string; linked_mo_id: string | null }>(
      `SELECT purpose, linked_mo_id FROM requisitions WHERE id=$1`,
      [reqId],
    )
    expect(reqRow.rows[0]!.purpose).toBe('manufacturing')
    expect(reqRow.rows[0]!.linked_mo_id).toBe(moId)

    await recordPurchase(lineId, vendorAId, 5, 12)
    await resolvers.Mutation.finishBuyingRequisition(null, { id: reqId }, ctx as never)

    const line = await pool.query<{ po_id: string | null }>(`SELECT po_id FROM po_lines WHERE id=$1`, [lineId])
    const childId = line.rows[0]!.po_id!
    const child = await pool.query<{ linked_mo_id: string | null }>(
      `SELECT linked_mo_id FROM purchase_orders WHERE id=$1`,
      [childId],
    )
    expect(child.rows[0]!.linked_mo_id).toBe(moId)
  })

  // Regression: the receipt attached to a purchase during Items Bought
  // lives at entity_type='po_line_purchase' — never at entity_type=
  // 'purchase_order' against the forked child PO's own id. The Store In
  // "Buyer's Receipt" panel queries entityAttachments('purchase_order',
  // childPoId), so before this fix it always came back empty for a G1
  // child PO even when a receipt genuinely was attached — found via
  // manual click-through (Record Receipt on a Cash Purchase child PO).
  it('entityAttachments(purchase_order, childPoId) surfaces the receipt recorded at Items Bought', async () => {
    const { reqId, lineId } = await makeReqAtItemsBought({ qtyOrdered: 8, marketPrice: 15 })
    await recordPurchase(lineId, vendorAId, 8, 15)
    await resolvers.Mutation.finishBuyingRequisition(null, { id: reqId }, ctx as never)

    const line = await pool.query<{ po_id: string | null }>(`SELECT po_id FROM po_lines WHERE id=$1`, [lineId])
    const childPoId = line.rows[0]!.po_id!

    const attachments = await resolvers.Query.entityAttachments(
      null,
      { entityType: 'purchase_order', entityId: childPoId },
      ctx as never,
    )
    expect((attachments as { file: { originalFilename: string } }[]).length).toBe(1)
    expect((attachments as { file: { originalFilename: string } }[])[0]!.file.originalFilename).toBe('receipt.jpg')
  })

  it('mixed case: partly from stock, rest from one vendor — original row keeps the stock portion, a new row carries the purchase', async () => {
    const { reqId, lineId } = await makeReqAtItemsBought({ qtyOrdered: 10, marketPrice: 15, qtyFromStock: 4 })
    await recordPurchase(lineId, vendorAId, 6, 15)
    await resolvers.Mutation.finishBuyingRequisition(null, { id: reqId }, ctx as never)

    const original = await pool.query<{ po_id: string | null; qty_ordered: string; qty_from_stock: string }>(
      `SELECT po_id, qty_ordered, qty_from_stock FROM po_lines WHERE id=$1`,
      [lineId],
    )
    expect(original.rows[0]!.po_id).toBeNull()
    expect(parseFloat(original.rows[0]!.qty_ordered)).toBe(4)
    expect(parseFloat(original.rows[0]!.qty_from_stock)).toBe(4)

    const fragment = await pool.query<{ po_id: string | null; qty_ordered: string; unit_price: string; actual_unit_price: string | null; origin_line_id: string | null }>(
      `SELECT po_id, qty_ordered, unit_price, actual_unit_price, origin_line_id FROM po_lines WHERE requisition_id=$1 AND id != $2`,
      [reqId, lineId],
    )
    expect(fragment.rows).toHaveLength(1)
    expect(fragment.rows[0]!.po_id).not.toBeNull()
    expect(parseFloat(fragment.rows[0]!.qty_ordered)).toBe(6)
    expect(parseFloat(fragment.rows[0]!.unit_price)).toBe(15)
    // Same regression as the simple case above, for the new-row (INSERT)
    // fork branch this scenario exercises.
    expect(fragment.rows[0]!.actual_unit_price).not.toBeNull()
    expect(parseFloat(fragment.rows[0]!.actual_unit_price!)).toBe(15)
    // Traces back to the requisition line it was forked from.
    expect(fragment.rows[0]!.origin_line_id).toBe(lineId)
  })

  it('split case: two vendors, nothing from stock — first entry mutates the original row, second gets a new row', async () => {
    const { reqId, lineId } = await makeReqAtItemsBought({ qtyOrdered: 10, marketPrice: 20 })
    await recordPurchase(lineId, vendorAId, 6, 20)
    await recordPurchase(lineId, vendorBId, 4, 20) // same price, stays within tolerance
    await resolvers.Mutation.finishBuyingRequisition(null, { id: reqId }, ctx as never)

    const allLines = await pool.query<{ id: string; po_id: string; qty_ordered: string; actual_unit_price: string | null; origin_line_id: string | null }>(
      `SELECT pl.id, pl.po_id, pl.qty_ordered, pl.actual_unit_price, pl.origin_line_id FROM po_lines pl WHERE pl.requisition_id=$1`,
      [reqId],
    )
    expect(allLines.rows).toHaveLength(2)
    expect(allLines.rows.every((l) => l.po_id !== null)).toBe(true)
    // Both the mutated-in-place row and the new-row fork carry a real
    // actual_unit_price — same regression as the simple/mixed cases above,
    // covering both fork branches at once.
    expect(allLines.rows.every((l) => l.actual_unit_price != null && parseFloat(l.actual_unit_price) === 20)).toBe(true)
    const totalQty = allLines.rows.reduce((s, l) => s + parseFloat(l.qty_ordered), 0)
    expect(totalQty).toBe(10)

    // The mutated-in-place row IS the original line (id === lineId, so it
    // needs no origin_line_id — it's not a fork, it's the same row); the
    // brand-new row for the second vendor traces back to it.
    const mutated = allLines.rows.find((l) => l.id === lineId)!
    const forked = allLines.rows.find((l) => l.id !== lineId)!
    expect(mutated.origin_line_id).toBeNull()
    expect(forked.origin_line_id).toBe(lineId)

    const children = await pool.query<{ id: string; vendor_id: string }>(
      `SELECT id, vendor_id FROM purchase_orders WHERE requisition_id=$1`,
      [reqId],
    )
    expect(children.rows).toHaveLength(2)
    expect(children.rows.map((c) => c.vendor_id).sort()).toEqual([vendorAId, vendorBId].sort())
  })

  it('reservations and pending catalog items still reference the original, untouched row after forking', async () => {
    const { reqId, lineId } = await makeReqAtItemsBought({ qtyOrdered: 10, marketPrice: 15, qtyFromStock: 4 })

    // The Store Out draft created at approval time (PR 2) for the
    // 4-unit stock portion.
    const issueLineBefore = await pool.query<{ po_line_id: string; qty_issued: string }>(
      `SELECT pmil.po_line_id, pmil.qty_issued FROM project_material_issue_lines pmil
       JOIN project_material_issues pmi ON pmi.id = pmil.issue_id WHERE pmi.requisition_id=$1`,
      [reqId],
    )
    expect(issueLineBefore.rows).toHaveLength(1)
    expect(issueLineBefore.rows[0]!.po_line_id).toBe(lineId)
    expect(parseFloat(issueLineBefore.rows[0]!.qty_issued)).toBe(4)

    // issueStockForRequisitionLines only reaches the pending-catalog-item
    // branch for a from-stock line with no product_id — not reachable
    // through the normal flow here, since confirmRequisitionInventoryCheck
    // itself requires a real, stocked product to confirm any qty_from_stock
    // against. Simulated directly, matching that insert's exact shape, to
    // verify Finish Buying leaves an existing row like it alone.
    await pool.query(
      `INSERT INTO pending_product_catalog_items
         (company_id, requisition_id, po_line_id, description, qty, uom, unit_price, currency_code, source)
       VALUES ($1,$2,$3,'simulated uncatalogued portion',1,'unit',1,'IQD','stock_issuance')`,
      [TEST_COMPANY_ID, reqId, lineId],
    )

    await recordPurchase(lineId, vendorAId, 6, 15)
    await resolvers.Mutation.finishBuyingRequisition(null, { id: reqId }, ctx as never)

    // Same lineId, unaffected by the fork/reduction — po_lines.id never
    // changes, only the row's other columns do.
    const issueLineAfter = await pool.query<{ po_line_id: string }>(
      `SELECT pmil.po_line_id FROM project_material_issue_lines pmil
       JOIN project_material_issues pmi ON pmi.id = pmil.issue_id WHERE pmi.requisition_id=$1`,
      [reqId],
    )
    expect(issueLineAfter.rows[0]!.po_line_id).toBe(lineId)

    const pendingAfter = await pool.query<{ po_line_id: string }>(
      `SELECT po_line_id FROM pending_product_catalog_items WHERE requisition_id=$1`,
      [reqId],
    )
    expect(pendingAfter.rows).toHaveLength(1)
    expect(pendingAfter.rows[0]!.po_line_id).toBe(lineId)

    const originalLine = await pool.query<{ qty_from_stock: string; qty_ordered: string }>(
      `SELECT qty_from_stock, qty_ordered FROM po_lines WHERE id=$1`,
      [lineId],
    )
    expect(parseFloat(originalLine.rows[0]!.qty_from_stock)).toBe(4)
    expect(parseFloat(originalLine.rows[0]!.qty_ordered)).toBe(4) // reduced to just the stock portion
  })

  it('short-marked line with nothing ever bought: no purchases recorded — transitions straight to sourcing with no fork', async () => {
    const { reqId, lineId } = await makeReqAtItemsBought({ qtyOrdered: 5, marketPrice: 10 })
    await resolvers.Mutation.markRequisitionLineShort(null, { lineId, reason: 'vendor discontinued the item' }, ctx as never)
    const result = await resolvers.Mutation.finishBuyingRequisition(null, { id: reqId }, ctx as never)
    expect((result as { status: string }).status).toBe('sourcing')

    const children = await pool.query(`SELECT id FROM purchase_orders WHERE requisition_id=$1`, [reqId])
    expect(children.rows).toHaveLength(0)
    const line = await pool.query<{ po_id: string | null }>(`SELECT po_id FROM po_lines WHERE id=$1`, [lineId])
    expect(line.rows[0]!.po_id).toBeNull()
  })
})

describe('requisitionChildPurchaseOrders', () => {
  it('returns the forked child with its vendor name', async () => {
    const { reqId, lineId } = await makeReqAtItemsBought({ qtyOrdered: 4, marketPrice: 12 })
    await recordPurchase(lineId, vendorAId, 4, 12)
    await resolvers.Mutation.finishBuyingRequisition(null, { id: reqId }, ctx as never)

    const children = await resolvers.Query.requisitionChildPurchaseOrders(null, { requisitionId: reqId }, ctx as never)
    expect((children as { vendor_id: string; vendor_name: string }[])).toHaveLength(1)
    expect((children as { vendor_id: string }[])[0]!.vendor_id).toBe(vendorAId)
    expect((children as { vendor_name: string }[])[0]!.vendor_name).toContain(VENDOR_PREFIX)
  })
})

describe('PurchaseOrder.isLegacyNoPurchaseRecord', () => {
  it('is false for a Finish-Buying-forked child, true for one with no purchase records', async () => {
    const { reqId, lineId } = await makeReqAtItemsBought({ qtyOrdered: 3, marketPrice: 9 })
    await recordPurchase(lineId, vendorAId, 3, 9)
    await resolvers.Mutation.finishBuyingRequisition(null, { id: reqId }, ctx as never)
    const child = await pool.query<{ id: string }>(`SELECT id FROM purchase_orders WHERE requisition_id=$1`, [reqId])
    const isLegacyReal = await (resolvers as unknown as { PurchaseOrder: { isLegacyNoPurchaseRecord: (p: { id: string }) => Promise<boolean> } })
      .PurchaseOrder.isLegacyNoPurchaseRecord({ id: child.rows[0]!.id })
    expect(isLegacyReal).toBe(false)

    // A PO with a line but zero po_line_purchases entries (simulating a
    // pre-G1 migrated BECOMES_CHILD row).
    const productId = await makeProduct('legacy')
    const legacyPo = await pool.query<{ id: string }>(
      `INSERT INTO purchase_orders (company_id, po_number, vendor_id, currency_code, status, purpose, created_by)
       VALUES ($1,$2,$3,'IQD','bought','stock',$4) RETURNING id`,
      [TEST_COMPANY_ID, `LEGACY-${Date.now()}`, vendorBId, userId],
    )
    await pool.query(
      `INSERT INTO po_lines (po_id, line_number, description, product_id, qty_ordered, unit_price, currency_code, total_price)
       VALUES ($1,1,'legacy line',$2,1,1,'IQD',1)`,
      [legacyPo.rows[0]!.id, productId],
    )
    const isLegacyFake = await (resolvers as unknown as { PurchaseOrder: { isLegacyNoPurchaseRecord: (p: { id: string }) => Promise<boolean> } })
      .PurchaseOrder.isLegacyNoPurchaseRecord({ id: legacyPo.rows[0]!.id })
    expect(isLegacyFake).toBe(true)

    await pool.query(`DELETE FROM po_lines WHERE po_id=$1`, [legacyPo.rows[0]!.id])
    await pool.query(`DELETE FROM purchase_orders WHERE id=$1`, [legacyPo.rows[0]!.id])
  })
})
