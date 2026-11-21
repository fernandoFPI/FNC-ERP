// Stale stock cost (playbook #111). A requisition line covered from stock takes its store price from the product's Cost; when that
// Cost has not changed or been confirmed for more than 30 days the store keeper is asked to double-check it.
//
//   - the AGE of a Cost is the newest of its last real change, its last confirmation, and (with neither) the product's creation day;
//   - a line is flagged while its requisition is in a stage where the price still matters (an allow-list, checked against the CHECK
//     constraint so a status added later has to be classified);
//   - confirming the inventory check notifies the OTHER store keepers about the lines actually covered from stock;
//   - "Price confirmed" restarts the clock, for a Store Keeper of the requisition or an admin only, for a product on that requisition only.
//
// Real Postgres, through the real ApolloServer ({ typeDefs, resolvers }) so the schema's own field checks run (playbook #38).
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { ApolloServer } from '@apollo/server'
import { pool } from '@fnc-erp/db'
import { typeDefs } from '../src/graphql/schema.js'
import { resolvers } from '../src/graphql/resolvers.js'
import {
  STOCK_COST_STALE_DAYS,
  STOCK_COST_UNWATCHED_STATUSES,
  STOCK_COST_WATCH_STATUSES,
  staleStockCostNotice,
} from '../src/lib/staleStockCost.js'

const TEST_COMPANY_ID = 'f0000000-0000-0000-0000-000000000009'
const ADMIN_EMAIL = 'stale-cost-admin@fnc-erp.local'
const KEEPER_EMAIL = 'stale-cost-keeper@fnc-erp.local'
const KEEPER2_EMAIL = 'stale-cost-keeper2@fnc-erp.local'
const PLAIN_EMAIL = 'stale-cost-plain@fnc-erp.local'
const SKU_PREFIX = 'SSCTEST-'
const EMP_PREFIX = 'SSCEMP-'

type Ctx = { auth: { companyId: string; userId: string; role: string; module: string; sessionId: string } }
const server = new ApolloServer<Ctx>({ typeDefs, resolvers })

let adminId: string
let keeperId: string
let keeper2Id: string
let plainId: string
let warehouseId: string
let projectId: string
let admin: Ctx
let keeper: Ctx
let keeper2: Ctx
let plain: Ctx

const must = <T>(v: T | null | undefined): T => {
  if (v === null || v === undefined) throw new Error('expected a value')
  return v
}

async function gql(query: string, variables: Record<string, unknown> = {}, as: Ctx = admin) {
  const res = await server.executeOperation({ query, variables }, { contextValue: as })
  if (res.body.kind !== 'single') throw new Error('unexpected incremental response')
  return res.body.singleResult as { data?: Record<string, any> | null; errors?: readonly { message: string }[] }
}

async function makeUser(email: string): Promise<string> {
  const r = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [email],
  )
  return must(r.rows[0]).id
}

const ctxFor = (userId: string, role: string, key: string): Ctx => ({
  auth: { companyId: TEST_COMPANY_ID, userId, role, module: 'all', sessionId: `ssc-${key}` },
})

