// Receiving a purchase order (Store In) labels the stock it creates in the currency the number is in.
//
// Regression (NF-PO-2026-0163, and 142 of 485 Store In moves in the eight weeks before it): every receipt move was
// inserted without a currency, so stock_moves.currency_code took its column default 'IQD' whatever the PO line was
// in. The location's "last cost" label is copied from that move (trigger, migration 283), so 6.25 USD showed as
// 6.25 IQD, and the Stock Balances page and a later cost comparison read the wrong currency.
//
// The cost written is `unit_price x fx_rate_to_base`. A line converted at receipt (a rate other than 1, the old
// pre-G1 flow) really is in the base currency; a line with no rate (everything since the requisition split) is in
// its own currency. The label follows the number: base currency when it was converted, the line's currency when
// not. Real Postgres through the real recordReceipt / confirmReceipt, nothing mocked.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'
import { receiptCostCurrency } from '../src/lib/receiptCost.js'

const TEST_COMPANY_ID = '00000000-0000-0000-0000-000000000001'
const TAG = 'SICCY-'
const TEST_USER_EMAIL = 'store-in-currency-test@fnc-erp.local'

let userId: string
let warehouseId: string
let vendorId: string
let ctx: unknown
let baseCurrency = 'IQD'

async function makeProduct(label: string, cost?: { amount: number; currency: string }): Promise<string> {
  const sku = `${TAG}${label}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const r = await pool.query<{ id: string }>(
    `INSERT INTO products (company_id, sku, name, uom, category) VALUES ($1,$2,$2,'unit','general') RETURNING id`,
    [TEST_COMPANY_ID, sku],
  )
  const id = r.rows[0]!.id
  if (cost)
    await pool.query(`UPDATE products SET standard_cost=$1, cost_currency=$2 WHERE id=$3`, [cost.amount, cost.currency, id])
  return id
}

async function attachFile(entityType: string, entityId: string, category: string): Promise<void> {
  const key = `${TAG}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const f = await pool.query<{ id: string }>(
    `INSERT INTO files (company_id, uploaded_by, file_key, original_filename, mime_type, size_bytes, category, status)
     VALUES ($1,$2,$3,'receipt.jpg','image/jpeg',1024,$4,'uploaded') RETURNING id`,
    [TEST_COMPANY_ID, userId, key, category],
  )
  await pool.query(
    `INSERT INTO document_attachments (file_id, entity_type, entity_id, uploaded_by) VALUES ($1,$2,$3,$4)`,
    [f.rows[0]!.id, entityType, entityId, userId],
  )
}

interface Received {
  productId: string
  poLineId: string
  receiptId: string
}

