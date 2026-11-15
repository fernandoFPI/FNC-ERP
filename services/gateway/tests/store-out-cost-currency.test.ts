// A Store Out's project cost is booked in the currency of the items issued (playbook #94).
//
// NY-PRJ-2026-0032: its 14 Store Outs held 174 lines priced in USD (2,470.57 USD) inside a 99,835.60 "IQD" total, because
// issueMaterialIssue wrote ONE cost row per Store Out with the label 'IQD' hard-coded (and a return of stock offset it with
// another 'IQD' literal). The project's USD Actual was understated and its IQD Actual overstated by the same amount.
// Now one cost row per currency, the currency being the PRODUCT's cost currency; a product with no currency stays 'IQD' as
// before (never guessed); nothing is converted (migration 325: unique on source_id + currency_code).
//
// Real Postgres through the real resolvers: own throwaway company, user, project, locations and products.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'
import { bookStockIssueCost, stockCostCurrencySql, stockIssueCostByCurrency } from '../src/lib/stockIssueCost.js'

const PREFIX = 'G-SOCCY-TEST-'
const EMAIL = 'g-soccy-admin@fnc-erp.local'

let companyId = ''
let userId = ''
let projectId = ''
let poId = ''
let warehouseId = ''
let virtualInId = ''
let virtualOutId = ''
const product: Record<string, string> = {}
let seq = 0

const ctx = () => ({ auth: { companyId, userId, role: 'system_admin', module: 'all', sessionId: 'soccy' } }) as never

type Row = { currency_code: string; amount: string }
const rows = async (sql: string, params: unknown[]): Promise<Row[]> =>
  (await pool.query<Row>(sql, params)).rows.map((r) => ({ currency_code: String(r.currency_code).trim(), amount: r.amount }))
const issueCost = (issueId: string) =>
  rows(
    `SELECT currency_code, amount::text AS amount FROM project_cost_actuals
      WHERE source_type = 'stock_issue' AND source_id = $1 ORDER BY currency_code`,
    [issueId],
  )
const returnCost = (returnId: string) =>
  rows(
    `SELECT currency_code, amount::text AS amount FROM project_cost_actuals
      WHERE source_type = 'material_return' AND source_id = $1 ORDER BY currency_code`,
    [returnId],
  )
const asNumbers = (r: Row[]) => Object.fromEntries(r.map((x) => [x.currency_code, Number(x.amount)]))

async function makeProduct(key: string, costCurrency: string | null): Promise<void> {
  const sku = `${PREFIX}${key}-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`
  const r = await pool.query<{ id: string }>(
    `INSERT INTO products (company_id, sku, name, uom, category, cost_currency) VALUES ($1,$2,$2,'unit','general',$3) RETURNING id`,
    [companyId, sku, costCurrency],
  )
  product[key] = r.rows[0]!.id
  // plenty of stock in the warehouse
  await pool.query(
    `INSERT INTO stock_moves (company_id, product_id, from_location_id, to_location_id, moved_at, qty, unit_cost, total_cost, source_type, moved_by)
     VALUES ($1,$2,$3,$4,NOW(),1000,1,1000,'po_receipt',$5)`,
    [companyId, product[key], virtualInId, warehouseId, userId],
  )
}

