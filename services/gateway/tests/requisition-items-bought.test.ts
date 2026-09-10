// Integration tests for G1 Phase 2 PR 3: recordLinePurchase (record an
// actual vendor purchase, split a line across vendors, tolerance flag +
// supervisor override), and markRequisitionLineShort. Same real-Postgres
// pattern as the earlier G1 test files.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'

const TEST_COMPANY_ID = '00000000-0000-0000-0000-000000000001'
const TEST_USER_EMAIL = 'g1-items-bought-test@fnc-erp.local'
const BUYER_USER_EMAIL = 'g1-items-bought-buyer-test@fnc-erp.local'
const BUYER_EMPLOYEE_NUMBER = 'G1IBTEST-BUYER'
const VENDOR_PREFIX = 'G1IBTEST-VENDOR-'
const SKU_PREFIX = 'G1IBTEST-'

let userId: string
let warehouseId: string
let ctx: { auth: { companyId: string; userId: string; role: string; module: string; sessionId: string } }
// A second, non-admin user holding only a 'buyer' position assignment —
// proves recordLinePurchase/markRequisitionLineShort's authorization is
// the buyer-position check, not just admin-bypasses-everything.
let buyerUserId: string
let buyerEmployeeId: string
let buyerCtx: { auth: { companyId: string; userId: string; role: string; module: string; sessionId: string } }
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

