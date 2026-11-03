// A requisition line keeps its price in four places: unit_price (what the total is built from),
// market_price and verified_price (what the Market pricing and Price verification stages recorded,
// and what the Lines table shows) and approved_unit_price (frozen at approval; the ceiling that
// Items Bought judges every purchase against, plus the company's tolerance).
//
// Regression: approving an edit request that changed a line's unit price updated unit_price and the
// total and nothing else (applyRequisitionEditChanges; the PO side already fixed the same thing for
// market_price). REQ-2026-0057 (Al Watanyia): 148 -> 145 approved, and the line still said 148 under
// Market price and Verified price. Worse, REQ-2026-0077 (Nishtimani Factory): 58,000 -> 64,000
// approved, and the buyer's purchase at exactly 64,000 was flagged over tolerance against the stale
// 58,000, so an approved price needed a second approval; and a price DROP left the old, higher
// ceiling in place.
//
// Real Postgres, real mutations (createRequisition, submitPOEditRequest, approvePOEditRequest,
// recordLinePurchase); nothing mocked.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'

const TEST_COMPANY_ID = '00000000-0000-0000-0000-000000000001'
const EMAIL_PREFIX = 'req-price-edit-test-'
const SKU_PREFIX = 'RPETEST-'
const VENDOR_PREFIX = 'RPETEST Vendor '

let requesterId: string
let adminId: string
let vendorId: string
let toleranceBefore: { tolerance_pct: string; tolerance_abs: string; is_provisional: boolean } | null = null

const ctxFor = (userId: string, role: string) =>
  ({
    auth: { companyId: TEST_COMPANY_ID, userId, role, module: 'all', sessionId: 'rpe-test' },
  }) as never

async function makeUser(key: string, first: string, last: string): Promise<string> {
  const r = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, first_name, last_name) VALUES ($1,'test-hash-not-used',$2,$3)
     ON CONFLICT (email) DO UPDATE SET first_name=EXCLUDED.first_name, last_name=EXCLUDED.last_name RETURNING id`,
    [`${EMAIL_PREFIX}${key}@fnc-erp.local`, first, last],
  )
  return r.rows[0]!.id
}

interface StageValues {
  market?: number | null
  verified?: number | null
  approved?: number | null
}

// One-line requisition (IQD, nothing from stock) forced to `status`, with the stage records a line
// would really hold at that point: pass only the ones it has reached.
async function makeRequisition(
  status: string,
  qty: number,
  unitPrice: number,
  stage: StageValues,
): Promise<{ reqId: string; lineId: string }> {
  const sku = `${SKU_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const prod = await pool.query<{ id: string }>(
    `INSERT INTO products (company_id, sku, name, uom, category) VALUES ($1,$2,$2,'unit','general') RETURNING id`,
    [TEST_COMPANY_ID, sku],
  )
  const created = (await resolvers.Mutation.createRequisition(
    null,
    { input: { purpose: 'stock', lines: [{ product_id: prod.rows[0]!.id, description: 'Steel shelving', qty, unit_price: unitPrice }] } },
    ctxFor(requesterId, 'system_admin'),
  )) as { id: string }
  await pool.query(`UPDATE requisitions SET status=$1 WHERE id=$2`, [status, created.id])
  const line = await pool.query<{ id: string }>(`SELECT id FROM po_lines WHERE requisition_id=$1`, [created.id])
  const lineId = line.rows[0]!.id
  await pool.query(
    `UPDATE po_lines SET unit_price=$2, total_price=$3, market_price=$4, verified_price=$5, approved_unit_price=$6 WHERE id=$1`,
    [lineId, unitPrice, qty * unitPrice, stage.market ?? null, stage.verified ?? null, stage.approved ?? null],
  )
  return { reqId: created.id, lineId }
}

interface PriceFields {
  unit_price: string
  market_price: string | null
  verified_price: string | null
  approved_unit_price: string | null
  total_price: string
  qty_ordered: string
}
const priceFields = async (lineId: string): Promise<PriceFields> =>
  (
    await pool.query<PriceFields>(
      `SELECT unit_price, market_price, verified_price, approved_unit_price, total_price, qty_ordered FROM po_lines WHERE id=$1`,
      [lineId],
    )
  ).rows[0]!
const num = (v: string | null) => (v == null ? null : Number(v))

