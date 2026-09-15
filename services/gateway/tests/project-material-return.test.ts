// Integration tests for Material Return — reversing part or all of an
// already-issued Store Out line back into real inventory. Scoped by
// Purchase Order (not project directly — a PO can have no project at all,
// a general-stock PO, per issueMaterialIssue's own "Store-outs with no
// project" comment). Deliberately not mocking @fnc-erp/db, same
// real-Postgres pattern as po-stock-locking.test.ts, since this needs the
// stock_moves -> stock_balances trigger to actually fire.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'

const TEST_COMPANY_ID = '00000000-0000-0000-0000-000000000001'
const TEST_USER_EMAIL = 'material-return-test@fnc-erp.local'
const SKU_PREFIX = 'MRETTEST-'
const PO_PREFIX = 'MRETTEST-PO-'

let userId: string
let vendorId: string
let warehouseId: string
let secondWarehouseId: string
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

async function getBalance(productId: string, locationId: string): Promise<{ onHand: number }> {
  const r = await pool.query<{ qty_on_hand: string }>(
    `SELECT qty_on_hand FROM stock_balances WHERE product_id=$1 AND location_id=$2 AND lot_id IS NULL`,
    [productId, locationId],
  )
  return { onHand: parseFloat(r.rows[0]?.qty_on_hand ?? '0') }
}

async function makeProject(suffix: string): Promise<string> {
  const code = `${SKU_PREFIX}${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const r = await pool.query<{ id: string }>(
    `INSERT INTO projects (company_id, code, name, status, created_by) VALUES ($1,$2,$3,'ongoing',$4) RETURNING id`,
    [TEST_COMPANY_ID, code, code, userId],
  )
  return r.rows[0]!.id
}

// projectId may be null — exercising the general-stock (no project) case.
async function makePO(projectId: string | null): Promise<string> {
  const poNumber = `${PO_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const r = await pool.query<{ id: string }>(
    `INSERT INTO purchase_orders (company_id, po_number, vendor_id, status, currency_code, project_id, created_by)
     VALUES ($1,$2,$3,'draft','IQD',$4,$5) RETURNING id`,
    [TEST_COMPANY_ID, poNumber, vendorId, projectId, userId],
  )
  return r.rows[0]!.id
}

// Creates and confirms a Store Out linked to the given PO (and whatever
// project that PO itself belongs to, if any), returning the issue line id.
async function makeIssuedLine(
  poId: string,
  projectId: string | null,
  productId: string,
  qty: number,
  fromLocationId: string,
  unitCost = 10,
): Promise<string> {
  const issue = (await resolvers.Mutation.createMaterialIssue(
    null,
    { projectId: projectId ?? undefined, poId, issueDate: new Date().toISOString().slice(0, 10) },
    ctx as never,
  )) as { id: string }
  await resolvers.Mutation.addMaterialIssueLine(
    null,
    { issueId: issue.id, productId, qtyIssued: qty, unitCost, fromLocationId },
    ctx as never,
  )
  // A po_id-linked Store Out requires a real reservation to already exist
  // (issueMaterialIssue's strict branch) — mirrors what confirmPOInventoryCheck
  // would have done at the PO's own inventory-check step.
  await pool.query(
    `UPDATE stock_balances SET qty_reserved = qty_reserved + $1 WHERE product_id=$2 AND location_id=$3 AND lot_id IS NULL`,
    [qty, productId, fromLocationId],
  )
  await resolvers.Mutation.issueMaterialIssue(null, { id: issue.id }, ctx as never)
  const lineRow = await pool.query<{ id: string }>(
    `SELECT id FROM project_material_issue_lines WHERE issue_id=$1`,
    [issue.id],
  )
  return lineRow.rows[0]!.id
}

// A PO whose material was delivered straight to a jobsite (recordDirectDelivery
// / migration 209) rather than through the warehouse — project_id and
// linked_project_id are deliberately set to the SAME value here, matching how
// the real PO-creation mutation keeps them in sync; createMaterialReturn's
// direct-delivery branch reads linked_project_id specifically (see its own
// comment on why), so this is what exercises that path realistically.
async function makeDirectDeliveryPO(projectId: string): Promise<string> {
  const poNumber = `${PO_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const r = await pool.query<{ id: string }>(
    `INSERT INTO purchase_orders (company_id, po_number, vendor_id, status, currency_code, purpose, project_id, linked_project_id, delivery_destination, created_by)
     VALUES ($1,$2,$3,'approved','IQD','project',$4,$4,'jobsite',$5) RETURNING id`,
    [TEST_COMPANY_ID, poNumber, vendorId, projectId, userId],
  )
  return r.rows[0]!.id
}

async function makePOLine(
  poId: string,
  productId: string | null,
  qtyOrdered: number,
  unitPrice: number,
): Promise<string> {
  const numR = await pool.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM po_lines WHERE po_id=$1`,
    [poId],
  )
  const lineNumber = parseInt(numR.rows[0]!.n) + 1
  const r = await pool.query<{ id: string }>(
    `INSERT INTO po_lines (po_id, product_id, description, line_number, qty_ordered, unit_price, total_price, uom)
     VALUES ($1,$2,'test direct-delivery line',$3,$4,$5,$6,'unit') RETURNING id`,
    [poId, productId, lineNumber, qtyOrdered, unitPrice, qtyOrdered * unitPrice],
  )
  return r.rows[0]!.id
}

