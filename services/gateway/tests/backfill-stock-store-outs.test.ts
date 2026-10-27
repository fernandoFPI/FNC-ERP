// The one-off backfill (src/scripts/backfill-stock-store-outs.ts) that gives requisitions approved
// BEFORE every stock-covered line got its draft Store Out the drafts they are owed (REQ-2026-0075
// and four others on production). The legacy state is rebuilt here by approving a requisition and
// then deleting the draft the app now makes, which leaves exactly what production has: stock
// reserved, a line covered from stock, and no Store Out line pointing at it.
//
// Real Postgres, same fixtures pattern as requisition-stock-lines-completion.test.ts.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'
import { backfillStockStoreOuts } from '../src/scripts/backfill-stock-store-outs.js'

const TEST_COMPANY_ID = 'f0000000-0000-0000-0000-000000000009'
const TEST_USER_EMAIL = 'backfill-store-out-test@fnc-erp.local'
const ADMIN_EMAIL = 'backfill-store-out-admin@fnc-erp.local'
const OUTSIDER_EMAIL = 'backfill-store-out-outsider@fnc-erp.local'
const SKU_PREFIX = 'BFTEST-'

let userId: string
let adminId: string
let warehouseId: string
let projectId: string
let ctx: { auth: { companyId: string; userId: string; role: string; module: string; sessionId: string } }

async function makeProduct(): Promise<string> {
  const sku = `${SKU_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const r = await pool.query<{ id: string }>(
    `INSERT INTO products (company_id, sku, name, uom, category) VALUES ($1,$2,$2,'unit','general') RETURNING id`,
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
     VALUES ($1,$2,$3,$4,NOW(),$5,10,$6,'po_receipt',$7)`,
    [TEST_COMPANY_ID, productId, viR.rows[0]!.id, warehouseId, qty, qty * 10, userId],
  )
}

const stock = async (productId: string): Promise<{ onHand: number; reserved: number }> => {
  const r = await pool.query<{ qty_on_hand: string; qty_reserved: string }>(
    `SELECT qty_on_hand, qty_reserved FROM stock_balances WHERE product_id=$1 AND location_id=$2 AND lot_id IS NULL`,
    [productId, warehouseId],
  )
  return { onHand: parseFloat(r.rows[0]?.qty_on_hand ?? '0'), reserved: parseFloat(r.rows[0]?.qty_reserved ?? '0') }
}

const statusOf = async (reqId: string): Promise<string> =>
  (await pool.query<{ status: string }>(`SELECT status FROM requisitions WHERE id=$1`, [reqId])).rows[0]!.status

const storeOutCount = async (reqId: string): Promise<number> =>
  parseInt(
    (await pool.query<{ c: string }>(`SELECT COUNT(*) AS c FROM project_material_issues WHERE requisition_id=$1`, [reqId])).rows[0]!.c,
    10,
  )

const nextNumber = async (): Promise<number | undefined> => {
  const r = await pool.query<{ next_number: number }>(
    `SELECT next_number FROM document_sequences WHERE company_id=$1 AND doc_type='material_issue'`,
    [TEST_COMPANY_ID],
  )
  return r.rows[0]?.next_number
}