// A purchase order with one line in `lineCurrency` at `price` (and `fx` when the line was converted), received and confirmed.
async function receive(opts: {
  lineCurrency: string
  price: number
  fx?: number | null
  productCost?: { amount: number; currency: string }
}): Promise<Received> {
  const productId = await makeProduct('p', opts.productCost)
  const po = await pool.query<{ id: string }>(
    `INSERT INTO purchase_orders (company_id, po_number, vendor_id, status, currency_code, purpose, created_by)
     VALUES ($1,$2,$3,'approved',$4,'stock',$5) RETURNING id`,
    [TEST_COMPANY_ID, `${TAG}PO-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, vendorId, opts.lineCurrency, userId],
  )
  const poId = po.rows[0]!.id
  const line = await pool.query<{ id: string }>(
    `INSERT INTO po_lines (po_id, product_id, description, line_number, qty_ordered, unit_price, total_price, uom, currency_code, fx_rate_to_base)
     VALUES ($1,$2,'test line',1,10,$3,$4,'unit',$5,$6) RETURNING id`,
    [poId, productId, opts.price, opts.price * 10, opts.lineCurrency, opts.fx ?? null],
  )
  const poLineId = line.rows[0]!.id
  const receipt = (await resolvers.Mutation.recordReceipt(
    null,
    {
      poId,
      input: {
        receipt_date: new Date().toISOString().slice(0, 10),
        location_id: warehouseId,
        lines: [{ po_line_id: poLineId, qty_received: 10, actual_unit_price: opts.price }],
      },
    },
    ctx as never,
  )) as { id: string }
  await attachFile('po_receipt', receipt.id, 'po_receipt_photo')
  await attachFile('purchase_order', poId, 'po_receipt_document')
  await resolvers.Mutation.confirmReceipt(null, { id: receipt.id }, ctx as never)
  return { productId, poLineId, receiptId: receipt.id }
}

// A line with no catalog product yet, received and confirmed: the stock move waits until it is catalogued.
async function receiveUncatalogued(lineCurrency: string, price: number): Promise<string> {
  const po = await pool.query<{ id: string }>(
    `INSERT INTO purchase_orders (company_id, po_number, vendor_id, status, currency_code, purpose, created_by)
     VALUES ($1,$2,$3,'approved',$4,'stock',$5) RETURNING id`,
    [TEST_COMPANY_ID, `${TAG}PO-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, vendorId, lineCurrency, userId],
  )
  const poId = po.rows[0]!.id
  const line = await pool.query<{ id: string }>(
    `INSERT INTO po_lines (po_id, description, line_number, qty_ordered, unit_price, total_price, uom, currency_code)
     VALUES ($1,'Corner angle',1,10,$2,$3,'unit',$4) RETURNING id`,
    [poId, price, price * 10, lineCurrency],
  )
  const poLineId = line.rows[0]!.id
  const receipt = (await resolvers.Mutation.recordReceipt(
    null,
    {
      poId,
      input: {
        receipt_date: new Date().toISOString().slice(0, 10),
        location_id: warehouseId,
        lines: [{ po_line_id: poLineId, qty_received: 10, actual_unit_price: price }],
      },
    },
    ctx as never,
  )) as { id: string }
  await attachFile('po_receipt', receipt.id, 'po_receipt_photo')
  await attachFile('purchase_order', poId, 'po_receipt_document')
  await resolvers.Mutation.confirmReceipt(null, { id: receipt.id }, ctx as never)
  return poLineId
}

const moveOf = async (poLineId: string) =>
  (
    await pool.query<{ currency_code: string; unit_cost: string; source_type: string }>(
      `SELECT currency_code, unit_cost, source_type FROM stock_moves WHERE po_line_id=$1 AND source_type='po_receipt'`,
      [poLineId],
    )
  ).rows
const balanceOf = async (productId: string) =>
  (
    await pool.query<{ average_cost: string; last_cost_currency: string }>(
      `SELECT average_cost, last_cost_currency FROM stock_balances WHERE product_id=$1 AND location_id=$2`,
      [productId, warehouseId],
    )
  ).rows[0]
const productCost = async (productId: string) => {
  const r = (await pool.query<{ standard_cost: string; cost_currency: string | null }>(`SELECT standard_cost, cost_currency FROM products WHERE id=$1`, [productId])).rows[0]!
  return { cost: parseFloat(r.standard_cost), currency: r.cost_currency }
}

async function cleanup(): Promise<void> {
  const pos = `SELECT id FROM purchase_orders WHERE po_number LIKE $1`
  const like = [`${TAG}%`]
  await pool.query(`DELETE FROM document_attachments WHERE (entity_type='po_receipt' AND entity_id IN (SELECT id FROM po_receipts WHERE po_id IN (${pos}))) OR (entity_type='purchase_order' AND entity_id IN (${pos}))`, like)
  await pool.query(`DELETE FROM stock_moves WHERE po_line_id IN (SELECT id FROM po_lines WHERE po_id IN (${pos}))`, like)
  await pool.query(`DELETE FROM po_receipt_lines WHERE receipt_id IN (SELECT id FROM po_receipts WHERE po_id IN (${pos}))`, like)
  await pool.query(`DELETE FROM po_receipts WHERE po_id IN (${pos})`, like)
  await pool.query(`DELETE FROM po_lines WHERE po_id IN (${pos})`, like)
  await pool.query(`DELETE FROM purchase_orders WHERE po_number LIKE $1`, like)
  await pool.query(`DELETE FROM vendors WHERE company_id=$1 AND name LIKE $2`, [TEST_COMPANY_ID, `${TAG}%`])
  await pool.query(`DELETE FROM files WHERE company_id=$1 AND file_key LIKE $2`, [TEST_COMPANY_ID, `${TAG}%`])
  await pool.query(`DELETE FROM product_cost_change_requests WHERE product_id IN (SELECT id FROM products WHERE sku LIKE $1)`, like)
  await pool.query(`DELETE FROM product_cost_history WHERE product_id IN (SELECT id FROM products WHERE sku LIKE $1)`, like)
  await pool.query(`DELETE FROM stock_moves WHERE product_id IN (SELECT id FROM products WHERE sku LIKE $1)`, like)
  await pool.query(`DELETE FROM stock_balances WHERE product_id IN (SELECT id FROM products WHERE sku LIKE $1)`, like)
  await pool.query(`DELETE FROM products WHERE sku LIKE $1`, like)
}

