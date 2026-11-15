// What counts as an OPEN purchase order, and what is "committed", on a project (playbook #92).
//
// NY-PRJ-2026-0032: all 22 POs were `closed` (everything received, settled, paid) and the project header still said
// Pending POs 23 and Committed 17,802.91 USD, Remaining Budget -18,653.41 USD. Every "is this PO open?" check carried its
// own copy of `status NOT IN ('completed','deleted')`, a list from before the requisition split: a PO of the current flow
// ends as `closed`, so every finished PO counted as open, and the header's Committed added up the whole HEADER total of each
// (one PO even added an IQD line into a USD total).
//
// These tests run the real resolvers and queries against real Postgres:
//  - the shared rule (packages/db poStatus.ts) classifies every status of purchase_orders_status_check;
//  - the project header, the projects list, the completion blockers, the cancel guard and the company dashboard all agree
//    that a closed or cancelled PO is not open;
//  - Committed is what was ordered and not yet received, per line currency (the Cost Control tab's rule, one SQL fragment);
//  - a budget row of 0 is "no budget", not minus everything spent;
//  - the project's cost ledger list (analytic account page) is the same data the header's Actual reads, behind the project's
//    own view guard, scoped to the company.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { ApolloServer } from '@apollo/server'
import { pool, FINISHED_PO_STATUSES, FINISHED_PO_STATUSES_SQL, isOpenPOStatus } from '@fnc-erp/db'
import { typeDefs } from '../src/graphql/schema.js'
import { resolvers } from '../src/graphql/resolvers.js'
import { COMMITTED_PO_STATUSES } from '../src/lib/costControlPurchases.js'
import { projectCostLedger } from '../src/lib/projectCostLedger.js'

const PREFIX = 'G-OPENPO-TEST-'
const EMAILS = { admin: 'g-openpo-admin@fnc-erp.local', other: 'g-openpo-other@fnc-erp.local' }

type TestCtx = {
  auth: { companyId: string; userId: string; role: string; module: string; sessionId: string }
}
const server = new ApolloServer<TestCtx>({ typeDefs, resolvers })

let companyId = ''
let otherCompanyId = ''
let adminId = ''
let otherId = ''
let vendorId = ''
let productId = ''
let projectId = '' // has a budget row of 0 ("no budget") and a mix of PO statuses
let budgetedProjectId = '' // has a real budget
let foreignProjectId = '' // another company's project, with cost
let storeProjectId = '' // store-priced stock lines on a finished and on an open PO, and a currency with nothing left to receive

const ctx = (): TestCtx => ({ auth: { companyId, userId: adminId, role: 'system_admin', module: 'all', sessionId: 'open-po' } })
const otherCtx = (): TestCtx => ({
  auth: { companyId: otherCompanyId, userId: otherId, role: 'system_admin', module: 'all', sessionId: 'open-po-o' },
})

type CostSummaryRow = {
  currencyCode: string
  budgetAmount: string | number | null
  actualCosts: string | number
  committedCosts: string | number
  storeCosts: string | number
  budgetRemaining: string | number | null
}
type RecentPo = {
  po_number: string
  status: string
  currency_code: string
  total_amount: string | null
  line_totals: { currency_code: string; amount: string | number }[]
}

async function gql<T>(query: string, variables: Record<string, unknown>, c: TestCtx = ctx()) {
  const res = await server.executeOperation({ query, variables }, { contextValue: c })
  if (res.body.kind !== 'single') throw new Error('expected a single result')
  return res.body.singleResult as { data?: T | null; errors?: { message: string }[] }
}

const HEADER_QUERY = `query H($id: ID!) { project(id: $id) { id openPoCount recentPos costSummary } }`
async function header(id: string = projectId) {
  const r = await gql<{ project: { openPoCount: number; recentPos: unknown; costSummary: unknown } }>(HEADER_QUERY, { id })
  if (r.errors) throw new Error(r.errors.map((e) => e.message).join('; '))
  const p = r.data!.project
  const parse = <T,>(v: unknown): T => (typeof v === 'string' ? (JSON.parse(v) as T) : (v as T))
  return { openPoCount: p.openPoCount, recentPos: parse<RecentPo[]>(p.recentPos), costSummary: parse<CostSummaryRow[]>(p.costSummary) }
}
const num = (v: unknown): number => Number(v)
const usd = (rows: CostSummaryRow[]) => rows.find((r) => r.currencyCode === 'USD')
const iqd = (rows: CostSummaryRow[]) => rows.find((r) => r.currencyCode === 'IQD')

