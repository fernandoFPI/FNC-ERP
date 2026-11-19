// Equipment that must come back (Store Out returnables). Playbook #107, STORE_OUT_EQUIPMENT_PLAN.md phase 1.
//
// Before this, every Store Out line was consumption: confirming it moved stock into Virtual Consumption ("used up") and a manual Store
// Out (no PO, no requisition) could not be returned at all. Now a line can be returnable (a product flagged Equipment is always
// returnable): it costs the project nothing when it goes out, it sits in Virtual Consumption while it is out, and it comes back through
// createEquipmentReturn with a condition. A quantity that is Lost never comes back and is charged to the project as stock issued.
// A loan from the central warehouse to another company never prices, bills or moves stock between companies.
//
// Real Postgres through the real resolvers.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'
import { addDaysToDateOnly } from '../src/lib/equipmentReturns.js'
import { buildCostPlusLines } from '../../../packages/billing/src/index.js'

const TEST_COMPANY_ID = 'f0000000-0000-0000-0000-000000000009'
const FACTORY_COMPANY_ID = 'f0000000-0000-0000-0000-000000000010'
const TEST_USER_EMAIL = 'equipment-returnables-test@fnc-erp.local'
const OTHER_USER_EMAIL = 'equipment-returnables-other@fnc-erp.local'
const SKU_PREFIX = 'EQRET-'
const NAME_PREFIX = 'EqRetTest'
const TODAY = new Date().toISOString().slice(0, 10)

type Ctx = { auth: { companyId: string; userId: string; role: string; module: string; sessionId: string } }
let userId: string
let otherUserId: string
let ctx: Ctx
let factoryCtx: Ctx
let projectId: string
let warehouseId: string
let virtualInId: string
let factoryWarehouseId: string
let factoryVirtualInId: string

