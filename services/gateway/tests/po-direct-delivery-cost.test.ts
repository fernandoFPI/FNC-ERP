// Project cost of PO lines delivered straight to a jobsite (recordDirectDelivery), and what a price edit and a vendor
// return do to it. Real Postgres, nothing mocked, in an isolated company of its own.
//
// Found on NY-PO-2026-0101 / RTN-NY-PO-2026-0101 (Nov 2026):
//   1. the cost row was booked as 'IQD' whatever the line's currency (127 USD rows on production),
//   2. a price edited after delivery left the old price in the cost (31.50 for a line now worth 21.00),
//   3. an approved vendor return changed nothing: the project kept the cost and the completion journal posted
//      the whole PO, returned item included.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { ApolloServer } from '@apollo/server'
import { pool } from '@fnc-erp/db'
import { typeDefs } from '../src/graphql/schema.js'
import { resolvers } from '../src/graphql/resolvers.js'
import { offsetVendorReturnCost } from '../src/lib/directDeliveryCost.js'

const NAME_PREFIX = 'DDCOST-TEST-'
const TEST_EMAIL = (key: string) => `ddcost-test-${key}@fnc-erp.local`

let companyId: string
let adminId: string
let requesterId: string
let projectId: string
let seq = 0

const ctxFor = (userId: string, role = 'system_admin') =>
  ({ auth: { companyId, userId, role, module: 'all', sessionId: 'ddcost-test' } }) as never

async function makeUser(key: string): Promise<string> {
  const r = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [TEST_EMAIL(key)],
  )
  return r.rows[0]!.id
}

interface LineSpec {
  ccy: string
  qty: number
  price: number
}

