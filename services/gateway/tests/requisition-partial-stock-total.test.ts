// A requisition line's total is the amount still TO PURCHASE: (ordered - covered from stock) x price (playbook #127). Found live on
// NF-REQ-2026-0195: 12 ordered, 8 from inventory, market price 11 USD, total 132 (12 x 11) for only 4 units to buy; the 8 from the
// shelf were counted at the purchase price too, so the requisition read 88 USD too high. A line covered 100% from stock was already
// 0; only a PARTLY covered one was wrong.
//
// Real Postgres through the real resolvers (inventory check, market pricing, price verification, approval, resolve-from-stock,
// Finish Buying and the organizer review's confirmation), and the real schema for what the page reads. The user's own numbers.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { ApolloServer } from '@apollo/server'
import { pool } from '@fnc-erp/db'
import { typeDefs } from '../src/graphql/schema.js'
import { resolvers } from '../src/graphql/resolvers.js'
import { toPurchaseQty, toPurchaseTotalSql } from '../src/lib/lineToPurchase.js'
import { passReview } from './review-helpers.js'

const TEST_COMPANY_ID = 'f0000000-0000-0000-0000-000000000009'
const TEST_USER_EMAIL = 'partial-stock-total-test@fnc-erp.local'
const VENDOR_PREFIX = 'PSTTEST-VENDOR-'
const SKU_PREFIX = 'PSTTEST-'
const FILE_PREFIX = 'psttest-'

type Ctx = { auth: { companyId: string; userId: string; role: string; module: string; sessionId: string } }
let userId: string
let warehouseId: string
let vendorId: string
let projectId: string
let ctx: Ctx
const server = new ApolloServer<Ctx>({ typeDefs, resolvers })
type Mut = Record<string, (...a: unknown[]) => Promise<unknown>>
const M = resolvers.Mutation as unknown as Mut

describe('the rule in lib/lineToPurchase.ts', () => {
  it('units to buy are what was ordered minus what stock covers, never below zero', () => {
    expect(toPurchaseQty(12, 8)).toBe(4)
    expect(toPurchaseQty(12, 0)).toBe(12)
    expect(toPurchaseQty(6, 6)).toBe(0)
    expect(toPurchaseQty(6, 9)).toBe(0)
  })

  it('writes the total as (ordered - from stock, at least 0) x price, with the row\'s own columns unless told otherwise', () => {
    expect(toPurchaseTotalSql({ price: '$1' })).toBe('GREATEST(qty_ordered - COALESCE(qty_from_stock, 0), 0) * $1')
    expect(toPurchaseTotalSql({ price: 'unit_price', fromStock: '$2::numeric' })).toBe(
      'GREATEST(qty_ordered - $2::numeric, 0) * unit_price',
    )
    expect(toPurchaseTotalSql({ price: 'unit_price', ordered: '$2::numeric' })).toBe(
      'GREATEST($2::numeric - COALESCE(qty_from_stock, 0), 0) * unit_price',
    )
  })
})