async function makeProduct(
  companyId: string,
  opts: { returnable?: boolean; days?: number | null; suffix?: string } = {},
): Promise<string> {
  const sku = `${SKU_PREFIX}${opts.suffix ?? 'p'}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const r = await pool.query<{ id: string }>(
    `INSERT INTO products (company_id, sku, name, uom, category, is_returnable, default_return_days)
     VALUES ($1,$2,$3,'unit','general',$4,$5) RETURNING id`,
    [companyId, sku, sku, opts.returnable === true, opts.days ?? null],
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

/** What a product holds in a company's Virtual Consumption: the "out" side of the ledger. */
async function inConsumption(productId: string, companyId: string): Promise<number> {
  const r = await pool.query<{ q: string }>(
    `-- currency-safe: a quantity of units
     SELECT COALESCE(SUM(sb.qty_on_hand),0) AS q FROM stock_balances sb JOIN stock_locations sl ON sl.id=sb.location_id
      WHERE sb.product_id=$1 AND sl.company_id=$2 AND sl.type='virtual_out'`,
    [productId, companyId],
  )
  return parseFloat(r.rows[0]!.q)
}

interface Built {
  issueId: string
  lineIds: string[]
}

/** A manual Store Out: header (issued to Ahmed unless told otherwise) plus one line per entry. Confirmed unless confirm is false. */
async function storeOut(
  lines: {
    productId: string
    qty: number
    unitCost?: number
    isReturnable?: boolean
    expectedReturnDate?: string
    serialNote?: string
    fromLocationId?: string
  }[],
  opts: {
    as?: Ctx
    project?: boolean
    issuedToName?: string | null
    employeeId?: string
    department?: string
    confirm?: boolean
    issueDate?: string
  } = {},
): Promise<Built> {
  const as = opts.as ?? ctx
  const issue = (await resolvers.Mutation.createMaterialIssue(
    null,
    {
      ...(opts.project === false ? {} : { projectId }),
      issueDate: opts.issueDate ?? TODAY,
      ...(opts.issuedToName === null
        ? {}
        : { issuedToName: opts.issuedToName ?? 'Ahmed Ali' }),
      ...(opts.employeeId ? { issuedToEmployeeId: opts.employeeId } : {}),
      ...(opts.department ? { department: opts.department } : {}),
    },
    as as never,
  )) as { id: string }
  const lineIds: string[] = []
  for (const l of lines) {
    const line = (await resolvers.Mutation.addMaterialIssueLine(
      null,
      {
        issueId: issue.id,
        productId: l.productId,
        qtyIssued: l.qty,
        unitCost: l.unitCost ?? 10,
        fromLocationId: l.fromLocationId ?? warehouseId,
        ...(l.isReturnable === undefined ? {} : { isReturnable: l.isReturnable }),
        ...(l.expectedReturnDate ? { expectedReturnDate: l.expectedReturnDate } : {}),
        ...(l.serialNote ? { serialNote: l.serialNote } : {}),
      },
      as as never,
    )) as { id: string }
    lineIds.push(line.id)
  }
  if (opts.confirm !== false) await resolvers.Mutation.issueMaterialIssue(null, { id: issue.id }, as as never)
  return { issueId: issue.id, lineIds }
}

interface Item {
  issueLineId: string
  issueNumber: string
  productId: string
  isEquipment: boolean
  qtyIssued: number
  qtyReturned: number
  qtyLost: number
  qtyOutstanding: number
  expectedReturnDate: string | null
  daysOverdue: number | null
  status: string
  issuedToName: string | null
  department: string | null
  projectCode: string | null
  serialNote: string | null
  isLoan: boolean
  ownerCompanyName: string | null
  borrowerCompanyName: string | null
  canReceiveBack: boolean
}
const items = async (args: { status?: string; search?: string } = { status: 'all' }, as = ctx): Promise<Item[]> =>
  (await resolvers.Query.returnableItems(null, args, as as never)) as Item[]
const itemOf = async (issueLineId: string, as = ctx): Promise<Item | undefined> =>
  (await items({ status: 'all' }, as)).find((i) => i.issueLineId === issueLineId)

interface RetLine {
  issueLineId: string
  qtyReturned: number
  condition: string
  toLocationId?: string
  remarks?: string
}
const giveBack = (lines: RetLine[], as: Ctx = ctx, extra: Record<string, string> = {}) =>
  resolvers.Mutation.createEquipmentReturn(null, { input: { lines, ...extra } }, as as never) as Promise<{
    id: string
    returnNumber: string
    returnDate: string
    receivedByName: string | null
    lines: { issueLineId: string; qtyReturned: number; condition: string; toLocationName: string | null }[]
  }>

const projectCost = async (sourceTypeFilter = `'stock_issue'`): Promise<{ amount: string; currency_code: string }[]> =>
  (
    await pool.query<{ amount: string; currency_code: string }>(
      `SELECT amount::text, currency_code::text FROM project_cost_actuals WHERE project_id=$1 AND source_type IN (${sourceTypeFilter}) ORDER BY amount`,
      [projectId],
    )
  ).rows

async function cleanup(): Promise<void> {
  const myReturns = `SELECT id FROM store_out_returns WHERE created_by IN ($1,$2)`
  const myReturnLines = `SELECT id FROM store_out_return_lines WHERE return_id IN (${myReturns})`
  const myIssues = `SELECT id FROM project_material_issues WHERE created_by IN ($1,$2)`
  const p = [userId, otherUserId, `${SKU_PREFIX}%`]
  await pool.query(
    `DELETE FROM project_cost_actuals WHERE (source_type='stock_issue' AND (source_id IN (${myIssues}) OR source_id IN (${myReturnLines})))`,
    p.slice(0, 2),
  )
  await pool.query(
    `DELETE FROM project_material_return_lines WHERE issue_line_id IN (SELECT id FROM project_material_issue_lines WHERE issue_id IN (${myIssues}))`,
    p.slice(0, 2),
  )
  await pool.query(`DELETE FROM project_cost_actuals WHERE source_type='material_return' AND source_id IN (SELECT id FROM project_material_returns WHERE created_by IN ($1,$2))`, p.slice(0, 2))
  await pool.query(`DELETE FROM project_material_returns WHERE created_by IN ($1,$2)`, p.slice(0, 2))
  await pool.query(`DELETE FROM store_out_return_lines WHERE return_id IN (${myReturns})`, p.slice(0, 2))
  await pool.query(`DELETE FROM store_out_returns WHERE created_by IN ($1,$2)`, p.slice(0, 2))
  await pool.query(
    `DELETE FROM interco_stock_transfer_lines WHERE transfer_id IN (SELECT id FROM interco_stock_transfers WHERE initiated_by IN ($1,$2))`,
    p.slice(0, 2),
  )
  await pool.query(`DELETE FROM interco_stock_transfers WHERE initiated_by IN ($1,$2)`, p.slice(0, 2))
  await pool.query(`DELETE FROM interco_transactions WHERE created_by IN ($1,$2)`, p.slice(0, 2))
  await pool.query(`DELETE FROM project_material_issue_lines WHERE issue_id IN (${myIssues})`, p.slice(0, 2))
  await pool.query(`DELETE FROM project_material_issues WHERE created_by IN ($1,$2)`, p.slice(0, 2))
  await pool.query(`DELETE FROM stock_moves WHERE product_id IN (SELECT id FROM products WHERE sku LIKE $1)`, [p[2]])
  await pool.query(`DELETE FROM stock_balances WHERE product_id IN (SELECT id FROM products WHERE sku LIKE $1)`, [p[2]])
  // requisitions made on this test project (the stock-covered-by-requisition test), after the moves that point at their lines
  const myReqs = `SELECT id FROM requisitions WHERE project_id IN (SELECT id FROM projects WHERE company_id=$1 AND code LIKE $2)`
  const reqArgs = [TEST_COMPANY_ID, `${SKU_PREFIX}%`]
  await pool.query(`DELETE FROM requisition_approved_totals WHERE requisition_id IN (${myReqs})`, reqArgs)
  await pool.query(`DELETE FROM requisition_approval_log WHERE requisition_id IN (${myReqs})`, reqArgs)
  await pool.query(`DELETE FROM po_lines WHERE requisition_id IN (${myReqs})`, reqArgs)
  await pool.query(`DELETE FROM requisitions WHERE id IN (${myReqs})`, reqArgs)
  await pool.query(`DELETE FROM products WHERE sku LIKE $1`, [p[2]])
  await pool.query(`DELETE FROM projects WHERE company_id=$1 AND code LIKE $2`, [TEST_COMPANY_ID, `${SKU_PREFIX}%`])
  await pool.query(`DELETE FROM employees WHERE first_name LIKE $1`, [`${NAME_PREFIX}%`])
}

beforeAll(async () => {
  const mkUser = async (email: string): Promise<string> =>
    (
      await pool.query<{ id: string }>(
        `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
         ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
        [email],
      )
    ).rows[0]!.id
  userId = await mkUser(TEST_USER_EMAIL)
  otherUserId = await mkUser(OTHER_USER_EMAIL)
  ctx = { auth: { companyId: TEST_COMPANY_ID, userId, role: 'system_admin', module: 'all', sessionId: 'eqret-test' } }
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
  await pool.query(`UPDATE companies SET is_central_warehouse=true WHERE id=$1`, [FACTORY_COMPANY_ID])

  await cleanup()
  const p = await pool.query<{ id: string }>(
    `INSERT INTO projects (company_id, code, name, status, created_by) VALUES ($1,$2,$2,'ongoing',$3) RETURNING id`,
    [TEST_COMPANY_ID, `${SKU_PREFIX}PRJ-${Date.now()}`, userId],
  )
  projectId = p.rows[0]!.id
})

afterAll(async () => {
  await cleanup()
  await pool.query(`DELETE FROM users WHERE email IN ($1,$2)`, [TEST_USER_EMAIL, OTHER_USER_EMAIL])
  await pool.end()
})