async function makePO(
  lines: LineSpec[],
  opts: { jobsite?: boolean; inventoryProject?: boolean; status?: string } = {},
): Promise<{ poId: string; lineIds: string[] }> {
  const jobsite = opts.jobsite ?? true
  const projectPO = jobsite || !!opts.inventoryProject
  const po = await pool.query<{ id: string }>(
    `INSERT INTO purchase_orders
       (company_id, po_number, currency_code, base_currency_code, status, purpose, project_id, linked_project_id,
        delivery_destination, created_by, organizer_id)
     VALUES ($1,$2,'IQD','IQD',$3,$4,$5,$5,$6,$7,$7) RETURNING id`,
    [
      companyId,
      `${NAME_PREFIX}PO-${Date.now()}-${++seq}`,
      opts.status ?? 'bought',
      projectPO ? 'project' : 'stock',
      projectPO ? projectId : null,
      jobsite ? 'jobsite' : opts.inventoryProject ? 'inventory' : null,
      requesterId,
    ],
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
  return { poId, lineIds }
}

const deliver = (poId: string, lines: { id: string; qty: number }[]) =>
  resolvers.Mutation.recordDirectDelivery(
    null,
    {
      poId,
      input: {
        received_date: '2026-11-05',
        lines: lines.map((l) => ({ po_line_id: l.id, qty_received: l.qty })),
      },
    } as never,
    ctxFor(adminId),
  )

interface CostRow {
  source_type: string
  amount: string
  currency_code: string
}
async function costRows(lineIds: string[], returnItemIds: string[] = []): Promise<CostRow[]> {
  return (
    await pool.query<CostRow>(
      `SELECT source_type, amount::text, currency_code::text FROM project_cost_actuals
       WHERE source_id = ANY($1::uuid[]) OR source_id = ANY($2::uuid[]) ORDER BY source_type, created_at`,
      [lineIds, returnItemIds],
    )
  ).rows
}
const amounts = (rows: CostRow[], type: string) =>
  rows.filter((r) => r.source_type === type).map((r) => parseFloat(r.amount))

async function editPrice(poId: string, lineId: string, from: number, to: number) {
  const req = (await resolvers.Mutation.submitPOEditRequest(
    null,
    {
      id: poId,
      changes: JSON.stringify({ lines: { edited: [{ id: lineId, field: 'unit_price', from, to }] } }),
    } as never,
    ctxFor(requesterId, 'user'),
  )) as { id: string; status: string }
  expect(req.status).toBe('pending') // a delivered PO needs an admin
  await resolvers.Mutation.approvePOEditRequest(
    null,
    { id: poId, requestId: req.id } as never,
    ctxFor(adminId),
  )
}

async function makeAndApproveReturn(poId: string, lineId: string, qty: number) {
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
  await resolvers.Mutation.approvePOReturn(null, { id: ret.id } as never, ctxFor(adminId))
  return ret
}

async function cleanup(): Promise<void> {
  if (!companyId) return
  const pos = `SELECT id FROM purchase_orders WHERE company_id=$1`
  const lines = `SELECT id FROM po_lines WHERE po_id IN (${pos})`
  await pool.query(`DELETE FROM project_cost_actuals WHERE project_id IN (SELECT id FROM projects WHERE company_id=$1)`, [companyId])
  await pool.query(
    `DELETE FROM journal_po_links WHERE journal_entry_id IN (SELECT id FROM journal_entries WHERE company_id=$1)`,
    [companyId],
  )
  await pool.query(
    `DELETE FROM journal_lines WHERE journal_entry_id IN (SELECT id FROM journal_entries WHERE company_id=$1)`,
    [companyId],
  )
  await pool.query(`DELETE FROM journal_entries WHERE company_id=$1`, [companyId])
  await pool.query(`DELETE FROM po_returns WHERE company_id=$1`, [companyId])
  await pool.query(`DELETE FROM po_edit_requests WHERE po_id IN (${pos})`, [companyId])
  await pool.query(`DELETE FROM po_approval_log WHERE po_id IN (${pos})`, [companyId])
  await pool.query(`DELETE FROM pending_product_catalog_items WHERE po_id IN (${pos})`, [companyId])
  await pool.query(`DELETE FROM po_lines WHERE id IN (${lines})`, [companyId])
  await pool.query(`DELETE FROM purchase_orders WHERE company_id=$1`, [companyId])
  await pool.query(`DELETE FROM products WHERE company_id=$1`, [companyId])
  await pool.query(`DELETE FROM projects WHERE company_id=$1`, [companyId])
  await pool.query(`DELETE FROM analytic_accounts WHERE company_id=$1`, [companyId])
  await pool.query(`DELETE FROM company_posting_accounts WHERE company_id=$1`, [companyId])
  await pool.query(`DELETE FROM chart_of_accounts WHERE company_id=$1`, [companyId])
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
  requesterId = await makeUser('requester')
  for (const uid of [adminId, requesterId]) {
    await pool.query(
      `INSERT INTO user_company_roles (user_id, company_id, role, module) VALUES ($1,$2,'system_admin','all') ON CONFLICT DO NOTHING`,
      [uid, companyId],
    )
  }
  const expense = await pool.query<{ id: string }>(
    `INSERT INTO chart_of_accounts (company_id, code, name, account_type, is_postable, is_active)
     VALUES ($1,'5100','Project Expense','expense',true,true) RETURNING id`,
    [companyId],
  )
  const ap = await pool.query<{ id: string }>(
    `INSERT INTO chart_of_accounts (company_id, code, name, account_type, is_postable, is_active)
     VALUES ($1,'2100','Accounts Payable','liability',true,true) RETURNING id`,
    [companyId],
  )
  for (const [role, accountId] of [
    ['expense_default', expense.rows[0]!.id],
    ['ap', ap.rows[0]!.id],
  ] as const) {
    await pool.query(
      `INSERT INTO company_posting_accounts (company_id, role, currency_code, account_id, created_by, updated_by)
       VALUES ($1,$2,NULL,$3,$4,$4)`,
      [companyId, role, accountId, adminId],
    )
  }
  const analytic = await pool.query<{ id: string }>(
    `INSERT INTO analytic_accounts (company_id, code, name) VALUES ($1,$2,'Test analytic') RETURNING id`,
    [companyId, `AA-${Date.now().toString(36)}`],
  )
  const project = await pool.query<{ id: string }>(
    `INSERT INTO projects (company_id, code, name, status, budget_amount, budget_currency, analytic_account_id, created_by)
     VALUES ($1,$2,'Test project','ongoing',1000000,'IQD',$3,$4) RETURNING id`,
    [companyId, `${NAME_PREFIX}PRJ`, analytic.rows[0]!.id, adminId],
  )
  projectId = project.rows[0]!.id
})

