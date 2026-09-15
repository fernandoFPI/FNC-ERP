// Integration tests for Material Return — reversing part or all of an
// already-issued Store Out line back into real inventory. Deliberately not
// mocking @fnc-erp/db, same real-Postgres pattern as po-stock-locking.test.ts,
// since this needs the stock_moves -> stock_balances trigger to actually fire.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'

const TEST_COMPANY_ID = '00000000-0000-0000-0000-000000000001'
const TEST_USER_EMAIL = 'material-return-test@fnc-erp.local'
const SKU_PREFIX = 'MRETTEST-'

let userId: string
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

// Creates and confirms a Store Out for the given project/product/qty,
// returning the issue line id it produced.
async function makeIssuedLine(
  projectId: string,
  productId: string,
  qty: number,
  fromLocationId: string,
  unitCost = 10,
): Promise<string> {
  const issue = (await resolvers.Mutation.createMaterialIssue(
    null,
    { projectId, issueDate: new Date().toISOString().slice(0, 10) },
    ctx as never,
  )) as { id: string }
  await resolvers.Mutation.addMaterialIssueLine(
    null,
    { issueId: issue.id, productId, qtyIssued: qty, unitCost, fromLocationId },
    ctx as never,
  )
  await resolvers.Mutation.issueMaterialIssue(null, { id: issue.id }, ctx as never)
  const lineRow = await pool.query<{ id: string }>(
    `SELECT id FROM project_material_issue_lines WHERE issue_id=$1`,
    [issue.id],
  )
  return lineRow.rows[0]!.id
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
    const issueLineId = await makeIssuedLine(projectId, productId, 10, warehouseId, 15)

    const before = (await resolvers.Query.returnableMaterialIssueLines(
      null,
      { projectId },
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
      { input: { projectId, lines: [{ issueLineId, toLocationId: warehouseId, qtyReturned: 4 }] } },
      ctx as never,
    )

    const after = (await resolvers.Query.returnableMaterialIssueLines(
      null,
      { projectId },
      ctx as never,
    )) as { qtyReturnedSoFar: number; qtyReturnable: number }[]
    expect(after[0]!.qtyReturnedSoFar).toBe(4)
    expect(after[0]!.qtyReturnable).toBe(6)
  })

  it('excludes a line whose parent Store Out is still draft', async () => {
    const productId = await makeProduct('draft-issue')
    const projectId = await makeProject('draft-issue')
    const issue = (await resolvers.Mutation.createMaterialIssue(
      null,
      { projectId, issueDate: new Date().toISOString().slice(0, 10) },
      ctx as never,
    )) as { id: string }
    await resolvers.Mutation.addMaterialIssueLine(
      null,
      { issueId: issue.id, productId, qtyIssued: 5, unitCost: 10, fromLocationId: warehouseId },
      ctx as never,
    )
    // Never confirmed — still draft.
    const rows = await resolvers.Query.returnableMaterialIssueLines(null, { projectId }, ctx as never)
    expect(rows).toEqual([])
  })
})

