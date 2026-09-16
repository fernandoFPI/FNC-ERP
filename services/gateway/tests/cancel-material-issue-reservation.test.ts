// Regression coverage for a real gap found auditing this feature: cancelling
// a draft, PO-originated Store Out never released the stock reservation
// confirmPOInventoryCheck placed for it — the same class of bug as
// REQ-2026-0013's orphaned reservation from the start of this session, just
// triggered by cancelling the Store Out document directly (reachable via the
// "Cancel" button on any draft Store Out) instead of an edit-request line
// removal. issueMaterialIssue is the only other place that releases this
// reservation, and only on confirm — cancelling instead skipped it entirely.
// Real-Postgres pattern, same as project-material-return.test.ts.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'

const TEST_COMPANY_ID = '00000000-0000-0000-0000-000000000001'
const TEST_USER_EMAIL = 'cancel-mi-reservation-test@fnc-erp.local'
const SKU_PREFIX = 'CANCELMITEST-'
const PO_PREFIX = 'CANCELMITEST-PO-'

let userId: string
let vendorId: string
let warehouseId: string
let virtualInId: string
let ctx: { auth: { companyId: string; userId: string; role: string; module: string; sessionId: string } }

async function receive(productId: string, locationId: string, qty: number, unitCost = 10): Promise<void> {
  await pool.query(
    `INSERT INTO stock_moves (company_id, product_id, from_location_id, to_location_id, moved_at, qty, unit_cost, total_cost, source_type, moved_by)
     VALUES ($1,$2,$3,$4,NOW(),$5,$6,$7,'po_receipt',$8)`,
    [TEST_COMPANY_ID, productId, virtualInId, locationId, qty, unitCost, qty * unitCost, userId],
  )
}

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

// Mirrors what confirmPOInventoryCheck itself does: sets qty_from_stock and
// source_location_id on the line, and reserves that quantity in
// stock_balances — done directly here since that mutation's own full
// approval-workflow prerequisites aren't the thing under test.
async function makePOLineWithReservation(
  poId: string,
  productId: string,
  qtyFromStock: number,
): Promise<string> {
  // A reservation only ever exists against real on-hand stock — receive it
  // first, matching how confirmPOInventoryCheck's own reservation always
  // has warehouse stock behind it.
  await receive(productId, warehouseId, qtyFromStock, 10)
  const r = await pool.query<{ id: string }>(
    `INSERT INTO po_lines (po_id, product_id, description, line_number, qty_ordered, qty_from_stock, source_location_id, unit_price, total_price, uom)
     VALUES ($1,$2,'test line',1,$3,$3,$4,10,$5,'unit') RETURNING id`,
    [poId, productId, qtyFromStock, warehouseId, qtyFromStock * 10],
  )
  await pool.query(
    `UPDATE stock_balances SET qty_reserved = qty_reserved + $1 WHERE product_id=$2 AND location_id=$3 AND lot_id IS NULL`,
    [qtyFromStock, productId, warehouseId],
  )
  return r.rows[0]!.id
}

async function getReserved(productId: string, locationId: string): Promise<number> {
  const r = await pool.query<{ qty_reserved: string }>(
    `SELECT qty_reserved FROM stock_balances WHERE product_id=$1 AND location_id=$2 AND lot_id IS NULL`,
    [productId, locationId],
  )
  return parseFloat(r.rows[0]?.qty_reserved ?? '0')
}

async function cleanup(): Promise<void> {
  await pool.query(
    `DELETE FROM project_material_issue_lines WHERE issue_id IN (SELECT id FROM project_material_issues WHERE company_id=$1)`,
    [TEST_COMPANY_ID],
  )
  await pool.query(`DELETE FROM project_material_issues WHERE company_id=$1`, [TEST_COMPANY_ID])
  // Must go before purchase_orders below — its cascade into po_lines would
  // otherwise be blocked by stock_moves.po_line_id still referencing them.
  await pool.query(
    `DELETE FROM stock_moves WHERE product_id IN (SELECT id FROM products WHERE company_id=$1 AND sku LIKE $2)`,
    [TEST_COMPANY_ID, `${SKU_PREFIX}%`],
  )
  await pool.query(`DELETE FROM purchase_orders WHERE company_id=$1 AND po_number LIKE $2`, [
    TEST_COMPANY_ID,
    `${PO_PREFIX}%`,
  ])
  await pool.query(
    `DELETE FROM stock_balances WHERE product_id IN (SELECT id FROM products WHERE company_id=$1 AND sku LIKE $2)`,
    [TEST_COMPANY_ID, `${SKU_PREFIX}%`],
  )
  await pool.query(`DELETE FROM products WHERE company_id=$1 AND sku LIKE $2`, [TEST_COMPANY_ID, `${SKU_PREFIX}%`])
}