afterAll(async () => {
  await cleanup()
  await pool.query(`DELETE FROM users WHERE email LIKE 'ddcost-test-%'`).catch(() => undefined)
  await pool.end()
})

describe('recordDirectDelivery books the cost in the line own currency', () => {
  it('a USD line costs USD and an IQD line costs IQD (it used to be IQD for both)', async () => {
    const { poId, lineIds } = await makePO([
      { ccy: 'USD', qty: 6, price: 1.5 },
      { ccy: 'IQD', qty: 2, price: 12000 },
    ])
    await deliver(poId, [
      { id: lineIds[0]!, qty: 6 },
      { id: lineIds[1]!, qty: 2 },
    ])
    const usd = await costRows([lineIds[0]!])
    const iqd = await costRows([lineIds[1]!])
    expect(usd).toEqual([{ source_type: 'po_direct_delivery', amount: '9.0000', currency_code: 'USD' }])
    expect(iqd).toEqual([{ source_type: 'po_direct_delivery', amount: '24000.0000', currency_code: 'IQD' }])
  })

  it('adds a second delivery at the price current when it arrives (the weighted average material returns use)', async () => {
    const { poId, lineIds } = await makePO([{ ccy: 'USD', qty: 5, price: 10 }])
    await deliver(poId, [{ id: lineIds[0]!, qty: 2 }])
    await pool.query(`UPDATE po_lines SET unit_price=15 WHERE id=$1`, [lineIds[0]!])
    await deliver(poId, [{ id: lineIds[0]!, qty: 1 }])
    expect(amounts(await costRows(lineIds), 'po_direct_delivery')).toEqual([35])
  })

  it('refuses a line that is not on this purchase order, and changes nothing', async () => {
    const a = await makePO([{ ccy: 'USD', qty: 3, price: 10 }])
    const b = await makePO([{ ccy: 'USD', qty: 3, price: 10 }])
    await expect(deliver(a.poId, [{ id: b.lineIds[0]!, qty: 3 }])).rejects.toThrow(/not a line of this purchase order/)
    const other = await pool.query(`SELECT qty_received FROM po_lines WHERE id=$1`, [b.lineIds[0]!])
    expect(parseFloat(other.rows[0].qty_received ?? '0')).toBe(0)
    expect(await costRows(b.lineIds)).toEqual([])
  })
})