describe('the Equipment flag on a product', () => {
  it('is stored on create and changed on update; days are only touched when the edit mentions them, and null clears them', async () => {
    const created = (await resolvers.Mutation.createProduct(
      null,
      {
        input: {
          sku: `${SKU_PREFIX}flag-${Date.now()}`,
          name: 'Flag test',
          uom: 'EA',
          is_returnable: true,
          default_return_days: 10,
        },
      },
      ctx as never,
    )) as { id: string; is_returnable: boolean; default_return_days: number }
    expect(created.is_returnable).toBe(true)
    expect(created.default_return_days).toBe(10)

    const renamed = (await resolvers.Mutation.updateProduct(
      null,
      { id: created.id, input: { name: 'Flag test 2', uom: 'EA' } },
      ctx as never,
    )) as { is_returnable: boolean; default_return_days: number }
    expect(renamed.is_returnable).toBe(true) // not mentioned, not changed
    expect(renamed.default_return_days).toBe(10)

    const cleared = (await resolvers.Mutation.updateProduct(
      null,
      { id: created.id, input: { name: 'Flag test 2', uom: 'EA', is_returnable: false, default_return_days: null } },
      ctx as never,
    )) as { is_returnable: boolean; default_return_days: number | null }
    expect(cleared.is_returnable).toBe(false)
    expect(cleared.default_return_days).toBeNull()
  })

  it('refuses a return period that is not a whole number of days from 1 to 3650, naming the rule', async () => {
    for (const bad of [0, -3, 1.5, 4000]) {
      await expect(
        resolvers.Mutation.createProduct(
          null,
          { input: { sku: `${SKU_PREFIX}bad-${bad}-${Date.now()}`, name: 'x', uom: 'EA', default_return_days: bad } },
          ctx as never,
        ),
      ).rejects.toThrow(/whole number of days between 1 and 3650/)
    }
  })

  it('exposes how much is out with people on the product page, by the same rule as the Returnables list', async () => {
    const prod = await makeProduct(TEST_COMPANY_ID, { returnable: true, suffix: 'qo' })
    await receive(TEST_COMPANY_ID, prod, 10)
    const so = await storeOut([{ productId: prod, qty: 4 }])
    const before = (await resolvers.Query.product(null, { id: prod }, ctx as never)) as { qty_out: string }
    expect(parseFloat(before.qty_out)).toBe(4)
    await giveBack([{ issueLineId: so.lineIds[0]!, qtyReturned: 1, condition: 'good', toLocationId: warehouseId }])
    const after = (await resolvers.Query.product(null, { id: prod }, ctx as never)) as { qty_out: string }
    expect(parseFloat(after.qty_out)).toBe(3)
  })
})