async function makeProduct(): Promise<string> {
  const sku = `${SKU_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const r = await pool.query<{ id: string }>(
    `INSERT INTO products (company_id, sku, name, uom, category) VALUES ($1,$2,$2,'EA','general') RETURNING id`,
    [TEST_COMPANY_ID, sku],
  )
  return r.rows[0]!.id
}
async function receive(productId: string, qty: number): Promise<void> {
  const viR = await pool.query<{ id: string }>(
    `SELECT id FROM stock_locations WHERE company_id=$1 AND type='virtual_in' AND is_active=true LIMIT 1`,
    [TEST_COMPANY_ID],
  )
  await pool.query(
    `INSERT INTO stock_moves (company_id, product_id, from_location_id, to_location_id, moved_at, qty, unit_cost, total_cost, source_type, moved_by)
     VALUES ($1,$2,$3,$4,NOW(),$5,12,$6,'po_receipt',$7)`,
    [TEST_COMPANY_ID, productId, viR.rows[0]!.id, warehouseId, qty, qty * 12, userId],
  )
}
async function makeFile(): Promise<string> {
  const r = await pool.query<{ id: string }>(
    `INSERT INTO files (company_id, uploaded_by, file_key, original_filename, mime_type, size_bytes, category, status)
     VALUES ($1,$2,$3,'receipt.jpg','image/jpeg',1024,'attachment','uploaded') RETURNING id`,
    [TEST_COMPANY_ID, userId, `${FILE_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`],
  )
  return r.rows[0]!.id
}
interface LineRow {
  qty_ordered: string
  qty_from_stock: string
  unit_price: string
  total_price: string
  po_id: string | null
}
const lineOf = async (lineId: string): Promise<LineRow> =>
  (
    await pool.query<LineRow>(
      `SELECT qty_ordered, qty_from_stock, unit_price, total_price, po_id FROM po_lines WHERE id=$1`,
      [lineId],
    )
  ).rows[0]!
const totalOf = async (lineId: string) => Number((await lineOf(lineId)).total_price)

// A one-line project requisition for the user's numbers: 12 ordered, `fromStock` of them from the warehouse, created with an
// estimate of 2 per unit. Stops after the inventory check so each later step can be asserted on its own.
async function startReq(opts: { qty?: number; fromStock: number; onHand?: number }) {
  const qty = opts.qty ?? 12
  const productId = await makeProduct()
  await receive(productId, opts.onHand ?? Math.max(opts.fromStock, 1))
  const created = (await M.createRequisition(
    null,
    {
      input: {
        purpose: 'project',
        project_id: projectId,
        delivery_destination: 'inventory',
        lines: [{ product_id: productId, description: 'steel pipe', qty, unit_price: 2, requested_currency_code: 'USD' }],
      },
    },
    ctx,
  )) as { id: string }
  const lineId = (await pool.query<{ id: string }>(`SELECT id FROM po_lines WHERE requisition_id=$1`, [created.id])).rows[0]!.id
  await M.submitRequisitionToInventoryCheck(null, { id: created.id }, ctx)
  await M.confirmRequisitionInventoryCheck(
    null,
    {
      id: created.id,
      lineStockQtys: [
        { lineId, qtyFromStock: opts.fromStock, sourceLocationId: opts.fromStock > 0 ? warehouseId : undefined },
      ],
    },
    ctx,
  )
  return { reqId: created.id, lineId, productId }
}
const marketPrice = (reqId: string, lineId: string, price: number) =>
  M.submitRequisitionMarketPricing(null, { id: reqId, linePrices: [{ lineId, marketPrice: price, currencyCode: 'USD' }] }, ctx)
const verify = (reqId: string, lineId: string, price: number) =>
  M.verifyRequisitionPrices(null, { id: reqId, lineAdjustments: [{ lineId, verifiedPrice: price }] }, ctx)

async function cleanup(): Promise<void> {
  const mine = `SELECT id FROM requisitions WHERE company_id=$1 AND organizer_id=$2`
  const p = [TEST_COMPANY_ID, userId]
  await pool.query(`DELETE FROM po_line_purchases WHERE po_line_id IN (SELECT pl.id FROM po_lines pl WHERE pl.requisition_id IN (${mine}))`, p)
  await pool.query(`DELETE FROM document_attachments WHERE file_id IN (SELECT id FROM files WHERE file_key LIKE $1)`, [`${FILE_PREFIX}%`])
  await pool.query(`DELETE FROM files WHERE file_key LIKE $1`, [`${FILE_PREFIX}%`])
  await pool.query(`DELETE FROM requisition_approved_totals WHERE requisition_id IN (${mine})`, p)
  await pool.query(`DELETE FROM requisition_approval_log WHERE requisition_id IN (${mine})`, p)
  await pool.query(
    `DELETE FROM project_material_issue_lines WHERE issue_id IN (SELECT id FROM project_material_issues WHERE company_id=$1 AND created_by=$2)`,
    p,
  )
  await pool.query(`DELETE FROM project_material_issues WHERE company_id=$1 AND created_by=$2`, p)
  await pool.query(`DELETE FROM po_approval_log WHERE po_id IN (SELECT id FROM purchase_orders WHERE company_id=$1 AND requisition_id IN (${mine}))`, p)
  await pool.query(
    `DELETE FROM stock_moves WHERE company_id=$1 AND product_id IN (SELECT id FROM products WHERE company_id=$1 AND sku LIKE $2)`,
    [TEST_COMPANY_ID, `${SKU_PREFIX}%`],
  )
  await pool.query(`DELETE FROM po_lines WHERE po_id IN (SELECT id FROM purchase_orders WHERE company_id=$1 AND requisition_id IN (${mine}))`, p)
  await pool.query(`DELETE FROM purchase_orders WHERE company_id=$1 AND requisition_id IN (${mine})`, p)
  await pool.query(`DELETE FROM po_lines WHERE requisition_id IN (${mine})`, p)
  await pool.query(`DELETE FROM requisitions WHERE company_id=$1 AND organizer_id=$2`, p)
  await pool.query(
    `DELETE FROM stock_balances WHERE product_id IN (SELECT id FROM products WHERE company_id=$1 AND sku LIKE $2)`,
    [TEST_COMPANY_ID, `${SKU_PREFIX}%`],
  )
  await pool.query(`DELETE FROM products WHERE company_id=$1 AND sku LIKE $2`, [TEST_COMPANY_ID, `${SKU_PREFIX}%`])
  await pool.query(`DELETE FROM projects WHERE company_id=$1 AND code LIKE $2`, [TEST_COMPANY_ID, `${SKU_PREFIX}%`])
  await pool.query(`DELETE FROM vendors WHERE company_id=$1 AND name LIKE $2`, [TEST_COMPANY_ID, `${VENDOR_PREFIX}%`])
}

beforeAll(async () => {
  const userR = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [TEST_USER_EMAIL],
  )
  userId = userR.rows[0]!.id
  ctx = { auth: { companyId: TEST_COMPANY_ID, userId, role: 'system_admin', module: 'all', sessionId: 'pst-test' } }
  const wh = await pool.query<{ id: string }>(
    `SELECT id FROM stock_locations WHERE company_id=$1 AND type='warehouse' AND is_active=true LIMIT 1`,
    [TEST_COMPANY_ID],
  )
  if (!wh.rows[0]) throw new Error('No warehouse location seeded for the test company: run the seeds first')
  warehouseId = wh.rows[0].id
  await cleanup()
  vendorId = (
    await pool.query<{ id: string }>(`INSERT INTO vendors (company_id, name) VALUES ($1,$2) RETURNING id`, [
      TEST_COMPANY_ID,
      `${VENDOR_PREFIX}A-${Date.now()}`,
    ])
  ).rows[0]!.id
  projectId = (
    await pool.query<{ id: string }>(
      `INSERT INTO projects (company_id, code, name, status, created_by) VALUES ($1,$2,$2,'ongoing',$3) RETURNING id`,
      [TEST_COMPANY_ID, `${SKU_PREFIX}PRJ-${Date.now()}`, userId],
    )
  ).rows[0]!.id
})

afterAll(async () => {
  await cleanup()
  await pool.query(`DELETE FROM users WHERE email=$1`, [TEST_USER_EMAIL])
  await pool.end()
})

describe('a line 8 of 12 from stock: the total is the 4 to buy', () => {
  it('after the inventory check it is (12 - 8) x the estimate, not the whole line', async () => {
    const { lineId } = await startReq({ fromStock: 8 })
    const l = await lineOf(lineId)
    expect(Number(l.qty_ordered)).toBe(12)
    expect(Number(l.qty_from_stock)).toBe(8)
    expect(Number(l.total_price)).toBeCloseTo(4 * 2, 4)
  })

  it("market pricing at 11 gives 4 x 11 = 44, and price verification re-prices it from the same rule (the user's case, not 132)", async () => {
    const { reqId, lineId } = await startReq({ fromStock: 8 })
    await marketPrice(reqId, lineId, 11)
    expect(await totalOf(lineId)).toBeCloseTo(44, 4)
    await verify(reqId, lineId, 10)
    expect(await totalOf(lineId)).toBeCloseTo(40, 4) // 4 x 10
  })

  it('the requisition total the page reads (through the real schema) is 44, and the approval snapshot keeps 44', async () => {
    const { reqId, lineId } = await startReq({ fromStock: 8 })
    await marketPrice(reqId, lineId, 11)
    await verify(reqId, lineId, 11)
    const res = await server.executeOperation(
      {
        query: `query($id: ID!) { requisition(id: $id) { currencyTotals { currency_code subtotal } lines { total qty_from_stock store_price } } }`,
        variables: { id: reqId },
      },
      { contextValue: ctx },
    )
    if (res.body.kind !== 'single') throw new Error('unexpected response')
    expect(res.body.singleResult.errors).toBeUndefined()
    const data = res.body.singleResult.data as {
      requisition: { currencyTotals: { currency_code: string; subtotal: string }[]; lines: { total: string; qty_from_stock: string; store_price: string | null }[] }
    }
    expect(Number(data.requisition.currencyTotals.find((c) => c.currency_code === 'USD')?.subtotal)).toBeCloseTo(44, 4)
    expect(Number(data.requisition.lines[0]!.total)).toBeCloseTo(44, 4)
    // what the page shows beside it: the stock part at the store price (8 x 12 = 96); the store price came from the product's cost
    expect(Number(data.requisition.lines[0]!.qty_from_stock)).toBe(8)
    await M.approveRequisition(null, { id: reqId }, ctx)
    const snap = await pool.query<{ subtotal: string }>(
      `SELECT subtotal FROM requisition_approved_totals WHERE requisition_id=$1 AND currency_code='USD'`,
      [reqId],
    )
    expect(Number(snap.rows[0]!.subtotal)).toBeCloseTo(44, 4)
  })

  it('a buyer resolving 2 more from stock at Items Bought brings the total to (12 - 10) x 11 = 22', async () => {
    const { reqId, lineId } = await startReq({ fromStock: 8, onHand: 12 })
    await marketPrice(reqId, lineId, 11)
    await verify(reqId, lineId, 11)
    await M.approveRequisition(null, { id: reqId }, ctx)
    expect(await totalOf(lineId)).toBeCloseTo(44, 4)
    await M.resolveRequisitionLineFromStock(null, { lineId, qty: 2, sourceLocationId: warehouseId }, ctx)
    expect(Number((await lineOf(lineId)).qty_from_stock)).toBe(10)
    expect(await totalOf(lineId)).toBeCloseTo(22, 4)
  })

  it('after the purchase orders are made the requisition still totals 44: the bought 4 are on the child PO and the stock part left on the original row is 0', async () => {
    const { reqId, lineId } = await startReq({ fromStock: 8 })
    await marketPrice(reqId, lineId, 11)
    await verify(reqId, lineId, 11)
    await M.approveRequisition(null, { id: reqId }, ctx)
    await M.recordLinePurchase(
      null,
      { input: { lineId, vendorId, qty: 4, actualUnitPrice: 11, currencyCode: 'USD', receiptFileId: await makeFile() } },
      ctx,
    )
    await M.finishBuyingRequisition(null, { id: reqId }, ctx)
    await passReview(reqId, ctx)
    const rows = await pool.query<{ po_id: string | null; qty_ordered: string; qty_from_stock: string; total_price: string }>(
      `SELECT po_id, qty_ordered, qty_from_stock, total_price FROM po_lines WHERE requisition_id=$1 ORDER BY po_id NULLS FIRST`,
      [reqId],
    )
    expect(rows.rows).toHaveLength(2)
    const left = rows.rows.find((r) => r.po_id === null)!
    const child = rows.rows.find((r) => r.po_id !== null)!
    expect(Number(left.qty_ordered)).toBe(8)
    expect(Number(left.qty_from_stock)).toBe(8)
    expect(Number(left.total_price)).toBe(0) // covered from stock: nothing on it is bought
    expect(Number(child.qty_ordered)).toBe(4)
    expect(Number(child.total_price)).toBeCloseTo(44, 4)
    const totals = await pool.query<{ s: string }>(
      `-- currency-safe: one currency in this test
       SELECT SUM(total_price) AS s FROM po_lines WHERE requisition_id=$1`,
      [reqId],
    )
    expect(Number(totals.rows[0]!.s)).toBeCloseTo(44, 4)
  })
})

describe('the other lines are unchanged', () => {
  it('a line fully from stock is still 0', async () => {
    const { lineId } = await startReq({ qty: 6, fromStock: 6 })
    expect(await totalOf(lineId)).toBe(0)
  })

  it('a line with nothing from stock is still the whole quantity times the price', async () => {
    const { reqId, lineId } = await startReq({ qty: 5, fromStock: 0 })
    await marketPrice(reqId, lineId, 11)
    expect(await totalOf(lineId)).toBeCloseTo(55, 4)
    await verify(reqId, lineId, 9)
    expect(await totalOf(lineId)).toBeCloseTo(45, 4)
  })

  it('a line with no stock after the inventory check keeps its estimate, so the first pricing step starts from the right number', async () => {
    const { lineId } = await startReq({ qty: 5, fromStock: 0 })
    expect(await totalOf(lineId)).toBeCloseTo(5 * 2, 4)
  })
})