describe('a price edited after delivery re-prices what was delivered', () => {
  it('3 delivered at 10, price corrected to 4: the project carries 12, not 30', async () => {
    const { poId, lineIds } = await makePO([{ ccy: 'USD', qty: 3, price: 10 }])
    await deliver(poId, [{ id: lineIds[0]!, qty: 3 }])
    expect(amounts(await costRows(lineIds), 'po_direct_delivery')).toEqual([30])

    await editPrice(poId, lineIds[0]!, 10, 4)

    const rows = await costRows(lineIds)
    expect(rows).toEqual([{ source_type: 'po_direct_delivery', amount: '12.0000', currency_code: 'USD' }])
    const line = await pool.query(`SELECT total_price FROM po_lines WHERE id=$1`, [lineIds[0]!])
    expect(parseFloat(line.rows[0].total_price)).toBe(12) // the PO line and the project agree
  })

  it('a delivery after the correction adds at the new price (the NY-PO-2026-0101 line 8 case)', async () => {
    const { poId, lineIds } = await makePO([{ ccy: 'USD', qty: 12, price: 5.25 }])
    await deliver(poId, [{ id: lineIds[0]!, qty: 3 }]) // 3 x 5.25 = 15.75
    await editPrice(poId, lineIds[0]!, 5.25, 1.75) // re-priced: 3 x 1.75 = 5.25
    await deliver(poId, [{ id: lineIds[0]!, qty: 9 }]) // + 9 x 1.75 = 15.75
    // 12 x 1.75 = 21.00 (it was 31.50 before: the first 3 units stayed at 5.25)
    expect(amounts(await costRows(lineIds), 'po_direct_delivery')).toEqual([21])
  })

  it('leaves a row that was converted at an old fx rate exactly as it was', async () => {
    const { poId, lineIds } = await makePO([{ ccy: 'USD', qty: 5, price: 150 }])
    await deliver(poId, [{ id: lineIds[0]!, qty: 1 }])
    // As the 4 legacy rows on production: booked at fx_rate_to_base into IQD.
    await pool.query(`UPDATE po_lines SET fx_rate_to_base=1546 WHERE id=$1`, [lineIds[0]!])
    await pool.query(`UPDATE project_cost_actuals SET amount=231900, currency_code='IQD' WHERE source_id=$1`, [lineIds[0]!])
    await editPrice(poId, lineIds[0]!, 150, 100)
    expect(await costRows(lineIds)).toEqual([
      { source_type: 'po_direct_delivery', amount: '231900.0000', currency_code: 'IQD' },
    ])
  })

  it('a price corrected through the admin correction tool follows too', async () => {
    const { poId, lineIds } = await makePO([{ ccy: 'USD', qty: 3, price: 10 }])
    await deliver(poId, [{ id: lineIds[0]!, qty: 3 }]) // PO is now goods_received
    await resolvers.Mutation.adminCorrectPO(
      null,
      {
        id: poId,
        reason: 'wrong price recorded',
        changes: JSON.stringify({ lines: { edited: [{ id: lineIds[0]!, field: 'unit_price', from: 10, to: 4 }] } }),
      } as never,
      ctxFor(adminId),
    )
    expect(amounts(await costRows(lineIds), 'po_direct_delivery')).toEqual([12])
  })

  it('a line removed by an approved edit takes its delivery cost with it', async () => {
    const { poId, lineIds } = await makePO([
      { ccy: 'USD', qty: 2, price: 10 },
      { ccy: 'USD', qty: 1, price: 7 },
    ])
    await deliver(poId, [
      { id: lineIds[0]!, qty: 2 },
      { id: lineIds[1]!, qty: 1 },
    ])
    const req = (await resolvers.Mutation.submitPOEditRequest(
      null,
      { id: poId, changes: JSON.stringify({ lines: { removed: [lineIds[1]!] } }) } as never,
      ctxFor(requesterId, 'user'),
    )) as { id: string }
    await resolvers.Mutation.approvePOEditRequest(null, { id: poId, requestId: req.id } as never, ctxFor(adminId))
    expect(await costRows([lineIds[1]!])).toEqual([])
    expect(amounts(await costRows([lineIds[0]!]), 'po_direct_delivery')).toEqual([20]) // the other line is untouched
  })
})