describe('issuing equipment (a manual Store Out)', () => {
  it('makes a line of a flagged product returnable whatever was sent, with a due date from the product period', async () => {
    const prod = await makeProduct(TEST_COMPANY_ID, { returnable: true, days: 5, suffix: 'forced' })
    await receive(TEST_COMPANY_ID, prod, 5)
    const so = await storeOut([{ productId: prod, qty: 1, isReturnable: false }], { confirm: false })
    const row = await pool.query<{ is_returnable: boolean; expected_return_date: string }>(
      `SELECT is_returnable, expected_return_date::text FROM project_material_issue_lines WHERE id=$1`,
      [so.lineIds[0]],
    )
    expect(row.rows[0]!.is_returnable).toBe(true)
    expect(row.rows[0]!.expected_return_date).toBe(addDaysToDateOnly(TODAY, 5))
  })

  it('defaults to a week when the product has no period, honours a typed date, and refuses a bad or earlier one', async () => {
    const prod = await makeProduct(TEST_COMPANY_ID, { returnable: true, suffix: 'week' })
    await receive(TEST_COMPANY_ID, prod, 5)
    const dateOf = async (id: string) =>
      (
        await pool.query<{ d: string }>(`SELECT expected_return_date::text AS d FROM project_material_issue_lines WHERE id=$1`, [id])
      ).rows[0]!.d
    const a = await storeOut([{ productId: prod, qty: 1 }], { confirm: false })
    expect(await dateOf(a.lineIds[0]!)).toBe(addDaysToDateOnly(TODAY, 7))
    const typed = addDaysToDateOnly(TODAY, 30)
    const b = await storeOut([{ productId: prod, qty: 1, expectedReturnDate: typed }], { confirm: false })
    expect(await dateOf(b.lineIds[0]!)).toBe(typed)

    const issue = (await resolvers.Mutation.createMaterialIssue(null, { issueDate: TODAY, issuedToName: 'X' }, ctx as never)) as { id: string }
    const add = (expectedReturnDate: string) =>
      resolvers.Mutation.addMaterialIssueLine(
        null,
        { issueId: issue.id, productId: prod, qtyIssued: 1, unitCost: 1, fromLocationId: warehouseId, expectedReturnDate },
        ctx as never,
      )
    await expect(add('2026-02-30')).rejects.toThrow(/valid date/)
    await expect(add('next week')).rejects.toThrow(/valid date/)
    await expect(add(addDaysToDateOnly(TODAY, -1))).rejects.toThrow(/before the issue date/)
  })

  it('lets a consumable be ticked returnable for one line; an unticked one stays consumption', async () => {
    const prod = await makeProduct(TEST_COMPANY_ID, { suffix: 'tool' })
    await receive(TEST_COMPANY_ID, prod, 10)
    const so = await storeOut(
      [
        { productId: prod, qty: 1, isReturnable: true, serialNote: 'Serial 4471' },
        { productId: prod, qty: 2 },
      ],
      { confirm: false },
    )
    const rows = await pool.query<{ is_returnable: boolean; serial_note: string | null }>(
      `SELECT is_returnable, serial_note FROM project_material_issue_lines WHERE issue_id=$1 ORDER BY created_at, id`,
      [so.issueId],
    )
    expect(rows.rows.map((r) => r.is_returnable)).toEqual([true, false])
    expect(rows.rows[0]!.serial_note).toBe('Serial 4471')
    expect(rows.rows[1]!.serial_note).toBeNull()
  })

  it('takes the stock off the shelf into Virtual Consumption, charges the project nothing for it, and still charges a consumable on the same Store Out', async () => {
    const eq = await makeProduct(TEST_COMPANY_ID, { returnable: true, suffix: 'eq' })
    const cons = await makeProduct(TEST_COMPANY_ID, { suffix: 'cons' })
    await receive(TEST_COMPANY_ID, eq, 6, 50)
    await receive(TEST_COMPANY_ID, cons, 6, 10)
    const costBefore = await projectCost()

    const so = await storeOut([
      { productId: eq, qty: 2, unitCost: 50 },
      { productId: cons, qty: 3, unitCost: 10 },
    ])

    expect(await onHand(eq, warehouseId)).toBe(4)
    expect(await inConsumption(eq, TEST_COMPANY_ID)).toBe(2)
    const costAfter = await projectCost()
    // one new row: the consumable's 3 x 10 (the equipment's 2 x 50 is not in it)
    expect(costAfter).toHaveLength(costBefore.length + 1)
    const added = costAfter.filter((c) => !costBefore.some((b) => b.amount === c.amount && b.currency_code === c.currency_code))
    expect(added.map((a) => parseFloat(a.amount))).toEqual([30])
    const eqLine = await itemOf(so.lineIds[0]!)
    expect(eqLine).toMatchObject({ qtyIssued: 2, qtyOutstanding: 2, status: 'out', issuedToName: 'Ahmed Ali', isEquipment: true })
    // the consumable line is not in the list at all
    expect(await itemOf(so.lineIds[1]!)).toBeUndefined()
  })

  it('refuses to confirm equipment with nobody to hand it to, and moves nothing', async () => {
    const eq = await makeProduct(TEST_COMPANY_ID, { returnable: true, suffix: 'nobody' })
    await receive(TEST_COMPANY_ID, eq, 3)
    const so = await storeOut([{ productId: eq, qty: 1 }], { issuedToName: null, confirm: false })
    await expect(resolvers.Mutation.issueMaterialIssue(null, { id: so.issueId }, ctx as never)).rejects.toThrow(/who the equipment is issued to/)
    expect(await onHand(eq, warehouseId)).toBe(3)
    const st = await pool.query<{ status: string }>(`SELECT status FROM project_material_issues WHERE id=$1`, [so.issueId])
    expect(st.rows[0]!.status).toBe('draft')
  })

  it("copies an employee's name onto the Store Out and refuses another company's employee", async () => {
    const mine = await pool.query<{ id: string }>(
      `INSERT INTO employees (company_id, first_name, last_name, hire_date) VALUES ($1,$2,'Hassan',CURRENT_DATE) RETURNING id`,
      [TEST_COMPANY_ID, `${NAME_PREFIX}Karim`],
    )
    const theirs = await pool.query<{ id: string }>(
      `INSERT INTO employees (company_id, first_name, last_name, hire_date) VALUES ($1,$2,'Jasim',CURRENT_DATE) RETURNING id`,
      [FACTORY_COMPANY_ID, `${NAME_PREFIX}Omar`],
    )
    const issue = (await resolvers.Mutation.createMaterialIssue(
      null,
      { issueDate: TODAY, issuedToEmployeeId: mine.rows[0]!.id, issuedToName: 'typed name is replaced', department: '  Electrical  ' },
      ctx as never,
    )) as { issuedToName: string; issuedToEmployeeId: string; department: string }
    expect(issue).toMatchObject({ issuedToName: `${NAME_PREFIX}Karim Hassan`, issuedToEmployeeId: mine.rows[0]!.id, department: 'Electrical' })
    await expect(
      resolvers.Mutation.createMaterialIssue(null, { issueDate: TODAY, issuedToEmployeeId: theirs.rows[0]!.id }, ctx as never),
    ).rejects.toThrow(/Employee not found/)
  })

  it('uses the stock cost of the shelf when equipment is sent with no cost typed', async () => {
    const eq = await makeProduct(TEST_COMPANY_ID, { returnable: true, suffix: 'cost0' })
    await receive(TEST_COMPANY_ID, eq, 3, 75)
    const so = await storeOut([{ productId: eq, qty: 2, unitCost: 0 }], { confirm: false })
    const r = await pool.query<{ unit_cost: string; total_cost: string }>(
      `SELECT unit_cost::text, total_cost::text FROM project_material_issue_lines WHERE id=$1`,
      [so.lineIds[0]],
    )
    expect(parseFloat(r.rows[0]!.unit_cost)).toBe(75)
    expect(parseFloat(r.rows[0]!.total_cost)).toBe(150)
  })

  it('cannot cancel an issued Store Out that handed out equipment, but can cancel it as a draft', async () => {
    const eq = await makeProduct(TEST_COMPANY_ID, { returnable: true, suffix: 'cancel' })
    await receive(TEST_COMPANY_ID, eq, 4)
    const issued = await storeOut([{ productId: eq, qty: 1 }])
    await expect(resolvers.Mutation.cancelMaterialIssue(null, { id: issued.issueId }, ctx as never)).rejects.toThrow(
      /issued equipment that must come back/,
    )
    const st = await pool.query<{ status: string }>(`SELECT status FROM project_material_issues WHERE id=$1`, [issued.issueId])
    expect(st.rows[0]!.status).toBe('issued')
    const draft = await storeOut([{ productId: eq, qty: 1 }], { confirm: false })
    await resolvers.Mutation.cancelMaterialIssue(null, { id: draft.issueId }, ctx as never)
    const st2 = await pool.query<{ status: string }>(`SELECT status FROM project_material_issues WHERE id=$1`, [draft.issueId])
    expect(st2.rows[0]!.status).toBe('cancelled')
  })
})

