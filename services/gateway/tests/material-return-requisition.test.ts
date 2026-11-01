// A Store Out made against a REQUISITION can be returned (Material Return).
//
// Found live: three Nishtimani Yakam Store Outs of PLMB-727 (12 units, issued out of the
// central warehouse, Nishtimani Factory) could not be returned. The Material Return dialog said
// "nothing outstanding on any purchase order" because a return was scoped to a PO
// (`returnableMaterialIssueLines` required `po_id IS NOT NULL`, `createMaterialReturn` required a
// `poId`), while since the G1 requisition split the Store Out for a stock-covered line is made
// against the requisition and has no po_id at all. Migration 310 adds `requisition_id` to the
// return header; a return now hangs off exactly one of PO / requisition.
//
// Also covers the stock-move notes of a cross-company Store Out / return, which used to carry the
// raw company id ("Store Out SO-00014 to company 00000000-0000-0000-0000-000000000001").
//
// Real Postgres through the resolvers (the Store Outs are made by the real approve + confirm
// flow, the cross-company ones by sourcing the line from the central warehouse's stock).
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'

const TEST_COMPANY_ID = 'f0000000-0000-0000-0000-000000000009'
const FACTORY_COMPANY_ID = 'f0000000-0000-0000-0000-000000000010'
const TEST_USER_EMAIL = 'material-return-requisition-test@fnc-erp.local'
const SKU_PREFIX = 'MRREQ-'
const UUID_FRAGMENT = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/i

let userId: string
let projectId: string
let warehouseId: string
let virtualInId: string
let factoryWarehouseId: string
let factoryVirtualInId: string
let ctx: { auth: { companyId: string; userId: string; role: string; module: string; sessionId: string } }
let factoryCtx: typeof ctx