// requester submits, and (when the requisition is already approved) an admin reviews it: the real route.
async function editLine(reqId: string, lineId: string, field: string, from: number, to: number, approveAsAdmin: boolean) {
  const submitted = (await resolvers.Mutation.submitPOEditRequest(
    null,
    { requisitionId: reqId, changes: JSON.stringify({ lines: { edited: [{ id: lineId, field, from, to }] } }) } as never,
    ctxFor(requesterId, 'user'),
  )) as { id: string; status: string }
  if (approveAsAdmin) {
    expect(submitted.status).toBe('pending')
    await resolvers.Mutation.approvePOEditRequest(null, { requisitionId: reqId, requestId: submitted.id } as never, ctxFor(adminId, 'system_admin'))
  } else {
    expect(submitted.status).toBe('approved') // auto-applied: the requisition is not approved yet
  }
}

const buy = (lineId: string, qty: number, price: number) =>
  resolvers.Mutation.recordLinePurchase(
    null,
    { input: { lineId, vendorId, qty, actualUnitPrice: price, currencyCode: 'IQD' } },
    ctxFor(adminId, 'system_admin'),
  )
const overTolerance = async (lineId: string): Promise<boolean> =>
  (await pool.query<{ over_tolerance: boolean }>(`SELECT over_tolerance FROM po_line_purchases WHERE po_line_id=$1`, [lineId])).rows[0]!.over_tolerance

async function cleanup(): Promise<void> {
  const reqs = `SELECT id FROM requisitions WHERE company_id=$1 AND organizer_id IN (SELECT id FROM users WHERE email LIKE $2)`
  const args = [TEST_COMPANY_ID, `${EMAIL_PREFIX}%`]
  await pool.query(`DELETE FROM po_edit_requests WHERE requisition_id IN (${reqs})`, args)
  await pool.query(`DELETE FROM requisition_approval_log WHERE requisition_id IN (${reqs})`, args)
  await pool.query(`DELETE FROM po_line_purchases WHERE po_line_id IN (SELECT id FROM po_lines WHERE requisition_id IN (${reqs}))`, args)
  await pool.query(`DELETE FROM po_lines WHERE requisition_id IN (${reqs})`, args)
  await pool.query(`DELETE FROM requisitions WHERE id IN (${reqs})`, args)
  await pool.query(`DELETE FROM products WHERE company_id=$1 AND sku LIKE $2`, [TEST_COMPANY_ID, `${SKU_PREFIX}%`])
  await pool.query(`DELETE FROM vendors WHERE company_id=$1 AND name LIKE $2`, [TEST_COMPANY_ID, `${VENDOR_PREFIX}%`])
}

beforeAll(async () => {
  requesterId = await makeUser('requester', 'Yazin', 'Requester')
  adminId = await makeUser('admin', 'Nadia', 'Admin')
  await cleanup()
  vendorId = (
    await pool.query<{ id: string }>(`INSERT INTO vendors (company_id, name) VALUES ($1,$2) RETURNING id`, [
      TEST_COMPANY_ID,
      `${VENDOR_PREFIX}${Date.now()}`,
    ])
  ).rows[0]!.id
  // The tolerance Al Watanyia / Factory / Yakam really have for IQD (5 % up to 25,000), put back afterwards.
  toleranceBefore =
    (
      await pool.query(`SELECT tolerance_pct, tolerance_abs, is_provisional FROM company_price_tolerance WHERE company_id=$1 AND currency_code='IQD'`, [
        TEST_COMPANY_ID,
      ])
    ).rows[0] ?? null
  await pool.query(
    `INSERT INTO company_price_tolerance (company_id, currency_code, tolerance_pct, tolerance_abs, is_provisional)
     VALUES ($1,'IQD',5,25000,true)
     ON CONFLICT (company_id, currency_code) DO UPDATE SET tolerance_pct=5, tolerance_abs=25000`,
    [TEST_COMPANY_ID],
  )
})

afterAll(async () => {
  await cleanup()
  if (toleranceBefore) {
    await pool.query(
      `UPDATE company_price_tolerance SET tolerance_pct=$2, tolerance_abs=$3, is_provisional=$4 WHERE company_id=$1 AND currency_code='IQD'`,
      [TEST_COMPANY_ID, toleranceBefore.tolerance_pct, toleranceBefore.tolerance_abs, toleranceBefore.is_provisional],
    )
  } else {
    await pool.query(`DELETE FROM company_price_tolerance WHERE company_id=$1 AND currency_code='IQD'`, [TEST_COMPANY_ID])
  }
  await pool.query(`DELETE FROM users WHERE email LIKE $1`, [`${EMAIL_PREFIX}%`]).catch(() => undefined)
  await pool.end()
})