beforeAll(async () => {
  const u = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [TEST_USER_EMAIL],
  )
  userId = u.rows[0]!.id
  ctx = { auth: { companyId: TEST_COMPANY_ID, userId, role: 'system_admin', module: 'all', sessionId: 'store-in-ccy-test' } }
  const wh = await pool.query<{ id: string }>(
    `SELECT id FROM stock_locations WHERE company_id=$1 AND type='warehouse' AND is_active=true LIMIT 1`,
    [TEST_COMPANY_ID],
  )
  if (!wh.rows[0]) throw new Error('No warehouse location seeded for the test company')
  warehouseId = wh.rows[0].id
  const base = await pool.query<{ default_currency: string }>(`SELECT default_currency FROM system_configuration WHERE company_id=$1`, [TEST_COMPANY_ID])
  baseCurrency = base.rows[0]?.default_currency ?? 'IQD'
  await cleanup()
  const v = await pool.query<{ id: string }>(`INSERT INTO vendors (company_id, name) VALUES ($1,$2) RETURNING id`, [TEST_COMPANY_ID, `${TAG}Vendor`])
  vendorId = v.rows[0]!.id
})

afterAll(async () => {
  await cleanup()
  await pool.query(`DELETE FROM users WHERE email=$1`, [TEST_USER_EMAIL])
  await pool.end()
})

describe('receiptCostCurrency (pure)', () => {
  it('is the line currency when nothing was converted, whatever the base currency is', () => {
    expect(receiptCostCurrency('USD', 1, 'IQD')).toBe('USD')
    expect(receiptCostCurrency('IQD', 1, 'IQD')).toBe('IQD')
    expect(receiptCostCurrency(' usd ', 1, 'IQD')).toBe('USD')
  })

  it('is the base currency when the cost was converted at receipt', () => {
    expect(receiptCostCurrency('USD', 1500, 'IQD')).toBe('IQD')
    expect(receiptCostCurrency('IQD', 0.00067, 'USD')).toBe('USD')
  })

  it('falls back to the base currency for a line with no currency', () => {
    expect(receiptCostCurrency(null, 1, 'IQD')).toBe('IQD')
    expect(receiptCostCurrency(undefined, 1, 'IQD')).toBe('IQD')
    expect(receiptCostCurrency('', 1, 'IQD')).toBe('IQD')
  })
})

