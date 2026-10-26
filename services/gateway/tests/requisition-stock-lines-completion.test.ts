// Every line covered from stock gets a draft Store Out line that reserves its quantity until it is
// confirmed, whatever the requisition's delivery destination (the destination only decides what
// happens to PURCHASED goods: Store In vs straight to the jobsite). A requisition completes only
// when those Store Outs are confirmed, and confirming deducts the stock and frees the reservation.
//
// Found live: since August the draft was skipped for a project requisition "delivered to
// inventory" (REQ-2026-0075: 9 stock lines, 72 units, no Store Out, stock reserved for nothing),
// and a line a buyer resolves from stock at Items Bought never got one at any destination
// (REQ-2026-0010). Also: the requisition's Store Outs card finds Store Outs made by hand for the
// items bought on it (linked to its child PO, not to the requisition itself).
//
// Real Postgres through the resolvers, same pattern as requisition-completion.test.ts.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'

const TEST_COMPANY_ID = 'f0000000-0000-0000-0000-000000000009'
const TEST_USER_EMAIL = 'stock-lines-completion-test@fnc-erp.local'
const VENDOR_PREFIX = 'SLCTEST-VENDOR-'
const SKU_PREFIX = 'SLCTEST-'

let userId: string
let warehouseId: string
let vendorId: string
let projectId: string
let ctx: { auth: { companyId: string; userId: string; role: string; module: string; sessionId: string } }

async function makeProduct(suffix: string): Promise<string> {
  const sku = `${SKU_PREFIX}${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const r = await pool.query<{ id: string }>(
    `INSERT INTO products (company_id, sku, name, uom, category) VALUES ($1,$2,$3,'unit','general') RETURNING id`,
    [TEST_COMPANY_ID, sku, sku],
  )
  return r.rows[0]!.id
}

async function receive(productId: string, qty: number): Promise<void> {
  if (qty <= 0) return // a stock move of 0 violates stock_moves_qty_check
  const viR = await pool.query<{ id: string }>(
    `SELECT id FROM stock_locations WHERE company_id=$1 AND type='virtual_in' AND is_active=true LIMIT 1`,
    [TEST_COMPANY_ID],
  )
  await pool.query(
    `INSERT INTO stock_moves (company_id, product_id, from_location_id, to_location_id, moved_at, qty, unit_cost, total_cost, source_type, moved_by)
     VALUES ($1,$2,$3,$4,NOW(),$5,10,$6,'po_receipt',$7)`,
    [TEST_COMPANY_ID, productId, viR.rows[0]!.id, warehouseId, qty, qty * 10, userId],
  )
}

async function makeUploadedFile(): Promise<string> {
  const key = `pic-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const r = await pool.query<{ id: string }>(
    `INSERT INTO files (company_id, uploaded_by, file_key, original_filename, mime_type, size_bytes, category, status)
     VALUES ($1,$2,$3,'receipt.jpg','image/jpeg',1024,'attachment','uploaded') RETURNING id`,
    [TEST_COMPANY_ID, userId, key],
  )
  return r.rows[0]!.id
}

const statusOf = async (reqId: string): Promise<string> =>
  (await pool.query<{ status: string }>(`SELECT status FROM requisitions WHERE id=$1`, [reqId])).rows[0]!.status

async function stock(productId: string): Promise<{ onHand: number; reserved: number }> {
  const r = await pool.query<{ qty_on_hand: string; qty_reserved: string }>(
    `SELECT qty_on_hand, qty_reserved FROM stock_balances WHERE product_id=$1 AND location_id=$2 AND lot_id IS NULL`,
    [productId, warehouseId],
  )
  return {
    onHand: parseFloat(r.rows[0]?.qty_on_hand ?? '0'),
    reserved: parseFloat(r.rows[0]?.qty_reserved ?? '0'),
  }
}

interface Made {
  reqId: string
  lineId: string
  productId: string
  childId?: string
}