describe('an approved vendor return takes its value off the project', () => {
  it('books a negative row for the returned item, in the return currency, and leaves the delivery cost as it was', async () => {
    const { poId, lineIds } = await makePO([{ ccy: 'USD', qty: 6, price: 1.5 }])
    await deliver(poId, [{ id: lineIds[0]!, qty: 6 }])
    const ret = await makeAndApproveReturn(poId, lineIds[0]!, 6) // RTN-NY-PO-2026-0101: 6 of 6 at 1.5 = 9.00

    const rows = await costRows(lineIds, [ret.items[0]!.id])
    expect(amounts(rows, 'po_direct_delivery')).toEqual([9])
    expect(amounts(rows, 'po_vendor_return')).toEqual([-9])
    expect(rows.every((r) => r.currency_code === 'USD')).toBe(true)
    // net on the project: nothing
    expect(rows.reduce((s, r) => s + parseFloat(r.amount), 0)).toBe(0)
  })

  it('does nothing before approval, and crediting adds nothing on top', async () => {
    const { poId, lineIds } = await makePO([{ ccy: 'USD', qty: 4, price: 10 }])
    await deliver(poId, [{ id: lineIds[0]!, qty: 4 }])
    const ret = (await resolvers.Mutation.createPOReturn(
      null,
      {
        poId,
        input: { return_type: 'full_refund', items: [{ po_line_id: lineIds[0]!, description: 'x', quantity_returned: 1 }] },
      } as never,
      ctxFor(adminId),
    )) as { id: string; items: { id: string }[] }
    await resolvers.Mutation.submitPOReturn(null, { id: ret.id } as never, ctxFor(adminId))
    expect(amounts(await costRows(lineIds, [ret.items[0]!.id]), 'po_vendor_return')).toEqual([]) // submitted

    await resolvers.Mutation.approvePOReturn(null, { id: ret.id } as never, ctxFor(adminId))
    expect(amounts(await costRows(lineIds, [ret.items[0]!.id]), 'po_vendor_return')).toEqual([-10])

    await resolvers.Mutation.creditPOReturn(null, { id: ret.id, creditNoteReference: 'CN-1' } as never, ctxFor(adminId))
    expect(amounts(await costRows(lineIds, [ret.items[0]!.id]), 'po_vendor_return')).toEqual([-10]) // still one row
  })

  it('running the offset twice is a no-op (the item id is unique)', async () => {
    const { poId, lineIds } = await makePO([{ ccy: 'USD', qty: 3, price: 10 }])
    await deliver(poId, [{ id: lineIds[0]!, qty: 3 }])
    const ret = await makeAndApproveReturn(poId, lineIds[0]!, 1)
    expect(await offsetVendorReturnCost(pool, ret.id)).toBe(0)
    expect(amounts(await costRows(lineIds, [ret.items[0]!.id]), 'po_vendor_return')).toEqual([-10])
  })

  it('a damage return takes off the assessed value, not the original price', async () => {
    const { poId, lineIds } = await makePO([{ ccy: 'USD', qty: 4, price: 10 }])
    await deliver(poId, [{ id: lineIds[0]!, qty: 4 }])
    const ret = (await resolvers.Mutation.createPOReturn(
      null,
      {
        poId,
        input: {
          return_type: 'damage',
          damage_description: 'cracked',
          items: [{ po_line_id: lineIds[0]!, description: 'x', quantity_returned: 2, assessed_unit_price: 3 }],
        },
      } as never,
      ctxFor(adminId),
    )) as { id: string; items: { id: string }[] }
    await resolvers.Mutation.submitPOReturn(null, { id: ret.id } as never, ctxFor(adminId))
    await resolvers.Mutation.approvePOReturn(null, { id: ret.id } as never, ctxFor(adminId))
    expect(amounts(await costRows(lineIds, [ret.items[0]!.id]), 'po_vendor_return')).toEqual([-6]) // 2 x 3
  })

  it('a project PO delivered to inventory cost the project nothing yet (a Store Out will), so there is nothing to take back', async () => {
    const { poId, lineIds } = await makePO([{ ccy: 'USD', qty: 3, price: 10 }], {
      jobsite: false,
      inventoryProject: true,
      status: 'goods_received',
    })
    await pool.query(`UPDATE po_lines SET qty_received=3 WHERE id=$1`, [lineIds[0]!])
    const ret = await makeAndApproveReturn(poId, lineIds[0]!, 1)
    expect(await costRows(lineIds, [ret.items[0]!.id])).toEqual([])
  })
})