describe('the Returnables list and summary', () => {
  it('lists what is out with who has it, flags it overdue once its date passes, and filters and searches', async () => {
    const eq = await makeProduct(TEST_COMPANY_ID, { returnable: true, suffix: 'list' })
    await receive(TEST_COMPANY_ID, eq, 9)
    const late = await storeOut([{ productId: eq, qty: 2 }], { issuedToName: 'Zanyar Lateman', department: 'Civil' })
    const fine = await storeOut([{ productId: eq, qty: 1, expectedReturnDate: addDaysToDateOnly(TODAY, 20) }], { issuedToName: 'Dilan Ontime' })
    await pool.query(`UPDATE project_material_issue_lines SET expected_return_date = CURRENT_DATE - 3 WHERE id=$1`, [late.lineIds[0]])

    const lateRow = await itemOf(late.lineIds[0]!)
    expect(lateRow).toMatchObject({ status: 'overdue', daysOverdue: 3, issuedToName: 'Zanyar Lateman', department: 'Civil', qtyOutstanding: 2 })
    expect((await itemOf(fine.lineIds[0]!))?.status).toBe('out')

    const overdueIds = (await items({ status: 'overdue' })).map((i) => i.issueLineId)
    expect(overdueIds).toContain(late.lineIds[0])
    expect(overdueIds).not.toContain(fine.lineIds[0])
    const found = await items({ status: 'open', search: 'zanyar' })
    expect(found.map((i) => i.issueLineId)).toEqual([late.lineIds[0]])
    // a LIKE wildcard typed into the box is text, not a pattern
    expect(await items({ status: 'open', search: '%' })).toEqual([])

    const summary = (await resolvers.Query.returnableItemsSummary(null, {}, ctx as never)) as {
      openLines: number
      overdueLines: number
      dueSoonLines: number
      unitsOut: number
    }
    const open = await items({ status: 'open' })
    expect(summary.openLines).toBe(open.length)
    expect(summary.overdueLines).toBe(open.filter((i) => i.status === 'overdue').length)
    expect(summary.unitsOut).toBe(open.reduce((s, i) => s + i.qtyOutstanding, 0))
    await expect(items({ status: 'whatever' })).rejects.toThrow(/open, overdue or all/)
  })

  it('shows nothing to a company that neither made the Store Out nor holds the stock', async () => {
    const eq = await makeProduct(TEST_COMPANY_ID, { returnable: true, suffix: 'tenant' })
    await receive(TEST_COMPANY_ID, eq, 3)
    const so = await storeOut([{ productId: eq, qty: 1 }])
    expect(await itemOf(so.lineIds[0]!)).toBeDefined()
    expect(await itemOf(so.lineIds[0]!, factoryCtx)).toBeUndefined()
    const sum = (await resolvers.Query.returnableItemsSummary(null, {}, factoryCtx as never)) as { openLines: number }
    const mineOpen = (await items({ status: 'open' }, factoryCtx)).length
    expect(sum.openLines).toBe(mineOpen)
  })
})