async function makeProduct(opts: { createdDaysAgo: number; historyDaysAgo?: number[]; confirmedDaysAgo?: number; onHand?: number }): Promise<string> {
  const sku = `${SKU_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const r = await pool.query<{ id: string }>(
    `INSERT INTO products (company_id, sku, name, uom, category, created_at, cost_confirmed_at)
     VALUES ($1,$2,$2,'unit','general', NOW() - make_interval(days => $3::int),
             CASE WHEN $4::int IS NULL THEN NULL ELSE NOW() - make_interval(days => $4::int) END)
     RETURNING id`,
    [TEST_COMPANY_ID, sku, opts.createdDaysAgo, opts.confirmedDaysAgo ?? null],
  )
  const id = must(r.rows[0]).id
  for (const d of opts.historyDaysAgo ?? [])
    await pool.query(
      `INSERT INTO product_cost_history (product_id, old_cost, new_cost, currency_code, source_type, changed_by, changed_at)
       VALUES ($1, 1, 2, 'IQD', 'manual_edit', $2, NOW() - make_interval(days => $3::int))`,
      [id, adminId, d],
    )
  const onHand = opts.onHand ?? 10
  if (onHand > 0) {
    const vi = await pool.query<{ id: string }>(
      `SELECT id FROM stock_locations WHERE company_id=$1 AND type='virtual_in' AND is_active=true LIMIT 1`,
      [TEST_COMPANY_ID],
    )
    await pool.query(
      `INSERT INTO stock_moves (company_id, product_id, from_location_id, to_location_id, moved_at, qty, unit_cost, total_cost, source_type, moved_by)
       VALUES ($1,$2,$3,$4,NOW(),$5,10,$6,'po_receipt',$7)`,
      [TEST_COMPANY_ID, id, must(vi.rows[0]).id, warehouseId, onHand, onHand * 10, adminId],
    )
  }
  return id
}

interface Req {
  id: string
  lineIds: string[]
}

/** A project requisition with one line per product (`null` = a custom line with no catalog product), sitting at inventory check. */
async function makeReqAtInventoryCheck(products: (string | null)[]): Promise<Req> {
  const created = await resolvers.Mutation.createRequisition(
    null,
    {
      input: {
        purpose: 'project',
        project_id: projectId,
        delivery_destination: 'inventory',
        lines: products.map((p, i) => ({ ...(p ? { product_id: p } : {}), description: `line ${i + 1}`, qty: 2, unit_price: 1 })),
      },
    },
    admin as never,
  )
  const id = (created as { id: string }).id
  await resolvers.Mutation.submitRequisitionToInventoryCheck(null, { id }, admin as never)
  const lines = await pool.query<{ id: string }>(`SELECT id FROM po_lines WHERE requisition_id=$1 ORDER BY line_number`, [id])
  return { id, lineIds: lines.rows.map((l) => l.id) }
}

const confirmCheck = (req: Req, qtys: number[], as: Ctx = admin) =>
  resolvers.Mutation.confirmRequisitionInventoryCheck(
    null,
    {
      id: req.id,
      lineStockQtys: req.lineIds.map((lineId, i) => ({
        lineId,
        qtyFromStock: qtys[i] ?? 0,
        ...((qtys[i] ?? 0) > 0 ? { sourceLocationId: warehouseId } : {}),
      })),
    },
    as as never,
  )

const LINES_QUERY = `query($id: ID!) { requisition(id: $id) { id status lines { id cost_age_days cost_stale qty_from_stock } } }`
async function readLines(req: Req, as: Ctx = admin): Promise<{ id: string; cost_age_days: number | null; cost_stale: boolean | null; qty_from_stock: string | null }[]> {
  const r = await gql(LINES_QUERY, { id: req.id }, as)
  expect(r.errors).toBeUndefined()
  return must(r.data?.requisition).lines
}

/** The notices queued for the store keepers of one requisition, once the fire-and-forget loop has stopped writing (playbook #35). */
async function notices(reqId: string): Promise<{ userId: string; title: string; body: string }[]> {
  let last = -1
  for (let i = 0; i < 40; i++) {
    const r = await pool.query<{ payload: { userId: string; title: string; body: string } }>(
      `SELECT payload FROM service_outbox WHERE event_type='REQ_STALE_STOCK_COST' AND payload->>'requisitionId'=$1`,
      [reqId],
    )
    if (r.rows.length === last && last >= 0) return r.rows.map((x) => x.payload)
    last = r.rows.length
    await new Promise((res) => setTimeout(res, 100))
  }
  throw new Error('notices did not settle')
}

async function cleanup(): Promise<void> {
  const mine = `SELECT id FROM requisitions WHERE company_id=$1 AND organizer_id = ANY($2::uuid[])`
  const who = [adminId, keeperId, keeper2Id, plainId].filter(Boolean)
  await pool.query(`DELETE FROM service_outbox WHERE event_type IN ('REQ_STALE_STOCK_COST','REQ_APPROVAL_REQUIRED','REQ_MARKET_PRICING_REQUIRED') AND payload->>'requisitionId' IN (SELECT id::text FROM requisitions WHERE company_id=$1 AND organizer_id = ANY($2::uuid[]))`, [TEST_COMPANY_ID, who])
  await pool.query(`DELETE FROM requisition_approved_totals WHERE requisition_id IN (${mine})`, [TEST_COMPANY_ID, who])
  await pool.query(`DELETE FROM requisition_approval_log WHERE requisition_id IN (${mine})`, [TEST_COMPANY_ID, who])
  await pool.query(`DELETE FROM project_material_issue_lines WHERE issue_id IN (SELECT id FROM project_material_issues WHERE company_id=$1 AND created_by = ANY($2::uuid[]))`, [TEST_COMPANY_ID, who])
  await pool.query(`DELETE FROM project_material_issues WHERE company_id=$1 AND created_by = ANY($2::uuid[])`, [TEST_COMPANY_ID, who])
  await pool.query(`DELETE FROM po_lines WHERE requisition_id IN (${mine})`, [TEST_COMPANY_ID, who])
  await pool.query(`DELETE FROM requisitions WHERE company_id=$1 AND organizer_id = ANY($2::uuid[])`, [TEST_COMPANY_ID, who])
  await pool.query(`DELETE FROM stock_moves WHERE company_id=$1 AND product_id IN (SELECT id FROM products WHERE company_id=$1 AND sku LIKE $2)`, [TEST_COMPANY_ID, `${SKU_PREFIX}%`])
  await pool.query(`DELETE FROM stock_balances WHERE product_id IN (SELECT id FROM products WHERE company_id=$1 AND sku LIKE $2)`, [TEST_COMPANY_ID, `${SKU_PREFIX}%`])
  await pool.query(`DELETE FROM products WHERE company_id=$1 AND sku LIKE $2`, [TEST_COMPANY_ID, `${SKU_PREFIX}%`])
  await pool.query(`DELETE FROM po_position_assignments WHERE company_id=$1 AND employee_id IN (SELECT id FROM employees WHERE company_id=$1 AND employee_number LIKE $2)`, [TEST_COMPANY_ID, `${EMP_PREFIX}%`])
  await pool.query(`DELETE FROM employees WHERE company_id=$1 AND employee_number LIKE $2`, [TEST_COMPANY_ID, `${EMP_PREFIX}%`])
  await pool.query(`DELETE FROM projects WHERE company_id=$1 AND code LIKE $2`, [TEST_COMPANY_ID, `${SKU_PREFIX}%`])
}

beforeAll(async () => {
  adminId = await makeUser(ADMIN_EMAIL)
  keeperId = await makeUser(KEEPER_EMAIL)
  keeper2Id = await makeUser(KEEPER2_EMAIL)
  plainId = await makeUser(PLAIN_EMAIL)
  admin = ctxFor(adminId, 'system_admin', 'admin')
  keeper = ctxFor(keeperId, 'user', 'keeper')
  keeper2 = ctxFor(keeper2Id, 'user', 'keeper2')
  plain = ctxFor(plainId, 'user', 'plain')
  await cleanup()

  const wh = await pool.query<{ id: string }>(`SELECT id FROM stock_locations WHERE company_id=$1 AND type='warehouse' AND is_active=true LIMIT 1`, [TEST_COMPANY_ID])
  if (!wh.rows[0]) throw new Error('No warehouse location seeded for test company: run seeds first')
  warehouseId = wh.rows[0].id
  const p = await pool.query<{ id: string }>(
    `INSERT INTO projects (company_id, code, name, status, created_by) VALUES ($1,$2,$2,'ongoing',$3) RETURNING id`,
    [TEST_COMPANY_ID, `${SKU_PREFIX}PRJ-${Date.now()}`, adminId],
  )
  projectId = must(p.rows[0]).id
  // the store keeper: a company-wide Store Keeper position, and nothing else
  const e = await pool.query<{ id: string }>(
    `INSERT INTO employees (company_id, user_id, first_name, last_name, hire_date, employee_number)
     VALUES ($1,$2,'Ssc','Keeper',CURRENT_DATE,$3)
     ON CONFLICT (company_id, employee_number) DO UPDATE SET user_id = EXCLUDED.user_id RETURNING id`,
    [TEST_COMPANY_ID, keeperId, `${EMP_PREFIX}KEEPER`],
  )
  await pool.query(
    `INSERT INTO po_position_assignments (company_id, employee_id, position, is_active, assigned_by) VALUES ($1,$2,'store_keeper',true,$3)`,
    [TEST_COMPANY_ID, must(e.rows[0]).id, adminId],
  )
  const e2 = await pool.query<{ id: string }>(
    `INSERT INTO employees (company_id, user_id, first_name, last_name, hire_date, employee_number)
     VALUES ($1,$2,'Ssc','Keeper2',CURRENT_DATE,$3)
     ON CONFLICT (company_id, employee_number) DO UPDATE SET user_id = EXCLUDED.user_id RETURNING id`,
    [TEST_COMPANY_ID, keeper2Id, `${EMP_PREFIX}KEEPER2`],
  )
  await pool.query(
    `INSERT INTO po_position_assignments (company_id, employee_id, position, is_active, assigned_by) VALUES ($1,$2,'store_keeper',true,$3)`,
    [TEST_COMPANY_ID, must(e2.rows[0]).id, adminId],
  )
})

afterAll(async () => {
  await cleanup()
  await pool.query(`DELETE FROM users WHERE email = ANY($1::text[])`, [[ADMIN_EMAIL, KEEPER_EMAIL, KEEPER2_EMAIL, PLAIN_EMAIL]])
  await pool.end()
})

describe('how old a product Cost is', () => {
  it('is the days since the product was created when it has never changed and was never confirmed', async () => {
    const p = await makeProduct({ createdDaysAgo: 45 })
    const req = await makeReqAtInventoryCheck([p])
    const [l] = await readLines(req)
    expect(l?.cost_age_days).toBe(45)
    expect(l?.cost_stale).toBe(true)
  })

  it('is not stale at exactly the limit and is stale one day over it', async () => {
    const atLimit = await makeProduct({ createdDaysAgo: STOCK_COST_STALE_DAYS })
    const over = await makeProduct({ createdDaysAgo: STOCK_COST_STALE_DAYS + 1 })
    const req = await makeReqAtInventoryCheck([atLimit, over])
    const lines = await readLines(req)
    expect(lines.map((l) => l.cost_stale)).toEqual([false, true])
  })

  it('restarts on a real cost change: the newest change wins over an old creation day', async () => {
    const p = await makeProduct({ createdDaysAgo: 120, historyDaysAgo: [90, 5] })
    const req = await makeReqAtInventoryCheck([p])
    const [l] = await readLines(req)
    expect(l?.cost_age_days).toBe(5)
    expect(l?.cost_stale).toBe(false)
  })

  it('counts from the newest of the last change and the last confirmation', async () => {
    const confirmedNewer = await makeProduct({ createdDaysAgo: 200, historyDaysAgo: [50], confirmedDaysAgo: 3 })
    const changedNewer = await makeProduct({ createdDaysAgo: 200, historyDaysAgo: [40], confirmedDaysAgo: 80 })
    const req = await makeReqAtInventoryCheck([confirmedNewer, changedNewer])
    const lines = await readLines(req)
    expect(lines.map((l) => l.cost_age_days)).toEqual([3, 40])
    expect(lines.map((l) => l.cost_stale)).toEqual([false, true])
  })

  it('is null, and never stale, for a custom line with no catalog product', async () => {
    const req = await makeReqAtInventoryCheck([null])
    const [l] = await readLines(req)
    expect(l?.cost_age_days).toBeNull()
    expect(l?.cost_stale).toBe(false)
  })
})

describe('the stages where the flag shows', () => {
  it('flags from the inventory check on, and not on a draft, a completed, a cancelled or a rejected requisition', async () => {
    const p = await makeProduct({ createdDaysAgo: 90 })
    const req = await makeReqAtInventoryCheck([p])
    expect((await readLines(req))[0]?.cost_stale).toBe(true)
    for (const status of STOCK_COST_UNWATCHED_STATUSES.filter((s) => s !== 'deleted')) {
      await pool.query(`UPDATE requisitions SET status=$2 WHERE id=$1`, [req.id, status])
      expect((await readLines(req))[0]?.cost_stale, status).toBe(false)
    }
    for (const status of STOCK_COST_WATCH_STATUSES) {
      await pool.query(`UPDATE requisitions SET status=$2 WHERE id=$1`, [req.id, status])
      expect((await readLines(req))[0]?.cost_stale, status).toBe(true)
    }
  })

  it('classifies every status the database accepts (a status added later has to be decided on, not flagged or ignored by accident)', async () => {
    const r = await pool.query<{ def: string }>(
      `SELECT pg_get_constraintdef(c.oid) AS def FROM pg_constraint c
        WHERE c.conrelid = 'requisitions'::regclass AND c.contype = 'c' AND pg_get_constraintdef(c.oid) LIKE '%inventory_check%'`,
    )
    const def = must(r.rows[0]).def
    const statuses = [...def.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!)
    expect(statuses.length).toBeGreaterThan(8)
    const known = new Set<string>([...STOCK_COST_WATCH_STATUSES, ...STOCK_COST_UNWATCHED_STATUSES])
    expect(statuses.filter((s) => !known.has(s))).toEqual([])
    expect([...known].filter((s) => !statuses.includes(s))).toEqual([])
  })
})

describe('the notice to the store keepers when the inventory check is confirmed', () => {
  it('tells the store keepers which items drawn from stock have an old cost', async () => {
    const p = await makeProduct({ createdDaysAgo: 47 })
    const req = await makeReqAtInventoryCheck([p])
    await confirmCheck(req, [2])
    const sent = await notices(req.id)
    expect(sent.map((n) => n.userId).sort()).toEqual([keeperId, keeper2Id].sort())
    const n = must(sent[0])
    expect(n.title).toBe('Double-check a store price')
    expect(n.body).toContain('1 item drawn from stock has a cost that has not changed for over 30 days')
    expect(n.body).toContain('47 days')
    expect(n.body).toContain('Double-check the store price')
    const sku = (await pool.query<{ sku: string }>(`SELECT sku FROM products WHERE id=$1`, [p])).rows[0]!.sku
    expect(n.body).toContain(sku)
  })

  it('does not tell the store keeper who confirmed the check about their own confirmation, only the others', async () => {
    const p = await makeProduct({ createdDaysAgo: 47 })
    const req = await makeReqAtInventoryCheck([p])
    await confirmCheck(req, [2], keeper)
    const sent = await notices(req.id)
    expect(sent.map((n) => n.userId)).toEqual([keeper2Id])
  })

  it('sends nothing when every cost drawn from stock is recent', async () => {
    const p = await makeProduct({ createdDaysAgo: 10 })
    const req = await makeReqAtInventoryCheck([p])
    await confirmCheck(req, [2])
    expect(await notices(req.id)).toEqual([])
  })

  it('sends nothing for an old cost whose item is NOT covered from stock', async () => {
    const stale = await makeProduct({ createdDaysAgo: 90 })
    const fresh = await makeProduct({ createdDaysAgo: 2 })
    const req = await makeReqAtInventoryCheck([stale, fresh])
    await confirmCheck(req, [0, 2])
    expect(await notices(req.id)).toEqual([])
  })

  it('names an item once, however many lines draw on it, and counts the items, not the lines', async () => {
    const p = await makeProduct({ createdDaysAgo: 60, onHand: 20 })
    const q = await makeProduct({ createdDaysAgo: 70 })
    const req = await makeReqAtInventoryCheck([p, p, q])
    await confirmCheck(req, [2, 2, 2])
    const sent = await notices(req.id)
    expect(sent).toHaveLength(2) // one per store keeper, each naming 2 items
    for (const n of sent) expect(n.body).toContain('2 items drawn from stock have a cost')
  })

  it('does not notify a store keeper of another scope: the notice goes to the requisition\'s own holders only', async () => {
    // a Store Keeper assigned to some OTHER project must not be told about this project's requisition
    const other = await makeUser('stale-cost-other@fnc-erp.local')
    const e = await pool.query<{ id: string }>(
      `INSERT INTO employees (company_id, user_id, first_name, last_name, hire_date, employee_number)
       VALUES ($1,$2,'Ssc','Other',CURRENT_DATE,$3) ON CONFLICT (company_id, employee_number) DO UPDATE SET user_id = EXCLUDED.user_id RETURNING id`,
      [TEST_COMPANY_ID, other, `${EMP_PREFIX}OTHER`],
    )
    const otherProject = await pool.query<{ id: string }>(
      `INSERT INTO projects (company_id, code, name, status, created_by) VALUES ($1,$2,$2,'ongoing',$3) RETURNING id`,
      [TEST_COMPANY_ID, `${SKU_PREFIX}PRJ2-${Date.now()}`, adminId],
    )
    await pool.query(
      `INSERT INTO po_position_assignments (company_id, employee_id, position, project_id, is_active, assigned_by) VALUES ($1,$2,'store_keeper',$3,true,$4)`,
      [TEST_COMPANY_ID, must(e.rows[0]).id, must(otherProject.rows[0]).id, adminId],
    )
    const p = await makeProduct({ createdDaysAgo: 80 })
    const req = await makeReqAtInventoryCheck([p])
    await confirmCheck(req, [2])
    const sent = await notices(req.id)
    expect(sent.map((n) => n.userId).sort()).toEqual([keeperId, keeper2Id].sort())
    await pool.query(`DELETE FROM po_position_assignments WHERE employee_id=$1`, [must(e.rows[0]).id])
    await pool.query(`DELETE FROM users WHERE id=$1`, [other])
  })
})

describe('the notice text', () => {
  it('names up to five items and counts the rest, in one sentence', () => {
    const lines = Array.from({ length: 7 }, (_, i) => ({ line_id: `l${i}`, product_id: `p${i}`, sku: `SKU-${i}`, product_name: `Item ${i}`, age_days: 31 + i }))
    const n = staleStockCostNotice(lines, 'REQ-2026-0001')
    expect(n.body).toContain('7 items drawn from stock have a cost')
    expect(n.body).toContain('SKU-4 (35 days)')
    expect(n.body).not.toContain('SKU-5')
    expect(n.body).toContain('and 2 more')
    expect(n.body).toContain('on REQ-2026-0001')
  })
})

describe('Price confirmed', () => {
  const CONFIRM = `mutation($r: ID!, $p: ID!) { confirmRequisitionStockCost(requisitionId: $r, productId: $p) }`
  const productRow = async (id: string) =>
    must((await pool.query<{ standard_cost: string | null; cost_confirmed_at: Date | null; cost_confirmed_by: string | null }>(
      `SELECT standard_cost, cost_confirmed_at, cost_confirmed_by FROM products WHERE id=$1`, [id])).rows[0])

  it('lets a Store Keeper of the requisition restart the clock, recording who and when, without touching the Cost or its history', async () => {
    const p = await makeProduct({ createdDaysAgo: 75 })
    const before = await productRow(p)
    const req = await makeReqAtInventoryCheck([p])
    expect((await readLines(req))[0]?.cost_stale).toBe(true)
    const r = await gql(CONFIRM, { r: req.id, p }, keeper)
    expect(r.errors).toBeUndefined()
    expect(r.data?.confirmRequisitionStockCost).toBe(true)
    const after = await productRow(p)
    expect(after.cost_confirmed_by).toBe(keeperId)
    expect(after.cost_confirmed_at).not.toBeNull()
    expect(after.standard_cost).toBe(before.standard_cost)
    const hist = await pool.query(`SELECT 1 FROM product_cost_history WHERE product_id=$1`, [p])
    expect(hist.rows).toHaveLength(0)
    const [l] = await readLines(req)
    expect(l?.cost_stale).toBe(false)
    expect(l?.cost_age_days).toBe(0)
    const audit = await pool.query(`SELECT 1 FROM audit_log WHERE action='CONFIRM_STOCK_COST' AND record_id=$1 AND user_id=$2`, [p, keeperId])
    expect(audit.rows.length).toBeGreaterThan(0)
  })

  it('lets an administrator do it too', async () => {
    const p = await makeProduct({ createdDaysAgo: 75 })
    const req = await makeReqAtInventoryCheck([p])
    const r = await gql(CONFIRM, { r: req.id, p }, admin)
    expect(r.errors).toBeUndefined()
    expect((await productRow(p)).cost_confirmed_by).toBe(adminId)
  })

  it('refuses a user who holds no Store Keeper position, and leaves the product alone', async () => {
    const p = await makeProduct({ createdDaysAgo: 75 })
    const req = await makeReqAtInventoryCheck([p])
    const r = await gql(CONFIRM, { r: req.id, p }, plain)
    expect(r.errors?.[0]?.message).toMatch(/Only a Store Keeper/)
    expect((await productRow(p)).cost_confirmed_at).toBeNull()
  })

  it('refuses a product that is not on the requisition, even for an administrator', async () => {
    const onIt = await makeProduct({ createdDaysAgo: 75 })
    const elsewhere = await makeProduct({ createdDaysAgo: 75 })
    const req = await makeReqAtInventoryCheck([onIt])
    const r = await gql(CONFIRM, { r: req.id, p: elsewhere }, admin)
    expect(r.errors?.[0]?.message).toMatch(/not on this requisition/)
    expect((await productRow(elsewhere)).cost_confirmed_at).toBeNull()
  })

  it('does not find another company\'s requisition', async () => {
    const p = await makeProduct({ createdDaysAgo: 75 })
    const req = await makeReqAtInventoryCheck([p])
    const stranger = ctxFor(adminId, 'system_admin', 'stranger')
    stranger.auth.companyId = 'f0000000-0000-0000-0000-0000000000aa'
    const r = await gql(CONFIRM, { r: req.id, p }, stranger)
    expect(r.errors?.[0]?.message).toMatch(/Requisition not found/)
    expect((await productRow(p)).cost_confirmed_at).toBeNull()
  })

  it('restarts the clock for every requisition at once: the flag is about the product, not the line', async () => {
    const p = await makeProduct({ createdDaysAgo: 75 })
    const a = await makeReqAtInventoryCheck([p])
    const b = await makeReqAtInventoryCheck([p])
    await gql(CONFIRM, { r: a.id, p }, keeper)
    expect((await readLines(b))[0]?.cost_stale).toBe(false)
  })
})