// A one-line project requisition, driven through inventory check. `fromStock` of `qty` comes
// out of the warehouse; the rest (if any) is priced, approved, bought and forked at Finish Buying.
// `shortRest` marks the remainder short instead of buying it (nothing is forked).
async function makeProjectReq(opts: {
  destination: 'inventory' | 'jobsite'
  qty: number
  fromStock: number
  shortRest?: boolean
}): Promise<Made> {
  const { destination, qty, fromStock } = opts
  const productId = await makeProduct('pic')
  await receive(productId, fromStock)
  const created = await resolvers.Mutation.createRequisition(
    null,
    {
      input: {
        purpose: 'project',
        project_id: projectId,
        delivery_destination: destination,
        lines: [{ product_id: productId, description: 'x', qty, unit_price: 1 }],
      },
    },
    ctx as never,
  )
  const reqId = (created as { id: string }).id
  const lineId = (await pool.query<{ id: string }>(`SELECT id FROM po_lines WHERE requisition_id=$1`, [reqId])).rows[0]!.id

  await resolvers.Mutation.submitRequisitionToInventoryCheck(null, { id: reqId }, ctx as never)
  await resolvers.Mutation.confirmRequisitionInventoryCheck(
    null,
    { id: reqId, lineStockQtys: [{ lineId, qtyFromStock: fromStock, sourceLocationId: warehouseId }] },
    ctx as never,
  )

  if (fromStock >= qty) {
    // 100% from stock: confirm skips straight to pending_approval
    await resolvers.Mutation.approveRequisition(null, { id: reqId }, ctx as never)
    return { reqId, lineId, productId }
  }

  await resolvers.Mutation.submitRequisitionMarketPricing(
    null,
    { id: reqId, linePrices: [{ lineId, marketPrice: 10, currencyCode: 'IQD' }] },
    ctx as never,
  )
  await resolvers.Mutation.verifyRequisitionPrices(
    null,
    { id: reqId, lineAdjustments: [{ lineId, verifiedPrice: 10 }] },
    ctx as never,
  )
  await resolvers.Mutation.approveRequisition(null, { id: reqId }, ctx as never)
  if (opts.shortRest) {
    await resolvers.Mutation.markRequisitionLineShort(null, { lineId, reason: 'vendor discontinued the item' }, ctx as never)
  } else {
    await resolvers.Mutation.recordLinePurchase(
      null,
      {
        input: {
          lineId,
          vendorId,
          qty: qty - fromStock,
          actualUnitPrice: 10,
          currencyCode: 'IQD',
          receiptFileId: await makeUploadedFile(),
        },
      },
      ctx as never,
    )
  }
  await resolvers.Mutation.finishBuyingRequisition(null, { id: reqId }, ctx as never)
  const child = await pool.query<{ id: string }>(`SELECT id FROM purchase_orders WHERE requisition_id=$1`, [reqId])
  return { reqId, lineId, productId, childId: child.rows[0]?.id }
}

// Bring the child PO to a finished state. Cancelling it is one of the real triggers of the
// completion check and counts as finished there ('closed' and 'completed' do too); completePO
// would also post a project journal, which needs the company's posting accounts set up and is not
// what is being tested here.
async function finishChild(childId: string): Promise<void> {
  await resolvers.Mutation.cancelChildPurchaseOrder(null, { id: childId, reason: 'test' }, ctx as never)
}