describe('Store In labels the stock in the currency the cost is in', () => {
  it('a USD line is received as USD, not IQD', async () => {
    const { productId, poLineId } = await receive({ lineCurrency: 'USD', price: 6.25 })
    const [move, ...more] = await moveOf(poLineId)
    expect(more).toHaveLength(0)
    expect(move).toMatchObject({ currency_code: 'USD' })
    expect(parseFloat(move!.unit_cost)).toBe(6.25)
    // the location's last cost is copied from that move
    expect(await balanceOf(productId)).toMatchObject({ last_cost_currency: 'USD' })
  })

  it('an IQD line is still received as IQD', async () => {
    const { productId, poLineId } = await receive({ lineCurrency: 'IQD', price: 4500 })
    expect((await moveOf(poLineId))[0]).toMatchObject({ currency_code: 'IQD' })
    expect(await balanceOf(productId)).toMatchObject({ last_cost_currency: 'IQD' })
  })

  it('a line converted at receipt is in the base currency, so it keeps that label', async () => {
    const { poLineId } = await receive({ lineCurrency: 'USD', price: 6.25, fx: 1500 })
    const [move] = await moveOf(poLineId)
    expect(parseFloat(move!.unit_cost)).toBe(9375) // 6.25 x 1500: a base-currency number
    expect(move).toMatchObject({ currency_code: baseCurrency })
  })

  it("does not turn a USD product's cost into an IQD one", async () => {
    const { productId } = await receive({ lineCurrency: 'USD', price: 6.25, productCost: { amount: 6.25, currency: 'USD' } })
    expect(await productCost(productId)).toEqual({ cost: 6.25, currency: 'USD' })
  })

  it("records a changed USD price as a USD cost, never as IQD", async () => {
    const { productId } = await receive({ lineCurrency: 'USD', price: 6.5, productCost: { amount: 6.25, currency: 'USD' } })
    const cost = await productCost(productId)
    expect(cost.currency).toBe('USD')
    expect(cost.cost).toBe(6.5)
  })

  it('keeps the label when the receipt is reversed, so the location does not go back to IQD', async () => {
    const { productId, poLineId, receiptId } = await receive({ lineCurrency: 'USD', price: 6.25 })
    await resolvers.Mutation.reverseReceipt(null, { id: receiptId, reason: 'wrong delivery' } as never, ctx as never)
    const moves = await moveOf(poLineId)
    expect(moves.length).toBeGreaterThanOrEqual(2) // the receipt and its reversal
    expect(moves.every((m) => m.currency_code === 'USD')).toBe(true)
    expect(await balanceOf(productId)).toMatchObject({ last_cost_currency: 'USD' })
  })

  it('keeps the label when an admin corrects the price of a received line (the move is reversed and posted again)', async () => {
    const { productId, poLineId } = await receive({ lineCurrency: 'USD', price: 6.25 })
    const po = await pool.query<{ po_id: string }>(`SELECT po_id FROM po_lines WHERE id=$1`, [poLineId])
    await pool.query(`UPDATE purchase_orders SET status='approved' WHERE id=$1`, [po.rows[0]!.po_id])
    await resolvers.Mutation.adminCorrectPO(
      null,
      {
        id: po.rows[0]!.po_id,
        reason: 'supplier corrected the price',
        changes: JSON.stringify({ lines: { edited: [{ id: poLineId, field: 'unit_price', from: 6.25, to: 7 }] } }),
      } as never,
      ctx as never,
    )
    const moves = await moveOf(poLineId)
    expect(moves.length).toBeGreaterThanOrEqual(3) // the receipt, its reversal, and the new posting
    expect(moves.every((m) => m.currency_code === 'USD')).toBe(true)
    expect(moves.some((m) => parseFloat(m.unit_cost) === 7)).toBe(true)
    expect(await balanceOf(productId)).toMatchObject({ last_cost_currency: 'USD' })
  })

  it('labels the stock move written later, when an item received before it was catalogued gets its product', async () => {
    const poLineId = await receiveUncatalogued('USD', 6.25)
    expect(await moveOf(poLineId)).toHaveLength(0) // confirmed, but nothing has moved yet
    const pending = await pool.query<{ id: string }>(`SELECT id FROM pending_product_catalog_items WHERE po_line_id=$1`, [poLineId])
    const product = (await resolvers.Mutation.createProductFromPendingCatalogItem(
      null,
      { id: pending.rows[0]!.id, input: { name: `${TAG}Corner angle`, uom: 'unit' } } as never,
      ctx as never,
    )) as { id: string }
    expect((await moveOf(poLineId))[0]).toMatchObject({ currency_code: 'USD' })
    expect(await balanceOf(product.id)).toMatchObject({ last_cost_currency: 'USD' })
  })
})