async function deliverDirect(
  poId: string,
  poLineId: string,
  qty: number,
  actualUnitPrice?: number,
): Promise<void> {
  await resolvers.Mutation.recordDirectDelivery(
    null,
    {
      poId,
      input: {
        received_date: new Date().toISOString().slice(0, 10),
        lines: [{ po_line_id: poLineId, qty_received: qty, actual_unit_price: actualUnitPrice }],
      },
    },
    ctx as never,
  )
}

async function cleanup(): Promise<void> {
  await pool.query(
    `DELETE FROM project_material_return_lines WHERE return_id IN (SELECT id FROM project_material_returns WHERE company_id=$1)`,
    [TEST_COMPANY_ID],
  )
  await pool.query(`DELETE FROM project_material_returns WHERE company_id=$1`, [TEST_COMPANY_ID])
  await pool.query(
    `DELETE FROM project_cost_actuals WHERE project_id IN (SELECT id FROM projects WHERE company_id=$1 AND code LIKE $2)`,
    [TEST_COMPANY_ID, `${SKU_PREFIX}%`],
  )
  await pool.query(
    `DELETE FROM project_material_issue_lines WHERE issue_id IN (SELECT id FROM project_material_issues WHERE company_id=$1)`,
    [TEST_COMPANY_ID],
  )
  await pool.query(`DELETE FROM project_material_issues WHERE company_id=$1`, [TEST_COMPANY_ID])
  // po_return_items/po_returns have no ON DELETE CASCADE from po_lines/
  // purchase_orders — must go before the purchase_orders delete below, whose
  // cascade to po_lines would otherwise be blocked by these still referencing it.
  await pool.query(
    `DELETE FROM po_return_items WHERE po_line_id IN (
       SELECT id FROM po_lines WHERE po_id IN (
         SELECT id FROM purchase_orders WHERE company_id=$1 AND po_number LIKE $2
       )
     )`,
    [TEST_COMPANY_ID, `${PO_PREFIX}%`],
  )
  await pool.query(
    `DELETE FROM po_returns WHERE po_id IN (SELECT id FROM purchase_orders WHERE company_id=$1 AND po_number LIKE $2)`,
    [TEST_COMPANY_ID, `${PO_PREFIX}%`],
  )
  await pool.query(`DELETE FROM purchase_orders WHERE company_id=$1 AND po_number LIKE $2`, [
    TEST_COMPANY_ID,
    `${PO_PREFIX}%`,
  ])
  await pool.query(`DELETE FROM projects WHERE company_id=$1 AND code LIKE $2`, [
    TEST_COMPANY_ID,
    `${SKU_PREFIX}%`,
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
  await pool.query(`DELETE FROM stock_locations WHERE company_id=$1 AND name=$2`, [
    TEST_COMPANY_ID,
    `${SKU_PREFIX}SecondWH`,
  ])
}

beforeAll(async () => {
  const userR = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [TEST_USER_EMAIL],
  )
  userId = userR.rows[0]!.id
  ctx = { auth: { companyId: TEST_COMPANY_ID, userId, role: 'system_admin', module: 'all', sessionId: 'mret-test' } }

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

  const vendorR = await pool.query<{ id: string }>(
    `SELECT id FROM vendors WHERE company_id=$1 LIMIT 1`,
    [TEST_COMPANY_ID],
  )
  vendorId =
    vendorR.rows[0]?.id ??
    (
      await pool.query<{ id: string }>(
        `INSERT INTO vendors (company_id, name) VALUES ($1,$2) RETURNING id`,
        [TEST_COMPANY_ID, `${SKU_PREFIX}Vendor`],
      )
    ).rows[0]!.id

  await cleanup()

  const secondWh = await pool.query<{ id: string }>(
    `INSERT INTO stock_locations (company_id, name, type, is_active) VALUES ($1,$2,'warehouse',true) RETURNING id`,
    [TEST_COMPANY_ID, `${SKU_PREFIX}SecondWH`],
  )
  secondWarehouseId = secondWh.rows[0]!.id
})

afterAll(async () => {
  await cleanup()
  await pool.query(`DELETE FROM users WHERE email=$1`, [TEST_USER_EMAIL])
  await pool.end()
})

describe('returnableMaterialIssueLines', () => {
  it('lists an issued line at full qtyReturnable, then reduces it after a partial return', async () => {
    const productId = await makeProduct('returnable')
    await receive(productId, warehouseId, 20, 15)
    const projectId = await makeProject('returnable')
    const poId = await makePO(projectId)
    const issueLineId = await makeIssuedLine(poId, projectId, productId, 10, warehouseId, 15)

    const before = (await resolvers.Query.returnableMaterialIssueLines(
      null,
      { poId },
      ctx as never,
    )) as { issueLineId: string; qtyIssued: number; qtyReturnedSoFar: number; qtyReturnable: number; unitCost: number }[]
    expect(before).toHaveLength(1)
    expect(before[0]!.issueLineId).toBe(issueLineId)
    expect(before[0]!.qtyIssued).toBe(10)
    expect(before[0]!.qtyReturnedSoFar).toBe(0)
    expect(before[0]!.qtyReturnable).toBe(10)
    expect(before[0]!.unitCost).toBe(15)

    await resolvers.Mutation.createMaterialReturn(
      null,
      { input: { poId, lines: [{ issueLineId, toLocationId: warehouseId, qtyReturned: 4 }] } },
      ctx as never,
    )

    const after = (await resolvers.Query.returnableMaterialIssueLines(
      null,
      { poId },
      ctx as never,
    )) as { qtyReturnedSoFar: number; qtyReturnable: number }[]
    expect(after[0]!.qtyReturnedSoFar).toBe(4)
    expect(after[0]!.qtyReturnable).toBe(6)
  })

  it('excludes a line whose parent Store Out is still draft', async () => {
    const productId = await makeProduct('draft-issue')
    const projectId = await makeProject('draft-issue')
    const poId = await makePO(projectId)
    const issue = (await resolvers.Mutation.createMaterialIssue(
      null,
      { projectId, poId, issueDate: new Date().toISOString().slice(0, 10) },
      ctx as never,
    )) as { id: string }
    await resolvers.Mutation.addMaterialIssueLine(
      null,
      { issueId: issue.id, productId, qtyIssued: 5, unitCost: 10, fromLocationId: warehouseId },
      ctx as never,
    )
    // Never confirmed — still draft.
    const rows = await resolvers.Query.returnableMaterialIssueLines(null, { poId }, ctx as never)
    expect(rows).toEqual([])
  })

  it('returns nothing when neither poId nor projectId is given', async () => {
    const rows = await resolvers.Query.returnableMaterialIssueLines(null, {}, ctx as never)
    expect(rows).toEqual([])
  })
})

describe('createMaterialReturn', () => {
  it('moves stock back to a real warehouse and posts a negative offsetting cost-actual', async () => {
    const productId = await makeProduct('post-stock')
    await receive(productId, warehouseId, 20, 12)
    const projectId = await makeProject('post-stock')
    const poId = await makePO(projectId)
    const issueLineId = await makeIssuedLine(poId, projectId, productId, 8, warehouseId, 12)

    const balAfterIssue = await getBalance(productId, warehouseId)
    expect(balAfterIssue.onHand).toBe(12) // 20 received - 8 issued

    const result = (await resolvers.Mutation.createMaterialReturn(
      null,
      {
        input: {
          poId,
          notes: 'unused leftover',
          lines: [{ issueLineId, toLocationId: warehouseId, qtyReturned: 3 }],
        },
      },
      ctx as never,
    )) as { returnNumber: string; poId: string; projectId: string; lines: { qtyReturned: number; totalCost: number }[] }
    expect(result.returnNumber).toMatch(/^MRET-/)
    expect(result.poId).toBe(poId)
    expect(result.projectId).toBe(projectId)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.qtyReturned).toBe(3)
    expect(result.lines[0]!.totalCost).toBe(36) // 3 * 12

    const balAfterReturn = await getBalance(productId, warehouseId)
    expect(balAfterReturn.onHand).toBe(15) // 12 + 3 returned

    const costActuals = await pool.query<{ amount: string; source_type: string }>(
      `SELECT amount, source_type FROM project_cost_actuals WHERE project_id=$1 ORDER BY created_at`,
      [projectId],
    )
    expect(costActuals.rows).toHaveLength(2)
    expect(parseFloat(costActuals.rows[0]!.amount)).toBe(96) // stock_issue: 8 * 12
    expect(costActuals.rows[1]!.source_type).toBe('material_return')
    expect(parseFloat(costActuals.rows[1]!.amount)).toBe(-36)

    const netMaterialsCost = await pool.query<{ total: string }>(
      `SELECT SUM(amount) AS total FROM project_cost_actuals WHERE project_id=$1`,
      [projectId],
    )
    expect(parseFloat(netMaterialsCost.rows[0]!.total)).toBe(60) // 96 - 36
  })

  it('works for a project-less (general-stock) PO — no cost actuals to post, but stock still moves', async () => {
    const productId = await makeProduct('no-project')
    await receive(productId, warehouseId, 10, 20)
    const poId = await makePO(null)
    const issueLineId = await makeIssuedLine(poId, null, productId, 5, warehouseId, 20)

    const result = (await resolvers.Mutation.createMaterialReturn(
      null,
      { input: { poId, lines: [{ issueLineId, toLocationId: warehouseId, qtyReturned: 5 }] } },
      ctx as never,
    )) as { id: string; poId: string; projectId: string | null }
    expect(result.poId).toBe(poId)
    expect(result.projectId).toBeNull()

    expect((await getBalance(productId, warehouseId)).onHand).toBe(10) // 10 - 5 + 5
    // No project_cost_actuals row should exist for this project-less
    // return — there's no project to offset in the first place.
    const costActuals = await pool.query(
      `SELECT id FROM project_cost_actuals WHERE source_type='material_return' AND source_id=$1`,
      [result.id],
    )
    expect(costActuals.rows).toHaveLength(0)
  })

  it('can return to a different warehouse than the one it was originally issued from', async () => {
    const productId = await makeProduct('diff-wh')
    await receive(productId, warehouseId, 10, 20)
    const projectId = await makeProject('diff-wh')
    const poId = await makePO(projectId)
    const issueLineId = await makeIssuedLine(poId, projectId, productId, 5, warehouseId, 20)

    await resolvers.Mutation.createMaterialReturn(
      null,
      { input: { poId, lines: [{ issueLineId, toLocationId: secondWarehouseId, qtyReturned: 5 }] } },
      ctx as never,
    )

    expect((await getBalance(productId, secondWarehouseId)).onHand).toBe(5)
    expect((await getBalance(productId, warehouseId)).onHand).toBe(5) // 10 received - 5 issued, none came back here
  })

  it('rejects returning more than is still returnable', async () => {
    const productId = await makeProduct('over-return')
    await receive(productId, warehouseId, 10, 10)
    const projectId = await makeProject('over-return')
    const poId = await makePO(projectId)
    const issueLineId = await makeIssuedLine(poId, projectId, productId, 5, warehouseId, 10)

    await expect(
      resolvers.Mutation.createMaterialReturn(
        null,
        { input: { poId, lines: [{ issueLineId, toLocationId: warehouseId, qtyReturned: 6 }] } },
        ctx as never,
      ),
    ).rejects.toThrow(/only 5 still returnable/i)

    // Partially return, then try to return the remainder plus a bit more.
    await resolvers.Mutation.createMaterialReturn(
      null,
      { input: { poId, lines: [{ issueLineId, toLocationId: warehouseId, qtyReturned: 4 }] } },
      ctx as never,
    )
    await expect(
      resolvers.Mutation.createMaterialReturn(
        null,
        { input: { poId, lines: [{ issueLineId, toLocationId: warehouseId, qtyReturned: 2 }] } },
        ctx as never,
      ),
    ).rejects.toThrow(/only 1 still returnable/i)
  })

  it('rejects a line that belongs to a different purchase order', async () => {
    const productId = await makeProduct('wrong-po')
    await receive(productId, warehouseId, 10, 10)
    const projectId = await makeProject('wrong-po')
    const poA = await makePO(projectId)
    const poB = await makePO(projectId)
    const issueLineId = await makeIssuedLine(poA, projectId, productId, 5, warehouseId, 10)

    await expect(
      resolvers.Mutation.createMaterialReturn(
        null,
        { input: { poId: poB, lines: [{ issueLineId, toLocationId: warehouseId, qtyReturned: 1 }] } },
        ctx as never,
      ),
    ).rejects.toThrow(/does not belong to this purchase order/i)
  })

  it('rejects returning to a virtual location', async () => {
    const productId = await makeProduct('virtual-dest')
    await receive(productId, warehouseId, 10, 10)
    const projectId = await makeProject('virtual-dest')
    const poId = await makePO(projectId)
    const issueLineId = await makeIssuedLine(poId, projectId, productId, 5, warehouseId, 10)

    await expect(
      resolvers.Mutation.createMaterialReturn(
        null,
        { input: { poId, lines: [{ issueLineId, toLocationId: virtualInId, qtyReturned: 1 }] } },
        ctx as never,
      ),
    ).rejects.toThrow(/real warehouse or site location/i)
  })

  it('rejects a purchase order that does not exist', async () => {
    await expect(
      resolvers.Mutation.createMaterialReturn(
        null,
        { input: { poId: '00000000-0000-0000-0000-000000000099', lines: [{ issueLineId: '00000000-0000-0000-0000-000000000098', toLocationId: warehouseId, qtyReturned: 1 }] } },
        ctx as never,
      ),
    ).rejects.toThrow(/purchase order not found/i)
  })
})