async function cleanup(): Promise<void> {
  const mine = `SELECT id FROM requisitions WHERE company_id=$1 AND organizer_id=$2`
  await pool.query(
    `DELETE FROM po_line_purchases WHERE po_line_id IN (SELECT pl.id FROM po_lines pl WHERE pl.requisition_id IN (${mine}))`,
    [TEST_COMPANY_ID, userId],
  )
  await pool.query(`DELETE FROM document_attachments WHERE entity_type='po_line_purchase' AND uploaded_by=$1`, [userId])
  await pool.query(`DELETE FROM files WHERE company_id=$1 AND uploaded_by=$2`, [TEST_COMPANY_ID, userId])
  await pool.query(`DELETE FROM requisition_approved_totals WHERE requisition_id IN (${mine})`, [TEST_COMPANY_ID, userId])
  await pool.query(`DELETE FROM requisition_approval_log WHERE requisition_id IN (${mine})`, [TEST_COMPANY_ID, userId])
  await pool.query(
    `DELETE FROM project_cost_actuals WHERE source_type='stock_issue' AND source_id IN (
       SELECT id FROM project_material_issues WHERE company_id=$1 AND created_by=$2)`,
    [TEST_COMPANY_ID, userId],
  )
  await pool.query(
    `DELETE FROM project_material_issue_lines WHERE issue_id IN (SELECT id FROM project_material_issues WHERE company_id=$1 AND created_by=$2)`,
    [TEST_COMPANY_ID, userId],
  )
  await pool.query(`DELETE FROM project_material_issues WHERE company_id=$1 AND created_by=$2`, [TEST_COMPANY_ID, userId])
  await pool.query(
    `DELETE FROM po_approval_log WHERE po_id IN (SELECT id FROM purchase_orders WHERE company_id=$1 AND requisition_id IN (${mine}))`,
    [TEST_COMPANY_ID, userId],
  )
  await pool.query(
    `DELETE FROM stock_moves WHERE company_id=$1 AND product_id IN (SELECT id FROM products WHERE company_id=$1 AND sku LIKE $2)`,
    [TEST_COMPANY_ID, `${SKU_PREFIX}%`],
  )
  await pool.query(
    `DELETE FROM po_lines WHERE po_id IN (SELECT id FROM purchase_orders WHERE company_id=$1 AND requisition_id IN (${mine}))`,
    [TEST_COMPANY_ID, userId],
  )
  await pool.query(
    `DELETE FROM purchase_orders WHERE company_id=$1 AND requisition_id IN (${mine})`,
    [TEST_COMPANY_ID, userId],
  )
  await pool.query(`DELETE FROM po_lines WHERE requisition_id IN (${mine})`, [TEST_COMPANY_ID, userId])
  await pool.query(`DELETE FROM requisitions WHERE company_id=$1 AND organizer_id=$2`, [TEST_COMPANY_ID, userId])
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
  ctx = { auth: { companyId: TEST_COMPANY_ID, userId, role: 'system_admin', module: 'all', sessionId: 'pic-test' } }

  const whR = await pool.query<{ id: string }>(
    `SELECT id FROM stock_locations WHERE company_id=$1 AND type='warehouse' AND is_active=true LIMIT 1`,
    [TEST_COMPANY_ID],
  )
  if (!whR.rows[0]) throw new Error('No warehouse location seeded for test company — run seeds first')
  warehouseId = whR.rows[0].id

  await cleanup()

  const v = await pool.query<{ id: string }>(`INSERT INTO vendors (company_id, name) VALUES ($1,$2) RETURNING id`, [
    TEST_COMPANY_ID,
    `${VENDOR_PREFIX}A-${Date.now()}`,
  ])
  vendorId = v.rows[0]!.id
  const code = `${SKU_PREFIX}PRJ-${Date.now()}`
  const p = await pool.query<{ id: string }>(
    `INSERT INTO projects (company_id, code, name, status, created_by) VALUES ($1,$2,$2,'ongoing',$3) RETURNING id`,
    [TEST_COMPANY_ID, code, userId],
  )
  projectId = p.rows[0]!.id
  await pool.query(
    `INSERT INTO company_price_tolerance (company_id, currency_code, tolerance_pct, tolerance_abs, is_provisional)
     VALUES ($1,'IQD',5,1000,true)
     ON CONFLICT (company_id, currency_code) DO UPDATE SET tolerance_pct=5, tolerance_abs=1000`,
    [TEST_COMPANY_ID],
  )
})

afterAll(async () => {
  await cleanup()
  await pool.query(`DELETE FROM users WHERE email=$1`, [TEST_USER_EMAIL])
  await pool.end()
})