async function makeProduct(companyId: string, suffix: string): Promise<string> {
  const sku = `${SKU_PREFIX}${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const r = await pool.query<{ id: string }>(
    `INSERT INTO products (company_id, sku, name, uom, category) VALUES ($1,$2,$3,'unit','general') RETURNING id`,
    [companyId, sku, sku],
  )
  return r.rows[0]!.id
}

async function receive(companyId: string, productId: string, qty: number, unitCost = 10): Promise<void> {
  const own = companyId === TEST_COMPANY_ID
  await pool.query(
    `INSERT INTO stock_moves (company_id, product_id, from_location_id, to_location_id, moved_at, qty, unit_cost, total_cost, source_type, moved_by)
     VALUES ($1,$2,$3,$4,NOW(),$5,$6,$7,'po_receipt',$8)`,
    [
      companyId,
      productId,
      own ? virtualInId : factoryVirtualInId,
      own ? warehouseId : factoryWarehouseId,
      qty,
      unitCost,
      qty * unitCost,
      userId,
    ],
  )
}

async function onHand(productId: string, locationId: string): Promise<number> {
  const r = await pool.query<{ qty_on_hand: string }>(
    `SELECT qty_on_hand FROM stock_balances WHERE product_id=$1 AND location_id=$2 AND lot_id IS NULL`,
    [productId, locationId],
  )
  return parseFloat(r.rows[0]?.qty_on_hand ?? '0')
}

interface StoreOut {
  reqId: string
  reqNumber: string
  issueId: string
  issueLineId: string
  productId: string
  sourceLocationId: string
  unitCost: number
}

// A one-line project requisition covered 100% from stock, taken through the real inventory check
// and approval (which makes the draft Store Out), then optionally confirmed (which deducts the
// stock and charges the project). `source: 'factory'` takes the stock from the central
// warehouse's own company, so confirming it is a cross-company Store Out.
async function makeStoreOut(opts: { qty: number; source: 'own' | 'factory'; confirm?: boolean }): Promise<StoreOut> {
  const { qty, source } = opts
  const stockCompany = source === 'own' ? TEST_COMPANY_ID : FACTORY_COMPANY_ID
  const productId = await makeProduct(stockCompany, 'so')
  await receive(stockCompany, productId, qty + 20)
  const sourceLocationId = source === 'own' ? warehouseId : factoryWarehouseId

  // A requisition line can only be created against the requisition's own company's catalogue,
  // so a central-warehouse item is brought in by reselecting it at the inventory check — the
  // same way a store keeper does it.
  const lineProductId = source === 'own' ? productId : await makeProduct(TEST_COMPANY_ID, 'placeholder')
  const created = (await resolvers.Mutation.createRequisition(
    null,
    {
      input: {
        purpose: 'project',
        project_id: projectId,
        delivery_destination: 'inventory',
        lines: [{ product_id: lineProductId, description: 'x', qty, unit_price: 1 }],
      },
    },
    ctx as never,
  )) as { id: string; requisition_number: string }
  const reqId = created.id
  const lineId = (await pool.query<{ id: string }>(`SELECT id FROM po_lines WHERE requisition_id=$1`, [reqId])).rows[0]!.id

  await resolvers.Mutation.submitRequisitionToInventoryCheck(null, { id: reqId }, ctx as never)
  await resolvers.Mutation.confirmRequisitionInventoryCheck(
    null,
    {
      id: reqId,
      lineStockQtys: [
        { lineId, qtyFromStock: qty, sourceLocationId, ...(source === 'factory' ? { productId } : {}) },
      ],
    },
    ctx as never,
  )
  await resolvers.Mutation.approveRequisition(null, { id: reqId }, ctx as never)

  const issueId = (
    await pool.query<{ id: string }>(`SELECT id FROM project_material_issues WHERE requisition_id=$1`, [reqId])
  ).rows[0]!.id
  if (opts.confirm !== false) {
    await resolvers.Mutation.issueMaterialIssue(null, { id: issueId }, ctx as never)
  }
  const line = (
    await pool.query<{ id: string; unit_cost: string }>(
      `SELECT id, unit_cost FROM project_material_issue_lines WHERE issue_id=$1`,
      [issueId],
    )
  ).rows[0]!
  return {
    reqId,
    reqNumber: created.requisition_number,
    issueId,
    issueLineId: line.id,
    productId,
    sourceLocationId,
    unitCost: parseFloat(line.unit_cost),
  }
}

interface ReturnableRow {
  issueLineId: string
  issueNumber: string
  poId: string | null
  poNumber: string | null
  requisitionId: string | null
  requisitionNumber: string | null
  qtyIssued: number
  qtyReturnedSoFar: number
  qtyReturnable: number
}
const returnable = async (args: Record<string, string>, as = ctx): Promise<ReturnableRow[]> =>
  (await resolvers.Query.returnableMaterialIssueLines(null, args, as as never)) as ReturnableRow[]

async function cleanup(): Promise<void> {
  const myReturns = `SELECT id FROM project_material_returns WHERE created_by=$1`
  const myReqs = `SELECT id FROM requisitions WHERE company_id=$2 AND organizer_id=$1`
  const myIssues = `SELECT id FROM project_material_issues WHERE created_by=$1`
  const myProducts = `SELECT id FROM products WHERE sku LIKE $1`

  await pool.query(`DELETE FROM project_material_return_lines WHERE return_id IN (${myReturns})`, [userId])
  await pool.query(
    `DELETE FROM project_cost_actuals WHERE (source_type='material_return' AND source_id IN (${myReturns}))
        OR (source_type='stock_issue' AND source_id IN (${myIssues}))`,
    [userId],
  )
  await pool.query(
    `DELETE FROM interco_stock_transfer_lines WHERE transfer_id IN (SELECT id FROM interco_stock_transfers WHERE initiated_by=$1)`,
    [userId],
  )
  await pool.query(`DELETE FROM interco_stock_transfers WHERE initiated_by=$1`, [userId])
  await pool.query(`DELETE FROM interco_transactions WHERE created_by=$1`, [userId])
  await pool.query(`DELETE FROM project_material_returns WHERE created_by=$1`, [userId])
  await pool.query(
    `DELETE FROM project_material_issue_lines WHERE issue_id IN (${myIssues})`,
    [userId],
  )
  await pool.query(`DELETE FROM project_material_issues WHERE created_by=$1`, [userId])
  // Moves of a cross-company Store Out sit under either company but always on one of these products.
  await pool.query(`DELETE FROM stock_moves WHERE product_id IN (${myProducts})`, [`${SKU_PREFIX}%`])
  await pool.query(`DELETE FROM stock_balances WHERE product_id IN (${myProducts})`, [`${SKU_PREFIX}%`])
  await pool.query(`DELETE FROM requisition_approved_totals WHERE requisition_id IN (${myReqs})`, [userId, TEST_COMPANY_ID])
  await pool.query(`DELETE FROM requisition_approval_log WHERE requisition_id IN (${myReqs})`, [userId, TEST_COMPANY_ID])
  await pool.query(`DELETE FROM po_lines WHERE requisition_id IN (${myReqs})`, [userId, TEST_COMPANY_ID])
  await pool.query(`DELETE FROM requisitions WHERE company_id=$2 AND organizer_id=$1`, [userId, TEST_COMPANY_ID])
  await pool.query(`DELETE FROM products WHERE sku LIKE $1`, [`${SKU_PREFIX}%`])
  await pool.query(`DELETE FROM projects WHERE company_id=$1 AND code LIKE $2`, [TEST_COMPANY_ID, `${SKU_PREFIX}%`])
}

beforeAll(async () => {
  const userR = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [TEST_USER_EMAIL],
  )
  userId = userR.rows[0]!.id
  ctx = { auth: { companyId: TEST_COMPANY_ID, userId, role: 'system_admin', module: 'all', sessionId: 'mrreq-test' } }
  factoryCtx = { auth: { ...ctx.auth, companyId: FACTORY_COMPANY_ID } }

  const loc = async (companyId: string, type: string): Promise<string> => {
    const r = await pool.query<{ id: string }>(
      `SELECT id FROM stock_locations WHERE company_id=$1 AND type=$2 AND is_active=true LIMIT 1`,
      [companyId, type],
    )
    if (!r.rows[0]) throw new Error(`No ${type} location seeded for ${companyId} — run seeds first`)
    return r.rows[0].id
  }
  warehouseId = await loc(TEST_COMPANY_ID, 'warehouse')
  virtualInId = await loc(TEST_COMPANY_ID, 'virtual_in')
  factoryWarehouseId = await loc(FACTORY_COMPANY_ID, 'warehouse')
  factoryVirtualInId = await loc(FACTORY_COMPANY_ID, 'virtual_in')
  // Same belt-and-braces as requisition-inventory-check.test.ts: migrations run before seeds.
  await pool.query(`UPDATE companies SET is_central_warehouse=true WHERE id=$1`, [FACTORY_COMPANY_ID])

  await cleanup()

  const code = `${SKU_PREFIX}PRJ-${Date.now()}`
  const p = await pool.query<{ id: string }>(
    `INSERT INTO projects (company_id, code, name, status, created_by) VALUES ($1,$2,$2,'ongoing',$3) RETURNING id`,
    [TEST_COMPANY_ID, code, userId],
  )
  projectId = p.rows[0]!.id
})

afterAll(async () => {
  await cleanup()
  await pool.query(`DELETE FROM users WHERE email=$1`, [TEST_USER_EMAIL])
  await pool.end()
})

describe('returnableMaterialIssueLines — a Store Out made against a requisition', () => {
  it('is offered with its requisition number and no PO, found by project + item (what the dialog sends)', async () => {
    const so = await makeStoreOut({ qty: 6, source: 'own' })

    const rows = await returnable({ projectId, productId: so.productId })

    expect(rows).toHaveLength(1)
    expect(rows[0]!.issueLineId).toBe(so.issueLineId)
    expect(rows[0]!.poId).toBeNull()
    expect(rows[0]!.poNumber).toBeNull()
    expect(rows[0]!.requisitionId).toBe(so.reqId)
    expect(rows[0]!.requisitionNumber).toBe(so.reqNumber)
    expect(rows[0]!.qtyIssued).toBe(6)
    expect(rows[0]!.qtyReturnable).toBe(6)
  })

  it('is not offered while its Store Out is still a draft (nothing has left the warehouse yet)', async () => {
    const so = await makeStoreOut({ qty: 3, source: 'own', confirm: false })
    expect(await returnable({ productId: so.productId })).toEqual([])
  })

  it("is not offered to another company's user", async () => {
    const so = await makeStoreOut({ qty: 2, source: 'own' })
    expect(await returnable({ productId: so.productId }, factoryCtx)).toEqual([])
  })
})

describe('createMaterialReturn — requisition Store Out (same company)', () => {
  it('puts the stock back, offsets the project cost, hangs the return off the requisition, and shrinks what is returnable', async () => {
    const so = await makeStoreOut({ qty: 6, source: 'own' })
    const afterStoreOut = await onHand(so.productId, warehouseId)

    const result = (await resolvers.Mutation.createMaterialReturn(
      null,
      { input: { requisitionId: so.reqId, lines: [{ issueLineId: so.issueLineId, toLocationId: warehouseId, qtyReturned: 4 }] } },
      ctx as never,
    )) as {
      id: string
      poId: string | null
      requisitionId: string | null
      requisitionNumber: string | null
      projectId: string | null
      lines: { qtyReturned: number; issueLineId: string | null }[]
    }

    expect(result.poId).toBeNull()
    expect(result.requisitionId).toBe(so.reqId)
    expect(result.requisitionNumber).toBe(so.reqNumber)
    expect(result.projectId).toBe(projectId)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.qtyReturned).toBe(4)

    expect(await onHand(so.productId, warehouseId)).toBe(afterStoreOut + 4)

    const header = await pool.query<{ po_id: string | null; requisition_id: string | null; project_id: string | null }>(
      `SELECT po_id, requisition_id, project_id FROM project_material_returns WHERE id=$1`,
      [result.id],
    )
    expect(header.rows[0]).toEqual({ po_id: null, requisition_id: so.reqId, project_id: projectId })

    // Reverses what issueMaterialIssue charged: the Store Out's own project, qty x the line's cost.
    const offset = await pool.query<{ project_id: string; amount: string }>(
      `SELECT project_id, amount FROM project_cost_actuals WHERE source_type='material_return' AND source_id=$1`,
      [result.id],
    )
    expect(offset.rows).toHaveLength(1)
    expect(offset.rows[0]!.project_id).toBe(projectId)
    expect(parseFloat(offset.rows[0]!.amount)).toBeCloseTo(-4 * so.unitCost, 4)

    const left = await returnable({ projectId, productId: so.productId })
    expect(left[0]!.qtyReturnedSoFar).toBe(4)
    expect(left[0]!.qtyReturnable).toBe(2)

    await expect(
      resolvers.Mutation.createMaterialReturn(
        null,
        { input: { requisitionId: so.reqId, lines: [{ issueLineId: so.issueLineId, toLocationId: warehouseId, qtyReturned: 3 }] } },
        ctx as never,
      ),
    ).rejects.toThrow(/only 2 still returnable/)
  })

  it('can be returned in two steps; once all of it is back nothing is offered any more', async () => {
    const so = await makeStoreOut({ qty: 5, source: 'own' })
    for (const qtyReturned of [3, 2]) {
      await resolvers.Mutation.createMaterialReturn(
        null,
        { input: { requisitionId: so.reqId, lines: [{ issueLineId: so.issueLineId, toLocationId: warehouseId, qtyReturned }] } },
        ctx as never,
      )
    }
    expect(await returnable({ projectId, productId: so.productId })).toEqual([])
  })

  it('shows up in the returns list with its requisition number, and a PO filter does not match it', async () => {
    const so = await makeStoreOut({ qty: 2, source: 'own' })
    const made = (await resolvers.Mutation.createMaterialReturn(
      null,
      { input: { requisitionId: so.reqId, lines: [{ issueLineId: so.issueLineId, toLocationId: warehouseId, qtyReturned: 1 }] } },
      ctx as never,
    )) as { id: string }

    const byProject = (await resolvers.Query.materialReturns(null, { projectId }, ctx as never)) as {
      id: string
      poId: string | null
      requisitionNumber: string | null
    }[]
    const row = byProject.find((r) => r.id === made.id)
    expect(row?.poId).toBeNull()
    expect(row?.requisitionNumber).toBe(so.reqNumber)

    const byPo = (await resolvers.Query.materialReturns(
      null,
      { poId: '00000000-0000-0000-0000-00000000dead' },
      ctx as never,
    )) as { id: string }[]
    expect(byPo.find((r) => r.id === made.id)).toBeUndefined()
  })

  it('rejects: neither or both of poId / requisitionId, a line of another requisition, a PO-delivery line, an unknown requisition, and another company', async () => {
    const a = await makeStoreOut({ qty: 2, source: 'own' })
    const b = await makeStoreOut({ qty: 2, source: 'own' })
    const line = { issueLineId: a.issueLineId, toLocationId: warehouseId, qtyReturned: 1 }
    const create = (input: Record<string, unknown>, as = ctx) =>
      resolvers.Mutation.createMaterialReturn(null, { input }, as as never)

    await expect(create({ lines: [line] })).rejects.toThrow(/exactly one of poId or requisitionId/)
    await expect(
      create({ poId: '00000000-0000-0000-0000-00000000dead', requisitionId: a.reqId, lines: [line] }),
    ).rejects.toThrow(/exactly one of poId or requisitionId/)

    // a's Store Out line, offered under b's requisition
    await expect(create({ requisitionId: b.reqId, lines: [line] })).rejects.toThrow(/does not belong to this requisition/)

    await expect(
      create({
        requisitionId: a.reqId,
        lines: [{ poLineId: '00000000-0000-0000-0000-00000000dead', toLocationId: warehouseId, qtyReturned: 1 }],
      }),
    ).rejects.toThrow(/only bring back Store Out lines/)

    await expect(create({ requisitionId: '00000000-0000-0000-0000-00000000dead', lines: [line] })).rejects.toThrow(
      /Requisition not found/,
    )
    // Same requisition id, but asked by a user of another company: not found, nothing touched.
    await expect(create({ requisitionId: a.reqId, lines: [line] }, factoryCtx)).rejects.toThrow(/Requisition not found/)

    const none = await pool.query(`SELECT 1 FROM project_material_returns WHERE requisition_id IN ($1,$2)`, [a.reqId, b.reqId])
    expect(none.rows).toHaveLength(0)
  })
})

describe('a Store Out sourced from the central warehouse (cross-company)', () => {
  it('names the two companies in the stock-move notes, never their ids', async () => {
    const so = await makeStoreOut({ qty: 4, source: 'factory' })
    const names = await pool.query<{ id: string; name: string }>(`SELECT id, name FROM companies WHERE id = ANY($1)`, [
      [TEST_COMPANY_ID, FACTORY_COMPANY_ID],
    ])
    const nameOf = (id: string) => names.rows.find((r) => r.id === id)!.name

    const moves = await pool.query<{ company_id: string; notes: string }>(
      `SELECT company_id, notes FROM stock_moves WHERE source_type='material_issue' AND source_id=$1 ORDER BY company_id`,
      [so.issueId],
    )
    expect(moves.rows).toHaveLength(2)
    const factoryMove = moves.rows.find((m) => m.company_id === FACTORY_COMPANY_ID)!
    const projectCompanyMove = moves.rows.find((m) => m.company_id === TEST_COMPANY_ID)!
    expect(factoryMove.notes).toContain(`to company ${nameOf(TEST_COMPANY_ID)}`)
    expect(projectCompanyMove.notes).toContain(`from company ${nameOf(FACTORY_COMPANY_ID)}`)
    for (const m of moves.rows) expect(m.notes).not.toMatch(UUID_FRAGMENT)
  })

  it('goes back into the central warehouse, with a reversing bill, a project cost offset, and readable notes', async () => {
    const so = await makeStoreOut({ qty: 6, source: 'factory' })
    const centralAfterStoreOut = await onHand(so.productId, factoryWarehouseId)

    const result = (await resolvers.Mutation.createMaterialReturn(
      null,
      { input: { requisitionId: so.reqId, lines: [{ issueLineId: so.issueLineId, toLocationId: factoryWarehouseId, qtyReturned: 3 }] } },
      ctx as never,
    )) as { id: string; returnNumber: string; requisitionNumber: string | null }
    expect(result.requisitionNumber).toBe(so.reqNumber)

    // The central warehouse has the units again.
    expect(await onHand(so.productId, factoryWarehouseId)).toBe(centralAfterStoreOut + 3)

    // A posted transfer and a PENDING bill from the project's company back to the central warehouse
    // (Finance posts it, exactly as for the original Store Out).
    const transfer = await pool.query<{ from_company_id: string; to_company_id: string; status: string; tx_status: string; amount: string }>(
      `SELECT t.from_company_id, t.to_company_id, t.status, x.status AS tx_status, x.amount
         FROM interco_stock_transfers t
         JOIN interco_transactions x ON x.id = t.interco_transaction_id
        WHERE t.source_type='material_return' AND t.source_id=$1`,
      [result.id],
    )
    expect(transfer.rows).toHaveLength(1)
    expect(transfer.rows[0]!.from_company_id).toBe(TEST_COMPANY_ID)
    expect(transfer.rows[0]!.to_company_id).toBe(FACTORY_COMPANY_ID)
    expect(transfer.rows[0]!.status).toBe('posted')
    expect(transfer.rows[0]!.tx_status).toBe('pending')
    expect(parseFloat(transfer.rows[0]!.amount)).toBeCloseTo(3 * so.unitCost, 4)

    // The project is credited back at the price the Store Out charged it.
    const offset = await pool.query<{ project_id: string; amount: string }>(
      `SELECT project_id, amount FROM project_cost_actuals WHERE source_type='material_return' AND source_id=$1`,
      [result.id],
    )
    expect(offset.rows).toHaveLength(1)
    expect(offset.rows[0]!.project_id).toBe(projectId)
    expect(parseFloat(offset.rows[0]!.amount)).toBeCloseTo(-3 * so.unitCost, 4)

    // The central warehouse's own move names the project company, not its id.
    const moves = await pool.query<{ notes: string }>(
      `SELECT notes FROM stock_moves WHERE source_type='material_return' AND source_id=$1`,
      [result.id],
    )
    expect(moves.rows.length).toBeGreaterThanOrEqual(2)
    for (const m of moves.rows) expect(m.notes).not.toMatch(UUID_FRAGMENT)
    const companyName = (await pool.query<{ name: string }>(`SELECT name FROM companies WHERE id=$1`, [TEST_COMPANY_ID])).rows[0]!.name
    expect(moves.rows.some((m) => m.notes.includes(`from company ${companyName}`))).toBe(true)

    expect((await returnable({ projectId, productId: so.productId }))[0]!.qtyReturnable).toBe(3)
  })
})