// A requisition in the state production has: approved, stock reserved, NO Store Out.
async function makeLegacyRequisition(opts: {
  destination?: 'inventory' | 'jobsite'
  qty: number
}): Promise<{ reqId: string; number: string; lineId: string; productId: string }> {
  const productId = await makeProduct()
  await receive(productId, opts.qty)
  const created = await resolvers.Mutation.createRequisition(
    null,
    {
      input: {
        purpose: 'project',
        project_id: projectId,
        delivery_destination: opts.destination ?? 'inventory',
        lines: [{ product_id: productId, description: 'x', qty: opts.qty, unit_price: 1 }],
      },
    },
    ctx as never,
  )
  const reqId = (created as { id: string }).id
  const lineId = (await pool.query<{ id: string }>(`SELECT id FROM po_lines WHERE requisition_id=$1`, [reqId])).rows[0]!.id
  await resolvers.Mutation.submitRequisitionToInventoryCheck(null, { id: reqId }, ctx as never)
  await resolvers.Mutation.confirmRequisitionInventoryCheck(
    null,
    { id: reqId, lineStockQtys: [{ lineId, qtyFromStock: opts.qty, sourceLocationId: warehouseId }] },
    ctx as never,
  )
  await resolvers.Mutation.approveRequisition(null, { id: reqId }, ctx as never)
  // take away the draft the app now makes, to get back to what production has
  await pool.query(
    `DELETE FROM project_material_issue_lines WHERE issue_id IN (SELECT id FROM project_material_issues WHERE requisition_id=$1)`,
    [reqId],
  )
  await pool.query(`DELETE FROM project_material_issues WHERE requisition_id=$1`, [reqId])
  const number = (await pool.query<{ requisition_number: string }>(`SELECT requisition_number FROM requisitions WHERE id=$1`, [reqId])).rows[0]!.requisition_number
  expect(await storeOutCount(reqId)).toBe(0)
  expect(await statusOf(reqId)).toBe('sourcing')
  return { reqId, number, lineId, productId }
}

async function cleanup(): Promise<void> {
  const mine = `SELECT id FROM requisitions WHERE company_id=$1 AND organizer_id=$2`
  await pool.query(`DELETE FROM audit_log WHERE action='backfill_stock_store_outs' AND user_id=$1`, [adminId ?? null])
  await pool.query(`DELETE FROM requisition_approved_totals WHERE requisition_id IN (${mine})`, [TEST_COMPANY_ID, userId])
  await pool.query(`DELETE FROM requisition_approval_log WHERE requisition_id IN (${mine})`, [TEST_COMPANY_ID, userId])
  await pool.query(
    `DELETE FROM project_cost_actuals WHERE source_type='stock_issue' AND source_id IN (
       SELECT id FROM project_material_issues WHERE company_id=$1 AND requisition_id IN (${mine.replace('$1', '$1').replace('$2', '$2')}))`,
    [TEST_COMPANY_ID, userId],
  )
  await pool.query(
    `DELETE FROM project_material_issue_lines WHERE issue_id IN (SELECT id FROM project_material_issues WHERE company_id=$1 AND requisition_id IN (${mine}))`,
    [TEST_COMPANY_ID, userId],
  )
  await pool.query(`DELETE FROM project_material_issues WHERE company_id=$1 AND requisition_id IN (${mine})`, [TEST_COMPANY_ID, userId])
  await pool.query(
    `DELETE FROM stock_moves WHERE company_id=$1 AND product_id IN (SELECT id FROM products WHERE company_id=$1 AND sku LIKE $2)`,
    [TEST_COMPANY_ID, `${SKU_PREFIX}%`],
  )
  await pool.query(`DELETE FROM po_lines WHERE requisition_id IN (${mine})`, [TEST_COMPANY_ID, userId])
  await pool.query(`DELETE FROM requisitions WHERE company_id=$1 AND organizer_id=$2`, [TEST_COMPANY_ID, userId])
  await pool.query(
    `DELETE FROM stock_balances WHERE product_id IN (SELECT id FROM products WHERE company_id=$1 AND sku LIKE $2)`,
    [TEST_COMPANY_ID, `${SKU_PREFIX}%`],
  )
  await pool.query(`DELETE FROM products WHERE company_id=$1 AND sku LIKE $2`, [TEST_COMPANY_ID, `${SKU_PREFIX}%`])
  await pool.query(`DELETE FROM projects WHERE company_id=$1 AND code LIKE $2`, [TEST_COMPANY_ID, `${SKU_PREFIX}%`])
}