// Coverage for PO lines delivered straight to a jobsite (recordDirectDelivery
// / migration 209) — these never create a project_material_issue_lines row,
// so the returnableMaterialIssueLines path above can't see them at all.
describe('returnableDirectDeliveryLines', () => {
  it('computes qtyReturnable and a weighted-average unitCost across two partial deliveries at different prices', async () => {
    const productId = await makeProduct('dd-weighted')
    const projectId = await makeProject('dd-weighted')
    const poId = await makeDirectDeliveryPO(projectId)
    const poLineId = await makePOLine(poId, productId, 20, 10)

    // recordDirectDelivery costs every delivery off po_lines.unit_price at
    // the moment it's called (not the actual_unit_price param it also
    // writes — that column isn't read back into the cost calc at all,
    // a separate, pre-existing pricing gap outside this feature's scope) —
    // so a genuine per-batch price change has to happen at the unit_price
    // column itself to exercise weighted-averaging here realistically.
    await deliverDirect(poId, poLineId, 12) // cost = 10 * 12 = 120
    await pool.query(`UPDATE po_lines SET unit_price=15 WHERE id=$1`, [poLineId])
    await deliverDirect(poId, poLineId, 8) // cost = 15 * 8 = 120 -> total 240 / 20 = 12 avg

    const rows = (await resolvers.Query.returnableDirectDeliveryLines(
      null,
      { poId },
      ctx as never,
    )) as {
      poLineId: string
      qtyReceived: number
      qtyReturnedSoFar: number
      qtyVendorReturned: number
      qtyReturnable: number
      unitCost: number
    }[]
    expect(rows).toHaveLength(1)
    expect(rows[0]!.poLineId).toBe(poLineId)
    expect(rows[0]!.qtyReceived).toBe(20)
    expect(rows[0]!.qtyReturnedSoFar).toBe(0)
    expect(rows[0]!.qtyVendorReturned).toBe(0)
    expect(rows[0]!.qtyReturnable).toBe(20)
    expect(rows[0]!.unitCost).toBe(12)
  })

  it('nets an approved vendor return (po_returns) out of the returnable pool', async () => {
    const productId = await makeProduct('dd-vendor-return')
    const projectId = await makeProject('dd-vendor-return')
    const poId = await makeDirectDeliveryPO(projectId)
    const poLineId = await makePOLine(poId, productId, 10, 10)
    await deliverDirect(poId, poLineId, 10, 10)

    const retR = await pool.query<{ id: string }>(
      `INSERT INTO po_returns (company_id, po_id, return_number, status, created_by)
       VALUES ($1,$2,$3,'approved',$4) RETURNING id`,
      [TEST_COMPANY_ID, poId, `${PO_PREFIX}RET-${Date.now()}`, userId],
    )
    await pool.query(
      `INSERT INTO po_return_items (return_id, po_line_id, description, quantity_returned, original_unit_price, assessed_unit_price)
       VALUES ($1,$2,'damaged',3,10,10)`,
      [retR.rows[0]!.id, poLineId],
    )

    const rows = (await resolvers.Query.returnableDirectDeliveryLines(
      null,
      { poId },
      ctx as never,
    )) as { qtyVendorReturned: number; qtyReturnable: number }[]
    expect(rows[0]!.qtyVendorReturned).toBe(3)
    expect(rows[0]!.qtyReturnable).toBe(7) // 10 received - 3 sent back to vendor
  })

  it('returns nothing for a PO that was not delivered direct-to-jobsite', async () => {
    const productId = await makeProduct('dd-not-jobsite')
    await receive(productId, warehouseId, 10, 10)
    const projectId = await makeProject('dd-not-jobsite')
    const poId = await makePO(projectId)
    await makePOLine(poId, productId, 10, 10)

    const rows = await resolvers.Query.returnableDirectDeliveryLines(null, { poId }, ctx as never)
    expect(rows).toEqual([])
  })
})