let poSeq = 0
async function makePO(
  status: string,
  lines: { ccy: string; ordered: number; received?: number; fromStock?: number; price: number }[],
  opts: { project?: string; company?: string; user?: string; headerCcy?: string } = {},
): Promise<string> {
  poSeq += 1
  const project = opts.project ?? projectId
  const company = opts.company ?? companyId
  const po = await pool.query<{ id: string }>(
    `INSERT INTO purchase_orders (company_id, po_number, vendor_id, currency_code, base_currency_code, status, purpose, project_id, linked_project_id, created_by, total_amount)
     VALUES ($1,$2,$3,$4,'IQD',$5,'project',$6,$6,$7,$8) RETURNING id`,
    [
      company,
      `${PREFIX}${poSeq}`,
      vendorId,
      opts.headerCcy ?? lines[0]!.ccy,
      status,
      project,
      opts.user ?? adminId,
      // the HEADER total: every line's number added together, whatever its currency (what older POs carry)
      lines.reduce((s, l) => s + l.ordered * l.price, 0),
    ],
  )
  let n = 0
  for (const l of lines) {
    n += 1
    await pool.query(
      `INSERT INTO po_lines (po_id, line_number, description, product_id, qty_ordered, qty_received, qty_from_stock, unit_price, total_price, currency_code)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [po.rows[0]!.id, n, `line ${n}`, productId, l.ordered, l.received ?? 0, l.fromStock ?? 0, l.price, l.ordered * l.price, l.ccy],
    )
  }
  return po.rows[0]!.id
}

async function cost(project: string, amount: number, ccy: string, source: string, opts: { sourceId?: string; journalLineId?: string } = {}) {
  await pool.query(
    `INSERT INTO project_cost_actuals (project_id, amount, currency_code, entry_date, source_type, cost_category, journal_line_id, source_id)
     VALUES ($1,$2,$3,CURRENT_DATE,$4,'materials',$5,$6)`,
    [project, amount, ccy, source, opts.journalLineId ?? null, opts.sourceId ?? null],
  )
}

async function cleanup(): Promise<void> {
  const companies = (
    await pool.query<{ id: string }>(`SELECT id FROM companies WHERE name LIKE $1`, [`${PREFIX}%`])
  ).rows.map((r) => r.id)
  for (const c of companies) {
    await pool.query(`DELETE FROM po_lines WHERE po_id IN (SELECT id FROM purchase_orders WHERE company_id=$1)`, [c])
    await pool.query(`DELETE FROM purchase_orders WHERE company_id=$1`, [c])
  }
  for (const c of companies) {
    await pool.query(`DELETE FROM project_cost_actuals WHERE project_id IN (SELECT id FROM projects WHERE company_id=$1)`, [c])
    await pool.query(`DELETE FROM journal_lines WHERE journal_entry_id IN (SELECT id FROM journal_entries WHERE company_id=$1)`, [c])
    await pool.query(`DELETE FROM journal_entries WHERE company_id=$1`, [c])
    await pool.query(`DELETE FROM chart_of_accounts WHERE company_id=$1`, [c])
    await pool.query(`DELETE FROM project_material_issues WHERE company_id=$1`, [c])
    await pool.query(`DELETE FROM project_material_returns WHERE company_id=$1`, [c])
    await pool.query(`DELETE FROM products WHERE company_id=$1`, [c])
    await pool.query(`DELETE FROM vendors WHERE company_id=$1`, [c])
    await pool.query(`DELETE FROM projects WHERE company_id=$1`, [c]) // project_budgets cascade
    await pool.query(`DELETE FROM user_company_roles WHERE company_id=$1`, [c])
    await pool.query(`DELETE FROM companies WHERE id=$1`, [c])
  }
  await pool.query(`DELETE FROM users WHERE email = ANY($1)`, [Object.values(EMAILS)])
}

let accountId = ''

beforeAll(async () => {
  await cleanup()
  const mk = async (tag: string) =>
    (
      await pool.query<{ id: string }>(
        `INSERT INTO companies (name, legal_name, country_code, currency_code) VALUES ($1,$1,'IQ','IQD') RETURNING id`,
        [`${PREFIX}${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`],
      )
    ).rows[0]!.id
  companyId = await mk('A')
  otherCompanyId = await mk('B')
  const mkUser = async (email: string, company: string) => {
    const u = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
      [email],
    )
    await pool.query(
      `INSERT INTO user_company_roles (user_id, company_id, role, module) VALUES ($1,$2,'system_admin','all') ON CONFLICT DO NOTHING`,
      [u.rows[0]!.id, company],
    )
    return u.rows[0]!.id
  }
  adminId = await mkUser(EMAILS.admin, companyId)
  otherId = await mkUser(EMAILS.other, otherCompanyId)
  const mkProject = async (company: string, user: string, code: string, budget: number) => {
    const id = (
      await pool.query<{ id: string }>(
        `INSERT INTO projects (company_id, code, name, status, budget_amount, budget_currency, project_value_currency, created_by)
         VALUES ($1,$2,$3,'approved',$4,'USD','IQD',$5) RETURNING id`,
        [company, `${PREFIX}${code}`, `Open PO ${code}`, budget, user],
      )
    ).rows[0]!.id
    await pool.query(
      `INSERT INTO project_budgets (project_id, currency_code, budget_amount, is_primary) VALUES ($1,'USD',$2,true)
       ON CONFLICT (project_id, currency_code) DO UPDATE SET budget_amount = EXCLUDED.budget_amount`,
      [id, budget],
    )
    return id
  }
  projectId = await mkProject(companyId, adminId, 'PRJ', 0)
  budgetedProjectId = await mkProject(companyId, adminId, 'BUD', 1000)
  foreignProjectId = await mkProject(otherCompanyId, otherId, 'FOR', 0)
  storeProjectId = await mkProject(companyId, adminId, 'STO', 0)
  vendorId = (await pool.query<{ id: string }>(`INSERT INTO vendors (company_id, name) VALUES ($1,$2) RETURNING id`, [companyId, `${PREFIX}VENDOR`])).rows[0]!.id
  productId = (
    await pool.query<{ id: string }>(
      `INSERT INTO products (company_id, sku, name, uom, category) VALUES ($1,$2,$2,'unit','general') RETURNING id`,
      [companyId, `${PREFIX}SKU`],
    )
  ).rows[0]!.id
  accountId = (
    await pool.query<{ id: string }>(
      `INSERT INTO chart_of_accounts (company_id, code, name, account_type, is_postable, is_active)
       VALUES ($1,'5100','Project Expense','expense',true,true) RETURNING id`,
      [companyId],
    )
  ).rows[0]!.id

  // ── the project of the report: everything finished except what is listed as open ──────────────────────────────
  // 22 closed POs in the report; three here are enough to prove the rule (one of them mixed, like NY-PO-2026-0063)
  await makePO('closed', [{ ccy: 'USD', ordered: 10, received: 10, price: 5 }]) // 50 USD, all received
  await makePO('closed', [{ ccy: 'USD', ordered: 4, received: 4, price: 250 }]) // 1,000 USD, all received
  // closed, mixed: 1,276.96 USD + 10,000 IQD in one header total of 11,276.96 "USD"
  await makePO(
    'closed',
    [
      { ccy: 'USD', ordered: 1, received: 1, price: 1276.96 },
      { ccy: 'IQD', ordered: 1, received: 1, price: 10000 },
    ],
    { headerCcy: 'USD' },
  )
  await makePO('completed', [{ ccy: 'USD', ordered: 1, received: 1, price: 70 }]) // the old flow's end
  await makePO('cancelled', [{ ccy: 'IQD', ordered: 1, price: 12000 }])
  await makePO('deleted', [{ ccy: 'IQD', ordered: 1, price: 500 }])
  // open: not approved yet (open, but not a commitment), and one approved with nothing received (a commitment)
  await makePO('pending_approval', [{ ccy: 'USD', ordered: 1, price: 900 }])
  await makePO('approved', [{ ccy: 'USD', ordered: 4, price: 25 }]) // 100 USD committed
  // and one partly received in a second currency: (10 - 2 - 4) x 3 = 12 IQD still committed
  await makePO('goods_received', [{ ccy: 'IQD', ordered: 10, received: 4, fromStock: 2, price: 3 }])

  // ledger of the report project: a jobsite delivery of the closed USD PO (950 USD in all), a USD amount wrongly labelled
  // IQD, a stock issue and a return
  await cost(projectId, 850.5, 'USD', 'po_direct_delivery')
  await cost(projectId, 100, 'USD', 'stock_issue')
  await cost(projectId, 10000, 'IQD', 'po_direct_delivery')
  await cost(projectId, -5, 'USD', 'material_return')

  // a second project with a real budget and one approved PO
  await makePO('approved', [{ ccy: 'USD', ordered: 10, price: 20 }], { project: budgetedProjectId }) // 200 committed
  await cost(budgetedProjectId, 300, 'USD', 'po_direct_delivery')

  // another company's project, with cost
  await cost(foreignProjectId, 777, 'USD', 'po_direct_delivery')

  // the store project. A line covered from stock carries the store's price: it is "committed incl. store" while its PO is
  // open and is NOT once the PO is finished (the stock reaches the project when a Store Out issues it, which is Actual).
  const stockLine = async (poId: string, qty: number, price: number) =>
    pool.query(
      `UPDATE po_lines SET in_stock=true, qty_from_stock=$2, store_price=$3, store_price_currency='USD' WHERE po_id=$1`,
      [poId, qty, price],
    )
  await stockLine(await makePO('closed', [{ ccy: 'USD', ordered: 5, price: 4 }], { project: storeProjectId }), 5, 4) // 20 USD, finished
  await stockLine(await makePO('approved', [{ ccy: 'USD', ordered: 2, price: 3 }], { project: storeProjectId }), 2, 3) // 6 USD, open
  // a PO of a COMMITTED status that holds a third currency which is all received: nothing is left to commit in EUR
  await makePO('payment_pending', [{ ccy: 'EUR', ordered: 1, received: 1, price: 50 }], { project: storeProjectId })
})

afterAll(async () => {
  await cleanup()
  await pool.end()
})

describe('the shared definition of a finished PO', () => {
  it('classifies every status of purchase_orders_status_check, and only completed, closed, cancelled, deleted are finished', async () => {
    const def = (
      await pool.query<{ def: string }>(
        `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'purchase_orders_status_check'`,
      )
    ).rows[0]!.def
    const statuses = [...def.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!)
    expect(statuses.length).toBeGreaterThanOrEqual(20)
    for (const s of FINISHED_PO_STATUSES) expect(statuses, `${s} must be a real status`).toContain(s)
    const finished = statuses.filter((s) => !isOpenPOStatus(s)).sort()
    expect(finished).toEqual([...FINISHED_PO_STATUSES].sort())
    // rejected can be reopened to draft, so it still needs a person
    expect(isOpenPOStatus('rejected')).toBe(true)
    // a status nobody has heard of counts as open: visible, never silently hidden
    expect(isOpenPOStatus('some_future_status')).toBe(true)
  })

  it('the SQL tuple is the same list, built from the constant', () => {
    expect(FINISHED_PO_STATUSES_SQL).toBe("('completed','closed','cancelled','deleted')")
  })

  it('every committed status is a status that is not finished', () => {
    for (const s of COMMITTED_PO_STATUSES) expect(isOpenPOStatus(s), `${s} is committed so must be open`).toBe(true)
  })
})

describe('the project header (the `project` query the page reads)', () => {
  it('counts only POs that still need something as open: the three closed, the completed, cancelled and deleted do not', async () => {
    const h = await header()
    // pending_approval, approved and goods_received
    expect(h.openPoCount).toBe(3)
  })

  it('Committed is what was ordered and not yet received, per line currency, not the header total of every PO', async () => {
    const h = await header()
    // approved 4 x 25 = 100 USD; the closed USD POs (50, 1,000 and 1,276.96 of header total) are NOT committed
    expect(num(usd(h.costSummary)!.committedCosts)).toBe(100)
    // goods_received: (10 - 2 from stock - 4 received) x 3 = 12 IQD; the closed mixed PO's 10,000 IQD is NOT committed
    expect(num(iqd(h.costSummary)!.committedCosts)).toBe(12)
  })

  it('the old figure would have been wrong: the header totals of the closed POs alone add up to more than the project holds', async () => {
    const closedHeaderTotals = await pool.query<{ t: string }>(
      `SELECT SUM(total_amount)::text AS t FROM purchase_orders WHERE project_id=$1 AND status='closed' AND currency_code='USD'`,
      [projectId],
    )
    // 50 + 1,000 + 11,276.96: the IQD line was added into a USD total
    expect(num(closedHeaderTotals.rows[0]!.t)).toBeCloseTo(12326.96, 2)
    const h = await header()
    expect(num(usd(h.costSummary)!.committedCosts)).toBeLessThan(num(closedHeaderTotals.rows[0]!.t))
  })

  it('a budget row of 0 means "no budget": Remaining Budget is empty, not minus everything spent', async () => {
    const h = await header()
    expect(usd(h.costSummary)!.budgetRemaining).toBeNull()
    expect(num(usd(h.costSummary)!.budgetAmount)).toBe(0)
  })

  it('with a real budget, Remaining = budget - actual - committed (all in USD, nothing converted)', async () => {
    const h = await header(budgetedProjectId)
    const row = usd(h.costSummary)!
    expect(num(row.committedCosts)).toBe(200)
    expect(num(row.actualCosts)).toBe(300)
    expect(num(row.budgetRemaining)).toBe(1000 - 300 - 200)
  })

  it('Actual still reads the cost ledger per currency (a label is not changed by this)', async () => {
    const h = await header()
    // 850.50 + 100 - 5 in USD; the 10,000 labelled IQD stays IQD until its label is corrected in the data
    expect(num(usd(h.costSummary)!.actualCosts)).toBeCloseTo(945.5, 2)
    expect(num(iqd(h.costSummary)!.actualCosts)).toBe(10000)
  })

  it('does not list a currency that has nothing committed, spent or budgeted', async () => {
    const h = await header(budgetedProjectId)
    expect(h.costSummary.map((r) => r.currencyCode)).toEqual(['USD'])
  })

  it('store-priced stock lines are committed while their PO is open and not once it is finished', async () => {
    const h = await header(storeProjectId)
    const row = usd(h.costSummary)!
    // the open PO's 2 x 3 = 6; the closed PO's 5 x 4 = 20 is not counted
    expect(num(row.storeCosts)).toBe(6)
    // Committed incl. store = what is still to receive (nothing: it is all from stock) + the store part
    expect(num(row.committedCosts)).toBe(6)
  })

  it('does not list a currency whose POs hold nothing left to receive (EUR is fully received)', async () => {
    const h = await header(storeProjectId)
    expect(h.costSummary.map((r) => r.currencyCode)).toEqual(['USD'])
  })

  it('every PO carries what its lines hold per currency, so a mixed PO is not one wrong number', async () => {
    const h = await header()
    const mixed = h.recentPos.find((p) => p.line_totals.length === 2)!
    expect(mixed).toBeTruthy()
    const byCcy = Object.fromEntries(mixed.line_totals.map((l) => [l.currency_code, num(l.amount)]))
    expect(byCcy).toEqual({ IQD: 10000, USD: 1276.96 })
    // the header total of that PO is one number that adds the two together
    expect(num(mixed.total_amount)).toBeCloseTo(11276.96, 2)
    // and every PO has the field, even one with no lines at all
    for (const p of h.recentPos) expect(Array.isArray(p.line_totals)).toBe(true)
  })

  it('another company cannot read it (company scope)', async () => {
    const r = await gql(HEADER_QUERY, { id: projectId }, otherCtx())
    expect(r.data?.project ?? null).toBeNull()
  })
})

describe('the other places that asked "is this PO open?"', () => {
  it('the projects list counts the same open POs', async () => {
    const res = (await resolvers.Query.projects(null, { search: `${PREFIX}PRJ`, includeAll: true }, ctx() as never)) as {
      data: { code: string; openPoCount: number }[]
    }
    const row = res.data.find((p) => p.code === `${PREFIX}PRJ`)
    expect(row, 'the report project is in the list').toBeTruthy()
    expect(row!.openPoCount).toBe(3)
  })

  it('the completion blockers do not call a closed PO "open"', async () => {
    const r = (await resolvers.Query.projectCompletionBlockers(null, { id: projectId }, ctx() as never)) as {
      blockers: string[]
    }
    const po = r.blockers.find((b) => b.includes('purchase order'))
    expect(po).toContain('3 open purchase order')
  })

  it('the completion blockers name no purchase order once everything is finished', async () => {
    await pool.query(`UPDATE purchase_orders SET status='closed' WHERE project_id=$1 AND status IN ('pending_approval','approved','goods_received')`, [projectId])
    try {
      const r = (await resolvers.Query.projectCompletionBlockers(null, { id: projectId }, ctx() as never)) as { blockers: string[] }
      expect(r.blockers.find((b) => b.includes('purchase order'))).toBeUndefined()
      const h = await header()
      expect(h.openPoCount).toBe(0)
      expect(h.costSummary.every((r) => num(r.committedCosts) === 0)).toBe(true)
    } finally {
      await pool.query(`UPDATE purchase_orders SET status='pending_approval' WHERE project_id=$1 AND po_number=$2`, [projectId, `${PREFIX}7`])
      await pool.query(`UPDATE purchase_orders SET status='approved' WHERE project_id=$1 AND po_number=$2`, [projectId, `${PREFIX}8`])
      await pool.query(`UPDATE purchase_orders SET status='goods_received' WHERE project_id=$1 AND po_number=$2`, [projectId, `${PREFIX}9`])
    }
  })

  const cancelMessage = async (id: string): Promise<string> => {
    try {
      await resolvers.Mutation.cancelProjectAfterApproval(null, { id, reason: 'test' }, ctx() as never)
      return ''
    } catch (e) {
      return (e as Error).message
    }
  }

  it('cancelling a project is blocked by an open PO, and the message counts only the open ones', async () => {
    expect(await cancelMessage(projectId)).toMatch(/3 open purchase orders/)
  })

  it('cancelling is NOT blocked by finished POs (before, a closed PO blocked it for ever)', async () => {
    const msg = await cancelMessage(budgetedProjectId)
    // that project has one approved PO: blocked by exactly one
    expect(msg).toMatch(/1 open purchase order /)
    await pool.query(`UPDATE purchase_orders SET status='closed' WHERE project_id=$1`, [budgetedProjectId])
    try {
      expect(await cancelMessage(budgetedProjectId)).not.toMatch(/open purchase order/)
    } finally {
      // not blocked means the cancel really goes through: put the project and its PO back
      await pool.query(`UPDATE purchase_orders SET status='approved' WHERE project_id=$1`, [budgetedProjectId])
      await pool.query(`UPDATE projects SET status='approved' WHERE id=$1`, [budgetedProjectId])
    }
  })

  it("the company dashboard counts the same open POs, and only this company's", async () => {
    // 3 on the report project, 1 on the budgeted one, 2 on the store project (approved and payment pending); the closed
    // one there is finished; the other company has none
    const mine = (await resolvers.Query.dashboardKPIs(null, { companyId }, ctx() as never)) as { openPOs: number }
    expect(mine.openPOs).toBe(6)
    const theirs = (await resolvers.Query.dashboardKPIs(null, { companyId: otherCompanyId }, otherCtx() as never)) as {
      openPOs: number
    }
    expect(theirs.openPOs).toBe(0)
  })
})

describe('the project cost ledger list (analytic account page)', () => {
  const LEDGER = `query L($projectId: ID!) {
    projectCostLedger(projectId: $projectId) {
      entries { id entryDate sourceType costCategory amount currencyCode reference }
      totals { currencyCode amount }
      truncated
    }
  }`
  type Ledger = {
    projectCostLedger: {
      entries: { id: string; sourceType: string | null; amount: string; currencyCode: string; reference: string | null }[]
      totals: { currencyCode: string; amount: string }[]
      truncated: boolean
    }
  }

  it('lists the cost rows newest first through the real schema, with totals per currency', async () => {
    const r = await gql<Ledger>(LEDGER, { projectId })
    expect(r.errors).toBeUndefined()
    const l = r.data!.projectCostLedger
    expect(l.entries).toHaveLength(4)
    expect(l.truncated).toBe(false)
    const totals = Object.fromEntries(l.totals.map((t) => [t.currencyCode, Number(t.amount)]))
    expect(totals).toEqual({ IQD: 10000, USD: 945.5 })
  })

  it('the listed rows add up to the totals (the totals come from the view the header reads)', async () => {
    const l = (await gql<Ledger>(LEDGER, { projectId })).data!.projectCostLedger
    const summed: Record<string, number> = {}
    for (const e of l.entries) summed[e.currencyCode] = (summed[e.currencyCode] ?? 0) + Number(e.amount)
    const totals = Object.fromEntries(l.totals.map((t) => [t.currencyCode, Number(t.amount)]))
    expect(summed.USD).toBeCloseTo(totals.USD!, 4)
    expect(summed.IQD).toBeCloseTo(totals.IQD!, 4)
  })

  it('does not list a row whose journal is not posted yet, exactly like the view', async () => {
    const je = await pool.query<{ id: string }>(
      `INSERT INTO journal_entries (company_id, reference, description, entry_date, status, source_type, created_by)
       VALUES ($1,$2,'draft entry',CURRENT_DATE,'draft','manual',$3) RETURNING id`,
      [companyId, `${PREFIX}JE-DRAFT`, adminId],
    )
    const jl = await pool.query<{ id: string }>(
      `INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, currency_code, amount_company_currency)
       VALUES ($1,$2,500,0,'USD',500) RETURNING id`,
      [je.rows[0]!.id, accountId],
    )
    await cost(projectId, 500, 'USD', 'manual', { journalLineId: jl.rows[0]!.id })
    try {
      const l = (await gql<Ledger>(LEDGER, { projectId })).data!.projectCostLedger
      expect(l.entries).toHaveLength(4)
      expect(Number(l.totals.find((t) => t.currencyCode === 'USD')!.amount)).toBeCloseTo(945.5, 2)
      // posting it makes it count, in the list and in the totals
      await pool.query(`UPDATE journal_entries SET status='posted' WHERE id=$1`, [je.rows[0]!.id])
      const after = (await gql<Ledger>(LEDGER, { projectId })).data!.projectCostLedger
      expect(after.entries).toHaveLength(5)
      expect(after.entries.find((e) => e.reference === `${PREFIX}JE-DRAFT`)).toBeTruthy()
      expect(Number(after.totals.find((t) => t.currencyCode === 'USD')!.amount)).toBeCloseTo(1445.5, 2)
    } finally {
      await pool.query(`DELETE FROM project_cost_actuals WHERE journal_line_id=$1`, [jl.rows[0]!.id])
      await pool.query(`DELETE FROM journal_lines WHERE id=$1`, [jl.rows[0]!.id])
      await pool.query(`DELETE FROM journal_entries WHERE id=$1`, [je.rows[0]!.id])
    }
  })

  it('names the document a cost came from: PO and line for a delivery, the Store Out number for a stock issue', async () => {
    const poId = await makePO('closed', [{ ccy: 'USD', ordered: 2, received: 2, price: 3 }])
    const line = await pool.query<{ id: string; po_number: string }>(
      `SELECT pl.id, po.po_number FROM po_lines pl JOIN purchase_orders po ON po.id = pl.po_id WHERE po.id=$1`,
      [poId],
    )
    const issue = await pool.query<{ id: string }>(
      `INSERT INTO project_material_issues (project_id, company_id, issue_number, issue_date, status, created_by)
       VALUES ($1,$2,$3,CURRENT_DATE,'issued',$4) RETURNING id`,
      [projectId, companyId, `${PREFIX}SO-1`, adminId],
    )
    await cost(projectId, 6, 'USD', 'po_direct_delivery', { sourceId: line.rows[0]!.id })
    await cost(projectId, 9, 'USD', 'stock_issue', { sourceId: issue.rows[0]!.id })
    try {
      const l = (await gql<Ledger>(LEDGER, { projectId })).data!.projectCostLedger
      const delivery = l.entries.find((e) => e.reference === `${line.rows[0]!.po_number} / line 1`)
      expect(delivery, 'a delivery names its PO and line').toBeTruthy()
      expect(delivery!.sourceType).toBe('po_direct_delivery')
      expect(l.entries.find((e) => e.reference === `${PREFIX}SO-1`)!.sourceType).toBe('stock_issue')
      // a row with no document behind it has no reference, not an error
      expect(l.entries.some((e) => e.reference === null)).toBe(true)
    } finally {
      await pool.query(`DELETE FROM project_cost_actuals WHERE project_id=$1 AND source_id = ANY($2::uuid[])`, [projectId, [line.rows[0]!.id, issue.rows[0]!.id]])
      await pool.query(`DELETE FROM project_material_issues WHERE id=$1`, [issue.rows[0]!.id])
    }
  })

  it('lists the newest entry first', async () => {
    await pool.query(
      `INSERT INTO project_cost_actuals (project_id, amount, currency_code, entry_date, source_type, cost_category)
       VALUES ($1,1,'USD','2020-01-01','po_direct_delivery','materials'), ($1,2,'USD','2031-01-01','po_direct_delivery','materials'),
              ($1,3,'USD','2025-06-15','po_direct_delivery','materials')`,
      [storeProjectId],
    )
    try {
      const l = (await gql<Ledger>(LEDGER, { projectId: storeProjectId })).data!.projectCostLedger
      expect(l.entries.map((e) => (e as { entryDate?: string }).entryDate)).toEqual(['2031-01-01', '2025-06-15', '2020-01-01'])
    } finally {
      await pool.query(`DELETE FROM project_cost_actuals WHERE project_id=$1`, [storeProjectId])
    }
  })

  it('cuts the list at the limit, says so, and still totals every row', async () => {
    const run = (text: string, params: unknown[]) => pool.query(text, params)
    // the report project has 4 cost rows
    const cut = await projectCostLedger(run, projectId, companyId, 2)
    expect(cut.entries).toHaveLength(2)
    expect(cut.truncated).toBe(true)
    expect(cut.totals.find((t) => t.currency_code === 'USD')!.amount).toBe('945.5000')
    // exactly as many as the limit is NOT cut
    const exact = await projectCostLedger(run, projectId, companyId, 4)
    expect(exact.entries).toHaveLength(4)
    expect(exact.truncated).toBe(false)
    const roomy = await projectCostLedger(run, projectId, companyId, 5)
    expect(roomy.truncated).toBe(false)
  })

  it("is scoped to the company in the query itself, not only by the resolver's check", async () => {
    const run = (text: string, params: unknown[]) => pool.query(text, params)
    // this project's id with ANOTHER company's id: nothing, in the list and in the totals
    const crossed = await projectCostLedger(run, projectId, otherCompanyId)
    expect(crossed.entries).toEqual([])
    expect(crossed.totals).toEqual([])
  })

  it("never names a document of another company, even if a cost row points at it", async () => {
    // another company's PO line, and a cost row of THIS company's project whose source_id points at it
    const foreignPo = await makePO('closed', [{ ccy: 'USD', ordered: 1, received: 1, price: 1 }], {
      company: otherCompanyId,
      project: foreignProjectId,
      user: otherId,
    })
    const foreignLine = (await pool.query<{ id: string }>(`SELECT id FROM po_lines WHERE po_id=$1`, [foreignPo])).rows[0]!.id
    await pool.query(
      `INSERT INTO project_cost_actuals (project_id, amount, currency_code, entry_date, source_type, cost_category, source_id)
       VALUES ($1,1,'USD',CURRENT_DATE,'po_direct_delivery','materials',$2)`,
      [storeProjectId, foreignLine],
    )
    try {
      const l = (await gql<Ledger>(LEDGER, { projectId: storeProjectId })).data!.projectCostLedger
      expect(l.entries).toHaveLength(1)
      expect(l.entries[0]!.reference).toBeNull()
    } finally {
      await pool.query(`DELETE FROM project_cost_actuals WHERE project_id=$1`, [storeProjectId])
    }
  })

  it('names a material return by its number', async () => {
    const ret = await pool.query<{ id: string }>(
      `INSERT INTO project_material_returns (company_id, project_id, return_number, return_date, created_by)
       VALUES ($1,$2,$3,CURRENT_DATE,$4) RETURNING id`,
      [companyId, storeProjectId, `${PREFIX}MRT-1`, adminId],
    )
    await pool.query(
      `INSERT INTO project_cost_actuals (project_id, amount, currency_code, entry_date, source_type, cost_category, source_id)
       VALUES ($1,-4,'USD',CURRENT_DATE,'material_return','materials',$2)`,
      [storeProjectId, ret.rows[0]!.id],
    )
    try {
      const l = (await gql<Ledger>(LEDGER, { projectId: storeProjectId })).data!.projectCostLedger
      const row = l.entries.find((e) => e.sourceType === 'material_return')
      expect(row!.reference).toBe(`${PREFIX}MRT-1`)
    } finally {
      await pool.query(`DELETE FROM project_cost_actuals WHERE project_id=$1`, [storeProjectId])
      await pool.query(`DELETE FROM project_material_returns WHERE id=$1`, [ret.rows[0]!.id])
    }
  })

  it('refuses a project of another company, and shows another company nothing about this one', async () => {
    const foreign = await gql<Ledger>(LEDGER, { projectId: foreignProjectId })
    expect(foreign.data).toBeNull()
    expect(foreign.errors![0]!.message).toMatch(/not found/i)
    // the other company's admin asking for this company's project
    const crossed = await gql<Ledger>(LEDGER, { projectId }, otherCtx())
    expect(crossed.data).toBeNull()
    expect(crossed.errors![0]!.message).toMatch(/not found/i)
    // and the other company's own project works for them
    const own = await gql<Ledger>(LEDGER, { projectId: foreignProjectId }, otherCtx())
    expect(own.errors).toBeUndefined()
    expect(own.data!.projectCostLedger.entries).toHaveLength(1)
  })

  it('needs a login and the right to see the project', async () => {
    const anon = await server.executeOperation({ query: LEDGER, variables: { projectId } }, { contextValue: { auth: undefined } as never })
    if (anon.body.kind !== 'single') throw new Error('single expected')
    expect(anon.body.singleResult.errors?.[0]?.message).toMatch(/unauthorized/i)

    // a plain user of the company with no role on projects: refused by the project's own view guard
    const plain = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash) VALUES ($1,'x') ON CONFLICT (email) DO UPDATE SET password_hash='x' RETURNING id`,
      ['g-openpo-plain@fnc-erp.local'],
    )
    await pool.query(
      `INSERT INTO user_company_roles (user_id, company_id, role, module) VALUES ($1,$2,'user','procurement') ON CONFLICT DO NOTHING`,
      [plain.rows[0]!.id, companyId],
    )
    try {
      const r = await gql<Ledger>(LEDGER, { projectId }, {
        auth: { companyId, userId: plain.rows[0]!.id, role: 'user', module: 'procurement', sessionId: 'open-po-plain' },
      })
      expect(r.data).toBeNull()
      expect(r.errors).toBeTruthy()
    } finally {
      await pool.query(`DELETE FROM user_company_roles WHERE user_id=$1`, [plain.rows[0]!.id])
      await pool.query(`DELETE FROM users WHERE id=$1`, [plain.rows[0]!.id])
    }
  })
})
