// Settling purchase-order lines against an employee advance (lib/advancePOLines.ts).
//
// Two things had drifted from the flow in use since the requisition split:
//  1. the settlement queue and the bundle-and-settle path accepted only POs with status 'completed', but a child PO of
//     the current flow closes as 'closed', so an advance-funded PO of the current flow could never be settled;
//  2. the settlement journal tagged every project line with the project's analytic account, and a posted journal line
//     with an analytic account is copied into project cost (trg_sync_project_costs), so a jobsite delivery (cost booked
//     when the goods arrived) or a stock purchase (charged by a Store Out) was charged to the project a second time.
// Real Postgres through the real routes (supertest), in the finance fixture company.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { pool } from '@fnc-erp/db'
import { TEST_COMPANY_ID, createTestUser, getAccountId } from './setup.js'
import { SETTLEABLE_PO_STATUSES } from '../src/lib/advancePOLines.js'

const app = createApp()
const PREFIX = 'F-ADVPO-TEST-'

let token = ''
let userId = ''
let advanceA = ''
let advanceB = ''
let expenseAccountId = ''
let costCenterId = ''
let analyticId = ''
let projectWithAnalytic = ''
let projectWithoutAnalytic = ''
const L: Record<string, string> = {} // line ids by key

const auth = () => ({ Authorization: `Bearer ${token}` })

async function makePO(opts: {
  key: string
  status: string
  project: string | null
  destination: string | null
  amount: number
  advance?: string
  costed?: boolean // a direct-delivery cost row exists for the line
}) {
  const po = await pool.query<{ id: string }>(
    `INSERT INTO purchase_orders
       (company_id, po_number, currency_code, base_currency_code, status, purpose, project_id, linked_project_id, created_by,
        funding_source, funding_decided, funding_advance_id, delivery_destination)
     VALUES ($1,$2,'IQD','IQD',$3,$4,$5,$5,$6,'employee_advance',true,$7,$8) RETURNING id`,
    [TEST_COMPANY_ID, `${PREFIX}${opts.key}`, opts.status, opts.project ? 'project' : 'stock', opts.project, userId, opts.advance ?? advanceA, opts.destination],
  )
  const line = await pool.query<{ id: string }>(
    `INSERT INTO po_lines (po_id, line_number, description, qty_ordered, unit_price, total_price, currency_code, account_id, cost_center_id)
     VALUES ($1,1,$2,1,$3,$3,'IQD',$4,$5) RETURNING id`,
    [po.rows[0]!.id, `${opts.key} line`, opts.amount, expenseAccountId, costCenterId],
  )
  L[opts.key] = line.rows[0]!.id
  if (opts.costed && opts.project) {
    await pool.query(
      `INSERT INTO project_cost_actuals (project_id, amount, currency_code, entry_date, source_type, source_id, cost_category)
       VALUES ($1,$2,'IQD',CURRENT_DATE,'po_direct_delivery',$3,'materials')`,
      [opts.project, opts.amount, line.rows[0]!.id],
    )
  }
}

async function cleanup(): Promise<void> {
  const settlements = (
    await pool.query<{ id: string; journal_entry_id: string | null }>(
      `SELECT s.id, s.journal_entry_id FROM advance_settlements s JOIN employee_advances a ON a.id = s.advance_id WHERE a.advance_number LIKE $1`,
      [`${PREFIX}%`],
    )
  ).rows
  await pool.query(
    `UPDATE po_lines SET advance_settlement_id = NULL WHERE po_id IN (SELECT id FROM purchase_orders WHERE po_number LIKE $1)`,
    [`${PREFIX}%`],
  )
  await pool.query(`DELETE FROM project_cost_actuals WHERE project_id IN (SELECT id FROM projects WHERE code LIKE $1)`, [`${PREFIX}%`])
  const journalIds = settlements.map((s) => s.journal_entry_id).filter((x): x is string => !!x)
  await pool.query(`DELETE FROM advance_settlements WHERE id = ANY($1::uuid[])`, [settlements.map((s) => s.id)])
  if (journalIds.length) {
    await pool.query(`DELETE FROM journal_lines WHERE journal_entry_id = ANY($1::uuid[])`, [journalIds])
    await pool.query(`DELETE FROM journal_entries WHERE id = ANY($1::uuid[])`, [journalIds])
  }
  await pool.query(`DELETE FROM po_lines WHERE po_id IN (SELECT id FROM purchase_orders WHERE po_number LIKE $1)`, [`${PREFIX}%`])
  await pool.query(`DELETE FROM purchase_orders WHERE po_number LIKE $1`, [`${PREFIX}%`])
  await pool.query(`DELETE FROM employee_advances WHERE advance_number LIKE $1`, [`${PREFIX}%`])
  await pool.query(`DELETE FROM projects WHERE code LIKE $1`, [`${PREFIX}%`])
  await pool.query(`DELETE FROM analytic_accounts WHERE code LIKE $1`, [`${PREFIX}%`])
  await pool.query(`DELETE FROM cost_centers WHERE code LIKE $1`, [`${PREFIX}%`])
  await pool.query(`DELETE FROM employees WHERE employee_number LIKE $1`, [`${PREFIX}%`])
}