describe('createMaterialReturn — direct-delivery (jobsite) lines', () => {
  it('brings surplus direct-delivered material into a real warehouse at the weighted-average cost, offsetting linkedProjectId', async () => {
    const productId = await makeProduct('dd-create')
    const projectId = await makeProject('dd-create')
    const poId = await makeDirectDeliveryPO(projectId)
    const poLineId = await makePOLine(poId, productId, 20, 10)
    await deliverDirect(poId, poLineId, 12) // cost = 10 * 12 = 120
    await pool.query(`UPDATE po_lines SET unit_price=15 WHERE id=$1`, [poLineId])
    await deliverDirect(poId, poLineId, 8) // cost = 15 * 8 = 120 -> total 240 / 20 = 12 avg

    const result = (await resolvers.Mutation.createMaterialReturn(
      null,
      { input: { poId, lines: [{ poLineId, toLocationId: warehouseId, qtyReturned: 5 }] } },
      ctx as never,
    )) as { poId: string; projectId: string | null; lines: { qtyReturned: number; unitCost: number; totalCost: number }[] }
    expect(result.poId).toBe(poId)
    expect(result.projectId).toBe(projectId)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.unitCost).toBe(12)
    expect(result.lines[0]!.totalCost).toBe(60) // 5 * 12

    expect((await getBalance(productId, warehouseId)).onHand).toBe(5) // never in stock before — pure arrival

    const costActuals = await pool.query<{ amount: string; source_type: string }>(
      `SELECT amount, source_type FROM project_cost_actuals WHERE project_id=$1 ORDER BY created_at`,
      [projectId],
    )
    // One po_direct_delivery entry (both deliveries merge via its own
    // ON CONFLICT(source_id) ... DO UPDATE, since source_id is the po_line
    // id both times: 120 + 120 = 240) plus one material_return offset (-60).
    expect(costActuals.rows).toHaveLength(2)
    expect(parseFloat(costActuals.rows[0]!.amount)).toBe(240)
    expect(costActuals.rows[1]!.source_type).toBe('material_return')
    expect(parseFloat(costActuals.rows[1]!.amount)).toBe(-60)
  })

  it('rejects returning more than is still returnable net of vendor returns', async () => {
    const productId = await makeProduct('dd-over-return')
    const projectId = await makeProject('dd-over-return')
    const poId = await makeDirectDeliveryPO(projectId)
    const poLineId = await makePOLine(poId, productId, 10, 10)
    await deliverDirect(poId, poLineId, 10, 10)

    const retR = await pool.query<{ id: string }>(
      `INSERT INTO po_returns (company_id, po_id, return_number, status, created_by)
       VALUES ($1,$2,$3,'approved',$4) RETURNING id`,
      [TEST_COMPANY_ID, poId, `${PO_PREFIX}RET-${Date.now()}`, userId],
    )
    await pool.query(
      `INSERT INTO po_return_items (return_id, po_line_id, description, quantity_returned, original_unit_price, assessed_unit_price)
       VALUES ($1,$2,'damaged',4,10,10)`,
      [retR.rows[0]!.id, poLineId],
    )

    await expect(
      resolvers.Mutation.createMaterialReturn(
        null,
        { input: { poId, lines: [{ poLineId, toLocationId: warehouseId, qtyReturned: 7 }] } },
        ctx as never,
      ),
    ).rejects.toThrow(/only 6 still returnable/i) // 10 - 0 already returned - 4 vendor
  })

  it('rejects a po line that belongs to a different purchase order', async () => {
    const productId = await makeProduct('dd-wrong-po')
    const projectId = await makeProject('dd-wrong-po')
    const poA = await makeDirectDeliveryPO(projectId)
    const poB = await makeDirectDeliveryPO(projectId)
    const poLineId = await makePOLine(poA, productId, 10, 10)
    await deliverDirect(poA, poLineId, 10, 10)

    await expect(
      resolvers.Mutation.createMaterialReturn(
        null,
        { input: { poId: poB, lines: [{ poLineId, toLocationId: warehouseId, qtyReturned: 1 }] } },
        ctx as never,
      ),
    ).rejects.toThrow(/does not belong to this purchase order/i)
  })

  it('rejects a po line with no catalog product', async () => {
    const projectId = await makeProject('dd-no-product')
    const poId = await makeDirectDeliveryPO(projectId)
    const poLineId = await makePOLine(poId, null, 10, 10)
    // recordDirectDelivery's cost math doesn't touch product_id at all — a
    // product-less line still gets qty_received bumped and cost posted
    // normally, just queued into pending_product_catalog_items instead.
    await deliverDirect(poId, poLineId, 10, 10)

    await expect(
      resolvers.Mutation.createMaterialReturn(
        null,
        { input: { poId, lines: [{ poLineId, toLocationId: warehouseId, qtyReturned: 1 }] } },
        ctx as never,
      ),
    ).rejects.toThrow(/no catalog product/i)
  })

  it('rejects a po line from a PO that was not a direct-to-jobsite delivery', async () => {
    const productId = await makeProduct('dd-not-jobsite-create')
    await receive(productId, warehouseId, 10, 10)
    const projectId = await makeProject('dd-not-jobsite-create')
    const poId = await makePO(projectId)
    const poLineId = await makePOLine(poId, productId, 10, 10)
    await pool.query(`UPDATE po_lines SET qty_received=10 WHERE id=$1`, [poLineId])

    await expect(
      resolvers.Mutation.createMaterialReturn(
        null,
        { input: { poId, lines: [{ poLineId, toLocationId: warehouseId, qtyReturned: 1 }] } },
        ctx as never,
      ),
    ).rejects.toThrow(/not a direct-to-jobsite delivery/i)
  })

  it('rejects a return line supplying neither issueLineId nor poLineId, or both', async () => {
    const projectId = await makeProject('dd-xor')
    const poId = await makeDirectDeliveryPO(projectId)

    await expect(
      resolvers.Mutation.createMaterialReturn(
        null,
        { input: { poId, lines: [{ toLocationId: warehouseId, qtyReturned: 1 } as never] } },
        ctx as never,
      ),
    ).rejects.toThrow(/exactly one of issueLineId or poLineId/i)

    await expect(
      resolvers.Mutation.createMaterialReturn(
        null,
        {
          input: {
            poId,
            lines: [
              {
                issueLineId: '00000000-0000-0000-0000-000000000096',
                poLineId: '00000000-0000-0000-0000-000000000097',
                toLocationId: warehouseId,
                qtyReturned: 1,
              } as never,
            ],
          },
        },
        ctx as never,
      ),
    ).rejects.toThrow(/exactly one of issueLineId or poLineId/i)
  })
})

