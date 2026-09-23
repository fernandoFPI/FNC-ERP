// Integration test for fetchFullPurchaseOrderGW's new currencyTotals field
// (mirrors getRequisitionCurrencyTotals — see requisition-pricing.test.ts's
// own 'getRequisitionCurrencyTotals' describe block). Deliberately NOT
// mocking @fnc-erp/db, same reasoning as po-stock-locking.test.ts: exercises
// the real po_lines rows the resolver's own query reads.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'

const TEST_COMPANY_ID = '00000000-0000-0000-0000-000000000001'
const TEST_USER_EMAIL = 'po-currency-totals-test@fnc-erp.local'
const SKU_PREFIX = 'POCCYTEST-'
const PO_PREFIX = 'POCCYTEST-PO-'

let userId: string
let unauthorizedUserId: string
let ctx: { auth: { companyId: string; userId: string; role: string; module: string; sessionId: string } }
let unauthorizedCtx: { auth: { companyId: string; userId: string; role: string; module: string; sessionId: string } }

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
    `INSERT INTO purchase_orders (company_id, po_number, created_by, status, currency_code, base_currency_code, purpose)
     VALUES ($1,$2,$3,'draft','IQD','IQD','stock') RETURNING id`,
    [TEST_COMPANY_ID, poNumber, userId],
  )
  return r.rows[0]!.id
}

async function makePOLine(
  poId: string,
  lineNumber: number,
  productId: string,
  qtyOrdered: number,
  unitPrice: number,
  currencyCode?: string,
): Promise<string> {
  const totalPrice = qtyOrdered * unitPrice
  const r = await pool.query<{ id: string }>(
    `INSERT INTO po_lines (po_id, line_number, description, product_id, qty_ordered, unit_price, total_price${
      currencyCode ? ', currency_code' : ''
    })
     VALUES ($1,$2,'test line',$3,$4,$5,$6${currencyCode ? ',$7' : ''}) RETURNING id`,
    currencyCode
      ? [poId, lineNumber, productId, qtyOrdered, unitPrice, totalPrice, currencyCode]
      : [poId, lineNumber, productId, qtyOrdered, unitPrice, totalPrice],
  )
  return r.rows[0]!.id
}

const UNAUTHORIZED_USER_EMAIL = 'po-currency-totals-unauth-test@fnc-erp.local'

async function cleanup(): Promise<void> {
  await pool.query(
    `DELETE FROM po_lines WHERE po_id IN (SELECT id FROM purchase_orders WHERE company_id=$1 AND po_number LIKE $2)`,
    [TEST_COMPANY_ID, `${PO_PREFIX}%`],
  )
  await pool.query(`DELETE FROM purchase_orders WHERE company_id=$1 AND po_number LIKE $2`, [
    TEST_COMPANY_ID,
    `${PO_PREFIX}%`,
  ])
  await pool.query(`DELETE FROM products WHERE company_id=$1 AND sku LIKE $2`, [TEST_COMPANY_ID, `${SKU_PREFIX}%`])
}

beforeAll(async () => {
  const userR = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [TEST_USER_EMAIL],
  )
  userId = userR.rows[0]!.id
  ctx = { auth: { companyId: TEST_COMPANY_ID, userId, role: 'system_admin', module: 'all', sessionId: 'po-ccy-test' } }

  // A plain, unprivileged caller — not the PO's organizer, not an admin,
  // not holding any position on it — to exercise the viewerRestricted
  // branch of Query.purchaseOrder (see makePO's created_by, always userId).
  const unauthR = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [UNAUTHORIZED_USER_EMAIL],
  )
  unauthorizedUserId = unauthR.rows[0]!.id
  unauthorizedCtx = {
    auth: {
      companyId: TEST_COMPANY_ID,
      userId: unauthorizedUserId,
      role: 'employee',
      module: 'procurement',
      sessionId: 'po-ccy-unauth-test',
    },
  }
  await cleanup()
})

afterAll(async () => {
  await cleanup()
  await pool.query(`DELETE FROM users WHERE email=$1`, [TEST_USER_EMAIL])
  await pool.query(`DELETE FROM users WHERE email=$1`, [UNAUTHORIZED_USER_EMAIL])
  await pool.end()
})

describe('purchaseOrder(id).currencyTotals', () => {
  it('reports one entry per currency, never summed across currencies', async () => {
    const productA = await makeProduct('iqd-line')
    const productB = await makeProduct('usd-line')
    const poId = await makePO()
    await makePOLine(poId, 1, productA, 2, 100) // 200 IQD, default currency
    await makePOLine(poId, 2, productB, 3, 10, 'USD') // 30 USD

    const result = (await resolvers.Query.purchaseOrder(null, { id: poId }, ctx as never)) as {
      currencyTotals: { currency_code: string; subtotal: string; line_count: number }[]
    }
    const totals = result.currencyTotals
    expect(totals).toHaveLength(2)
    const iqd = totals.find((t) => t.currency_code === 'IQD')!
    const usd = totals.find((t) => t.currency_code === 'USD')!
    expect(parseFloat(iqd.subtotal)).toBe(200)
    expect(iqd.line_count).toBe(1)
    expect(parseFloat(usd.subtotal)).toBe(30)
    expect(usd.line_count).toBe(1)
    // No entry anywhere sums 200 + 30 into one number.
    expect(totals.some((t) => parseFloat(t.subtotal) === 230)).toBe(false)
  })

  it('collapses multiple lines in the same currency into one entry', async () => {
    const productA = await makeProduct('usd-a')
    const productB = await makeProduct('usd-b')
    const poId = await makePO()
    await makePOLine(poId, 1, productA, 2, 5, 'USD') // 10 USD
    await makePOLine(poId, 2, productB, 1, 4, 'USD') // 4 USD

    const result = (await resolvers.Query.purchaseOrder(null, { id: poId }, ctx as never)) as {
      currencyTotals: { currency_code: string; subtotal: string; line_count: number }[]
    }
    const totals = result.currencyTotals
    expect(totals).toHaveLength(1)
    expect(totals[0]!.currency_code).toBe('USD')
    expect(parseFloat(totals[0]!.subtotal)).toBe(14)
    expect(totals[0]!.line_count).toBe(2)
  })

  // Regression: the viewerRestricted branch (caller isn't the organizer, an
  // admin, or the current-stage position holder) returns a minimal stub
  // object instead of fetchFullPurchaseOrderGW's full one — currencyTotals
  // being schema-non-nullable means that branch must set it too, or the
  // whole purchaseOrder(id) response nulls out with a GraphQL error instead
  // of ever reaching the client.
  it('still returns an (empty) currencyTotals on the viewerRestricted branch, not a GraphQL error', async () => {
    const productA = await makeProduct('restricted-view')
    const poId = await makePO()
    await makePOLine(poId, 1, productA, 2, 100)

    const result = (await resolvers.Query.purchaseOrder(null, { id: poId }, unauthorizedCtx as never)) as {
      viewerRestricted: boolean
      currencyTotals: { currency_code: string; subtotal: string; line_count: number }[]
    }
    expect(result.viewerRestricted).toBe(true)
    expect(result.currencyTotals).toEqual([])
  })
})
