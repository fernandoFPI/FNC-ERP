// The one-off backfill for the project cost of jobsite deliveries (scripts/backfill-direct-delivery-cost.ts).
// Real Postgres, nothing mocked, in an isolated company of its own. Each fixture is built with the real mutations
// (recordDirectDelivery, approvePOReturn, createMaterialReturn) and then aged back to what the OLD code left behind
// with plain SQL, because the old code can no longer be run: an 'IQD' label on a USD cost, a stale amount, a vendor
// return with no offset, a material return booked as one IQD number.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'
import { backfillDirectDeliveryCost, planBackfill } from '../src/scripts/backfill-direct-delivery-cost.js'

const NAME_PREFIX = 'DDBF-TEST-'
const TEST_EMAIL = (key: string) => `ddbf-test-${key}@fnc-erp.local`

let companyId: string
let adminId: string
let warehouseId: string
let seq = 0

const ctxFor = (userId: string) =>
  ({ auth: { companyId, userId, role: 'system_admin', module: 'all', sessionId: 'ddbf-test' } }) as never

async function makeUser(key: string): Promise<string> {
  const r = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [TEST_EMAIL(key)],
  )
  return r.rows[0]!.id
}

interface Fixture {
  projectId: string
  poId: string
  lineIds: string[]
}
interface LineSpec {
  ccy: string
  qty: number
  price: number
}

// A project of its own per test, so a test reads only its own rows from a company-wide plan.
async function makeProject(): Promise<string> {
  const analytic = await pool.query<{ id: string }>(
    `INSERT INTO analytic_accounts (company_id, code, name) VALUES ($1,$2,'Test analytic') RETURNING id`,
    [companyId, `AA-${Date.now().toString(36)}-${++seq}`],
  )
  const project = await pool.query<{ id: string }>(
    `INSERT INTO projects (company_id, code, name, status, budget_amount, budget_currency, analytic_account_id, created_by)
     VALUES ($1,$2,'Test project','ongoing',1000000,'IQD',$3,$4) RETURNING id`,
    [companyId, `${NAME_PREFIX}PRJ-${Date.now()}-${++seq}`, analytic.rows[0]!.id, adminId],
  )
  return project.rows[0]!.id
}