beforeAll(async () => {
  await cleanup()
  const user = await createTestUser()
  token = user.token
  userId = user.userId
  expenseAccountId = await getAccountId('5100')
  const cashId = await getAccountId('1100')
  const advanceAssetId = await getAccountId('1200')
  costCenterId = (
    await pool.query<{ id: string }>(`INSERT INTO cost_centers (company_id, code, name, type) VALUES ($1,$2,'Advance PO test cc','overhead') RETURNING id`, [
      TEST_COMPANY_ID,
      `${PREFIX}CC`,
    ])
  ).rows[0]!.id
  analyticId = (
    await pool.query<{ id: string }>(`INSERT INTO analytic_accounts (company_id, code, name) VALUES ($1,$2,'Advance PO test analytic') RETURNING id`, [
      TEST_COMPANY_ID,
      `${PREFIX}AA`,
    ])
  ).rows[0]!.id
  projectWithAnalytic = (
    await pool.query<{ id: string }>(
      `INSERT INTO projects (company_id, code, name, status, budget_currency, analytic_account_id, created_by)
       VALUES ($1,$2,'With analytic','approved','IQD',$3,$4) RETURNING id`,
      [TEST_COMPANY_ID, `${PREFIX}PRJ-A`, analyticId, userId],
    )
  ).rows[0]!.id
  projectWithoutAnalytic = (
    await pool.query<{ id: string }>(
      `INSERT INTO projects (company_id, code, name, status, budget_currency, created_by) VALUES ($1,$2,'Without analytic','approved','IQD',$3) RETURNING id`,
      [TEST_COMPANY_ID, `${PREFIX}PRJ-N`, userId],
    )
  ).rows[0]!.id
  // A trigger (migration 139) gives every new project an analytic account; clear the link to reproduce a project that has none
  // (a dangling reference), the case the settlement refuses for a line that would need the tag.
  await pool.query(`UPDATE projects SET analytic_account_id = NULL WHERE id = $1`, [projectWithoutAnalytic])
  const employeeId = (
    await pool.query<{ id: string }>(
      `INSERT INTO employees (company_id, first_name, last_name, hire_date, employee_number, status) VALUES ($1,'Adv','PoTester',CURRENT_DATE,$2,'active') RETURNING id`,
      [TEST_COMPANY_ID, `${PREFIX}${Date.now()}`],
    )
  ).rows[0]!.id
  const mkAdvance = async (tag: string, amount: number) =>
    (
      await pool.query<{ id: string }>(
        `INSERT INTO employee_advances (company_id, advance_number, employee_id, employee_name, currency_code, amount, cash_account_id, advance_account_id, status)
         VALUES ($1,$2,$3,'Adv PoTester','IQD',$4,$5,$6,'approved') RETURNING id`,
        [TEST_COMPANY_ID, `${PREFIX}${tag}-${Date.now()}`, employeeId, amount, cashId, advanceAssetId],
      )
    ).rows[0]!.id
  advanceA = await mkAdvance('A', 10_000_000)
  advanceB = await mkAdvance('B', 10_000_000)

  // a jobsite delivery of the current flow, closed: its cost is on the project already
  await makePO({ key: 'JOBSITE', status: 'closed', project: projectWithAnalytic, destination: 'jobsite', amount: 100_000, costed: true })
  // an older PO (no delivery cost row, no destination), completed: the settlement is the only place its cost is booked
  await makePO({ key: 'OLDFLOW', status: 'completed', project: projectWithAnalytic, destination: null, amount: 50_000 })
  // stock bought for a project: the Store Out charges the project, not the settlement
  await makePO({ key: 'STOCK', status: 'closed', project: projectWithAnalytic, destination: 'inventory', amount: 30_000 })
  // not finished yet
  await makePO({ key: 'PENDING', status: 'payment_pending', project: projectWithAnalytic, destination: 'jobsite', amount: 20_000, costed: true })
  // funded by ANOTHER advance
  await makePO({ key: 'OTHERADV', status: 'closed', project: projectWithAnalytic, destination: 'jobsite', amount: 10_000, advance: advanceB, costed: true })
  // no project at all
  await makePO({ key: 'NOPROJECT', status: 'closed', project: null, destination: null, amount: 5_000 })
  // a project that has no analytic account: fine when the cost is already on the project, refused when it would need the tag
  await makePO({ key: 'NOANALYTIC_COSTED', status: 'closed', project: projectWithoutAnalytic, destination: 'jobsite', amount: 7_000, costed: true })
  await makePO({ key: 'NOANALYTIC_OLD', status: 'completed', project: projectWithoutAnalytic, destination: null, amount: 8_000 })
})

