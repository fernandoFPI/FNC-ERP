// Regression: the "Actual price paid" box on a PO's items_bought checklist
// shows the PO's own unit_price as its value until the buyer types
// something else, but setLineActualPrice's onBlur handler deliberately
// skips saving when the value is unchanged from that default (see its own
// comment in PurchaseOrderDetail.tsx) — so ticking a line bought without
// ever touching the price field left po_lines.actual_unit_price NULL
// forever, even though "unchanged" IS the real, confirmed price. Finance
// Audit then displayed "buyer hasn't recorded a price" for a completely
// normal purchase. Found live on NF-PO-2026-0042.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'

const TEST_COMPANY_ID = '00000000-0000-0000-0000-000000000001'
const TEST_USER_EMAIL = 'mark-po-line-bought-price-test@fnc-erp.local'
const PO_PREFIX = 'MPLBPTEST-PO-'
const SKU_PREFIX = 'MPLBPTEST-'

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

async function makePO(status: string): Promise<string> {
  const poNumber = `${PO_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const r = await pool.query<{ id: string }>(
    `INSERT INTO purchase_orders (company_id, po_number, created_by, status, currency_code, purpose)
     VALUES ($1,$2,$3,$4,'IQD','stock') RETURNING id`,
    [TEST_COMPANY_ID, poNumber, userId, status],
  )
  return r.rows[0]!.id
}

async function makePOLine(
  poId: string,
  productId: string,
  qtyOrdered: number,
  unitPrice: number,
  actualUnitPrice: number | null = null,
): Promise<string> {
  const r = await pool.query<{ id: string }>(
    `INSERT INTO po_lines (po_id, line_number, description, product_id, qty_ordered, unit_price, total_price, actual_unit_price)
     VALUES ($1,1,'test line',$2,$3,$4,$5,$6) RETURNING id`,
    [poId, productId, qtyOrdered, unitPrice, qtyOrdered * unitPrice, actualUnitPrice],
  )
  return r.rows[0]!.id
}

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
  ctx = { auth: { companyId: TEST_COMPANY_ID, userId, role: 'system_admin', module: 'all', sessionId: 'mplbp-test' } }
  await cleanup()
})

afterAll(async () => {
  await cleanup()
  await pool.query(`DELETE FROM users WHERE email=$1`, [TEST_USER_EMAIL])
  await pool.end()
})

describe('markPOLineBought — auto-confirms actual_unit_price', () => {
  it('sets actual_unit_price to the PO price when ticking bought with none entered', async () => {
    const productId = await makeProduct('auto')
    const poId = await makePO('items_bought')
    const lineId = await makePOLine(poId, productId, 5, 12.5)

    const result = (await resolvers.Mutation.markPOLineBought(
      null,
      { poId, lineId, bought: true },
      ctx as never,
    )) as { is_bought: boolean; actual_unit_price: string | null }

    expect(result.is_bought).toBe(true)
    expect(parseFloat(String(result.actual_unit_price))).toBe(12.5)
  })

  it('does not overwrite an actual_unit_price the buyer already entered explicitly', async () => {
    const productId = await makeProduct('explicit')
    const poId = await makePO('items_bought')
    const lineId = await makePOLine(poId, productId, 5, 12.5, 15)

    const result = (await resolvers.Mutation.markPOLineBought(
      null,
      { poId, lineId, bought: true },
      ctx as never,
    )) as { actual_unit_price: string | null }

    expect(parseFloat(String(result.actual_unit_price))).toBe(15)
  })

  it('leaves actual_unit_price untouched when un-ticking a line', async () => {
    const productId = await makeProduct('untick')
    const poId = await makePO('items_bought')
    const lineId = await makePOLine(poId, productId, 5, 12.5)
    await resolvers.Mutation.markPOLineBought(null, { poId, lineId, bought: true }, ctx as never)

    const result = (await resolvers.Mutation.markPOLineBought(
      null,
      { poId, lineId, bought: false },
      ctx as never,
    )) as { is_bought: boolean; actual_unit_price: string | null }

    expect(result.is_bought).toBe(false)
    expect(parseFloat(String(result.actual_unit_price))).toBe(12.5)
  })
})
