// The Cost Control tab and what procurement has cost the project.
//
// NY-PRJ-2026-0032: every tile on the tab read 0 while the project header showed the real cost. The tab's "Actual" read
// only its own labor / equipment logs, never the cost ledger (v_project_cost_by_currency) where purchases and stock
// issues land, and its "Sync PO" button looked for PO statuses that no longer exist, so Committed could not be filled
// either. These tests pin the two rules (lib/costControlPurchases.ts) against real Postgres, through the real resolvers:
//  - ACTUAL includes the ledger cost of the selected currency, and only counted rows (a journal that is not posted does
//    not count), the same figure the project header shows;
//  - COMMITTED from a PO is what was ordered and not yet received (so a purchase is never in Committed and Actual at
//    once), from today's statuses, per line currency, kept up to date by Sync PO.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'
import { COMMITTED_PO_STATUSES, costControlCategoryForLedger } from '../src/lib/costControlPurchases.js'

const PREFIX = 'G-CCPUR-TEST-'
const EMAILS = { admin: 'g-ccpur-admin@fnc-erp.local', other: 'g-ccpur-other@fnc-erp.local' }

let companyId = ''
let otherCompanyId = ''
let adminId = ''
let otherId = ''
let projectId = ''
let vendorId = ''
let productId = ''
const poIds: Record<string, string> = {}
const lineIds: Record<string, string> = {}

const ctx = () => ({ auth: { companyId, userId: adminId, role: 'system_admin', module: 'all', sessionId: 'cc-pur' } }) as never
const otherCtx = () =>
  ({ auth: { companyId: otherCompanyId, userId: otherId, role: 'system_admin', module: 'all', sessionId: 'cc-pur-o' } }) as never

type Summary = {
  totalBudget: number
  totalCommitted: number
  totalActual: number
  totalForecastEAC: number
  totalRemaining: number
  currencyCode: string
  availableCurrencies: string[]
  byCategory: { category: string; budgetAmount: number; committedAmount: number; actualAmount: number }[]
}
const summary = (currencyCode?: string) =>
  resolvers.Query.projectCostSummary(null, { projectId, currencyCode }, ctx()) as Promise<Summary>
const sync = () => resolvers.Mutation.syncPOCommitments(null, { projectId }, ctx())
const poRows = async () =>
  (
    await pool.query<{ po_number: string; currency_code: string; committed_amount: string }>(
      `SELECT reference_number AS po_number, currency_code, committed_amount FROM project_committed_costs
        WHERE project_id=$1 AND commitment_type='po' ORDER BY reference_number, currency_code`,
      [projectId],
    )
  ).rows.map((r) => ({ po: r.po_number.replace(PREFIX, ''), ccy: r.currency_code, amount: Number(r.committed_amount) }))