// Drives a fresh requisition (one line, nothing from stock so the whole
// qty needs purchasing) all the way to items_bought via approveRequisition.
async function makeReqAtItemsBought(opts: {
  qtyOrdered: number
  marketPrice: number
  currencyCode?: string
}): Promise<{ reqId: string; lineId: string; productId: string }> {
  const productId = await makeProduct('itemsbought')
  const created = await resolvers.Mutation.createRequisition(
    null,
    { input: { purpose: 'stock', lines: [{ product_id: productId, description: 'x', qty: opts.qtyOrdered, unit_price: 1 }] } },
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
    { id: reqId, linePrices: [{ lineId, marketPrice: opts.marketPrice, currencyCode: opts.currencyCode ?? 'IQD' }] },
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

async function cleanup(): Promise<void> {
  await pool.query(
    `DELETE FROM po_line_purchases WHERE po_line_id IN (
       SELECT pl.id FROM po_lines pl JOIN requisitions req ON req.id=pl.requisition_id
       WHERE req.company_id=$1 AND req.organizer_id=$2)`,
    [TEST_COMPANY_ID, userId],
  )
  await pool.query(
    `DELETE FROM document_attachments WHERE entity_type='po_line_purchase' AND entity_id IN (
       SELECT plp.id FROM po_line_purchases plp
       JOIN po_lines pl ON pl.id=plp.po_line_id JOIN requisitions req ON req.id=pl.requisition_id
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
    `DELETE FROM project_material_issue_lines WHERE issue_id IN (SELECT id FROM project_material_issues WHERE company_id=$1 AND created_by=$2)`,
    [TEST_COMPANY_ID, userId],
  )
  await pool.query(`DELETE FROM project_material_issues WHERE company_id=$1 AND created_by=$2`, [
    TEST_COMPANY_ID,
    userId,
  ])
  await pool.query(
    `DELETE FROM po_lines WHERE requisition_id IN (SELECT id FROM requisitions WHERE company_id=$1 AND organizer_id=$2)`,
    [TEST_COMPANY_ID, userId],
  )
  await pool.query(`DELETE FROM requisitions WHERE company_id=$1 AND organizer_id=$2`, [
    TEST_COMPANY_ID,
    userId,
  ])
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
  ctx = { auth: { companyId: TEST_COMPANY_ID, userId, role: 'system_admin', module: 'all', sessionId: 'g1-ib-test' } }

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
  // Company-wide 'buyer' grant (project_id/department_id/branch_id all
  // null) — matches userHasPositionForRequisitionGW's company-wide fallback.
  await pool.query(
    `DELETE FROM po_position_assignments WHERE employee_id=$1 AND position='buyer'`,
    [buyerEmployeeId],
  )
  await pool.query(
    `INSERT INTO po_position_assignments (company_id, employee_id, position, is_active, assigned_by)
     VALUES ($1,$2,'buyer',true,$3)`,
    [TEST_COMPANY_ID, buyerEmployeeId, userId],
  )
  buyerCtx = {
    auth: { companyId: TEST_COMPANY_ID, userId: buyerUserId, role: 'user', module: 'all', sessionId: 'g1-ib-test-buyer' },
  }

  const whR = await pool.query<{ id: string }>(
    `SELECT id FROM stock_locations WHERE company_id=$1 AND type='warehouse' AND is_active=true LIMIT 1`,
    [TEST_COMPANY_ID],
  )
  if (!whR.rows[0]) throw new Error('No warehouse location seeded for test company — run seeds first')
  warehouseId = whR.rows[0].id

  await cleanup()

  const vA = await pool.query<{ id: string }>(
    `INSERT INTO vendors (company_id, name) VALUES ($1,$2) RETURNING id`,
    [TEST_COMPANY_ID, `${VENDOR_PREFIX}A-${Date.now()}`],
  )
  vendorAId = vA.rows[0]!.id
  const vB = await pool.query<{ id: string }>(
    `INSERT INTO vendors (company_id, name) VALUES ($1,$2) RETURNING id`,
    [TEST_COMPANY_ID, `${VENDOR_PREFIX}B-${Date.now()}`],
  )
  vendorBId = vB.rows[0]!.id

  // Deterministic tolerance for this suite regardless of what's already
  // seeded for the test company — 5% or 1000 IQD, whichever hits first.
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
  await pool.end()
})

describe('recordLinePurchase', () => {
  it('rejects recording against a requisition not in items_bought status', async () => {
    const productId = await makeProduct('badstatus')
    const created = await resolvers.Mutation.createRequisition(
      null,
      { input: { purpose: 'stock', lines: [{ product_id: productId, description: 'x', qty: 5, unit_price: 1 }] } },
      ctx as never,
    )
    const reqId = (created as { id: string }).id
    const lineRow = await pool.query<{ id: string }>(`SELECT id FROM po_lines WHERE requisition_id=$1`, [reqId])
    await expect(
      resolvers.Mutation.recordLinePurchase(
        null,
        { input: { lineId: lineRow.rows[0]!.id, vendorId: vendorAId, qty: 5, actualUnitPrice: 10, currencyCode: 'IQD' } },
        ctx as never,
      ),
    ).rejects.toThrow(/must be in items_bought status/i)
  })

  it('records a single-vendor purchase and reflects it in the requisition query', async () => {
    const { reqId, lineId } = await makeReqAtItemsBought({ qtyOrdered: 10, marketPrice: 100 })

    const purchase = await resolvers.Mutation.recordLinePurchase(
      null,
      { input: { lineId, vendorId: vendorAId, qty: 10, actualUnitPrice: 100, currencyCode: 'IQD' } },
      ctx as never,
    )
    const p = purchase as { id: string; po_line_id: string; vendor_id: string; qty: string; actual_unit_price: string; over_tolerance: boolean }
    expect(p.po_line_id).toBe(lineId)
    expect(p.vendor_id).toBe(vendorAId)
    expect(parseFloat(p.qty)).toBe(10)
    expect(parseFloat(p.actual_unit_price)).toBe(100)
    expect(p.over_tolerance).toBe(false)

    const fetched = await resolvers.Query.requisition(null, { id: reqId }, ctx as never)
    const line = (fetched as { lines: { id: string; purchases: { id: string }[] }[] }).lines.find((l) => l.id === lineId)
    expect(line!.purchases).toHaveLength(1)
    expect(line!.purchases[0]!.id).toBe(p.id)
  })

  it('splits a line across two vendors and rejects buying past what remains', async () => {
    const { lineId } = await makeReqAtItemsBought({ qtyOrdered: 10, marketPrice: 50 })

    await resolvers.Mutation.recordLinePurchase(
      null,
      { input: { lineId, vendorId: vendorAId, qty: 6, actualUnitPrice: 50, currencyCode: 'IQD' } },
      ctx as never,
    )
    await resolvers.Mutation.recordLinePurchase(
      null,
      { input: { lineId, vendorId: vendorBId, qty: 4, actualUnitPrice: 52, currencyCode: 'IQD' } },
      ctx as never,
    )

    const rows = await pool.query<{ vendor_id: string; qty: string }>(
      `SELECT vendor_id, qty FROM po_line_purchases WHERE po_line_id=$1 ORDER BY bought_at`,
      [lineId],
    )
    expect(rows.rows).toHaveLength(2)
    expect(rows.rows.map((r) => r.vendor_id).sort()).toEqual([vendorAId, vendorBId].sort())

    // Nothing left — a third purchase of any positive qty must fail.
    await expect(
      resolvers.Mutation.recordLinePurchase(
        null,
        { input: { lineId, vendorId: vendorAId, qty: 1, actualUnitPrice: 50, currencyCode: 'IQD' } },
        ctx as never,
      ),
    ).rejects.toThrow(/only 0 remaining/i)
  })

  it('flags a purchase over the tolerance threshold against approved_unit_price', async () => {
    // approved_unit_price will be 100 (verified price carries through
    // approval unchanged, per the earlier snapshot-immunity test). Tolerance
    // seeded at 5%/1000 IQD -> allowance = min(5, 1000) = 5, so anything
    // over 105 is over_tolerance; 103 is within it.
    const within = await makeReqAtItemsBought({ qtyOrdered: 5, marketPrice: 100 })
    const withinPurchase = await resolvers.Mutation.recordLinePurchase(
      null,
      { input: { lineId: within.lineId, vendorId: vendorAId, qty: 5, actualUnitPrice: 103, currencyCode: 'IQD' } },
      ctx as never,
    )
    expect((withinPurchase as { over_tolerance: boolean }).over_tolerance).toBe(false)

    const over = await makeReqAtItemsBought({ qtyOrdered: 5, marketPrice: 100 })
    // Recorded by the plain buyer (no supervisor authority) — flagged but
    // not self-approved.
    const overPurchase = await resolvers.Mutation.recordLinePurchase(
      null,
      { input: { lineId: over.lineId, vendorId: vendorAId, qty: 5, actualUnitPrice: 120, currencyCode: 'IQD' } },
      buyerCtx as never,
    )
    const op = overPurchase as { id: string; over_tolerance: boolean; tolerance_approved_by: string | null }
    expect(op.over_tolerance).toBe(true)
    expect(op.tolerance_approved_by).toBeNull()

    // A non-supervisor can't self-approve it either.
    await expect(
      resolvers.Mutation.approveTolerancePurchase(null, { purchaseId: op.id }, buyerCtx as never),
    ).rejects.toThrow(/not authorized/i)

    const approved = await resolvers.Mutation.approveTolerancePurchase(null, { purchaseId: op.id }, ctx as never)
    expect((approved as { tolerance_approved_by: string | null }).tolerance_approved_by).toBe(userId)

    // Recorded directly by a supervisor (admin ctx) self-approves inline —
    // no separate approveTolerancePurchase call needed.
    const overBySupervisor = await makeReqAtItemsBought({ qtyOrdered: 5, marketPrice: 100 })
    const selfApproved = await resolvers.Mutation.recordLinePurchase(
      null,
      { input: { lineId: overBySupervisor.lineId, vendorId: vendorAId, qty: 5, actualUnitPrice: 120, currencyCode: 'IQD' } },
      ctx as never,
    )
    const sa = selfApproved as { over_tolerance: boolean; tolerance_approved_by: string | null }
    expect(sa.over_tolerance).toBe(true)
    expect(sa.tolerance_approved_by).toBe(userId)
  })

  it('rejects recording from a user with no buyer position, allows one holding it', async () => {
    const { lineId } = await makeReqAtItemsBought({ qtyOrdered: 3, marketPrice: 10 })
    const strangerCtx = {
      auth: { companyId: TEST_COMPANY_ID, userId: buyerUserId, role: 'user', module: 'all', sessionId: 'x' },
    }
    // Temporarily deactivate the buyer's position to prove the check is real.
    await pool.query(`UPDATE po_position_assignments SET is_active=false WHERE employee_id=$1`, [buyerEmployeeId])
    await expect(
      resolvers.Mutation.recordLinePurchase(
        null,
        { input: { lineId, vendorId: vendorAId, qty: 3, actualUnitPrice: 10, currencyCode: 'IQD' } },
        strangerCtx as never,
      ),
    ).rejects.toThrow(/only a buyer position holder/i)
    await pool.query(`UPDATE po_position_assignments SET is_active=true WHERE employee_id=$1`, [buyerEmployeeId])

    const purchase = await resolvers.Mutation.recordLinePurchase(
      null,
      { input: { lineId, vendorId: vendorAId, qty: 3, actualUnitPrice: 10, currencyCode: 'IQD' } },
      buyerCtx as never,
    )
    expect((purchase as { po_line_id: string }).po_line_id).toBe(lineId)
  })
})

describe('markRequisitionLineShort', () => {
  it('marks a line short and blocks further purchases against it', async () => {
    const { lineId } = await makeReqAtItemsBought({ qtyOrdered: 10, marketPrice: 20 })
    await resolvers.Mutation.recordLinePurchase(
      null,
      { input: { lineId, vendorId: vendorAId, qty: 6, actualUnitPrice: 20, currencyCode: 'IQD' } },
      ctx as never,
    )

    const result = await resolvers.Mutation.markRequisitionLineShort(
      null,
      { lineId, reason: 'vendor out of stock, no other source found' },
      ctx as never,
    )
    const r = result as { short_reason: string; short_marked_by: string; short_marked_at: string }
    expect(r.short_reason).toBe('vendor out of stock, no other source found')
    expect(r.short_marked_by).toBe(userId)
    expect(r.short_marked_at).toBeTruthy()

    await expect(
      resolvers.Mutation.recordLinePurchase(
        null,
        { input: { lineId, vendorId: vendorBId, qty: 1, actualUnitPrice: 20, currencyCode: 'IQD' } },
        ctx as never,
      ),
    ).rejects.toThrow(/marked short/i)
  })

  it('rejects marking short a line with nothing remaining to purchase', async () => {
    const { lineId } = await makeReqAtItemsBought({ qtyOrdered: 4, marketPrice: 15 })
    await resolvers.Mutation.recordLinePurchase(
      null,
      { input: { lineId, vendorId: vendorAId, qty: 4, actualUnitPrice: 15, currencyCode: 'IQD' } },
      ctx as never,
    )
    await expect(
      resolvers.Mutation.markRequisitionLineShort(null, { lineId, reason: 'n/a' }, ctx as never),
    ).rejects.toThrow(/nothing remaining/i)
  })

  it('requires a non-empty reason', async () => {
    const { lineId } = await makeReqAtItemsBought({ qtyOrdered: 2, marketPrice: 5 })
    await expect(
      resolvers.Mutation.markRequisitionLineShort(null, { lineId, reason: '  ' }, ctx as never),
    ).rejects.toThrow(/reason is required/i)
  })
})