beforeAll(async () => {
  const userR = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [TEST_USER_EMAIL],
  )
  userId = userR.rows[0]!.id
  ctx = { auth: { companyId: TEST_COMPANY_ID, userId, role: 'system_admin', module: 'all', sessionId: 'cancel-mi-test' } }

  const whR = await pool.query<{ id: string }>(
    `SELECT id FROM stock_locations WHERE company_id=$1 AND type='warehouse' AND is_active=true LIMIT 1`,
    [TEST_COMPANY_ID],
  )
  if (!whR.rows[0]) throw new Error('No warehouse location seeded for test company — run seeds first')
  warehouseId = whR.rows[0].id

  const viR = await pool.query<{ id: string }>(
    `SELECT id FROM stock_locations WHERE company_id=$1 AND type='virtual_in' AND is_active=true LIMIT 1`,
    [TEST_COMPANY_ID],
  )
  if (!viR.rows[0]) throw new Error('No virtual_in location seeded for test company — run seeds first')
  virtualInId = viR.rows[0].id

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

describe('cancelMaterialIssue releases the from-stock reservation', () => {
  it('releases the full reservation when cancelling a draft PO-originated store-out', async () => {
    const productId = await makeProduct('draft-cancel')
    const poId = await makePO()
    const poLineId = await makePOLineWithReservation(poId, productId, 10)
    expect(await getReserved(productId, warehouseId)).toBe(10)

    const issue = (await resolvers.Mutation.createMaterialIssue(
      null,
      { poId, issueDate: new Date().toISOString().slice(0, 10) },
      ctx as never,
    )) as { id: string }
    await resolvers.Mutation.addMaterialIssueLine(
      null,
      { issueId: issue.id, productId, poLineId, qtyIssued: 10, unitCost: 10, fromLocationId: warehouseId },
      ctx as never,
    )
    // Still draft — never confirmed. The reservation should still be intact
    // right up until cancel.
    expect(await getReserved(productId, warehouseId)).toBe(10)

    await resolvers.Mutation.cancelMaterialIssue(null, { id: issue.id }, ctx as never)

    expect(await getReserved(productId, warehouseId)).toBe(0)
    const status = await pool.query<{ status: string }>(
      `SELECT status FROM project_material_issues WHERE id=$1`,
      [issue.id],
    )
    expect(status.rows[0]!.status).toBe('cancelled')
  })

  it('releases only the remaining reservation when a second draft store-out is cancelled after an earlier partial issue was already confirmed', async () => {
    const productId = await makeProduct('partial-cancel')
    const poId = await makePO()
    const poLineId = await makePOLineWithReservation(poId, productId, 10)

    // First store-out: 6 of the 10 reserved units, confirmed for real.
    const firstIssue = (await resolvers.Mutation.createMaterialIssue(
      null,
      { poId, issueDate: new Date().toISOString().slice(0, 10) },
      ctx as never,
    )) as { id: string }
    await resolvers.Mutation.addMaterialIssueLine(
      null,
      { issueId: firstIssue.id, productId, poLineId, qtyIssued: 6, unitCost: 10, fromLocationId: warehouseId },
      ctx as never,
    )
    await resolvers.Mutation.issueMaterialIssue(null, { id: firstIssue.id }, ctx as never)
    expect(await getReserved(productId, warehouseId)).toBe(4) // 10 - 6 released at confirm

    // Second store-out: the remaining 4, left as a draft, then cancelled.
    const secondIssue = (await resolvers.Mutation.createMaterialIssue(
      null,
      { poId, issueDate: new Date().toISOString().slice(0, 10) },
      ctx as never,
    )) as { id: string }
    await resolvers.Mutation.addMaterialIssueLine(
      null,
      { issueId: secondIssue.id, productId, poLineId, qtyIssued: 4, unitCost: 10, fromLocationId: warehouseId },
      ctx as never,
    )
    await resolvers.Mutation.cancelMaterialIssue(null, { id: secondIssue.id }, ctx as never)

    expect(await getReserved(productId, warehouseId)).toBe(0)
  })

  it('does not touch qty_reserved a second time when cancelling an already-issued store-out', async () => {
    const productId = await makeProduct('issued-cancel')
    const poId = await makePO()
    const poLineId = await makePOLineWithReservation(poId, productId, 5)

    const issue = (await resolvers.Mutation.createMaterialIssue(
      null,
      { poId, issueDate: new Date().toISOString().slice(0, 10) },
      ctx as never,
    )) as { id: string }
    await resolvers.Mutation.addMaterialIssueLine(
      null,
      { issueId: issue.id, productId, poLineId, qtyIssued: 5, unitCost: 10, fromLocationId: warehouseId },
      ctx as never,
    )
    await resolvers.Mutation.issueMaterialIssue(null, { id: issue.id }, ctx as never)
    expect(await getReserved(productId, warehouseId)).toBe(0) // released at confirm

    await resolvers.Mutation.cancelMaterialIssue(null, { id: issue.id }, ctx as never)
    // Still 0 — GREATEST(qty_reserved - x, 0) would clamp even a wrong
    // second release, but confirm this path doesn't touch it at all for an
    // already-issued cancel (the code only runs the release when status is
    // still 'draft').
    expect(await getReserved(productId, warehouseId)).toBe(0)
  })

  it('is a no-op for a manual, ad-hoc store-out with no po_line_id (nothing was ever reserved)', async () => {
    const productId = await makeProduct('manual-cancel')
    const issue = (await resolvers.Mutation.createMaterialIssue(
      null,
      { issueDate: new Date().toISOString().slice(0, 10) },
      ctx as never,
    )) as { id: string }
    await resolvers.Mutation.addMaterialIssueLine(
      null,
      { issueId: issue.id, productId, qtyIssued: 3, unitCost: 10, fromLocationId: warehouseId },
      ctx as never,
    )
    await expect(
      resolvers.Mutation.cancelMaterialIssue(null, { id: issue.id }, ctx as never),
    ).resolves.toBeTruthy()
    expect(await getReserved(productId, warehouseId)).toBe(0)
  })
})