describe('returning equipment', () => {
  it('puts the stock back where it is told, in two parts, and the line is done only when all of it is back', async () => {
    const eq = await makeProduct(TEST_COMPANY_ID, { returnable: true, suffix: 'two' })
    await receive(TEST_COMPANY_ID, eq, 5)
    const so = await storeOut([{ productId: eq, qty: 3 }])
    const id = so.lineIds[0]!
    expect(await onHand(eq, warehouseId)).toBe(2)

    const first = await giveBack([{ issueLineId: id, qtyReturned: 1, condition: 'good', toLocationId: warehouseId }], ctx, {
      receivedByName: 'Store keeper',
    })
    expect(first.returnNumber).toBeTruthy()
    expect(first.receivedByName).toBe('Store keeper')
    expect(first.lines).toHaveLength(1)
    expect(first.lines[0]).toMatchObject({ qtyReturned: 1, condition: 'good' })
    expect(await onHand(eq, warehouseId)).toBe(3)
    expect(await inConsumption(eq, TEST_COMPANY_ID)).toBe(2)
    expect(await itemOf(id)).toMatchObject({ qtyReturned: 1, qtyOutstanding: 2, status: 'out' })

    await giveBack([{ issueLineId: id, qtyReturned: 2, condition: 'good', toLocationId: warehouseId }])
    expect(await onHand(eq, warehouseId)).toBe(5)
    expect(await itemOf(id)).toMatchObject({ qtyReturned: 3, qtyOutstanding: 0, status: 'returned' })
    expect((await items({ status: 'open' })).map((i) => i.issueLineId)).not.toContain(id)
    expect((await items({ status: 'all' })).map((i) => i.issueLineId)).toContain(id)
  })

  it('refuses more than is out, with the numbers, and changes nothing', async () => {
    const eq = await makeProduct(TEST_COMPANY_ID, { returnable: true, suffix: 'over' })
    await receive(TEST_COMPANY_ID, eq, 5)
    const so = await storeOut([{ productId: eq, qty: 2 }])
    await expect(
      giveBack([{ issueLineId: so.lineIds[0]!, qtyReturned: 3, condition: 'good', toLocationId: warehouseId }]),
    ).rejects.toThrow(/only 2 still out \(2 issued, 0 already returned or lost\)/)
    expect(await onHand(eq, warehouseId)).toBe(3)
    const n = await pool.query(`SELECT 1 FROM store_out_return_lines WHERE issue_line_id=$1`, [so.lineIds[0]])
    expect(n.rows).toHaveLength(0)
  })

  it('takes damaged and needs-repair equipment back into inventory and records the condition', async () => {
    const eq = await makeProduct(TEST_COMPANY_ID, { returnable: true, suffix: 'cond' })
    await receive(TEST_COMPANY_ID, eq, 4)
    const so = await storeOut([{ productId: eq, qty: 4 }])
    const id = so.lineIds[0]!
    await giveBack([{ issueLineId: id, qtyReturned: 1, condition: 'needs_repair', toLocationId: warehouseId, remarks: 'Cable frayed' }])
    await giveBack([{ issueLineId: id, qtyReturned: 1, condition: 'damaged', toLocationId: warehouseId }])
    expect(await onHand(eq, warehouseId)).toBe(2)
    const rows = await pool.query<{ condition: string; remarks: string | null; stock_move_id: string | null }>(
      `SELECT condition, remarks, stock_move_id FROM store_out_return_lines WHERE issue_line_id=$1 ORDER BY created_at, id`,
      [id],
    )
    expect(rows.rows.map((r) => r.condition)).toEqual(['needs_repair', 'damaged'])
    expect(rows.rows[0]!.remarks).toBe('Cable frayed')
    expect(rows.rows.every((r) => r.stock_move_id)).toBe(true)
    expect(await itemOf(id)).toMatchObject({ qtyReturned: 2, qtyOutstanding: 2 })
  })

  it('writes a lost quantity off, never puts it back, and charges the project at the line cost as stock issued', async () => {
    const eq = await makeProduct(TEST_COMPANY_ID, { returnable: true, suffix: 'lost' })
    await receive(TEST_COMPANY_ID, eq, 3, 40)
    const so = await storeOut([{ productId: eq, qty: 3, unitCost: 40 }])
    const id = so.lineIds[0]!
    const before = await projectCost()

    const r = await giveBack([{ issueLineId: id, qtyReturned: 2, condition: 'lost', remarks: 'Fell off the scaffold' }])
    expect(r.lines[0]).toMatchObject({ condition: 'lost', toLocationName: null })

    expect(await onHand(eq, warehouseId)).toBe(0) // nothing came back
    expect(await inConsumption(eq, TEST_COMPANY_ID)).toBe(3) // still counted as used up
    expect(await itemOf(id)).toMatchObject({ qtyLost: 2, qtyReturned: 0, qtyOutstanding: 1 })
    const after = await projectCost()
    expect(after).toHaveLength(before.length + 1)
    expect(after.map((c) => parseFloat(c.amount))).toContain(80) // 2 x 40
    const moves = await pool.query(`SELECT 1 FROM stock_moves WHERE source_type='equipment_return' AND product_id=$1`, [eq])
    expect(moves.rows).toHaveLength(0)
  })

  it('refuses a lost line with no reason or with a location, and any other line with no location', async () => {
    const eq = await makeProduct(TEST_COMPANY_ID, { returnable: true, suffix: 'rules' })
    await receive(TEST_COMPANY_ID, eq, 3)
    const id = (await storeOut([{ productId: eq, qty: 3 }])).lineIds[0]!
    await expect(giveBack([{ issueLineId: id, qtyReturned: 1, condition: 'lost' }])).rejects.toThrow(/what happened/)
    await expect(
      giveBack([{ issueLineId: id, qtyReturned: 1, condition: 'lost', remarks: 'gone', toLocationId: warehouseId }]),
    ).rejects.toThrow(/does not go back to a location/)
    await expect(giveBack([{ issueLineId: id, qtyReturned: 1, condition: 'good' }])).rejects.toThrow(/Choose the location/)
    await expect(
      giveBack([{ issueLineId: id, qtyReturned: 1, condition: 'broken', toLocationId: warehouseId }]),
    ).rejects.toThrow(/Condition must be/)
    await expect(giveBack([{ issueLineId: id, qtyReturned: 0, condition: 'good', toLocationId: warehouseId }])).rejects.toThrow(/greater than 0/)
    await expect(giveBack([])).rejects.toThrow(/at least one line/)
    await expect(
      giveBack([
        { issueLineId: id, qtyReturned: 1, condition: 'good', toLocationId: warehouseId },
        { issueLineId: id, qtyReturned: 1, condition: 'good', toLocationId: warehouseId },
      ]),
    ).rejects.toThrow(/only once/)
    expect(await itemOf(id)).toMatchObject({ qtyReturned: 0, qtyOutstanding: 3 })
  })

  it('refuses a virtual location, another company\'s location and an inactive one as the place it goes back to', async () => {
    const eq = await makeProduct(TEST_COMPANY_ID, { returnable: true, suffix: 'dest' })
    await receive(TEST_COMPANY_ID, eq, 2)
    const id = (await storeOut([{ productId: eq, qty: 2 }])).lineIds[0]!
    await expect(giveBack([{ issueLineId: id, qtyReturned: 1, condition: 'good', toLocationId: virtualInId }])).rejects.toThrow(/Virtual/i)
    await expect(giveBack([{ issueLineId: id, qtyReturned: 1, condition: 'good', toLocationId: factoryWarehouseId }])).rejects.toThrow(
      /of your own company/,
    )
    const inactive = await pool.query<{ id: string }>(
      `INSERT INTO stock_locations (company_id, name, type, is_active) VALUES ($1,$2,'warehouse',false) RETURNING id`,
      [TEST_COMPANY_ID, `${SKU_PREFIX}inactive-${Date.now()}`],
    )
    try {
      await expect(giveBack([{ issueLineId: id, qtyReturned: 1, condition: 'good', toLocationId: inactive.rows[0]!.id }])).rejects.toThrow(
        /of your own company/,
      )
    } finally {
      await pool.query(`DELETE FROM stock_locations WHERE id=$1`, [inactive.rows[0]!.id])
    }
    expect(await itemOf(id)).toMatchObject({ qtyOutstanding: 2 })
  })

  it('does not let a consumable line, a draft line or an unknown id be returned this way', async () => {
    const cons = await makeProduct(TEST_COMPANY_ID, { suffix: 'cons2' })
    const eq = await makeProduct(TEST_COMPANY_ID, { returnable: true, suffix: 'draft' })
    await receive(TEST_COMPANY_ID, cons, 3)
    await receive(TEST_COMPANY_ID, eq, 3)
    const c = await storeOut([{ productId: cons, qty: 1 }])
    await expect(
      giveBack([{ issueLineId: c.lineIds[0]!, qtyReturned: 1, condition: 'good', toLocationId: warehouseId }]),
    ).rejects.toThrow(/not returnable equipment/)
    const d = await storeOut([{ productId: eq, qty: 1 }], { confirm: false })
    await expect(
      giveBack([{ issueLineId: d.lineIds[0]!, qtyReturned: 1, condition: 'good', toLocationId: warehouseId }]),
    ).rejects.toThrow(/never issued/)
    await expect(
      giveBack([{ issueLineId: '00000000-0000-0000-0000-00000000dead', qtyReturned: 1, condition: 'good', toLocationId: warehouseId }]),
    ).rejects.toThrow(/not found/)
  })

  it('waits for the line lock and then counts what another return already took, so the same unit is never returned twice', async () => {
    const eq = await makeProduct(TEST_COMPANY_ID, { returnable: true, suffix: 'lock' })
    await receive(TEST_COMPANY_ID, eq, 1)
    const id = (await storeOut([{ productId: eq, qty: 1 }])).lineIds[0]!
    const holder = await pool.connect()
    try {
      await holder.query('BEGIN')
      await holder.query(`SELECT 1 FROM project_material_issue_lines WHERE id=$1 FOR UPDATE`, [id])
      let settled = false
      const attempt = giveBack([{ issueLineId: id, qtyReturned: 1, condition: 'good', toLocationId: warehouseId }]).finally(() => {
        settled = true
      })
      // the return must be WAITING on the line lock, not running past it
      let waiting = false
      for (let i = 0; i < 40 && !waiting && !settled; i++) {
        await new Promise((r) => setTimeout(r, 50))
        const w = await pool.query(
          `SELECT 1 FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND query LIKE '%FOR UPDATE OF il%'`,
        )
        waiting = w.rows.length > 0
      }
      expect(waiting).toBe(true)
      // meanwhile "the other return" lands and commits
      const hdr = await holder.query<{ id: string }>(
        `INSERT INTO store_out_returns (company_id, return_number, created_by) VALUES ($1,$2,$3) RETURNING id`,
        [TEST_COMPANY_ID, `LOCK-${Date.now()}`, userId],
      )
      await holder.query(
        `INSERT INTO store_out_return_lines (return_id, issue_line_id, product_id, qty_returned, condition, to_location_id)
         VALUES ($1,$2,$3,1,'good',$4)`,
        [hdr.rows[0]!.id, id, eq, warehouseId],
      )
      await holder.query('COMMIT')
      await expect(attempt).rejects.toThrow(/only 0 still out/)
    } finally {
      holder.release()
    }
  })

  it('lets only one of two simultaneous returns take the last unit', async () => {
    const eq = await makeProduct(TEST_COMPANY_ID, { returnable: true, suffix: 'race' })
    await receive(TEST_COMPANY_ID, eq, 1)
    const id = (await storeOut([{ productId: eq, qty: 1 }])).lineIds[0]!
    const attempt = () => giveBack([{ issueLineId: id, qtyReturned: 1, condition: 'good', toLocationId: warehouseId }])
    const results = await Promise.allSettled([attempt(), attempt()])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const lost = results.find((r) => r.status === 'rejected') as PromiseRejectedResult
    expect(String(lost.reason)).toMatch(/only 0 still out/)
    expect(await onHand(eq, warehouseId)).toBe(1)
  })
})