interface StoreOutRow {
  issue_id: string
  status: string
  project_id: string | null
  qty_issued: string
  po_line_id: string | null
}
const storeOutLines = async (reqId: string): Promise<StoreOutRow[]> =>
  (
    await pool.query<StoreOutRow>(
      `SELECT h.id AS issue_id, h.status, h.project_id, m.qty_issued, m.po_line_id
         FROM project_material_issues h
         JOIN project_material_issue_lines m ON m.issue_id = h.id
        WHERE h.requisition_id=$1
        ORDER BY h.created_at, m.id`,
      [reqId],
    )
  ).rows

// A project requisition taken to Items Bought (approved, buying not finished), so a buyer can
// still resolve a line from stock. `onHand` is what the warehouse holds in total.
async function makeProjectReqAtItemsBought(opts: {
  destination: 'inventory' | 'jobsite'
  qty: number
  fromStock: number
  onHand: number
}): Promise<{ reqId: string; lineId: string; productId: string }> {
  const { destination, qty, fromStock, onHand } = opts
  const productId = await makeProduct('pic')
  await receive(productId, onHand)
  const created = await resolvers.Mutation.createRequisition(
    null,
    {
      input: {
        purpose: 'project',
        project_id: projectId,
        delivery_destination: destination,
        lines: [{ product_id: productId, description: 'x', qty, unit_price: 1 }],
      },
    },
    ctx as never,
  )
  const reqId = (created as { id: string }).id
  const lineId = (await pool.query<{ id: string }>(`SELECT id FROM po_lines WHERE requisition_id=$1`, [reqId])).rows[0]!.id
  await resolvers.Mutation.submitRequisitionToInventoryCheck(null, { id: reqId }, ctx as never)
  await resolvers.Mutation.confirmRequisitionInventoryCheck(
    null,
    {
      id: reqId,
      lineStockQtys: [
        { lineId, qtyFromStock: fromStock, sourceLocationId: fromStock > 0 ? warehouseId : undefined },
      ],
    },
    ctx as never,
  )
  await resolvers.Mutation.submitRequisitionMarketPricing(
    null,
    { id: reqId, linePrices: [{ lineId, marketPrice: 10, currencyCode: 'IQD' }] },
    ctx as never,
  )
  await resolvers.Mutation.verifyRequisitionPrices(
    null,
    { id: reqId, lineAdjustments: [{ lineId, verifiedPrice: 10 }] },
    ctx as never,
  )
  await resolvers.Mutation.approveRequisition(null, { id: reqId }, ctx as never)
  expect(await statusOf(reqId)).toBe('items_bought')
  return { reqId, lineId, productId }
}