async function makePO(
  key: string,
  status: string,
  lines: { ccy: string; ordered: number; received?: number; fromStock?: number; price: number; actual?: number }[],
) {
  const po = await pool.query<{ id: string }>(
    `INSERT INTO purchase_orders (company_id, po_number, vendor_id, currency_code, base_currency_code, status, purpose, project_id, linked_project_id, created_by)
     VALUES ($1,$2,$3,'USD','IQD',$4,'project',$5,$5,$6) RETURNING id`,
    [companyId, `${PREFIX}${key}`, vendorId, status, projectId, adminId],
  )
  poIds[key] = po.rows[0]!.id
  let n = 0
  for (const l of lines) {
    n += 1
    const r = await pool.query<{ id: string }>(
      `INSERT INTO po_lines (po_id, line_number, description, product_id, qty_ordered, qty_received, qty_from_stock, unit_price, actual_unit_price, total_price, currency_code)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [poIds[key], n, `${key} line ${n}`, productId, l.ordered, l.received ?? 0, l.fromStock ?? 0, l.price, l.actual ?? null, l.ordered * l.price, l.ccy],
    )
    lineIds[`${key}${n}`] = r.rows[0]!.id
  }
}

async function ledger(amount: number, ccy: string, source: string, opts: { category?: string | null; journalLineId?: string; sourceId?: string } = {}) {
  await pool.query(
    `INSERT INTO project_cost_actuals (project_id, amount, currency_code, entry_date, source_type, cost_category, journal_line_id, source_id)
     VALUES ($1,$2,$3,CURRENT_DATE,$4,$5,$6,$7)`,
    [projectId, amount, ccy, source, opts.category === undefined ? 'materials' : opts.category, opts.journalLineId ?? null, opts.sourceId ?? null],
  )
}

async function journalLine(status: 'posted' | 'draft', accountId: string): Promise<string> {
  const je = await pool.query<{ id: string }>(
    `INSERT INTO journal_entries (company_id, reference, description, entry_date, status, source_type, created_by)
     VALUES ($1,$2,'test entry',CURRENT_DATE,$3,'manual',$4) RETURNING id`,
    [companyId, `${PREFIX}JE-${status}-${Math.random().toString(36).slice(2, 7)}`, status, adminId],
  )
  const jl = await pool.query<{ id: string }>(
    `INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, currency_code, amount_company_currency)
     VALUES ($1,$2,1,0,'USD',1) RETURNING id`,
    [je.rows[0]!.id, accountId],
  )
  return jl.rows[0]!.id
}

async function cleanup(): Promise<void> {
  // Every company this test ever made, found by name, so a run that died half way cannot poison the next one.
  const companies = (
    await pool.query<{ id: string }>(`SELECT id FROM companies WHERE name LIKE $1`, [`${PREFIX}%`])
  ).rows.map((r) => r.id)
  // Purchase orders of BOTH companies first: the foreign-company one points at this company's project.
  for (const c of companies) {
    await pool.query(`DELETE FROM po_lines WHERE po_id IN (SELECT id FROM purchase_orders WHERE company_id=$1)`, [c])
    await pool.query(`DELETE FROM purchase_orders WHERE company_id=$1`, [c])
  }
  for (const c of companies) {
    await pool.query(`DELETE FROM project_cost_actuals WHERE project_id IN (SELECT id FROM projects WHERE company_id=$1)`, [c])
    await pool.query(`DELETE FROM project_committed_costs WHERE project_id IN (SELECT id FROM projects WHERE company_id=$1)`, [c])
    await pool.query(`DELETE FROM project_cost_codes WHERE project_id IN (SELECT id FROM projects WHERE company_id=$1)`, [c])
    await pool.query(`DELETE FROM journal_lines WHERE journal_entry_id IN (SELECT id FROM journal_entries WHERE company_id=$1)`, [c])
    await pool.query(`DELETE FROM journal_entries WHERE company_id=$1`, [c])
    await pool.query(`DELETE FROM chart_of_accounts WHERE company_id=$1`, [c])
    await pool.query(`DELETE FROM products WHERE company_id=$1`, [c])
    await pool.query(`DELETE FROM vendors WHERE company_id=$1`, [c])
    await pool.query(`DELETE FROM projects WHERE company_id=$1`, [c])
    await pool.query(`DELETE FROM user_company_roles WHERE company_id=$1`, [c])
    await pool.query(`DELETE FROM companies WHERE id=$1`, [c])
  }
  await pool.query(`DELETE FROM users WHERE email = ANY($1)`, [Object.values(EMAILS)])
}

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
  projectId = (
    await pool.query<{ id: string }>(
      `INSERT INTO projects (company_id, code, name, status, budget_amount, budget_currency, created_by)
       VALUES ($1,$2,'Cost control purchases','approved',0,'USD',$3) RETURNING id`,
      [companyId, `${PREFIX}PRJ`, adminId],
    )
  ).rows[0]!.id
  vendorId = (await pool.query<{ id: string }>(`INSERT INTO vendors (company_id, name) VALUES ($1,$2) RETURNING id`, [companyId, `${PREFIX}VENDOR`])).rows[0]!.id
  productId = (
    await pool.query<{ id: string }>(
      `INSERT INTO products (company_id, sku, name, uom, category) VALUES ($1,$2,$2,'unit','general') RETURNING id`,
      [companyId, `${PREFIX}SKU`],
    )
  ).rows[0]!.id
  const account = (
    await pool.query<{ id: string }>(
      `INSERT INTO chart_of_accounts (company_id, code, name, account_type, is_postable, is_active)
       VALUES ($1,'5100','Project Expense','expense',true,true) RETURNING id`,
      [companyId],
    )
  ).rows[0]!.id

  // ── purchase orders ─────────────────────────────────────────────────────
  // A: delivered to the jobsite and paid for: everything received, so committed 0 (it is Actual: the ledger row below)
  await makePO('A', 'payment_pending', [{ ccy: 'USD', ordered: 10, received: 10, price: 5 }])
  // B: approved, nothing received: all 4 x 25 = 100 USD is committed
  await makePO('B', 'approved', [{ ccy: 'USD', ordered: 4, price: 25 }])
  // C: partly received, 2 covered from stock: (10 - 2 - 4) x 3 = 12 USD; the price actually paid (3) beats the quote (9)
  await makePO('C', 'goods_received', [{ ccy: 'USD', ordered: 10, received: 4, fromStock: 2, price: 9, actual: 3 }])
  // D, E, F: not commitments (not approved yet / cancelled / completed)
  await makePO('D', 'pending_approval', [{ ccy: 'USD', ordered: 1, price: 1000 }])
  await makePO('E', 'cancelled', [{ ccy: 'USD', ordered: 1, price: 2000 }])
  await makePO('F', 'completed', [{ ccy: 'USD', ordered: 1, price: 3000 }])
  // G: one PO in two currencies: IQD 2 x 100, USD 3 x 10; status of the new flow
  await makePO('G', 'payment_pending', [
    { ccy: 'IQD', ordered: 2, price: 100 },
    { ccy: 'USD', ordered: 3, price: 10 },
  ])

  // ── the cost ledger ─────────────────────────────────────────────────────
  await ledger(50, 'USD', 'po_direct_delivery', { sourceId: lineIds['A1'] })
  await ledger(20, 'USD', 'stock_issue')
  await ledger(-5, 'USD', 'material_return')
  await ledger(1000, 'IQD', 'po_direct_delivery')
  await ledger(7, 'USD', 'po_completion', { category: null, journalLineId: await journalLine('posted', account) }) // posted: counts, no category -> other
  await ledger(999, 'USD', 'po_completion', { category: null, journalLineId: await journalLine('draft', account) }) // draft journal: not counted yet
})

afterAll(async () => {
  await cleanup()
  await pool.end()
})

describe('the status list and the category map', () => {
  it('only statuses after approval and before completion can hold a commitment, and all exist in the database', async () => {
    const def = (await pool.query<{ def: string }>(`SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname='purchase_orders_status_check'`)).rows[0]!.def
    for (const s of COMMITTED_PO_STATUSES) expect(def, s).toContain(`'${s}'`)
    for (const s of ['draft', 'pending_approval', 'rejected', 'cancelled', 'deleted', 'completed', 'closed'])
      expect(COMMITTED_PO_STATUSES as readonly string[]).not.toContain(s)
    // the statuses the old Sync PO looked for that no longer exist must not creep back
    for (const gone of ['ordered', 'partially_received', 'received'])
      expect(COMMITTED_PO_STATUSES as readonly string[]).not.toContain(gone)
  })

  it('maps the ledger category names to the tab\'s categories', () => {
    expect(costControlCategoryForLedger('materials')).toBe('material')
    expect(costControlCategoryForLedger('MATERIAL ')).toBe('material')
    expect(costControlCategoryForLedger('equipment_rental')).toBe('equipment')
    expect(costControlCategoryForLedger('labour')).toBe('labor')
    expect(costControlCategoryForLedger(null)).toBe('other')
    expect(costControlCategoryForLedger('something new')).toBe('other')
  })
})

describe('Actual: what purchases and stock have cost the project', () => {
  it('the tab\'s Actual is the ledger cost of the selected currency, counting only counted rows', async () => {
    const usd = await summary()
    expect(usd.currencyCode).toBe('USD') // the project's own currency by default
    expect(usd.totalActual).toBe(50 + 20 - 5 + 7) // 72: the draft-journal row (999) is not counted yet
    const material = usd.byCategory.find((c) => c.category === 'material')
    expect(material?.actualAmount).toBe(65)
    expect(usd.byCategory.find((c) => c.category === 'other')?.actualAmount).toBe(7) // no category
    const iqd = await summary('IQD')
    expect(iqd.currencyCode).toBe('IQD')
    expect(iqd.totalActual).toBe(1000) // never added to the USD figure
  })

  it('both currencies can be chosen although nothing is committed yet', async () => {
    const s = await summary()
    expect(s.availableCurrencies).toEqual(['IQD', 'USD'])
  })

  it('is the same figure the project header shows for that currency', async () => {
    const p = (await resolvers.Query.project(null, { id: projectId }, ctx())) as { costSummary: { currencyCode: string; actualCosts: number }[] }
    const header = p.costSummary.find((e) => e.currencyCode === 'USD')
    expect(Number(header?.actualCosts)).toBe((await summary()).totalActual)
    expect(Number(p.costSummary.find((e) => e.currencyCode === 'IQD')?.actualCosts)).toBe((await summary('IQD')).totalActual)
  })

  it('reading the tab never writes: Committed stays 0 until Sync PO is pressed', async () => {
    expect((await summary()).totalCommitted).toBe(0)
    expect((await poRows()).length).toBe(0)
  })
})

describe('Committed: Sync PO with today\'s statuses and the "ordered, not yet received" rule', () => {
  it('writes one row per (PO, currency) for what is still to come, and nothing for the rest', async () => {
    await sync()
    expect(await poRows()).toEqual([
      { po: 'B', ccy: 'USD', amount: 100 },
      { po: 'C', ccy: 'USD', amount: 12 }, // (10 ordered - 2 from stock - 4 received) x the price paid (3)
      { po: 'G', ccy: 'IQD', amount: 200 },
      { po: 'G', ccy: 'USD', amount: 30 },
    ])
    // A (fully received), D (pending approval), E (cancelled) and F (completed) have no row
  })

  it('the tab then shows Committed per currency, beside Actual, without counting a purchase in both', async () => {
    const usd = await summary()
    expect(usd.totalCommitted).toBe(100 + 12 + 30)
    expect(usd.totalActual).toBe(72)
    const iqd = await summary('IQD')
    expect(iqd.totalCommitted).toBe(200)
    expect(iqd.totalActual).toBe(1000)
  })

  it('running it again changes nothing', async () => {
    await sync()
    expect((await poRows()).length).toBe(4)
    expect((await summary()).totalCommitted).toBe(142)
  })

  it('a manual commitment is left alone and counted with the purchase orders', async () => {
    await pool.query(
      `INSERT INTO project_committed_costs (project_id, commitment_type, description, committed_amount, currency_code, status)
       VALUES ($1,'manual','Manual commitment',77,'USD','active')`,
      [projectId],
    )
    await sync()
    expect((await summary()).totalCommitted).toBe(142 + 77)
    const manual = await pool.query(`SELECT committed_amount FROM project_committed_costs WHERE project_id=$1 AND commitment_type='manual'`, [projectId])
    expect(Number(manual.rows[0].committed_amount)).toBe(77)
  })

  it('budget, committed and actual come out in the totals the tab shows', async () => {
    await pool.query(
      `INSERT INTO project_cost_codes (project_id, code, name, category, budget_amount) VALUES ($1,'M-01','Materials','material',1000)`,
      [projectId],
    )
    const s = await summary()
    expect(s.totalBudget).toBe(1000)
    expect(s.totalCommitted).toBe(219)
    expect(s.totalActual).toBe(72)
    expect(s.totalRemaining).toBe(1000 - 219 - 72)
    expect(s.totalForecastEAC).toBe(65 + 219 + 7) // no forecast saved: actual + committed, category by category
  })

  it('goods arriving, a cancellation and a completion bring the rows down to 0 instead of leaving the old amount', async () => {
    await pool.query(`UPDATE po_lines SET qty_received = qty_ordered WHERE po_id=$1`, [poIds['B']]) // B arrives in full
    await pool.query(`UPDATE purchase_orders SET status='cancelled' WHERE id=$1`, [poIds['C']])
    await pool.query(`UPDATE purchase_orders SET status='completed' WHERE id=$1`, [poIds['G']])
    await sync()
    expect(await poRows()).toEqual([
      { po: 'B', ccy: 'USD', amount: 0 },
      { po: 'C', ccy: 'USD', amount: 0 },
      { po: 'G', ccy: 'IQD', amount: 0 },
      { po: 'G', ccy: 'USD', amount: 0 },
    ])
    expect((await summary()).totalCommitted).toBe(77) // only the manual one is left
  })

  it('a PO that comes back (a line is un-received) is committed again', async () => {
    await pool.query(`UPDATE po_lines SET qty_received = 1 WHERE po_id=$1`, [poIds['B']])
    await sync()
    expect((await poRows()).find((r) => r.po === 'B')?.amount).toBe(75) // 3 still to come x 25
  })
})

describe('a line received over its ordered quantity', () => {
  it('commits nothing, and does not take money off the other lines of the same PO', async () => {
    // line 1: ordered 2, 5 arrived (a surplus of 3 x 10 = 30); line 2: 3 x 10 = 30 still to come
    await makePO('H', 'approved', [
      { ccy: 'USD', ordered: 2, received: 5, price: 10 },
      { ccy: 'USD', ordered: 3, price: 10 },
    ])
    await sync()
    expect((await poRows()).find((r) => r.po === 'H')).toEqual({ po: 'H', ccy: 'USD', amount: 30 })
  })
})

describe('tenancy', () => {
  it('another company\'s user cannot read or sync this project', async () => {
    await expect(resolvers.Query.projectCostSummary(null, { projectId }, otherCtx())).rejects.toThrow(/Not found/)
    await expect(resolvers.Mutation.syncPOCommitments(null, { projectId }, otherCtx())).rejects.toThrow(/Not found/)
  })

  it('a purchase order of another company that points at this project is never committed on it', async () => {
    const po = await pool.query<{ id: string }>(
      `INSERT INTO purchase_orders (company_id, po_number, currency_code, base_currency_code, status, purpose, project_id, linked_project_id, created_by)
       VALUES ($1,$2,'USD','IQD','approved','project',$3,$3,$4) RETURNING id`,
      [otherCompanyId, `${PREFIX}FOREIGN`, projectId, otherId],
    )
    await pool.query(
      `INSERT INTO po_lines (po_id, line_number, description, qty_ordered, unit_price, total_price, currency_code) VALUES ($1,1,'foreign',5,1000,5000,'USD')`,
      [po.rows[0]!.id],
    )
    await sync()
    expect((await poRows()).find((r) => r.po === 'FOREIGN')).toBeUndefined()
    expect((await pool.query(`SELECT 1 FROM project_committed_costs WHERE project_id=$1 AND reference_number LIKE '%FOREIGN%'`, [projectId])).rows).toHaveLength(0)
  })
})