describe('a loan from the central warehouse to another company', () => {
  async function loan(qty = 2): Promise<{ eq: string; so: Built }> {
    const eq = await makeProduct(FACTORY_COMPANY_ID, { returnable: true, suffix: 'loan' })
    await receive(FACTORY_COMPANY_ID, eq, 5, 120)
    const so = await storeOut([{ productId: eq, qty, unitCost: 120, fromLocationId: factoryWarehouseId }])
    return { eq, so }
  }

  it("moves stock only inside the lender's books, with no price, no inter-company transfer and no bill", async () => {
    const { eq, so } = await loan(2)
    expect(await onHand(eq, factoryWarehouseId)).toBe(3)
    expect(await inConsumption(eq, FACTORY_COMPANY_ID)).toBe(2)
    expect(await inConsumption(eq, TEST_COMPANY_ID)).toBe(0)
    const transfers = await pool.query(`SELECT 1 FROM interco_stock_transfers WHERE initiated_by=$1`, [userId])
    const bills = await pool.query(`SELECT 1 FROM interco_transactions WHERE created_by=$1`, [userId])
    expect(transfers.rows).toHaveLength(0)
    expect(bills.rows).toHaveLength(0)
    // the borrower's own project is charged nothing for it
    const cost = await pool.query(`SELECT 1 FROM project_cost_actuals WHERE source_type='stock_issue' AND source_id=$1`, [so.issueId])
    expect(cost.rows).toHaveLength(0)
    // and the line now points at the lender's consumption location, where a return takes it back from
    const line = await pool.query<{ type: string; company_id: string }>(
      `SELECT sl.type, sl.company_id FROM project_material_issue_lines il JOIN stock_locations sl ON sl.id=il.to_location_id WHERE il.id=$1`,
      [so.lineIds[0]],
    )
    expect(line.rows[0]).toEqual({ type: 'virtual_out', company_id: FACTORY_COMPANY_ID })
  })

  it('is on both companies\' lists, but only the lender can take it back, and the lender never sees the borrower\'s project', async () => {
    const { so } = await loan(1)
    const id = so.lineIds[0]!
    const asBorrower = await itemOf(id, ctx)
    const asLender = await itemOf(id, factoryCtx)
    expect(asBorrower).toMatchObject({ isLoan: true, canReceiveBack: false })
    expect(asBorrower?.projectCode).toBeTruthy()
    expect(asLender).toMatchObject({ isLoan: true, canReceiveBack: true, issuedToName: 'Ahmed Ali' })
    expect(asLender?.projectCode).toBeNull()
    expect(asLender?.borrowerCompanyName).toBeTruthy()
    expect(asLender?.ownerCompanyName).toBe(asBorrower?.ownerCompanyName)
    // the borrower cannot receive it back: for them the line is simply not theirs to return
    await expect(giveBack([{ issueLineId: id, qtyReturned: 1, condition: 'good', toLocationId: warehouseId }], ctx)).rejects.toThrow(/not found/)
  })

  it("is taken back by the lender into the lender's own location, and a lost loan is a write-off that charges no project", async () => {
    const { eq, so } = await loan(2)
    const id = so.lineIds[0]!
    const costBefore = await projectCost()
    await giveBack([{ issueLineId: id, qtyReturned: 1, condition: 'good', toLocationId: factoryWarehouseId }], factoryCtx)
    expect(await onHand(eq, factoryWarehouseId)).toBe(4)
    await giveBack([{ issueLineId: id, qtyReturned: 1, condition: 'lost', remarks: 'Not returned by the site' }], factoryCtx)
    expect(await inConsumption(eq, FACTORY_COMPANY_ID)).toBe(1)
    expect(await projectCost()).toEqual(costBefore)
    expect(await itemOf(id, factoryCtx)).toMatchObject({ qtyReturned: 1, qtyLost: 1, qtyOutstanding: 0, status: 'returned' })
    // the lender cannot put it back into the borrower's location either
    const eq2 = await loan(1)
    await expect(
      giveBack([{ issueLineId: eq2.so.lineIds[0]!, qtyReturned: 1, condition: 'good', toLocationId: warehouseId }], factoryCtx),
    ).rejects.toThrow(/of your own company/)
  })

  it("refuses to lend from a company that is not the central warehouse", async () => {
    const prod = await makeProduct(TEST_COMPANY_ID, { returnable: true, suffix: 'notcentral' })
    await receive(TEST_COMPANY_ID, prod, 3)
    // the Factory user issues from the TEST company's shelf: that company is not a central warehouse
    const so = await storeOut([{ productId: prod, qty: 1, fromLocationId: warehouseId }], { as: factoryCtx, project: false, confirm: false })
    await expect(resolvers.Mutation.issueMaterialIssue(null, { id: so.issueId }, factoryCtx as never)).rejects.toThrow(
      /central warehouse/,
    )
    expect(await onHand(prod, warehouseId)).toBe(3)
  })
})

