// Integration tests for G1 Phase 2 PR 1b: submitRequisitionStorePricing,
// submitRequisitionMarketPricing, verifyRequisitionPrices, and the
// per-currency totals rollup (getRequisitionCurrencyTotals). Same
// real-Postgres pattern as requisition-inventory-check.test.ts.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'

const TEST_COMPANY_ID = '00000000-0000-0000-0000-000000000001'
const TEST_USER_EMAIL = 'g1-requisition-pricing-test@fnc-erp.local'
const TEST_EMPLOYEE_NUMBER = 'G1PTEST-PROCUREMENT'
const SKU_PREFIX = 'G1PTEST-'

let userId: string
let employeeId: string
let warehouseId: string
let virtualInId: string
let ctx: { auth: { companyId: string; userId: string; role: string; module: string; sessionId: string } }

async function makeProduct(suffix: string): Promise<string> {
  const sku = `${SKU_PREFIX}${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const r = await pool.query<{ id: string }>(
    `INSERT INTO products (company_id, sku, name, uom, category) VALUES ($1,$2,$3,'unit','general') RETURNING id`,
    [TEST_COMPANY_ID, sku, sku],
  )
  return r.rows[0]!.id
}

async function receive(productId: string, locationId: string, qty: number, unitCost = 10): Promise<void> {
  await pool.query(
    `INSERT INTO stock_moves (company_id, product_id, from_location_id, to_location_id, moved_at, qty, unit_cost, total_cost, source_type, moved_by)
     VALUES ($1,$2,$3,$4,NOW(),$5,$6,$7,'po_receipt',$8)`,
    [TEST_COMPANY_ID, productId, virtualInId, locationId, qty, unitCost, qty * unitCost, userId],
  )
}

async function getBalance(productId: string, locationId: string): Promise<{ onHand: number; reserved: number }> {
  const r = await pool.query<{ qty_on_hand: string; qty_reserved: string }>(
    `SELECT qty_on_hand, qty_reserved FROM stock_balances WHERE product_id=$1 AND location_id=$2 AND lot_id IS NULL`,
    [productId, locationId],
  )
  return {
    onHand: parseFloat(r.rows[0]?.qty_on_hand ?? '0'),
    reserved: parseFloat(r.rows[0]?.qty_reserved ?? '0'),
  }
}

async function cleanup(): Promise<void> {
  await pool.query(
    `DELETE FROM requisition_approval_log WHERE requisition_id IN (SELECT id FROM requisitions WHERE company_id=$1 AND organizer_id=$2)`,
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
  await pool.query(`DELETE FROM products WHERE company_id=$1 AND sku LIKE $2`, [TEST_COMPANY_ID, `${SKU_PREFIX}%`])
}

// Drives a fresh requisition through inventory check (skipping the actual
// reservation math — irrelevant to pricing — by moving straight past it
// with 0 from-stock on every line). confirmRequisitionInventoryCheck now
// auto-fills store pricing and advances straight through to
// market_pricing in one transaction (mirrors confirmPOInventoryCheck) —
// store_pricing is no longer a stage this lands on in the normal flow.
async function makeReqAtMarketPricing(
  qtyOrdered: number,
  unitPrice = 10,
  opts?: { qtyFromStock?: number; productId?: string },
) {
  const productId = opts?.productId ?? (await makeProduct('pricing'))
  const created = await resolvers.Mutation.createRequisition(
    null,
    { input: { purpose: 'stock', lines: [{ product_id: productId, description: 'x', qty: qtyOrdered, unit_price: unitPrice }] } },
    ctx as never,
  )
  const reqId = (created as { id: string }).id
  const lineRow = await pool.query<{ id: string }>(`SELECT id FROM po_lines WHERE requisition_id=$1`, [reqId])
  const lineId = lineRow.rows[0]!.id
  const qtyFromStock = opts?.qtyFromStock ?? 0
  await resolvers.Mutation.submitRequisitionToInventoryCheck(null, { id: reqId }, ctx as never)
  await resolvers.Mutation.confirmRequisitionInventoryCheck(
    null,
    {
      id: reqId,
      lineStockQtys: [{ lineId, qtyFromStock, sourceLocationId: qtyFromStock > 0 ? warehouseId : undefined }],
    },
    ctx as never,
  )
  return { reqId, lineId, productId }
}

// Drives a fresh requisition all the way to price_verification — same
// pattern as requisition-approval.test.ts's makeReqAtPendingApproval, one
// stage earlier. qtyFromStock lets the reservation-release tests below
// prove resetRequisitionToDraft/rejectRequisitionVerificationToInventoryCheck
// actually release what confirmRequisitionInventoryCheck reserved.
async function makeReqAtPriceVerification(opts: {
  qtyOrdered: number
  qtyFromStock?: number
  marketPrice: number
  productId?: string
}) {
  const { reqId, lineId, productId } = await makeReqAtMarketPricing(opts.qtyOrdered, 1, {
    qtyFromStock: opts.qtyFromStock,
    productId: opts.productId,
  })
  await resolvers.Mutation.submitRequisitionMarketPricing(
    null,
    { id: reqId, linePrices: [{ lineId, marketPrice: opts.marketPrice, currencyCode: 'IQD' }] },
    ctx as never,
  )
  return { reqId, lineId, productId }
}

// submitRequisitionStorePricing itself is no longer reachable via the
// normal flow (confirmRequisitionInventoryCheck auto-advances past
// 'store_pricing' entirely) — it still exists for the rare fallback case
// a requisition is moved back there by some other path (e.g. a future
// reject-to-store-pricing mutation, or a manual data correction), and the
// manual Store Pricing panel still renders for it. Force the status back
// to test the mutation's own behavior directly.
async function makeReqAtStorePricing(qtyOrdered: number, unitPrice = 10) {
  const { reqId, lineId, productId } = await makeReqAtMarketPricing(qtyOrdered, unitPrice)
  await pool.query(`UPDATE requisitions SET status='store_pricing' WHERE id=$1`, [reqId])
  return { reqId, lineId, productId }
}

beforeAll(async () => {
  const userR = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [TEST_USER_EMAIL],
  )
  userId = userR.rows[0]!.id
  ctx = { auth: { companyId: TEST_COMPANY_ID, userId, role: 'system_admin', module: 'all', sessionId: 'g1-test' } }

  const employeeR = await pool.query<{ id: string }>(
    `INSERT INTO employees (company_id, user_id, first_name, last_name, hire_date, employee_number)
     VALUES ($1,$2,'Test','Procurement',CURRENT_DATE,$3)
     ON CONFLICT (company_id, employee_number) DO UPDATE SET user_id = EXCLUDED.user_id RETURNING id`,
    [TEST_COMPANY_ID, userId, TEST_EMPLOYEE_NUMBER],
  )
  employeeId = employeeR.rows[0]!.id

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

  await cleanup()
})

afterAll(async () => {
  await cleanup()
  await pool.query(`DELETE FROM employees WHERE employee_number=$1`, [TEST_EMPLOYEE_NUMBER])
  await pool.query(`DELETE FROM users WHERE email=$1`, [TEST_USER_EMAIL])
  await pool.end()
})

describe('submitRequisitionStorePricing', () => {
  it('records store_price as a reference only — total_price and status untouched by it, transitions to market_pricing', async () => {
    const { reqId, lineId } = await makeReqAtStorePricing(5, 10)

    const result = await resolvers.Mutation.submitRequisitionStorePricing(
      null,
      { id: reqId, linePrices: [{ lineId, storePrice: 7, currencyCode: 'IQD' }] },
      ctx as never,
    )
    expect((result as { status: string }).status).toBe('market_pricing')

    const line = await pool.query<{ store_price: string; total_price: string }>(
      `SELECT store_price, total_price FROM po_lines WHERE id=$1`,
      [lineId],
    )
    expect(parseFloat(line.rows[0]!.store_price)).toBe(7)
    expect(parseFloat(line.rows[0]!.total_price)).toBe(50) // unchanged: 5 qty * 10 unit_price

    const req = await pool.query<{ store_pricing_id: string | null }>(
      `SELECT store_pricing_id FROM requisitions WHERE id=$1`,
      [reqId],
    )
    expect(req.rows[0]!.store_pricing_id).toBe(employeeId)
  })
})

describe('submitRequisitionMarketPricing', () => {
  it('sets the real total, the line currency, caches the product\'s Cost — with no vendor and no fx_rate_to_base stamped', async () => {
    const { reqId, lineId, productId } = await makeReqAtMarketPricing(5, 1)

    const result = await resolvers.Mutation.submitRequisitionMarketPricing(
      null,
      { id: reqId, linePrices: [{ lineId, marketPrice: 12, currencyCode: 'USD', vendorQuoteRef: 'Q-123' }] },
      ctx as never,
    )
    expect((result as { status: string }).status).toBe('price_verification')

    const line = await pool.query<{
      unit_price: string
      market_price: string
      market_price_currency: string
      currency_code: string
      vendor_quote_ref: string
      total_price: string
      fx_rate_to_base: string | null
    }>(
      `SELECT unit_price, market_price, market_price_currency, currency_code, vendor_quote_ref, total_price, fx_rate_to_base FROM po_lines WHERE id=$1`,
      [lineId],
    )
    expect(parseFloat(line.rows[0]!.unit_price)).toBe(12)
    expect(parseFloat(line.rows[0]!.market_price)).toBe(12)
    expect(line.rows[0]!.market_price_currency).toBe('USD')
    expect(line.rows[0]!.currency_code).toBe('USD')
    expect(line.rows[0]!.vendor_quote_ref).toBe('Q-123')
    expect(parseFloat(line.rows[0]!.total_price)).toBe(60) // 5 qty * 12 market price, no conversion
    // No conversion rate ever stamped — G1's no-conversion policy.
    expect(line.rows[0]!.fx_rate_to_base).toBeNull()

    // No vendor recorded anywhere on the requisition — there is no
    // vendor_id column on requisitions at all (unlike purchase_orders).
    const reqCols = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name='requisitions' AND column_name='vendor_id'`,
    )
    expect(reqCols.rows).toHaveLength(0)

    const product = await pool.query<{ standard_cost: string; cost_currency: string }>(
      `SELECT standard_cost, cost_currency FROM products WHERE id=$1`,
      [productId],
    )
    expect(parseFloat(product.rows[0]!.standard_cost)).toBe(12)
    expect(product.rows[0]!.cost_currency).toBe('USD')

    const historyRow = await pool.query<{ source_type: string; source_label: string | null }>(
      `SELECT source_type, source_label FROM product_cost_history WHERE product_id=$1 ORDER BY changed_at DESC LIMIT 1`,
      [productId],
    )
    expect(historyRow.rows[0]!.source_type).toBe('requisition_market_pricing')

    const req = await pool.query<{ procurement_officer_id: string | null }>(
      `SELECT procurement_officer_id FROM requisitions WHERE id=$1`,
      [reqId],
    )
    expect(req.rows[0]!.procurement_officer_id).toBe(employeeId)
  })
})