async function makeDeliveredPO(lines: LineSpec[], opts: { delivered?: boolean[] } = {}): Promise<Fixture> {
  const projectId = await makeProject()
  const po = await pool.query<{ id: string }>(
    `INSERT INTO purchase_orders
       (company_id, po_number, currency_code, base_currency_code, status, purpose, project_id, linked_project_id,
        delivery_destination, created_by, organizer_id)
     VALUES ($1,$2,'IQD','IQD','bought','project',$3,$3,'jobsite',$4,$4) RETURNING id`,
    [companyId, `${NAME_PREFIX}PO-${Date.now()}-${++seq}`, projectId, adminId],
  )
  const poId = po.rows[0]!.id
  const lineIds: string[] = []
  for (const [i, l] of lines.entries()) {
    const product = await pool.query<{ id: string }>(
      `INSERT INTO products (company_id, sku, name, uom, category) VALUES ($1,$2,$2,'unit','general') RETURNING id`,
      [companyId, `${NAME_PREFIX}SKU-${Date.now()}-${++seq}`],
    )
    const line = await pool.query<{ id: string }>(
      `INSERT INTO po_lines (po_id, line_number, description, product_id, qty_ordered, unit_price, total_price, currency_code)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [poId, i + 1, `line ${i + 1}`, product.rows[0]!.id, l.qty, l.price, l.qty * l.price, l.ccy],
    )
    lineIds.push(line.rows[0]!.id)
  }
  const toDeliver = lines.map((_, i) => opts.delivered?.[i] ?? true)
  await resolvers.Mutation.recordDirectDelivery(
    null,
    {
      poId,
      input: {
        received_date: '2026-11-05',
        lines: lines.flatMap((l, i) => (toDeliver[i] ? [{ po_line_id: lineIds[i]!, qty_received: l.qty }] : [])),
      },
    } as never,
    ctxFor(adminId),
  )
  return { projectId, poId, lineIds }
}

async function makeReturn(poId: string, lineId: string, qty: number, upTo: 'approved' | 'credited' | 'submitted') {
  const ret = (await resolvers.Mutation.createPOReturn(
    null,
    {
      poId,
      input: {
        return_type: 'full_refund',
        items: [{ po_line_id: lineId, description: 'Returned item', quantity_returned: qty }],
      },
    } as never,
    ctxFor(adminId),
  )) as { id: string; items: { id: string }[] }
  await resolvers.Mutation.submitPOReturn(null, { id: ret.id } as never, ctxFor(adminId))
  if (upTo === 'submitted') return ret
  await resolvers.Mutation.approvePOReturn(null, { id: ret.id } as never, ctxFor(adminId))
  if (upTo === 'credited')
    await resolvers.Mutation.creditPOReturn(null, { id: ret.id, creditNoteReference: 'CN-1' } as never, ctxFor(adminId))
  return ret
}

interface Cost {
  id: string
  source_type: string
  amount: string
  currency_code: string
}
const costsOf = async (projectId: string): Promise<Cost[]> =>
  (
    await pool.query<Cost>(
      `SELECT id, source_type, amount::text, currency_code::text FROM project_cost_actuals
        WHERE project_id=$1 ORDER BY created_at, source_type`,
      [projectId],
    )
  ).rows
const shape = (rows: Cost[]) => rows.map((r) => [r.source_type, parseFloat(r.amount), r.currency_code])

const plan = (projectId: string) =>
  planBackfill(pool, companyId).then((p) => ({
    relabel: p.relabel.filter((r) => r.project_id === projectId),
    reprice: p.reprice.filter((r) => r.project_id === projectId),
    offsets: p.offsets.filter((r) => r.project_id === projectId),
    material: p.material.filter((r) => r.project_id === projectId),
  }))

const apply = (extra: { reprice?: boolean } = {}) =>
  backfillDirectDeliveryCost({
    apply: true,
    actorEmail: TEST_EMAIL('admin'),
    company: companyId,
    reprice: extra.reprice ?? false,
  })

async function cleanup(): Promise<void> {
  if (!companyId) return
  const pos = `SELECT id FROM purchase_orders WHERE company_id=$1`
  const lines = `SELECT id FROM po_lines WHERE po_id IN (${pos})`
  await pool.query(`DELETE FROM audit_log WHERE company_id=$1 AND action='backfill_direct_delivery_cost'`, [companyId])
  await pool.query(`DELETE FROM project_cost_actuals WHERE project_id IN (SELECT id FROM projects WHERE company_id=$1)`, [companyId])
  await pool.query(
    `DELETE FROM project_material_return_lines WHERE return_id IN (SELECT id FROM project_material_returns WHERE company_id=$1)`,
    [companyId],
  )
  await pool.query(`DELETE FROM project_material_returns WHERE company_id=$1`, [companyId])
  await pool.query(
    `DELETE FROM project_material_issue_lines WHERE issue_id IN (SELECT id FROM project_material_issues WHERE company_id=$1)`,
    [companyId],
  )
  await pool.query(`DELETE FROM project_material_issues WHERE company_id=$1`, [companyId])
  await pool.query(`DELETE FROM stock_moves WHERE company_id=$1`, [companyId])
  await pool.query(`DELETE FROM stock_balances WHERE product_id IN (SELECT id FROM products WHERE company_id=$1)`, [companyId])
  await pool.query(`DELETE FROM po_returns WHERE company_id=$1`, [companyId])
  await pool.query(`DELETE FROM po_approval_log WHERE po_id IN (${pos})`, [companyId])
  await pool.query(`DELETE FROM po_lines WHERE id IN (${lines})`, [companyId])
  await pool.query(`DELETE FROM purchase_orders WHERE company_id=$1`, [companyId])
  await pool.query(`DELETE FROM products WHERE company_id=$1`, [companyId])
  await pool.query(`DELETE FROM stock_locations WHERE company_id=$1`, [companyId])
  await pool.query(`DELETE FROM projects WHERE company_id=$1`, [companyId])
  await pool.query(`DELETE FROM analytic_accounts WHERE company_id=$1`, [companyId])
  await pool.query(`DELETE FROM user_company_roles WHERE company_id=$1`, [companyId])
  await pool.query(`DELETE FROM companies WHERE id=$1`, [companyId])
}

beforeAll(async () => {
  const co = await pool.query<{ id: string }>(
    `INSERT INTO companies (name, legal_name, country_code, currency_code) VALUES ($1,$1,'IQ','IQD') RETURNING id`,
    [`${NAME_PREFIX}${Date.now()}`],
  )
  companyId = co.rows[0]!.id
  adminId = await makeUser('admin')
  await pool.query(
    `INSERT INTO user_company_roles (user_id, company_id, role, module) VALUES ($1,$2,'system_admin','all') ON CONFLICT DO NOTHING`,
    [adminId, companyId],
  )
  const wh = await pool.query<{ id: string }>(
    `INSERT INTO stock_locations (company_id, name, type, is_active) VALUES ($1,$2,'warehouse',true) RETURNING id`,
    [companyId, `${NAME_PREFIX}WH`],
  )
  warehouseId = wh.rows[0]!.id
})

// Every test starts from no cost rows, so what an earlier test aged cannot show up in the next one's plan.
beforeEach(async () => {
  await pool.query(`DELETE FROM project_cost_actuals WHERE project_id IN (SELECT id FROM projects WHERE company_id=$1)`, [companyId])
})

afterAll(async () => {
  await cleanup()
  await pool.query(`DELETE FROM users WHERE email LIKE 'ddbf-test-%'`).catch(() => undefined)
  await pool.end()
})

describe('1. relabel: a foreign-currency delivery cost that was booked as IQD', () => {
  it('lists and fixes the label of a USD line, leaves an IQD line alone, and never touches the amount', async () => {
    const f = await makeDeliveredPO([
      { ccy: 'USD', qty: 6, price: 1.5 },
      { ccy: 'IQD', qty: 2, price: 12000 },
    ])
    await pool.query(`UPDATE project_cost_actuals SET currency_code='IQD' WHERE project_id=$1`, [f.projectId]) // the old code
    const before = await costsOf(f.projectId)
    expect(shape(before).sort()).toEqual([['po_direct_delivery', 24000, 'IQD'], ['po_direct_delivery', 9, 'IQD']])

    const p = await plan(f.projectId)
    expect(p.relabel).toHaveLength(1)
    expect(p.relabel[0]).toMatchObject({ from_label: 'IQD', to_label: 'USD', amount: '9.0000' })

    await apply()
    expect(shape(await costsOf(f.projectId)).sort()).toEqual([['po_direct_delivery', 24000, 'IQD'], ['po_direct_delivery', 9, 'USD']])
  })

  it('leaves a delivery that was really converted into IQD at an old exchange rate (amount about 1,546 times the line)', async () => {
    const f = await makeDeliveredPO([{ ccy: 'USD', qty: 1, price: 10 }])
    await pool.query(`UPDATE project_cost_actuals SET currency_code='IQD', amount=15460 WHERE project_id=$1`, [f.projectId])
    expect((await plan(f.projectId)).relabel).toHaveLength(0)
    await apply()
    expect(shape(await costsOf(f.projectId))).toEqual([['po_direct_delivery', 15460, 'IQD']])
  })

  it('leaves a line that carries an exchange rate (fx_rate_to_base other than 1)', async () => {
    const f = await makeDeliveredPO([{ ccy: 'USD', qty: 1, price: 10 }])
    await pool.query(`UPDATE project_cost_actuals SET currency_code='IQD' WHERE project_id=$1`, [f.projectId])
    await pool.query(`UPDATE po_lines SET fx_rate_to_base=1546 WHERE id=$1`, [f.lineIds[0]!])
    expect((await plan(f.projectId)).relabel).toHaveLength(0)
  })

  it('is a no-op the second time', async () => {
    const f = await makeDeliveredPO([{ ccy: 'USD', qty: 3, price: 2 }])
    await pool.query(`UPDATE project_cost_actuals SET currency_code='IQD' WHERE project_id=$1`, [f.projectId])
    await apply()
    const once = await costsOf(f.projectId)
    await apply()
    expect(await costsOf(f.projectId)).toEqual(once)
  })
})

describe('2. reprice: only with --reprice, only a stale amount', () => {
  async function stale() {
    const f = await makeDeliveredPO([{ ccy: 'USD', qty: 4, price: 10 }])
    await pool.query(`UPDATE po_lines SET unit_price=7 WHERE id=$1`, [f.lineIds[0]!]) // edited after delivery, cost kept 40
    return f
  }

  it('lists the stale amount but does not change it without --reprice', async () => {
    const f = await stale()
    const p = await plan(f.projectId)
    expect(p.reprice).toHaveLength(1)
    expect(p.reprice[0]).toMatchObject({ posted: '40.0000', new_amount: '28.0000', ccy: 'USD' })
    await apply()
    expect(shape(await costsOf(f.projectId))).toEqual([['po_direct_delivery', 40, 'USD']])
  })

  it('corrects it with --reprice', async () => {
    const f = await stale()
    await apply({ reprice: true })
    expect(shape(await costsOf(f.projectId))).toEqual([['po_direct_delivery', 28, 'USD']])
    expect((await plan(f.projectId)).reprice).toHaveLength(0)
  })

  it('does not list a delivery whose amount already matches', async () => {
    const f = await makeDeliveredPO([{ ccy: 'USD', qty: 4, price: 10 }])
    expect((await plan(f.projectId)).reprice).toHaveLength(0)
  })

  it('does not reprice a converted IQD row even with --reprice', async () => {
    const f = await makeDeliveredPO([{ ccy: 'USD', qty: 1, price: 10 }])
    await pool.query(`UPDATE project_cost_actuals SET currency_code='IQD', amount=15460 WHERE project_id=$1`, [f.projectId])
    await apply({ reprice: true })
    expect(shape(await costsOf(f.projectId))).toEqual([['po_direct_delivery', 15460, 'IQD']])
  })
})

describe('3. offsets: an approved or credited vendor return that never came off the project', () => {
  // The old approvePOReturn changed nothing on the project: remove the offset the new code made.
  const ageToOld = (projectId: string) =>
    pool.query(`DELETE FROM project_cost_actuals WHERE project_id=$1 AND source_type='po_vendor_return'`, [projectId])

  it('lists an approved return and books the same negative row an approval makes today', async () => {
    const f = await makeDeliveredPO([{ ccy: 'USD', qty: 6, price: 1.5 }])
    const ret = await makeReturn(f.poId, f.lineIds[0]!, 6, 'approved') // RTN-NY-PO-2026-0101: 9.00 USD
    await ageToOld(f.projectId)

    const p = await plan(f.projectId)
    expect(p.offsets).toHaveLength(1)
    expect(p.offsets[0]).toMatchObject({ return_id: ret.id, status: 'approved', currency_code: 'USD', value: '9.0000' })

    await apply()
    expect(shape(await costsOf(f.projectId)).sort()).toEqual([['po_direct_delivery', 9, 'USD'], ['po_vendor_return', -9, 'USD']])
  })

  it('also covers a credited return', async () => {
    const f = await makeDeliveredPO([{ ccy: 'USD', qty: 4, price: 10 }])
    await makeReturn(f.poId, f.lineIds[0]!, 1, 'credited')
    await ageToOld(f.projectId)
    expect((await plan(f.projectId)).offsets.map((o) => o.status)).toEqual(['credited'])
    await apply()
    expect(shape(await costsOf(f.projectId)).sort()).toEqual([['po_direct_delivery', 40, 'USD'], ['po_vendor_return', -10, 'USD']])
  })

  it('ignores a return that is only submitted', async () => {
    const f = await makeDeliveredPO([{ ccy: 'USD', qty: 4, price: 10 }])
    await makeReturn(f.poId, f.lineIds[0]!, 1, 'submitted')
    expect((await plan(f.projectId)).offsets).toHaveLength(0)
  })

  it('ignores a return on a line that was never delivered to the jobsite (nothing was charged, so nothing to take back)', async () => {
    const f = await makeDeliveredPO(
      [
        { ccy: 'USD', qty: 4, price: 10 },
        { ccy: 'USD', qty: 2, price: 5 },
      ],
      { delivered: [true, false] },
    )
    // received some other way (no jobsite cost row), so the mutation lets it be returned
    await pool.query(`UPDATE po_lines SET qty_received=2 WHERE id=$1`, [f.lineIds[1]!])
    await makeReturn(f.poId, f.lineIds[1]!, 1, 'approved')
    await ageToOld(f.projectId)
    expect((await plan(f.projectId)).offsets).toHaveLength(0)
  })

  it('does not list a return whose offset already exists, and running twice adds nothing', async () => {
    const f = await makeDeliveredPO([{ ccy: 'USD', qty: 4, price: 10 }])
    await makeReturn(f.poId, f.lineIds[0]!, 2, 'approved') // the new code already booked it
    expect((await plan(f.projectId)).offsets).toHaveLength(0)
    await apply()
    expect(shape(await costsOf(f.projectId)).sort()).toEqual([['po_direct_delivery', 40, 'USD'], ['po_vendor_return', -20, 'USD']])
  })
})

describe('4. material returns of a foreign direct-delivery line booked as one IQD number', () => {
  async function materialReturn(f: Fixture, lines: { lineIdx: number; qty: number }[]) {
    return (await resolvers.Mutation.createMaterialReturn(
      null,
      {
        input: {
          poId: f.poId,
          lines: lines.map((l) => ({ poLineId: f.lineIds[l.lineIdx]!, toLocationId: warehouseId, qtyReturned: l.qty })),
        },
      } as never,
      ctxFor(adminId),
    )) as { id: string }
  }
  const materialRows = (projectId: string) =>
    pool.query<{ id: string }>(
      `SELECT id FROM project_cost_actuals WHERE project_id=$1 AND source_type='material_return' ORDER BY created_at`,
      [projectId],
    )

  it('relabels the offset of a USD-only return to USD', async () => {
    const f = await makeDeliveredPO([{ ccy: 'USD', qty: 10, price: 10 }])
    await materialReturn(f, [{ lineIdx: 0, qty: 4 }]) // new code: -40 USD
    await pool.query(`UPDATE project_cost_actuals SET currency_code='IQD' WHERE project_id=$1 AND source_type='material_return'`, [f.projectId]) // old code

    const p = await plan(f.projectId)
    expect(p.material).toHaveLength(1)
    expect(p.material[0]).toMatchObject({ from_label: 'IQD', to_label: 'USD', amount: '-40.0000' })

    await apply()
    expect(shape(await costsOf(f.projectId)).sort()).toEqual([['material_return', -40, 'USD'], ['po_direct_delivery', 100, 'USD']])
  })

  it('reports, and does not change, an old return that mixed two currencies into one IQD number', async () => {
    const f = await makeDeliveredPO([
      { ccy: 'USD', qty: 10, price: 10 },
      { ccy: 'IQD', qty: 10, price: 1000 },
    ])
    await materialReturn(f, [
      { lineIdx: 0, qty: 4 },
      { lineIdx: 1, qty: 2 },
    ])
    // the old code: one combined IQD row (-40 USD and -2000 IQD added together)
    await pool.query(`DELETE FROM project_cost_actuals WHERE project_id=$1 AND source_type='material_return'`, [f.projectId])
    const returnId = (await pool.query<{ id: string }>(`SELECT id FROM project_material_returns WHERE project_id=$1`, [f.projectId])).rows[0]!.id
    await pool.query(
      `INSERT INTO project_cost_actuals (project_id, source_type, source_id, cost_category, amount, currency_code, entry_date)
       VALUES ($1,'material_return',$2,'materials',-2040,'IQD',NOW()::date)`,
      [f.projectId, returnId],
    )
    const p = await planBackfill(pool, companyId)
    expect(p.material.filter((m) => m.project_id === f.projectId)).toHaveLength(0)
    expect(p.materialAmbiguous.length).toBeGreaterThan(0)
    await apply()
    expect(shape(await costsOf(f.projectId)).filter((r) => r[0] === 'material_return')).toEqual([['material_return', -2040, 'IQD']])
  })

  it('reports, and does not change, an old return that mixed a Store Out line with a USD direct-delivery line', async () => {
    const f = await makeDeliveredPO([{ ccy: 'USD', qty: 10, price: 10 }])
    const ret = await materialReturn(f, [{ lineIdx: 0, qty: 4 }])
    // a Store Out line on the same return (hand-built: this combination is what the old code could write)
    const product = (await pool.query<{ product_id: string }>(`SELECT product_id FROM po_lines WHERE id=$1`, [f.lineIds[0]!])).rows[0]!.product_id
    const issue = await pool.query<{ id: string }>(
      `INSERT INTO project_material_issues (project_id, company_id, issue_number, issue_date, status, created_by)
       VALUES ($1,$2,$3,'2026-11-05','issued',$4) RETURNING id`,
      [f.projectId, companyId, `${NAME_PREFIX}SO-${Date.now()}-${++seq}`, adminId],
    )
    const issueLine = await pool.query<{ id: string }>(
      `INSERT INTO project_material_issue_lines (issue_id, product_id, from_location_id, to_location_id, qty_issued, unit_cost, total_cost)
       VALUES ($1,$2,$3,$3,5,10,50) RETURNING id`,
      [issue.rows[0]!.id, product, warehouseId],
    )
    await pool.query(
      `INSERT INTO project_material_return_lines (return_id, issue_line_id, product_id, to_location_id, qty_returned, unit_cost, total_cost)
       VALUES ($1,$2,$3,$4,1,10,10)`,
      [ret.id, issueLine.rows[0]!.id, product, warehouseId],
    )
    await pool.query(`UPDATE project_cost_actuals SET currency_code='IQD' WHERE project_id=$1 AND source_type='material_return'`, [f.projectId])
    const ids = (await materialRows(f.projectId)).rows.map((r) => r.id)

    const p = await planBackfill(pool, companyId)
    expect(p.material.filter((m) => ids.includes(m.cost_id))).toHaveLength(0)
    expect(p.materialAmbiguous.filter((m) => ids.includes(m.cost_id))).toHaveLength(1)
    await apply()
    expect(shape((await costsOf(f.projectId)).filter((r) => r.source_type === 'material_return'))).toEqual([['material_return', -40, 'IQD']])
  })

  it('reports, and does not change, a return of a delivery that was converted into IQD at an old exchange rate', async () => {
    const f = await makeDeliveredPO([{ ccy: 'USD', qty: 10, price: 10 }])
    await pool.query(`UPDATE project_cost_actuals SET currency_code='IQD', amount=154600 WHERE project_id=$1`, [f.projectId]) // 10 x 10 x 1546
    await materialReturn(f, [{ lineIdx: 0, qty: 4 }])
    await pool.query(`UPDATE project_cost_actuals SET currency_code='IQD' WHERE project_id=$1 AND source_type='material_return'`, [f.projectId])
    const ids = (await materialRows(f.projectId)).rows.map((r) => r.id)

    const p = await planBackfill(pool, companyId)
    expect(p.material.filter((m) => ids.includes(m.cost_id))).toHaveLength(0)
    const reported = p.materialAmbiguous.filter((m) => ids.includes(m.cost_id))
    expect(reported).toHaveLength(1)
    expect(reported[0]!.why).toMatch(/converted into IQD/)
    await apply()
    expect((await costsOf(f.projectId)).filter((r) => r.source_type === 'material_return').map((r) => r.currency_code)).toEqual(['IQD'])
  })

  it('leaves alone a mixed return the CURRENT code wrote correctly (one row per currency): not relabelled, not reported', async () => {
    const f = await makeDeliveredPO([
      { ccy: 'USD', qty: 10, price: 10 },
      { ccy: 'IQD', qty: 10, price: 1000 },
    ])
    await materialReturn(f, [
      { lineIdx: 0, qty: 4 },
      { lineIdx: 1, qty: 2 },
    ])
    expect(shape((await costsOf(f.projectId)).filter((r) => r.source_type === 'material_return')).sort()).toEqual([
      ['material_return', -2000, 'IQD'],
      ['material_return', -40, 'USD'],
    ])
    const ids = (await materialRows(f.projectId)).rows.map((r) => r.id)
    const p = await planBackfill(pool, companyId)
    expect(p.material.filter((m) => ids.includes(m.cost_id))).toHaveLength(0)
    expect(p.materialAmbiguous.filter((m) => ids.includes(m.cost_id))).toHaveLength(0)
  })

  it('leaves alone an IQD line returned in IQD', async () => {
    const f = await makeDeliveredPO([{ ccy: 'IQD', qty: 10, price: 1000 }])
    await materialReturn(f, [{ lineIdx: 0, qty: 3 }])
    expect((await plan(f.projectId)).material).toHaveLength(0)
  })
})

describe('--apply', () => {
  it('writes nothing in a dry run', async () => {
    const f = await makeDeliveredPO([{ ccy: 'USD', qty: 6, price: 1.5 }])
    await pool.query(`UPDATE project_cost_actuals SET currency_code='IQD' WHERE project_id=$1`, [f.projectId])
    const before = await costsOf(f.projectId)
    const report = await backfillDirectDeliveryCost({ apply: false, company: companyId })
    expect(report.applied).toBe(false)
    expect(report.plan.relabel.some((r) => r.project_id === f.projectId)).toBe(true)
    expect(await costsOf(f.projectId)).toEqual(before)
  })

  it('refuses without an actor, and for an unknown actor, and changes nothing', async () => {
    const f = await makeDeliveredPO([{ ccy: 'USD', qty: 6, price: 1.5 }])
    await pool.query(`UPDATE project_cost_actuals SET currency_code='IQD' WHERE project_id=$1`, [f.projectId])
    await expect(backfillDirectDeliveryCost({ apply: true, company: companyId })).rejects.toThrow(/--actor-email/)
    await expect(
      backfillDirectDeliveryCost({ apply: true, company: companyId, actorEmail: 'nobody@fnc-erp.local' }),
    ).rejects.toThrow(/No user with the email/)
    expect(shape(await costsOf(f.projectId))).toEqual([['po_direct_delivery', 9, 'IQD']])
  })

  it('writes one audit row per project touched, under the administrator', async () => {
    const a = await makeDeliveredPO([{ ccy: 'USD', qty: 6, price: 1.5 }])
    const b = await makeDeliveredPO([{ ccy: 'USD', qty: 2, price: 5 }])
    await pool.query(`UPDATE project_cost_actuals SET currency_code='IQD' WHERE project_id = ANY($1::uuid[])`, [[a.projectId, b.projectId]])
    await apply()
    const rows = await pool.query<{ record_id: string; user_id: string; new_values: { relabeled: number } }>(
      `SELECT record_id, user_id, new_values FROM audit_log
        WHERE action='backfill_direct_delivery_cost' AND record_id = ANY($1::uuid[])`,
      [[a.projectId, b.projectId]],
    )
    expect(rows.rows).toHaveLength(2)
    expect(rows.rows.every((r) => r.user_id === adminId && r.new_values.relabeled === 1)).toBe(true)
  })

  it('does nothing in another company when scoped to this one, and finds nothing for an unknown company', async () => {
    const f = await makeDeliveredPO([{ ccy: 'USD', qty: 6, price: 1.5 }])
    await pool.query(`UPDATE project_cost_actuals SET currency_code='IQD' WHERE project_id=$1`, [f.projectId])
    const other = await planBackfill(pool, '00000000-0000-0000-0000-00000000dead')
    expect(other.relabel.concat(other.offsets as never[]).length).toBe(0)
    const byName = await planBackfill(pool, (await pool.query<{ name: string }>(`SELECT name FROM companies WHERE id=$1`, [companyId])).rows[0]!.name.toUpperCase())
    expect(byName.relabel.some((r) => r.project_id === f.projectId)).toBe(true) // name matches without regard to case
  })
})