describe('equipment never goes through the Material Return or billing paths', () => {
  it('is not offered as a Material Return and cannot be returned that way, when a requisition covered it from stock', async () => {
    const eq = await makeProduct(TEST_COMPANY_ID, { returnable: true, suffix: 'req' })
    await receive(TEST_COMPANY_ID, eq, 10, 30)
    const created = (await resolvers.Mutation.createRequisition(
      null,
      {
        input: {
          purpose: 'project',
          project_id: projectId,
          delivery_destination: 'inventory',
          lines: [{ product_id: eq, description: 'x', qty: 2, unit_price: 1 }],
        },
      },
      ctx as never,
    )) as { id: string }
    {
      const lineId = (await pool.query<{ id: string }>(`SELECT id FROM po_lines WHERE requisition_id=$1`, [created.id])).rows[0]!.id
      await resolvers.Mutation.submitRequisitionToInventoryCheck(null, { id: created.id }, ctx as never)
      await resolvers.Mutation.confirmRequisitionInventoryCheck(
        null,
        { id: created.id, lineStockQtys: [{ lineId, qtyFromStock: 2, sourceLocationId: warehouseId }] },
        ctx as never,
      )
      await resolvers.Mutation.approveRequisition(null, { id: created.id }, ctx as never)
      const issueId = (
        await pool.query<{ id: string }>(`SELECT id FROM project_material_issues WHERE requisition_id=$1`, [created.id])
      ).rows[0]!.id
      const costBefore = await projectCost()
      await resolvers.Mutation.issueMaterialIssue(null, { id: issueId }, ctx as never)
      // the auto-made line never heard of equipment, but its product is flagged: it is equipment when confirmed
      const line = await pool.query<{ id: string; is_returnable: boolean; expected_return_date: string | null }>(
        `SELECT id, is_returnable, expected_return_date::text FROM project_material_issue_lines WHERE issue_id=$1`,
        [issueId],
      )
      expect(line.rows[0]!.is_returnable).toBe(true)
      expect(line.rows[0]!.expected_return_date).toBe(addDaysToDateOnly(TODAY, 7))
      expect(await projectCost()).toEqual(costBefore)
      expect(await itemOf(line.rows[0]!.id)).toMatchObject({ qtyOutstanding: 2, status: 'out' })

      const offered = (await resolvers.Query.returnableMaterialIssueLines(null, { productId: eq }, ctx as never)) as unknown[]
      expect(offered).toEqual([])
      await expect(
        resolvers.Mutation.createMaterialReturn(
          null,
          { input: { requisitionId: created.id, lines: [{ issueLineId: line.rows[0]!.id, toLocationId: warehouseId, qtyReturned: 1 }] } },
          ctx as never,
        ),
      ).rejects.toThrow(/returnable equipment/)
    }
    // the whole-file cleanup removes the requisition, its Store Out and the moves that point at its line
  })

  it('is left out of what a project can be invoiced for', async () => {
    const eq = await makeProduct(TEST_COMPANY_ID, { returnable: true, suffix: 'bill' })
    const cons = await makeProduct(TEST_COMPANY_ID, { suffix: 'bill2' })
    await receive(TEST_COMPANY_ID, eq, 2)
    await receive(TEST_COMPANY_ID, cons, 2)
    const so = await storeOut([
      { productId: eq, qty: 1 },
      { productId: cons, qty: 1 },
    ])
    // the real cost-plus builder (what the invoice wizard offers), not a copy of its SQL
    const client = await pool.connect()
    try {
      const lines = await buildCostPlusLines(
        { client, projectId, contractId: '00000000-0000-0000-0000-000000000000', companyId: TEST_COMPANY_ID, userId },
        {
          includeCompletedMOs: false,
          includeReceivedPOs: false,
          includeStockIssues: true,
          includeRental: false,
          defaultMarginPct: 0,
          displayMode: 'summarised',
        },
      )
      const offered = lines.map((l) => l.source_id)
      expect(offered).toContain(so.lineIds[1])
      expect(offered).not.toContain(so.lineIds[0])
    } finally {
      client.release()
    }
  })
})