afterAll(async () => {
  await cleanup()
  await pool.query(`DELETE FROM sessions WHERE refresh_token_hash = 'test-refresh-hash-finance'`)
  await pool.query(`DELETE FROM users WHERE email = 'finance-test@fnc-erp.local'`)
  await pool.end()
})

const settle = (advance: string, lines: string[]) =>
  request(app).post('/finance/advances/settlements').set(auth()).send({ advance_id: advance, po_line_ids: lines })

async function journalOf(settlementId: string) {
  const s = await pool.query<{ journal_entry_id: string }>(`SELECT journal_entry_id FROM advance_settlements WHERE id=$1`, [settlementId])
  const lines = await pool.query<{ description: string; debit: string; credit: string; analytic_account_id: string | null; cost_center_id: string | null; account_id: string }>(
    `SELECT description, debit, credit, analytic_account_id, cost_center_id, account_id FROM journal_lines WHERE journal_entry_id=$1 ORDER BY description`,
    [s.rows[0]!.journal_entry_id],
  )
  return lines.rows
}
const projectCostFromSettlements = async (project: string) =>
  Number(
    (
      await pool.query<{ s: string | null }>(
        `SELECT COALESCE(SUM(amount),0) AS s FROM project_cost_actuals WHERE project_id=$1 AND source_type='advance_settlement' AND currency_code='IQD'`,
        [project],
      )
    ).rows[0]!.s,
  )

describe('which POs can be settled: completed and closed', () => {
  it('the list of settleable statuses is exactly these two', () => {
    expect([...SETTLEABLE_PO_STATUSES].sort()).toEqual(['closed', 'completed'])
  })

  it('the settlement queue lists the lines of closed and completed POs of this advance, and nothing else', async () => {
    const res = await request(app).get(`/finance/advances/${advanceA}/pending-po-lines`).set(auth())
    expect(res.status).toBe(200)
    const ids = new Set((res.body.data as { id: string }[]).map((r) => r.id))
    for (const key of ['JOBSITE', 'OLDFLOW', 'STOCK', 'NOPROJECT', 'NOANALYTIC_COSTED', 'NOANALYTIC_OLD']) expect(ids.has(L[key]!), key).toBe(true)
    expect(ids.has(L['PENDING']!)).toBe(false) // still at payment_pending
    expect(ids.has(L['OTHERADV']!)).toBe(false) // belongs to the other advance's queue
  })

  it('a line of a PO that is not finished, or of another advance, cannot be bundled', async () => {
    for (const key of ['PENDING', 'OTHERADV']) {
      const res = await settle(advanceA, [L[key]!])
      expect(res.status, key).toBe(422)
      expect(res.body.error.code).toBe('INELIGIBLE_LINES')
    }
    const claimed = await pool.query(`SELECT 1 FROM po_lines WHERE id = ANY($1::uuid[]) AND advance_settlement_id IS NOT NULL`, [[L['PENDING'], L['OTHERADV']]])
    expect(claimed.rows).toHaveLength(0)
  })
})