type Line = { product: string; qty: number; unitCost: number }
async function makeIssue(lines: Line[], opts: { project?: string | null; po?: string | null } = {}): Promise<{ issueId: string; lineIds: string[] }> {
  seq += 1
  const project = opts.project === undefined ? projectId : opts.project
  const issue = await pool.query<{ id: string }>(
    `INSERT INTO project_material_issues (project_id, company_id, issue_number, issue_date, status, created_by, po_id)
     VALUES ($1,$2,$3,CURRENT_DATE,'draft',$4,$5) RETURNING id`,
    [project, companyId, `${PREFIX}SO-${seq}`, userId, opts.po ?? null],
  )
  const lineIds: string[] = []
  for (const l of lines) {
    const r = await pool.query<{ id: string }>(
      `INSERT INTO project_material_issue_lines (issue_id, product_id, from_location_id, to_location_id, qty_issued, unit_cost, total_cost)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [issue.rows[0]!.id, product[l.product], warehouseId, virtualOutId, l.qty, l.unitCost, l.qty * l.unitCost],
    )
    lineIds.push(r.rows[0]!.id)
  }
  return { issueId: issue.rows[0]!.id, lineIds }
}
const confirm = (issueId: string) => resolvers.Mutation.issueMaterialIssue(null, { id: issueId }, ctx())

async function cleanup(): Promise<void> {
  const companies = (await pool.query<{ id: string }>(`SELECT id FROM companies WHERE name LIKE $1`, [`${PREFIX}%`])).rows.map((r) => r.id)
  for (const c of companies) {
    const mine = `(SELECT id FROM projects WHERE company_id=$1)`
    await pool.query(`DELETE FROM project_material_return_lines WHERE return_id IN (SELECT id FROM project_material_returns WHERE company_id=$1)`, [c])
    await pool.query(
      `DELETE FROM project_cost_actuals WHERE project_id IN ${mine}`,
      [c],
    )
    await pool.query(`DELETE FROM project_material_returns WHERE company_id=$1`, [c])
    await pool.query(`DELETE FROM project_material_issue_lines WHERE issue_id IN (SELECT id FROM project_material_issues WHERE company_id=$1)`, [c])
    await pool.query(`DELETE FROM project_material_issues WHERE company_id=$1`, [c])
    await pool.query(`DELETE FROM stock_moves WHERE company_id=$1`, [c])
    await pool.query(`DELETE FROM stock_balances WHERE product_id IN (SELECT id FROM products WHERE company_id=$1)`, [c])
    await pool.query(`DELETE FROM purchase_orders WHERE company_id=$1`, [c])
    await pool.query(`DELETE FROM products WHERE company_id=$1`, [c])
    await pool.query(`DELETE FROM stock_locations WHERE company_id=$1`, [c])
    await pool.query(`DELETE FROM projects WHERE company_id=$1`, [c])
    await pool.query(`DELETE FROM user_company_roles WHERE company_id=$1`, [c])
    await pool.query(`DELETE FROM companies WHERE id=$1`, [c])
  }
  await pool.query(`DELETE FROM users WHERE email=$1`, [EMAIL])
}

beforeAll(async () => {
  await cleanup()
  companyId = (
    await pool.query<{ id: string }>(
      `INSERT INTO companies (name, legal_name, country_code, currency_code) VALUES ($1,$1,'IQ','IQD') RETURNING id`,
      [`${PREFIX}A-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`],
    )
  ).rows[0]!.id
  userId = (
    await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
      [EMAIL],
    )
  ).rows[0]!.id
  await pool.query(`INSERT INTO user_company_roles (user_id, company_id, role, module) VALUES ($1,$2,'system_admin','all') ON CONFLICT DO NOTHING`, [userId, companyId])
  const loc = async (name: string, type: string) =>
    (await pool.query<{ id: string }>(`INSERT INTO stock_locations (company_id, name, type, is_active) VALUES ($1,$2,$3,true) RETURNING id`, [companyId, name, type])).rows[0]!.id
  warehouseId = await loc('Main warehouse', 'warehouse')
  virtualInId = await loc('Virtual receipts', 'virtual_in')
  virtualOutId = await loc('Project consumption', 'virtual_out')
  projectId = (
    await pool.query<{ id: string }>(
      `INSERT INTO projects (company_id, code, name, status, created_by) VALUES ($1,$2,$2,'ongoing',$3) RETURNING id`,
      [companyId, `${PREFIX}PRJ`, userId],
    )
  ).rows[0]!.id
  poId = (
    await pool.query<{ id: string }>(
      `INSERT INTO purchase_orders (company_id, po_number, currency_code, base_currency_code, status, purpose, project_id, linked_project_id, created_by)
       VALUES ($1,$2,'USD','IQD','closed','project',$3,$3,$4) RETURNING id`,
      [companyId, `${PREFIX}PO`, projectId, userId],
    )
  ).rows[0]!.id
  await makeProduct('usdA', 'USD')
  await makeProduct('usdB', 'USD')
  await makeProduct('iqd', 'IQD')
  await makeProduct('none', null)
  await makeProduct('lower', 'usd') // a stray lower-case code
  await makeProduct('blank', '   ') // spaces only
})

afterAll(async () => {
  await cleanup()
  await pool.end()
})

describe('a Store Out is booked in the currency of its items', () => {
  it('books one cost row per currency: USD items under USD, IQD items under IQD, an item with no currency under IQD', async () => {
    const { issueId } = await makeIssue([
      { product: 'usdA', qty: 4, unitCost: 2.5 }, // 10.00 USD
      { product: 'usdB', qty: 3, unitCost: 1.1 }, // 3.30 USD
      { product: 'iqd', qty: 2, unitCost: 1500 }, // 3,000 IQD
      { product: 'none', qty: 5, unitCost: 100 }, // 500, no currency -> IQD as before
    ])
    await confirm(issueId)
    const booked = await issueCost(issueId)
    expect(booked).toEqual([
      { currency_code: 'IQD', amount: '3500.0000' },
      { currency_code: 'USD', amount: '13.3000' },
    ])
  })

  it('a Store Out of USD items only is one USD row and nothing is booked as IQD', async () => {
    const { issueId } = await makeIssue([{ product: 'usdA', qty: 2, unitCost: 50 }])
    await confirm(issueId)
    expect(await issueCost(issueId)).toEqual([{ currency_code: 'USD', amount: '100.0000' }])
  })

  it('a currency code with a stray lower case or spaces is read as the currency it is; blank means IQD', async () => {
    const { issueId } = await makeIssue([
      { product: 'lower', qty: 1, unitCost: 7 }, // 'usd' -> USD
      { product: 'blank', qty: 1, unitCost: 9 }, // spaces only -> IQD
    ])
    await confirm(issueId)
    expect(asNumbers(await issueCost(issueId))).toEqual({ USD: 7, IQD: 9 })
  })

  it('what is booked adds up to what the Store Out holds: no money is created or lost', async () => {
    const lines: Line[] = [
      { product: 'usdA', qty: 7, unitCost: 3.3333 },
      { product: 'iqd', qty: 9, unitCost: 1750.25 },
      { product: 'none', qty: 3, unitCost: 0.1 },
    ]
    const { issueId } = await makeIssue(lines)
    await confirm(issueId)
    const total = await pool.query<{ t: string }>(`SELECT SUM(total_cost)::text AS t FROM project_material_issue_lines WHERE issue_id=$1`, [issueId])
    const booked = await pool.query<{ t: string }>(
      `SELECT SUM(amount)::text AS t FROM project_cost_actuals -- currency-safe: conservation test, compares the all-currency number with the Store Out's own total
        WHERE source_type='stock_issue' AND source_id=$1`,
      [issueId],
    )
    expect(booked.rows[0]!.t).toBe(total.rows[0]!.t)
  })

  it('a Store Out whose lines cost nothing books nothing, as before', async () => {
    const { issueId } = await makeIssue([{ product: 'usdA', qty: 1, unitCost: 0 }])
    await confirm(issueId)
    expect(await issueCost(issueId)).toEqual([])
  })

  it('a Store Out with no project books nothing, as before', async () => {
    const { issueId } = await makeIssue([{ product: 'usdA', qty: 1, unitCost: 5 }], { project: null })
    await confirm(issueId)
    expect(await issueCost(issueId)).toEqual([])
  })

  it('the project header reads the USD part as USD and the IQD part as IQD', async () => {
    const before = (await resolvers.Query.project(null, { id: projectId }, ctx())) as { costSummary: Record<string, unknown>[] }
    const usd = Number(before.costSummary.find((c) => c.currencyCode === 'USD')?.actualCosts ?? 0)
    const iqd = Number(before.costSummary.find((c) => c.currencyCode === 'IQD')?.actualCosts ?? 0)
    const { issueId } = await makeIssue([
      { product: 'usdA', qty: 10, unitCost: 4 }, // 40 USD
      { product: 'iqd', qty: 1, unitCost: 2000 }, // 2,000 IQD
    ])
    await confirm(issueId)
    const after = (await resolvers.Query.project(null, { id: projectId }, ctx())) as { costSummary: Record<string, unknown>[] }
    expect(Number(after.costSummary.find((c) => c.currencyCode === 'USD')!.actualCosts) - usd).toBeCloseTo(40, 4)
    expect(Number(after.costSummary.find((c) => c.currencyCode === 'IQD')!.actualCosts) - iqd).toBeCloseTo(2000, 4)
  })
})

describe('cancelling a Store Out takes back every currency it booked', () => {
  it('deletes both the USD and the IQD row', async () => {
    const { issueId } = await makeIssue([
      { product: 'usdA', qty: 1, unitCost: 12 },
      { product: 'iqd', qty: 1, unitCost: 500 },
    ])
    await confirm(issueId)
    expect(await issueCost(issueId)).toHaveLength(2)
    await resolvers.Mutation.cancelMaterialIssue(null, { id: issueId }, ctx())
    expect(await issueCost(issueId)).toEqual([])
  })
})

describe('a return of stock reduces the cost in the currency it was booked in', () => {
  const toLocation = () => warehouseId
  const doReturn = async (lines: { issueLineId: string; qtyReturned: number }[]) =>
    (await resolvers.Mutation.createMaterialReturn(
      null,
      { input: { poId, lines: lines.map((l) => ({ ...l, toLocationId: toLocation() })) } },
      ctx(),
    )) as { id: string }

  it('USD stock comes back as a negative USD row, IQD stock as a negative IQD row', async () => {
    const { issueId, lineIds } = await makeIssue(
      [
        { product: 'usdA', qty: 10, unitCost: 3 }, // 30 USD
        { product: 'iqd', qty: 10, unitCost: 100 }, // 1,000 IQD
      ],
      { po: poId },
    )
    await confirm(issueId)
    const ret = await doReturn([
      { issueLineId: lineIds[0]!, qtyReturned: 2 }, // 6 USD
      { issueLineId: lineIds[1]!, qtyReturned: 5 }, // 500 IQD
    ])
    expect(await returnCost(ret.id)).toEqual([
      { currency_code: 'IQD', amount: '-500.0000' },
      { currency_code: 'USD', amount: '-6.0000' },
    ])
  })

  it('two USD lines and one line with no currency: one USD row and one IQD row', async () => {
    const { issueId, lineIds } = await makeIssue(
      [
        { product: 'usdA', qty: 5, unitCost: 2 },
        { product: 'usdB', qty: 5, unitCost: 4 },
        { product: 'none', qty: 5, unitCost: 10 },
      ],
      { po: poId },
    )
    await confirm(issueId)
    const ret = await doReturn([
      { issueLineId: lineIds[0]!, qtyReturned: 1 }, // 2 USD
      { issueLineId: lineIds[1]!, qtyReturned: 2 }, // 8 USD
      { issueLineId: lineIds[2]!, qtyReturned: 1 }, // 10, no currency -> IQD
    ])
    expect(asNumbers(await returnCost(ret.id))).toEqual({ USD: -10, IQD: -10 })
  })

  it('the net of a Store Out and its return, per currency, is what stayed on the project', async () => {
    const { issueId, lineIds } = await makeIssue([{ product: 'usdA', qty: 10, unitCost: 5 }], { po: poId })
    await confirm(issueId)
    const ret = await doReturn([{ issueLineId: lineIds[0]!, qtyReturned: 4 }])
    const net = await pool.query<{ t: string }>(
      `SELECT SUM(amount)::text AS t FROM project_cost_actuals
        WHERE currency_code = 'USD' AND ((source_type='stock_issue' AND source_id=$1) OR (source_type='material_return' AND source_id=$2))`,
      [issueId, ret.id],
    )
    expect(Number(net.rows[0]!.t)).toBe(30) // 50 issued - 20 returned
  })
})

describe('the currency rule in one place (lib/stockIssueCost.ts)', () => {
  it('stockIssueCostByCurrency reads the same split the confirm books', async () => {
    const { issueId } = await makeIssue([
      { product: 'usdA', qty: 1, unitCost: 8 },
      { product: 'iqd', qty: 1, unitCost: 900 },
    ])
    const run = (text: string, params: unknown[]) => pool.query(text, params)
    expect(await stockIssueCostByCurrency(run, issueId)).toEqual([
      { currency_code: 'IQD', amount: '900.0000' },
      { currency_code: 'USD', amount: '8.0000' },
    ])
  })

  it('the SQL fragment names the alias it is given and the fallback', () => {
    const sql = stockCostCurrencySql('prod')
    expect(sql).toContain('prod.cost_currency')
    expect(sql).toContain("'IQD'")
    expect(sql).toContain('btrim(upper(')
  })

  it('booking twice does not double the cost, and a currency the Store Out no longer has is removed', async () => {
    const { issueId, lineIds } = await makeIssue([
      { product: 'usdA', qty: 2, unitCost: 5 },
      { product: 'iqd', qty: 1, unitCost: 700 },
    ])
    const client = await pool.connect()
    try {
      await bookStockIssueCost(client, projectId, issueId)
      await bookStockIssueCost(client, projectId, issueId)
      expect(asNumbers(await issueCost(issueId))).toEqual({ USD: 10, IQD: 700 })
      // the IQD line becomes a USD item: the IQD row has to go, the USD row grows
      await pool.query(`UPDATE project_material_issue_lines SET product_id=$2 WHERE id=$1`, [lineIds[1], product.usdB])
      await bookStockIssueCost(client, projectId, issueId)
      expect(asNumbers(await issueCost(issueId))).toEqual({ USD: 710 })
    } finally {
      client.release()
    }
  })
})

describe('migration 325: the index allows one row per Store Out per currency', () => {
  it('replaced the old one-row-per-Store-Out index', async () => {
    const idx = await pool.query<{ indexname: string; indexdef: string }>(
      `SELECT indexname, indexdef FROM pg_indexes WHERE tablename='project_cost_actuals' AND indexname LIKE 'uq_project_cost_actuals_stock_issue%'`,
    )
    expect(idx.rows.map((r) => r.indexname)).toEqual(['uq_project_cost_actuals_stock_issue_ccy'])
    expect(idx.rows[0]!.indexdef).toContain('(source_id, currency_code)')
  })

  it('refuses a second row of the same currency for one Store Out, allows another currency', async () => {
    const { issueId } = await makeIssue([{ product: 'usdA', qty: 1, unitCost: 1 }])
    const insert = (ccy: string) =>
      pool.query(
        `INSERT INTO project_cost_actuals (project_id, source_type, source_id, cost_category, amount, currency_code, entry_date)
         VALUES ($1,'stock_issue',$2,'materials',1,$3,CURRENT_DATE)`,
        [projectId, issueId, ccy],
      )
    await insert('USD')
    await insert('IQD')
    await expect(insert('USD')).rejects.toMatchObject({ code: '23505' })
  })
})