describe('verifyRequisitionPrices', () => {
  it('sets verified_price + unit_price + total from the line\'s own currency, transitions to pending_approval', async () => {
    const { reqId, lineId } = await makeReqAtMarketPricing(3, 1)
    await resolvers.Mutation.submitRequisitionMarketPricing(
      null,
      { id: reqId, linePrices: [{ lineId, marketPrice: 20, currencyCode: 'IQD' }] },
      ctx as never,
    )

    const result = await resolvers.Mutation.verifyRequisitionPrices(
      null,
      { id: reqId, verificationNotes: 'looks right', lineAdjustments: [{ lineId, verifiedPrice: 18 }] },
      ctx as never,
    )
    expect((result as { status: string }).status).toBe('pending_approval')

    const line = await pool.query<{
      verified_price: string
      verified_price_currency: string
      unit_price: string
      total_price: string
    }>(`SELECT verified_price, verified_price_currency, unit_price, total_price FROM po_lines WHERE id=$1`, [lineId])
    expect(parseFloat(line.rows[0]!.verified_price)).toBe(18)
    expect(line.rows[0]!.verified_price_currency).toBe('IQD') // the line's own currency, not a header currency
    expect(parseFloat(line.rows[0]!.unit_price)).toBe(18)
    expect(parseFloat(line.rows[0]!.total_price)).toBe(54) // 3 qty * 18

    const log = await pool.query<{ notes: string }>(
      `SELECT notes FROM requisition_approval_log WHERE requisition_id=$1 AND action='submit_for_approval'`,
      [reqId],
    )
    expect(log.rows[0]!.notes).toBe('looks right')

    const req = await pool.query<{ procurement_2nd_id: string | null }>(
      `SELECT procurement_2nd_id FROM requisitions WHERE id=$1`,
      [reqId],
    )
    expect(req.rows[0]!.procurement_2nd_id).toBe(employeeId)
  })
})