// Regression coverage for a real gap found reviewing this feature after
// shipping it: cancelMaterialIssue deletes the issue's own 'stock_issue'
// cost-actual entry but never reverses stock_moves, and — before this fix —
// never checked whether a Material Return already existed against one of
// its lines. That left the return's own negative offsetting entry stranded
// with nothing left for it to offset, silently understating the project's
// real material cost.
describe('cancelMaterialIssue interaction with existing returns', () => {
  it('refuses to cancel an issue once a Material Return exists against one of its lines', async () => {
    const productId = await makeProduct('cancel-after-return')
    await receive(productId, warehouseId, 10, 10)
    const projectId = await makeProject('cancel-after-return')
    const poId = await makePO(projectId)

    const issue = (await resolvers.Mutation.createMaterialIssue(
      null,
      { projectId, poId, issueDate: new Date().toISOString().slice(0, 10) },
      ctx as never,
    )) as { id: string }
    await resolvers.Mutation.addMaterialIssueLine(
      null,
      { issueId: issue.id, productId, qtyIssued: 5, unitCost: 10, fromLocationId: warehouseId },
      ctx as never,
    )
    await pool.query(
      `UPDATE stock_balances SET qty_reserved = qty_reserved + 5 WHERE product_id=$1 AND location_id=$2 AND lot_id IS NULL`,
      [productId, warehouseId],
    )
    await resolvers.Mutation.issueMaterialIssue(null, { id: issue.id }, ctx as never)
    const lineRow = await pool.query<{ id: string }>(
      `SELECT id FROM project_material_issue_lines WHERE issue_id=$1`,
      [issue.id],
    )
    const issueLineId = lineRow.rows[0]!.id

    await resolvers.Mutation.createMaterialReturn(
      null,
      { input: { poId, lines: [{ issueLineId, toLocationId: warehouseId, qtyReturned: 2 }] } },
      ctx as never,
    )

    await expect(
      resolvers.Mutation.cancelMaterialIssue(null, { id: issue.id }, ctx as never),
    ).rejects.toThrow(/Material Return recorded against it/i)

    // Nothing was torn down by the refused cancel — the issue is still
    // 'issued' and both cost-actual entries (the original + the offset)
    // are still present and still net out correctly.
    const status = await pool.query<{ status: string }>(
      `SELECT status FROM project_material_issues WHERE id=$1`,
      [issue.id],
    )
    expect(status.rows[0]!.status).toBe('issued')
    const total = await pool.query<{ total: string }>(
      `SELECT SUM(amount) AS total FROM project_cost_actuals WHERE project_id=$1`,
      [projectId],
    )
    expect(parseFloat(total.rows[0]!.total)).toBe(30) // 50 issued - 20 returned
  })

  it('still allows cancelling an issue with no returns against it', async () => {
    const productId = await makeProduct('cancel-no-return')
    await receive(productId, warehouseId, 10, 10)
    const projectId = await makeProject('cancel-no-return')
    const poId = await makePO(projectId)
    const issue = (await resolvers.Mutation.createMaterialIssue(
      null,
      { projectId, poId, issueDate: new Date().toISOString().slice(0, 10) },
      ctx as never,
    )) as { id: string }
    await resolvers.Mutation.addMaterialIssueLine(
      null,
      { issueId: issue.id, productId, qtyIssued: 5, unitCost: 10, fromLocationId: warehouseId },
      ctx as never,
    )
    await pool.query(
      `UPDATE stock_balances SET qty_reserved = qty_reserved + 5 WHERE product_id=$1 AND location_id=$2 AND lot_id IS NULL`,
      [productId, warehouseId],
    )
    await resolvers.Mutation.issueMaterialIssue(null, { id: issue.id }, ctx as never)

    await resolvers.Mutation.cancelMaterialIssue(null, { id: issue.id }, ctx as never)
    const status = await pool.query<{ status: string }>(
      `SELECT status FROM project_material_issues WHERE id=$1`,
      [issue.id],
    )
    expect(status.rows[0]!.status).toBe('cancelled')
  })
})