describe('createMaterialReturn', () => {
  it('moves stock back to a real warehouse and posts a negative offsetting cost-actual', async () => {
    const productId = await makeProduct('post-stock')
    await receive(productId, warehouseId, 20, 12)
    const projectId = await makeProject('post-stock')
    const issueLineId = await makeIssuedLine(projectId, productId, 8, warehouseId, 12)

    const balAfterIssue = await getBalance(productId, warehouseId)
    expect(balAfterIssue.onHand).toBe(12) // 20 received - 8 issued

    const result = (await resolvers.Mutation.createMaterialReturn(
      null,
      {
        input: {
          projectId,
          notes: 'unused leftover',
          lines: [{ issueLineId, toLocationId: warehouseId, qtyReturned: 3 }],
        },
      },
      ctx as never,
    )) as { returnNumber: string; lines: { qtyReturned: number; totalCost: number }[] }
    expect(result.returnNumber).toMatch(/^MRET-/)
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

  it('can return to a different warehouse than the one it was originally issued from', async () => {
    const productId = await makeProduct('diff-wh')
    await receive(productId, warehouseId, 10, 20)
    const projectId = await makeProject('diff-wh')
    const issueLineId = await makeIssuedLine(projectId, productId, 5, warehouseId, 20)

    await resolvers.Mutation.createMaterialReturn(
      null,
      { input: { projectId, lines: [{ issueLineId, toLocationId: secondWarehouseId, qtyReturned: 5 }] } },
      ctx as never,
    )

    expect((await getBalance(productId, secondWarehouseId)).onHand).toBe(5)
    expect((await getBalance(productId, warehouseId)).onHand).toBe(5) // 10 received - 5 issued, none came back here
  })

  it('rejects returning more than is still returnable', async () => {
    const productId = await makeProduct('over-return')
    await receive(productId, warehouseId, 10, 10)
    const projectId = await makeProject('over-return')
    const issueLineId = await makeIssuedLine(projectId, productId, 5, warehouseId, 10)

    await expect(
      resolvers.Mutation.createMaterialReturn(
        null,
        { input: { projectId, lines: [{ issueLineId, toLocationId: warehouseId, qtyReturned: 6 }] } },
        ctx as never,
      ),
    ).rejects.toThrow(/only 5 still returnable/i)

    // Partially return, then try to return the remainder plus a bit more.
    await resolvers.Mutation.createMaterialReturn(
      null,
      { input: { projectId, lines: [{ issueLineId, toLocationId: warehouseId, qtyReturned: 4 }] } },
      ctx as never,
    )
    await expect(
      resolvers.Mutation.createMaterialReturn(
        null,
        { input: { projectId, lines: [{ issueLineId, toLocationId: warehouseId, qtyReturned: 2 }] } },
        ctx as never,
      ),
    ).rejects.toThrow(/only 1 still returnable/i)
  })

  it('rejects a line that belongs to a different project', async () => {
    const productId = await makeProduct('wrong-project')
    await receive(productId, warehouseId, 10, 10)
    const projectA = await makeProject('wrong-project-a')
    const projectB = await makeProject('wrong-project-b')
    const issueLineId = await makeIssuedLine(projectA, productId, 5, warehouseId, 10)

    await expect(
      resolvers.Mutation.createMaterialReturn(
        null,
        { input: { projectId: projectB, lines: [{ issueLineId, toLocationId: warehouseId, qtyReturned: 1 }] } },
        ctx as never,
      ),
    ).rejects.toThrow(/does not belong to this project/i)
  })

  it('rejects returning to a virtual location', async () => {
    const productId = await makeProduct('virtual-dest')
    await receive(productId, warehouseId, 10, 10)
    const projectId = await makeProject('virtual-dest')
    const issueLineId = await makeIssuedLine(projectId, productId, 5, warehouseId, 10)

    await expect(
      resolvers.Mutation.createMaterialReturn(
        null,
        { input: { projectId, lines: [{ issueLineId, toLocationId: virtualInId, qtyReturned: 1 }] } },
        ctx as never,
      ),
    ).rejects.toThrow(/real warehouse or site location/i)
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

    const issue = (await resolvers.Mutation.createMaterialIssue(
      null,
      { projectId, issueDate: new Date().toISOString().slice(0, 10) },
      ctx as never,
    )) as { id: string }
    await resolvers.Mutation.addMaterialIssueLine(
      null,
      { issueId: issue.id, productId, qtyIssued: 5, unitCost: 10, fromLocationId: warehouseId },
      ctx as never,
    )
    await resolvers.Mutation.issueMaterialIssue(null, { id: issue.id }, ctx as never)
    const lineRow = await pool.query<{ id: string }>(
      `SELECT id FROM project_material_issue_lines WHERE issue_id=$1`,
      [issue.id],
    )
    const issueLineId = lineRow.rows[0]!.id

    await resolvers.Mutation.createMaterialReturn(
      null,
      { input: { projectId, lines: [{ issueLineId, toLocationId: warehouseId, qtyReturned: 2 }] } },
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
    const issue = (await resolvers.Mutation.createMaterialIssue(
      null,
      { projectId, issueDate: new Date().toISOString().slice(0, 10) },
      ctx as never,
    )) as { id: string }
    await resolvers.Mutation.addMaterialIssueLine(
      null,
      { issueId: issue.id, productId, qtyIssued: 5, unitCost: 10, fromLocationId: warehouseId },
      ctx as never,
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