describe('the completion journal and the PO page see the return', () => {
  async function paymentPending(lines: LineSpec[]) {
    const po = await makePO(lines)
    await deliver(po.poId, po.lineIds.map((id, i) => ({ id, qty: lines[i]!.qty })))
    await pool.query(`UPDATE purchase_orders SET status='payment_pending', funding_decided=true WHERE id=$1`, [po.poId])
    return po
  }
  const journalDebit = async (poId: string, ccy: string): Promise<number | null> => {
    const r = await pool.query<{ debit: string }>(
      `SELECT jl.debit::text FROM journal_entries je
         JOIN journal_lines jl ON jl.journal_entry_id = je.id
        WHERE je.source_type='po_completion' AND je.source_id=$1 AND jl.currency_code=$2 AND jl.debit > 0`,
      [poId, ccy],
    )
    return r.rows[0] ? parseFloat(r.rows[0].debit) : null
  }

  const journalCount = async (poId: string, ccy: string): Promise<number> =>
    parseInt(
      (
        await pool.query<{ n: string }>(
          `SELECT COUNT(*)::text AS n FROM journal_entries je JOIN journal_lines jl ON jl.journal_entry_id = je.id
            WHERE je.source_type='po_completion' AND je.source_id=$1 AND jl.currency_code=$2`,
          [poId, ccy],
        )
      ).rows[0]!.n,
    )

  it('posts the PO net of an approved return, per currency', async () => {
    const { poId, lineIds } = await paymentPending([
      { ccy: 'USD', qty: 6, price: 1.5 },
      { ccy: 'USD', qty: 2, price: 100 },
      { ccy: 'IQD', qty: 2, price: 12000 },
    ])
    await makeAndApproveReturn(poId, lineIds[0]!, 6) // 9.00 USD back to the vendor

    await resolvers.Mutation.completePO(null, { id: poId } as never, ctxFor(adminId))

    expect(await journalDebit(poId, 'USD')).toBe(200) // 209 ordered, 9 returned
    expect(await journalDebit(poId, 'IQD')).toBe(24000) // untouched
  })

  it('a currency whose every line was returned posts no journal at all', async () => {
    const { poId, lineIds } = await paymentPending([
      { ccy: 'USD', qty: 3, price: 10 },
      { ccy: 'IQD', qty: 1, price: 5000 },
    ])
    await makeAndApproveReturn(poId, lineIds[0]!, 3)
    await resolvers.Mutation.completePO(null, { id: poId } as never, ctxFor(adminId))
    expect(await journalCount(poId, 'USD')).toBe(0) // no entry at all, not a zero one
    expect(await journalDebit(poId, 'IQD')).toBe(5000)
  })

  it('a return still waiting for approval is not taken off', async () => {
    const { poId, lineIds } = await paymentPending([{ ccy: 'USD', qty: 3, price: 10 }])
    const ret = (await resolvers.Mutation.createPOReturn(
      null,
      {
        poId,
        input: { return_type: 'full_refund', items: [{ po_line_id: lineIds[0]!, description: 'x', quantity_returned: 3 }] },
      } as never,
      ctxFor(adminId),
    )) as { id: string }
    await resolvers.Mutation.submitPOReturn(null, { id: ret.id } as never, ctxFor(adminId))
    await resolvers.Mutation.completePO(null, { id: poId } as never, ctxFor(adminId))
    expect(await journalDebit(poId, 'USD')).toBe(30)
  })

  it('the web query gets the returned amounts through the real schema', async () => {
    const { poId, lineIds } = await paymentPending([
      { ccy: 'USD', qty: 6, price: 1.5 },
      { ccy: 'USD', qty: 2, price: 100 },
    ])
    await makeAndApproveReturn(poId, lineIds[0]!, 6)
    const server = new ApolloServer({ typeDefs, resolvers })
    const res = await server.executeOperation(
      {
        query: `query ($id: ID!) { purchaseOrder(id: $id) {
          po_number currencyTotals { currency_code subtotal }
          returnedTotals { currency_code ordered returned net } } }`,
        variables: { id: poId },
      },
      { contextValue: { auth: { companyId, userId: adminId, role: 'system_admin', module: 'all', sessionId: 'ddcost-test' } } },
    )
    if (res.body.kind !== 'single') throw new Error('unexpected incremental response')
    const body = res.body.singleResult as {
      data?: { purchaseOrder: { returnedTotals: unknown[]; currencyTotals: { subtotal: string }[] } | null }
      errors?: readonly { message: string }[]
    }
    expect(body.errors).toBeUndefined()
    expect(body.data?.purchaseOrder?.returnedTotals).toEqual([
      { currency_code: 'USD', ordered: '209.0000', returned: '9.0000', net: '200.0000' },
    ])
    expect(parseFloat(body.data?.purchaseOrder?.currencyTotals[0]?.subtotal ?? '0')).toBe(209) // as ordered
  })

  it('PurchaseOrder.returnedTotals lists approved and credited returns per currency, and currencyTotals stays as ordered', async () => {
    const { poId, lineIds } = await paymentPending([
      { ccy: 'USD', qty: 6, price: 1.5 },
      { ccy: 'USD', qty: 2, price: 100 },
      { ccy: 'IQD', qty: 2, price: 12000 },
    ])
    expect(await resolvers.PurchaseOrder.returnedTotals({ id: poId } as never)).toEqual([])
    await makeAndApproveReturn(poId, lineIds[0]!, 6)
    // only the currency that has a return, with what was ordered, what went back and what is left (from SQL)
    expect(await resolvers.PurchaseOrder.returnedTotals({ id: poId } as never)).toEqual([
      { currency_code: 'USD', ordered: '209.0000', returned: '9.0000', net: '200.0000' },
    ])
    const ordered = (await resolvers.PurchaseOrder.currencyTotals({ id: poId } as never)) as {
      currency_code: string
      subtotal: string
    }[]
    expect(ordered.find((t) => t.currency_code === 'USD')?.subtotal).toBe('209.0000') // the order itself is unchanged
  })
})