describe.each(['inventory', 'jobsite'] as const)(
  'delivered to %s: every stock-covered line gets a draft Store Out',
  (destination) => {
    it('fully from stock: a draft for the whole quantity, linked to the line and the project, stock reserved', async () => {
      const { reqId, lineId, productId } = await makeProjectReq({ destination, qty: 6, fromStock: 6 })
      const rows = await storeOutLines(reqId)
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ status: 'draft', po_line_id: lineId, project_id: projectId })
      expect(parseFloat(rows[0]!.qty_issued)).toBe(6)
      expect(await statusOf(reqId)).toBe('sourcing')
      expect(await stock(productId)).toEqual({ onHand: 6, reserved: 6 })
    })

    it('confirming it deducts the stock, frees the reservation, charges the project and completes the requisition', async () => {
      const { reqId, productId } = await makeProjectReq({ destination, qty: 6, fromStock: 6 })
      const issueId = (await storeOutLines(reqId))[0]!.issue_id
      await resolvers.Mutation.issueMaterialIssue(null, { id: issueId }, ctx as never)
      expect(await statusOf(reqId)).toBe('completed')
      expect(await stock(productId)).toEqual({ onHand: 0, reserved: 0 })
      const cost = await pool.query<{ c: string }>(
        `SELECT COUNT(*) AS c FROM project_cost_actuals WHERE source_type='stock_issue' AND source_id=$1`,
        [issueId],
      )
      expect(parseInt(cost.rows[0]!.c, 10)).toBeGreaterThan(0)
    })

    it('part from stock, rest bought: the draft covers only the stock part, and both it and the child PO must finish', async () => {
      const { reqId, productId, childId } = await makeProjectReq({ destination, qty: 10, fromStock: 4 })
      const rows = await storeOutLines(reqId)
      expect(rows).toHaveLength(1)
      expect(parseFloat(rows[0]!.qty_issued)).toBe(4)
      await finishChild(childId!)
      expect(await statusOf(reqId)).toBe('sourcing') // the Store Out is still a draft
      expect(await stock(productId)).toEqual({ onHand: 4, reserved: 4 })
      await resolvers.Mutation.issueMaterialIssue(null, { id: rows[0]!.issue_id }, ctx as never)
      expect(await statusOf(reqId)).toBe('completed')
      expect(await stock(productId)).toEqual({ onHand: 0, reserved: 0 })
    })

    it('part from stock, the remainder marked short so nothing is forked: confirming the Store Out completes it', async () => {
      const { reqId, productId } = await makeProjectReq({ destination, qty: 5, fromStock: 2, shortRest: true })
      expect(await statusOf(reqId)).toBe('sourcing')
      const rows = await storeOutLines(reqId)
      expect(rows).toHaveLength(1)
      await resolvers.Mutation.issueMaterialIssue(null, { id: rows[0]!.issue_id }, ctx as never)
      expect(await statusOf(reqId)).toBe('completed')
      expect(await stock(productId)).toEqual({ onHand: 0, reserved: 0 })
    })

    it('a line with no stock cover gets no Store Out', async () => {
      const { reqId } = await makeProjectReqAtItemsBought({ destination, qty: 10, fromStock: 0, onHand: 0 })
      expect(await storeOutLines(reqId)).toHaveLength(0)
    })
  },
)

describe.each(['inventory', 'jobsite'] as const)(
  'delivered to %s: a line a buyer resolves from stock at Items Bought also gets its draft Store Out',
  (destination) => {
    const resolve = (lineId: string, qty: number) =>
      resolvers.Mutation.resolveRequisitionLineFromStock(
        null,
        { lineId, qty, sourceLocationId: warehouseId },
        ctx as never,
      )

    it('creates a draft line for the resolved quantity and keeps it reserved for that draft', async () => {
      const { reqId, lineId, productId } = await makeProjectReqAtItemsBought({
        destination,
        qty: 10,
        fromStock: 0,
        onHand: 3,
      })
      await resolve(lineId, 3)
      const rows = await storeOutLines(reqId)
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ status: 'draft', po_line_id: lineId, project_id: projectId })
      expect(parseFloat(rows[0]!.qty_issued)).toBe(3)
      expect(await stock(productId)).toEqual({ onHand: 3, reserved: 3 })
    })

    it('adds only the new quantity, to the draft that is already open', async () => {
      const { reqId, lineId } = await makeProjectReqAtItemsBought({
        destination,
        qty: 10,
        fromStock: 4,
        onHand: 7,
      })
      expect(await storeOutLines(reqId)).toHaveLength(1) // the 4 from approval
      await resolve(lineId, 3)
      const rows = await storeOutLines(reqId)
      expect(new Set(rows.map((r) => r.issue_id)).size).toBe(1) // one draft, not two
      expect(rows.map((r) => parseFloat(r.qty_issued)).sort()).toEqual([3, 4])
    })

    it('the requisition can then be finished end to end: buy the rest, finish the child, confirm the Store Out', async () => {
      const { reqId, lineId, productId } = await makeProjectReqAtItemsBought({
        destination,
        qty: 10,
        fromStock: 0,
        onHand: 3,
      })
      await resolve(lineId, 3)
      await resolvers.Mutation.recordLinePurchase(
        null,
        {
          input: {
            lineId,
            vendorId,
            qty: 7,
            actualUnitPrice: 10,
            currencyCode: 'IQD',
            receiptFileId: await makeUploadedFile(),
          },
        },
        ctx as never,
      )
      await resolvers.Mutation.finishBuyingRequisition(null, { id: reqId }, ctx as never)
      const childId = (await pool.query<{ id: string }>(`SELECT id FROM purchase_orders WHERE requisition_id=$1`, [reqId])).rows[0]!.id
      await finishChild(childId)
      expect(await statusOf(reqId)).toBe('sourcing') // the resolved 3 are still a draft
      const rows = await storeOutLines(reqId)
      await resolvers.Mutation.issueMaterialIssue(null, { id: rows[0]!.issue_id }, ctx as never)
      expect(await statusOf(reqId)).toBe('completed')
      expect(await stock(productId)).toEqual({ onHand: 0, reserved: 0 })
    })
  },
)