beforeAll(async () => {
  const mk = async (email: string): Promise<string> =>
    (
      await pool.query<{ id: string }>(
        `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
         ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
        [email],
      )
    ).rows[0]!.id
  userId = await mk(TEST_USER_EMAIL)
  adminId = await mk(ADMIN_EMAIL)
  await mk(OUTSIDER_EMAIL)
  await pool.query(
    `INSERT INTO user_company_roles (user_id, company_id, role, module) VALUES ($1,$2,'system_admin','all') ON CONFLICT DO NOTHING`,
    [adminId, TEST_COMPANY_ID],
  )
  ctx = { auth: { companyId: TEST_COMPANY_ID, userId, role: 'system_admin', module: 'all', sessionId: 'bf-test' } }

  const whR = await pool.query<{ id: string }>(
    `SELECT id FROM stock_locations WHERE company_id=$1 AND type='warehouse' AND is_active=true LIMIT 1`,
    [TEST_COMPANY_ID],
  )
  if (!whR.rows[0]) throw new Error('No warehouse location seeded for test company — run seeds first')
  warehouseId = whR.rows[0].id

  await cleanup()
  const code = `${SKU_PREFIX}PRJ-${Date.now()}`
  projectId = (
    await pool.query<{ id: string }>(
      `INSERT INTO projects (company_id, code, name, status, created_by) VALUES ($1,$2,$2,'ongoing',$3) RETURNING id`,
      [TEST_COMPANY_ID, code, userId],
    )
  ).rows[0]!.id
})

afterAll(async () => {
  await cleanup()
  await pool.query(`DELETE FROM user_company_roles WHERE user_id=$1 AND company_id=$2`, [adminId, TEST_COMPANY_ID])
  await pool.query(`DELETE FROM users WHERE email IN ($1,$2,$3)`, [TEST_USER_EMAIL, ADMIN_EMAIL, OUTSIDER_EMAIL])
  await pool.end()
})

describe('backfill of stock Store Outs: dry run', () => {
  it('lists what it would create and writes nothing, not even a Store Out number', async () => {
    const { number } = await makeLegacyRequisition({ qty: 6 })
    const before = await nextNumber()
    const [r] = await backfillStockStoreOuts({ requisitionNumbers: [number], apply: false })
    expect(r!.status).toBe('planned')
    expect(r!.lines).toHaveLength(1)
    expect(r!.lines[0]!.qty).toBe(6)
    expect(r!.storeOuts).toHaveLength(0)
    expect(await nextNumber()).toBe(before)
  })

  it('creates no Store Out in a dry run', async () => {
    const { reqId, number } = await makeLegacyRequisition({ qty: 5 })
    await backfillStockStoreOuts({ requisitionNumbers: [number], apply: false })
    expect(await storeOutCount(reqId)).toBe(0)
  })

  it('refuses, naming the reason, when the reservation is smaller than the draft would need', async () => {
    const { reqId, number, productId } = await makeLegacyRequisition({ qty: 5 })
    await pool.query(`UPDATE stock_balances SET qty_reserved=0 WHERE product_id=$1 AND location_id=$2`, [productId, warehouseId])
    const [r] = await backfillStockStoreOuts({ requisitionNumbers: [number], apply: false })
    expect(r!.status).toBe('refused')
    expect(r!.reason).toMatch(/only 0 reserved, 5 needed/)
    expect(await storeOutCount(reqId)).toBe(0)
  })

  it('says there is nothing to do for a requisition that already has its draft', async () => {
    const { reqId, number } = await makeLegacyRequisition({ qty: 4 })
    await backfillStockStoreOuts({ requisitionNumbers: [number], apply: true, actorEmail: ADMIN_EMAIL })
    const [again] = await backfillStockStoreOuts({ requisitionNumbers: [number], apply: false })
    expect(again!.status).toBe('nothing-to-do')
    expect(await storeOutCount(reqId)).toBe(1)
  })

  it('skips a requisition that is not open, and refuses a number that does not exist', async () => {
    const { reqId, number } = await makeLegacyRequisition({ qty: 3 })
    await pool.query(`UPDATE requisitions SET status='completed' WHERE id=$1`, [reqId])
    const [r] = await backfillStockStoreOuts({ requisitionNumbers: [number], apply: false })
    expect(r!.status).toBe('skipped')
    expect(r!.reason).toMatch(/completed/)
    await expect(backfillStockStoreOuts({ requisitionNumbers: ['REQ-DOES-NOT-EXIST'], apply: false })).rejects.toThrow(/not found/)
  })
})

describe('backfill of stock Store Outs: apply', () => {
  it('needs an administrator account, and refuses anyone else', async () => {
    const { reqId, number } = await makeLegacyRequisition({ qty: 5 })
    await expect(backfillStockStoreOuts({ requisitionNumbers: [number], apply: true })).rejects.toThrow(/--actor-email/)
    await expect(
      backfillStockStoreOuts({ requisitionNumbers: [number], apply: true, actorEmail: 'nobody@fnc-erp.local' }),
    ).rejects.toThrow(/No ERP user/)
    await expect(
      backfillStockStoreOuts({ requisitionNumbers: [number], apply: true, actorEmail: OUTSIDER_EMAIL }),
    ).rejects.toThrow(/not an active administrator/)
    expect(await storeOutCount(reqId)).toBe(0)
  })

  it('creates one draft linked to the requisition, its line and the project, recorded under the administrator', async () => {
    const { reqId, number, lineId, productId } = await makeLegacyRequisition({ qty: 6 })
    const [r] = await backfillStockStoreOuts({ requisitionNumbers: [number], apply: true, actorEmail: ADMIN_EMAIL })
    expect(r!.status).toBe('created')
    expect(r!.storeOuts).toHaveLength(1)

    const rows = await pool.query<{ status: string; project_id: string; created_by: string; po_line_id: string; qty_issued: string }>(
      `SELECT h.status, h.project_id, h.created_by, m.po_line_id, m.qty_issued
         FROM project_material_issues h JOIN project_material_issue_lines m ON m.issue_id = h.id
        WHERE h.requisition_id=$1`,
      [reqId],
    )
    expect(rows.rows).toHaveLength(1)
    expect(rows.rows[0]).toMatchObject({ status: 'draft', project_id: projectId, created_by: adminId, po_line_id: lineId })
    expect(parseFloat(rows.rows[0]!.qty_issued)).toBe(6)
    // nothing moved: the stock is still reserved, the requisition still waits
    expect(await stock(productId)).toEqual({ onHand: 6, reserved: 6 })
    expect(await statusOf(reqId)).toBe('sourcing')
  })

  it('leaves an audit entry', async () => {
    const { reqId, number } = await makeLegacyRequisition({ qty: 2 })
    await backfillStockStoreOuts({ requisitionNumbers: [number], apply: true, actorEmail: ADMIN_EMAIL })
    const a = await pool.query(`SELECT 1 FROM audit_log WHERE action='backfill_stock_store_outs' AND record_id=$1 AND user_id=$2`, [reqId, adminId])
    expect(a.rows).toHaveLength(1)
  })

  it('running it twice creates nothing the second time', async () => {
    const { reqId, number } = await makeLegacyRequisition({ qty: 4 })
    await backfillStockStoreOuts({ requisitionNumbers: [number], apply: true, actorEmail: ADMIN_EMAIL })
    const [again] = await backfillStockStoreOuts({ requisitionNumbers: [number], apply: true, actorEmail: ADMIN_EMAIL })
    expect(again!.status).toBe('nothing-to-do')
    expect(await storeOutCount(reqId)).toBe(1)
  })

  it('refuses to write when the reservation is too small, and leaves nothing behind', async () => {
    const { reqId, number, productId } = await makeLegacyRequisition({ qty: 5 })
    await pool.query(`UPDATE stock_balances SET qty_reserved=1 WHERE product_id=$1 AND location_id=$2`, [productId, warehouseId])
    const [r] = await backfillStockStoreOuts({ requisitionNumbers: [number], apply: true, actorEmail: ADMIN_EMAIL })
    expect(r!.status).toBe('refused')
    expect(await storeOutCount(reqId)).toBe(0)
  })

  it('the created draft can then be confirmed: stock goes out, the reservation clears, the project is charged, the requisition completes', async () => {
    const { reqId, number, productId } = await makeLegacyRequisition({ qty: 6 })
    const [r] = await backfillStockStoreOuts({ requisitionNumbers: [number], apply: true, actorEmail: ADMIN_EMAIL })
    const issueId = (
      await pool.query<{ id: string }>(`SELECT id FROM project_material_issues WHERE requisition_id=$1`, [reqId])
    ).rows[0]!.id
    expect(r!.storeOuts).toHaveLength(1)
    await resolvers.Mutation.issueMaterialIssue(null, { id: issueId }, ctx as never)
    expect(await statusOf(reqId)).toBe('completed')
    expect(await stock(productId)).toEqual({ onHand: 0, reserved: 0 })
    const cost = await pool.query<{ c: string }>(
      `SELECT COUNT(*) AS c FROM project_cost_actuals WHERE source_type='stock_issue' AND source_id=$1`,
      [issueId],
    )
    expect(parseInt(cost.rows[0]!.c, 10)).toBeGreaterThan(0)
  })
})

// Requisition numbers repeat across companies (REQ-2026-0047 exists in two companies on production),
// so the script must never guess which one is meant.
describe('backfill of stock Store Outs: which company', () => {
  async function withTwinInAnotherCompany(
    number: string,
    run: (otherName: string) => Promise<void>,
  ): Promise<void> {
    const otherName = `${SKU_PREFIX}OTHER-${Date.now()}`
    const other = await pool.query<{ id: string }>(
      `INSERT INTO companies (name, legal_name, country_code, currency_code) VALUES ($1,$1,'IQ','IQD') RETURNING id`,
      [otherName],
    )
    const otherId = other.rows[0]!.id
    try {
      await pool.query(
        `INSERT INTO requisitions (company_id, requisition_number, purpose, priority, organizer_id, status)
         VALUES ($1,$2,'stock','low',$3,'sourcing')`,
        [otherId, number, userId],
      )
      await run(otherName)
    } finally {
      await pool.query(`DELETE FROM requisitions WHERE company_id=$1`, [otherId])
      await pool.query(`DELETE FROM companies WHERE id=$1`, [otherId])
    }
  }

  it('refuses to guess when two companies have the same number, and says to name one', async () => {
    const { number } = await makeLegacyRequisition({ qty: 3 })
    await withTwinInAnotherCompany(number, async () => {
      await expect(backfillStockStoreOuts({ requisitionNumbers: [number], apply: false })).rejects.toThrow(
        /More than one company.*--company/,
      )
    })
  })

  it('uses the company that is named (by exact name or by id) and leaves the other alone', async () => {
    const { reqId, number } = await makeLegacyRequisition({ qty: 3 })
    const company = await pool.query<{ id: string; name: string }>(`SELECT id, name FROM companies WHERE id=$1`, [TEST_COMPANY_ID])
    await withTwinInAnotherCompany(number, async () => {
      const byName = await backfillStockStoreOuts({
        requisitionNumbers: [number],
        apply: false,
        company: company.rows[0]!.name,
      })
      expect(byName[0]).toMatchObject({ status: 'planned', company: company.rows[0]!.name })
      const byId = await backfillStockStoreOuts({ requisitionNumbers: [number], apply: false, company: TEST_COMPANY_ID })
      expect(byId[0]!.status).toBe('planned')
      expect(await storeOutCount(reqId)).toBe(0)
    })
  })

  it('says so when the named company has no such requisition', async () => {
    const { number } = await makeLegacyRequisition({ qty: 2 })
    await expect(
      backfillStockStoreOuts({ requisitionNumbers: [number], apply: false, company: 'No Such Company' }),
    ).rejects.toThrow(/not found in company No Such Company/)
  })
})