describe('an approved price edit on an approved requisition keeps every price record in step', () => {
  it('moves market, verified and approved price with the unit price, and rebuilds the total', async () => {
    // REQ-2026-0057: 148 -> 145 on 8 pieces (USD there; the rule is the same in IQD).
    const { reqId, lineId } = await makeRequisition('approved', 8, 148000, { market: 148000, verified: 148000, approved: 148000 })
    await editLine(reqId, lineId, 'unit_price', 148000, 145000, true)
    const p = await priceFields(lineId)
    expect(num(p.unit_price)).toBe(145000)
    expect(num(p.market_price)).toBe(145000)
    expect(num(p.verified_price)).toBe(145000)
    expect(num(p.approved_unit_price)).toBe(145000)
    expect(num(p.total_price)).toBe(8 * 145000)
  })

  it('a raised price bought at exactly the new price is NOT flagged over tolerance (REQ-2026-0077)', async () => {
    // 58,000 -> 64,000. Against the stale 58,000 the ceiling is 58,000 + 2,900 = 60,900 and 64,000 was flagged.
    const { reqId, lineId } = await makeRequisition('approved', 20, 58000, { market: 58000, verified: 58000, approved: 58000 })
    await editLine(reqId, lineId, 'unit_price', 58000, 64000, true)
    await pool.query(`UPDATE requisitions SET status='items_bought' WHERE id=$1`, [reqId])
    await buy(lineId, 20, 64000)
    expect(await overTolerance(lineId)).toBe(false)
  })

  it('a lowered price is judged against the NEW price, not the old higher ceiling', async () => {
    // 3,500 -> 2,000. Old ceiling 3,500 + 175 = 3,675 let a purchase at 3,400 through unflagged.
    const { reqId, lineId } = await makeRequisition('approved', 3, 3500, { market: 3500, verified: 3500, approved: 3500 })
    await editLine(reqId, lineId, 'unit_price', 3500, 2000, true)
    await pool.query(`UPDATE requisitions SET status='items_bought' WHERE id=$1`, [reqId])
    await buy(lineId, 3, 3400)
    expect(await overTolerance(lineId)).toBe(true) // 3,400 > 2,000 + 100
  })

  it('a purchase inside the tolerance of the new price is still accepted', async () => {
    const { reqId, lineId } = await makeRequisition('approved', 3, 3500, { market: 3500, verified: 3500, approved: 3500 })
    await editLine(reqId, lineId, 'unit_price', 3500, 2000, true)
    await pool.query(`UPDATE requisitions SET status='items_bought' WHERE id=$1`, [reqId])
    await buy(lineId, 3, 2050)
    expect(await overTolerance(lineId)).toBe(false)
  })
})

describe('only the price records a line already has are moved', () => {
  it('before approval (auto-applied) it invents no market, verified or approved price', async () => {
    // A draft-stage price is an estimate. Giving the line a "market price" would also pre-fill the
    // Market pricing form later, which reads the line's saved market_price.
    const { reqId, lineId } = await makeRequisition('inventory_check', 5, 1000, {})
    await editLine(reqId, lineId, 'unit_price', 1000, 1200, false)
    const p = await priceFields(lineId)
    expect(num(p.unit_price)).toBe(1200)
    expect(num(p.total_price)).toBe(5 * 1200)
    expect(p.market_price).toBeNull()
    expect(p.verified_price).toBeNull()
    expect(p.approved_unit_price).toBeNull()
  })

  it('at price verification only the market price (which exists) follows; verified and approved stay empty', async () => {
    const { reqId, lineId } = await makeRequisition('price_verification', 5, 1000, { market: 1000 })
    await editLine(reqId, lineId, 'unit_price', 1000, 1100, false)
    const p = await priceFields(lineId)
    expect(num(p.unit_price)).toBe(1100)
    expect(num(p.market_price)).toBe(1100)
    expect(p.verified_price).toBeNull()
    expect(p.approved_unit_price).toBeNull()
  })

  it('an edit to the quantity leaves every price record alone', async () => {
    const { reqId, lineId } = await makeRequisition('approved', 20, 58000, { market: 58000, verified: 58000, approved: 58000 })
    await editLine(reqId, lineId, 'qty_ordered', 20, 10, true)
    const p = await priceFields(lineId)
    expect(num(p.qty_ordered)).toBe(10)
    expect(num(p.market_price)).toBe(58000)
    expect(num(p.verified_price)).toBe(58000)
    expect(num(p.approved_unit_price)).toBe(58000)
    expect(num(p.total_price)).toBe(10 * 58000)
  })
})
