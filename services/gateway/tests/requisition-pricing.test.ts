// Integration tests for G1 Phase 2 PR 1b: submitRequisitionStorePricing,
// submitRequisitionMarketPricing, verifyRequisitionPrices, and the
// per-currency totals rollup (getRequisitionCurrencyTotals). Same
// real-Postgres pattern as requisition-inventory-check.test.ts.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'

const TEST_COMPANY_ID = '00000000-0000-0000-0000-000000000001'
const TEST_USER_EMAIL = 'g1-requisition-pricing-test@fnc-erp.local'
const SKU_PREFIX = 'G1PTEST-'

let userId: string
let ctx: { auth: { companyId: string; userId: string; role: string; module: string; sessionId: string } }

async function makeProduct(suffix: string): Promise<string> {
  const sku = `${SKU_PREFIX}${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const r = await pool.query<{ id: string }>(
    `INSERT INTO products (company_id, sku, name, uom, category) VALUES ($1,$2,$3,'unit','general') RETURNING id`,
    [TEST_COMPANY_ID, sku, sku],
  )
  return r.rows[0]!.id
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
  await pool.query(`DELETE FROM products WHERE company_id=$1 AND sku LIKE $2`, [TEST_COMPANY_ID, `${SKU_PREFIX}%`])
}

// Drives a fresh requisition through store_pricing (skipping the actual
// inventory-check reservation math — irrelevant to pricing — by moving
// straight past it with 0 from-stock on every line).
async function makeReqAtStorePricing(qtyOrdered: number, unitPrice = 10) {
  const productId = await makeProduct('pricing')
  const created = await resolvers.Mutation.createRequisition(
    null,
    { input: { purpose: 'stock', lines: [{ product_id: productId, description: 'x', qty: qtyOrdered, unit_price: unitPrice }] } },
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
  await cleanup()
})

afterAll(async () => {
  await cleanup()
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
  })
})

describe('submitRequisitionMarketPricing', () => {
  it('sets the real total, the line currency, caches last_market_price — with no vendor and no fx_rate_to_base stamped', async () => {
    const { reqId, lineId, productId } = await makeReqAtStorePricing(5, 1)
    await resolvers.Mutation.submitRequisitionStorePricing(null, { id: reqId }, ctx as never)

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

    const product = await pool.query<{ last_market_price: string; last_market_price_currency: string }>(
      `SELECT last_market_price, last_market_price_currency FROM products WHERE id=$1`,
      [productId],
    )
    expect(parseFloat(product.rows[0]!.last_market_price)).toBe(12)
    expect(product.rows[0]!.last_market_price_currency).toBe('USD')
  })
})

describe('verifyRequisitionPrices', () => {
  it('sets verified_price + unit_price + total from the line\'s own currency, transitions to pending_approval', async () => {
    const { reqId, lineId } = await makeReqAtStorePricing(3, 1)
    await resolvers.Mutation.submitRequisitionStorePricing(null, { id: reqId }, ctx as never)
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
    await resolvers.Mutation.submitRequisitionStorePricing(null, { id: reqId }, ctx as never)
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