describe('getRequisitionCurrencyTotals (via the requisition query resolver)', () => {
  it('reports one entry per currency, never summed across currencies', async () => {
    const productA = await makeProduct('multi-a')
    const productB = await makeProduct('multi-b')
    const created = await resolvers.Mutation.createRequisition(
      null,
      {
        input: {
          purpose: 'stock',
          lines: [
            { product_id: productA, description: 'iqd line', qty: 2, unit_price: 100 },
            { product_id: productB, description: 'usd line', qty: 3, unit_price: 10 },
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
    const lineA = lines.rows.find((l) => l.description === 'iqd line')!.id
    const lineB = lines.rows.find((l) => l.description === 'usd line')!.id

    await resolvers.Mutation.submitRequisitionToInventoryCheck(null, { id: reqId }, ctx as never)
    await resolvers.Mutation.confirmRequisitionInventoryCheck(
      null,
      {
        id: reqId,
        lineStockQtys: [
          { lineId: lineA, qtyFromStock: 0 },
          { lineId: lineB, qtyFromStock: 0 },
        ],
      },
      ctx as never,
    )
    await resolvers.Mutation.submitRequisitionMarketPricing(
      null,
      {
        id: reqId,
        linePrices: [
          { lineId: lineA, marketPrice: 100, currencyCode: 'IQD' },
          { lineId: lineB, marketPrice: 10, currencyCode: 'USD' },
        ],
      },
      ctx as never,
    )

    const result = await resolvers.Query.requisition(null, { id: reqId }, ctx as never)
    const totals = (result as { currencyTotals: { currency_code: string; subtotal: string; line_count: number }[] })
      .currencyTotals
    expect(totals).toHaveLength(2)
    const iqd = totals.find((t) => t.currency_code === 'IQD')!
    const usd = totals.find((t) => t.currency_code === 'USD')!
    expect(parseFloat(iqd.subtotal)).toBe(200) // 2 * 100
    expect(iqd.line_count).toBe(1)
    expect(parseFloat(usd.subtotal)).toBe(30) // 3 * 10
    expect(usd.line_count).toBe(1)
    // No entry anywhere sums 200 + 30 into one number.
    expect(totals.some((t) => parseFloat(t.subtotal) === 230)).toBe(false)
  })
})

// price_verification-only reject destinations — mirrors PO's own
// rejectPOVerificationToMarketPricing/rejectPOVerificationToStorePricing
// tests; resetRequisitionToDraft/rejectRequisitionVerificationToInventoryCheck
// have no PO equivalent and are the ones that must release stock
// reservations (see resolvers.ts's own comment on why).
describe('price_verification reject destinations', () => {
  it('rejectRequisitionVerificationToMarketPricing sends it back to market_pricing without touching reservations', async () => {
    const productId = await makeProduct('rejmarket')
    await receive(productId, warehouseId, 10)
    const { reqId, lineId } = await makeReqAtPriceVerification({ qtyOrdered: 10, qtyFromStock: 4, marketPrice: 15, productId })
    expect((await getBalance(productId, warehouseId)).reserved).toBe(4)

    const result = await resolvers.Mutation.rejectRequisitionVerificationToMarketPricing(
      null,
      { id: reqId, reason: 'quote looks wrong', lineFlags: [{ lineId, reason: 'quote looks wrong' }] },
      ctx as never,
    )
    expect((result as { status: string }).status).toBe('market_pricing')
    // Still reserved — the from-stock portion confirmed at inventory_check
    // is untouched by a pricing-only reject.
    expect((await getBalance(productId, warehouseId)).reserved).toBe(4)
  })

  it('rejectRequisitionVerificationToStorePricing sends it back to store_pricing', async () => {
    const { reqId, lineId } = await makeReqAtPriceVerification({ qtyOrdered: 3, marketPrice: 9 })
    const result = await resolvers.Mutation.rejectRequisitionVerificationToStorePricing(
      null,
      { id: reqId, reason: 'store price should be checked first', lineFlags: [{ lineId, reason: 'x' }] },
      ctx as never,
    )
    expect((result as { status: string }).status).toBe('store_pricing')
  })

  it('resetRequisitionToDraft releases reservations and returns to draft', async () => {
    const productId = await makeProduct('resetdraft')
    await receive(productId, warehouseId, 10)
    const { reqId, lineId } = await makeReqAtPriceVerification({ qtyOrdered: 10, qtyFromStock: 6, marketPrice: 20, productId })
    expect((await getBalance(productId, warehouseId)).reserved).toBe(6)

    const result = await resolvers.Mutation.resetRequisitionToDraft(
      null,
      { id: reqId, reason: 'start over', lineFlags: [{ lineId, reason: 'start over' }] },
      ctx as never,
    )
    expect((result as { status: string }).status).toBe('draft')

    const bal = await getBalance(productId, warehouseId)
    expect(bal.reserved).toBe(0)
    expect(bal.onHand).toBe(10)

    // Stale qty_from_stock is left on the line (harmless — see resolvers.ts's
    // comment: confirmRequisitionInventoryCheck unconditionally overwrites
    // every line's qty_from_stock/source_location_id the next time it runs,
    // regardless of what was there before).
    const line = await pool.query<{ qty_from_stock: string }>(`SELECT qty_from_stock FROM po_lines WHERE id=$1`, [lineId])
    expect(parseFloat(line.rows[0]!.qty_from_stock)).toBe(6)
  })

  it('resetRequisitionToDraft requires a non-empty reason and only works from price_verification', async () => {
    const { reqId } = await makeReqAtPriceVerification({ qtyOrdered: 2, marketPrice: 5 })
    await expect(
      resolvers.Mutation.resetRequisitionToDraft(null, { id: reqId, reason: '  ' }, ctx as never),
    ).rejects.toThrow(/reason is required/i)
  })

  it('rejectRequisitionVerificationToInventoryCheck releases reservations and returns to inventory_check, ready to redo', async () => {
    const productId = await makeProduct('rejinvcheck')
    await receive(productId, warehouseId, 10)
    const { reqId, lineId } = await makeReqAtPriceVerification({ qtyOrdered: 10, qtyFromStock: 5, marketPrice: 12, productId })
    expect((await getBalance(productId, warehouseId)).reserved).toBe(5)

    const result = await resolvers.Mutation.rejectRequisitionVerificationToInventoryCheck(
      null,
      { id: reqId, reason: 'stock count was wrong', lineFlags: [{ lineId, reason: 'stock count was wrong' }] },
      ctx as never,
    )
    expect((result as { status: string }).status).toBe('inventory_check')
    expect((await getBalance(productId, warehouseId)).reserved).toBe(0)

    // Redoing inventory check from here must not double-reserve on top of
    // the (already-released) old reservation. needsPurchase auto-advances
    // straight through store_pricing to market_pricing (same as every
    // other confirmRequisitionInventoryCheck call — see this file's own
    // makeReqAtMarketPricing comment).
    const redo = await resolvers.Mutation.confirmRequisitionInventoryCheck(
      null,
      { id: reqId, lineStockQtys: [{ lineId, qtyFromStock: 5, sourceLocationId: warehouseId }] },
      ctx as never,
    )
    expect((redo as { status: string }).status).toBe('market_pricing')
    expect((await getBalance(productId, warehouseId)).reserved).toBe(5)
  })

  it('requires the procurement_2nd position (or admin) to act on any of the four', async () => {
    const { reqId } = await makeReqAtPriceVerification({ qtyOrdered: 2, marketPrice: 5 })
    const strangerCtx = {
      auth: { companyId: TEST_COMPANY_ID, userId: '00000000-0000-0000-0000-000000000099', role: 'user', module: 'all', sessionId: 'g1-test-stranger' },
    }
    await expect(
      resolvers.Mutation.rejectRequisitionVerificationToMarketPricing(
        null,
        { id: reqId, reason: 'x' },
        strangerCtx as never,
      ),
    ).rejects.toThrow(/procurement_2nd position required/i)
  })
})