describe('the project is not charged a second time', () => {
  it('lines whose cost is already on the project settle on their GL account and cost center only', async () => {
    const res = await settle(advanceA, [L['JOBSITE']!, L['STOCK']!, L['NOPROJECT']!, L['NOANALYTIC_COSTED']!])
    expect(res.status).toBe(201)
    const lines = await journalOf(res.body.data.id as string)
    const debits = lines.filter((l) => Number(l.debit) > 0)
    expect(debits).toHaveLength(4)
    for (const d of debits) {
      expect(d.analytic_account_id, d.description).toBeNull() // no project tag: no second project cost row
      expect(d.cost_center_id, d.description).toBe(costCenterId) // the classification still lands
      expect(d.account_id, d.description).toBe(expenseAccountId)
    }
    expect(Number(lines.find((l) => Number(l.credit) > 0)?.credit)).toBe(100_000 + 30_000 + 5_000 + 7_000)
    // the project cost from settlements stays at 0 for both projects
    expect(await projectCostFromSettlements(projectWithAnalytic)).toBe(0)
    expect(await projectCostFromSettlements(projectWithoutAnalytic)).toBe(0)
    // and each line is claimed
    const claimed = await pool.query(`SELECT count(*)::int AS n FROM po_lines WHERE id = ANY($1::uuid[]) AND advance_settlement_id = $2`, [
      [L['JOBSITE'], L['STOCK'], L['NOPROJECT'], L['NOANALYTIC_COSTED']],
      res.body.data.id,
    ])
    expect(claimed.rows[0].n).toBe(4)
  })

  it('a line of an older PO, where the settlement is the only place its cost is booked, keeps the project tag', async () => {
    const res = await settle(advanceA, [L['OLDFLOW']!])
    expect(res.status).toBe(201)
    const lines = await journalOf(res.body.data.id as string)
    const debit = lines.find((l) => Number(l.debit) > 0)
    expect(debit?.analytic_account_id).toBe(analyticId)
    expect(debit?.cost_center_id).toBe(costCenterId)
    expect(await projectCostFromSettlements(projectWithAnalytic)).toBe(50_000) // counted once, through the tag
  })

  it('a project with no analytic account still blocks a line that would need the tag, and nothing is claimed', async () => {
    const res = await settle(advanceA, [L['NOANALYTIC_OLD']!])
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('PROJECT_MISSING_ANALYTIC_ACCOUNT')
    const claimed = await pool.query(`SELECT 1 FROM po_lines WHERE id=$1 AND advance_settlement_id IS NOT NULL`, [L['NOANALYTIC_OLD']])
    expect(claimed.rows).toHaveLength(0)
  })

  it('a settled line leaves the queue and the advance balance goes down by what was settled', async () => {
    const res = await request(app).get(`/finance/advances/${advanceA}/pending-po-lines`).set(auth())
    const ids = new Set((res.body.data as { id: string }[]).map((r) => r.id))
    for (const key of ['JOBSITE', 'OLDFLOW', 'STOCK', 'NOPROJECT', 'NOANALYTIC_COSTED']) expect(ids.has(L[key]!), key).toBe(false)
    expect(ids.has(L['NOANALYTIC_OLD']!)).toBe(true) // refused above, still waiting
    const adv = await pool.query<{ settled_amount: string; outstanding_amount: string }>(
      `SELECT settled_amount, outstanding_amount FROM employee_advances WHERE id=$1`,
      [advanceA],
    )
    expect(Number(adv.rows[0]!.settled_amount)).toBe(100_000 + 30_000 + 5_000 + 7_000 + 50_000)
    expect(Number(adv.rows[0]!.outstanding_amount)).toBe(10_000_000 - 192_000)
  })
})