describe('materialIssues(requisitionId): Store Outs made by hand for the bought items', () => {
  const materialIssues = async (reqId: string): Promise<{ id: string }[]> =>
    (await resolvers.Query.materialIssues(null, { requisitionId: reqId }, ctx as never)) as { id: string }[]

  async function manualStoreOutForChild(childId: string): Promise<string> {
    const made = await resolvers.Mutation.createMaterialIssue(
      null,
      { projectId, poId: childId, issueDate: new Date().toISOString().slice(0, 10) },
      ctx as never,
    )
    return (made as { id: string }).id
  }

  it('lists a Store Out linked to the requisition\'s child PO, not only ones linked to the requisition itself', async () => {
    const { reqId, childId } = await makeProjectReq({ destination: 'inventory', qty: 10, fromStock: 4 })
    const byHand = await manualStoreOutForChild(childId!)
    const rows = await materialIssues(reqId)
    expect(rows.map((r) => r.id)).toContain(byHand)
  })

  it('does not list a Store Out that belongs to a different requisition\'s child PO', async () => {
    const a = await makeProjectReq({ destination: 'inventory', qty: 10, fromStock: 4 })
    const b = await makeProjectReq({ destination: 'inventory', qty: 10, fromStock: 4 })
    const forB = await manualStoreOutForChild(b.childId!)
    expect((await materialIssues(a.reqId)).map((r) => r.id)).not.toContain(forB)
    expect((await materialIssues(b.reqId)).map((r) => r.id)).toContain(forB)
  })

  it('still lists the Store Outs linked to the requisition itself', async () => {
    const { reqId } = await makeProjectReq({ destination: 'jobsite', qty: 6, fromStock: 6 })
    expect(await materialIssues(reqId)).toHaveLength(1)
  })

  it('returns nothing for a requisition id from another company', async () => {
    const { reqId } = await makeProjectReq({ destination: 'inventory', qty: 10, fromStock: 4 })
    const other = await pool.query<{ id: string }>(
      `INSERT INTO companies (name, legal_name, country_code, currency_code) VALUES ($1,$1,'IQ','IQD') RETURNING id`,
      [`${SKU_PREFIX}OTHER-${Date.now()}`],
    )
    const otherCompanyId = other.rows[0]!.id
    try {
      await pool.query(
        `INSERT INTO user_company_roles (user_id, company_id, role, module) VALUES ($1,$2,'system_admin','all') ON CONFLICT DO NOTHING`,
        [userId, otherCompanyId],
      )
      const otherCtx = { auth: { ...ctx.auth, companyId: otherCompanyId } }
      const rows = (await resolvers.Query.materialIssues(null, { requisitionId: reqId }, otherCtx as never)) as unknown[]
      expect(rows).toHaveLength(0)
    } finally {
      await pool.query(`DELETE FROM user_company_roles WHERE company_id=$1`, [otherCompanyId])
      await pool.query(`DELETE FROM companies WHERE id=$1`, [otherCompanyId])
    }
  })
})
